import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { canonicalHash, canonicalJson } from '../src/workflow/canonical-json.mjs';
import { upgradeEvent } from '../src/workflow/migrations.mjs';
import { workflowReplay, workflowStateHash } from '../src/workflow/run.mjs';
import {
  appendEvent,
  approveDefinition,
  createDefinition,
  createRun,
  createWorkflowStore,
  listRunsForSession,
  lookupCommandReceipt,
  readDefinition,
  readDefinitionApproval,
  readEvents,
  readSnapshot,
  writeCheckpoint,
} from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { cartellaDiProva, cartellaDiProvaAttesa } from './aiuto/cartelle-di-prova.mjs'; // DESK-TEMP-1, 23/09: la cartella nasce con la sua rimozione

const definitionRecord = JSON.parse(await readFile(
  new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url),
  'utf8',
));
const approval = JSON.parse(await readFile(
  new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url),
  'utf8',
));
const ROOT_SESSION_ID = '40000000-0000-4000-8000-000000000001';

function tempRoot(prefix = 'talos-workflow-store-') {
  return cartellaDiProva(prefix);
}

async function openStore(root, deps = {}) {
  return createWorkflowStore({
    workflowDataRoot: root,
    workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 },
  }, deps);
}

function event(runId, seq, type, payload = {}, overrides = {}) {
  return {
    schema: 'talos.workflow-event.v1',
    eventSchemaVersion: 1,
    engineSchemaVersion: 1,
    eventId: randomUUID(),
    runId,
    seq,
    at: `2026-09-22T10:00:${String(seq).padStart(2, '0')}.000Z`,
    type,
    nodeId: null,
    commandId: null,
    commandType: null,
    commandPayloadHash: null,
    causationId: null,
    correlationId: runId,
    graphVersion: 1,
    activityExecutionId: null,
    attempt: null,
    leaseId: null,
    leaseEpoch: null,
    payload,
    ...overrides,
  };
}

function runCreated(runId) {
  return event(runId, 1, 'run_created', {
    workflowId: definitionRecord.workflowId,
    definitionVersion: definitionRecord.version,
    definitionHash: definitionRecord.definitionHash,
    rootSessionId: ROOT_SESSION_ID,
    workspaceBaselineId: null,
    workspaceBaselineHash: null,
  }, {
    commandId: randomUUID(),
    commandType: 'start-run',
    commandPayloadHash: `sha256:${'c'.repeat(64)}`,
  });
}

async function prepareRun(store, runId = randomUUID()) {
  await createDefinition(store, { record: definitionRecord });
  await approveDefinition(store, { approval });
  await createRun(store, { event: runCreated(runId) });
  return runId;
}

function overrun(runId, seq) {
  return event(runId, seq, 'budget_overrun_observed', {
    reservationId: null, source: 'provider_receipt', dimensions: ['toolCalls'],
    observed: { promptTokens: 0, completionTokens: 0, wallMs: 0, agentSeconds: 0,
      toolCalls: 1, modelRequests: 0, knownCostUsd: null },
  });
}

function corruptFirstJournalRecord(root, runId) {
  const journal = join(root, 'runs', runId, 'journal', '000001.jsonl');
  const lines = readFileSync(journal, 'utf8').trimEnd().split('\n');
  const first = JSON.parse(lines[0]);
  first.event.at = '2026-09-22T11:11:11.111Z';
  lines[0] = canonicalJson(first);
  writeFileSync(journal, `${lines.join('\n')}\n`, 'utf8');
  utimesSync(journal, new Date('2030-01-01T00:00:00.000Z'), new Date('2030-01-01T00:00:00.000Z'));
}

