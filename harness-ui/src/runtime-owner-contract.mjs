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
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RuntimeOwnerContractError('Stato runtime non valido.');
  const { status, items, reason = null, observedAt = null } = value;
  if (status !== 'available' && status !== 'unavailable') throw new RuntimeOwnerContractError('Stato runtime sconosciuto.');
  if (status === 'available' && !Array.isArray(items)) throw new RuntimeOwnerContractError('Un runtime disponibile deve fornire un elenco.');
  if (status === 'unavailable' && items !== null) throw new RuntimeOwnerContractError('Un runtime non disponibile non può fornire elementi.');
  if (reason !== null && (typeof reason !== 'string' || reason.length === 0)) throw new RuntimeOwnerContractError('Motivo runtime non valido.');
  if (!isIsoDate(observedAt)) throw new RuntimeOwnerContractError('Data di osservazione runtime non valida.');
  return Object.freeze({ status, items, reason, observedAt });
}

