// F3-33b (25/09/2026) — «Modifica» i tetti: una versione NUOVA dello stesso workflow, da riapprovare (decisioni owner 5, D17 b,
// D19 a e le quattro del 25/09 sera). Ricerca: `.claude/RICERCA-10x4-F3-33b-TETTI-2026-09-25.md`.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { approveWorkflowProposal, proposeWorkflowFromTool, readWorkflowProposal, reviseWorkflowBudgets } from '../src/workflow/planning-control.mjs';
import { startWorkflowRun } from '../src/workflow/run-control.mjs';
import { createWorkflowStore, listDefinitionsForSession, readDefinition } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sessionId = '83000000-0000-4000-8000-00000000000a';
const esiste = (id) => id === sessionId;

async function harness(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-revise-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => { if (store.state !== 'closed') await store.close(); rimuoviCartellaDiProva(root); });
  return store;
}
const proponi = (store, toolCallId = `call_${randomUUID().slice(0, 8)}`) => proposeWorkflowFromTool(store, {
  sessionId, toolCallId, plannerModel: null, sessionModel: 'z-ai/glm-5.3-flash', modalitaOperativa: 'normale', agentRole: 'root',
  draft: { title: 'Riassunti', objective: 'Riassumere due note.', phases: [{ id: 'f', label: 'Fase' }],
    nodes: [{ id: 'a', phase: 'f', label: 'A', task: 'Leggi A.' }, { id: 'b', phase: 'f', label: 'B', task: 'Leggi B.', dependsOn: ['a'] }] },
}, { nowFn: () => '2026-09-25T18:00:00.000Z' });
const rivedi = (store, p, budgets, version = 1) => reviseWorkflowBudgets(store,
  { workflowId: p.workflowId, version, definitionHash: p.definitionHash, budgets }, { sessionExistsFn: esiste, nowFn: () => '2026-09-25T18:05:00.000Z' });
const approva = (store, workflowId, version, definitionHash) => approveWorkflowProposal(store,
  { workflowId, version, definitionHash, commandId: randomUUID() }, { sessionExistsFn: esiste });
const avvia = (store, workflowId, version, definitionHash) => startWorkflowRun(store,
  { workflowId, version, definitionHash, commandId: randomUUID() }, { sessionExistsFn: esiste, supportedNodeKinds: ['agent'] });

test('WF-REVISE-NEW-VERSION: changing the run limits makes version 2, to approve; version 1 stays as it was', async (t) => {
  const store = await harness(t);
  const p = await proponi(store);
  const prima = await readWorkflowProposal(store, { workflowId: p.workflowId, version: 1 }, { sessionExistsFn: esiste });
  const esito = await rivedi(store, p, { wallMs: prima.budgets.wallMs * 3, knownCostUsd: 1.5 });
  assert.deepEqual([esito.schema, esito.status, esito.version, esito.previousVersion], ['talos.workflow-revision-result.v1', 'proposed', 2, 1]);
  assert.notEqual(esito.definitionHash, p.definitionHash);
  const v2 = await readWorkflowProposal(store, { workflowId: p.workflowId, version: 2 }, { sessionExistsFn: esiste });
  assert.equal(v2.status, 'proposed');
  assert.equal(v2.budgets.wallMs, prima.budgets.wallMs * 3);
  assert.equal(v2.budgets.knownCostUsd, 1.5);
  assert.equal(v2.budgets.promptTokens, prima.budgets.promptTokens, 'what is not changed stays');
  const v1 = await readWorkflowProposal(store, { workflowId: p.workflowId, version: 1 }, { sessionExistsFn: esiste });
  assert.deepEqual(v1.budgets, prima.budgets, 'versions are immutable');
  assert.deepEqual(listDefinitionsForSession(store, { sessionId }).map((v) => v.version).sort(), [1, 2]);
});

test('WF-REVISE-TIGHTENS-STEPS: a run limit below a step limit tightens the step; raising it leaves the steps prudent', async (t) => {
  const store = await harness(t);
  const p = await proponi(store);
  const base = await readDefinition(store, { workflowId: p.workflowId, version: 1 });
  const passo = base.core.nodes[0].budget.promptTokens;
  const giu = await rivedi(store, p, { promptTokens: Math.floor(passo / 4), completionTokens: base.core.budgets.completionTokens * 2 });
  const v2 = await readDefinition(store, { workflowId: p.workflowId, version: giu.version });
  for (const node of v2.core.nodes) {
    assert.equal(node.budget.promptTokens, Math.floor(passo / 4), 'a step is never wider than the run');
    assert.equal(node.budget.completionTokens, base.core.nodes[0].budget.completionTokens, 'raising the run does not raise the steps');
  }
});

