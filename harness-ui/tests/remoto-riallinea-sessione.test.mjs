import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { CARTELLA_AFFITTI } from '../src/session-lease.mjs';
import { attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * S3 (Tester 06/11/2026 08:47, `tester/rapporti/REPERTO-REMOTO-SESSIONE-NON-RIALLINEATA-2026-11-06.md`): dal telefono una chat continuata
 *   altrove (la CLI, un'altra finestra) si apriva con la storia vecchia. L'apertura HTTP passa da `allineaSessione` (il cancello di
 *   http-app); l'iscrizione remota `session.events` no, e serviva la copia in memoria. Qui:
 *   · S3-01/02: il giornale cresce sul disco dopo il caricamento ⇒ il telefono vede la coda nuova (rosso prima della cura);
 *   · S3-03/04: la SOVRAPPOSIZIONE (il telefono scrive in una chat così): rifiuto del nucleo se un altro processo la tiene, mai una
 *     fusione; se è libera prima si rilegge, poi un'unica numerazione crescente, senza doppioni;
 *   · S3-05: un giro vivo QUI non si ricarica mai (condizione 3 della CLI);
 *   · S3-06/07: la funzione condivisa tollera il metodo assente o che lancia, e non tocca le sessioni che il registro non ha
 *     (condizione 2 della CLI: il Proxy federato inoltra `allineaSessione` al registro locale); `iscriviConRigiocata` resta sincrona.
 * Registro vero, affitto vero, cancello HTTP vero (`creaChiamataInterna`), modello finto. Nessun server su dati veri.
 */
const ALTRA = '99999999-9999-4999-8999-999999999999';
const cartellaTemp = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-s3-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const giornale = (store, id) => join(store, `${id}.jsonl`);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
/* Si aspetta un FATTO, mai un tempo (regola 6 della velocità; giudice v1658, 12/11): un timer dice «non prima di», non «entro», e su una
   macchina carica 50 ms non bastano sempre al giro finto per partire. Tetto 10 s (largo: conta solo quando il fatto NON arriva): scaduto, la prova cade sull'asserzione
   che segue, col suo messaggio. */
const finche = async (vero, tettoMs = 10_000) => { const fine = Date.now() + tettoMs; while (!vero() && Date.now() < fine) await pausa(10); };
/* il giro di qui è FINITO (lo dice il registro, come nel battito: `lavora` falso) e ogni sua riga è sul disco: solo allora la prova
   rilascia l'affitto, guarda il giornale o fa scrivere «un altro processo» in coda senza incrociare le nostre righe */
const fermoESulDisco = async (registro, store, sessionId) => {
  await finche(() => registro.statoPerIlBattito(sessionId)?.lavora === false);
  await attendiScritture({ cartellaStore: store });
};
/* NIENTE deve succedere: non si aspetta un tempo sperando che basti, si lascia girare il ciclo degli eventi (chi doveva partire è partito)
   e si svuota la coda delle scritture (chi doveva scrivere ha scritto); poi si guarda */
const quieto = async (store) => { for (let giro = 0; giro < 3; giro += 1) { await new Promise((r) => setImmediate(r)); await attendiScritture({ cartellaStore: store }); } };

/* il file d'affitto come lo scrive un ALTRO processo vivo (questo pid, ma un'altra istanza): la stessa forma di `affitto-archivio.test.mjs` */
function affittoAltrui(store, id, etichetta = 'the TALOS CLI') {
  mkdirSync(join(store, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(join(store, CARTELLA_AFFITTI, `${id}.json`), JSON.stringify({ istanza: ALTRA, pid: process.pid, host: hostname(),
    avviatoIl: '2026-11-08T00:00:00.000Z', presoIl: '2026-11-08T00:01:00.000Z', etichetta }));
}
const righe = (store, id) => readFileSync(giornale(store, id), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));
const sequenzeSulDisco = (store, id) => righe(store, id).map((r) => r._sequenza).filter((n) => typeof n === 'number');
/* un giro scritto da un ALTRO processo in coda al giornale, con la numerazione che continua (come lo scrive la CLI) */
function giroAltrove(store, id, detto) {
  let n = Math.max(0, ...sequenzeSulDisco(store, id));
  const runId = `altrove-${n}`;
  const messageId = `m-altrove-${n}`;
  const ev = (type, extra) => ({ type, _sequenza: ++n, ...extra });
  const giro = [ev('RunStarted', { threadId: id, runId }), ev('TextMessageStart', { messageId, role: 'assistant' }),
    ev('TextMessageContent', { messageId, delta: detto }), ev('TextMessageEnd', { messageId }),
    ev('RunFinished', { threadId: id, runId, result: { detto } })];
  appendFileSync(giornale(store, id), giro.map((r) => `${JSON.stringify(r)}\n`).join(''));
  return n;
}

/* il modello finto di `affitto-archivio.test.mjs`: un giro resta vivo finché il test non lo conclude */
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

/* il PC vero dietro il telefono: registro con l'affitto, il cancello HTTP, le operazioni remote come le monta `creaRemoto` */
async function banco(t, { conclusa = true } = {}) {
  const store = cartellaTemp(t);
  const lavoro = cartellaTemp(t);
  const affitti = attivaAffittiArchivio(store, { etichetta: 'this test', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const finto = modelloFinto();
  const registro = createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'this test' }, avviaSessioneFn: finto.avviaSessioneFn, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta',
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'lavora', permessi: 'Full access' });
  /* il giro finto è partito; se va concluso, è finito per il registro; in tutti e due i casi le sue righe sono sul disco */
  await finche(() => finto.avvii.length === 1);
  assert.equal(finto.avvii.length, 1, 'bench: the fake model turn started');
  if (conclusa) { finto.avvii[0].concludi('Primo giro qui.'); await fermoESulDisco(registro, store, sessionId); }
  else await attendiScritture({ cartellaStore: store });
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry: registro, iscriviConRigiocata, ogni: () => null, smetti: () => {} });
  return { store, affitti, finto, registro, sessionId, chiama, operazioni };
}
function telefono() {
  const ricevuti = [];
  const contesto = {
    dispositivo: { id: 'pad-s3', nome: 'Pad' }, iscrizioni: new Map(),
    iscrivi(sub, chiudi) { contesto.iscrizioni.set(sub, chiudi); return (data) => { ricevuti.push(data); return Promise.resolve(); }; },
  };
  return { contesto, ricevuti };
}
const apri = (b, tel, after = 0, sub = 's') => b.operazioni.esegui('session.events', { sessionId: b.sessionId, sub, after }, tel.contesto);
const testi = (eventi) => eventi.filter((e) => e?.type === 'TextMessageContent').map((e) => e.delta);
const ultimaSequenza = (eventi) => Math.max(0, ...eventi.map((e) => e?._sequenza).filter((n) => typeof n === 'number'));

