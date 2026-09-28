import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validaDomandeUtente } from '../src/user-question-contract.mjs';
import {
  answerSchemaHash,
  canonicalizeQuestionRequest,
  createHumanGate,
  questionFingerprint,
  resolveHumanGate,
  supersedeHumanGate,
  validateHumanAnswer,
} from '../src/workflow/questions.mjs';
import {
  appendEvent,
  approveDefinition,
  createDefinition,
  createRun,
  createWorkflowStore,
  lookupCommandReceipt,
  readEvents,
} from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const definitionRecord = JSON.parse(await readFile(
  new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url),
  'utf8',
));
const approval = JSON.parse(await readFile(
  new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url),
  'utf8',
));
const ROOT_SESSION_ID = '40000000-0000-4000-8000-000000000001';

const baseQuestion = Object.freeze({
  id: 'strategy',
  question: 'Come vuoi gestire il conflitto?',
  options: Object.freeze([
    Object.freeze({ label: 'Mantieni A', description: 'Conserva la prima variante.' }),
    Object.freeze({ label: 'Mantieni B', description: 'Conserva la seconda variante.' }),
  ]),
  multiSelect: false,
  allowOther: false,
});

function tempRoot() {
  return mkdtempSync(join(tmpdir(), 'talos-workflow-question-'));
}

async function openStore(root) {
  return createWorkflowStore({
    workflowDataRoot: root,
    workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 },
  });
}

