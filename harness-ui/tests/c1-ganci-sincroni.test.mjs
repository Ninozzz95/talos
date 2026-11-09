/*
 * C1, review Y1 (bugfixer, 10/10/2026): col motore di serie `server.mjs` passa SEMPRE `contextHooksFn`, e ogni giro, anche delle
 * conversazioni legacy, partiva dopo un passo asincrono (`await contextHooksFn`). Il contratto del registro è un altro:
 * `RunStarted` nel buffer — cioè `avviaSessioneFn` già chiamata — al ritorno di `avvia`/`avviaESegui` (righe 2385/2527/5976/6114,
 * «un tick = 148 test, un await = 213»). A/B del bugfixer su 94 file con i ganci di produzione: 9 → 615 rossi.
 * ⇒ Qui il registro si compone COME `server.mjs`: `contextHooksFn` presente, `giroUsaIlMotoreFn: giroUsaIlMotore(...)`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { giroUsaIlMotore } from '../src/impostazioni-contesto.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

const createSessionRegistry = (opzioni) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}

/** Il registro di produzione: i ganci ci sono sempre (default `async () => undefined`, cioè «non mio»), il predicato pure. */
function composizioneDiProduzione({ motore, trialSessionIds = null, predicato = giroUsaIlMotore({ trialSessionIds }) }) {
  const chiamate = { avvii: [], ganci: [] };
  const aperte = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: (input) => {
      chiamate.avvii.push(input);
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
      return new Promise((risolvi) => aperte.push({ input, risolvi }));
    },
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
    motoreContestoPerNuoveFn: () => motore,
    contextHooksFn: async (input) => { chiamate.ganci.push(input.sessionId); return undefined; },
    giroUsaIlMotoreFn: predicato,
  });
  const concludi = () => { for (const a of aperte.splice(0)) { a.input.onEvento({ type: 'RunFinished' }); a.risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } }); } };
  return { registro, chiamate, concludi };
}

test('C1-GANCI-01: a LEGACY conversation starts synchronously, as before C1: the kernel is called before avvia returns, no hooks', async () => {
  const { registro, chiamate, concludi } = composizioneDiProduzione({ motore: 'legacy' });
  const { sessionId } = registro.avvia('task-vero');
  assert.equal(chiamate.avvii.length, 1, 'avviaSessioneFn already called when avvia returns (RunStarted in the buffer)');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(chiamate.ganci, [], 'the engine hooks are never asked for a legacy conversation');
  assert.equal(registro.leggiSessioneContesto(sessionId).motoreContesto, 'legacy');
  concludi();
});

test('C1-GANCI-02: a conversation born before C1 (no stamp) is legacy too: synchronous, no hooks', async () => {
  const { registro, chiamate, concludi } = composizioneDiProduzione({ motore: null });
  registro.avvia('task-vero');
  assert.equal(chiamate.avvii.length, 1);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(chiamate.ganci, []);
  concludi();
});

test('C1-GANCI-03: an ENGINE conversation does ask the hooks, then starts the kernel', async () => {
  const { registro, chiamate, concludi } = composizioneDiProduzione({ motore: 'engine' });
  const { sessionId } = registro.avvia('task-vero');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(chiamate.ganci, [sessionId]);
  assert.equal(chiamate.avvii.length, 1);
  concludi();
});

test('C1-GANCI-04: with the trial list only the listed conversations use the hooks, whatever their stamp', async () => {
  const { registro, chiamate, concludi } = composizioneDiProduzione({ motore: 'engine', trialSessionIds: ['nessuna-di-queste'] });
  registro.avvia('task-vero');
  assert.equal(chiamate.avvii.length, 1, 'not in the list: synchronous');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(chiamate.ganci, []);
  concludi();
});

test('C1-GANCI-05: a predicate that throws means legacy (synchronous), never the engine by accident', async () => {
  const { registro, chiamate, concludi } = composizioneDiProduzione({ motore: 'engine', predicato: () => { throw new Error('rotto'); } });
  registro.avvia('task-vero');
  assert.equal(chiamate.avvii.length, 1);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(chiamate.ganci, []);
  concludi();
});

