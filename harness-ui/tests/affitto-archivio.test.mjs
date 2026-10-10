import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync, appendFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { creaAffittiArchivio, CARTELLA_AFFITTI } from '../src/session-lease.mjs';
import {
  attivaAffittiArchivio, disattivaAffittiArchivio, eliminaSessionePersistita, leggiRegistroAStream, registraRiga,
  registraRigaConfermata, registraRigaSync,
} from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { createServer } from 'node:http';

/*
 * ⭐ 10/10/2026 — L'AFFITTO FRA PROCESSI sull'archivio delle sessioni (owner 09/10: «Affitto come Hermes»; 10/10: «Ricaricarla da
 *   sola»). Il perché, e Hermes letto nel codice, in `src/session-lease.mjs`. Qui:
 *   · AFF-*: il modulo da solo (tempo e vita dei pid finti);
 *   · STORE-AFF-*: lo store con un altro detentore (un file d'affitto scritto come lo scriverebbe l'altro processo);
 *   · DUE-PROCESSI-*: due processi Node VERI sullo stesso archivio (`fixtures/affitto-processo-figlio.mjs`);
 *   · REG-AFF-*: il registro che ricarica una sessione continuata altrove, con un ascoltatore collegato.
 */
const FIGLIO = fileURLToPath(new URL('./fixtures/affitto-processo-figlio.mjs', import.meta.url));
const cartellaTemp = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-affitto-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const giornale = (store, id) => join(store, `${id}.jsonl`);
const fileAffitto = (store, id) => join(store, CARTELLA_AFFITTI, `${id}.json`);
const ALTRA = '99999999-9999-4999-8999-999999999999';
/* il file d'affitto come lo scrive un ALTRO processo vivo (questo pid, che è vivo, ma un'altra istanza) */
function affittoAltrui(store, id, { pid = process.pid, etichetta = 'the other TALOS', mtime = null } = {}) {
  mkdirSync(join(store, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(fileAffitto(store, id), JSON.stringify({ istanza: ALTRA, pid, host: hostname(), avviatoIl: '2026-10-10T08:00:00.000Z', presoIl: '2026-10-10T08:01:00.000Z', etichetta }));
  if (mtime) utimesSync(fileAffitto(store, id), mtime, mtime);
}

// ─────────────────────────────── il modulo da solo ───────────────────────────────

function affittiDiProva(store, extra = {}) {
  let ora = 1_000_000;
  const intervalli = [];
  const a = creaAffittiArchivio({
    cartellaStore: store, percorsoGiornale: (id) => giornale(store, id), etichetta: 'test', adesso: () => ora,
    impostaIntervallo: (fn, ms) => { const h = { fn, ms, unref() { this.unrefd = true; }, cancellato: false }; intervalli.push(h); return h; },
    cancellaIntervallo: (h) => { h.cancellato = true; },
    ...extra,
  });
  return { a, avanza: (ms) => { ora += ms; }, intervalli, adesso: () => ora };
}

test('AFF-01: the first process takes the lease; a second live one is refused and told who holds it; after release it can take it', (t) => {
  const store = cartellaTemp(t);
  const uno = affittiDiProva(store, { istanza: 'uno' }).a;
  const due = affittiDiProva(store, { istanza: 'due', etichetta: 'the second' }).a;
  assert.deepEqual(uno.prendi('s1'), { preso: true, nuovo: true });
  assert.deepEqual(uno.prendi('s1'), { preso: true, nuovo: false }, 'taking it again is a no-op');
  const rifiuto = due.prendi('s1');
  assert.equal(rifiuto.preso, false);
  assert.equal(rifiuto.detentore.istanza, 'uno');
  assert.equal(rifiuto.detentore.pid, process.pid);
  assert.equal(rifiuto.detentore.etichetta, 'test');
  assert.equal(due.detentoreAltrui('s1').istanza, 'uno');
  assert.equal(uno.detentoreAltrui('s1'), null, 'our own lease is not "someone else\'s"');
  assert.equal(uno.rilascia('s1'), true);
  assert.equal(existsSync(fileAffitto(store, 's1')), false, 'release removes the file');
  assert.deepEqual(due.prendi('s1'), { preso: true, nuovo: true });
});

test('AFF-02: a lease whose pid is dead on this host is taken over AT ONCE, without waiting for it to expire (CLI: a killed TALOS is not locked out)', (t) => {
  const store = cartellaTemp(t);
  affittoAltrui(store, 's1', { pid: 424242 });
  const { a } = affittiDiProva(store, { processoVivo: (pid) => pid !== 424242 });
  assert.deepEqual(a.prendi('s1'), { preso: true, nuovo: true });
  assert.equal(JSON.parse(readFileSync(fileAffitto(store, 's1'), 'utf8')).istanza, a.istanza);
  assert.deepEqual(readdirSync(join(store, CARTELLA_AFFITTI)), ['s1.json'], 'the stale file renamed away is gone too');
});

test('AFF-03: a live pid holds the lease while its mtime is fresh; past the expiry it is taken (a reused pid does not refresh it)', (t) => {
  const store = cartellaTemp(t);
  const ora = Date.now();
  affittoAltrui(store, 's1');
  const fresco = affittiDiProva(store, { adesso: () => ora, scadenzaMs: 30_000 }).a;
  assert.equal(fresco.prendi('s1').preso, false);
  const vecchio = new Date(ora - 31_000);
  utimesSync(fileAffitto(store, 's1'), vecchio, vecchio);
  assert.equal(fresco.prendi('s1').preso, true);
});

test('AFF-04: the heartbeat refreshes held leases, keeps them while in use, and releases them after the idle time; the timer is unref and stops when nothing is held', (t) => {
  const store = cartellaTemp(t);
  let inUso = true;
  const { a, avanza, intervalli, adesso } = affittiDiProva(store, { battitoMs: 5_000, rilascioDopoMs: 30_000 });
  a.aggiungiInUso(() => inUso);
  a.prendi('s1');
  assert.equal(intervalli.length, 1);
  assert.equal(intervalli[0].unrefd, true, 'talos -p must always exit');
  avanza(60_000);
  a.battito();
  assert.equal(a.tiene('s1'), true, 'in use: not released even after the idle time');
  assert.equal(Math.round(statSync(fileAffitto(store, 's1')).mtimeMs / 1000), Math.round(adesso() / 1000), 'mtime refreshed to now');
  inUso = false;
  avanza(10_000);
  a.tocca('s1');
  avanza(29_000);
  a.battito();
  assert.equal(a.tiene('s1'), true, 'a write 29 s ago keeps it');
  avanza(1_000);
  a.battito();
  assert.equal(a.tiene('s1'), false);
  assert.equal(existsSync(fileAffitto(store, 's1')), false);
  assert.equal(intervalli[0].cancellato, true, 'no lease held: the timer stops');
});

test('AFF-05: a journal that grew while we did not hold the lease must be reloaded; while we hold it, our own writes are not "elsewhere"', (t) => {
  const store = cartellaTemp(t);
  const { a } = affittiDiProva(store);
  writeFileSync(giornale(store, 's1'), '{"a":1}\n');
  a.ricordaDimensione('s1', 8);
  assert.equal(a.cambiatoAltrove('s1'), false);
  appendFileSync(giornale(store, 's1'), '{"b":2}\n'); // l'altro processo
  assert.equal(a.cambiatoAltrove('s1'), true, 'seen without taking the lease');
  a.prendi('s1');
  assert.equal(a.daRicaricare('s1'), true);
  a.ricordaDimensione('s1', 16);
  assert.equal(a.daRicaricare('s1'), false, 'a full read puts it back in step');
  appendFileSync(giornale(store, 's1'), '{"c":3}\n'); // le NOSTRE scritture, con l'affitto in mano
  assert.equal(a.cambiatoAltrove('s1'), false);
  a.rilascia('s1');
  assert.equal(a.dimensioneNota('s1'), 24, 'release remembers the size as it is');
});

test('AFF-06: taking over a stale lease does not steal one that another process refreshed in the meantime (rename, check, put back)', (t) => {
  const store = cartellaTemp(t);
  affittoAltrui(store, 's1', { pid: 424242 });
  let primaVolta = true;
  // mentre questo processo giudica «morto» il vecchio detentore, un terzo processo prende l'affitto (file nuovo, pid vivo)
  const processoVivo = (pid) => {
    if (pid === 424242 && primaVolta) {
      primaVolta = false;
      writeFileSync(fileAffitto(store, 's1'), JSON.stringify({ istanza: 'terzo', pid: process.pid, host: hostname(), presoIl: 'ora', etichetta: 'third' }));
      return false;
    }
    return pid !== 424242;
  };
  const { a } = affittiDiProva(store, { processoVivo, adesso: () => Date.now() });
  const esito = a.prendi('s1');
  assert.equal(esito.preso, false, 'the third process keeps it');
  assert.equal(JSON.parse(readFileSync(fileAffitto(store, 's1'), 'utf8')).istanza, 'terzo', 'its file is back in place');
  assert.deepEqual(readdirSync(join(store, CARTELLA_AFFITTI)), ['s1.json']);
});

// ─────────────────────────────── lo store con un altro detentore ───────────────────────────────

function storeConAffitto(t) {
  const store = cartellaTemp(t);
  attivaAffittiArchivio(store, { etichetta: 'this test', battitoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  return store;
}

test('STORE-AFF-01: every writer refuses a session leased by another live process with SESSION_LEASED, naming it; the journal is untouched', async (t) => {
  const store = storeConAffitto(t);
  writeFileSync(giornale(store, 's1'), '{"tipo":"intestazione"}\n');
  affittoAltrui(store, 's1', { etichetta: 'the TALOS desktop app' });
  const prima = readFileSync(giornale(store, 's1'));
  const atteso = (errore) => {
    assert.equal(errore.code, 'SESSION_LEASED');
    assert.match(errore.message, /open in another TALOS process \(the TALOS desktop app, pid \d+, since /u);
    assert.deepEqual(errore.params, { sessionId: 's1', pid: process.pid, etichetta: 'the TALOS desktop app', presoIl: '2026-10-10T08:01:00.000Z' });
    return true;
  };
  await assert.rejects(registraRiga({ cartellaStore: store, sessionId: 's1', record: { a: 1 } }), atteso);
  assert.throws(() => registraRigaSync({ cartellaStore: store, sessionId: 's1', record: { a: 1 } }), atteso);
  await assert.rejects(registraRigaConfermata({ cartellaStore: store, sessionId: 's1', record: { a: 1 } }), atteso);
  await assert.rejects(eliminaSessionePersistita({ cartellaStore: store, sessionId: 's1' }), atteso);
  assert.deepEqual(readFileSync(giornale(store, 's1')), prima);
});

test('STORE-AFF-02: a half-written tail while another live process holds the lease is ITS write in progress — not repaired, no backup, path not poisoned', async (t) => {
  const store = storeConAffitto(t);
  writeFileSync(giornale(store, 's1'), '{"tipo":"intestazione"}\n{"tipo":"nota","testo":"a me');
  affittoAltrui(store, 's1');
  const letti = [];
  const esito = await leggiRegistroAStream({ cartellaStore: store, sessionId: 's1', perRiga: (r) => { letti.push(r); } });
  assert.equal(esito.codaAltrui, true);
  assert.equal(esito.riparazione, null);
  assert.equal(letti.length, 1, 'only whole records');
  assert.equal(readFileSync(giornale(store, 's1'), 'utf8'), '{"tipo":"intestazione"}\n{"tipo":"nota","testo":"a me');
  assert.deepEqual(readdirSync(store).filter((n) => n.includes('.bak-')), []);
  // l'altro finisce la sua riga e rilascia: ora si scrive, senza un veleno lasciato dalla lettura di prima
  appendFileSync(giornale(store, 's1'), 'tà"}\n');
  unlinkSync(fileAffitto(store, 's1'));
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { tipo: 'nota', testo: 'dopo' } });
  assert.match(readFileSync(giornale(store, 's1'), 'utf8'), /"dopo"/u);
});

test('STORE-AFF-03: with the lease free, a broken tail is repaired as before (and the repair takes the lease)', async (t) => {
  const store = storeConAffitto(t);
  writeFileSync(giornale(store, 's1'), '{"tipo":"intestazione"}\n{"tipo":"nota","te');
  const esito = await leggiRegistroAStream({ cartellaStore: store, sessionId: 's1', perRiga: () => {} });
  assert.equal(esito.riparazione?.riparato, true);
  assert.equal(readFileSync(giornale(store, 's1'), 'utf8'), '{"tipo":"intestazione"}\n');
  assert.equal(existsSync(fileAffitto(store, 's1')), true);
});

test('STORE-AFF-04: a write into a journal that another process wrote since it was read here is refused with SESSION_CHANGED_ELSEWHERE', async (t) => {
  const store = storeConAffitto(t);
  const affitti = attivaAffittiArchivio(store);
  writeFileSync(giornale(store, 's1'), '{"tipo":"intestazione"}\n');
  affitti.ricordaDimensione('s1', statSync(giornale(store, 's1')).size); // come dopo il ripristino
  appendFileSync(giornale(store, 's1'), '{"tipo":"nota","da":"altrove"}\n'); // l'altro processo, affitto già rilasciato
  await assert.rejects(registraRiga({ cartellaStore: store, sessionId: 's1', record: { tipo: 'nota' } }), { code: 'SESSION_CHANGED_ELSEWHERE' });
  assert.equal(readFileSync(giornale(store, 's1'), 'utf8'), '{"tipo":"intestazione"}\n{"tipo":"nota","da":"altrove"}\n', 'nothing written');
});

test('STORE-AFF-05: without the lease switched on nothing changes (the temporary stores of the other tests)', async (t) => {
  const store = cartellaTemp(t);
  writeFileSync(giornale(store, 's1'), '{"tipo":"intestazione"}\n');
  affittoAltrui(store, 's1');
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { tipo: 'nota' } });
  assert.equal(readFileSync(giornale(store, 's1'), 'utf8').split('\n').length, 3);
});

// ─────────────────────────────── due processi veri ───────────────────────────────

function avviaFiglio(args) {
  const figlio = spawn(process.execPath, [FIGLIO, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let uscita = '';
  figlio.stdout.setEncoding('utf8');
  figlio.stdout.on('data', (d) => { uscita += d; });
  const aspetta = (re, ms = 15_000) => new Promise((ok, ko) => {
    const scade = setTimeout(() => ko(new Error(`child did not print ${re}: ${uscita}`)), ms);
    const guarda = () => { const m = re.exec(uscita); if (m) { clearTimeout(scade); ok(m); } else setTimeout(guarda, 10); };
    guarda();
  });
  const fine = new Promise((ok) => figlio.on('exit', (code) => ok(code)));
  return { figlio, aspetta, fine };
}

test('DUE-PROCESSI-01: while another REAL process appends long lines, this one reads 40 times and never repairs; its writes are refused naming the child; killed, the child frees it at once', async (t) => {
  const store = storeConAffitto(t);
  const { figlio, aspetta, fine } = avviaFiglio([store, 's1', 'tieni']);
  t.after(() => { try { figlio.kill(); } catch { /* già uscito */ } });
  const [, pidFiglio] = await aspetta(/PRONTO (\d+)/u);
  let codeAltrui = 0;
  for (let i = 0; i < 40; i += 1) {
    const esito = await leggiRegistroAStream({ cartellaStore: store, sessionId: 's1', perRiga: () => {} });
    if (esito.codaAltrui) codeAltrui += 1;
    assert.equal(esito.riparazione, null, `read ${i}: never a repair under the child's lease`);
  }
  assert.deepEqual(readdirSync(store).filter((n) => n.includes('.bak-') || n.includes('.riparazione')), []);
  await assert.rejects(registraRiga({ cartellaStore: store, sessionId: 's1', record: { tipo: 'mia' } }), (errore) => {
    assert.equal(errore.code, 'SESSION_LEASED');
    assert.equal(errore.params.pid, Number(pidFiglio));
    assert.equal(errore.params.etichetta, 'the test child');
    return true;
  });
  figlio.kill(); // TerminateProcess su Windows: nessun gestore d'uscita gira, il file d'affitto resta
  await fine;
  assert.equal(existsSync(fileAffitto(store, 's1')), true, 'a killed process leaves its lease file behind');
  const prima = Date.now();
  // la coda può restare a metà (ucciso durante un append): la lettura, ora con l'affitto, la ripara; poi si scrive
  await leggiRegistroAStream({ cartellaStore: store, sessionId: 's1', perRiga: () => {} });
  await registraRiga({ cartellaStore: store, sessionId: 's1', record: { tipo: 'mia' } });
  assert.ok(Date.now() - prima < 5_000, 'taken over without waiting for the 30 s expiry');
  assert.match(readFileSync(giornale(store, 's1'), 'utf8'), /"tipo":"mia"/u);
  t.diagnostic(`reads that met the child's half-written tail: ${codeAltrui}/40`);
});

test('DUE-PROCESSI-02: a REAL other process caught halfway through a line — with the lease the reader leaves it alone; WITHOUT the lease (the code before) the reader cuts the line away', async (t) => {
  const store = storeConAffitto(t);
  const { figlio, aspetta, fine } = avviaFiglio([store, 's1', 'a-meta']);
  t.after(() => { try { figlio.kill(); } catch { /* già uscito */ } });
  await aspetta(/PRONTO (\d+)/u);
  const prima = readFileSync(giornale(store, 's1'), 'utf8');
  assert.match(prima, /"testo":"a me$/u, 'the child left half a line');
  const esito = await leggiRegistroAStream({ cartellaStore: store, sessionId: 's1', perRiga: () => {} });
  assert.equal(esito.codaAltrui, true);
  assert.equal(readFileSync(giornale(store, 's1'), 'utf8'), prima, 'the half line is still there for the child to finish');
  // il verso contrario: lo stesso stato letto da un processo SENZA affitto (com'era prima di oggi) ripara e taglia
  disattivaAffittiArchivio(store);
  const senza = await leggiRegistroAStream({ cartellaStore: store, sessionId: 's1', perRiga: () => {} });
  assert.equal(senza.riparazione?.riparato, true, 'without the lease the reader «repairs» the child’s write in progress');
  assert.doesNotMatch(readFileSync(giornale(store, 's1'), 'utf8'), /a me/u);
  figlio.kill();
  await fine;
});

// ─────────────────────────────── il registro ricarica ───────────────────────────────

test('REG-AFF-01: a session continued by another process is reloaded before writing; the open listener receives only the new events', async (t) => {
  const store = cartellaTemp(t);
  t.after(() => disattivaAffittiArchivio(store));
  const sessionId = '0f0f0f0f-0000-4000-8000-000000000001';
  let sequenza = 0;
  const evento = (type, extra = {}) => ({ type, _sequenza: ++sequenza, ...extra });
  const intestazione = { tipo: 'intestazione', schema: 1, sessionId, taskId: 'libero:aff', cartella: store, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
    comandoProva: null, forkDa: null, avviataAlle: '2026-10-10T08:00:00.000Z', modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium',
    mobile: false, permessi: 'Read only', permessiPerAttrezzo: null, padreId: null, profonditaDelega: 0, provider: 'cloud', runtimeId: null,
    modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true };
  const giro = (n) => [
    evento('RunStarted', { threadId: sessionId, runId: `r${n}` }),
    evento('TextMessageContent', { messageId: `m${n}`, delta: `risposta ${n}` }),
    evento('RunFinished', { threadId: sessionId, runId: `r${n}`, result: { detto: `risposta ${n}` } }),
  ];
  writeFileSync(giornale(store, sessionId), [intestazione, ...giro(1)].map((r) => `${JSON.stringify(r)}\n`).join(''));
  const registro = createSessionRegistry({ cartellaStore: store, affittoFraProcessi: { etichetta: 'this test' },
    avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  await registro.ripristina();
  const ripristinatePrima = registro.statoPersistenza().ultimaLettura.ripristinate;
  const visti = [];
  const stacca = registro.iscriviti(sessionId, (e) => visti.push(e._sequenza ?? null));
  const primaDellAltro = visti.length;

  // l'ALTRO processo (vero) continua la conversazione e se ne va
  const { aspetta, fine } = avviaFiglio([store, sessionId, 'scrivi-ed-esci', JSON.stringify(giro(2))]);
  await aspetta(/FATTO/u);
  await fine;

  assert.deepEqual(await registro.allineaSessione(sessionId, { scrivere: false }), { stato: 'libera', ricaricata: true });
  const nuovi = visti.slice(primaDellAltro);
  assert.deepEqual(nuovi, [4, 5, 6], 'the listener gets exactly the three events written elsewhere, once');
  assert.equal(registro.esporta(sessionId).eventi.filter((e) => e.type === 'RunStarted').length, 2, 'the reloaded session has both turns');
  // di nuovo in pari: niente da ricaricare, e lo scrittore ora prende l'affitto
  assert.deepEqual(await registro.allineaSessione(sessionId, { scrivere: true }), { stato: 'nostra', ricaricata: false });
  attivaAffittiArchivio(store).rilascia(sessionId); // il nostro affitto se ne va (come fa il battito dopo 30 s fermi): l'altro può tornare

  // l'ascoltatore ora vive sulla voce NUOVA: una seconda ricarica gli porta il terzo giro
  const altro = avviaFiglio([store, sessionId, 'scrivi-ed-esci', JSON.stringify(giro(3))]);
  await altro.aspetta(/FATTO/u);
  await altro.fine;
  assert.equal((await registro.allineaSessione(sessionId, { scrivere: false })).ricaricata, true);
  assert.deepEqual(visti.slice(primaDellAltro), [4, 5, 6, 7, 8, 9], 'still subscribed after a reload');

  // e staccarlo funziona anche dopo le ricariche: il quarto giro non gli arriva
  stacca();
  const ultimo = avviaFiglio([store, sessionId, 'scrivi-ed-esci', JSON.stringify(giro(4))]);
  await ultimo.aspetta(/FATTO/u);
  await ultimo.fine;
  assert.equal((await registro.allineaSessione(sessionId, { scrivere: false })).ricaricata, true);
  assert.equal(visti.length, primaDellAltro + 6, 'unsubscribed: nothing more');
  assert.equal(registro.esporta(sessionId).eventi.filter((e) => e.type === 'RunStarted').length, 4);
  // review Y3: tre ricariche non sono tre sessioni ripristinate in più
  assert.equal(registro.statoPersistenza().ultimaLettura.ripristinate, ripristinatePrima);
});

test('REG-AFF-02: a session held by another live process answers «elsewhere» to a writer, with who holds it; a reader still sees it', async (t) => {
  const store = cartellaTemp(t);
  t.after(() => disattivaAffittiArchivio(store));
  const sessionId = '0f0f0f0f-0000-4000-8000-000000000002';
  writeFileSync(giornale(store, sessionId), `${JSON.stringify({ tipo: 'intestazione', schema: 1, sessionId, taskId: 'libero:aff', cartella: store,
    task: { consegna: 'ciao', consegnaCorta: 'ciao' }, avviataAlle: '2026-10-10T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true })}\n`);
  const registro = createSessionRegistry({ cartellaStore: store, affittoFraProcessi: { etichetta: 'this test' },
    avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  await registro.ripristina();
  affittoAltrui(store, sessionId, { etichetta: 'the TALOS desktop app' });
  const scrittore = await registro.allineaSessione(sessionId, { scrivere: true });
  assert.equal(scrittore.stato, 'altrove');
  assert.deepEqual(scrittore.detentore, { pid: process.pid, etichetta: 'the TALOS desktop app', presoIl: '2026-10-10T08:01:00.000Z' });
  assert.match(scrittore.messaggio, /open in another TALOS process \(the TALOS desktop app, pid /u);
  const lettore = await registro.allineaSessione(sessionId, { scrivere: false });
  assert.equal(lettore.stato, 'altrove');
  assert.equal(lettore.ricaricata, false, 'nothing changed: nothing to reload');
  assert.equal(registro.esiste(sessionId), true);
});

test('HTTP-AFF-01: at the door, a write on a session held by another live process is 409 SESSION_LEASED with who holds it; opening it and forking it still work', async (t) => {
  const store = cartellaTemp(t);
  t.after(() => disattivaAffittiArchivio(store));
  const sessionId = '0f0f0f0f-0000-4000-8000-000000000003';
  writeFileSync(giornale(store, sessionId), `${JSON.stringify({ tipo: 'intestazione', schema: 1, sessionId, taskId: 'libero:aff', cartella: store,
    task: { consegna: 'ciao', consegnaCorta: 'ciao' }, avviataAlle: '2026-10-10T08:00:00.000Z', modello: 'm', permessi: 'Read only', cartellaGiaScelta: true })}
`);
  const registro = createSessionRegistry({ cartellaStore: store, affittoFraProcessi: { etichetta: 'this test' },
    avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  await registro.ripristina();
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => server.close(ok)));
  const base = `http://127.0.0.1:${server.address().port}`;
  affittoAltrui(store, sessionId, { etichetta: 'the TALOS desktop app' });
  const prima = readFileSync(giornale(store, sessionId));

  const resume = await fetch(`${base}/api/v1/sessions/${sessionId}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaggio: 'ancora' }) });
  assert.equal(resume.status, 409);
  const corpo = await resume.json();
  assert.equal(corpo.error.code, 'SESSION_LEASED');
  assert.deepEqual(corpo.error.params, { sessionId, pid: process.pid, etichetta: 'the TALOS desktop app', presoIl: '2026-10-10T08:01:00.000Z' });
  const rinomina = await fetch(`${base}/api/v1/sessions/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'x' }) });
  assert.equal(rinomina.status, 409, 'every writing verb, not only resume');
  assert.deepEqual(readFileSync(giornale(store, sessionId)), prima, 'nothing written');

  const lettura = await fetch(`${base}/api/v1/sessions`);
  assert.equal(lettura.status, 200, 'reading the list is never refused');
  const fork = await fetch(`${base}/api/v1/sessions/${sessionId}/fork`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const corpoFork = await fork.json();
  assert.notEqual(corpoFork.error?.code, 'SESSION_LEASED', `a fork only reads the origin: ${JSON.stringify(corpoFork)}`);
});

// ─────────────────────────────── la review della sessione desktop (Y1, Y2) ───────────────────────────────

/* il modello finto di `c3-pausa-figlia-registro.test.mjs`: un giro che resta vivo finché il test non lo conclude */
function modelloFinto() {
  const avvii = [];
  return {
    avvii,
    async avviaSessioneFn(input) {
      const indice = avvii.length + 1;
      let chiudi;
      const attesa = new Promise((risolvi) => { chiudi = risolvi; });
      const avvio = { input };
      avvio.concludi = (detto = 'Fatto.') => {
        input.onEvento({ type: 'RunFinished', threadId: `t${indice}`, runId: `r${indice}`, outcome: { type: 'success' }, result: { detto } });
        chiudi({ ok: true, esito: { detto, comeFinita: 'concluso' } });
      };
      avvii.push(avvio);
      input.onEvento({ type: 'RunStarted', threadId: `t${indice}`, runId: `r${indice}` });
      return attesa;
    },
  };
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
function bancoVivo(t, extra = {}) {
  const store = cartellaTemp(t);
  const lavoro = cartellaTemp(t);
  const affitti = attivaAffittiArchivio(store, { etichetta: 'this test', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const finto = modelloFinto();
  const registro = createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'this test' }, avviaSessioneFn: finto.avviaSessioneFn, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta', ...extra,
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'lavora', permessi: 'Full access' });
  assert.ok(sessionId);
  return { store, affitti, finto, registro, sessionId, madre: finto.avvii[0] };
}

test('REG-AFF-03 (review Y2): a session with a LIVE run here is never reloaded, even if its journal grew; once idle it is', async (t) => {
  const b = bancoVivo(t);
  await pausa(50);
  b.affitti.rilascia(b.sessionId); // il caso che la guardia deve reggere: l'affitto non c'è, il giornale cresce altrove
  appendFileSync(giornale(b.store, b.sessionId), `${JSON.stringify({ tipo: 'nota-altrove', n: 1 })}\n`);
  assert.equal(b.affitti.cambiatoAltrove(b.sessionId), true, 'premise: changed elsewhere');
  const tipi = [];
  b.registro.iscriviti(b.sessionId, (e) => tipi.push(e.type));
  assert.deepEqual(await b.registro.allineaSessione(b.sessionId, { scrivere: false }), { stato: 'libera', ricaricata: false });
  // il giro vivo finisce sulla STESSA voce: la sua fine arriva a chi ascolta e resta nella sessione
  b.madre.concludi('Finito qui.');
  await pausa(100);
  assert.ok(tipi.includes('RunFinished'), 'the live run ends on the entry that is still in the map');
  assert.equal(b.registro.esporta(b.sessionId).eventi.filter((e) => e.type === 'RunFinished').length, 1);
  // ferma, e cresciuta di nuovo altrove: ora si ricarica
  b.affitti.rilascia(b.sessionId);
  appendFileSync(giornale(b.store, b.sessionId), `${JSON.stringify({ tipo: 'nota-altrove', n: 2 })}\n`);
  assert.equal((await b.registro.allineaSessione(b.sessionId, { scrivere: false })).ricaricata, true);
});

test('REG-AFF-04 (review Y1a): a parent whose turn ended keeps its lease while a child is alive (the idle release itself is AFF-04)', async (t) => {
  const b = bancoVivo(t);
  const ricevuta = await b.madre.input.onDelega('leggi i file e riassumili', undefined, { modalita: 'lettura' });
  assert.equal(ricevuta.esito, 'avviato');
  b.madre.concludi('Ho delegato.');
  await pausa(100);
  assert.equal(b.registro.elencaFigli(b.sessionId).figli.length, 1, 'premise: one child, alive');
  assert.equal(b.affitti.tiene(b.sessionId), true, 'premise: the parent wrote, so it holds the lease');
  b.affitti.battito(); // rilascioDopoMs 0: senza «in uso» lo lascerebbe subito
  assert.equal(b.affitti.tiene(b.sessionId), true, 'a live child keeps the parent in use');
  // la figlia (sessione sua) invece è ferma? no: è viva, ed è in uso anche lei
  assert.equal(b.affitti.tiene(ricevuta.childId), true);
});

test('REG-AFF-05 (review Y1b): a child result refused because another process holds the parent says it WAITS (not «disk»), and lands when the parent is free', async (t) => {
  const b = bancoVivo(t, { ritentaCodaAffittataMs: 60 });
  const ricevuta = await b.madre.input.onDelega('leggi i file e riassumili', undefined, { modalita: 'lettura' });
  b.madre.concludi('Ho delegato.');
  await pausa(100);
  const eventi = [];
  b.registro.iscriviti(b.sessionId, (e) => eventi.push(e));
  // la persona riprende la madre dall'altra finestra: l'affitto è suo
  b.affitti.rilascia(b.sessionId);
  affittoAltrui(b.store, b.sessionId, { etichetta: 'the TALOS desktop app' });
  b.finto.avvii[1].concludi('Ecco il riassunto dei file.');
  await pausa(150);
  const errori = eventi.filter((e) => e.type === 'RunError');
  assert.ok(errori.some((e) => e.code === 'SESSION_LEASED' && /is waiting: this chat is open in another TALOS window/u.test(e.message)), JSON.stringify(errori));
  assert.ok(!errori.some((e) => /not saved to disk/u.test(e.message)), 'never «not saved to disk»: the disk is fine');
  // l'id della figlia c'è già negli eventi della delega: conta solo la riga `coda` che porta il risultato
  const righeCoda = () => readFileSync(giornale(b.store, b.sessionId), 'utf8').split('\n').filter((r) => r.includes('"tipo":"coda"') && r.includes(ricevuta.childId));
  assert.deepEqual(righeCoda(), [], 'not written under the other lease');
  // l'altra finestra SCRIVE nella madre e poi la lascia: il ritento la ricarica, portandosi dietro il risultato in attesa, e lo scrive
  appendFileSync(giornale(b.store, b.sessionId), `${JSON.stringify({ tipo: 'nota-altrove', da: 'app' })}
`);
  unlinkSync(fileAffitto(b.store, b.sessionId));
  await pausa(400);
  assert.ok(righeCoda().length >= 1, 'the result is in the parent\'s queue on disk');
});
