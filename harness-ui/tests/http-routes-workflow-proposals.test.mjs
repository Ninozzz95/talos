// F3-21 (25/09/2026) — le rotte della proposta che si vede: elenco per sessione, revisione limitata, grafo pianificato.
// ETag DEBOLE e confronto debole su If-None-Match (RFC 9110 §13.1.2); 404 fuori proprietario, 503 senza Store, 400 sulle query.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';
import { proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { createWorkflowStore } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sessionId = '82000000-0000-4000-8000-0000000000c1';
const altraSessione = '82000000-0000-4000-8000-0000000000c2';
const coreV1 = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));
function phasedCore() {
  const core = structuredClone(coreV1);
  core.schema = 'talos.workflow-definition-core.v2'; core.definitionSchemaVersion = 2;
  core.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  core.nodes[0].phaseId = 'implementation'; core.nodes[1].phaseId = 'verification';
  return core;
}
async function setup(t, { withStore = true, sessioni = [sessionId, altraSessione] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-http-proposals-'));
  const store = withStore ? await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } }) : null;
  const vive = new Set(sessioni);
  const registry = { leggiSessioneContesto: (id) => vive.has(id) ? { sessionId: id } : null };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry, workflowStore: store, token: 'secret' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); if (store) await store.close(); rimuoviCartellaDiProva(root); });
  return { root, store, vive, base: `http://127.0.0.1:${server.address().port}` };
}
const auth = { Cookie: 'talos_token=secret' };
const propose = (store, toolCallId = 'http_proposals_call', session = sessionId) => proposeWorkflowFromTool(store, { sessionId: session, toolCallId,
  core: phasedCore(), plannerModel: null, sessionModel: 'provider/model', modalitaOperativa: 'normale', agentRole: 'root' });

test('WF-PLANNED-ETAG-304: list, review and planned graph revalidate with a weak ETag; approval changes review and list, never the plan', async (t) => {
  const { base, store } = await setup(t);
  const proposta = await propose(store);
  const percorsi = {
    lista: `/api/v1/sessions/${sessionId}/workflow-proposals`,
    revisione: `/api/v1/workflows/${proposta.workflowId}/versions/1`,
    grafo: `/api/v1/workflows/${proposta.workflowId}/versions/1/graph`,
    archi: `/api/v1/workflows/${proposta.workflowId}/versions/1/edges?limit=100`,
    fase: `/api/v1/workflows/${proposta.workflowId}/versions/1/groups/implementation?offset=0&limit=50`,
    passo: `/api/v1/workflows/${proposta.workflowId}/versions/1/nodes/implement`,
  };
  const etag = {};
  for (const [nome, percorso] of Object.entries(percorsi)) {
    const prima = await fetch(base + percorso, { headers: auth });
    assert.equal(prima.status, 200, `${nome}: ${await prima.clone().text()}`);
    etag[nome] = prima.headers.get('etag');
    assert.match(etag[nome], /^W\/"sha256:[0-9a-f]{64}"$/u, nome);
    assert.equal(prima.headers.get('cache-control'), 'private, no-cache', nome);
    const stessa = await fetch(base + percorso, { headers: { ...auth, 'If-None-Match': etag[nome] } });
    assert.equal(stessa.status, 304, `${nome}: same weak tag`);
    assert.equal(await stessa.text(), '', `${nome}: a 304 has no body`);
    // confronto DEBOLE: lo stesso tag senza `W/` è lo stesso validatore (RFC 9110 §13.1.2)
    assert.equal((await fetch(base + percorso, { headers: { ...auth, 'If-None-Match': etag[nome].slice(2) } })).status, 304, `${nome}: strong spelling`);
    assert.equal((await fetch(base + percorso, { headers: { ...auth, 'If-None-Match': '"sha256:altro", *' } })).status, 304, `${nome}: *`);
    assert.equal((await fetch(base + percorso, { headers: { ...auth, 'If-None-Match': '"sha256:altro"' } })).status, 200, `${nome}: other tag`);
  }
  const approvata = await fetch(`${base}/api/v1/workflows/${proposta.workflowId}/versions/1/approve`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: randomUUID(), definitionHash: proposta.definitionHash }) });
  assert.equal(approvata.status, 200, await approvata.clone().text());
  for (const [nome, cambia] of [['lista', true], ['revisione', true], ['grafo', false], ['archi', false], ['fase', false], ['passo', false]]) {
    const dopo = await fetch(base + percorsi[nome], { headers: { ...auth, 'If-None-Match': etag[nome] } });
    assert.equal(dopo.status, cambia ? 200 : 304, `${nome} after approval`);
  }
});

