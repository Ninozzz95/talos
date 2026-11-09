/*
 * Contratto del segno, riga 35, forma decisa dal Desktop il 05/11/2026 alle 17:45/17:47 (OK del Mobile alle 17:48): il server dice a ogni
 * finestra QUALE sessione sta usando il computer, perché la bolla mandi le risposte a quella e mai alla chat visibile (riga 36). Sul flusso
 * del PC (`GET /api/v1/remote/events`) un evento di primo livello `{type:'talos.computer-use-sessione', sessionId, attivo}`: `true` quando il
 * compito prende lo schermo, `false` a esito, Stop, errore o fine del giro. All'apertura del flusso SEMPRE UNA riga (l'istantanea):
 * `{sessionId:null, attivo:false}` a riposo. UNA sessione corrente: con due compiti segue l'ULTIMO acceso; un `false` da una sessione che
 * non è la corrente si ignora. Id vuoto o non stringa, `attivo` non booleano: ignorati, mai un evento.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaSessioneAttiva, TIPO_SEGNALE_SESSIONE } from '../src/computer-use/sessione-attiva.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { porteDelComputerUse } from '../src/computer-use/interruttore.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const ev = (sessionId, attivo) => ({ type: 'talos.computer-use-sessione', sessionId, attivo });

test('SA-01: accesa, spenta, e un cambio solo quando cambia davvero', () => {
  assert.equal(TIPO_SEGNALE_SESSIONE, 'talos.computer-use-sessione');
  const sa = creaSessioneAttiva();
  const visti = [];
  sa.ascolta((e) => visti.push(e));
  assert.deepEqual(sa.istantanea(), ev(null, false), 'a riposo l\'istantanea dice «nessuno»');
  sa.segna('s1', true);
  sa.segna('s1', true);
  assert.deepEqual(visti, [ev('s1', true)], 'la seconda accensione non ripete');
  assert.deepEqual(sa.istantanea(), ev('s1', true));
  sa.segna('s1', false);
  sa.segna('s1', false);
  sa.segna('mai-accesa', false);
  assert.deepEqual(visti, [ev('s1', true), ev('s1', false)], 'spegnere ciò che è spento non dice niente');
  assert.deepEqual(sa.istantanea(), ev(null, false));
});

test('SA-02: id vuoto o non stringa, attivo non booleano: ignorati', () => {
  const sa = creaSessioneAttiva();
  const visti = [];
  sa.ascolta((e) => visti.push(e));
  for (const [id, attivo] of [['', true], [5, true], [null, true], [undefined, true], [{}, true], ['s1', 'true'], ['s1', 1], ['s1', null], ['s1', undefined]]) sa.segna(id, attivo);
  assert.deepEqual(visti, []);
  assert.deepEqual(sa.istantanea(), ev(null, false));
});

test('SA-03: due compiti insieme — il segnale segue l\'ULTIMO acceso; il false di chi non è il corrente si ignora', () => {
  const sa = creaSessioneAttiva();
  const visti = [];
  sa.ascolta((e) => visti.push(e));
  sa.segna('s1', true);
  sa.segna('s2', true);
  assert.deepEqual(sa.istantanea(), ev('s2', true));
  assert.deepEqual(visti, [ev('s1', true), ev('s2', true)]);
  sa.segna('s1', false);
  assert.deepEqual(visti, [ev('s1', true), ev('s2', true)], 'il false di s1 (non corrente) non dice niente');
  assert.deepEqual(sa.istantanea(), ev('s2', true), 'lo schermo resta a s2');
  sa.segna('s1', true);
  assert.deepEqual(sa.istantanea(), ev('s1', true), 'riaccesa, s1 torna corrente');
  sa.segna('s1', false);
  assert.deepEqual(sa.istantanea(), ev(null, false));
  assert.deepEqual(visti, [ev('s1', true), ev('s2', true), ev('s1', true), ev('s1', false)]);
});

test('SA-04: un ascoltatore che lancia non toglie il segnale agli altri; smetti toglie solo il suo', () => {
  const sa = creaSessioneAttiva();
  const a = []; const b = [];
  sa.ascolta(() => { throw new Error('finestra chiusa'); });
  const smettiA = sa.ascolta((e) => a.push(e));
  sa.ascolta((e) => b.push(e));
  sa.segna('s1', true);
  smettiA();
  smettiA();
  sa.segna('s1', false);
  assert.deepEqual(a, [ev('s1', true)]);
  assert.deepEqual(b, [ev('s1', true), ev('s1', false)]);
});

function aiutanteFinto({ apre = true } = {}) {
  return { async apri() { return apre ? { ok: true } : { ok: false, errore: 'no' }; }, compito() { return () => {}; },
    async chiama() { return { ok: true, dati: {}, immagine: null, errore: null }; } };
}
function sessioneFinta(extra = {}) {
  return { testoDellaPersona: 'Apri il Blocco note e scrivi ciao', chiediModello: async () => ({ testo: '{}', usage: null }),
    chiediDomanda: async (qs) => ({ status: 'answered', answers: Object.fromEntries(qs.map((q) => [q.id, 'Allow'])) }), emetti: () => {}, ...extra };
}
const chiamaOspite = (ospite, sessione) => ospite(NOME_COMPUTER_USE, { task: 'type hello in Notepad' },
  { fase: 'esegui', toolCallId: 'call-1', segnale: new AbortController().signal, livelloAccesso: 'scrittura-progetto', sessione });

test('SA-05: dall\'ospite — accesa mentre il compito gira, spenta a esito; il segnale porta l\'id della sessione', async () => {
  const sa = creaSessioneAttiva();
  const visti = [];
  sa.ascolta((e) => visti.push(e));
  let durante = null;
  const ospite = creaOspiteComputerUse({ aiutante: aiutanteFinto(), sessioneAttiva: sa,
    esegui: async () => { durante = sa.istantanea(); return { esito: 'riuscito', motivo: null, passi: 1 }; } });
  const r = await chiamaOspite(ospite, sessioneFinta({ sessionId: 's-cu' }));
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(durante, ev('s-cu', true), 'durante il compito la sessione è attiva');
  assert.deepEqual(visti, [ev('s-cu', true), ev('s-cu', false)]);
  assert.deepEqual(sa.istantanea(), ev(null, false));
});

test('SA-06: AL CONTRARIO — spenta anche se il ciclo lancia; mai accesa se l\'aiutante non si apre o la sessione non ha id', async () => {
  const sa = creaSessioneAttiva();
  const visti = [];
  sa.ascolta((e) => visti.push(e));
  const lancia = creaOspiteComputerUse({ aiutante: aiutanteFinto(), sessioneAttiva: sa, esegui: async () => { throw new Error('ciclo morto'); } });
  await assert.rejects(chiamaOspite(lancia, sessioneFinta({ sessionId: 's-err' })), /ciclo morto/);
  assert.deepEqual(visti, [ev('s-err', true), ev('s-err', false)], 'il ciclo morto spegne lo stesso');
  visti.length = 0;
  let girato = false;
  const chiuso = creaOspiteComputerUse({ aiutante: aiutanteFinto({ apre: false }), sessioneAttiva: sa, esegui: async () => { girato = true; return { esito: 'riuscito', motivo: null, passi: 1 }; } });
  const r1 = await chiamaOspite(chiuso, sessioneFinta({ sessionId: 's-chiuso' }));
  assert.equal(r1.ok, false);
  assert.equal(girato, false);
  const senzaId = creaOspiteComputerUse({ aiutante: aiutanteFinto(), sessioneAttiva: sa, esegui: async () => ({ esito: 'riuscito', motivo: null, passi: 1 }) });
  for (const sessionId of [undefined, '', 7]) {
    const r = await chiamaOspite(senzaId, sessioneFinta(sessionId === undefined ? {} : { sessionId }));
    assert.equal(r.ok, true, 'senza id il compito gira lo stesso');
  }
  assert.deepEqual(visti, [], 'mai un segnale senza una sessione vera');
  const senzaSegnale = creaOspiteComputerUse({ aiutante: aiutanteFinto(), esegui: async () => ({ esito: 'riuscito', motivo: null, passi: 1 }) });
  assert.equal((await chiamaOspite(senzaSegnale, sessioneFinta({ sessionId: 's' }))).ok, true, 'senza il segnale (CLI, telefono) nulla cambia');
});

/* legge gli eventi `data:` di uno stream SSE finché `basta(eventi)` non è vero (lo stesso lettore di notifiche-http) */
async function leggiEventi(risposta, basta) {
  const lettore = risposta.body.getReader();
  const decoder = new TextDecoder();
  let resto = '';
  const eventi = [];
  while (!basta(eventi)) {
    const { value, done } = await lettore.read();
    if (done) break;
    resto += decoder.decode(value, { stream: true });
    let i;
    while ((i = resto.indexOf('\n\n')) >= 0) {
      const blocco = resto.slice(0, i); resto = resto.slice(i + 2);
      const dati = blocco.split('\n').filter((r) => r.startsWith('data:')).map((r) => r.slice(5).trim()).join('\n');
      if (dati) eventi.push(JSON.parse(dati));
    }
  }
  await lettore.cancel();
  return eventi;
}
async function banco(t, sa) {
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessioneAttivaFn: () => sa });
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, finestra: { origin: base, 'sec-fetch-site': 'same-origin' } };
}

