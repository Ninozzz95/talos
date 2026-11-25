import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio, registraRiga } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { righeDellaVista } from './aiuto/vista-del-disco.mjs';

/*
 * ⭐ 13/11/2026 — MAI SCARTARE UN EVENTO (cura del ROSSO del revisore affitto 1 di 3, giudice v1804). Dopo tre rifiuti del recinto lo
 *   store scartava l'evento in silenzio (`session-registry.mjs:5560` e `:8064` della testa `730f1973b`, solo `console.error`): con un
 *   altro processo che accoda spesso, sul disco restavano 22-25 pezzi su 40 e fuori ordine. Prove del revisore COPIATE e adattate da
 *   `C:/T/rev-aff1-copia/harness-ui/tests/zz-rev-aff1.test.mjs` (REVAFF-01..05; REVAFF-06, l'altro che PRENDE l'affitto, resta del
 *   revisore: è l'affitto che rifiuta, uguale sulla base), più:
 *   · REVAFF-03 con DUE processi Node veri (l'altro è `fixtures/affitto-altro-scrittore.mjs`, lo store vero senza affitto);
 *   · la finestra di REVAFF-02 fra la `stat` e l'accodamento, resa deterministica: l'altro scrive DENTRO la nostra scrittura;
 *   · la riga per la persona, una per giro, niente carte;
 *   · il contratto nuovo dello store: il rifiuto del recinto si risolve DENTRO la stessa operazione della coda.
 *   Aspetta eventi (fine del giro, assestamento, coda vuota), nessun tetto di tempo. Solo cartelle temporanee del profilo finto.
 */
const cartellaTemp = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-mai-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const giornale = (store, id) => join(store, `${id}.jsonl`);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
/* 14/11/2026 (mai riscrivere): il diario non si riscrive più; i numeri sono quelli della VISTA (regola V, `aiuto/vista-del-disco.mjs`),
   gli stessi che ogni lettore di questa versione vede. I numeri SCRITTI (che possono ripetersi) servono solo all'altro processo finto. */
const righe = (store, id) => righeDellaVista(giornale(store, id));
const sequenzeSulDisco = (store, id) => righe(store, id).map((r) => r._sequenza).filter((n) => typeof n === 'number');
const sequenzeScritte = (store, id) => readFileSync(giornale(store, id), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r)._sequenza).filter((n) => typeof n === 'number');
const doppieDi = (s) => s.filter((n, i) => s.indexOf(n) !== i);
/* il giro dell'altro processo, nello stesso processo (la simulazione del revisore): legge il più alto SCRITTO e scrive dopo */
function giroAltrove(store, id, detto) {
  let n = Math.max(0, ...sequenzeScritte(store, id));
  const runId = `altrove-${n}`;
  const messageId = `m-altrove-${n}`;
  const ev = (type, extra) => ({ type, _sequenza: ++n, ...extra });
  const giro = [ev('RunStarted', { threadId: id, runId }), ev('TextMessageStart', { messageId, role: 'assistant' }),
    ev('TextMessageContent', { messageId, delta: detto }), ev('TextMessageEnd', { messageId }),
    ev('RunFinished', { threadId: id, runId, result: { detto } })];
  appendFileSync(giornale(store, id), giro.map((r) => `${JSON.stringify(r)}\n`).join(''));
  return n;
}

