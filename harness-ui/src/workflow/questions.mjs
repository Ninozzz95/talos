import { randomUUID } from 'node:crypto';

import { canonicalHash, validateCanonicalizable } from './canonical-json.mjs';
import { appendEvent, lookupCommandReceipt, readEvents } from './store.mjs';

const QUESTION_ID = /^[a-z][a-z0-9_]{0,63}$/u;
const NODE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ON_SKIP = new Set(['continue-with-null', 'take-edge', 'fail-node', 'forbidden']);
const ON_TIMEOUT = new Set(['skip', 'fail-node', 'needs-attention']);
const SUPERSEDE_REASONS = new Set(['graph_patch', 'newer_decision']);
const TERMINAL_RUN_EVENTS = new Set(['run_succeeded', 'run_failed', 'run_cancelled']);
const ANSWER_BYTES_MAX = 16 * 1024;

export class WorkflowQuestionError extends Error {
  constructor(message, code = 'WORKFLOW_DEFINITION_INVALID', cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'WorkflowQuestionError';
    this.code = code;
  }
}

function fail(message, code = 'WORKFLOW_DEFINITION_INVALID', cause) {
  throw new WorkflowQuestionError(message, code, cause);
}

function exactObject(value, required, optional = [], path = 'value', code = 'WORKFLOW_DEFINITION_INVALID') {
  try { validateCanonicalizable(value); } catch (error) { fail(`${path} is not canonical JSON: ${error.message}`, code, error); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`, code);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path} has unknown field ${key}`, code);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path} is missing field ${key}`, code);
  return value;
}

function boundedText(value, { path, min = 1, max, code = 'WORKFLOW_DEFINITION_INVALID', trim = true }) {
  if (typeof value !== 'string') fail(`${path} must be text`, code);
  const normalized = trim ? value.trim() : value;
  if (normalized.length < min || normalized.length > max) {
    fail(`${path} must contain ${min}..${max} characters`, code);
  }
  return normalized;
}

function validUuid(value, path, code = 'WORKFLOW_DEFINITION_INVALID') {
  if (!UUID_V4.test(value)) fail(`${path} must be a UUIDv4`, code);
  return value;
}

function canonicalQuestion(value, index, seenIds) {
  const path = `questions[${index}]`;
  exactObject(value, ['id', 'question', 'allowOther'], ['options', 'multiSelect'], path);
  const id = boundedText(value.id, { path: `${path}.id`, max: 64 });
  if (!QUESTION_ID.test(id)) fail(`${path}.id must be a stable snake_case identifier`);
  if (seenIds.has(id)) fail(`duplicate HumanGate question id ${id}`);
  seenIds.add(id);
  const question = boundedText(value.question, { path: `${path}.question`, max: 2_000 });
  if (typeof value.allowOther !== 'boolean') fail(`${path}.allowOther must be boolean`);
  if (value.multiSelect !== undefined && typeof value.multiSelect !== 'boolean') {
    fail(`${path}.multiSelect must be boolean`);
  }
  const multiSelect = value.multiSelect === true;
  let options;
  if (value.options !== undefined) {
    if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 20) {
      fail(`${path}.options must contain 2..20 entries`);
    }
    const seenLabels = new Set();
    options = value.options.map((option, optionIndex) => {
      const optionPath = `${path}.options[${optionIndex}]`;
      exactObject(option, ['label', 'description'], [], optionPath);
      const label = boundedText(option.label, { path: `${optionPath}.label`, max: 200 });
      const folded = label.toLocaleLowerCase('en-US');
      if (seenLabels.has(folded)) fail(`${path}.options contains duplicate labels`);
      seenLabels.add(folded);
      const description = boundedText(option.description, {
        path: `${optionPath}.description`, min: 0, max: 500,
      });
      return { label, description };
    });
  } else {
    if (multiSelect) fail(`${path}.multiSelect requires options`);
    if (value.allowOther) fail(`${path}.allowOther is only valid for a closed question`);
  }
  return {
    id,
    question,
    ...(options ? { options } : {}),
    multiSelect,
    allowOther: value.allowOther,
  };
}

function canonicalTimeout(value, onSkip) {
  if (value === null) return null;
  exactObject(value, ['timerId', 'onTimeout'], [], 'timeoutPolicy');
  const timerId = validUuid(value.timerId, 'timeoutPolicy.timerId');
  if (!ON_TIMEOUT.has(value.onTimeout)) fail('timeoutPolicy.onTimeout is invalid');
  if (value.onTimeout === 'skip' && onSkip === 'forbidden') {
    fail('timeoutPolicy cannot skip when onSkip is forbidden');
  }
  return { timerId, onTimeout: value.onTimeout };
}

export function canonicalizeQuestionRequest(value) {
  exactObject(value, ['questions', 'onSkip', 'timeoutPolicy'], [], 'HumanGate request');
  if (!Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 10) {
    fail('HumanGate questions must contain 1..10 entries');
  }
  if (!ON_SKIP.has(value.onSkip)) fail('HumanGate onSkip is required and invalid');
  const seenIds = new Set();
  const questions = value.questions.map((question, index) => canonicalQuestion(question, index, seenIds));
  return {
    questions,
    onSkip: value.onSkip,
    timeoutPolicy: canonicalTimeout(value.timeoutPolicy, value.onSkip),
  };
}

export function questionFingerprint(value) {
  const canonical = canonicalizeQuestionRequest(value);
  return canonicalHash({
    questions: canonical.questions,
    onSkip: canonical.onSkip,
    timeoutPolicy: canonical.timeoutPolicy === null
      ? null
      : { onTimeout: canonical.timeoutPolicy.onTimeout },
  });
}

export function answerSchemaHash(value) {
  const canonical = canonicalizeQuestionRequest(value);
  return canonicalHash({
    questions: canonical.questions.map((question) => ({
      id: question.id,
      optionLabels: question.options?.map((option) => option.label) ?? [],
      multiSelect: question.multiSelect,
      allowOther: question.allowOther,
    })),
    onSkip: canonical.onSkip,
  });
}

function answerText(value, path) {
  if (typeof value !== 'string') fail(`${path} must be text`, 'QUERY_INVALID');
  const normalized = value.trim();
  if (!normalized) fail(`${path} cannot be empty`, 'QUERY_INVALID');
  if (Buffer.byteLength(normalized, 'utf8') > ANSWER_BYTES_MAX) {
    fail(`${path} exceeds the 16 KiB limit`, 'QUERY_INVALID');
  }
  return normalized;
}

function answerForQuestion(question, value) {
  const path = `answers.${question.id}`;
  if (!question.options) return answerText(value, path);
  const labels = question.options.map((option) => option.label);
  const known = new Set(labels);
  if (!question.multiSelect) {
    const normalized = answerText(value, path);
    if (!known.has(normalized) && !question.allowOther) fail(`${path} is not an allowed option`, 'QUERY_INVALID');
    return normalized;
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > labels.length + (question.allowOther ? 1 : 0)) {
    fail(`${path} must be a non-empty bounded selection`, 'QUERY_INVALID');
  }
  const normalized = value.map((entry, index) => answerText(entry, `${path}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail(`${path} contains duplicate selections`, 'QUERY_INVALID');
  const custom = normalized.filter((entry) => !known.has(entry));
  if (custom.length > (question.allowOther ? 1 : 0)) fail(`${path} contains a forbidden custom answer`, 'QUERY_INVALID');
  const selected = new Set(normalized);
  return [...labels.filter((label) => selected.has(label)), ...custom];
}