function event(runId, seq, type, payload = {}, overrides = {}) {
  return {
    schema: 'talos.workflow-event.v1',
    eventSchemaVersion: 1,
    engineSchemaVersion: 1,
    eventId: randomUUID(),
    runId,
    seq,
    at: `2026-09-22T16:00:${String(seq).padStart(2, '0')}.000Z`,
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

async function prepareRun(store) {
  const runId = randomUUID();
  await createDefinition(store, { record: definitionRecord });
  await approveDefinition(store, { approval });
  await createRun(store, { event: runCreated(runId) });
  await appendEvent(store, { event: event(runId, 2, 'run_started') });
  return runId;
}

function deterministicDeps(...ids) {
  let cursor = 0;
  let tick = 0;
  return {
    uuidFn: () => ids[cursor++] ?? randomUUID(),
    nowFn: () => `2026-09-22T17:00:${String(tick++).padStart(2, '0')}.000Z`,
  };
}

function request(overrides = {}) {
  return {
    nodeId: 'implement',
    decisionKey: 'merge-strategy',
    questions: [structuredClone(baseQuestion)],
    onSkip: 'forbidden',
    timeoutPolicy: null,
    ...overrides,
  };
}

function canonicalRequest(overrides = {}) {
  const value = request(overrides);
  return {
    questions: value.questions,
    onSkip: value.onSkip,
    timeoutPolicy: value.timeoutPolicy,
  };
}

async function withRun(t) {
  const root = tempRoot();
  const store = await openStore(root);
  t.after(async () => {
    if (store.state !== 'closed') await store.close();
    rimuoviCartellaDiProva(root);
  });
  return { root, store, runId: await prepareRun(store) };
}

test('QUESTION-CANONICAL-HASHES', () => {
  const canonical = canonicalizeQuestionRequest({
    questions: [{
      allowOther: false,
      options: [
        { description: 'Conserva la prima variante.', label: 'Mantieni A' },
        { description: 'Conserva la seconda variante.', label: 'Mantieni B' },
      ],
      question: 'Come vuoi gestire il conflitto?',
      id: 'strategy',
    }],
    timeoutPolicy: null,
    onSkip: 'forbidden',
  });
  assert.deepEqual(canonical, {
    questions: [structuredClone(baseQuestion)],
    onSkip: 'forbidden',
    timeoutPolicy: null,
  });
  assert.equal(questionFingerprint(canonical), questionFingerprint({
    timeoutPolicy: null,
    onSkip: 'forbidden',
    questions: [structuredClone(baseQuestion)],
  }));
  const descriptionChanged = canonicalizeQuestionRequest({
    ...canonical,
    questions: [{ ...structuredClone(baseQuestion), options: [
      { label: 'Mantieni A', description: 'Descrizione nuova.' },
      baseQuestion.options[1],
    ] }],
  });
  assert.notEqual(questionFingerprint(canonical), questionFingerprint(descriptionChanged));
  assert.equal(answerSchemaHash(canonical), answerSchemaHash(descriptionChanged));
  const labelChanged = canonicalizeQuestionRequest({
    ...canonical,
    questions: [{ ...structuredClone(baseQuestion), options: [
      { label: 'Mantieni C', description: 'Conserva la terza variante.' },
      baseQuestion.options[1],
    ] }],
  });
  assert.notEqual(answerSchemaHash(canonical), answerSchemaHash(labelChanged));
});

test('M060_HUMANGATE_SKIP_POLICY_IMPLICIT', () => {
  assert.throws(
    () => canonicalizeQuestionRequest({ questions: [structuredClone(baseQuestion)], timeoutPolicy: null }),
    (error) => error?.code === 'WORKFLOW_DEFINITION_INVALID',
  );
  const forbidden = { ...canonicalizeQuestionRequest(canonicalRequest()), status: 'pending' };
  assert.throws(
    () => validateHumanAnswer(forbidden, { status: 'skipped' }),
    (error) => error?.code === 'QUERY_INVALID',
  );
  const skippable = { ...forbidden, onSkip: 'continue-with-null' };
  assert.deepEqual(validateHumanAnswer(skippable, { status: 'skipped' }), {
    status: 'skipped', answers: null,
  });
});

test('M061_HUMANGATE_OTHER_ACCEPTED_WHEN_FORBIDDEN', () => {
  const gate = { ...canonicalizeQuestionRequest(canonicalRequest()), status: 'pending' };
  assert.throws(
    () => validateHumanAnswer(gate, { status: 'answered', answers: { strategy: 'Unisci manualmente' } }),
    (error) => error?.code === 'QUERY_INVALID',
  );
  const withOther = { ...gate, questions: [{ ...gate.questions[0], allowOther: true }] };
  assert.deepEqual(
    validateHumanAnswer(withOther, { status: 'answered', answers: { strategy: 'Unisci manualmente' } }),
    { status: 'answered', answers: { strategy: 'Unisci manualmente' } },
  );
});

test('QUESTION-MULTI-SELECT-CANONICAL', () => {
  const gate = {
    ...canonicalizeQuestionRequest({
      questions: [{ ...structuredClone(baseQuestion), multiSelect: true, allowOther: true }],
      onSkip: 'forbidden',
      timeoutPolicy: null,
    }),
    status: 'pending',
  };
  assert.deepEqual(validateHumanAnswer(gate, {
    status: 'answered',
    answers: { strategy: ['Scelta personalizzata', 'Mantieni B', 'Mantieni A'] },
  }), {
    status: 'answered',
    answers: { strategy: ['Mantieni A', 'Mantieni B', 'Scelta personalizzata'] },
  });
  assert.throws(() => validateHumanAnswer(gate, {
    status: 'answered', answers: { strategy: ['Mantieni A', 'Mantieni A'] },
  }), /duplicate/iu);
  assert.throws(() => validateHumanAnswer(gate, {
    status: 'answered', answers: { strategy: ['Personalizzata 1', 'Personalizzata 2'] },
  }), /custom|personalizz|forbidden/iu);
});

test('M063_ANSWER_SCHEMA_HASH_IGNORED_FOR_BATCH', () => {
  const first = canonicalizeQuestionRequest(canonicalRequest());
  const changedLabel = canonicalizeQuestionRequest(canonicalRequest({
    questions: [{ ...structuredClone(baseQuestion), options: [
      { label: 'Mantieni C', description: 'Terza variante.' },
      baseQuestion.options[1],
    ] }],
  }));
  assert.notEqual(answerSchemaHash(first), answerSchemaHash(changedLabel));
});

test('M095_WORKFLOW_NATIVE_QUESTION_LIMIT_SILENTLY_REUSES_LEGACY_LIMIT', () => {
  const workflowQuestions = Array.from({ length: 10 }, (_, index) => ({
    id: `question_${index}`,
    question: `Domanda ${index}`,
    multiSelect: false,
    allowOther: false,
  }));
  assert.equal(canonicalizeQuestionRequest({
    questions: workflowQuestions,
    onSkip: 'forbidden',
    timeoutPolicy: null,
  }).questions.length, 10);
  assert.throws(() => canonicalizeQuestionRequest({
    questions: [...workflowQuestions, { ...workflowQuestions[0], id: 'question_10' }],
    onSkip: 'forbidden',
    timeoutPolicy: null,
  }), /1.*10|limite/iu);
  // 23/09/2026, decisione owner: il contratto Ask è 1..4 domande (era 1..3); resta separato dal broker (1..10).
  assert.throws(() => validaDomandeUtente(workflowQuestions.slice(0, 5)), /1.*4|domande/iu,
    'legacy Ask must keep its separate 1..4 contract');
  const twentyOptions = Array.from({ length: 20 }, (_, index) => ({
    label: `Opzione ${index}`,
    description: `Descrizione ${index}`,
  }));
  assert.equal(canonicalizeQuestionRequest({
    questions: [{
      id: 'wide_question', question: 'Scegli', options: twentyOptions, multiSelect: true, allowOther: true,
    }],
    onSkip: 'forbidden',
    timeoutPolicy: null,
  }).questions[0].options.length, 20);
  assert.throws(() => canonicalizeQuestionRequest({
    questions: [{
      id: 'too_wide', question: 'Scegli', options: [...twentyOptions, {
        label: 'Opzione 20', description: 'Descrizione 20',
      }], multiSelect: false, allowOther: false,
    }],
    onSkip: 'forbidden',
    timeoutPolicy: null,
  }), /2.*20|limite/iu);
});

test('QUESTION-DURABLE-PENDING-REPLAY', async (t) => {
  const root = tempRoot();
  let store = await openStore(root);
  t.after(async () => {
    if (store.state !== 'closed') await store.close();
    rimuoviCartellaDiProva(root);
  });
  const runId = await prepareRun(store);
  const created = await createHumanGate(store, { runId, ...request() }, deterministicDeps(
    '61000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
  ));
  assert.equal(created.deduplicated, false);
  assert.equal(created.gate.status, 'pending');
  assert.equal((await readEvents(store, { runId })).at(-1).payload.gate.requestId, created.gate.requestId);
  await store.close();
  store = await openStore(root);
  const replayed = await readEvents(store, { runId });
  assert.equal(replayed.at(-1).type, 'human_requested');
  assert.deepEqual(replayed.at(-1).payload.gate, created.gate);
});

test('QUESTION-DEDUPE-EXACT-SAME-NODE', async (t) => {
  const { store, runId } = await withRun(t);
  const first = await createHumanGate(store, { runId, ...request() }, deterministicDeps(
    '63000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
  ));
  const second = await createHumanGate(store, { runId, ...request() }, deterministicDeps(
    '63000000-0000-4000-8000-000000000099',
    '64000000-0000-4000-8000-000000000099',
  ));
  assert.equal(second.deduplicated, true);
  assert.deepEqual(second.gate, first.gate);
  assert.equal((await readEvents(store, { runId })).filter((item) => item.type === 'human_requested').length, 1);
});

test('QUESTION-CROSS-NODE-NOT-COLLAPSED', async (t) => {
  const { store, runId } = await withRun(t);
  const first = await createHumanGate(store, { runId, ...request() }, deterministicDeps(
    '65000000-0000-4000-8000-000000000001',
    '66000000-0000-4000-8000-000000000001',
  ));
  const second = await createHumanGate(store, {
    runId,
    ...request({ nodeId: 'test' }),
  }, deterministicDeps(
    '65000000-0000-4000-8000-000000000002',
    '66000000-0000-4000-8000-000000000002',
  ));
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, false);
  assert.notEqual(first.gate.requestId, second.gate.requestId);
});

test('QUESTION-CONCURRENT-DISTINCT-NODES-SERIALIZE', async (t) => {
  const { store, runId } = await withRun(t);
  const [first, second] = await Promise.all([
    createHumanGate(store, { runId, ...request() }, deterministicDeps(
      '6b000000-0000-4000-8000-000000000001',
      '6c000000-0000-4000-8000-000000000001',
    )),
    createHumanGate(store, {
      runId,
      ...request({ nodeId: 'test', decisionKey: 'test-strategy' }),
    }, deterministicDeps(
      '6b000000-0000-4000-8000-000000000002',
      '6c000000-0000-4000-8000-000000000002',
    )),
  ]);
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, false);
  assert.equal((await readEvents(store, { runId })).filter((item) => item.type === 'human_requested').length, 2);
});