test('S3-01 (red before the cure): a chat continued elsewhere opens from the phone with its NEW tail, then stays in step', async (t) => {
  const b = await banco(t);
  b.affitti.rilascia(b.sessionId); // il nostro affitto se ne va (il battito dopo il tempo fermo): l'altro processo scrive
  const ultimaAltrove = giroAltrove(b.store, b.sessionId, 'Risposta 1100');
  assert.equal(b.affitti.cambiatoAltrove(b.sessionId), true, 'premise: the journal grew elsewhere');
  const tel = telefono();
  assert.deepEqual(await apri(b, tel), { sub: 's', after: 0 });
  assert.ok(testi(tel.ricevuti).includes('Risposta 1100'), `the phone sees the turn written elsewhere: ${JSON.stringify(testi(tel.ricevuti))}`);
  assert.equal(ultimaSequenza(tel.ricevuti), ultimaAltrove, 'the replay ends where the journal on disk ends');
  const fine = tel.ricevuti.findIndex((e) => e?.name === 'talos.fine-rigiocata');
  assert.ok(fine > 0);
  assert.ok(tel.ricevuti.findIndex((e) => e?.delta === 'Risposta 1100') < fine, 'the new tail is part of the REPLAY (before its end), not a late live event');
  assert.equal(b.affitti.cambiatoAltrove(b.sessionId), false, 'in step after the open');
  // riaprire non rilegge di nuovo e dà gli stessi eventi
  const tel2 = telefono();
  await apri(b, tel2);
  assert.deepEqual(tel2.ricevuti.filter((e) => typeof e?._sequenza === 'number').map((e) => e._sequenza),
    tel.ricevuti.filter((e) => typeof e?._sequenza === 'number').map((e) => e._sequenza));
});

test('S3-02 (red before the cure): a phone that reopens after the last sequence it saw gets ONLY the tail written elsewhere', async (t) => {
  const b = await banco(t);
  const tel = telefono();
  await apri(b, tel);
  const vista = ultimaSequenza(tel.ricevuti);
  assert.ok(vista > 0);
  await b.operazioni.esegui('session.unsubscribe', { sub: 's' }, tel.contesto);
  b.affitti.rilascia(b.sessionId);
  const ultimaAltrove = giroAltrove(b.store, b.sessionId, 'Scritto dalla CLI');
  const dopo = telefono();
  await apri(b, dopo, vista, 's2');
  const numerati = dopo.ricevuti.filter((e) => typeof e?._sequenza === 'number');
  assert.deepEqual(numerati.map((e) => e._sequenza), Array.from({ length: ultimaAltrove - vista }, (_, i) => vista + 1 + i),
    'exactly the events after the last one seen, once each');
  assert.deepEqual(testi(numerati), ['Scritto dalla CLI']);
});