export function validateHumanAnswer(gate, response) {
  exactObject(response, ['status'], ['answers'], 'HumanGate answer', 'QUERY_INVALID');
  const request = canonicalizeQuestionRequest({
    questions: gate?.questions,
    onSkip: gate?.onSkip,
    timeoutPolicy: gate?.timeoutPolicy,
  });
  if (response.status === 'skipped') {
    if (Object.hasOwn(response, 'answers')) fail('skipped must not contain answers', 'QUERY_INVALID');
    if (request.onSkip === 'forbidden') fail('this HumanGate cannot be skipped', 'QUERY_INVALID');
    return { status: 'skipped', answers: null };
  }
  if (response.status !== 'answered') fail('HumanGate answer status must be answered or skipped', 'QUERY_INVALID');
  exactObject(response.answers, request.questions.map((question) => question.id), [], 'answers', 'QUERY_INVALID');
  const answers = {};
  for (const question of request.questions) answers[question.id] = answerForQuestion(question, response.answers[question.id]);
  return { status: 'answered', answers };
}

function projectGates(events) {
  const gates = new Map();
  for (const event of events) {
    if (event.type === 'human_requested') gates.set(event.payload.gate.requestId, structuredClone(event.payload.gate));
    else if (['human_resolved', 'human_cancelled', 'human_superseded'].includes(event.type)) {
      const gate = gates.get(event.payload.requestId);
      if (!gate || gate.requestVersion !== event.payload.requestVersion || gate.status !== 'pending') continue;
      gate.status = event.type === 'human_resolved' ? event.payload.status : event.type.slice('human_'.length);
      if (event.type === 'human_resolved') {
        gate.answers = structuredClone(event.payload.answers);
        gate.resolvedAt = event.at;
      }
    }
  }
  return gates;
}