test('QUESTION-CONCURRENT-EXACT-REQUEST-DEDUPE', async (t) => {
  const { store, runId } = await withRun(t);
  const [first, second] = await Promise.all([
    createHumanGate(store, { runId, ...request() }, deterministicDeps(
      '6d000000-0000-4000-8000-000000000001',
      '6e000000-0000-4000-8000-000000000001',
    )),
    createHumanGate(store, { runId, ...request() }, deterministicDeps(
      '6d000000-0000-4000-8000-000000000002',
      '6e000000-0000-4000-8000-000000000002',
    )),
  ]);
  assert.deepEqual(first.gate, second.gate);
  assert.equal([first.deduplicated, second.deduplicated].filter(Boolean).length, 1);
  assert.equal((await readEvents(store, { runId })).filter((item) => item.type === 'human_requested').length, 1);
});

test('QUESTION-COMMAND-IDEMPOTENCY', async (t) => {
  const { store, runId } = await withRun(t);
  const pending = await createHumanGate(store, { runId, ...request() }, deterministicDeps(
    '67000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001',
  ));
  const commandId = '69000000-0000-4000-8000-000000000001';
  const answer = {
    runId,
    requestId: pending.gate.requestId,
    requestVersion: 1,
    commandId,
    status: 'answered',
    answers: { strategy: 'Mantieni A' },
  };
  const accepted = await resolveHumanGate(store, answer, deterministicDeps(
    '6a000000-0000-4000-8000-000000000001',
  ));
  const retried = await resolveHumanGate(store, answer, deterministicDeps(
    '6a000000-0000-4000-8000-000000000002',
  ));
  assert.equal(retried.deduplicated, true);
  assert.deepEqual(retried.receipt, accepted.receipt);
  assert.deepEqual(await lookupCommandReceipt(store, { commandId }), accepted.receipt);
  assert.equal((await readEvents(store, { runId })).filter((item) => item.type === 'human_resolved').length, 1);
  await assert.rejects(
    () => resolveHumanGate(store, { ...answer, answers: { strategy: 'Mantieni B' } }),
    (error) => error?.code === 'WORKFLOW_COMMAND_CONFLICT',
  );
});

