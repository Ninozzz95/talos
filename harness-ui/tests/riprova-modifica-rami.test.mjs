/*
 * 24/10/2026 — «Riprova» e «Modifica e rimanda» come RAMI (owner, quattro consigliate sul bozzetto; contratto
 *   `CONTRATTO-RIPROVA-MODIFICA-RAMI-2026-10-24.md`, OK della CLI su K1 e del Mobile su R1).
 *   K1 — il punto del taglio (`forkPrimaDelGiro`) resta scritto: intestazione, ripristino, elenco, esportazione. Assente, mai null,
 *        per il ramo dell'intera conversazione (richiesta della CLI).
 *   H1 — `POST /sessions/:id/fork` accetta `{ primaDelGiro }`; senza corpo risponde come sempre.
 *   R1 — `session.fork` del dispositivo con `primaDelGiro` facoltativo, la forma giudicata PRIMA del consenso.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { puntoDelRamo } from '../src/punto-del-ramo.mjs';
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SYS = { role: 'system', content: 's' };
const u = (t) => ({ role: 'user', content: t });
const a = (t) => ({ role: 'assistant', content: t });
const fine = (runId) => ({ type: 'RunFinished', threadId: 't', runId });
const STORIA_3 = [SYS, u('c'), a('r1'), u('domanda 2'), a('r2'), u('domanda 3'), a('r3')];

function registroAGiri(cartellaStore) {
  const giri = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    avviaSessioneFn: (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      const n = giri.length + 1;
      giri.push({ input, concludi: (messaggiFinali) => { input.onEvento(fine(`r${n}`)); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali } }); } });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${n}`, input: input.task });
      return attesa;
    },
  });
  return { registro, giri };
}
const passo = () => new Promise((r) => setImmediate(r));
async function treGiri(registro, giri) {
  const { sessionId } = registro.avvia('task-vero');
  giri[0].concludi(STORIA_3.slice(0, 3)); await passo();
  registro.resume(sessionId, 'domanda 2'); giri[1].concludi(STORIA_3.slice(0, 5)); await passo();
  registro.resume(sessionId, 'domanda 3'); giri[2].concludi(STORIA_3); await passo();
  return sessionId;
}
async function conStore(t, corpo) {
  const cartellaStore = cartellaDiProva('talos-rami-');
  t.after(async () => { await attendiScritture({ cartellaStore }).catch(() => {}); rimuoviCartellaDiProva(cartellaStore); });
  return corpo(cartellaStore);
}
const riga = (registro, id) => registro.elenca().find((r) => r.sessionId === id);

test('RAMI-K1 il punto del ramo resta: elenco, esportazione, una ripresa del ramo e un riavvio; il ramo intero non porta il campo', async (t) => conStore(t, async (cartellaStore) => {
  const primo = registroAGiri(cartellaStore);
  const origine = await treGiri(primo.registro, primo.giri);
  const ramo = primo.registro.forka(origine, { primaDelGiro: 'r2' });
  assert.equal(ramo.code, undefined, ramo.erroreAvvio);
  assert.deepEqual([riga(primo.registro, ramo.sessionId).forkDa, riga(primo.registro, ramo.sessionId).forkPrimaDelGiro], [origine, 'r2']);
  assert.equal(primo.registro.esporta(ramo.sessionId).forkPrimaDelGiro, 'r2');
  /* «Modifica e rimanda»: il messaggio nuovo parte nel ramo, e il ramo resta un ramo di quel punto */
  primo.registro.resume(ramo.sessionId, 'domanda 2, riscritta');
  primo.giri[3].concludi([...STORIA_3.slice(0, 3), u('domanda 2, riscritta'), a('r2 bis')]); await passo();
  assert.equal(riga(primo.registro, ramo.sessionId).forkPrimaDelGiro, 'r2');
  /* il ramo dell'intera conversazione: il campo NON c'è (né null né stringa vuota) */
  const intero = primo.registro.forka(origine);
  assert.equal(Object.hasOwn(riga(primo.registro, intero.sessionId), 'forkPrimaDelGiro'), false);
  /* RA4-M1 (revisione a blocco 4, 24/10 sera): ASSENTE su ogni uscita, non solo nell'elenco — l'esportazione e l'intestazione sul
     disco, la prima riga del file della sessione. Il ramo «da un punto», al contrario, lo porta in tutte e due. */
  assert.equal(Object.hasOwn(primo.registro.esporta(intero.sessionId), 'forkPrimaDelGiro'), false);
  await attendiScritture({ cartellaStore });
  const intestazione = (id) => JSON.parse(readFileSync(join(cartellaStore, `${id}.jsonl`), 'utf8').split('\n')[0]);
  assert.equal(intestazione(intero.sessionId).tipo, 'intestazione');
  assert.equal(Object.hasOwn(intestazione(intero.sessionId), 'forkPrimaDelGiro'), false);
  assert.equal(intestazione(ramo.sessionId).forkPrimaDelGiro, 'r2');
  primo.giri[4].concludi(STORIA_3); await passo();
  assert.equal(Object.hasOwn(riga(primo.registro, origine), 'forkPrimaDelGiro'), false, 'la sorgente non è un ramo');
  /* dopo un riavvio, dall'intestazione */
  await attendiScritture({ cartellaStore });
  const riavvio = registroAGiri(cartellaStore);
  await riavvio.registro.ripristina();
  assert.equal(riga(riavvio.registro, ramo.sessionId).forkPrimaDelGiro, 'r2');
  assert.equal(Object.hasOwn(riga(riavvio.registro, intero.sessionId), 'forkPrimaDelGiro'), false);
}));

