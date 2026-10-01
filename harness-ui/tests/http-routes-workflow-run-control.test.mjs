/*
 * F3-51c (25/09/2026) — le rotte di AVVIA e dei CONTROLLI del run, con un server HTTP vero in processo e il runtime vero
 * (Store, orchestratore, scheduler); il passo lo esegue un adattatore finto controllabile (aspetta un cancello, fallisce, si ferma
 * all'Annulla). Decisioni owner: 5/D22 (Avvia separato), 20 (dal client non-browser solo col gettone), 25/09 (Pausa, Annulla,
 * Riprova col tetto detto prima). Ledger: `.claude/LEDGER-F3-51-CONTROLLI-DEL-RUN-2026-09-25.md`.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { createCapacitaAdattiva, createWorkflowScheduler } from '../src/workflow/scheduler.mjs';
import { createWorkflowStore, listRunIds, readRunState } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaAttesaAProgresso } from './aiuto/attesa-a-progresso.mjs';

const sessionId = '83000000-0000-4000-8000-000000000001';
const altraSessione = '83000000-0000-4000-8000-000000000002';
const BOZZA = {
  title: 'Prova rotte', objective: 'Provare le rotte dei controlli.',
  phases: [{ id: 'f', label: 'Fase' }],
  nodes: [
    { id: 'uno', phase: 'f', label: 'Uno', task: 'Fai uno.' },
    { id: 'dopo', phase: 'f', label: 'Dopo', task: 'Dopo uno.', dependsOn: ['uno'] },
  ],
};
const CONSUMO = { promptTokens: 3, completionTokens: 1, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 1, knownCostUsd: null };

/** L'adattatore finto: un passo aspetta il suo cancello se ne ha uno; l'esito del tentativo n viene da `esiti`; l'Annulla lo ferma. */
function adattatoreFinto() {
  const cancelli = new Map();
  const esiti = new Map();
  const tentativi = new Map();
  const fermati = new Set();
  return {
    id: 'finto-http',
    tentativi,
    esiti,
    chiudi(nodeId) { let apri; const promessa = new Promise((r) => { apri = r; }); cancelli.set(nodeId, { promessa, apri }); },
    apri(nodeId) { cancelli.get(nodeId)?.apri(); cancelli.delete(nodeId); },
    async execute(ctx) {
      const n = (tentativi.get(ctx.nodeId) ?? 0) + 1;
      tentativi.set(ctx.nodeId, n);
      if (cancelli.has(ctx.nodeId)) await cancelli.get(ctx.nodeId).promessa;
      const ricevuta = `finto:${ctx.nodeId}:${n}`;
      if (fermati.has(ctx.activityExecutionId)) return { status: 'failed', errorClass: 'cancelled', retryable: false, evidenceResultIds: [], receiptRef: ricevuta, actualUsage: CONSUMO };
      if ((esiti.get(ctx.nodeId) ?? [])[n - 1] === 'auth') return { status: 'failed', errorClass: 'auth', retryable: false, evidenceResultIds: [], receiptRef: ricevuta, actualUsage: CONSUMO };
      return { status: 'completed', receiptRef: ricevuta, results: [], actualUsage: CONSUMO };
    },
    async reconcile() { return { outcome: 'proved_not_performed', receiptRef: null, resultIds: [], actualUsage: null }; },
    async cancel(ctx) { fermati.add(ctx.activityExecutionId); this.apri(ctx.nodeId); return { outcome: 'cancelled', evidenceResultIds: [] }; },
  };
}

// 15 s: nella suite intera (carico e un fsync a ogni fatto) 3 s non bastavano — misurato, due rosse solo lì
/* 01/10/2026: l'attesa conta il tempo SENZA progresso delle cartelle dati del banco (tests/aiuto/attesa-a-progresso.mjs). */
const { aspettaChe, segui } = creaAttesaAProgresso({ ms: 15_000 });

