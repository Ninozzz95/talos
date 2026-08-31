import { parseLocalRuntimeEvent } from './local-runtime-contract.mjs';

const ENVELOPE_KEYS = ['runId', 'turnId', 'runtimeId', 'seq', 'at', 'type'];

function invalid(message) {
  const error = new Error(message);
  error.code = 'LOCAL_RUNTIME_INVALID';
  return error;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function parseRuntimeEventEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('event envelope shape is invalid');
  if (!ENVELOPE_KEYS.every((key) => Object.hasOwn(value, key)) || Object.keys(value).some((key) => !ENVELOPE_KEYS.includes(key) && !['value', 'id', 'name', 'arguments', 'state', 'code', 'message', 'retryable'].includes(key))) throw invalid('event envelope fields are invalid');
  if (!nonEmptyString(value.runId) || !nonEmptyString(value.turnId) || !nonEmptyString(value.runtimeId) || !nonEmptyString(value.at)) throw invalid('event envelope identity is invalid');
  if (!Number.isInteger(value.seq) || value.seq < 0) throw invalid('event envelope sequence is invalid');
  const payload = { ...value };
  delete payload.runId; delete payload.turnId; delete payload.runtimeId; delete payload.at;
  parseLocalRuntimeEvent(payload);
  if (!Number.isFinite(Date.parse(value.at))) throw invalid('event envelope timestamp is invalid');
  return structuredClone(value);
}

export function createRuntimeEventLedger() {
  const events = new Map();
  return {
    push(value) {
      const event = parseRuntimeEventEnvelope(value);
      const current = events.get(event.seq);
      if (current) {
        if (JSON.stringify(current) !== JSON.stringify(event)) throw invalid('event sequence conflict');
        return false;
      }
      events.set(event.seq, event);
      return true;
    },
    replay() {
      return [...events.values()].sort((a, b) => a.seq - b.seq).map((event) => structuredClone(event));
    },
  };
}
