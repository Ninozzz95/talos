/*
 * ⭐⭐ IL RIGIOCO DEL WORKFLOW È LINEARE, E DÀ LO STESSO STATO — owner 26/09/2026 («debiti del Workflow prima della release»).
 *
 * Il debito misurato il 26/09: `workflowReplay` piegava `workflowApply`, che copia lo stato INTERO a ogni fatto ⇒ 1.000 passi
 * = 52 s, e all'avvio lo Store rigioca ogni run. La cura (`run.mjs`, `applicaSulPosto`): il rigioco copia lo stato una volta
 * e applica i fatti sul posto, copiando il fatto invece dello stato. Qui si prova che è lo STESSO stato — impronta e storia
 * uguali alla piega di `workflowApply` — che il giornale in memoria non cambia, e che 1.000 passi stanno sotto un tetto.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import test from 'node:test';

import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import {
  workflowApply, workflowInitialState, workflowReplay, workflowReplayWithHistory, workflowStateChanges, workflowStateHash,
} from '../src/workflow/run.mjs';

const diamond = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-diamond.json', import.meta.url), 'utf8'));
const minimo = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));
const RUN = '10000000-0000-4000-8000-000000000001';

function evento(seq, type, payload = {}, overrides = {}) {
  return {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: `20000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    runId: RUN, seq, at: new Date(Date.UTC(2026, 8, 26, 9) + seq * 1000).toISOString(),
    type, nodeId: null, commandId: null, commandType: null, commandPayloadHash: null,
    causationId: null, correlationId: RUN, graphVersion: 1,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload, ...overrides,
  };
}
const comando = (n, tipo) => ({ commandId: `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`, commandType: tipo, commandPayloadHash: `sha256:${String(n % 10).repeat(64)}` });
const nato = (definition) => evento(1, 'run_created', {
  workflowId: '30000000-0000-4000-8000-000000000001', definitionVersion: 1, definitionHash: canonicalHash(definition),
  rootSessionId: '40000000-0000-4000-8000-000000000001', workspaceBaselineId: null, workspaceBaselineHash: null,
}, comando(1, 'start-run'));

/* Il rombo con pausa, ripresa e un fallimento (la stessa forma di `workflow-state-history.test.mjs`). */
const eventiDelRombo = () => [
  nato(diamond), evento(2, 'run_started'),
  evento(3, 'node_started', { trigger: 'deterministic' }, { nodeId: 'root' }),
  evento(4, 'node_succeeded', { resultIds: [] }, { nodeId: 'root' }),
  evento(5, 'run_pause_requested', { reason: 'user' }, comando(5, 'pause-run')),
  evento(6, 'run_paused', { reason: 'user' }),
  evento(7, 'run_resumed', { reason: 'user' }, comando(7, 'resume-run')),
  evento(8, 'node_started', { trigger: 'deterministic' }, { nodeId: 'left' }),
  evento(9, 'node_failed', { errorClass: 'internal', evidenceResultIds: [] }, { nodeId: 'left' }),
  evento(10, 'node_started', { trigger: 'deterministic' }, { nodeId: 'right' }),
  evento(11, 'node_succeeded', { resultIds: [] }, { nodeId: 'right' }),
];