/* Revisione di fine fase della compattazione (01/11/2026, D2): `contextHooksFn` che lancia (archivio che non si apre) fermava il giro prima del kernel. */
function ganciRotti(comportamento) {
  const avvii = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => { avvii.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); input.onEvento({ type: 'RunFinished' }); return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'r' }] } }; },
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', motoreContestoPerNuoveFn: () => 'engine', giroUsaIlMotoreFn: giroUsaIlMotore({}),
    contextHooksFn: comportamento,
  });
  return { registro, avvii };
}
const passa = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const righeDelRipiego = (eventi) => eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value?.motivo === 'ripiego');
const archivioRotto = (code) => Object.assign(new Error('The context archive is not available.'), { code });

test('C1-GANCI-07: hooks that throw do not stop the turn: the kernel starts without them, and the fallback line says so once, inside the turn', async () => {
  const stato = { rotto: true };
  const { registro, avvii } = ganciRotti(async () => { if (stato.rotto) throw archivioRotto('CTX_LEGACY_CORRUPT'); return undefined; });
  const { sessionId } = registro.avvia('task-vero');
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  await passa();
  assert.equal(avvii.length, 1, 'the kernel started');
  assert.equal(Object.hasOwn(avvii[0], 'contextHooks'), false, 'without the hooks: the simple compaction');
  const prima = righeDelRipiego(ricevuti);
  assert.equal(prima.length, 1);
  assert.deepEqual({ fase: prima[0].value.fase, compattato: prima[0].value.compattato, ragione: prima[0].value.ragione, codice: prima[0].value.codice }, { fase: 'fine', compattato: false, ragione: 'rifiutato', codice: 'CTX_LEGACY_CORRUPT' });
  /* revisione del blocco 25, R3: chi SA che il motore non è partito lo dice in un campo suo; la riga si decide su quello, mai su `giro === 0` */
  assert.equal(prima[0].value.motoreNonPartito, true);
  assert.ok(ricevuti.indexOf(prima[0]) > ricevuti.findIndex((e) => e.type === 'RunStarted'), 'the line belongs to the turn it talks about');
  /* lo stesso guasto non si ripete; guariti i ganci, un guasto dopo si dice di nuovo */
  registro.resume(sessionId, 'ancora'); await passa();
  assert.equal(righeDelRipiego(ricevuti).length, 1, 'same failure, same line');
  stato.rotto = false;
  registro.resume(sessionId, 'ancora'); await passa();
  stato.rotto = true;
  registro.resume(sessionId, 'ancora'); await passa();
  assert.equal(avvii.length, 4);
  assert.equal(righeDelRipiego(ricevuti).length, 2, 'healed, then broken again: said again');
});

test('C1-GANCI-08: a different failure has its own line; an error with no code is still a line', async () => {
  const errori = [archivioRotto('CTX_LEGACY_CORRUPT'), archivioRotto('CTX_STORE_CLOSED'), new Error('senza codice')];
  const { registro } = ganciRotti(async () => { throw errori.shift(); });
  const { sessionId } = registro.avvia('task-vero');
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  await passa();
  registro.resume(sessionId, 'ancora'); await passa();
  registro.resume(sessionId, 'ancora'); await passa();
  assert.deepEqual(righeDelRipiego(ricevuti).map((e) => e.value.codice), ['CTX_LEGACY_CORRUPT', 'CTX_STORE_CLOSED', 'unknown']);
});

test('C1-GANCI-09: AL CONTRARIO: Stop while the hooks fail stays a Stop: no turn without the engine, no fallback line', async () => {
  let ferma = null;
  const { registro, avvii } = ganciRotti(async () => { ferma(); throw archivioRotto('CTX_LEGACY_CORRUPT'); });
  const { sessionId } = registro.avvia('task-vero');
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  ferma = () => registro.ferma(sessionId);
  await passa();
  assert.equal(avvii.length, 0, 'the kernel does not start after a Stop');
  assert.equal(righeDelRipiego(ricevuti).length, 0);
});

test('C1-GANCI-06: giroUsaIlMotore is the same rule as the runtime: stamp by default, list in the trial', () => {
  const diSerie = giroUsaIlMotore();
  assert.equal(diSerie('a', { motoreContesto: 'engine' }), true);
  assert.equal(diSerie('a', { motoreContesto: 'legacy' }), false);
  assert.equal(diSerie('a', { motoreContesto: null }), false);
  assert.equal(diSerie('a', undefined), false);
  const trial = giroUsaIlMotore({ trialSessionIds: ['a'] });
  assert.equal(trial('a', { motoreContesto: null }), true);
  assert.equal(trial('b', { motoreContesto: 'engine' }), false);
});
