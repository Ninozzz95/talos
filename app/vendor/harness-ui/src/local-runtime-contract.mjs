export const LOCAL_RUNTIME_STATES = ['unavailable', 'detected', 'loading', 'ready', 'stopping', 'failed'];
const EVENT_TYPES = ['text', 'reasoning', 'tool_call', 'status', 'error', 'done'];

function invalid(message) {
  const error = new Error(message);
  error.code = 'LOCAL_RUNTIME_INVALID';
  return error;
}

function exactKeys(value, keys) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function nonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw invalid(`${name} is required`);
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function safeModelId(value) {
  return typeof value === 'string' && value.trim() !== '' && !/^(?:[a-z]:[\\/]|[\\/]{2}|[\\/])/i.test(value);
}

export function parseLocalRuntimeSnapshot(value) {
  const keys = ['runtimeId', 'version', 'backend', 'model', 'contextTokens', 'capabilities', 'state', 'observedAt'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || !exactKeys(value, keys)) throw invalid('runtime snapshot shape is invalid');
  nonEmptyString(value.runtimeId, 'runtimeId');
  nonEmptyString(value.version, 'version');
  if (!value.backend || typeof value.backend !== 'object' || Array.isArray(value.backend) || !exactKeys(value.backend, ['id', 'device'])) throw invalid('backend is invalid');
  nonEmptyString(value.backend.id, 'backend.id');
  if (value.backend.device !== null) nonEmptyString(value.backend.device, 'backend.device');
  if (value.model !== null) {
    if (typeof value.model !== 'object' || Array.isArray(value.model) || !exactKeys(value.model, ['id', 'label']) || !safeModelId(value.model.id)) throw invalid('model is invalid');
    if (value.model.label !== null) nonEmptyString(value.model.label, 'model.label');
  }
  if (value.contextTokens !== null && (!Number.isInteger(value.contextTokens) || value.contextTokens <= 0)) throw invalid('contextTokens is invalid');
  const capabilityKeys = ['streaming', 'reasoning', 'toolCalls', 'multimodal'];
  if (!value.capabilities || typeof value.capabilities !== 'object' || Array.isArray(value.capabilities) || !exactKeys(value.capabilities, capabilityKeys) || capabilityKeys.some((key) => typeof value.capabilities[key] !== 'boolean')) throw invalid('capabilities are invalid');
  if (!LOCAL_RUNTIME_STATES.includes(value.state) || !validDate(value.observedAt)) throw invalid('state or observedAt is invalid');
  if (value.state === 'ready' && (!value.model || value.contextTokens === null)) throw invalid('ready runtime must have a model and context');
  return structuredClone(value);
}

export function parseLocalRuntimeEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.type !== 'string' || !EVENT_TYPES.includes(value.type)) throw invalid('runtime event type is invalid');
  if (!Number.isInteger(value.seq) || value.seq < 0) throw invalid('event sequence is invalid');
  const common = ['type', 'seq'];
  if (value.type === 'text' || value.type === 'reasoning') {
    if (!exactKeys(value, [...common, 'value']) || typeof value.value !== 'string') throw invalid(`${value.type} event is invalid`);
  } else if (value.type === 'tool_call') {
    if (!exactKeys(value, [...common, 'id', 'name', 'arguments'])) throw invalid('tool_call event shape is invalid');
    nonEmptyString(value.id, 'tool_call.id');
    nonEmptyString(value.name, 'tool_call.name');
    if (typeof value.arguments !== 'string') throw invalid('tool_call.arguments is invalid');
    try { JSON.parse(value.arguments); } catch { throw invalid('tool_call.arguments must be JSON'); }
  } else if (value.type === 'status') {
    if (!exactKeys(value, [...common, 'state']) || !LOCAL_RUNTIME_STATES.includes(value.state)) throw invalid('status event is invalid');
  } else if (value.type === 'error') {
    if (!exactKeys(value, [...common, 'code', 'message', 'retryable']) || typeof value.code !== 'string' || typeof value.message !== 'string' || typeof value.retryable !== 'boolean') throw invalid('error event is invalid');
  } else if (!exactKeys(value, common)) {
    throw invalid('done event is invalid');
  }
  return value.type;
}
