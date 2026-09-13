// Projection of already reported inference usage, never a preflight estimate.
// Transport adapters normalize native provider formats before this boundary.
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function contextUsageFromEvents(events, { sessionId } = {}) {
  if (!Array.isArray(events)) return null;
  const seen = new Set();
  const totals = { prompt_tokens: null, completion_tokens: null, cached_tokens: null, operazioni: 0, prompt_tokens_con_cache: null, operazioniConCache: 0 };
  const overflow = new Set();
  const add = (key, value) => {
    if (value === null || overflow.has(key)) return;
    const sum = (totals[key] ?? 0) + value;
    if (!Number.isSafeInteger(sum)) { totals[key] = null; overflow.add(key); }
    else totals[key] = sum;
  };
  for (const wire of events) {
    if (wire?.type !== 'CUSTOM' || wire.name !== 'talos.context') continue;
    const event = wire.value;
    if (event?.schema !== 'talos.context.event.v1' || event.kind !== 'context.usage.recorded' || typeof event.sessionId !== 'string' || !event.sessionId || (sessionId !== undefined && event.sessionId !== sessionId)) continue;
    const { operationId, usage } = event.payload ?? {};
    if (typeof operationId !== 'string' || !operationId || !usage || typeof usage !== 'object' || Array.isArray(usage)) continue;
    const key = JSON.stringify([event.sessionId, operationId]);
    if (seen.has(key)) continue;
    seen.add(key); totals.operazioni++;
    const input = count(usage.inputTokens ?? usage.prompt_tokens);
    const output = count(usage.outputTokens ?? usage.completion_tokens);
    const cached = count(usage.cachedTokens ?? usage.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens);
    add('prompt_tokens', input); add('completion_tokens', output);
    if (input !== null && cached !== null && cached <= input) {
      add('cached_tokens', cached); add('prompt_tokens_con_cache', input); totals.operazioniConCache++;
    }
  }
  return totals.operazioni ? totals : null;
}
