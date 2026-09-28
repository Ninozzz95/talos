import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { createWorkflowStore, listRunIds, readDefinitionApproval } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sessionId = '82000000-0000-4000-8000-000000000001';
const coreV1 = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));
function phasedCore() {
  const core = structuredClone(coreV1);
  core.schema = 'talos.workflow-definition-core.v2'; core.definitionSchemaVersion = 2;
  core.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  core.nodes[0].phaseId = 'implementation'; core.nodes[1].phaseId = 'verification';
  return core;
}
async function setup(t, withStore = true) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-http-control-'));
  const store = withStore ? await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } }) : null;
  const registry = { leggiSessioneContesto: (id) => id === sessionId ? { sessionId: id } : null };
  const server = createServer(createHttpApp({ staticHandler: async () => null,
    sessionRegistry: registry, workflowStore: store, token: 'secret' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve));
    if (store) await store.close(); rimuoviCartellaDiProva(root); });
  return { store, base: `http://127.0.0.1:${server.address().port}` };
}
const auth = { Cookie: 'talos_token=secret' };
async function makeProposal(store) {
  return proposeWorkflowFromTool(store, { sessionId, toolCallId: 'http_test_call', core: phasedCore(),
    plannerModel: null, sessionModel: 'provider/model', modalitaOperativa: 'normale', agentRole: 'root' }); /* F3-10 (23/09/2026): il modo «Workflow» è ritirato; la proposta nasce dal root in Normale. */
}

test('WF-HTTP-PROPOSAL-REVIEW: authenticated GET/HEAD exposes exact phased Definition, restart-safe approval state', async (t) => {
  const { store, base } = await setup(t);
  const proposed = await makeProposal(store);
  const path = `/api/v1/workflows/${proposed.workflowId}/versions/1`;
  assert.equal((await fetch(base + path)).status, 401);
  const first = await fetch(base + path, { headers: auth });
  assert.equal(first.status, 200);
  const data = (await first.json()).data;
  assert.equal(data.status, 'proposed');
  // F3-21 (25/09/2026): revisione limitata, vista v2 — il Core non viaggia, le fasi sì (coi loro conteggi)
  assert.equal(data.schema, 'talos.workflow-proposal-view.v2');
  assert.equal(data.definitionHash, proposed.definitionHash);
  assert.equal(data.proposal.initiatingSessionId, sessionId);
  assert.deepEqual(data.phases.map((phase) => phase.id), ['implementation', 'verification']);
  assert.equal(data.record, undefined);
  assert.equal((await fetch(base + path, { method: 'HEAD', headers: auth })).status, 200);
  const unknown = path.replace(proposed.workflowId, randomUUID());
  assert.equal((await fetch(base + unknown, { headers: auth })).status, 404);
  assert.equal((await fetch(base + path + '?surprise=1', { headers: auth })).status, 400);
});

test('WF-HTTP-APPROVAL: exact hash, durable command replay, no run or fake start', async (t) => {
  const { store, base } = await setup(t);
  const proposed = await makeProposal(store);
  const path = `/api/v1/workflows/${proposed.workflowId}/versions/1/approve`;
  const commandId = randomUUID();
  const body = { commandId, definitionHash: proposed.definitionHash };
  const post = (value, headers = auth) => fetch(base + path, { method: 'POST', headers: {
    ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  assert.equal((await post(body, {})).status, 401);
  assert.equal((await post({ ...body, extra: true })).status, 400);
  const wrong = await post({ ...body, definitionHash: `sha256:${'0'.repeat(64)}` });
  assert.equal(wrong.status, 409);
  assert.equal((await wrong.json()).error.code, 'WORKFLOW_DEFINITION_HASH_MISMATCH');
  const approved = await post(body);
  assert.equal(approved.status, 200);
  const first = (await approved.json()).data;
  assert.equal(first.status, 'approved');
  assert.equal(first.receipt.commandId, commandId);
  const replay = await post(body);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data.receipt.acceptedAt, first.receipt.acceptedAt);
  assert.equal((await readDefinitionApproval(store, { workflowId: proposed.workflowId, version: 1 })).commandId, commandId);
  const review = await fetch(base + path.slice(0, -'/approve'.length), { headers: auth });
  assert.equal((await review.json()).data.status, 'approved');
  assert.deepEqual(await listRunIds(store), []);
  // F3-51c (25/09/2026): la rotta di avvio ora ESISTE; approvare non avvia niente, e senza il motore dei Workflow l'avvio dice
  // «non disponibile» invece di creare un run che nessuno esegue (D22) — prima di questa fetta qui c'era un 404
  const avvio = await fetch(base + path.replace('/approve', '/start'), { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: randomUUID(), definitionHash: proposed.definitionHash }) });
  assert.equal(avvio.status, 503);
  assert.equal((await avvio.json()).error.code, 'WORKFLOW_RUNTIME_NOT_READY');
  assert.deepEqual(await listRunIds(store), [], 'still no run');
});