function assertRunAcceptsQuestion(events) {
  if (events.length < 1 || events[0].type !== 'run_created') fail('Workflow run was not found', 'WORKFLOW_RUN_NOT_FOUND');
  if (!events.some((event) => event.type === 'run_started')) fail('Workflow run has not started', 'WORKFLOW_NOT_READY');
  if (events.some((event) => TERMINAL_RUN_EVENTS.has(event.type))) fail('terminal Workflow run cannot accept questions', 'WORKFLOW_NOT_READY');
}

function eventEnvelope(events, {
  runId,
  type,
  nodeId,
  payload,
  eventId,
  at,
  causationId = null,
  commandId = null,
  commandType = null,
  commandPayloadHash = null,
}) {
  const last = events.at(-1);
  if (!last) fail('Workflow run was not found', 'WORKFLOW_RUN_NOT_FOUND');
  return {
    schema: 'talos.workflow-event.v1',
    eventSchemaVersion: 1,
    engineSchemaVersion: 1,
    eventId,
    runId,
    seq: last.seq + 1,
    at,
    type,
    nodeId,
    commandId,
    commandType,
    commandPayloadHash,
    causationId,
    correlationId: runId,
    graphVersion: last.graphVersion,
    activityExecutionId: null,
    attempt: null,
    leaseId: null,
    leaseEpoch: null,
    payload,
  };
}

function runtimeDeps(deps = {}) {
  return {
    uuidFn: deps.uuidFn ?? randomUUID,
    nowFn: deps.nowFn ?? (() => new Date().toISOString()),
  };
}

function exactPending(gates, { nodeId, decisionKey, fingerprint, schemaHash }) {
  return [...gates.values()].find((gate) => gate.status === 'pending'
    && gate.nodeId === nodeId
    && gate.decisionKey === decisionKey
    && gate.fingerprint === fingerprint
    && gate.answerSchemaHash === schemaHash) ?? null;
}

function validateCreateInput(input) {
  exactObject(input, ['runId', 'nodeId', 'decisionKey', 'questions', 'onSkip'], [
    'timeoutPolicy', 'requestId', 'requestVersion', 'causationId',
  ], 'createHumanGate input');
  validUuid(input.runId, 'runId');
  if (!NODE_ID.test(input.nodeId)) fail('nodeId is invalid');
  const decisionKey = boundedText(input.decisionKey, { path: 'decisionKey', max: 256 });
  if (input.requestId !== undefined) validUuid(input.requestId, 'requestId');
  if (input.requestVersion !== undefined && (!Number.isSafeInteger(input.requestVersion) || input.requestVersion < 1)) {
    fail('requestVersion must be a positive safe integer');
  }
  if (input.causationId !== undefined && input.causationId !== null) validUuid(input.causationId, 'causationId');
  return decisionKey;
}