test('WF-REVISE-IDEMPOTENT-AND-LINEAR: the same gesture finds the same version; only the latest version can be revised', async (t) => {
  const store = await harness(t);
  const p = await proponi(store);
  const uno = await rivedi(store, p, { toolCalls: 7 });
  const due = await rivedi(store, p, { toolCalls: 7 });
  assert.deepEqual([due.version, due.definitionHash], [uno.version, uno.definitionHash], 'a repeated gesture does not make version 3');
  await assert.rejects(rivedi(store, p, { toolCalls: 9 }), { code: 'WORKFLOW_VERSION_NOT_LATEST' });
  const tre = await rivedi(store, { workflowId: p.workflowId, definitionHash: uno.definitionHash }, { toolCalls: 9 }, 2);
  assert.equal(tre.version, 3);
  await assert.rejects(rivedi(store, p, { toolCalls: 7 }), { code: 'WORKFLOW_VERSION_NOT_LATEST' }, 'v1 again after v3: no');
});

test('WF-REVISE-REJECTS: never switched off, never unknown, never empty, never stale', async (t) => {
  const store = await harness(t);
  const p = await proponi(store);
  for (const budgets of [{ wallMs: 0 }, { wallMs: -5 }, { wallMs: 1.5 }, { wallMs: Number.NaN }, { wallMs: null }, { wallMs: '60000' },
    { knownCostUsd: 0 }, { knownCostUsd: Number.POSITIVE_INFINITY }, { retryPromptTokens: 5 }, { agentSeconds: 5 }, {}]) {
    await assert.rejects(rivedi(store, p, budgets), { code: 'WORKFLOW_REVISION_INVALID' }, JSON.stringify(budgets));
  }
  const attuale = (await readWorkflowProposal(store, { workflowId: p.workflowId, version: 1 }, { sessionExistsFn: esiste })).budgets;
  await assert.rejects(rivedi(store, p, { wallMs: attuale.wallMs }), { code: 'WORKFLOW_REVISION_EMPTY' });
  await assert.rejects(rivedi(store, { ...p, definitionHash: `sha256:${'0'.repeat(64)}` }, { wallMs: 5 }), { code: 'WORKFLOW_DEFINITION_HASH_MISMATCH' });
  await assert.rejects(reviseWorkflowBudgets(store, { workflowId: p.workflowId, version: 1, definitionHash: p.definitionHash, budgets: { wallMs: 5 } },
    { sessionExistsFn: () => false }), { code: 'WORKFLOW_PROPOSAL_NOT_FOUND' });
  assert.deepEqual(listDefinitionsForSession(store, { sessionId }).map((v) => v.version), [1], 'nothing was written by a refusal');
});

test('WF-REVISE-AFTER-START: a version that started cannot change its limits', async (t) => {
  const store = await harness(t);
  const p = await proponi(store);
  await approva(store, p.workflowId, 1, p.definitionHash);
  await avvia(store, p.workflowId, 1, p.definitionHash);
  await assert.rejects(rivedi(store, p, { wallMs: 5_000 }), { code: 'WORKFLOW_ALREADY_STARTED' });
});

test('WF-V1-STARTABLE-UNTIL-V2-APPROVED: an approved v1 starts while v2 is only proposed, and no longer once v2 is approved', async (t) => {
  const store = await harness(t);
  const p = await proponi(store);
  await approva(store, p.workflowId, 1, p.definitionHash);
  const v2 = await rivedi(store, p, { wallMs: 9_000_000 });
  const q = await proponi(store);
  await approva(store, q.workflowId, 1, q.definitionHash);
  const q2 = await rivedi(store, q, { wallMs: 9_000_000 });
  // p: v2 solo proposta ⇒ la v1 parte
  const partito = await avvia(store, p.workflowId, 1, p.definitionHash);
  assert.equal(partito.status, 'prepared');
  assert.equal(v2.status, 'proposed');
  // q: v2 approvata ⇒ la v1 non parte più, la v2 sì
  await approva(store, q.workflowId, 2, q2.definitionHash);
  await assert.rejects(avvia(store, q.workflowId, 1, q.definitionHash), { code: 'WORKFLOW_VERSION_SUPERSEDED' });
  assert.equal((await avvia(store, q.workflowId, 2, q2.definitionHash)).status, 'prepared');
});
