/*
 * ⛔⛔⛔ F-014 (audit ZIP revisione, 28/09/2026; piano 0.1.19 §1.6) — l'output INTEGRALE di OGNI
 * nodo concluso nel CAS, e la strada per arrivarci.
 *
 * Il fatto nuovo che la ZIP misurava: il modello vedeva monconi. Lo snapshot ai passi dipendenti
 * era tagliato (il `summary` del ref, e il taglio dichiarato); la Board mostra anteprime; e NESSUN
 * attrezzo o rotta dava l'integrale. La cura: il ref c'è sempre stato (F3-32: OGNI nodo concluso
 * deposita l'output nel CAS con sha256, già provato in `workflow-orchestrator.test.mjs`), ora
 * (a) il DETTAGLIO del nodo di un run porta `outputs` con anteprima ≤ NODE_OUTPUT_PREVIEW_MAX
 * (2000) e `truncated` dichiarato; (b) la FRASE dello snapshot del dipendente nomina la strada:
 * «read the full result … with workflow_output(runId, nodeId)»; (c) la ROTTA
 * `GET .../nodes/:nodeId/output` serve i byte VERIFICATI dal CAS (sha256 ricontata alla lettura),
 * di default TUTTI (§3.4: il Board non pagina a schermo); (d) l'attrezzo `workflow_output` del
 * kernel (§1.5) li legge paginati col taglio dichiarato.
 *
 * ⛔ Le prove qui sono END-TO-END sul NEGOZIO VERO (store + CAS + orchestratore, il pattern di
 * `workflow-orchestrator.test.mjs`): l'adattatore finto conclude un passo con 5.000 caratteri, e
 * tutto il resto si misura da lì — nessun doppione del result-store.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import {
  approveDefinition, appendEvent, createDefinition, createRun, createWorkflowStore, readRunState,
} from '../src/workflow/store.mjs';
import { projectWorkflowNodeDetail } from '../src/workflow/read-model.mjs';
import { NODE_OUTPUT_PREVIEW_MAX } from '../src/workflow/read-model.mjs';
import { creaOnWorkflowFn } from '../src/workflow/per-il-modello.mjs';
import { consegnaDelPasso } from '../src/workflow/adapters/agent-session.mjs';
import { predecessorResults } from '../src/workflow/activity-runner.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const definitionRecord = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));
const ROOT_SESSION_ID = '40000000-0000-4000-8000-000000000001';
const ALTRO_SESSION_ID = '40000000-0000-4000-8000-000000000009';

function event(runId, seq, type, payload = {}, overrides = {}) {
  return {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: randomUUID(), runId, seq, at: `2026-09-28T13:00:${String(seq).padStart(2, '0')}.000Z`, type,
    nodeId: null, commandId: null, commandType: null, commandPayloadHash: null,
    causationId: null, correlationId: runId, graphVersion: 1,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null, payload, ...overrides,
  };
}

function runCreated(runId) {
  return event(runId, 1, 'run_created', {
    workflowId: definitionRecord.workflowId, definitionVersion: definitionRecord.version,
    definitionHash: definitionRecord.definitionHash, rootSessionId: ROOT_SESSION_ID,
    workspaceBaselineId: null, workspaceBaselineHash: null,
  }, { commandId: randomUUID(), commandType: 'start-run', commandPayloadHash: `sha256:${'d'.repeat(64)}` });
}

/** Il pezzo lungo: 5.000 caratteri distinti, così le pagine si vedono. */
const LUNGO = Array.from({ length: 5000 }, (_, i) => String.fromCharCode(65 + (i % 26))).join('');

async function negozioConOutput(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-f014-output-'));
  const store = await createWorkflowStore({
    workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 },
  });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  await createDefinition(store, { record: definitionRecord });
  await approveDefinition(store, { approval });
  const runId = randomUUID();
  await createRun(store, { event: runCreated(runId) });
  await appendEvent(store, { event: event(runId, 2, 'run_started') });
  const orchestrator = createWorkflowOrchestrator({
    store,
    adapters: new Map([['agent-session', {
      id: 'agent-integration-adapter',
      async execute() {
        return {
          status: 'completed', receiptRef: `receipt://result/${randomUUID()}`,
          results: [{
            kind: 'text', contentType: 'text/plain; charset=utf-8', bytes: Buffer.from(LUNGO, 'utf8'),
            summary: LUNGO.slice(0, 4096), trust: 'untrusted', sensitivity: 'workspace', eligibleForIntegration: false,
            provenance: { workspaceBaselineHash: null, inputHash: `sha256:${'e'.repeat(64)}`, model: null, provider: null, toolVersions: {} },
          }],
        };
      },
      async reconcile() { return { outcome: 'still_unknown', receiptRef: null, resultIds: [] }; },
      async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; },
    }]]),
    nowFn: () => '2026-09-28T13:10:00.000Z', idFn: randomUUID,
  });
  await orchestrator.recover({ runIds: [runId] });
  const eseguito = await orchestrator.executeNode({
    runId, nodeId: 'implement', activityKind: 'agent-session', resourceClass: 'agent',
    idempotencyKey: `${runId}/implement/1`, budgetReservationId: null, deadlineAt: null,
  });
  assert.equal(eseguito.status, 'completed', `il passo deve concludere: ${JSON.stringify(eseguito).slice(0, 200)}`);
  assert.ok((eseguito.resultIds ?? []).length >= 1, 'con il suo risultato depositato nel giornale');
  return { store, runId, root };
}

