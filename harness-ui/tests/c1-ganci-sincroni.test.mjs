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