/* Un albero a ventaglio 20 di `n` passi (la forma di `misura-storia.mjs`): il padre di i è (i-1)/20. */
function albero(n) {
  const d = structuredClone(minimo);
  const modello = minimo.nodes[0];
  d.nodes = Array.from({ length: n }, (_, i) => ({ ...structuredClone(modello), id: `passo-${i}` }));
  d.edges = Array.from({ length: n - 1 }, (_, k) => { const i = k + 1; return { id: `e-${i}`, from: `passo-${Math.floor((i - 1) / 20)}`, to: `passo-${i}`, type: 'control', condition: null, mapping: null }; });
  d.limits = { ...d.limits, maxLogicalNodes: n, maxEdges: n, maxAgentSessions: n };
  d.acceptance = [{ ...minimo.acceptance[0], source: { nodeId: 'passo-0', output: 'commit' }, evidenceKind: 'commit', predicate: { op: 'exists' } }];
  const events = [nato(d), evento(2, 'run_started')];
  let s = 3;
  /* Fallisce solo qualche FOGLIA (nessun figlio: 20·i + 1 ≥ n): un passo fallito blocca i suoi figli, e un giornale che li
     facesse partire lo stesso sarebbe rifiutato — giustamente — da entrambi i rigiochi. */
  const foglia = (i) => 20 * i + 1 >= n;
  for (let i = 0; i < n; i += 1) {
    const fallisce = foglia(i) && i % 7 === 3;
    events.push(evento(s++, 'node_started', { trigger: 'deterministic' }, { nodeId: `passo-${i}` }));
    events.push(evento(s++, fallisce ? 'node_failed' : 'node_succeeded', fallisce ? { errorClass: 'internal', evidenceResultIds: [] } : { resultIds: [] }, { nodeId: `passo-${i}` }));
  }
  return { definition: d, events };
}

function piegaDiRiferimento(definition, events) {
  let state = workflowInitialState({ definition, runId: RUN });
  const history = [];
  for (const event of events) {
    const next = workflowApply(state, event);
    history.push(...workflowStateChanges(state, next, event));
    state = next;
  }
  return { state, history };
}

function stessoRigioco(nome, definition, events) {
  const copiaDelGiornale = structuredClone(events);
  const riferimento = piegaDiRiferimento(definition, events);
  const lineare = workflowReplay({ definition, runId: RUN, events });
  const conStoria = workflowReplayWithHistory({ definition, runId: RUN, events });
  assert.equal(workflowStateHash(lineare), workflowStateHash(riferimento.state), `${nome}: stessa impronta dello stato`);
  assert.equal(workflowStateHash(conStoria.state), workflowStateHash(riferimento.state), `${nome}: stessa impronta anche con la storia`);
  assert.deepEqual(conStoria.history, riferimento.history, `${nome}: stessa storia pubblica degli stati`);
  assert.ok(isDeepStrictEqual(events, copiaDelGiornale), `${nome}: il giornale in memoria non è cambiato dal rigioco sul posto`);
  return riferimento;
}

test('WF-REPLAY-LINEAR-SAME-STATE — rombo con pausa, ripresa e fallimento: stessa impronta, stessa storia, giornale intatto', () => {
  const { history } = stessoRigioco('rombo', diamond, eventiDelRombo());
  assert.ok(history.length > 5, 'la storia ha davvero cambiamenti da confrontare');
});

test('WF-REPLAY-LINEAR-TREE — alberi da 20, 60 e 150 passi con fallimenti sparsi: stesso stato della piega di workflowApply', () => {
  for (const n of [20, 60, 150]) {
    const { definition, events } = albero(n);
    stessoRigioco(`albero ${n}`, definition, events);
  }
});

test('WF-REPLAY-LINEAR-DOES-NOT-TOUCH-INITIAL — lo stato iniziale passato da chi chiama non cambia (la definizione nemmeno)', () => {
  const iniziale = workflowInitialState({ definition: diamond, runId: RUN });
  const prima = workflowStateHash(iniziale);
  const definizionePrima = structuredClone(diamond);
  workflowReplay({ initialState: iniziale, definition: diamond, runId: RUN, events: eventiDelRombo() });
  assert.equal(workflowStateHash(iniziale), prima);
  assert.deepEqual(diamond, definizionePrima);
});

test('WF-REPLAY-LINEAR-1000-STEPS — 1.000 passi (2.002 fatti) si rigiocano sotto i 10 s: prima erano 52 s', () => {
  const { definition, events } = albero(1000);
  const inizio = performance.now();
  const { state, history } = workflowReplayWithHistory({ definition, runId: RUN, events });
  const ms = performance.now() - inizio;
  assert.equal(state.lastSeq, events.length);
  assert.ok(history.length > 1000);
  assert.ok(ms < 10_000, `rigioco di 1.000 passi in ${Math.round(ms)} ms`);
});