async function banco(t, { conRuntime = true } = {}) {
  const root = segui(mkdtempSync(join(tmpdir(), 'talos-workflow-http-run-control-')));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  const finto = adattatoreFinto();
  const capacita = createCapacitaAdattiva();
  const orchestrator = createWorkflowOrchestrator({ store, capacityFn: () => capacita.politica(),
    adapters: new Map([['agent-session', finto]]) });
  const errori = [];
  const scheduler = createWorkflowScheduler({ orchestrator, store, capacita, onErrore: (errore) => errori.push(errore) });
  await orchestrator.recover();
  const registry = { leggiSessioneContesto: (id) => ([sessionId, altraSessione].includes(id) ? { sessionId: id } : null) };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry, workflowStore: store,
    workflowRuntime: conRuntime ? { orchestrator, scheduler, capacita } : null, token: 'secret' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    scheduler.ferma();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    rimuoviCartellaDiProva(root);
  });
  const proposta = await proposeWorkflowFromTool(store, { sessionId, toolCallId: `call_${randomUUID()}`, draft: BOZZA,
    plannerModel: null, sessionModel: 'z-ai/glm-5.3-flash', modalitaOperativa: 'normale', agentRole: 'root' });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST',
    headers: { Cookie: 'talos_token=secret', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const get = (path) => fetch(base + path, { headers: { Cookie: 'talos_token=secret' } });
  const approva = () => approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: (id) => id === sessionId });
  const avvia = (commandId = randomUUID()) => post(`/api/v1/workflows/${proposta.workflowId}/versions/1/start`,
    { commandId, definitionHash: proposta.definitionHash });
  const stato = async (runId) => (await readRunState(store, { runId })).state;
  const controllo = (runId, azione, commandId = randomUUID(), sessione = sessionId, headers) =>
    post(`/api/v1/sessions/${sessione}/workflows/${runId}/${azione}`, { commandId }, headers);
  return { store, finto, errori, proposta, post, get, approva, avvia, stato, controllo, base };
}

test('WF-HTTP-START: the start route refuses what is not approved, starts an approved Workflow once per command, and the run really runs', async (t) => {
  const b = await banco(t);
  const senzaCookie = await fetch(`${b.base}/api/v1/workflows/${b.proposta.workflowId}/versions/1/start`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: randomUUID(), definitionHash: b.proposta.definitionHash }) });
  assert.equal(senzaCookie.status, 401);
  const nonApprovato = await b.avvia();
  assert.equal(nonApprovato.status, 409);
  assert.equal((await nonApprovato.json()).error.code, 'WORKFLOW_DEFINITION_NOT_APPROVED');
  assert.equal((await b.post(`/api/v1/workflows/${b.proposta.workflowId}/versions/1/start`,
    { commandId: randomUUID(), definitionHash: b.proposta.definitionHash, extra: 1 })).status, 400, 'exact body');
  assert.equal((await fetch(`${b.base}/api/v1/workflows/${b.proposta.workflowId}/versions/1/start`, { method: 'POST',
    headers: { Cookie: 'talos_token=secret', 'Content-Type': 'text/plain' }, body: '{}' })).status, 400, 'JSON only');
  assert.deepEqual(await listRunIds(b.store), [], 'nothing started by a refused command');

  await b.approva();
  const comando = randomUUID();
  const avvio = await b.avvia(comando);
  assert.equal(avvio.status, 202);
  const dati = (await avvio.json()).data;
  assert.equal(dati.receipt.commandId, comando);
  assert.equal(avvio.headers.get('idempotency-replayed'), null);
  const ripetuto = await b.avvia(comando);
  assert.equal(ripetuto.status, 202);
  assert.equal(ripetuto.headers.get('idempotency-replayed'), 'true', 'the replay says so');
  assert.equal((await ripetuto.json()).data.runId, dati.runId, 'one run per command');
  assert.ok(await aspettaChe(async () => (await b.stato(dati.runId)).run.status === 'succeeded'), 'the scheduler ran it to the end');
  assert.deepEqual(b.errori, []);
});

test('WF-HTTP-NO-RUNTIME: without the Workflow runtime, start and controls say «not available» and change nothing', async (t) => {
  const b = await banco(t, { conRuntime: false });
  await b.approva();
  const avvio = await b.avvia();
  assert.equal(avvio.status, 503);
  assert.equal((await avvio.json()).error.code, 'WORKFLOW_RUNTIME_NOT_READY');
  assert.deepEqual(await listRunIds(b.store), []);
  const pausa = await b.controllo(randomUUID(), 'pause');
  assert.equal(pausa.status, 503);
});