test('WF-APPROVAL-READ-RELOAD: validated approval stays readable after restart', async (t) => {
  const root = tempRoot('talos-store-approval-read-');
  let store = await openStore(root);
  t.after(async () => { if (store.state !== 'closed') await store.close(); rimuoviCartellaDiProva(root); });
  await createDefinition(store, { record: definitionRecord });
  await assert.rejects(
    () => readDefinitionApproval(store, { workflowId: definitionRecord.workflowId, version: definitionRecord.version }),
    (error) => error?.code === 'WORKFLOW_APPROVAL_NOT_FOUND',
  );
  await approveDefinition(store, { approval });
  assert.deepEqual(await readDefinitionApproval(store, {
    workflowId: definitionRecord.workflowId, version: definitionRecord.version,
  }), approval);
  await store.close();
  store = await openStore(root);
  assert.deepEqual(await readDefinitionApproval(store, {
    workflowId: definitionRecord.workflowId, version: definitionRecord.version,
  }), approval);
});

test('STORE-CACHE-ACTIVE-APPEND-LINEAR-UPGRADE', async (t) => {
  const root = tempRoot('talos-store-cache-linear-');
  let upgrades = 0;
  const store = await openStore(root, { upgradeEventFn: (value) => { upgrades += 1; return upgradeEvent(value); } });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  upgrades = 0;
  for (let seq = 2; seq <= 31; seq += 1) await appendEvent(store, { event: overrun(runId, seq) });
  assert.ok(upgrades <= 35, `30 appends revalidated ${upgrades} events; append must not replay the entire prefix`);
  assert.equal((await readEvents(store, { runId })).length, 31);
});

test('STORE-CACHE-STARTUP-SEED-LINEAR-UPGRADE / STORE-CACHE-RESTART-HASH-EQUALITY', async (t) => {
  const root = tempRoot('talos-store-cache-restart-');
  let store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  await appendEvent(store, { event: overrun(runId, 2) });
  const expectedHash = workflowStateHash(workflowReplay({
    definition: definitionRecord.core, runId, events: await readEvents(store, { runId }),
  }));
  await store.close();
  let upgrades = 0;
  store = await openStore(root, { upgradeEventFn: (value) => { upgrades += 1; return upgradeEvent(value); } });
  assert.equal(store.state, 'ready');
  assert.equal(upgrades, 2, 'startup must fully validate existing journal events');
  upgrades = 0;
  await appendEvent(store, { event: overrun(runId, 3) });
  assert.equal(upgrades, 1, 'the first append after verified startup must use seeded replay state');
  const events = await readEvents(store, { runId });
  assert.equal(events.length, 3);
  const prefix = workflowReplay({ definition: definitionRecord.core, runId, events: events.slice(0, 2) });
  assert.equal(workflowStateHash(prefix), expectedHash);
});

test('STORE-CACHE-LIVE-MIDDLE-TAMPER-FAIL-CLOSED', async (t) => {
  const root = tempRoot('talos-store-cache-tamper-');
  const store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  await appendEvent(store, { event: overrun(runId, 2) });
  corruptFirstJournalRecord(root, runId);
  await assert.rejects(() => appendEvent(store, { event: overrun(runId, 3) }),
    (error) => error?.code === 'WORKFLOW_JOURNAL_CHANGED');
  assert.equal(store.state, 'needs_attention');
});

test('STORE-CACHE-EXPLICIT-READ-QUARANTINES', async (t) => {
  const root = tempRoot('talos-store-cache-read-tamper-');
  const store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  await appendEvent(store, { event: overrun(runId, 2) });
  corruptFirstJournalRecord(root, runId);
  await assert.rejects(() => readEvents(store, { runId }), (error) => error?.code === 'WORKFLOW_JOURNAL_CORRUPT');
  assert.equal(store.state, 'needs_attention');
  await assert.rejects(() => appendEvent(store, { event: overrun(runId, 3) }),
    (error) => error?.code === 'WORKFLOW_STORE_NEEDS_ATTENTION');
});