test('RAMI-K1-GRAMMATICA il punto è un id di giro e nient\'altro', () => {
  for (const buono of ['r2', 'run_3', 'a1b2-c3:d4.e5']) assert.equal(puntoDelRamo(buono), true, buono);
  for (const cattivo of [null, undefined, '', '..', '../x', 'a/b', 'a b', 7, {}, 'x'.repeat(201)]) assert.equal(puntoDelRamo(cattivo), false, String(cattivo));
});

/* ------------------------------------------------------------------------------------------------------------------------ */
function rottaFinta(forka) {
  const chiamate = [];
  const sessionRegistry = { forka: (...args) => { chiamate.push(args); return forka(...args); }, esiste: () => true };
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const pc = (corpo) => chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/fork', corpo, origine: 'pc' });
  return { chiamate, pc };
}

test('RAMI-H1 la rotta del PC: senza corpo come sempre; col punto, il taglio e chi è il padre; immagini senza percorsi del PC', async () => {
  const r = rottaFinta((id, opzioni) => (opzioni
    ? { sessionId: 'ramo-1', taglio: { primaDelGiro: opzioni.primaDelGiro, messaggio: 'guarda', allegati: [{ id: 'img1', nome: 'a.png', tipo: 'image/png', url: '/api/v1/chat-images/abc', percorso: 'C:\\Users\\x\\a.png' }] } }
    : { sessionId: 'ramo-0' }));
  assert.deepEqual((await r.pc()).dati, { sessionId: 'ramo-0' });
  assert.deepEqual(r.chiamate.at(-1), ['s-1'], 'senza corpo `forka` riceve solo l\'id, come prima');
  const { dati } = await r.pc({ primaDelGiro: 'r2' });
  assert.deepEqual(r.chiamate.at(-1), ['s-1', { primaDelGiro: 'r2' }]);
  assert.deepEqual(dati, { sessionId: 'ramo-1', forkDa: 's-1', forkPrimaDelGiro: 'r2',
    taglio: { primaDelGiro: 'r2', messaggio: 'guarda', allegati: [{ id: 'img1', nome: 'a.png', url: '/api/v1/chat-images/abc', tipo: 'image/png' }] } });
  assert.equal(JSON.stringify(dati).includes('Users'), false);
});

