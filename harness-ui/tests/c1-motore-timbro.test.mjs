/*
 * C1 (owner 09/10/2026 sera): «solo le conversazioni nuove» passano al Context Engine. Il motore si decide alla NASCITA e si
 * TIMBRA sulla conversazione (`motoreContesto` nella voce e nell'intestazione del giornale): cambiare l'interruttore dopo non
 * sposta le conversazioni già nate; una conversazione senza timbro (nata prima) resta col legacy; un ramo (`forkDa`) porta la
 * storia del padre e quindi anche il suo motore.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const createSessionRegistry = (opzioni) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function finta() {
  const aperte = [];
  return {
    avviaSessioneFn: (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise((risolvi) => aperte.push({ input, risolvi })); },
    concludiTutte() { for (const a of aperte.splice(0)) { a.input.onEvento({ type: 'RunFinished' }); a.risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } }); } },
  };
}
const intestazione = (cartella, id) => JSON.parse(readFileSync(join(cartella, `${id}.jsonl`), 'utf8').split('\n')[0]);

test('C1-TIMBRO-01: a new conversation is stamped with the engine of the moment; switching later does not move it', async () => {
  const cartellaStore = cartellaDiProva('talos-c1-timbro-');
  let motore = 'engine';
  const f = finta();
  try {
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: f.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', motoreContestoPerNuoveFn: () => motore });
    const { sessionId: a } = registro.avvia('task-vero');
    motore = 'legacy';
    const { sessionId: b } = registro.avvia('task-vero');
    assert.equal(registro.leggiSessioneContesto(a).motoreContesto, 'engine');
    assert.equal(registro.leggiSessioneContesto(b).motoreContesto, 'legacy');
    f.concludiTutte();
    await attendiScritture({ cartellaStore, sessionId: a }); await attendiScritture({ cartellaStore, sessionId: b });
    assert.equal(intestazione(cartellaStore, a).motoreContesto, 'engine', 'on the journal header');
    // un registro NUOVO (riavvio): il timbro torna dal giornale
    const riavvio = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta().avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', motoreContestoPerNuoveFn: () => 'legacy' });
    await riavvio.ripristina();
    assert.equal(riavvio.leggiSessioneContesto(a).motoreContesto, 'engine', 'the stamp survives a restart and ignores today\'s switch');
    assert.equal(riavvio.leggiSessioneContesto(b).motoreContesto, 'legacy');
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('C1-TIMBRO-02: without the switch function (old wiring) nothing is stamped: the conversation stays legacy', () => {
  const f = finta();
  const registro = createSessionRegistry({ avviaSessioneFn: f.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');
  assert.equal(registro.leggiSessioneContesto(sessionId).motoreContesto, null);
  f.concludiTutte();
});

test('C1-TIMBRO-03: a switch function that throws or answers nonsense stamps nothing (legacy), never the engine by accident', () => {
  for (const fn of [() => { throw new Error('rotto'); }, () => 'turbo']) {
    const f = finta();
    const registro = createSessionRegistry({ avviaSessioneFn: f.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', motoreContestoPerNuoveFn: fn });
    const { sessionId } = registro.avvia('task-vero');
    assert.equal(registro.leggiSessioneContesto(sessionId).motoreContesto, null);
    f.concludiTutte();
  }
});

test('C1-TIMBRO-04: a session resumed keeps its stamp (a resume is not a birth)', () => {
  let motore = 'engine';
  const f = finta();
  const registro = createSessionRegistry({ avviaSessioneFn: f.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', motoreContestoPerNuoveFn: () => motore });
  const { sessionId } = registro.avvia('task-vero');
  f.concludiTutte();
  motore = 'legacy';
  registro.resume(sessionId, 'seconda domanda');
  assert.equal(registro.leggiSessioneContesto(sessionId).motoreContesto, 'engine');
  f.concludiTutte();
  void existsSync;
});
