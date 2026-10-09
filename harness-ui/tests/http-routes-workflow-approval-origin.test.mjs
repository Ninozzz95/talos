// Riparazione 24/09/2026 — il cancello dell'approvazione Workflow (http-app.mjs, rotta
// POST /api/v1/workflows/:id/versions/:v/approve), provato METÀ PER METÀ.
// Nato dalla revisione avversaria del 23/09: le mutazioni M02 (via il confronto Origin) e M03 (via
// il controllo Sec-Fetch-Site) sopravvivevano, perché l'unico caso rosso aveva ENTRAMBE le metà
// sbagliate; e il difetto D2: l'origine attesa si ricavava dall'Host della richiesta stessa, quindi
// Host e Origin falsi ma coerenti (forma di un DNS rebinding) approvavano. Il test del rebinding è
// quello della revisione (`rev-wf-approval-origin-host-red`), portato qui fra i verdi.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { createWorkflowStore } from '../src/workflow/store.mjs';
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

async function setup(t, { token = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-approval-origin-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  const registry = { leggiSessioneContesto: (id) => id === sessionId ? { sessionId: id } : null };
  // Senza token: è la configurazione in cui il cookie SameSite non protegge e il cancello è l'unica difesa.
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry, workflowStore: store, token }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await store.close(); rimuoviCartellaDiProva(root); });
  const port = server.address().port;
  const proposed = await proposeWorkflowFromTool(store, { sessionId, toolCallId: `origin-${randomUUID()}`, core: phasedCore(),
    plannerModel: null, sessionModel: 'provider/model', modalitaOperativa: 'normale', agentRole: 'root' }); /* F3-10 (23/09/2026): il modo «Workflow» è ritirato; la proposta nasce dal root in Normale. */
  const path = `/api/v1/workflows/${proposed.workflowId}/versions/1/approve`;
  // node:http e non fetch: fetch non lascia impostare Host, e il rebinding vive proprio lì.
  const post = (headers) => new Promise((resolve, reject) => {
    const body = JSON.stringify({ commandId: randomUUID(), definitionHash: proposed.definitionHash });
    const req = request({ host: '127.0.0.1', port, method: 'POST', path,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers } },
    (res) => { let text = ''; res.setEncoding('utf8'); res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null })); });
    req.on('error', reject); req.end(body);
  });
  return { port, post };
}

test('WF-APPROVAL-ORIGIN-HOST-REBINDING: a foreign Host with a matching Origin cannot approve', async (t) => {
  const { port, post } = await setup(t);
  const out = await post({ Host: `attacker.example:${port}`, Origin: `http://attacker.example:${port}`, 'Sec-Fetch-Site': 'same-origin' });
  /* 0.1.25 (owner 09/10/2026): the server-wide Host guard (guardia-origine.mjs) now stops a foreign Host before any route —
     400 HOST_FORBIDDEN, earlier and for every route. The approval guard below stays as the second line. */
  assert.equal(out.status, 400, `approval from Host attacker.example answered ${out.status}`);
  assert.equal(out.body.error.code, 'HOST_FORBIDDEN');
});

test('WF-APPROVAL-ORIGIN-HALF: a foreign Origin is refused even when Sec-Fetch-Site says same-origin', async (t) => {
  const { port, post } = await setup(t);
  for (const origin of [`http://127.0.0.1:${port + 1 > 65535 ? port - 1 : port + 1}`, 'null', `https://127.0.0.1:${port}`, `http://evil.example:${port}`]) {
    const out = await post({ Origin: origin, 'Sec-Fetch-Site': 'same-origin' });
    assert.equal(out.status, 403, origin);
  }
});

test('WF-APPROVAL-FETCH-SITE-HALF: cross-site and same-site are refused even with an exact loopback Origin', async (t) => {
  const { port, post } = await setup(t);
  for (const site of ['cross-site', 'same-site']) {
    const out = await post({ Origin: `http://127.0.0.1:${port}`, 'Sec-Fetch-Site': site });
    assert.equal(out.status, 403, site);
  }
});

test('WF-APPROVAL-ORIGIN-LOOPBACK-ACCEPTED: the TALOS window on localhost is accepted', async (t) => {
  const { port, post } = await setup(t);
  const out = await post({ Host: `localhost:${port}`, Origin: `http://localhost:${port}`, 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(out.status, 200);
  assert.equal(out.body.data.status, 'approved');
});

// 23/09/2026, decisione owner «solo col gettone»: un client che non è un browser (nessun Origin, nessun
// Sec-Fetch-Site) approva solo se il server ha il gettone e lui porta il cookie.
test('WF-APPROVAL-NON-BROWSER-WITHOUT-TOKEN: a headerless client cannot approve on a server without token', async (t) => {
  const { post } = await setup(t);
  const out = await post({});
  assert.equal(out.status, 403, `headerless approval without token answered ${out.status}`);
  assert.equal(out.body.error.code, 'WORKFLOW_APPROVAL_ORIGIN_FORBIDDEN');
});

test('WF-APPROVAL-NON-BROWSER-WITH-TOKEN: with the token cookie a headerless client approves; without it, 401', async (t) => {
  const token = 'a'.repeat(64);
  const { post } = await setup(t, { token });
  const senza = await post({});
  assert.equal(senza.status, 401, 'without the cookie the whole /api/ refuses');
  const con = await post({ Cookie: `talos_token=${token}` });
  assert.equal(con.status, 200, `headerless approval with the token answered ${con.status}`);
  assert.equal(con.body.data.status, 'approved');
});