test('QUESTION-CONCURRENT-SAME-COMMAND-IDEMPOTENCY', async (t) => {
  const { store, runId } = await withRun(t);
  const pending = await createHumanGate(store, { runId, ...request() });
  const answer = {
    runId,
    requestId: pending.gate.requestId,
    requestVersion: pending.gate.requestVersion,
    commandId: '6f000000-0000-4000-8000-000000000001',
    status: 'answered',
    answers: { strategy: 'Mantieni A' },
  };
  const [first, second] = await Promise.all([
    resolveHumanGate(store, answer, deterministicDeps('70000000-0000-4000-8000-000000000001')),
    resolveHumanGate(store, answer, deterministicDeps('70000000-0000-4000-8000-000000000002')),
  ]);
  assert.deepEqual(first.receipt, second.receipt);
  assert.equal([first.deduplicated, second.deduplicated].filter(Boolean).length, 1);
  assert.equal((await readEvents(store, { runId })).filter((item) => item.type === 'human_resolved').length, 1);
});

test('QUESTION-CONCURRENT-DISTINCT-SUPERSESSIONS-SERIALIZE', async (t) => {
  const { store, runId } = await withRun(t);
  const first = await createHumanGate(store, { runId, ...request() });
  const second = await createHumanGate(store, {
    runId,
    ...request({ nodeId: 'test', decisionKey: 'test-strategy' }),
  });
  await Promise.all([
    supersedeHumanGate(store, {
      runId,
      requestId: first.gate.requestId,
      requestVersion: first.gate.requestVersion,
      reason: 'graph_patch',
      replacementRequestId: null,
    }, deterministicDeps('71000000-0000-4000-8000-000000000001')),
    supersedeHumanGate(store, {
      runId,
      requestId: second.gate.requestId,
      requestVersion: second.gate.requestVersion,
      reason: 'newer_decision',
      replacementRequestId: null,
    }, deterministicDeps('71000000-0000-4000-8000-000000000002')),
  ]);
  assert.equal((await readEvents(store, { runId })).filter((item) => item.type === 'human_superseded').length, 2);
});