/* ───────────────── il dettaglio del nodo: l'anteprima ≤2000 col ref e il taglio detto ───────────────── */

test('⭐⭐⭐ F-014-01 — il dettaglio del passo concluso porta `outputs`: ref, anteprima ≤2000, truncated', async (t) => {
  const { store, runId } = await negozioConOutput(t);
  const input = await readRunState(store, { runId });
  const detail = projectWorkflowNodeDetail(input, { nodeId: 'implement' });
  assert.equal(detail.outputs.length, 1, 'un risultato depositato, uno dichiarato');
  const [output] = detail.outputs;
  assert.match(output.sha256, /^sha256:[0-9a-f]{64}$/u, 'il ref è l\'impronta del CAS');
  assert.ok([...output.preview].length <= NODE_OUTPUT_PREVIEW_MAX, `l'anteprima è al più ${NODE_OUTPUT_PREVIEW_MAX} caratteri, non il summary da 4096`);
  assert.equal(output.truncated, true, '5.000 byte contro 4.096 di summary: il taglio si DICE');
  assert.equal(output.bytes, 5000);
})

test('⛔ F-014-02, AL CONTRARIO — un passo SENZA risultati non inventa outputs', () => {
  const detail = projectWorkflowNodeDetail({
    state: {
      run: { runId: 'r', status: 'running', graphVersion: 1 },
      definition: { nodes: [{ id: 'n', kind: 'agent', label: 'N', priority: 1 }], edges: [] },
      nodes: new Map([['n', { nodeId: 'n', state: 'running', resultRefIds: [], attempt: 0 }]]),
      resultRefs: new Map(), lastSeq: 1,
    },
    events: [],
  }, { nodeId: 'n' });
  assert.deepEqual(detail.outputs, [], 'nessun ref, nessuna riga: vuoto onesto')
  assert.deepEqual(detail.resultRefIds, [])
})

/* ─────────── l'attrezzo del kernel legge l'INTEGRALE dal CAS, paginato e col taglio detto ─────────── */

test('⭐⭐⭐ F-014-03 — `workflow_output` attraverso il canale vero: byte del CAS, paginati, taglio dichiarato', async (t) => {
  const { store, runId } = await negozioConOutput(t);
  const onWorkflowFn = creaOnWorkflowFn({ store, runtimeFn: () => null });
  const prima = await onWorkflowFn('workflow_output', { runId, nodeId: 'implement', offset: 0, limit: 100 }, { rootSessionId: ROOT_SESSION_ID });
  assert.ok(prima.includes(LUNGO.slice(0, 100)), 'i primi 100 caratteri SONO i byte del CAS, non un riassunto');
  assert.match(prima, /showing 100 of 5000 characters, from offset 0/, 'la testata dichiara la finestra e il totale');
  assert.match(prima, /and 4900 more characters/, 'il resto si dichiara, alla maniera di cerca');
  const fondo = await onWorkflowFn('workflow_output', { runId, nodeId: 'implement', offset: 4900 }, { rootSessionId: ROOT_SESSION_ID });
  assert.ok(fondo.includes(LUNGO.slice(4900)), 'senza limit serve TUTTO il resto');
})

test('⛔ F-014-04, AL CONTRARIO — un run di UN\'ALTRA sessione non si legge da qui', async (t) => {
  const { store, runId } = await negozioConOutput(t);
  const onWorkflowFn = creaOnWorkflowFn({ store, runtimeFn: () => null });
  await assert.rejects(
    () => onWorkflowFn('workflow_output', { runId, nodeId: 'implement' }, { rootSessionId: ALTRO_SESSION_ID }),
    /not found in this session/u,
    'la stessa guardia delle rotte: rootSessionId di run_created',
  )
})

test('⛔ F-014-05, AL CONTRARIO — un passo senza output dice che non c\'è, non che è vuoto', async (t) => {
  const { store, runId } = await negozioConOutput(t);
  const onWorkflowFn = creaOnWorkflowFn({ store, runtimeFn: () => null });
  const risposta = await onWorkflowFn('workflow_output', { runId, nodeId: 'implement' }, { rootSessionId: ROOT_SESSION_ID })
  assert.ok(!/no recorded output/.test(risposta), 'il passo implement HA un output: non deve dirsi vuoto')
})