test('WF-HTTP-RUN-CONTROL: pause, resume and cancel over HTTP — owner session only, state conflicts are 409, foreign windows are 403', async (t) => {
  const b = await banco(t);
  await b.approva();
  b.finto.chiudi('uno');
  const runId = (await (await b.avvia()).json()).data.runId;
  assert.ok(await aspettaChe(() => b.finto.tentativi.get('uno') === 1), 'the step is at work');

  assert.equal((await b.controllo(runId, 'pause', randomUUID(), altraSessione)).status, 404, 'another session cannot see or command it');
  assert.equal((await b.controllo(randomUUID(), 'pause')).status, 404, 'unknown run');
  const straniera = await b.controllo(runId, 'pause', randomUUID(), sessionId, { Origin: 'http://evil.example' });
  assert.equal(straniera.status, 403);
  assert.equal((await straniera.json()).error.code, 'WORKFLOW_COMMAND_ORIGIN_FORBIDDEN');

  const pausa = await b.controllo(runId, 'pause');
  assert.equal(pausa.status, 202);
  assert.equal((await pausa.json()).data.action, 'pause');
  const ancora = await b.controllo(runId, 'pause');
  assert.equal(ancora.status, 409, 'already pausing');
  assert.equal((await ancora.json()).error.code, 'WORKFLOW_RUN_STATE_CONFLICT');
  b.finto.apri('uno');
  assert.ok(await aspettaChe(async () => (await b.stato(runId)).run.status === 'paused'));
  assert.equal(b.finto.tentativi.get('dopo'), undefined, 'nothing new started while paused');

  b.finto.chiudi('dopo');
  assert.equal((await b.controllo(runId, 'resume')).status, 202);
  assert.ok(await aspettaChe(() => b.finto.tentativi.get('dopo') === 1), 'resumed: «dopo» starts');
  assert.equal((await b.controllo(runId, 'cancel')).status, 202);
  assert.ok(await aspettaChe(async () => (await b.stato(runId)).run.status === 'cancelled'), 'cancel stops the step in progress');
  const finale = await b.stato(runId);
  assert.equal(finale.nodes.get('uno').state, 'succeeded');
  assert.equal(finale.nodes.get('dopo').state, 'cancelled');
  assert.equal((await b.controllo(runId, 'cancel')).status, 409, 'an ended run');
  assert.deepEqual(b.errori, []);
});

test('WF-HTTP-RETRY: the preview says which steps and how much the ceiling rises, then «Riprova» redoes only them', async (t) => {
  const b = await banco(t);
  await b.approva();
  b.finto.esiti.set('uno', ['auth']);
  const runId = (await (await b.avvia()).json()).data.runId;
  assert.ok(await aspettaChe(async () => (await b.stato(runId)).run.status === 'needs_attention'));
  const anteprima = await b.get(`/api/v1/sessions/${sessionId}/workflows/${runId}/retry-preview`);
  assert.equal(anteprima.status, 200);
  const dati = (await anteprima.json()).data;
  assert.equal(dati.schema, 'talos.workflow-retry-preview.v1');
  assert.deepEqual(dati.nodeIds, ['uno']);
  assert.ok(dati.ceilingRaise.promptTokens > 0, 'the raise is said before');
  assert.equal((await b.get(`/api/v1/sessions/${altraSessione}/workflows/${runId}/retry-preview`)).status, 404);

  const riprova = await b.controllo(runId, 'retry');
  assert.equal(riprova.status, 202);
  assert.ok(await aspettaChe(async () => (await b.stato(runId)).run.status === 'succeeded'), 'the failed step redone, then its dependent');
  const finale = await b.stato(runId);
  assert.equal(finale.budget.ceilingRaise.promptTokens, dati.ceilingRaise.promptTokens, 'exactly what the preview said');
  assert.deepEqual([b.finto.tentativi.get('uno'), b.finto.tentativi.get('dopo')], [2, 1]);
  assert.equal((await b.controllo(runId, 'retry')).status, 409, 'nothing left to retry');
  assert.deepEqual(b.errori, []);
});