test('SA-07: il flusso del PC — UNA istantanea all\'apertura (l\'ultima accesa), poi i cambi dal vivo; basta questa sorgente (200, non 503)', { timeout: 10_000 }, async (t) => {
  const sa = creaSessioneAttiva();
  sa.segna('s1', true);
  sa.segna('s2', true);
  const b = await banco(t, sa);
  const risposta = await fetch(`${b.base}/api/v1/remote/events`, { headers: b.finestra });
  assert.equal(risposta.status, 200);
  const promessa = leggiEventi(risposta, (e) => e.length >= 3);
  await new Promise((r) => setTimeout(r, 50));
  sa.segna('s1', false);
  sa.segna('s3', true);
  sa.segna('s3', false);
  assert.deepEqual(await promessa, [ev('s2', true), ev('s3', true), ev('s3', false)], 'il false di s1 non corrente non passa');
});

test('SA-08: a riposo l\'istantanea dice «nessuno» — poi il compito che parte dopo', { timeout: 10_000 }, async (t) => {
  const sa = creaSessioneAttiva();
  sa.segna('vecchia', true);
  sa.segna('vecchia', false);
  const b = await banco(t, sa);
  const risposta = await fetch(`${b.base}/api/v1/remote/events`, { headers: b.finestra });
  assert.equal(risposta.status, 200);
  const promessa = leggiEventi(risposta, (e) => e.length >= 2);
  await new Promise((r) => setTimeout(r, 50));
  sa.segna('nuova', true);
  assert.deepEqual(await promessa, [ev(null, false), ev('nuova', true)]);
});

