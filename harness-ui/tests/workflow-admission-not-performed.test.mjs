// Riparazione D3, 24/09/2026 — portato qui dalla revisione avversaria del 23/09
// (`tests/red/rev-wf-admission-not-performed-red.test.mjs`). Un'Activity riconciliata
// «proved_not_performed» deve liberare slot globale e riserva di budget con
// budget_released(reason='reconciled_not_performed'), con o senza receiptRef; prima restava
// bloccata (receiptRef null) o scriveva capacity_released e poi falliva il saldo (receiptRef presente).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import { createCapacitaAdattiva, createWorkflowScheduler } from '../src/workflow/scheduler.mjs';
import { appendEvent, approveDefinition, createDefinition, createRun, createWorkflowStore, readEvents } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const definitionRecord = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));
const ROOT = '40000000-0000-4000-8000-000000000001';
const ev = (runId, seq, type, payload = {}, o = {}) => ({ schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
  eventId: randomUUID(), runId, seq, at: `2026-09-22T13:00:${String(seq).padStart(2, '0')}.000Z`, type, nodeId: null,
  commandId: null, commandType: null, commandPayloadHash: null, causationId: null, correlationId: runId, graphVersion: 1,
  activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null, payload, ...o });
const created = (runId) => ev(runId, 1, 'run_created', { workflowId: definitionRecord.workflowId, definitionVersion: definitionRecord.version,
  definitionHash: definitionRecord.definitionHash, rootSessionId: ROOT, workspaceBaselineId: null, workspaceBaselineHash: null },
{ commandId: randomUUID(), commandType: 'start-run', commandPayloadHash: `sha256:${'d'.repeat(64)}` });
const capacity = () => ({ globalAgents: 1, globalWriters: 0, localProcesses: 0, perProvider: new Map([['openai', 1]]),
  perModel: new Map([['openai', new Map([['gpt-5-nano', 1]])]]), perWorkspaceWriters: new Map() });
const admission = (runId) => ({ runId, nodeId: 'implement', provider: 'openai', model: 'gpt-5-nano', workspaceRoot: null,
  agentSlots: 1, writerSlots: 0, localProcessSlots: 0,
  reserved: { promptTokens: 60_000, completionTokens: 0, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null } });

for (const receiptRef of [null, 'receipt://provider/not-performed']) {
  test(`WF-ADMISSION-NOT-PERFORMED-FREES-SLOT (receiptRef=${receiptRef})`, async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'talos-workflow-not-performed-'));
    const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
    t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
    await createDefinition(store, { record: definitionRecord });
    await approveDefinition(store, { approval });
    const runId = randomUUID(); const second = randomUUID();
    for (const id of [runId, second]) { await createRun(store, { event: created(id) }); await appendEvent(store, { event: ev(id, 2, 'run_started') }); }
    const agent = { id: 'agent-integration-adapter',
      async execute() { return { status: 'uncertain', reasonClass: 'transport_ambiguous', observedReceiptRef: null, actualUsage: null }; },
      async reconcile() { return { outcome: 'proved_not_performed', receiptRef, resultIds: [], actualUsage: null }; },
      async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; } };
    const orch = createWorkflowOrchestrator({ store, adapters: new Map([['agent-session', agent]]), capacityFn: capacity });
    await orch.recover();
    const admitted = await orch.admitActivity(admission(runId));
    const out = await orch.executeNode({ runId, nodeId: 'implement', activityKind: 'agent-session', resourceClass: 'agent',
      idempotencyKey: `${runId}/implement/1`, budgetReservationId: admitted.budgetReservationId, deadlineAt: null,
      preparedIdentity: admitted.preparedIdentity });
    assert.equal(out.status, 'uncertain');
    const rec = await orch.reconcileActivity({ runId, activityExecutionId: admitted.preparedIdentity.activityExecutionId });
    assert.equal(rec.outcome, 'proved_not_performed');
    // Atteso dal contratto (budget.mjs:RELEASE_REASONS 'reconciled_not_performed'): lo slot si libera.
    await orch.releaseAdmission({ runId, claimId: admitted.claimId });
    const facts = await readEvents(store, { runId });
    assert.equal(facts.filter((e) => e.type === 'capacity_released').length, 1);
    assert.deepEqual(facts.filter((e) => e.type === 'budget_released').map((e) => e.payload.reason), ['reconciled_not_performed']);
    assert.equal(facts.filter((e) => e.type === 'budget_settled').length, 0);
    // Il rilascio è idempotente: una seconda chiamata (ripresa dopo un crash) non scrive altro.
    await orch.releaseAdmission({ runId, claimId: admitted.claimId });
    assert.equal((await readEvents(store, { runId })).length, facts.length);
    const next = await orch.admitActivity(admission(second));
    assert.equal(typeof next.claimId, 'string');
  });
}

