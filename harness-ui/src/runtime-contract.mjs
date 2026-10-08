import { parseRuntimeEventEnvelope as parseExistingRuntimeEventEnvelope } from './local-runtime-events.mjs';

export const RUNTIME_BOOTSTRAP_SCHEMA = 'talos.harness-ui.runtime-bootstrap.v1';
export const RUNTIME_RESOURCE_SCHEMA = 'talos.harness-ui.resource.v1';
export const RUNTIME_PHASES = Object.freeze(['booting', 'offline', 'degraded', 'ready-empty', 'ready-active']);

export class RuntimeContractError extends Error {
  constructor(message, code = 'RUNTIME_CONTRACT_INVALID') {
    super(message);
    this.name = 'RuntimeContractError';
    this.code = code;
  }
}

function invalid(message) { throw new RuntimeContractError(message); }
function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
function nonEmpty(value) { return typeof value === 'string' && value.trim() !== ''; }
function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }

export function parseResourceEnvelope(value) {
  const keys = ['schema', 'status', 'items', 'consulted', 'observedAt', 'reason'];
  if (!exactKeys(value, keys) || value.schema !== RUNTIME_RESOURCE_SCHEMA) invalid('Invalid runtime resource envelope.');
  if (!['available', 'unavailable'].includes(value.status)) invalid('Runtime resource status not recognized.');
  if (typeof value.consulted !== 'boolean' || !validDate(value.observedAt)) invalid('Invalid runtime resource metadata.');
  if (value.reason !== null && !nonEmpty(value.reason)) invalid('Invalid runtime resource reason.');
  if (value.status === 'available') {
    if (!value.consulted || !Array.isArray(value.items)) invalid('An available resource must have been consulted and have a list.');
  } else if (value.items !== null || value.consulted) {
    invalid('An unavailable resource cannot declare items or a completed consultation.');
  }
  return structuredClone(value);
}

export function parseBootstrapEnvelope(value) {
  const keys = ['schema', 'authoritative', 'runtime', 'observedAt'];
  if (!exactKeys(value, keys) || value.schema !== RUNTIME_BOOTSTRAP_SCHEMA) invalid('Invalid runtime bootstrap.');
  if (value.authoritative !== 'backend' || !validDate(value.observedAt)) invalid('The bootstrap must be confirmed by the backend.');
  if (value.runtime !== null) parseResourceEnvelope(value.runtime);
  return structuredClone(value);
}

export function deriveRuntimePhase(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) invalid('Invalid runtime snapshot.');
  if (snapshot.authoritative !== 'backend') invalid('The runtime state from the browser is not authoritative.');
  if (!['booting', 'offline', 'degraded', 'ready'].includes(snapshot.state)) invalid('Runtime phase not recognized.');
  if (snapshot.state === 'booting') return 'booting';
  if (snapshot.state === 'offline') return 'offline';
  if (snapshot.state === 'degraded') return 'degraded';
  const runtime = parseResourceEnvelope(snapshot.runtime);
  if (runtime.status !== 'available') return 'degraded';
  return runtime.items.length === 0 ? 'ready-empty' : 'ready-active';
}

// Compatibilità: il trasporto degli eventi locale resta quello già usato da
// runtime llama/OpenAI; questo modulo non lo trasforma in un modello dominio.
export const parseRuntimeEventEnvelope = parseExistingRuntimeEventEnvelope;