test('S3-03 overlap: the phone writes into a chat another live process holds ⇒ core refusal SESSION_LEASED with who holds it, never a merge', async (t) => {
  const b = await banco(t);
  b.affitti.rilascia(b.sessionId);
  giroAltrove(b.store, b.sessionId, 'Risposta della CLI');
  affittoAltrui(b.store, b.sessionId);
  const prima = readFileSync(giornale(b.store, b.sessionId));
  const tel = telefono();
  await assert.rejects(b.operazioni.esegui('session.send', { sessionId: b.sessionId, corpo: { messaggio: 'dal telefono' } }, tel.contesto),
    (e) => e.code === 'SESSION_LEASED' && e.stato === 409 && e.params?.etichetta === 'the TALOS CLI');
  assert.deepEqual(readFileSync(giornale(b.store, b.sessionId)), prima, 'nothing written: no second sequence on the journal');
  assert.equal(b.finto.avvii.length, 1, 'no turn started here');
  // aprirla resta permesso, e mostra il testo dell'altro processo
  await apri(b, tel);
  assert.ok(testi(tel.ricevuti).includes('Risposta della CLI'), 'opening a chat held elsewhere still shows its newest text');
});

test('S3-04 overlap: the phone writes into a chat continued elsewhere and now free ⇒ reload first, then ONE increasing numbering, no duplicate', async (t) => {
  const b = await banco(t);
  const tel = telefono();
  await apri(b, tel); // il telefono ha la chat aperta (la copia di prima)
  b.affitti.rilascia(b.sessionId);
  const ultimaAltrove = giroAltrove(b.store, b.sessionId, 'Risposta della CLI');
  await b.operazioni.esegui('session.send', { sessionId: b.sessionId, corpo: { messaggio: 'dal telefono' } }, tel.contesto);
  await finche(() => b.finto.avvii.length === 2);
  assert.equal(b.finto.avvii.length, 2, 'the phone turn started');
  assert.equal(b.affitti.tiene(b.sessionId), true, 'the phone write TOOK the lease, as an HTTP write does: a second process is now refused');
  b.finto.avvii[1].concludi('Risposta al telefono.');
  await fermoESulDisco(b.registro, b.store, b.sessionId);
  const sequenze = sequenzeSulDisco(b.store, b.sessionId);
  assert.deepEqual(sequenze, [...sequenze].sort((x, y) => x - y), 'the journal numbering only grows');
  assert.equal(new Set(sequenze).size, sequenze.length, `no sequence written twice: ${JSON.stringify(sequenze)}`);
  const avvioTelefono = righe(b.store, b.sessionId).filter((r) => r.type === 'RunStarted' && r.runId === 'r2');
  assert.equal(avvioTelefono.length, 1);
  assert.ok(avvioTelefono[0]._sequenza > ultimaAltrove, 'the phone turn is numbered after the turn written elsewhere');
  assert.ok(testi(tel.ricevuti).includes('Risposta della CLI'), 'the open phone got the turn written elsewhere, live');
  const vistiDalTelefono = tel.ricevuti.map((e) => e?._sequenza).filter((n) => typeof n === 'number');
  assert.equal(new Set(vistiDalTelefono).size, vistiDalTelefono.length, 'the phone never gets the same sequence twice');
});

test('S3-05 (CLI condition 3): a turn RUNNING here is never reloaded by a phone open, even if the journal grew; its live end reaches the phone', async (t) => {
  const b = await banco(t, { conclusa: false });
  b.affitti.rilascia(b.sessionId);
  appendFileSync(giornale(b.store, b.sessionId), `${JSON.stringify({ tipo: 'nota-altrove', n: 1 })}\n`);
  assert.equal(b.affitti.cambiatoAltrove(b.sessionId), true, 'premise: changed elsewhere');
  const tel = telefono();
  await apri(b, tel);
  b.finto.avvii[0].concludi('Finito qui.');
  await fermoESulDisco(b.registro, b.store, b.sessionId);
  assert.ok(tel.ricevuti.some((e) => e?.type === 'RunFinished'), 'the live end of the turn reaches the phone (same entry, not a reloaded copy)');
  assert.equal(b.registro.esporta(b.sessionId).eventi.filter((e) => e.type === 'RunFinished').length, 1);
});