/*
 * C3 tappa 5 (09/10/2026, prova dal vivo con glm-5.3-flash sulla 4177) — un tentativo FALLITO prima che la sua sessione esistesse
 *   (il server era ripartito senza la chiave del fornitore): `activity_failed` senza consumo né ricevuta, nessun
 *   `agent_session_created`. `releaseAdmission` scriveva `capacity_released` e poi il saldo lanciava (consumo sconosciuto): la
 *   riserva restava aperta e il passo «still being settled» per sempre, con «Segna come fatto», «Metti da parte» e «Rifai»
 *   rifiutati (misurato dal giornale vero). Ora si RILASCIA (`failed_before_session`), come `spawn_failed` di Hermes.
 *   Al contrario: un fallimento CON consumo resta un saldo, e il motivo non si può usare se la sessione è nata.
 */
for (const caso of ['prima-della-sessione', 'con-consumo']) {
  test(`C3-FAILED-BEFORE-SESSION-RELEASES (${caso})`, async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'talos-workflow-before-session-'));
    const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
    t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
    await createDefinition(store, { record: definitionRecord });
    await approveDefinition(store, { approval });
    const runId = randomUUID();
    await createRun(store, { event: created(runId) }); await appendEvent(store, { event: ev(runId, 2, 'run_started') });
    const consumo = { promptTokens: 1200, completionTokens: 80, wallMs: 900, agentSeconds: 1, toolCalls: 0, modelRequests: 1, knownCostUsd: null };
    const agent = { id: 'agent-integration-adapter',
      async execute() {
        return caso === 'prima-della-sessione'
          ? { status: 'failed', errorClass: 'internal', retryable: false, evidenceResultIds: [], receiptRef: null, actualUsage: null }
          : { status: 'failed', errorClass: 'internal', retryable: false, evidenceResultIds: [], receiptRef: 'receipt://provider/failed', actualUsage: consumo };
      },
      async reconcile() { return { outcome: 'proved_not_performed', receiptRef: null, resultIds: [], actualUsage: null }; },
      async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; } };
    const orch = createWorkflowOrchestrator({ store, adapters: new Map([['agent-session', agent]]), capacityFn: capacity });
    await orch.recover();
    const admitted = await orch.admitActivity(admission(runId));
    const out = await orch.executeNode({ runId, nodeId: 'implement', activityKind: 'agent-session', resourceClass: 'agent',
      idempotencyKey: `${runId}/implement/1`, budgetReservationId: admitted.budgetReservationId, deadlineAt: null,
      preparedIdentity: admitted.preparedIdentity });
    assert.equal(out.status, 'failed');
    await orch.releaseAdmission({ runId, claimId: admitted.claimId });
    const facts = await readEvents(store, { runId });
    assert.equal(facts.filter((e) => e.type === 'capacity_released').length, 1);
    if (caso === 'prima-della-sessione') {
      assert.deepEqual(facts.filter((e) => e.type === 'budget_released').map((e) => e.payload.reason), ['failed_before_session']);
      assert.equal(facts.filter((e) => e.type === 'budget_settled').length, 0);
    } else {
      assert.equal(facts.filter((e) => e.type === 'budget_released').length, 0, 'a failure that spent something is settled, not released');
      assert.equal(facts.filter((e) => e.type === 'budget_settled').length, 1);
    }
    // in tutti e due i casi la riserva è chiusa: il passo fallito si può decidere
    assert.equal(facts.filter((e) => e.type === 'budget_released' || e.type === 'budget_settled').length, 1);
  });
}

/* Review Y3 del bugfixer (09/10/2026): la RIPARAZIONE dei run già bloccati, con lo stato scritto a mano come lo lasciava il codice di
   prima — slot rilasciato (`capacity_released`) e la riserva aperta, perché il saldo era fallito. `releaseAdmission`, che chiamano
   sia lo scheduler (`rilasciaPosti`) sia le azioni sul passo, la chiude col rilascio `failed_before_session`. */