test('STORE-CACHE-SNAPSHOT-READ-QUARANTINES', async (t) => {
  const root = tempRoot('talos-store-cache-snapshot-tamper-');
  const store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  corruptFirstJournalRecord(root, runId);
  await assert.rejects(() => readSnapshot(store, { runId }), (error) => error?.code === 'WORKFLOW_JOURNAL_CORRUPT');
  assert.equal(store.state, 'needs_attention');
});

test('STORE-CACHE-FAILED-APPEND-REHYDRATES-AND-REPAIRS-TAIL', async (t) => {
  const root = tempRoot('talos-store-cache-failure-');
  const store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  store.failpoint = async (name) => {
    if (name === 'store.journal.before_append') throw new Error('injected before-append failure');
  };
  await assert.rejects(() => appendEvent(store, { event: overrun(runId, 2) }), /injected before-append failure/);
  store.failpoint = undefined;
  const journal = join(root, 'runs', runId, 'journal', '000001.jsonl');
  writeFileSync(journal, Buffer.concat([readFileSync(journal), Buffer.from('{"seq":2', 'utf8')]));
  await appendEvent(store, { event: overrun(runId, 2) });
  assert.equal((await readEvents(store, { runId })).length, 2);
  assert.equal(readFileSync(journal, 'utf8').endsWith('\n'), true);
});

test('STORE-CACHE-MULTISEGMENT-APPEND-USES-LAST', async (t) => {
  const root = tempRoot('talos-store-cache-segment-');
  let store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  const second = join(root, 'runs', runId, 'journal', '000002.jsonl');
  writeFileSync(second, '');
  await store.close();
  store = await openStore(root);
  assert.equal(store.state, 'ready');
  await appendEvent(store, { event: overrun(runId, 2) });
  assert.ok(readFileSync(second).byteLength > 0, 'append must target the verified final segment');
  assert.equal((await readEvents(store, { runId })).length, 2);
});

test('STORE-CACHE-INVALID-CANDIDATE-DOES-NOT-QUARANTINE', async (t) => {
  const root = tempRoot('talos-store-cache-candidate-');
  const store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  await assert.rejects(() => appendEvent(store, { event: event(runId, 2, 'run_succeeded', {
    finalResultIds: [], integrationCommit: null,
  }) }), (error) => error?.code === 'WORKFLOW_JOURNAL_CORRUPT');
  assert.equal(store.state, 'ready', 'an invalid caller event is not on disk and cannot corrupt the journal');
  await appendEvent(store, { event: event(runId, 2, 'run_started') });
  assert.equal((await readEvents(store, { runId })).length, 2);
});

test('STORE-CACHE-NOT-CALLER-CONTROLLED', async (t) => {
  const root = tempRoot('talos-store-cache-private-');
  const store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  assert.equal(Object.hasOwn(store, 'runCache'), false);
  store.runCache = new Map([[runId, { state: { lastSeq: 999 }, lastHash: 'GENESIS', stamp: null }]]);
  await appendEvent(store, { event: event(runId, 2, 'run_started') });
  assert.equal((await readEvents(store, { runId })).length, 2);
});