export async function createHumanGate(store, input, deps = {}) {
  const decisionKey = validateCreateInput(input);
  const runtime = runtimeDeps(deps);
  let events = await readEvents(store, { runId: input.runId });
  assertRunAcceptsQuestion(events);
  const request = canonicalizeQuestionRequest({
    questions: input.questions,
    onSkip: input.onSkip,
    timeoutPolicy: input.timeoutPolicy ?? null,
  });
  const fingerprint = questionFingerprint(request);
  const schemaHash = answerSchemaHash(request);
  let gates = projectGates(events);
  const duplicate = exactPending(gates, {
    nodeId: input.nodeId, decisionKey, fingerprint, schemaHash,
  });
  if (duplicate) return { gate: structuredClone(duplicate), event: null, deduplicated: true };

  const requestId = input.requestId ?? runtime.uuidFn();
  validUuid(requestId, 'requestId');
  if (gates.has(requestId)) fail('requestId already identifies another HumanGate', 'WORKFLOW_QUESTION_CONFLICT');
  if (request.timeoutPolicy !== null) {
    const scheduled = events.some((event) => event.type === 'timer_scheduled'
      && event.payload.timerId === request.timeoutPolicy.timerId
      && event.payload.kind === 'human-timeout'
      && event.payload.nodeId === input.nodeId);
    if (!scheduled) fail('HumanGate timeout requires a durable timer fact first', 'WORKFLOW_NOT_READY');
  }
  const at = runtime.nowFn();
  const gate = {
    schema: 'talos.workflow-question.v1',
    requestId,
    requestVersion: input.requestVersion ?? 1,
    runId: input.runId,
    nodeId: input.nodeId,
    decisionKey,
    createdAt: at,
    fingerprint,
    answerSchemaHash: schemaHash,
    status: 'pending',
    onSkip: request.onSkip,
    timeoutPolicy: request.timeoutPolicy,
    questions: request.questions,
    answers: null,
    resolvedAt: null,
  };
  const eventId = runtime.uuidFn();
  let event;
  let sequenceConflict;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    event = eventEnvelope(events, {
      runId: input.runId,
      type: 'human_requested',
      nodeId: input.nodeId,
      payload: { gate },
      eventId,
      at,
      causationId: input.causationId ?? null,
    });
    try {
      await appendEvent(store, { event });
      sequenceConflict = null;
      break;
    } catch (error) {
      if (error?.code !== 'WORKFLOW_JOURNAL_SEQUENCE_CONFLICT') throw error;
      sequenceConflict = error;
      events = await readEvents(store, { runId: input.runId });
      gates = projectGates(events);
      const racedDuplicate = exactPending(gates, {
        nodeId: input.nodeId, decisionKey, fingerprint, schemaHash,
      });
      if (racedDuplicate) return { gate: structuredClone(racedDuplicate), event: null, deduplicated: true };
      if (gates.has(requestId)) fail('requestId was claimed concurrently', 'WORKFLOW_QUESTION_CONFLICT', error);
    }
  }
  if (sequenceConflict) throw sequenceConflict;
  return { gate: structuredClone(gate), event: structuredClone(event), deduplicated: false };
}

function commandHash({ runId, requestId, response, requestVersion }) {
  const payload = {
    requestVersion,
    status: response.status,
    ...(response.status === 'answered' ? { answers: response.answers } : {}),
  };
  return {
    payload,
    hash: canonicalHash({
      schema: 'talos.workflow-command-dedupe.v1',
      commandType: 'answer-human-gate',
      target: {
        workflowId: null,
        definitionVersion: null,
        runId,
        nodeId: null,
        requestId,
      },
      payload,
    }),
  };
}

function receiptMatches(receipt, hash) {
  return receipt.commandType === 'answer-human-gate' && receipt.payloadHash === hash;
}

function validateResolveIdentity(input) {
  exactObject(input, ['runId', 'requestId', 'requestVersion', 'commandId', 'status'], [
    'answers', 'causationId',
  ], 'resolveHumanGate input', 'QUERY_INVALID');
  validUuid(input.runId, 'runId', 'QUERY_INVALID');
  validUuid(input.requestId, 'requestId', 'QUERY_INVALID');
  validUuid(input.commandId, 'commandId', 'QUERY_INVALID');
  if (!Number.isSafeInteger(input.requestVersion) || input.requestVersion < 1) {
    fail('requestVersion must be a positive safe integer', 'QUERY_INVALID');
  }
  if (input.causationId !== undefined && input.causationId !== null) validUuid(input.causationId, 'causationId', 'QUERY_INVALID');
}