test('S3-06 (CLI conditions 1 and 2): the shared realignment tolerates a missing method and a throw; iscriviConRigiocata stays synchronous', async (t) => {
  const modulo = await import('../src/iscrizione-sessione.mjs');
  assert.equal(typeof modulo.allineaSessioneDaFuori, 'function', 'one shared function, used by the HTTP door and the remote one');
  const { allineaSessioneDaFuori } = modulo;
  assert.equal(allineaSessioneDaFuori({}, 'x', { scrivere: false }), null, 'no method: nothing to wait for, synchronously');
  assert.equal(allineaSessioneDaFuori(null, 'x', { scrivere: false }), null);
  const errori = [];
  t.mock.method(console, 'error', (...a) => { errori.push(a.join(' ')); });
  assert.equal(await allineaSessioneDaFuori({ allineaSessione: async () => { throw new Error('rotto async'); } }, 'x', { scrivere: true }), null);
  assert.equal(await allineaSessioneDaFuori({ allineaSessione: () => { throw new Error('rotto sync'); } }, 'x', { scrivere: true }), null);
  assert.ok(errori.some((r) => /not aligned: rotto async/u.test(r)) && errori.some((r) => /not aligned: rotto sync/u.test(r)), JSON.stringify(errori));
  const chiamate = [];
  const esito = await allineaSessioneDaFuori({ allineaSessione: async (id, o) => { chiamate.push([id, o]); return { stato: 'libera', ricaricata: true }; } }, 'id1', { scrivere: false });
  assert.deepEqual(esito, { stato: 'libera', ricaricata: true });
  assert.deepEqual(chiamate, [['id1', { scrivere: false }]]);
  const disiscrivi = iscriviConRigiocata({ sessionRegistry: { iscriviti: () => () => {} }, sessionId: 'x', manda: () => {} });
  assert.equal(typeof disiscrivi, 'function', 'never a Promise');
});

test('S3-07 (CLI condition 2): a registry without the method, one that throws, a session the local registry does not have: the phone still opens; a missing session is NOT_FOUND and never realigned', async () => {
  const errore = console.error;
  console.error = () => {};
  try {
    const casi = { senza: undefined, lancia: async () => { throw new Error('rotto'); }, assente: async () => ({ stato: 'assente' }) };
    for (const [nome, metodo] of Object.entries(casi)) {
      const chiamate = [];
      const sessionRegistry = { esiste: () => true, iscriviti: (_id, ascolta) => { ascolta({ type: 'X', _sequenza: 1 }); return () => {}; },
        ...(metodo ? { allineaSessione: (id, o) => { chiamate.push([id, o]); return metodo(id, o); } } : {}) };
      const operazioni = creaOperazioni({ chiama: async () => ({}), sessionRegistry, iscriviConRigiocata, ogni: () => null, smetti: () => {} });
      const tel = telefono();
      assert.deepEqual(await operazioni.esegui('session.events', { sessionId: 'abc', sub: 's', after: 0 }, tel.contesto), { sub: 's', after: 0 }, nome);
      assert.ok(tel.ricevuti.some((e) => e?.type === 'X'), `${nome}: the replay still arrives`);
      if (metodo) assert.deepEqual(chiamate, [['abc', { scrivere: false }]], `${nome}: the open asks to READ, never to take the lease`);
    }
    const chiamate = [];
    const mancante = { esiste: () => false, iscriviti: () => () => {}, allineaSessione: async (id) => { chiamate.push(id); return { stato: 'libera' }; } };
    const operazioni = creaOperazioni({ chiama: async () => ({}), sessionRegistry: mancante, iscriviConRigiocata, ogni: () => null, smetti: () => {} });
    await assert.rejects(operazioni.esegui('session.events', { sessionId: 'abc', sub: 's', after: 0 }, telefono().contesto), { code: 'NOT_FOUND' });
    assert.deepEqual(chiamate, [], 'a session that does not exist is never realigned');
  } finally { console.error = errore; }
});