test('CAPACITY-MIXED-V1-V2-JOURNAL-REPLAY — raw hashes and active slots survive close/reopen', async (t) => {
  const root = tempRoot('talos-capacity-journal-');
  let store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  const identity = {
    nodeId: 'implement', activityExecutionId: randomUUID(), attempt: 1,
    leaseId: randomUUID(), leaseEpoch: 1,
  };
  const reservationId = randomUUID();
  const claimId = randomUUID();
  await appendEvent(store, { event: event(runId, 2, 'run_started') });
  await appendEvent(store, { event: event(runId, 3, 'budget_reserved', {
    schema: 'talos.workflow-budget-reservation.v1', reservationId, runId,
    nodeId: identity.nodeId, activityExecutionId: identity.activityExecutionId,
    leaseId: identity.leaseId, leaseEpoch: identity.leaseEpoch,
    reserved: { promptTokens: 0, completionTokens: 0, wallMs: 0,
      agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null },
    state: 'reserved', actual: null, reservedAt: '2026-09-22T10:00:03.000Z', settledAt: null,
  }) });
  const claimed = event(runId, 4, 'capacity_claimed', {
    schema: 'talos.workflow-capacity-claim.v1', claimId, budgetReservationId: reservationId,
    provider: null, model: null, workspaceRoot: 'C:\\workspace',
    agentSlots: 0, writerSlots: 1, localProcessSlots: 0,
  }, { schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...identity });
  await appendEvent(store, { event: claimed });
  const journal = join(root, 'runs', runId, 'journal', '000001.jsonl');
  const rawBefore = readFileSync(journal);
  const records = rawBefore.toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
  for (let i = 0; i < records.length; i += 1) {
    assert.equal(records[i].prevRecordHash, i === 0 ? 'GENESIS' : records[i - 1].recordHash);
    assert.equal(records[i].recordHash, canonicalHash({
      seq: records[i].seq, event: records[i].event, prevRecordHash: records[i].prevRecordHash,
    }));
  }
  const before = workflowReplay({ definition: definitionRecord.core, runId, events: await readEvents(store, { runId }) });
  assert.equal(before.capacityClaims.get(claimId).state, 'active');
  const beforeHash = workflowStateHash(before);
  await store.close();
  store = await openStore(root);
  const replayed = await readEvents(store, { runId });
  const after = workflowReplay({ definition: definitionRecord.core, runId, events: replayed });
  assert.equal(after.capacityClaims.get(claimId).writerSlots, 1);
  assert.equal(workflowStateHash(after), beforeHash);
  assert.deepEqual(readFileSync(journal), rawBefore);
});

test('M043_STORE_INSIDE_OWNER_WORKSPACE — location and mandatory composition limits fail closed before ownership', async () => {
  const workspace = tempRoot('talos-workspace-');
  const nested = join(workspace, '.talos-workflows');
  await assert.rejects(
    () => createWorkflowStore({ workflowDataRoot: nested, workspaceRoots: [workspace], resultLimits: { maxItemBytes: 1, maxRunBytes: 2 } }),
    (error) => error?.code === 'WORKFLOW_STORE_LOCATION_INVALID',
  );
  await assert.rejects(
    () => createWorkflowStore({ workflowDataRoot: tempRoot(), workspaceRoots: [] }),
    (error) => error?.code === 'WORKFLOW_LIMIT_INVALID',
  );
  assert.equal(existsSync(join(nested, 'owner.json')), false);
  rimuoviCartellaDiProva(workspace);
});

