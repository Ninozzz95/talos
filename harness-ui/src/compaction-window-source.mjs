/**
 * Finestra conservativa di una route OpenRouter dinamica. Il catalogo del modello
 * descrive il modello, non tutti gli endpoint ai quali il router può inviare il giro.
 * La lettura è sincrona per il registro; il refresh di rete avviene fuori dal giro.
 */
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/u;
const validWindow = (value) => Number.isSafeInteger(value) && value > 0;

export function createCompactionWindowSource({
  fetchFn = globalThis.fetch,
  now = Date.now,
  ttlMs = 10 * 60 * 1_000,
  retryMs = 60_000,
} = {}) {
  const cached = new Map();
  const inFlight = new Map();
  const retryAfter = new Map();
  const validId = (id) => typeof id === 'string' && MODEL_ID.test(id) && !id.startsWith('openrouter/');

  async function refresh(id) {
    if (!validId(id)) return null;
    if (inFlight.has(id)) return inFlight.get(id);
    const pending = (async () => {
      try {
        const [author, slug] = id.split('/');
        const url = `https://openrouter.ai/api/v1/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`;
        const response = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
        if (!response?.ok) return null;
        const data = (await response.json())?.data;
        const endpoints = data?.endpoints;
        if (data?.id !== id || !Array.isArray(endpoints) || endpoints.length === 0 || endpoints.length > 1_000) return null;
        if (!endpoints.every((endpoint) => endpoint?.model_id === id && validWindow(endpoint?.context_length))) return null;
        const windowTokens = Math.min(...endpoints.map((endpoint) => endpoint.context_length));
        cached.set(id, { windowTokens, expiresAt: now() + ttlMs });
        retryAfter.delete(id);
        return windowTokens;
      } catch {
        return null;
      } finally {
        inFlight.delete(id);
      }
    })();
    inFlight.set(id, pending);
    const result = await pending;
    if (result === null) retryAfter.set(id, now() + retryMs);
    return result;
  }

  function get(id) {
    if (!validId(id)) return null;
    const entry = cached.get(id);
    if (entry && entry.expiresAt > now()) return entry.windowTokens;
    cached.delete(id);
    if (!inFlight.has(id) && (retryAfter.get(id) ?? 0) <= now()) void refresh(id);
    return null;
  }

  return Object.freeze({ get, refresh });
}