test('WF-PROPOSAL-ROUTES-SCOPE: 401 without token, 404 outside the owner, 400 on queries, 503 without a Store, HEAD allowed', async (t) => {
  const { base, store, vive, root } = await setup(t);
  const proposta = await propose(store);
  await propose(store, 'http_other_call', altraSessione);
  const revisione = `/api/v1/workflows/${proposta.workflowId}/versions/1`;
  assert.equal((await fetch(base + revisione)).status, 401);
  assert.equal((await fetch(`${base}/api/v1/sessions/${sessionId}/workflow-proposals`)).status, 401);
  const lista = (await (await fetch(`${base}/api/v1/sessions/${sessionId}/workflow-proposals`, { headers: auth })).json()).data;
  assert.deepEqual(lista.items.map((item) => item.workflowId), [proposta.workflowId], 'the other session proposal leaked');
  assert.equal((await fetch(`${base}/api/v1/sessions/${randomUUID()}/workflow-proposals`, { headers: auth })).status, 404);
  for (const query of ['?limit=51', '?limit=0', '?offset=-1', '?surprise=1', '?limit=1&limit=2']) {
    assert.equal((await fetch(`${base}/api/v1/sessions/${sessionId}/workflow-proposals${query}`, { headers: auth })).status, 400, query);
  }
  assert.equal((await fetch(`${base}${revisione}/edges?limit=101`, { headers: auth })).status, 400);
  assert.equal((await fetch(`${base}${revisione}/groups/implementation?limit=51`, { headers: auth })).status, 400);
  assert.equal((await fetch(`${base}${revisione}/groups/implementation?limit=4&sort=stato`, { headers: auth })).status, 200);
  assert.equal((await fetch(`${base}${revisione}/groups/implementation?sort=nome`, { headers: auth })).status, 400);
  assert.equal((await fetch(`${base}${revisione}/graph?x=1`, { headers: auth })).status, 400);
  assert.equal((await fetch(`${base}${revisione}/groups/non-esiste`, { headers: auth })).status, 404);
  assert.equal((await fetch(`${base}${revisione}/nodes/non-esiste`, { headers: auth })).status, 404);
  assert.equal((await fetch(`${base}${revisione}/graph`, { method: 'HEAD', headers: auth })).status, 200);
  assert.equal((await fetch(`${base}${revisione}/graph`, { method: 'POST', headers: auth })).status, 405);
  // la sessione che l'ha proposta non c'è più: la proposta non si vede da nessuna porta
  vive.delete(sessionId);
  for (const coda of ['', '/graph', '/edges', '/groups/implementation', '/nodes/implement']) {
    assert.equal((await fetch(`${base}${revisione}${coda}`, { headers: auth })).status, 404, coda || 'review');
  }
  assert.deepEqual(readdirSync(join(root, 'runs')), [], 'reading a proposal created a run');
});

test('WF-PROPOSAL-ROUTES-NO-STORE: without a Workflow Store the proposal routes say 503, not an empty list', async (t) => {
  const { base } = await setup(t, { withStore: false });
  const lista = await fetch(`${base}/api/v1/sessions/${sessionId}/workflow-proposals`, { headers: auth });
  assert.equal(lista.status, 503);
  assert.equal((await lista.json()).error.code, 'WORKFLOW_STORE_UNAVAILABLE');
  assert.equal((await fetch(`${base}/api/v1/workflows/${randomUUID()}/versions/1/graph`, { headers: auth })).status, 503);
});

test('WF-ROUTE-INVENTORY-PLANNED: the new read routes declare only GET/HEAD, and the start route (F3-51c) only POST', () => {
  const versione = '/api/v1/workflows/00000000-0000-4000-8000-000000000001/versions/1';
  for (const coda of ['/graph', '/edges', '/groups/implementation', '/nodes/implement']) {
    assert.deepEqual(metodiAmmessiPerRotta(versione + coda), ['GET', 'HEAD'], coda);
  }
  assert.deepEqual(metodiAmmessiPerRotta(`/api/v1/sessions/${sessionId}/workflow-proposals`), ['GET', 'HEAD']);
  // F3-51c (25/09/2026): la rotta di avvio ora esiste (prima di quella fetta qui c'era `null`), e solo in POST
  assert.deepEqual(metodiAmmessiPerRotta(`${versione}/start`), ['POST']);
  assert.equal(metodiAmmessiPerRotta(`${versione}/groups`), null, 'a group needs its phase id');
  assert.equal(metodiAmmessiPerRotta(`${versione}/graphs`), null);
});