/* ─────────────────────── la ROTTA per la Board: i byte chiesti, il totale detto ─────────────────────── */

async function app(t, store) {
  const registry = { leggiSessioneContesto: (id) => [ROOT_SESSION_ID, ALTRO_SESSION_ID].includes(id) ? { sessionId: id } : null };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry, workflowStore: store }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('⭐⭐⭐ F-014-06 — la rotta `.../nodes/:id/output` serve l\'integrale e il totale lo dichiara', async (t) => {
  const { store, runId } = await negozioConOutput(t);
  const base = await app(t, store);
  const integrale = await fetch(`${base}/api/v1/sessions/${ROOT_SESSION_ID}/workflows/${runId}/nodes/implement/output`);
  assert.equal(integrale.status, 200);
  const corpo = await integrale.json();
  assert.equal(corpo.data.totalCharacters, 5000, 'il totale dei caratteri, detto');
  assert.equal(corpo.data.content, LUNGO, 'SENZA parametri serve TUTTO (§3.4: il Board non pagina)');
  assert.equal(corpo.data.shownCharacters, 5000);
  const pagina = await fetch(`${base}/api/v1/sessions/${ROOT_SESSION_ID}/workflows/${runId}/nodes/implement/output?offset=100&limit=50`);
  const corpoPagina = await pagina.json();
  assert.equal(corpoPagina.data.content, LUNGO.slice(100, 150), 'la finestra chiesta, byte per byte');
  assert.equal(corpoPagina.data.totalCharacters, 5000, 'e il totale dichiarato anche a pagina aperta');
  const foresto = await fetch(`${base}/api/v1/sessions/${ALTRO_SESSION_ID}/workflows/${runId}/nodes/implement/output`);
  assert.equal(foresto.status, 404, 'il run di un\'altra sessione non esiste da qui');
  const senza = await fetch(`${base}/api/v1/sessions/${ROOT_SESSION_ID}/workflows/${runId}/nodes/passo-senza-output/output`);
  assert.equal(senza.status, 404, 'un passo senza output: 404, non un contenuto vuoto spacciato per integrale');
})

/* ─────────────────────── lo SNAPSHOT del dipendente: il ref e la FRASE della strada ─────────────────────── */

test('⭐⭐⭐ F-014-07 — `consegnaDelPasso` col moncone dice la STRADA: workflow_output(runId, nodeId)', () => {
  const testo = consegnaDelPasso({ instructions: 'Riassumi.' }, {
    items: [{
      nodeId: 'analisi', label: 'Analisi', state: 'succeeded', completedAt: '2026-09-28T10:00:00.000Z',
      results: [{ resultId: 'r1', sha256: `sha256:${'a'.repeat(64)}`, summary: 'MONCONE', bytes: 9000, truncated: true }],
    }], omitted: 0,
  }, { runId: 'il-run' });
  assert.match(testo, /\[truncated: the full result is 9000 bytes — read it with workflow_output\("il-run", "analisi"\)\]/u,
    'la FRASE del piano §1.6: il modello ha la strada, non solo il moncone');
})

test('⛔ F-014-08, AL CONTRARIO — senza runId la riga resta QUELLA DI SEMPRE (prove e contesti vecchi)', () => {
  const testo = consegnaDelPasso({ instructions: 'Riassumi.' }, {
    items: [{
      nodeId: 'analisi', label: 'Analisi', state: 'succeeded', completedAt: null,
      results: [{ resultId: 'r1', sha256: `sha256:${'a'.repeat(64)}`, summary: 'MONCONE', bytes: 9000, truncated: true }],
    }], omitted: 0,
  });
  assert.match(testo, /\[truncated: the full result is 9000 bytes\]$/mu, 'byte per byte la forma di prima: nessun chiamante si rompe')
})

test('⭐ F-014-09 — `predecessorResults` porta il `sha256` di ogni risultato: il ref viaggia nello snapshot', () => {
  const sha = `sha256:${'b'.repeat(64)}`;
  const istantanee = predecessorResults({
    definition: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'e1', from: 'a', to: 'b', type: 'control' }] },
    state: {
      run: { runId: 'r' },
      nodes: new Map([['a', { nodeId: 'a', state: 'succeeded', resultRefIds: ['ref-1'] }]]),
      resultRefs: new Map([['ref-1', { id: 'ref-1', sha256: sha, summary: 'S', bytes: 10 }]]),
    },
    events: [],
  }, 'b');
  const [item] = istantanee.items;
  assert.equal(item.results[0].sha256, sha, 'il figlio vede non solo il moncone ma QUALE integrale chiedere');
})