test('RAMI-H1-RIFIUTI corpo storto ⇒ 400 senza toccare il registro; punto non trovato o compattato ⇒ 409 col motivo', async () => {
  const r = rottaFinta(() => ({ sessionId: 'mai' }));
  for (const corpo of [{ primaDelGiro: '../x' }, { primaDelGiro: 7 }, { primaDelGiro: '' }, { altro: 1 }, { primaDelGiro: 'r2', altro: 1 }, [1]]) {
    await assert.rejects(r.pc(corpo), (e) => e.code === 'QUERY_INVALID' && e.stato === 400, JSON.stringify(corpo));
  }
  assert.equal(r.chiamate.length, 0, '⛔ un corpo storto non arriva mai al registro');
  for (const [code, reason] of [['FORK_POINT_NOT_FOUND', 'fork-point-not-found'], ['FORK_POINT_COMPACTED', 'fork-point-compacted']]) {
    const k = rottaFinta(() => ({ erroreAvvio: 'no', code, reason, motivo: 'x' }));
    await assert.rejects(k.pc({ primaDelGiro: 'r2' }), (e) => e.code === 'SESSION_NOT_READY' && e.stato === 409, code);
  }
});

/* ------------------------------------------------------------------------------------------------------------------------ */
test('RAMI-R1 dal dispositivo: un punto storto si ferma prima del consenso; col consenso il punto arriva al registro', async () => {
  const radice = cartellaDiProva('talos-rami-remoto-');
  const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return realpathSync(p); };
  const avm = crea('progetti', 'AVM'); const dati = crea('dati');
  const chiamate = [];
  const sessionRegistry = {
    cartellePiuUsate: () => [{ percorso: avm, conteggio: 1, ultimaVolta: '2026-10-24T10:00:00.000Z' }],
    elenca: () => [{ sessionId: 's-1' }], esiste: (id) => id === 's-1',
    async cartellaPerChatFile(id) { return id === 's-1' ? { ok: true, cartella: avm } : { code: 'NOT_FOUND' }; },
    forka: (...args) => { chiamate.push(args); return args[1] ? { sessionId: 'ramo', taglio: { primaDelGiro: args[1].primaDelGiro, messaggio: 'm' } } : { sessionId: 'intero' }; },
  };
  const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto'),
    sessionRegistry, cartelleAmmesse: [], cartelleEscluse: [dati] });
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry, remotoFn: () => ({ cartelle }) });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle });
  const contesto = { dispositivo: { id: 'dispositivo-A1', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  for (const primaDelGiro of ['../x', 7, 'a/b']) {
    await assert.rejects(operazioni.esegui('session.fork', { sessionId: 's-1', primaDelGiro }, contesto), { code: 'BAD_MESSAGE' }, String(primaDelGiro));
  }
  await assert.rejects(operazioni.esegui('session.fork', { sessionId: 's-1', primaDelGiro: 'r2' }, contesto), (e) => e.code === 'CONSENT_REQUIRED');
  assert.equal(chiamate.length, 0);
  await chiama({ metodo: 'POST', percorso: '/api/v1/remote/phones/dispositivo-A1/folders', corpo: { percorso: avm }, origine: 'pc' });
  const r = await operazioni.esegui('session.fork', { sessionId: 's-1', primaDelGiro: 'r2' }, contesto);
  assert.deepEqual([r.sessionId, r.forkDa, r.forkPrimaDelGiro, r.taglio?.messaggio], ['ramo', 's-1', 'r2', 'm']);
  assert.deepEqual(chiamate.at(-1), ['s-1', { primaDelGiro: 'r2' }]);
  assert.deepEqual(await operazioni.esegui('session.fork', { sessionId: 's-1' }, contesto), { sessionId: 'intero' }, 'senza punto: come prima');
  assert.deepEqual(chiamate.at(-1), ['s-1']);
  rimuoviCartellaDiProva(radice);
});
