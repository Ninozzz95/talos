/** Versioned, provider-neutral readiness envelope for the optional owner runtime. */
export class RuntimeOwnerContractError extends Error {
  constructor(message, code = 'RUNTIME_SNAPSHOT_INVALID') {
    super(message);
    this.name = 'RuntimeOwnerContractError';
    this.code = code;
  }
}

function isIsoDate(value) {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

/**
 * Normalizes the only snapshot shape exposed to the HTTP/UI layer.
 * `unavailable` intentionally carries `items:null`; an empty array is
 * reserved for a successfully consulted runtime that has no entries.
 */
export function parseRuntimeOwnerSnapshot(value) {
  if (value === null || value === undefined) {
    return { status: 'unavailable', items: null, reason: 'runtime_not_configured', observedAt: null };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RuntimeOwnerContractError('Invalid runtime state.');
  const { status, items, reason = null, observedAt = null } = value;
  if (status !== 'available' && status !== 'unavailable') throw new RuntimeOwnerContractError('Stato runtime sconosciuto.');
  if (status === 'available' && !Array.isArray(items)) throw new RuntimeOwnerContractError('An available runtime must provide a list.');
  if (status === 'unavailable' && items !== null) throw new RuntimeOwnerContractError('An unavailable runtime cannot provide items.');
  if (reason !== null && (typeof reason !== 'string' || reason.length === 0)) throw new RuntimeOwnerContractError('Invalid runtime reason.');
  if (!isIsoDate(observedAt)) throw new RuntimeOwnerContractError('Invalid runtime observation date.');
  return Object.freeze({ status, items, reason, observedAt });
}