for (const via of ['releaseAdmission']) {
test(`C3-REPAIR-STUCK-RESERVATION: a released slot whose reservation stayed open (the old failed settlement) is closed by ${via}`, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-stuck-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  await createDefinition(store, { record: definitionRecord });
  await approveDefinition(store, { approval });
  const runId = randomUUID();
  await createRun(store, { event: created(runId) }); await appendEvent(store, { event: ev(runId, 2, 'run_started') });
  const agent = { id: 'agent-integration-adapter',
    async execute() { return { status: 'failed', errorClass: 'internal', retryable: false, evidenceResultIds: [], receiptRef: null, actualUsage: null }; },
    async reconcile() { return { outcome: 'proved_not_performed', receiptRef: null, resultIds: [], actualUsage: null }; },
    async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; } };
  const orch = createWorkflowOrchestrator({ store, adapters: new Map([['agent-session', agent]]), capacityFn: capacity });
  await orch.recover();
  const admitted = await orch.admitActivity(admission(runId));
  await orch.executeNode({ runId, nodeId: 'implement', activityKind: 'agent-session', resourceClass: 'agent',
    idempotencyKey: `${runId}/implement/1`, budgetReservationId: admitted.budgetReservationId, deadlineAt: null,
    preparedIdentity: admitted.preparedIdentity });
  // lo stato bloccato, a mano: il rilascio dello slot che il codice di prima scriveva PRIMA del saldo che poi falliva
  const prima = await readEvents(store, { runId });
  const preso = prima.find((e) => e.type === 'capacity_claimed');
  // la busta del `capacity_claimed` vero (schema e versioni dell'orchestratore), con il tipo e il carico del rilascio
  await appendEvent(store, { event: { ...preso, eventId: randomUUID(), seq: prima.length + 1, at: new Date().toISOString(),
    type: 'capacity_released', causationId: null, payload: { claimId: admitted.claimId, reason: 'activity_terminal' } } });
  const bloccato = await readEvents(store, { runId });
  assert.equal(bloccato.filter((e) => e.type === 'budget_released' || e.type === 'budget_settled').length, 0, 'premise: the reservation is open');
  if (via === 'releaseAdmission') await orch.releaseAdmission({ runId, claimId: admitted.claimId });
  else {
    // review Y1: lo SCHEDULER ripara da solo all'avvio (`rilasciaPosti`), senza nessuna azione della persona
    const errori = [];
    const scheduler = createWorkflowScheduler({ orchestrator: orch, store, capacita: createCapacitaAdattiva(), onErrore: (e) => errori.push(e),
      timerFn: () => null, clearTimerFn: () => {} });
    t.after(() => scheduler.ferma());
    await scheduler.avvia();
    for (let i = 0; i < 100 && !(await readEvents(store, { runId })).some((e) => e.type === 'budget_released'); i += 1) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(errori, []);
  }
  const dopo = await readEvents(store, { runId });
  assert.deepEqual(dopo.filter((e) => e.type === 'budget_released').map((e) => e.payload.reason), ['failed_before_session']);
  assert.equal(dopo.filter((e) => e.type === 'capacity_released').length, 1, 'the slot is not released twice');
});
}

test('C3-DECLARED-NO-USAGE: only a v2 failure that DECLARES usage and receipt absent counts (a v1 fact has no such keys)', async () => {
  const { fallitoSenzaConsumoDichiarato } = await import('../src/workflow/budget.mjs');
  const v2 = { type: 'activity_failed', eventSchemaVersion: 2, payload: { actualUsage: null, receiptRef: null, errorClass: 'internal' } };
  assert.equal(fallitoSenzaConsumoDichiarato(v2), true);
  assert.equal(fallitoSenzaConsumoDichiarato({ ...v2, eventSchemaVersion: 1, payload: { errorClass: 'internal' } }), false, 'v1: the keys are missing, not null');
  assert.equal(fallitoSenzaConsumoDichiarato({ ...v2, payload: { errorClass: 'internal' } }), false, 'v2 without the keys');
  assert.equal(fallitoSenzaConsumoDichiarato({ ...v2, payload: { ...v2.payload, actualUsage: { promptTokens: 1 } } }), false, 'with usage');
  assert.equal(fallitoSenzaConsumoDichiarato({ ...v2, type: 'activity_completed' }), false);
});

/* Review Y1 del bugfixer: lo SCHEDULER ripara da solo, all'avvio e a ogni giro (`rilasciaPosti`), un posto rilasciato con la riserva
   aperta e il tentativo chiuso — senza nessuna azione della persona, così si sblocca anche «Riprova». Lo scheduler guida solo i run
   v2 coi passi `agent` in lettura: qui un orchestratore finto gli dà ESATTAMENTE lo stato bloccato del giornale vero, e si guarda che
   chiami `releaseAdmission` per quel posto. Al contrario: un posto rilasciato con la riserva già chiusa non si tocca. */
