import { buildPreparedProviderRequest } from './context-provider-adapter.mjs';
import { tokenDaCache } from './usage-cache.mjs';

const protocols = { openai: 'openai.responses.compact@2026-09-08', anthropic: 'anthropic.messages@2023-06-01/compact-2026-01-12' };
const defaults = { openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1' };
const fail = (code, message, usage) => { throw Object.assign(new Error(message), { code, ...(usage !== undefined ? { usage } : {}) }); };
/*
 * ⛔ 12/09 — P-B: leggeva `input_tokens_details.cached_tokens` e basta, cioe la forma del solo wire
 *   Responses. La compattazione gira anche su Anthropic (`protocols` qui sopra ne ha due), dove il
 *   campo si chiama `cache_read_input_tokens`: su quel wire il conto tornava sempre vuoto.
 *   Adesso i nomi li dice il record del fornitore, e la funzione e una sola per tutto il repo.
 */
const usageOf = (response, provider) => {
  const usage = {}; const source = response?.usage;
  for (const [from, to] of [['input_tokens', 'inputTokens'], ['output_tokens', 'outputTokens'], ['total_tokens', 'totalTokens']]) if (Number.isSafeInteger(source?.[from]) && source[from] >= 0) usage[to] = source[from];
  const cached = tokenDaCache(source, provider);
  if (cached !== null) usage.cachedTokens = cached;
  return usage;
};

export function createNativeCompactionAdapter({ fetchFn, resolveProfile, verifyEvidence } = {}) {
  if (typeof fetchFn !== 'function' || typeof resolveProfile !== 'function') fail('CTX_NATIVE_PORT_INVALID', 'Profile resolution and transport must be injected.');
  const api = {
    async qualifyNativeCompaction({ model, evidenceId } = {}) {
      const protocolPin = protocols[model?.provider];
      if (!protocolPin || typeof model?.model !== 'string' || typeof evidenceId !== 'string' || !evidenceId || typeof verifyEvidence !== 'function') return { qualified: false, reason: 'CTX_NATIVE_UNQUALIFIED' };
      let report;
      try { report = await verifyEvidence({ model: structuredClone(model), evidenceId, protocolPin }); } catch { return { qualified: false, reason: 'CTX_NATIVE_EVIDENCE_UNAVAILABLE' }; }
      const qualified = report?.provider === model.provider && report?.model === model.model && report?.protocolPin === protocolPin && /^[a-f0-9]{64}$/u.test(report?.artifactHash ?? '') && report?.transport === 'live' && ['compaction', 'continuation', 'portableRecovery', 'cancellation'].every(check => report.checks?.[check] === true);
      return qualified ? { qualified: true, provider: model.provider, model: model.model, evidenceId, protocolPin, artifactHash: report.artifactHash } : { qualified: false, reason: 'CTX_NATIVE_UNQUALIFIED' };
    },
    async compact({ messages, model, signal, mode = 'off', evidenceId }) {
      signal?.throwIfAborted();
      if (mode !== 'qualified') fail('CTX_NATIVE_DISABLED', 'Native compaction is disabled.');
      const qualification = await api.qualifyNativeCompaction({ model, evidenceId });
      if (!qualification.qualified) fail('CTX_NATIVE_UNQUALIFIED', 'This provider and model have no verified live compaction evidence.');
      const profile = await resolveProfile(structuredClone(model)) ?? {};
      if (typeof profile.apiKey !== 'string' || !profile.apiKey.trim()) fail('CTX_NATIVE_AUTH', 'The selected provider has no injected credential.');
      const compiled = await (profile.nativeRequestBuilder ?? buildPreparedProviderRequest)({ messages: structuredClone(messages), tools: [], model: structuredClone(model), signal });
      if (!compiled?.body || typeof compiled.body !== 'object') fail('CTX_NATIVE_REQUEST_INVALID', 'The request builder must return a native JSON body.');
      let url;
      try { url = new URL(profile.baseURL ?? defaults[model.provider]); } catch { fail('CTX_NATIVE_PROFILE_INVALID', 'The provider URL is invalid.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('CTX_NATIVE_PROFILE_INVALID', 'The provider URL must be an HTTP base without credentials or query parameters.');
      const headers = { 'content-type': 'application/json' }; let body;
      if (model.provider === 'openai') {
        url.pathname = url.pathname.replace(/\/$/u, '') + '/responses/compact';
        headers.authorization = `Bearer ${profile.apiKey}`;
        body = { model: model.model, input: compiled.body.input, ...(compiled.body.instructions !== undefined ? { instructions: compiled.body.instructions } : {}) };
      } else {
        url.pathname = url.pathname.replace(/\/$/u, '') + '/messages';
        headers['x-api-key'] = profile.apiKey; headers['anthropic-version'] = '2023-06-01';
        headers['anthropic-beta'] = [...new Set([...(compiled.headers?.['anthropic-beta']?.split(',') ?? []), 'compact-2026-01-12'])].join(',');
        body = { ...compiled.body, model: model.model, max_tokens: model.responseReserve || 4096, stream: false, context_management: { edits: [{ type: 'compact_20260112', trigger: { type: 'input_tokens', value: 50000 }, pause_after_compaction: true }] } };
      }
      signal?.throwIfAborted(); let response;
      try { response = await fetchFn(url.href, { method: 'POST', headers, body: JSON.stringify(body), signal, redirect: 'error' }); }
      catch { signal?.throwIfAborted(); fail('CTX_NATIVE_NETWORK', 'Native compaction could not reach the selected provider.'); }
      let result;
      try { result = await response.json(); } catch { fail('CTX_NATIVE_RESPONSE_INVALID', 'Native compaction returned invalid JSON.'); }
      const usage = usageOf(result, model.provider);
      if (signal?.aborted) { try { signal.throwIfAborted(); } catch (error) { error.usage = usage; throw error; } }
      if (!response.ok) fail([401, 403].includes(response.status) ? 'CTX_NATIVE_AUTH' : 'CTX_NATIVE_HTTP', `Native compaction failed with HTTP ${response.status}.`, usage);
      if (model.provider === 'openai') {
        if (result?.object !== 'response.compaction' || !Array.isArray(result.output) || !result.output.some(item => item?.type === 'compaction' && typeof item.encrypted_content === 'string' && item.encrypted_content)) fail('CTX_NATIVE_RESPONSE_INVALID', 'The provider did not return a complete opaque compaction window.', usage);
      } else {
        if (result?.stop_reason !== 'compaction') fail('CTX_NATIVE_NOT_TRIGGERED', 'The provider did not trigger compaction for this input.', usage);
        if (!Array.isArray(result.content) || !result.content.some(item => item?.type === 'compaction' && typeof item.content === 'string' && item.content.trim())) fail('CTX_NATIVE_RESPONSE_INVALID', 'The provider returned an empty compaction block.', usage);
      }
      return { native: structuredClone(result), usage, model: structuredClone(model), qualification, portability: { portable: false, providerBound: true, requiresOriginals: true } };
    },
  };
  return api;
}

export const qualifyNativeCompaction = (request, { adapter }) => adapter.qualifyNativeCompaction(request);
