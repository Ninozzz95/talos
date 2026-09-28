/*
 * ⭐ I RUN SI ELIMINANO CON LA LORO SESSIONE — owner 26/09/2026 («debiti del Workflow prima della release»).
 *
 * Il debito: eliminata una conversazione, i suoi run restavano nel Workflow Store orfani e irraggiungibili (sul 4174 ce
 * ne sono, delle sessioni eliminate il 25/09). La cura: la rotta di eliminazione toglie i run FINITI della sessione
 * (`removeRun`), e un run ancora in corso blocca l'eliminazione PRIMA — mai una conversazione eliminata con un run vivo.
 * Store vero su disco, server HTTP vero.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { appendEvent, approveDefinition, createDefinition, createRun, createWorkflowStore, listRunsForSession, removeRun } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SESSIONE = '40000000-0000-4000-8000-000000000001';
const RUN = '10000000-0000-4000-8000-000000000001';
const definition = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));

function fatto(seq, type, payload = {}, extra = {}) {
  return {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: randomUUID(), runId: RUN, seq, at: `2026-09-26T10:00:0${seq}.000Z`, type,
    nodeId: null, commandId: null, commandType: null, commandPayloadHash: null, causationId: null, correlationId: RUN,
    graphVersion: 1, activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null, payload, ...extra,
  };
}

async function storeConUnRun(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-elimina-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  await createDefinition(store, { record: definition });
  await approveDefinition(store, { approval });
  await createRun(store, { event: fatto(1, 'run_created', {
    workflowId: definition.workflowId, definitionVersion: definition.version, definitionHash: definition.definitionHash,
    rootSessionId: SESSIONE, workspaceBaselineId: null, workspaceBaselineHash: null,
  }, { commandId: randomUUID(), commandType: 'start-run', commandPayloadHash: `sha256:${'c'.repeat(64)}` }) });
  return { store, root };
}

async function annulla(store) {
  await appendEvent(store, { event: fatto(2, 'run_started') });
  await appendEvent(store, { event: fatto(3, 'run_cancel_requested', { reason: 'user' }, { commandId: randomUUID(), commandType: 'cancel-run', commandPayloadHash: `sha256:${'d'.repeat(64)}` }) });
  await appendEvent(store, { event: fatto(4, 'run_cancelled', { reason: 'user' }) });
}

async function server(t, store) {
  const eliminate = [];
  const registry = {
    leggiSessioneContesto: (id) => (id === SESSIONE && !eliminate.includes(id) ? { sessionId: id } : null),
    elimina: async (id) => { eliminate.push(id); return { ok: true }; },
  };
  const srv = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry, workflowStore: store }));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => srv.close(resolve)));
  return { base: `http://127.0.0.1:${srv.address().port}`, eliminate };
}

test('WF-DELETE-BLOCKED-WHILE-RUNNING — AL CONTRARIO: un run non finito blocca l eliminazione PRIMA, e niente viene tolto', async (t) => {
  const { store } = await storeConUnRun(t);
  const { base, eliminate } = await server(t, store);
  const risposta = await fetch(`${base}/api/v1/sessions/${SESSIONE}/delete`, { method: 'POST' });
  assert.equal(risposta.status, 409);
  assert.equal((await risposta.json()).error.code, 'WORKFLOW_RUN_NOT_FINISHED');
  assert.deepEqual(eliminate, [], 'la conversazione non è stata eliminata');
  assert.deepEqual(await listRunsForSession(store, { rootSessionId: SESSIONE }), [RUN], 'il run è ancora lì');
  await assert.rejects(removeRun(store, { runId: RUN }), (e) => e.code === 'WORKFLOW_RUN_NOT_FINISHED');
});

test('WF-DELETE-TAKES-FINISHED-RUNS — eliminata la conversazione, il suo run finito se ne va: niente orfani, e la risposta lo conta', async (t) => {
  const { store, root } = await storeConUnRun(t);
  await annulla(store);
  const { base, eliminate } = await server(t, store);
  const risposta = await fetch(`${base}/api/v1/sessions/${SESSIONE}/delete`, { method: 'POST' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.data.workflowEliminati, 1);
  assert.deepEqual(corpo.data.workflowNonEliminati, []);
  assert.deepEqual(eliminate, [SESSIONE]);
  assert.deepEqual(await listRunsForSession(store, { rootSessionId: SESSIONE }), [], 'nessun run orfano resta nel registro');
  assert.equal(existsSync(join(root, 'runs', RUN)), false, 'la cartella del run non c è più');
  assert.equal(readdirSync(join(root, 'temp')).some((n) => n.includes(RUN)), false, 'e non resta parcheggiata nella cartella temporanea');
});