const cartelleDaTogliere = [];
const segnaCartella = (c) => { cartelleDaTogliere.push(c); return c; };
test.after(() => { for (const c of cartelleDaTogliere) rimuoviCartellaDiProva(c); });
for (const riservaAperta of [true, false]) {
  test(`C3-REPAIR-BY-SCHEDULER (reservation ${riservaAperta ? 'open' : 'closed'})`, async (t) => {
    const runId = randomUUID(); const claimId = randomUUID(); const reservationId = randomUUID(); const activityExecutionId = randomUUID();
    const run = Object.freeze({
      definition: { definitionSchemaVersion: 2, nodes: [{ id: 'leggi', kind: 'agent', capabilityProfile: 'read' }] },
      state: {
        run: { runId, status: 'needs_attention', needsAttentionReasons: ['node_failed'] },
        nodes: new Map([['leggi', { nodeId: 'leggi', state: 'failed', attempt: 2 }]]),
        activities: new Map([[activityExecutionId, { activityExecutionId, nodeId: 'leggi', attempt: 2, state: 'failed' }]]),
        capacityClaims: new Map([[claimId, { claimId, nodeId: 'leggi', attempt: 2, activityExecutionId, state: 'released', budgetReservationId: reservationId }]]),
        budget: { reservations: new Map(riservaAperta ? [[reservationId, { reservationId }]] : []) },
      },
    });
    const rilasciati = [];
    const orchestrator = new Proxy({
      async readRun() { return run; },
      async releaseAdmission(input) { rilasciati.push(input); return { state: 'released' }; },
    }, { get: (o, nome) => (nome in o ? o[nome] : async () => null) });
    const store = await createWorkflowStore({ workflowDataRoot: segnaCartella(mkdtempSync(join(tmpdir(), 'talos-wf-sched-repair-'))), workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
    t.after(async () => { await store.close(); });
    const errori = [];
    const scheduler = createWorkflowScheduler({ orchestrator, store, capacita: createCapacitaAdattiva(), onErrore: (e) => errori.push(e),
      timerFn: () => null, clearTimerFn: () => {} });
    t.after(() => scheduler.ferma());
    await scheduler.avvia();
    scheduler.sveglia(runId);
    for (let i = 0; i < 50 && rilasciati.length === 0 && riservaAperta; i += 1) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual(rilasciati.map((r) => r.claimId), riservaAperta ? [claimId] : []);
    assert.deepEqual(errori.filter((e) => e?.code !== undefined && e.code !== 'WORKFLOW_RUN_NOT_RUNNABLE_HERE'), []);
  });
}

/* Review della v2 (bugfixer, non bloccante): il verso contrario di `agent`, su `releaseBudget` che è pura. Lo stesso tentativo
   «fallito senza sessione e senza consumo dichiarato» si rilascia solo se il passo è un agente; un passo `test` (un comando, non
   un fornitore) no: per lui «nessuna sessione» non dice niente sulla spesa. */
test('C3-FAILED-BEFORE-SESSION-AGENT-ONLY: the same proof on a non-agent step is refused', async () => {
  const { releaseBudget } = await import('../src/workflow/budget.mjs');
  const reservationId = randomUUID(); const activityExecutionId = randomUUID(); const runId = randomUUID();
  const stato = (kind) => ({
    run: { runId },
    definition: { nodes: [{ id: 'passo', kind }] },
    budget: { reservations: new Map([[reservationId, { reservationId, runId, nodeId: 'passo', activityExecutionId }]]) },
    activities: new Map([[activityExecutionId, { activityExecutionId, nodeId: 'passo', state: 'failed' }]]),
  });
  const eventi = [{ type: 'activity_failed', eventSchemaVersion: 2, activityExecutionId, payload: { actualUsage: null, receiptRef: null, errorClass: 'internal' } }];
  assert.deepEqual(releaseBudget({ state: stato('agent'), events: eventi, reservationId, reason: 'failed_before_session' }).payload,
    { reservationId, reason: 'failed_before_session' });
  assert.throws(() => releaseBudget({ state: stato('test'), events: eventi, reservationId, reason: 'failed_before_session' }),
    { code: 'WORKFLOW_BUDGET_EFFECT_NOT_EXCLUDED' });
  assert.throws(() => releaseBudget({ state: stato('agent'), events: [...eventi, { type: 'agent_session_created', activityExecutionId }], reservationId, reason: 'failed_before_session' }),
    { code: 'WORKFLOW_BUDGET_EFFECT_NOT_EXCLUDED' }, 'a session was born: the proof does not hold');
});