test('S3-08 (parity): the HTTP open realigns through the same door as before (the browser path stays as it was)', async (t) => {
  const b = await banco(t);
  b.affitti.rilascia(b.sessionId);
  giroAltrove(b.store, b.sessionId, 'Risposta HTTP');
  /* il cancello allinea PRIMA del giro delle rotte: la GET della sessione stessa (un'apertura per il cancello) basta a provarlo, anche se
     poi nessuna rotta la serve (404); `/events` sarebbe uno stream che qui non si chiude */
  await b.chiama({ metodo: 'GET', percorso: `/api/v1/sessions/${b.sessionId}` }).catch((e) => assert.equal(e.code, 'NOT_FOUND'));
  assert.ok(b.registro.esporta(b.sessionId).eventi.some((e) => e.delta === 'Risposta HTTP'), 'the HTTP open reloaded the journal');
  // e una scrittura HTTP su una sessione tenuta altrove resta 409
  affittoAltrui(b.store, b.sessionId);
  await assert.rejects(b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/resume`, corpo: { messaggio: 'ancora' } }),
    (e) => e.code === 'SESSION_LEASED' && e.stato === 409);
});

test('S3-09 overlap, lease taken over: this process still believes it holds the chat, another live process took it ⇒ a phone write is refused at the door (409 SESSION_LEASED), the holder\'s journal and lease file stay unchanged', async (t) => {
  const b = await banco(t);
  assert.equal(b.affitti.tiene(b.sessionId), true, 'premise: this process took the lease with its first turn and still believes it holds it');
  /* il nostro battito si è fermato (PC sospeso), l'affitto è scaduto e la CLI lo ha preso: il file d'affitto ora è suo, la memoria qui no */
  affittoAltrui(b.store, b.sessionId);
  const fileAffitto = join(b.store, CARTELLA_AFFITTI, `${b.sessionId}.json`);
  const giornalePrima = readFileSync(giornale(b.store, b.sessionId));
  const affittoPrima = readFileSync(fileAffitto);
  const tel = telefono();
  await assert.rejects(b.operazioni.esegui('session.send', { sessionId: b.sessionId, corpo: { messaggio: 'dal telefono' } }, tel.contesto),
    (e) => e.code === 'SESSION_LEASED' && e.stato === 409 && e.params?.etichetta === 'the TALOS CLI', 'the write is refused at the door, naming who holds it');
  await quieto(b.store);
  assert.equal(b.finto.avvii.length, 1, 'no turn started here');
  assert.deepEqual(readFileSync(giornale(b.store, b.sessionId)), giornalePrima, 'the holder\'s journal is unchanged: nothing written, no merge');
  assert.deepEqual(readFileSync(fileAffitto), affittoPrima, 'the holder\'s lease file is unchanged');
  assert.equal(b.registro.esporta(b.sessionId).eventi.filter((e) => e.type === 'RunStarted').length, 1, 'no phone turn in memory either');
});

/*
 * Giro piccolo dopo il revisore avversario (12/11/2026, `RAPPORTO-REVISORE-RECUPERO-P4-2026-11-12.md`, punti 3 e 4):
 *   · S3-10: la STESSA sigla richiesta di nuovo mentre la chat è cambiata altrove ⇒ ogni numero UNA volta sola sul filo (la vecchia
 *     iscrizione si chiude PRIMA dell'attesa, o riceve la coda dal vivo e poi la rigiocata la rimanda);
 *   · S3-11/12: la chat cancellata qui MENTRE il telefono la apre ⇒ mai un'apertura riuscita e vuota. La finestra (pochi millisecondi
 *     sul PC vero) qui è FORZATA: la cancellazione parte dentro l'attesa dell'allineamento, non la si spera;
 */
/* il PC su cui la cancellazione della chat parte ESATTAMENTE mentre un'apertura aspetta l'allineamento: lo stesso registro vero (è
   congelato, e un Proxy non può dare un valore diverso per una proprietà congelata: lo si eredita, ogni altro metodo resta il suo), con
   `allineaSessione` che, appena partito, fa partire `elimina` (una volta sola). Con `finita` l'allineamento torna solo a cancellazione
   conclusa: l'altro ordine possibile, la porta ricontrolla quando la cancellazione rifiutata ha già rimesso la chat al suo posto */
function cancellaMentreSiApre(b, { finita = false } = {}) {
  let cancellazione = null;
  const registro = Object.create(b.registro, { allineaSessione: { value: (id, opzioni) => {
    const attesa = b.registro.allineaSessione(id, opzioni);
    cancellazione ??= b.registro.elimina(id).then((esito) => ({ esito }), (errore) => ({ errore }));
    return finita ? attesa.then(async (esito) => { await cancellazione; return esito; }) : attesa;
  } } });
  const operazioni = creaOperazioni({ chiama: b.chiama, sessionRegistry: registro, iscriviConRigiocata, ogni: () => null, smetti: () => {} });
  return { operazioni, cancellazione: () => cancellazione };
}
const numerati = (eventi) => eventi.map((e) => e?._sequenza).filter((n) => typeof n === 'number');
const doppi = (numeri) => numeri.filter((n, i) => numeri.indexOf(n) !== i);
/* un giro scritto dal telefono, dal vivo: parte, il modello finto lo conclude, la sua fine arriva a chi ascolta, il registro lo dà per
   finito (un doppione, se ci fosse, arriva con lo stesso evento: non c'è niente da aspettare oltre) */
async function giroDalTelefono(b, tel, dopoLaSequenza) {
  const prima = b.finto.avvii.length;
  await b.operazioni.esegui('session.send', { sessionId: b.sessionId, corpo: { messaggio: 'dal telefono' } }, tel.contesto);
  await finche(() => b.finto.avvii.length > prima);
  assert.equal(b.finto.avvii.length, prima + 1, 'the phone turn started');
  b.finto.avvii[prima].concludi('Risposta al telefono.');
  await finche(() => tel.ricevuti.some((e) => e?.type === 'RunFinished' && e._sequenza > dopoLaSequenza));
  await fermoESulDisco(b.registro, b.store, b.sessionId);
}

test('S3-10 (reviewer point 3, red before the cure): the SAME sub asked again while the chat changed elsewhere ⇒ each sequence reaches the wire ONCE, and one listener stays', async (t) => {
  const b = await banco(t);
  const tel = telefono();
  await apri(b, tel);
  const vista = ultimaSequenza(tel.ricevuti);
  assert.ok(vista > 0);
  b.affitti.rilascia(b.sessionId);
  const ultimaAltrove = giroAltrove(b.store, b.sessionId, 'Coda');
  await apri(b, tel, vista, 's'); // «Riprova»: la stessa sigla, dopo l'ultimo numero visto
  assert.deepEqual(doppi(numerati(tel.ricevuti)), [], `no sequence twice on the same subscription: ${JSON.stringify(numerati(tel.ricevuti))}`);
  assert.deepEqual(numerati(tel.ricevuti).filter((n) => n > vista), Array.from({ length: ultimaAltrove - vista }, (_, i) => vista + 1 + i), 'exactly the tail written elsewhere');
  assert.equal(tel.ricevuti.filter((e) => e?.delta === 'Coda').length, 1, 'the new text once');
  // e dopo resta UN solo ascolto: un giro dal vivo arriva una volta sola
  await giroDalTelefono(b, tel, ultimaAltrove);
  assert.ok(ultimaSequenza(tel.ricevuti) > ultimaAltrove, 'the live turn reaches the phone');
  assert.deepEqual(doppi(numerati(tel.ricevuti)), [], `the live turn once too: ${JSON.stringify(numerati(tel.ricevuti))}`);
});

test('S3-11 (reviewer point 4, red before the cure): the chat is DELETED here while the phone opens it ⇒ the answer of a chat that is not there (NOT_FOUND), never a successful empty open', async (t) => {
  const b = await banco(t);
  const tel = telefono();
  await apri(b, tel); // il telefono l'aveva aperta: `s` è un'iscrizione viva
  await apri(b, tel, 0, 'altra'); // e ne ha un'altra sulla stessa connessione
  const prima = tel.ricevuti.length;
  assert.ok(numerati(tel.ricevuti).length > 0, 'premise: the chat has events');
  const finestra = cancellaMentreSiApre(b);
  const esito = await finestra.operazioni.esegui('session.events', { sessionId: b.sessionId, sub: 's', after: 0 }, tel.contesto).then((riuscita) => ({ riuscita }), (rifiuto) => ({ rifiuto }));
  const cancellazione = await finestra.cancellazione();
  assert.equal(cancellazione?.esito?.ok, true, `premise: the deletion started inside the open and went through: ${JSON.stringify(cancellazione)}`);
  assert.equal(b.registro.esiste(b.sessionId), false, 'premise: the chat is gone');
  assert.equal(esito.rifiuto?.code, 'NOT_FOUND', `the open is refused, not "successful" with nothing in it: ${JSON.stringify(esito.riuscita ?? esito.rifiuto?.code)}`);
  assert.equal(tel.ricevuti.length, prima, 'nothing more on the wire: no empty replay, no end-of-replay marker');
  assert.equal(tel.contesto.iscrizioni.has('s'), false, 'the old subscription, closed for the reopen, is not left behind on the connection');
  assert.equal(tel.contesto.iscrizioni.has('altra'), true, 'only the sub that was asked again is dropped: the others end with their own unsubscribe or with the connection');
  // la stessa risposta, parola per parola, di una chat che non c'è
  const assente = await apri(b, telefono()).then(() => null, (e) => e);
  assert.deepEqual([esito.rifiuto.code, esito.rifiuto.message], [assente?.code, assente?.message]);
});

test('S3-12 (reviewer point 4, red before the cure): the deletion is REFUSED (the chat changed elsewhere) while the phone opens it ⇒ never a successful empty open; the chat is still here and reopens whole, with its listener', async (t) => {
  const b = await banco(t);
  b.affitti.rilascia(b.sessionId);
  const ultimaAltrove = giroAltrove(b.store, b.sessionId, 'Scritto altrove');
  const finestra = cancellaMentreSiApre(b);
  const tel = telefono();
  const esito = await finestra.operazioni.esegui('session.events', { sessionId: b.sessionId, sub: 's', after: 0 }, tel.contesto).then((riuscita) => ({ riuscita }), (rifiuto) => ({ rifiuto }));
  const cancellazione = await finestra.cancellazione();
  assert.equal(cancellazione?.errore?.code, 'SESSION_CHANGED_ELSEWHERE', `premise: the deletion started inside the open and was refused: ${JSON.stringify(cancellazione?.esito ?? cancellazione?.errore?.code)}`);
  assert.equal(b.registro.esiste(b.sessionId), true, 'the refused deletion leaves the chat here');
  t.diagnostic(`S3-12: open ${esito.rifiuto ? `refused ${esito.rifiuto.code}` : 'successful'}, ${numerati(tel.ricevuti).length} numbered events, ${tel.ricevuti.length} on the wire`);
  if (esito.rifiuto) {
    /* la porta ha trovato la chat fuori dal registro (la cancellazione era in volo): la risposta di una chat che non c'è, e niente sul filo */
    assert.equal(esito.rifiuto.code, 'NOT_FOUND');
    assert.equal(tel.ricevuti.length, 0, 'a refused open sends nothing');
    assert.equal(tel.contesto.iscrizioni.size, 0, 'and leaves no subscription');
  } else {
    /* la porta ha trovato la chat già rimessa a posto: allora l'apertura non è vuota, parte dal primo numero e ha l'ascolto. Può
       essere la coda VECCHIA (la rilettura ha rinunciato perché la cancellazione aveva tolto la chat: S3-15) o tutta (rilettura riuscita) */
    assert.deepEqual(esito.riuscita, { sub: 's', after: 0 });
    assert.ok(numerati(tel.ricevuti).length > 0, 'a successful open is never empty');
    assert.equal(numerati(tel.ricevuti)[0], 1, 'from the first event');
    assert.equal(tel.contesto.iscrizioni.has('s'), true);
  }
  // riaprire: la chat intera, con la coda scritta altrove, e l'ascolto dal vivo
  const dopo = telefono();
  assert.deepEqual(await apri(b, dopo, 0, 's2'), { sub: 's2', after: 0 });
  assert.deepEqual(numerati(dopo.ricevuti), Array.from({ length: ultimaAltrove }, (_, i) => i + 1), 'the reopen gives every event, once, with the tail written elsewhere');
  assert.ok(testi(dopo.ricevuti).includes('Scritto altrove'));
  await giroDalTelefono(b, dopo, ultimaAltrove);
  assert.ok(dopo.ricevuti.some((e) => e?.type === 'RunFinished' && e._sequenza > ultimaAltrove), 'the reopened phone is listening: the live turn reaches it');
  assert.deepEqual(doppi(numerati(dopo.ricevuti)), []);
});

/*
 * S3-13 (mutante R14 del revisore, 12/11): aprire una chat dalla finestra è LEGGERE. Il cancello di http-app passa `scrivere: scrive`,
 *   falso per una GET (owner 10/10, `allineaSessione`: «aprire, guardare: niente affitto»): con `scrivere: true` fisso ogni apertura
 *   prendeva l'affitto e la CLI o un'altra finestra trovavano la chat «tenuta» da chi la stava solo guardando. Nessuna prova lo fissava.
 * S3-14: l'ordine della stessa sigla richiesta di nuovo, senza registro vero: la vecchia iscrizione si chiude PRIMA dell'attesa
 *   dell'allineamento, e una richiesta rifiutata alla porta (chat che non c'è) non chiude l'iscrizione che il telefono ha già.
 * S3-15: l'altro ordine di S3-12, forzato anche lui: la cancellazione rifiutata ha GIÀ rimesso la chat al suo posto quando la porta
 *   ricontrolla ⇒ l'apertura non è vuota ma NON è intera: il telefono vede la coda VECCHIA (2 eventi su 7, quelli che questo processo
 *   aveva in memoria), con l'ascolto. La rilettura ha rinunciato perché in quel momento la cancellazione aveva tolto la chat dal registro
 *   (`session-registry.mjs`, `ricaricaDalDisco`); la coda scritta altrove gli arriva al primo riallineamento dopo, una volta sola.
 *   Limite noto (ripasso del revisore, punto 5): uguale prima della cura; prima di S3 la coda era sempre vecchia.
 */
test('S3-13 (reviewer mutant R14): opening a FREE chat from the window (GET) only reads ⇒ this process does not take the lease, even when it reloads the chat', async (t) => {
  const b = await banco(t);
  const fileAffitto = join(b.store, CARTELLA_AFFITTI, `${b.sessionId}.json`);
  b.affitti.rilascia(b.sessionId);
  assert.equal(b.affitti.tiene(b.sessionId), false, 'premise: the chat is free');
  assert.equal(existsSync(fileAffitto), false, 'premise: no lease file');
  /* la GET della sessione è un'apertura per il cancello (come in S3-08): nessuna rotta la serve (404), il cancello è già passato */
  await b.chiama({ metodo: 'GET', percorso: `/api/v1/sessions/${b.sessionId}` }).catch((e) => assert.equal(e.code, 'NOT_FOUND'));
  assert.equal(b.affitti.tiene(b.sessionId), false, 'looking at a free chat does not take the lease');
  assert.equal(existsSync(fileAffitto), false, 'no lease file: another process can still take the chat');
  // anche quando l'apertura la RILEGGE (continuata altrove): si legge e basta
  giroAltrove(b.store, b.sessionId, 'Scritto altrove');
  await b.chiama({ metodo: 'GET', percorso: `/api/v1/sessions/${b.sessionId}` }).catch((e) => assert.equal(e.code, 'NOT_FOUND'));
  assert.ok(b.registro.esporta(b.sessionId).eventi.some((e) => e.delta === 'Scritto altrove'), 'premise: the open reloaded the chat');
  assert.equal(b.affitti.tiene(b.sessionId), false, 'a reload for reading does not take the lease either');
  assert.equal(existsSync(fileAffitto), false);
  // e dal telefono lo stesso
  await apri(b, telefono());
  assert.equal(b.affitti.tiene(b.sessionId), false, 'the phone open does not take it either');
  assert.equal(existsSync(fileAffitto), false);
});

test('S3-14 the same sub asked again: the old subscription closes BEFORE the realignment is awaited; a request refused at the door leaves the subscription the phone has', async () => {
  const passi = [];
  const sessionRegistry = {
    esiste: (id) => id === 'abc',
    iscriviti: (id) => { passi.push(`iscritta ${id}`); return () => { passi.push(`chiusa ${id}`); }; },
    allineaSessione: async (id) => { passi.push(`allineamento ${id}`); await new Promise((r) => setImmediate(r)); passi.push(`allineata ${id}`); return { stato: 'libera', ricaricata: false }; },
  };
  const operazioni = creaOperazioni({ chiama: async () => ({}), sessionRegistry, iscriviConRigiocata, ogni: () => null, smetti: () => {} });
  const tel = telefono();
  await operazioni.esegui('session.events', { sessionId: 'abc', sub: 's', after: 0 }, tel.contesto);
  await operazioni.esegui('session.events', { sessionId: 'abc', sub: 'altra', after: 0 }, tel.contesto);
  passi.length = 0;
  // una chat che non c'è, con la sigla di un'iscrizione viva: rifiuto alla porta, e l'iscrizione resta
  await assert.rejects(operazioni.esegui('session.events', { sessionId: 'zzz', sub: 's', after: 0 }, tel.contesto), { code: 'NOT_FOUND' });
  assert.deepEqual(passi, [], 'refused at the door: nothing closed, nothing realigned');
  // la stessa sigla per la stessa chat: prima si chiude la vecchia, POI si aspetta l'allineamento, poi ci si iscrive
  await operazioni.esegui('session.events', { sessionId: 'abc', sub: 's', after: 0 }, tel.contesto);
  assert.deepEqual(passi, ['chiusa abc', 'allineamento abc', 'allineata abc', 'iscritta abc']);
  assert.deepEqual([...tel.contesto.iscrizioni.keys()].sort(), ['altra', 's'], 'the other subscription of the connection is untouched');
});

test('S3-15 (reviewer point 4, known limit): the refused deletion has ALREADY put the chat back when the door checks again ⇒ the open is not empty but shows the OLD tail (2 events of 7) with its listener; the tail written elsewhere arrives at the next realignment, once', async (t) => {
  const b = await banco(t);
  const vecchia = sequenzeSulDisco(b.store, b.sessionId); // ciò che questo processo ha in memoria: il suo primo giro
  assert.deepEqual(vecchia, [1, 2], 'premise: the first turn here is two events, all on disk');
  b.affitti.rilascia(b.sessionId);
  const ultimaAltrove = giroAltrove(b.store, b.sessionId, 'Scritto altrove');
  assert.equal(ultimaAltrove, 7, 'premise: another process wrote five more events');
  const finestra = cancellaMentreSiApre(b, { finita: true });
  const tel = telefono();
  assert.deepEqual(await finestra.operazioni.esegui('session.events', { sessionId: b.sessionId, sub: 's', after: 0 }, tel.contesto), { sub: 's', after: 0 });
  assert.equal((await finestra.cancellazione())?.errore?.code, 'SESSION_CHANGED_ELSEWHERE', 'premise: the deletion started inside the open and was refused before the door checked again');
  assert.deepEqual(numerati(tel.ricevuti), vecchia, 'not empty and from the first event, but the OLD tail: the reload gave up while the deletion had the chat out of the registry');
  assert.equal(testi(tel.ricevuti).includes('Scritto altrove'), false, 'the tail written elsewhere is not in this open');
  assert.ok(tel.ricevuti.some((e) => e?.name === 'talos.fine-rigiocata'));
  assert.equal(tel.contesto.iscrizioni.has('s'), true);
  assert.equal(b.affitti.cambiatoAltrove(b.sessionId), true, 'the chat is still marked as changed elsewhere: the next open realigns it');
  // l'ascolto c'è: appena la chat si riallinea (un'altra apertura) la coda scritta altrove arriva a QUESTO telefono, una volta sola
  await apri(b, telefono(), 0, 's2');
  assert.deepEqual(numerati(tel.ricevuti), Array.from({ length: ultimaAltrove }, (_, i) => i + 1), 'the first phone is listening: after the realignment it has every event, once');
  assert.equal(tel.ricevuti.filter((e) => e?.delta === 'Scritto altrove').length, 1);
});