test('QUESTION-CONCURRENT-DIFFERENT-ANSWERS-ONE-WINS', async (t) => {
  const { store, runId } = await withRun(t);
  const pending = await createHumanGate(store, { runId, ...request() });
  const base = {
    runId,
    requestId: pending.gate.requestId,
    requestVersion: pending.gate.requestVersion,
    status: 'answered',
  };
  const outcomes = await Promise.allSettled([
    resolveHumanGate(store, {
      ...base,
      commandId: '72000000-0000-4000-8000-000000000001',
      answers: { strategy: 'Mantieni A' },
    }, deterministicDeps('73000000-0000-4000-8000-000000000001')),
    resolveHumanGate(store, {
      ...base,
      commandId: '72000000-0000-4000-8000-000000000002',
      answers: { strategy: 'Mantieni B' },
    }, deterministicDeps('73000000-0000-4000-8000-000000000002')),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
  assert.equal(rejected?.reason?.code, 'WORKFLOW_QUESTION_CONFLICT');
  assert.equal((await readEvents(store, { runId })).filter((item) => item.type === 'human_resolved').length, 1);
});

test('QUESTION-STALE-ANSWER-CONFLICT', async (t) => {
  const { store, runId } = await withRun(t);
  const pending = await createHumanGate(store, { runId, ...request() });
  const before = (await readEvents(store, { runId })).length;
  await assert.rejects(
    () => resolveHumanGate(store, {
      runId,
      requestId: pending.gate.requestId,
      requestVersion: 2,
      commandId: randomUUID(),
      status: 'answered',
      answers: { strategy: 'Mantieni A' },
    }),
    (error) => error?.code === 'WORKFLOW_QUESTION_CONFLICT',
  );
  assert.equal((await readEvents(store, { runId })).length, before);
});

test('QUESTION-SUPERSESSION-LATE-ANSWER-CONFLICT', async (t) => {
  const { store, runId } = await withRun(t);
  const pending = await createHumanGate(store, { runId, ...request() });
  await supersedeHumanGate(store, {
    runId,
    requestId: pending.gate.requestId,
    requestVersion: pending.gate.requestVersion,
    reason: 'graph_patch',
    replacementRequestId: null,
  });
  const before = (await readEvents(store, { runId })).length;
  await assert.rejects(
    () => resolveHumanGate(store, {
      runId,
      requestId: pending.gate.requestId,
      requestVersion: pending.gate.requestVersion,
      commandId: randomUUID(),
      status: 'answered',
      answers: { strategy: 'Mantieni A' },
    }),
    (error) => error?.code === 'WORKFLOW_QUESTION_CONFLICT',
  );
  assert.equal((await readEvents(store, { runId })).length, before);
});

test('QUESTION-STALE-OUTCOME-PRECEDES-BODY-VALIDATION', async (t) => {
  const { store, runId } = await withRun(t);
  const pending = await createHumanGate(store, { runId, ...request() });
  await supersedeHumanGate(store, {
    runId,
    requestId: pending.gate.requestId,
    requestVersion: pending.gate.requestVersion,
    reason: 'newer_decision',
    replacementRequestId: null,
  });
  await assert.rejects(
    () => resolveHumanGate(store, {
      runId,
      requestId: pending.gate.requestId,
      requestVersion: pending.gate.requestVersion,
      commandId: randomUUID(),
      status: 'answered',
      answers: { strategy: 'Custom forbidden and stale' },
    }),
    (error) => error?.code === 'WORKFLOW_QUESTION_CONFLICT',
  );
});