export async function resolveHumanGate(store, input, deps = {}) {
  validateResolveIdentity(input);
  let events = await readEvents(store, { runId: input.runId });
  let gate = projectGates(events).get(input.requestId);
  if (!gate || gate.runId !== input.runId) fail('HumanGate was not found', 'WORKFLOW_QUESTION_CONFLICT');
  const prior = await lookupCommandReceipt(store, { commandId: input.commandId });
  if (!prior && (gate.status !== 'pending' || gate.requestVersion !== input.requestVersion)) {
    fail('HumanGate requestVersion is stale or no longer pending', 'WORKFLOW_QUESTION_CONFLICT');
  }
  const response = validateHumanAnswer(gate, {
    status: input.status,
    ...(Object.hasOwn(input, 'answers') ? { answers: input.answers } : {}),
  });
  const command = commandHash({
    runId: input.runId,
    requestId: input.requestId,
    requestVersion: input.requestVersion,
    response,
  });
  if (prior) {
    if (!receiptMatches(prior, command.hash)) fail('commandId was reused with a different HumanGate answer', 'WORKFLOW_COMMAND_CONFLICT');
    return { event: null, receipt: prior, deduplicated: true };
  }
  if (answerSchemaHash({ questions: gate.questions, onSkip: gate.onSkip, timeoutPolicy: gate.timeoutPolicy }) !== gate.answerSchemaHash) {
    fail('HumanGate answer schema hash does not match its durable request', 'WORKFLOW_JOURNAL_CORRUPT');
  }
  const runtime = runtimeDeps(deps);
  const at = runtime.nowFn();
  const eventId = runtime.uuidFn();
  let event;
  let sequenceConflict;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    event = eventEnvelope(events, {
      runId: input.runId,
      type: 'human_resolved',
      nodeId: gate.nodeId,
      commandId: input.commandId,
      commandType: 'answer-human-gate',
      commandPayloadHash: command.hash,
      eventId,
      at,
      causationId: input.causationId ?? null,
      payload: {
        requestId: input.requestId,
        requestVersion: input.requestVersion,
        answerSchemaHash: gate.answerSchemaHash,
        status: response.status,
        answers: response.answers,
        answerHash: canonicalHash(response),
      },
    });
    try {
      await appendEvent(store, { event });
      sequenceConflict = null;
      break;
    } catch (error) {
      if (error?.code !== 'WORKFLOW_JOURNAL_SEQUENCE_CONFLICT') throw error;
      sequenceConflict = error;
      const racedReceipt = await lookupCommandReceipt(store, { commandId: input.commandId });
      if (racedReceipt && receiptMatches(racedReceipt, command.hash)) {
        return { event: null, receipt: racedReceipt, deduplicated: true };
      }
      events = await readEvents(store, { runId: input.runId });
      gate = projectGates(events).get(input.requestId);
      if (!gate || gate.status !== 'pending' || gate.requestVersion !== input.requestVersion) {
        fail('HumanGate was resolved concurrently', 'WORKFLOW_QUESTION_CONFLICT', error);
      }
    }
  }
  if (sequenceConflict) throw sequenceConflict;
  const receipt = await lookupCommandReceipt(store, { commandId: input.commandId });
  if (!receipt || !receiptMatches(receipt, command.hash)) fail('accepted HumanGate answer has no durable receipt', 'WORKFLOW_JOURNAL_CORRUPT');
  return { event: structuredClone(event), receipt, deduplicated: false };
}

function validateSupersedeInput(input) {
  exactObject(input, ['runId', 'requestId', 'requestVersion', 'reason'], [
    'replacementRequestId', 'causationId',
  ], 'supersedeHumanGate input');
  validUuid(input.runId, 'runId');
  validUuid(input.requestId, 'requestId');
  if (!Number.isSafeInteger(input.requestVersion) || input.requestVersion < 1) fail('requestVersion must be a positive safe integer');
  if (!SUPERSEDE_REASONS.has(input.reason)) fail('HumanGate supersession reason is invalid');
  if (input.replacementRequestId !== undefined && input.replacementRequestId !== null) {
    validUuid(input.replacementRequestId, 'replacementRequestId');
    if (input.replacementRequestId === input.requestId) fail('replacementRequestId must identify a different HumanGate');
  }
  if (input.causationId !== undefined && input.causationId !== null) validUuid(input.causationId, 'causationId');
}

export async function supersedeHumanGate(store, input, deps = {}) {
  validateSupersedeInput(input);
  let events = await readEvents(store, { runId: input.runId });
  let gate = projectGates(events).get(input.requestId);
  if (!gate || gate.runId !== input.runId || gate.status !== 'pending' || gate.requestVersion !== input.requestVersion) {
    fail('HumanGate is stale or no longer pending', 'WORKFLOW_QUESTION_CONFLICT');
  }
  const runtime = runtimeDeps(deps);
  const eventId = runtime.uuidFn();
  const at = runtime.nowFn();
  let event;
  let sequenceConflict;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    event = eventEnvelope(events, {
      runId: input.runId,
      type: 'human_superseded',
      nodeId: gate.nodeId,
      eventId,
      at,
      causationId: input.causationId ?? null,
      payload: {
        requestId: input.requestId,
        requestVersion: input.requestVersion,
        reason: input.reason,
        replacementRequestId: input.replacementRequestId ?? null,
      },
    });
    try {
      await appendEvent(store, { event });
      sequenceConflict = null;
      break;
    } catch (error) {
      if (error?.code !== 'WORKFLOW_JOURNAL_SEQUENCE_CONFLICT') throw error;
      sequenceConflict = error;
      events = await readEvents(store, { runId: input.runId });
      gate = projectGates(events).get(input.requestId);
      if (!gate || gate.runId !== input.runId || gate.status !== 'pending'
        || gate.requestVersion !== input.requestVersion) {
        fail('HumanGate was changed concurrently', 'WORKFLOW_QUESTION_CONFLICT', error);
      }
    }
  }
  if (sequenceConflict) throw sequenceConflict;
  return { gate: structuredClone(gate), event: structuredClone(event) };
}