/* l'altro processo VERO: un figlio avviato qui, contato, atteso fino all'uscita */
const SCRITTORE = fileURLToPath(new URL('./fixtures/affitto-altro-scrittore.mjs', import.meta.url));
async function altroProcesso(t, store) {
  const figlio = fork(SCRITTORE, [store], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let uscita = '';
  figlio.stdout.on('data', (d) => { uscita += d; });
  figlio.stderr.on('data', (d) => { uscita += d; });
  let attesa = null; // una risposta alla volta: un solo ascoltatore di `message` e uno di `exit`
  figlio.on('message', (m) => { const a = attesa; attesa = null; a?.ok(m); });
  const finito = new Promise((ok) => figlio.once('exit', (code) => { const a = attesa; attesa = null; a?.ko(new Error(`the other process exited: ${uscita}`)); ok(code); }));
  t.after(async () => { if (figlio.exitCode === null) { figlio.send({ fine: true }); await finito; } });
  const prossimo = () => new Promise((ok, ko) => { attesa = { ok, ko }; });
  const pronto = await prossimo();
  assert.ok(Number.isSafeInteger(pronto?.pronto), 'the other process is a real process');
  assert.notEqual(pronto.pronto, process.pid);
  return {
    pid: pronto.pronto,
    async giro(sessionId, detto) { const r = prossimo(); figlio.send({ sessionId, giro: detto }); return (await r).fatto; },
    async fine() { figlio.send({ fine: true }); return finito; },
  };
}

async function corsa(t, { quando, pausaFra = 0, pezzi = 40, dueProcessi = false }) {
  const store = cartellaTemp(t);
  const lavoro = cartellaTemp(t);
  attivaAffittiArchivio(store, { etichetta: 'rev', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const altro = dueProcessi ? await altroProcesso(t, store) : null;
  const stato = { sessionId: null, altrove: [] };
  let giroFinito;
  const fineGiro = new Promise((ok) => { giroFinito = ok; });
  const registro = createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'rev' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => {
      while (!stato.sessionId) await pausa(5);
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      input.onEvento({ type: 'TextMessageStart', messageId: 'mio', role: 'assistant' });
      await attendiScritture({ cartellaStore: store, sessionId: stato.sessionId }); // l'inizio del giro è sul disco
      for (let i = 0; i < pezzi; i += 1) {
        if (quando(i)) {
          const detto = `altrove prima del pezzo ${i}`;
          stato.altrove.push(altro ? await altro.giro(stato.sessionId, detto) : giroAltrove(store, stato.sessionId, detto));
        }
        input.onEvento({ type: 'TextMessageContent', messageId: 'mio', delta: `p${String(i).padStart(2, '0')} ` });
        if (pausaFra) await pausa(pausaFra);
      }
      input.onEvento({ type: 'TextMessageEnd', messageId: 'mio' });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      giroFinito();
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso' } };
    },
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  /* 14/11/2026 (mai riscrivere): il PRIMO numero che chi ascoltava ha visto per ogni riga; dopo la ricarica la vista deve dargli lo stesso */
  const vistiDalVivo = new Map();
  const chiaveDi = (e) => `${e.type}|${e.messageId ?? ''}|${e.runId ?? ''}|${e.delta ?? ''}`;
  registro.iscriviti(sessionId, (e) => { if (Number.isSafeInteger(e._sequenza) && !vistiDalVivo.has(chiaveDi(e))) vistiDalVivo.set(chiaveDi(e), e._sequenza); }, 0);
  stato.sessionId = sessionId;
  await fineGiro;
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  if (altro) assert.equal(await altro.fine(), 0, 'the other process exits cleanly');
  /* i numeri doppi che può far nascere SOLO l'altro processo (scrive senza recinto: legge il più alto e scrive dopo, mentre noi
     accodiamo) prima della ricarica; la chat ferma si riallinea come all'apertura (e la ricarica li rinumera, pezzo 4) */
  const doppiPrima = doppieDi(sequenzeSulDisco(store, sessionId));
  const allineamento = await registro.allineaSessione(sessionId);
  const disco = righe(store, sessionId);
  const miei = disco.filter((r) => r.type === 'TextMessageContent' && r.messageId === 'mio').map((r) => r.delta.trim());
  const attesi = Array.from({ length: pezzi }, (_, i) => `p${String(i).padStart(2, '0')}`);
  const giriAltrove = disco.filter((r) => typeof r.runId === 'string' && r.runId.startsWith('altrove-') && r.type === 'RunFinished').length;
  const voce = registro.esporta(sessionId);
  const inMemoria = voce?.eventi?.filter((e) => e.type === 'TextMessageContent' && e.messageId === 'mio').map((e) => e.delta.trim()) ?? [];
  const avvisi = disco.filter((r) => r.type === 'CUSTOM' && r.name === 'talos.journal-riparato' && r.value?.scrittaAltrove === true);
  t.diagnostic(`miei sul disco ${miei.length}/${pezzi}, altrove ${giriAltrove}/${stato.altrove.length}, doppi ${JSON.stringify(doppieDi(sequenzeSulDisco(store, sessionId)))} (prima della ricarica ${doppiPrima.length}), allineamento ${allineamento?.stato}/${allineamento?.ricaricata}, avvisi ${avvisi.length}${altro ? `, altro pid ${altro.pid}` : ''}`);
  t.diagnostic(`ordine sul disco ${miei.join(',')}`);
  t.diagnostic(`in memoria ${inMemoria.length}/${pezzi}: ${inMemoria.join(',')} (voce ${voce ? `${voce.eventi?.length} eventi: ${[...new Set(voce.eventi?.map((e) => e.type))].join('/')}` : 'assente'})`);
  const nellaVista = new Map(disco.filter((r) => Number.isSafeInteger(r._sequenza)).map((r) => [chiaveDi(r), r._sequenza]));
  const numeriCambiati = [...vistiDalVivo].filter(([k, n]) => nellaVista.has(k) && nellaVista.get(k) !== n).map(([k, n]) => `${k}:${n}→${nellaVista.get(k)}`);
  t.diagnostic(`numeri visti dal vivo ${vistiDalVivo.size}, cambiati nella vista del disco ${numeriCambiati.length} ${JSON.stringify(numeriCambiati.slice(0, 4))}`);
  return { store, sessionId, registro, miei, attesi, giriAltrove, altrove: stato.altrove.length, doppi: doppieDi(sequenzeSulDisco(store, sessionId)), doppiPrima, inMemoria, disco, avvisi, voce, numeriCambiati, vistiDalVivo: vistiDalVivo.size };
}

test('REVAFF-01: one write of the other process in the middle of 40 of our pieces: every piece once, in order, no number twice', async (t) => {
  const r = await corsa(t, { quando: (i) => i === 10 });
  assert.deepEqual(r.miei, r.attesi);
  assert.equal(r.giriAltrove, 1);
  assert.deepEqual(r.doppi, []);
});

test('REVAFF-02: two writes of the other process, with our pieces spaced by 2 ms (the queue drains in between)', async (t) => {
  const r = await corsa(t, { quando: (i) => i === 10 || i === 25, pausaFra: 2 });
  assert.deepEqual(r.miei, r.attesi);
  assert.equal(r.giriAltrove, 2);
  assert.deepEqual(r.doppi, []);
});

test('REVAFF-03: the other process writes before EVERY 3rd piece (13 turns): nothing of ours lost or reordered, on the disk and in memory', async (t) => {
  const r = await corsa(t, { quando: (i) => i % 3 === 1, pausaFra: 1 });
  assert.equal(r.giriAltrove, r.altrove);
  assert.deepEqual(r.doppiPrima, [], 'no number twice even before the reload (same process: the fence closes the window)');
  assert.deepEqual(r.doppi, []);
  assert.deepEqual(r.miei, r.attesi, 'on the disk, in order');
  assert.deepEqual(r.inMemoria, r.attesi, 'in memory, in order');
  assert.equal(r.avvisi.length, 1, 'one chat line for the turn');
  assert.deepEqual(r.numeriCambiati, [], 'every number shown live is the number of the same line on the disk (mai riscrivere)');
  assert.ok(r.vistiDalVivo >= 40);
});

test('REVAFF-03-DUE-PROCESSI: the same with the other TALOS in a REAL second Node process (the real store, no lease): 40 of 40 in order, its 13 turns whole, no number twice', async (t) => {
  const r = await corsa(t, { quando: (i) => i % 3 === 1, pausaFra: 1, dueProcessi: true });
  assert.equal(r.altrove, 13);
  assert.equal(r.giriAltrove, 13, 'every turn of the other process is on the disk');
  t.diagnostic(`numeri doppi fatti nascere dall'altro processo prima della ricarica: ${r.doppiPrima.length}`);
  assert.deepEqual(r.doppi, [], 'after the reload no number twice');
  assert.deepEqual(r.miei, r.attesi, 'on the disk, in order');
  assert.deepEqual(r.inMemoria, r.attesi, 'in memory, in order');
  assert.equal(r.voce.eventi.filter((e) => typeof e.runId === 'string' && e.runId.startsWith('altrove-') && e.type === 'RunFinished').length, 13, 'the other turns are in memory too');
  const altrove = r.disco.filter((x) => typeof x.runId === 'string' && x.runId.startsWith('altrove-'));
  assert.equal(altrove.length, 26, 'RunStarted and RunFinished of each of the 13 turns');
  assert.deepEqual(r.numeriCambiati, [], 'every number shown live is the number of the same line on the disk (mai riscrivere)');
});

test('REVAFF-04: the other process writes before EVERY piece, no pause (the queue full of refused rows)', async (t) => {
  const r = await corsa(t, { quando: () => true, pezzi: 20 });
  assert.equal(r.giriAltrove, r.altrove);
  assert.equal(r.avvisi.length, 1, 'one chat line for the turn, even with 20 writes of the other process');
  assert.deepEqual(r.doppiPrima, []);
  assert.deepEqual(r.doppi, []);
  assert.deepEqual(r.miei, r.attesi);
  assert.deepEqual(r.inMemoria, r.attesi);
  assert.deepEqual(r.numeriCambiati, [], 'every number shown live is the number of the same line on the disk (mai riscrivere)');
});

test('REVAFF-05: the other process writes before every 5th piece, our pieces 3 ms apart', async (t) => {
  const r = await corsa(t, { quando: (i) => i % 5 === 2, pausaFra: 3 });
  assert.equal(r.giriAltrove, r.altrove);
  assert.deepEqual(r.miei, r.attesi);
  assert.deepEqual(r.doppi, []);
});

test('MAI-AVVISO: a write placed after the lines of another TALOS is said ONCE in the chat (a durable «recovered» line, English then Italian in the page), no card, no error', async (t) => {
  const r = await corsa(t, { quando: (i) => i % 3 === 1, pausaFra: 1 });
  assert.equal(r.avvisi.length, 1, `one line for the turn (${r.avvisi.length})`);
  assert.equal(r.avvisi[0].value.riparato, true);
  assert.equal(Number.isSafeInteger(r.avvisi[0]._sequenza), true, 'durable, with its number');
  assert.equal(r.disco.filter((x) => x.type === 'RunError').length, 0, 'no error');
  assert.equal(r.disco.filter((x) => x.type === 'ApprovalRequested' || x.type === 'UserQuestionRequested').length, 0, 'no card');
  const inMemoria = r.registro.esporta(r.sessionId).eventi.filter((e) => e.name === 'talos.journal-riparato' && e.value?.scrittaAltrove === true);
  assert.equal(inMemoria.length, 1, 'the open window receives it too');
});

/* ───────────── la finestra di REVAFF-02, deterministica: l'altro scrive DENTRO la nostra scrittura ───────────── */
const require = createRequire(import.meta.url);
function agganciaFsPromises(t, nomi, prima) {
  const fsCjs = require('node:fs');
  const originali = Object.fromEntries(nomi.map((n) => [n, fsCjs.promises[n]]));
  let fatto = false;
  for (const n of nomi) {
    fsCjs.promises[n] = async (...argomenti) => { if (!fatto) { fatto = true; prima(); } return originali[n](...argomenti); };
  }
  syncBuiltinESMExports();
  const togli = () => { for (const n of nomi) fsCjs.promises[n] = originali[n]; syncBuiltinESMExports(); };
  t.after(togli);
  return togli;
}

test('REVAFF-02-FINESTRA: the other process writes while our append is under way (after our size check): no number is born twice', async (t) => {
  const store = cartellaTemp(t);
  const id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  attivaAffittiArchivio(store, { etichetta: 'finestra', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  await registraRiga({ cartellaStore: store, sessionId: id, record: { type: 'CUSTOM', name: 'talos.nota', value: { i: 'qui-1' }, _sequenza: 1 } });
  // the next async file operation of the store is OUR append: the other process writes 2..6 inside it
  const togli = agganciaFsPromises(t, ['appendFile', 'open', 'writeFile'], () => { giroAltrove(store, id, 'dentro la finestra'); });
  let rifiuto = null;
  await registraRiga({ cartellaStore: store, sessionId: id, record: { type: 'CUSTOM', name: 'talos.nota', value: { i: 'qui-2' }, _sequenza: 2 } })
    .catch((errore) => { rifiuto = errore; });
  togli();
  const sequenze = sequenzeSulDisco(store, id);
  t.diagnostic(`sequenze ${JSON.stringify(sequenze)} rifiuto ${rifiuto?.code ?? 'nessuno'}`);
  assert.deepEqual(doppieDi(sequenze), [], 'no number twice on the disk');
  assert.equal(rifiuto?.code ?? null, 'SESSION_CHANGED_ELSEWHERE', 'without a renumbering hook the store refuses: nothing written over the other lines');
});

test('REVAFF-02-FINESTRA-RIFATTA: the same window with the registry hook: our line is numbered after the other lines and written in the SAME operation', async (t) => {
  const store = cartellaTemp(t);
  const id = 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2';
  attivaAffittiArchivio(store, { etichetta: 'finestra', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  await registraRiga({ cartellaStore: store, sessionId: id, record: { type: 'CUSTOM', name: 'talos.nota', value: { i: 'qui-1' }, _sequenza: 1 } });
  const togli = agganciaFsPromises(t, ['appendFile', 'open', 'writeFile'], () => { giroAltrove(store, id, 'dentro la finestra'); });
  const record = { type: 'CUSTOM', name: 'talos.nota', value: { i: 'qui-2' }, _sequenza: 2 };
  const visti = [];
  await registraRiga({ cartellaStore: store, sessionId: id, record, dopoIlRecinto: (ultima) => { visti.push(ultima); record._sequenza = ultima + 1; } });
  togli();
  const sequenze = sequenzeSulDisco(store, id);
  assert.deepEqual(sequenze, [1, 2, 3, 4, 5, 6, 7], `ours after the other turn: ${JSON.stringify(sequenze)}`);
  assert.deepEqual(visti, [6], 'the hook saw the last number on the disk');
  assert.equal(righe(store, id).at(-1).value.i, 'qui-2');
});

/* ───────────── il contratto: il rifiuto si risolve nella stessa operazione, nell'ordine della coda ───────────── */

test('MAI-ORDINE: three queued writes behind a refused one keep their queue order, each numbered after the disk (gaps allowed, no doubles)', async (t) => {
  const store = cartellaTemp(t);
  const id = 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3';
  attivaAffittiArchivio(store, { etichetta: 'ordine', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  await registraRiga({ cartellaStore: store, sessionId: id, record: { type: 'CUSTOM', name: 'talos.nota', value: { i: 'qui-1' }, _sequenza: 1 } });
  giroAltrove(store, id, 'altrove'); // 2..6, written by the other process while we were not looking
  let prossima = 1;
  const numera = (record) => (ultima) => { prossima = Math.max(prossima, ultima) + 1; record._sequenza = prossima; };
  const scritte = ['a', 'b', 'c'].map((i, k) => {
    const record = { type: 'CUSTOM', name: 'talos.nota', value: { i }, _sequenza: 2 + k };
    return registraRiga({ cartellaStore: store, sessionId: id, record, dopoIlRecinto: numera(record) });
  });
  await Promise.all(scritte);
  const disco = righe(store, id).filter((r) => r.name === 'talos.nota').map((r) => `${r.value.i}:${r._sequenza}`);
  assert.deepEqual(disco, ['qui-1:1', 'a:7', 'b:8', 'c:9'], `queue order, numbers after the other turn: ${JSON.stringify(disco)}`);
  assert.deepEqual(doppieDi(sequenzeSulDisco(store, id)), []);
});

/* ───────────── dopo l'accodamento: la dimensione deve essere cresciuta SOLO dei nostri byte (punto 4, le due strade) ───────────── */
async function altroDentroLAccodamento(t, scrivi) {
  const store = cartellaTemp(t);
  const id = randomId();
  const affitti = attivaAffittiArchivio(store, { etichetta: 'dopo', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  await registraRiga({ cartellaStore: store, sessionId: id, record: { type: 'CUSTOM', name: 'talos.nota', value: { i: 'qui-1' }, _sequenza: 1 } });
  assert.equal(affitti.daRicaricare(id), false);
  const fsCjs = require('node:fs');
  const vero = fsCjs.appendFileSync;
  let fatto = false;
  /* un altro programma del sistema scrive fra la NOSTRA misura e il nostro accodamento: in questo processo nessuno può (la fila) */
  fsCjs.appendFileSync = (...a) => { if (!fatto) { fatto = true; vero(giornale(store, id), `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota', value: { i: 'altro' }, _sequenza: 2 })}\n`); } return vero(...a); };
  syncBuiltinESMExports();
  t.after(() => { fsCjs.appendFileSync = vero; syncBuiltinESMExports(); });
  await scrivi(store, id, { type: 'CUSTOM', name: 'talos.nota', value: { i: 'qui-2' }, _sequenza: 2 });
  fsCjs.appendFileSync = vero; syncBuiltinESMExports();
  return { store, id, affitti };
}
const randomId = () => `d${Math.random().toString(16).slice(2, 9)}-0000-4000-8000-000000000000`;
test('REVAFF-02-DOPO: an append mixed with another program (the size grew by more than our bytes) marks the chat to reload, async writer', async (t) => {
  const { store, id, affitti } = await altroDentroLAccodamento(t, (store, id, record) => registraRiga({ cartellaStore: store, sessionId: id, record }));
  assert.equal(affitti.daRicaricare(id), true, 'the chat is marked to reload: the next reload puts a number born twice back in order');
  assert.deepEqual(righe(store, id).map((r) => r.value.i), ['qui-1', 'altro', 'qui-2']);
});

test('REVAFF-02-DOPO-SYNC-2: the synchronous writer with the other program writing right AFTER our bytes: marked to reload too', async (t) => {
  const { registraRigaSync } = await import('../src/session-store.mjs');
  const store = cartellaTemp(t);
  const id = randomId();
  const affitti = attivaAffittiArchivio(store, { etichetta: 'dopo', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  await registraRiga({ cartellaStore: store, sessionId: id, record: { type: 'CUSTOM', name: 'talos.nota', value: { i: 'qui-1' }, _sequenza: 1 } });
  const fsCjs = require('node:fs');
  const vero = fsCjs.appendFileSync;
  let fatto = false;
  fsCjs.appendFileSync = (...a) => { const r = vero(...a); if (!fatto) { fatto = true; vero(giornale(store, id), `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota', value: { i: 'altro' }, _sequenza: 3 })}\n`); } return r; };
  syncBuiltinESMExports();
  t.after(() => { fsCjs.appendFileSync = vero; syncBuiltinESMExports(); });
  registraRigaSync({ cartellaStore: store, sessionId: id, record: { type: 'CUSTOM', name: 'talos.nota', value: { i: 'qui-2' }, _sequenza: 2 } });
  fsCjs.appendFileSync = vero; syncBuiltinESMExports();
  assert.equal(affitti.daRicaricare(id), true);
  assert.deepEqual(righe(store, id).map((r) => r.value.i), ['qui-1', 'qui-2', 'altro']);
});

async function giriConAltro(t, conAltro) {
  const store = cartellaTemp(t);
  const lavoro = cartellaTemp(t);
  attivaAffittiArchivio(store, { etichetta: 'due', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const stato = { sessionId: null, giri: 0 };
  const fineGiri = [];
  const fine = (k) => (fineGiri[k] ??= (() => { let ok; const p = new Promise((r) => { ok = r; }); p.ok = ok; return p; })());
  const registro = createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'due' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => {
      while (!stato.sessionId) await pausa(5);
      stato.giri += 1;
      const k = stato.giri;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${k}` });
      input.onEvento({ type: 'TextMessageStart', messageId: `m${k}`, role: 'assistant' });
      await attendiScritture({ cartellaStore: store, sessionId: stato.sessionId });
      for (let i = 0; i < 3; i += 1) {
        /* l'altro TALOS qui scrive una NOTA (non un giro): un giro intero dentro il nostro rende ambigua la ripresa dopo la ricarica
           (RETRY07, `recuperoCodaAmbiguo`, comportamento di prima e fuori da questa cura: dichiarato nel rapporto) */
        const n = Math.max(0, ...sequenzeSulDisco(store, stato.sessionId)) + 1;
        if (conAltro.includes(k)) appendFileSync(giornale(store, stato.sessionId), `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota-altrove', value: { detto: `altrove ${k}.${i}` }, _sequenza: n })}\n`);
        input.onEvento({ type: 'TextMessageContent', messageId: `m${k}`, delta: `g${k}p${i} ` });
        await attendiScritture({ cartellaStore: store, sessionId: stato.sessionId });
      }
      input.onEvento({ type: 'TextMessageEnd', messageId: `m${k}` });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k}`, outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      fine(k).ok();
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso', messaggiFinali: [...(input.messaggiIniziali ?? [{ role: 'user', content: 'scrivi' }]), { role: 'assistant', content: `giro ${k}` }] } };
    },
  });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  stato.sessionId = sessionId;
  const giri = Math.max(...conAltro);
  for (let k = 1; k <= giri; k += 1) {
    if (k > 1) assert.equal(registro.resume(sessionId, `ancora ${k}`).erroreAvvio, undefined, `turn ${k} starts`);
    await fine(k);
    await registro.attendiAssestamento(sessionId);
    await attendiScritture({ cartellaStore: store, sessionId });
    await registro.allineaSessione(sessionId);
  }
  const tutte = righe(store, sessionId);
  const avvisi = tutte.filter((r) => r.name === 'talos.journal-riparato' && r.value?.scrittaAltrove === true);
  const miei = tutte.filter((r) => r.type === 'TextMessageContent' && /^g\d/.test(r.delta)).map((r) => r.delta.trim());
  return { avvisi, miei, giri };
}

test('MAI-AVVISO-DUE-GIRI: the line is said once for EACH turn that met another TALOS (two turns, two lines, never more)', async (t) => {
  const { avvisi, miei } = await giriConAltro(t, [1, 2]);
  assert.equal(avvisi.length, 2, `one line for each of the two turns (${avvisi.length})`);
  assert.deepEqual(miei, ['g1p0', 'g1p1', 'g1p2', 'g2p0', 'g2p1', 'g2p2']);
});

test('MAI-AVVISO-TRE-GIRI: three turns, the other TALOS writes in the first and the third only: two lines, the quiet turn says nothing', async (t) => {
  const { avvisi, miei } = await giriConAltro(t, [1, 3]);
  assert.equal(avvisi.length, 2, `turns 1 and 3, not turn 2 (${avvisi.length})`);
  assert.deepEqual(miei, ['g1p0', 'g1p1', 'g1p2', 'g2p0', 'g2p1', 'g2p2', 'g3p0', 'g3p1', 'g3p2']);
});

test('REVAFF-02-DOPO-SYNC: the same through the SYNCHRONOUS writer (the plan proposal, the header)', async (t) => {
  const { registraRigaSync } = await import('../src/session-store.mjs');
  const { store, id, affitti } = await altroDentroLAccodamento(t, async (store, id, record) => { registraRigaSync({ cartellaStore: store, sessionId: id, record }); });
  assert.equal(affitti.daRicaricare(id), true);
  assert.deepEqual(righe(store, id).map((r) => r.value.i), ['qui-1', 'altro', 'qui-2']);
});