test('STORE-ROOT-REALPATH — a symlink or junction cannot create the data root inside a workspace', async (t) => {
  const workspace = tempRoot('talos-real-workspace-');
  const outside = tempRoot('talos-workspace-alias-');
  const alias = join(outside, 'workspace-alias');
  try {
    symlinkSync(workspace, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    rimuoviCartellaDiProva(outside);
    rimuoviCartellaDiProva(workspace);
    t.skip(`platform cannot create the test alias: ${error.code ?? error.message}`);
    return;
  }
  t.after(() => { rimuoviCartellaDiProva(outside); rimuoviCartellaDiProva(workspace); });
  const hiddenInsideWorkspace = join(alias, 'must-not-be-created');
  await assert.rejects(
    () => createWorkflowStore({
      workflowDataRoot: hiddenInsideWorkspace,
      workspaceRoots: [workspace],
      resultLimits: { maxItemBytes: 1, maxRunBytes: 2 },
    }),
    (error) => error?.code === 'WORKFLOW_STORE_LOCATION_INVALID',
  );
  assert.equal(existsSync(join(workspace, 'must-not-be-created')), false);
});

test('STORE-DEFINITION — immutable global Definition, approval and run copy preserve exact contracts', async (t) => {
  const root = tempRoot();
  const store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });

  const created = await createDefinition(store, { record: definitionRecord });
  assert.deepEqual(created, definitionRecord);
  assert.deepEqual(await createDefinition(store, { record: definitionRecord }), definitionRecord);
  assert.deepEqual(await readDefinition(store, {
    workflowId: definitionRecord.workflowId,
    version: definitionRecord.version,
  }), definitionRecord);
  await assert.rejects(
    () => createDefinition(store, { record: { ...definitionRecord, proposal: { ...definitionRecord.proposal, createdAt: '2026-09-20T12:00:01.000Z' } } }),
    (error) => error?.code === 'WORKFLOW_DEFINITION_CONFLICT',
  );

  assert.deepEqual(await approveDefinition(store, { approval }), approval);
  assert.deepEqual(await approveDefinition(store, { approval }), approval);
  const runId = randomUUID();
  const createdEvent = runCreated(runId);
  await createRun(store, { event: createdEvent });
  const globalBytes = readFileSync(join(root, 'definitions', definitionRecord.workflowId, '1', 'record.json'));
  const runBytes = readFileSync(join(root, 'runs', runId, 'definition', 'record.json'));
  assert.deepEqual(runBytes, globalBytes);
  assert.deepEqual(await readEvents(store, { runId }), [createdEvent]);
});

