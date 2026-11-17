/*
 * 12/11/2026 (judge v1605): the standalone engine and the embedding engine check at start that a request WITHOUT the key gets 401, and
 * stop an engine that answers it (fail closed). b11669 makes every route but /health and /v1/health need the key
 * (llama.cpp `tools/server/server-http.cpp:252-256`). The fake engines of the tests answered 200 to everything: `conChiave` wraps one
 * so that the keyless check gets b11669's 401, and every other request goes to the fake as before. Nothing else changes.
 */

/** The Authorization of a request, from a plain object or a `Headers`. */
function autorizzazione(opzioni) {
  const h = opzioni?.headers;
  if (!h) return undefined;
  if (typeof h.get === 'function') return h.get('Authorization') ?? undefined;
  return h.Authorization ?? h.authorization;
}

/** b11669's answer to a request without the key. */
export function rispostaSenzaChiave() {
  const corpo = { error: { code: 401, message: 'Invalid API Key', type: 'authentication_error' } };
  return { ok: false, status: 401, headers: new Headers({ 'content-type': 'application/json' }), json: async () => corpo, text: async () => JSON.stringify(corpo) };
}

/** A fake engine's fetch, with the keyless check of the start answered 401 as b11669 does. */
export function conChiave(fetchImpl) {
  return async (url, opzioni) => {
    if (!autorizzazione(opzioni) && new URL(String(url)).pathname === '/v1/models') return rispostaSenzaChiave();
    return fetchImpl(url, opzioni);
  };
}

/** The standalone supervisor's factory with the fake fetch wrapped by `conChiave`; without a fake fetch nothing changes. */
export function conChiaveNelSupervisore(crea) {
  return (opzioni = {}) => crea(typeof opzioni.fetchImpl === 'function' ? { ...opzioni, fetchImpl: conChiave(opzioni.fetchImpl) } : opzioni);
}
