/*
 * Owner 10/10/2026 («Sola lettura dall'altro archivio») — le rotte di LETTURA dei Workflow cercano nel proprio archivio e, se lì
 *   la proposta o il run non c'è, in quello di un altro processo TALOS (il 4174 e l'app installata condividono le sessioni). Ciò
 *   che viene dall'altro esce marcato `soloLettura: true`; ogni scrittura resta sul proprio archivio e lì quel Workflow non c'è.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { apriArchivioInSolaLettura, approveDefinition, createDefinition, createRun, createWorkflowStore } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const rootSessionId = '40000000-0000-4000-8000-000000000001';
const definition = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));
const LIMITI = { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 };
const runId = '10000000-0000-4000-8000-000000000001';
const sessioni = new Set([rootSessionId, definition.proposal.initiatingSessionId]);

function fotografia(radice) {
  const fuori = [];
  const giro = (cartella) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const p = join(cartella, voce.name);
      if (voce.isDirectory()) giro(p); else { const s = statSync(p); fuori.push(`${relative(radice, p)}:${s.size}:${s.mtimeMs}`); }
    }
  };
  giro(radice);
  return fuori.sort();
}

/** L'archivio dell'ALTRO processo (proposta approvata e un run), il proprio vuoto, e il lettore in sola lettura sul primo. */
async function dueArchivi(t, { conAltro = true } = {}) {
  const rootAltro = mkdtempSync(join(tmpdir(), 'talos-wf-altro-'));
  const rootProprio = mkdtempSync(join(tmpdir(), 'talos-wf-proprio-'));
  const proprietarioAltro = await createWorkflowStore({ workflowDataRoot: rootAltro, workspaceRoots: [], resultLimits: LIMITI });
  const proprio = await createWorkflowStore({ workflowDataRoot: rootProprio, workspaceRoots: [], resultLimits: LIMITI });
  await createDefinition(proprietarioAltro, { record: definition });
  await approveDefinition(proprietarioAltro, { approval });
  await createRun(proprietarioAltro, { event: {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1, eventId: randomUUID(), runId, seq: 1,
    at: '2026-09-23T10:00:00.000Z', type: 'run_created', nodeId: null, commandId: randomUUID(), commandType: 'start-run',
    commandPayloadHash: `sha256:${'c'.repeat(64)}`, causationId: null, correlationId: runId, graphVersion: 1,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload: { workflowId: definition.workflowId, definitionVersion: definition.version, definitionHash: definition.definitionHash,
      rootSessionId, workspaceBaselineId: null, workspaceBaselineHash: null },
  } });
  const lettore = conAltro ? await apriArchivioInSolaLettura({ workflowDataRoot: rootAltro, resultLimits: LIMITI }) : null;
  t.after(async () => {
    await lettore?.close(); await proprio.close(); await proprietarioAltro.close();
    rimuoviCartellaDiProva(rootAltro); rimuoviCartellaDiProva(rootProprio);
  });
  const registry = { leggiSessioneContesto: (id) => (sessioni.has(id) ? { sessionId: id } : null) };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry, workflowStore: proprio, workflowStoreAltro: lettore }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { base: `http://127.0.0.1:${server.address().port}`, rootAltro };
}
const json = async (risposta) => ({ status: risposta.status, corpo: await risposta.json().catch(() => null) });

test('WF-HTTP-SOLA-LETTURA-01: la proposta, il suo grafo e l\'elenco della sessione vengono dall\'altro archivio, marcati', async (t) => {
  const { base } = await dueArchivi(t);
  const revisione = await json(await fetch(`${base}/api/v1/workflows/${definition.workflowId}/versions/1`));
  assert.equal(revisione.status, 200);
  assert.equal(revisione.corpo.data.soloLettura, true);
  const grafo = await json(await fetch(`${base}/api/v1/workflows/${definition.workflowId}/versions/1/graph`));
  assert.deepEqual([grafo.status, grafo.corpo.data.soloLettura], [200, true]);
  const elenco = await json(await fetch(`${base}/api/v1/sessions/${definition.proposal.initiatingSessionId}/workflow-proposals`));
  assert.equal(elenco.status, 200);
  assert.deepEqual(elenco.corpo.data.items.map((v) => [v.workflowId, v.version, v.soloLettura]), [[definition.workflowId, 1, true]]);
});

test('WF-HTTP-SOLA-LETTURA-02: il run dell\'altro processo è nell\'elenco della sessione e si guarda (grafo, flusso)', async (t) => {
  const { base } = await dueArchivi(t);
  const runs = await json(await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows`));
  assert.equal(runs.status, 200);
  assert.deepEqual(runs.corpo.data.items.map((r) => [r.runId, r.soloLettura]), [[runId, true]]);
  const grafo = await json(await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}/graph`));
  assert.deepEqual([grafo.status, grafo.corpo.data.soloLettura], [200, true]);
  const flusso = await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}/events`, { method: 'HEAD' });
  assert.equal(flusso.status, 200);
  assert.match(flusso.headers.get('content-type'), /text\/event-stream/);
});

test('WF-HTTP-SOLA-LETTURA-03: una scrittura sul Workflow dell\'altro non arriva al suo archivio', async (t) => {
  const { base, rootAltro } = await dueArchivi(t);
  const prima = fotografia(rootAltro);
  for (const percorso of [`/api/v1/workflows/${definition.workflowId}/versions/1/approve`, `/api/v1/workflows/${definition.workflowId}/versions/1/start`]) {
    const risposta = await fetch(`${base}${percorso}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ commandId: randomUUID(), definitionHash: definition.definitionHash }) });
    assert.ok(risposta.status >= 400, `${percorso}: ${risposta.status}`);
  }
  assert.deepEqual(fotografia(rootAltro), prima, 'l\'archivio dell\'altro processo non cambia di un byte');
});

test('WF-HTTP-SOLA-LETTURA-04: AL CONTRARIO — senza l\'altro archivio la stessa proposta è 404 e l\'elenco è vuoto, come prima', async (t) => {
  const { base } = await dueArchivi(t, { conAltro: false });
  assert.equal((await fetch(`${base}/api/v1/workflows/${definition.workflowId}/versions/1`)).status, 404);
  const runs = await json(await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows`));
  assert.deepEqual(runs.corpo.data.items, []);
  assert.equal((await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}/graph`)).status, 404);
});