test('STORE-JOURNAL-CHAIN / M016 — per-run queue, replay validation and receipts use durable facts', async (t) => {
  const root = tempRoot();
  let upgraded = 0;
  let store = await openStore(root, {
    upgradeEventFn: (value) => { upgraded += 1; return upgradeEvent(value); },
  });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  const started = event(runId, 2, 'run_started');
  const nodeStarted = event(runId, 3, 'node_started', { trigger: 'deterministic' }, { nodeId: 'implement' });
  await Promise.all([
    appendEvent(store, { event: started }),
    appendEvent(store, { event: nodeStarted }),
  ]);

  const events = await readEvents(store, { runId });
  assert.deepEqual(events, [events[0], started, nodeStarted]);
  assert.deepEqual(await listRunsForSession(store, { rootSessionId: ROOT_SESSION_ID }), [runId]);

  const approvalReceipt = await lookupCommandReceipt(store, { commandId: approval.commandId });
  assert.deepEqual(approvalReceipt, {
    schema: 'talos.workflow-command-receipt.v1',
    commandId: approval.commandId,
    commandType: 'approve-definition',
    payloadHash: approval.commandPayloadHash,
    acceptedAt: approval.approvedAt,
    source: 'approval-record',
    runId: null, // F3-31 (25/09/2026): un'approvazione non appartiene a nessun run
    resultingSeq: null,
    resultingGraphVersion: null,
    outcome: 'accepted',
    errorCode: null,
  });
  const runReceipt = await lookupCommandReceipt(store, { commandId: events[0].commandId });
  assert.equal(runReceipt.resultingSeq, 1);
  assert.equal(runReceipt.runId, runId, 'F3-31: the receipt of a journal fact names its run');
  assert.equal(runReceipt.source, 'journal-event');

  const lines = readFileSync(join(root, 'runs', runId, 'journal', '000001.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines[0].prevRecordHash, 'GENESIS');
  assert.equal(lines[1].prevRecordHash, lines[0].recordHash);
  assert.equal(lines[2].prevRecordHash, lines[1].recordHash);

  /*
   * ⭐ F3-41b (25/09/2026): nel processo che li ha scritti, gli eventi si leggono dalla cache verificata dello Store — ognuno ha
   *   attraversato `upgradeEvent` quando è stato scritto o letto la prima volta dal disco, quindi una seconda lettura non lo
   *   riattraversa (qui la prova contava 3 a ogni lettura). Ciò che questa asserzione protegge è il RIGIOCO dal disco: un
   *   processo nuovo sullo stesso Store deve far passare OGNI evento salvato da `upgradeEvent`. Si contano i `seq` visti.
   */
  upgraded = 0;
  await store.close();
  const visti = new Set();
  store = await openStore(root, { upgradeEventFn: (value) => { upgraded += 1; visti.add(value?.seq); return upgradeEvent(value); } });
  assert.deepEqual(await readEvents(store, { runId }), events);
  assert.deepEqual([...visti].sort(), [1, 2, 3], 'every stored v1 event must cross upgradeEvent during a cold replay');
});

test('F3-41b STORE-READ-CACHE-SEES-EXTERNAL-CHANGE — a journal changed on disk is never served from the read cache', async (t) => {
  const root = tempRoot();
  const store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  await appendEvent(store, { event: event(runId, 2, 'run_started') });
  assert.equal((await readEvents(store, { runId })).length, 2, 'the cached read works');
  // qualcuno riscrive il giornale fuori dallo Store: la stessa riga con un campo cambiato (la catena delle impronte si rompe)
  const journal = join(root, 'runs', runId, 'journal', '000001.jsonl');
  const righe = readFileSync(journal, 'utf8').trim().split('\n').map(JSON.parse);
  righe[1].event.at = '2020-01-01T00:00:00.000Z';
  writeFileSync(journal, `${righe.map((riga) => JSON.stringify(riga)).join('\n')}\n`);
  await assert.rejects(readEvents(store, { runId }), (error) => typeof error?.code === 'string' && error.code.startsWith('WORKFLOW_'),
    'the changed journal is read again from disk and refused, not served from memory');
});

test('STORE-JOURNAL-TAIL — only an unterminated malformed final row is recoverable', async (t) => {
  const root = tempRoot();
  let store = await openStore(root);
  const runId = await prepareRun(store);
  const journal = join(root, 'runs', runId, 'journal', '000001.jsonl');
  writeFileSync(journal, Buffer.concat([readFileSync(journal), Buffer.from('{"seq":2', 'utf8')]));
  await store.close();

  store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  assert.equal(store.state, 'ready');
  assert.equal((await readEvents(store, { runId })).length, 1);
  assert.equal(readFileSync(journal, 'utf8').endsWith('\n'), true, 'startup recovery truncates the malformed crash tail');
});

test('STORE-JOURNAL-TAIL-UTF8 — a split final UTF-8 sequence is treated only as a crash tail', async (t) => {
  const root = tempRoot();
  let store = await openStore(root);
  const runId = await prepareRun(store);
  const journal = join(root, 'runs', runId, 'journal', '000001.jsonl');
  writeFileSync(journal, Buffer.concat([readFileSync(journal), Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3])]));
  await store.close();

  store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  assert.equal(store.state, 'ready');
  assert.equal((await readEvents(store, { runId })).length, 1);
  assert.equal(readFileSync(journal, 'utf8').endsWith('\n'), true);
});

test('M046_JOURNAL_MIDDLE_VALID_JSON_CORRUPTION_UNDETECTED — a terminated middle record never becomes a recoverable tail', async (t) => {
  const root = tempRoot();
  let store = await openStore(root);
  const runId = await prepareRun(store);
  await appendEvent(store, { event: event(runId, 2, 'run_started') });
  const journal = join(root, 'runs', runId, 'journal', '000001.jsonl');
  const lines = readFileSync(journal, 'utf8').trimEnd().split('\n');
  const first = JSON.parse(lines[0]);
  first.event.at = '2026-09-22T11:11:11.111Z';
  lines[0] = canonicalJson(first);
  writeFileSync(journal, `${lines.join('\n')}\n`, 'utf8');
  await store.close();

  store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  assert.equal(store.state, 'needs_attention');
  await assert.rejects(
    () => appendEvent(store, { event: event(runId, 3, 'node_started', { trigger: 'deterministic' }, { nodeId: 'implement' }) }),
    (error) => error?.code === 'WORKFLOW_STORE_NEEDS_ATTENTION',
  );
  await assert.rejects(
    () => readEvents(store, { runId }),
    (error) => error?.code === 'WORKFLOW_JOURNAL_CORRUPT',
  );
});