test('SA-09: senza il segnale (spento) il flusso resta com\'era: 503 se non c\'è altro', async (t) => {
  const b = await banco(t, null);
  const r = await fetch(`${b.base}/api/v1/remote/events`, { headers: b.finestra });
  assert.equal(r.status, 503);
  await r.body?.cancel();
});

test('SA-11: l\'ospite filtra da sé l\'id — vuoto, assente o non stringa non arriva mai al segnale', async () => {
  /* una spia, non il segnale vero: quello vero scarta da solo '' e 7, e coprirebbe un ospite che li passa */
  const chiamate = [];
  const spia = { segna: (id, attivo) => { chiamate.push([id, attivo]); } };
  const ospite = creaOspiteComputerUse({ aiutante: aiutanteFinto(), sessioneAttiva: spia, esegui: async () => ({ esito: 'riuscito', motivo: null, passi: 1 }) });
  for (const sessionId of [undefined, '', 7, null, { id: 's' }]) {
    const r = await chiamaOspite(ospite, sessioneFinta(sessionId === undefined ? {} : { sessionId }));
    assert.equal(r.ok, true, 'il compito gira lo stesso');
  }
  assert.deepEqual(chiamate, []);
  await chiamaOspite(ospite, sessioneFinta({ sessionId: 's-ok' }));
  assert.deepEqual(chiamate, [['s-ok', true], ['s-ok', false]], 'AL CONTRARIO: un id vero passa');
});

test('SA-12: un segnale che lancia non ferma il compito (Hermes: l\'eccezione di un aggancio non cambia la risposta)', async () => {
  let girato = 0;
  const rotto = { segna() { throw new Error('segnale rotto'); } };
  const ospite = creaOspiteComputerUse({ aiutante: aiutanteFinto(), sessioneAttiva: rotto,
    esegui: async () => { girato += 1; return { esito: 'riuscito', motivo: null, passi: 1 }; } });
  const r = await chiamaOspite(ospite, sessioneFinta({ sessionId: 's-rotto' }));
  assert.equal(r.ok, true, r.testo);
  assert.equal(girato, 1, 'il ciclo è partito');
});

test('SA-10: l\'interruttore — acceso dà al server il segnale; spento niente', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cu-sa-'));
  try {
    const acceso = porteDelComputerUse({ fileLuoghi: join(dir, 'l.json'), acceso: true, aiutante: aiutanteFinto() });
    assert.equal(typeof acceso.perHttp.sessioneAttivaFn, 'function');
    const sa = acceso.perHttp.sessioneAttivaFn();
    assert.equal(typeof sa?.ascolta, 'function');
    assert.equal(acceso.perHttp.sessioneAttivaFn(), sa, 'uno per server');
    /* lo STESSO segnale arriva all'ospite: un compito vero (ciclo vero, aiutante finto) accende e spegne quello che il server ascolta */
    const visti = [];
    sa.ascolta((e) => visti.push(e));
    let durante = null;
    const sessione = sessioneFinta({ sessionId: 's-int', chiediModello: async () => { durante ??= sa.istantanea(); throw new Error('modello assente'); } });
    await chiamaOspite(acceso.perNucleo.ospiteComputerUseFn, sessione).catch(() => {});
    assert.deepEqual(durante, ev('s-int', true), 'durante il compito il server vede la sessione');
    assert.deepEqual(visti.at(0), ev('s-int', true));
    assert.deepEqual(visti.at(-1), ev('s-int', false));
    const spento = porteDelComputerUse({ fileLuoghi: join(dir, 'l.json'), acceso: false });
    assert.equal(spento.perHttp.sessioneAttivaFn, undefined);
  } finally { await rimuoviCartellaDiProvaAttesa(dir); }
});