test('WF-APPROVAL-ORIGIN: foreign loopback origin and simple content type cannot approve', async (t) => {
  const { store, base } = await setup(t);
  const proposed = await makeProposal(store);
  const path = `/api/v1/workflows/${proposed.workflowId}/versions/1/approve`;
  const body = JSON.stringify({ commandId: randomUUID(), definitionHash: proposed.definitionHash });
  const foreign = await fetch(base + path, { method: 'POST', headers: {
    ...auth, Origin: 'http://127.0.0.1:65530', 'Sec-Fetch-Site': 'same-site',
    'Content-Type': 'application/json',
  }, body });
  assert.equal(foreign.status, 403);
  const simple = await fetch(base + path, { method: 'POST', headers: {
    ...auth, Origin: base, 'Content-Type': 'text/plain',
  }, body });
  assert.equal(simple.status, 400);
  assert.equal((await fetch(base + path.slice(0, -'/approve'.length), { headers: auth }).then((response) => response.json())).data.status, 'proposed');
  const legitimate = await fetch(base + path, { method: 'POST', headers: {
    ...auth, Origin: base, 'Content-Type': 'application/json',
  }, body });
  assert.equal(legitimate.status, 200);
});

test('WF-PROPOSAL-VERSION-CANONICAL: alternate numeric spellings cannot target version 1', async (t) => {
  const { store, base } = await setup(t);
  const proposed = await makeProposal(store);
  for (const spelling of ['01', '1e0', '0x1', '%2B1', '%31']) {
    const path = `/api/v1/workflows/${proposed.workflowId}/versions/${spelling}`;
    assert.equal((await fetch(base + path, { headers: auth })).status, 404, spelling);
    assert.equal((await fetch(base + path + '/approve', { method: 'POST', headers: {
      ...auth, 'Content-Type': 'application/json',
    }, body: JSON.stringify({ commandId: randomUUID(), definitionHash: proposed.definitionHash }) })).status, 404, spelling);
  }
  assert.equal((await fetch(base + `/api/v1/workflows/${proposed.workflowId}/versions/1`, { headers: auth })).status, 200);
});

test('WF-HTTP-STORE-UNAVAILABLE: proposal review and approval fail closed', async (t) => {
  const { base } = await setup(t, false);
  const path = `/api/v1/workflows/${randomUUID()}/versions/1`;
  const get = await fetch(base + path, { headers: auth });
  assert.equal(get.status, 503);
  assert.equal((await get.json()).error.code, 'WORKFLOW_STORE_UNAVAILABLE');
  const post = await fetch(base + path + '/approve', { method: 'POST', headers: {
    ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: randomUUID(), definitionHash: `sha256:${'a'.repeat(64)}` }) });
  assert.equal(post.status, 503);
});

// F3-33b (25/09/2026): «Modifica» i tetti = una versione nuova. Stesse difese di Approva (gettone, Origin, JSON esatto).
test('WF-HTTP-REVISE: 201 with version 2, the same gesture finds it again, refusals are explicit and nothing is written', async (t) => {
  const { store, base } = await setup(t);
  const proposed = await makeProposal(store);
  const path = `/api/v1/workflows/${proposed.workflowId}/versions/1/revise`;
  const post = (value, headers = auth) => fetch(base + path, { method: 'POST', headers: {
    ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const body = { definitionHash: proposed.definitionHash, budgets: { wallMs: 3_600_000 } };
  assert.equal((await post(body, {})).status, 401);
  assert.equal((await post(body, { ...auth, Origin: 'http://attacker.example' })).status, 403);
  assert.equal((await post({ ...body, extra: true })).status, 400);
  assert.equal((await (await post({ ...body, budgets: { wallMs: 0 } })).json()).error.code, 'WORKFLOW_REVISION_INVALID');
  const creata = await post(body);
  assert.equal(creata.status, 201);
  const data = (await creata.json()).data;
  assert.deepEqual([data.version, data.previousVersion, data.status], [2, 1, 'proposed']);
  const ancora = (await (await post(body)).json()).data;
  assert.equal(ancora.definitionHash, data.definitionHash, 'a repeated gesture (ambiguous outcome) finds the same version');
  const altra = await post({ ...body, budgets: { wallMs: 7_200_000 } });
  assert.equal(altra.status, 409);
  assert.equal((await altra.json()).error.code, 'WORKFLOW_VERSION_NOT_LATEST');
  const v2 = await fetch(`${base}/api/v1/workflows/${proposed.workflowId}/versions/2`, { headers: auth });
  assert.equal((await v2.json()).data.budgets.wallMs, 3_600_000);
});