test('M017_CHECKPOINT_AHEAD_OF_JOURNAL_ACCEPTED / M045_CHECKPOINT_OVERWRITE_REQUIRED_FOR_RECOVERY / M086_CHECKPOINT_CURRENT_HINT_BECOMES_AUTHORITY — immutable checkpoint generations are selected by validation, never CURRENT', async (t) => {
  const root = tempRoot();
  const store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const runId = await prepareRun(store);
  const durableEvents = await readEvents(store, { runId });
  const replayed = workflowReplay({ definition: definitionRecord.core, runId, events: durableEvents });
  const state = { schema: 'talos.workflow-serialized-state.v1', lastSeq: 1 };
  const valid = {
    schema: 'talos.workflow-checkpoint.v1', checkpointSchemaVersion: 1, engineSchemaVersion: 1,
    runId, definitionHash: definitionRecord.definitionHash, throughSeq: 1,
    stateHash: workflowStateHash(replayed), graphVersion: 1, createdAt: '2026-09-22T10:00:02.000Z',
    state, indexSeed: {},
  };
  await writeCheckpoint(store, { checkpoint: valid });
  await assert.rejects(
    () => writeCheckpoint(store, { checkpoint: { ...valid, createdAt: '2026-09-22T10:00:03.000Z' } }),
    (error) => error?.code === 'WORKFLOW_CHECKPOINT_CONFLICT',
  );

  const aheadState = { schema: 'talos.workflow-serialized-state.v1', lastSeq: 2 };
  const ahead = {
    ...valid,
    throughSeq: 2,
    state: aheadState,
    stateHash: valid.stateHash,
    createdAt: '2026-09-22T10:00:04.000Z',
  };
  const checkpointDir = join(root, 'runs', runId, 'checkpoints');
  const aheadName = `2-${ahead.stateHash.slice('sha256:'.length)}.json`;
  writeFileSync(join(checkpointDir, aheadName), `${canonicalJson(ahead)}\n`, 'utf8');
  writeFileSync(join(checkpointDir, 'CURRENT'), `${aheadName}\n`, 'utf8');
  assert.deepEqual(await readSnapshot(store, { runId }), valid);

  const unsupported = { ...valid, schema: 'talos.workflow-checkpoint.v0', checkpointSchemaVersion: 0 };
  const unsupportedName = `0-${unsupported.stateHash.slice('sha256:'.length)}.json`;
  writeFileSync(join(checkpointDir, unsupportedName), `${canonicalJson(unsupported)}\n`, 'utf8');
  await assert.rejects(
    () => readSnapshot(store, { runId }),
    (error) => error?.code === 'WORKFLOW_SCHEMA_UNSUPPORTED',
  );
});

test('M056_UNSAFE_HASH_OR_NODE_ID_USED_AS_WINDOWS_PATH / M057_POWERLOSS_DURABILITY_OVERCLAIMED — unsafe identities are rejected and durability claims stay target-qualified', async (t) => {
  const root = tempRoot();
  const store = await openStore(root);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  await assert.rejects(
    () => readEvents(store, { runId: '../escape' }),
    (error) => error?.code === 'WORKFLOW_RUN_ID_INVALID',
  );
  await assert.rejects(
    () => readDefinition(store, { workflowId: '..', version: 1 }),
    (error) => error?.code === 'WORKFLOW_DEFINITION_ID_INVALID',
  );
  assert.deepEqual(store.durability, {
    processCrash: 'file-sync-before-resolution',
    powerLoss: 'target-filesystem-certification-required',
  });
  assert.equal(existsSync(join(dirname(root), 'escape')), false);
});
