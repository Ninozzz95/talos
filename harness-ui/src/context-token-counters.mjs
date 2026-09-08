import { createHash } from 'node:crypto';
import { buildPreparedProviderRequest } from './context-provider-adapter.mjs';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const defaults = { openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta' };
const pick = (body, keys) => Object.fromEntries(keys.filter(key => body[key] !== undefined).map(key => [key, body[key]]));

export function createContextTokenCounter({ fetchFn, resolveProfile, hashFn = text => createHash('sha256').update(text).digest('hex') } = {}) {
  if (typeof resolveProfile !== 'function' || typeof fetchFn !== 'function') fail('CTX_TOKEN_PORT_INVALID', 'Profile resolution and transport must be injected.');
  return {
    async countPreparedContext({ messages, tools = [], model, signal }) {
      signal?.throwIfAborted();
      if (!model?.provider || !model.model || !Number.isSafeInteger(model.windowTokens) || model.windowTokens < 1 || !Number.isSafeInteger(model.responseReserve) || model.responseReserve < 0 || model.responseReserve >= model.windowTokens) fail('CTX_TOKEN_MODEL_INVALID', 'A valid model context window and reserve are required.');
      const profile = await resolveProfile(structuredClone(model)) ?? {};
      signal?.throwIfAborted();
      const compiled = await (profile.nativeRequestBuilder ?? buildPreparedProviderRequest)({ messages: structuredClone(messages), tools: structuredClone(tools), model: structuredClone(model), signal });
      if (!compiled?.body || typeof compiled.body !== 'object' || Array.isArray(compiled.body)) fail('CTX_TOKEN_REQUEST_INVALID', 'The request builder must return a JSON body.');
      const provider = model.provider;
      const body = provider === 'openai'
        ? pick(compiled.body, ['model', 'input', 'instructions', 'tools', 'tool_choice', 'text', 'reasoning', 'parallel_tool_calls'])
        : provider === 'anthropic'
          ? pick(compiled.body, ['model', 'messages', 'system', 'tools', 'tool_choice', 'thinking', 'output_config'])
          : provider === 'gemini' ? { generateContentRequest: { ...compiled.body, model: `models/${model.model.replace(/^models\//u, '')}` } } : compiled.body;
      const requestHash = await hashFn(JSON.stringify({ provider, model: model.model, body }));
      const base = { schema: 'talos.context.tokens.v1', windowTokens: model.windowTokens, responseReserve: model.responseReserve, requestHash, provider, model: model.model };
      const heuristic = () => {
        // UTF-8 bytes + framing is deliberately conservative, never an exact tokenizer.
        const inputTokens = Buffer.byteLength(JSON.stringify(body), 'utf8') + messages.length * 12;
        return { ...base, inputTokens, method: 'heuristic', exact: false, estimatedMarginTokens: Math.max(256, Math.ceil(inputTokens * 0.15)) };
      };
      const cloud = Object.hasOwn(defaults, provider);
      const runtime = provider === 'local' || provider === 'llama.cpp' || provider === 'llamacpp';
      if (!cloud && !runtime) return heuristic();
      if (cloud && (typeof profile.apiKey !== 'string' || !profile.apiKey.trim())) fail('CTX_TOKEN_AUTH', 'The selected provider has no injected credential.');
      if (runtime && !profile.baseURL) return heuristic();
      let url;
      try { url = new URL(profile.baseURL ?? defaults[provider]); } catch { fail('CTX_TOKEN_PROFILE_INVALID', 'The selected provider URL is invalid.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('CTX_TOKEN_PROFILE_INVALID', 'The provider URL must be an HTTP base without credentials or query parameters.');
      const endpoint = provider === 'openai' ? '/responses/input_tokens' : provider === 'anthropic' ? '/messages/count_tokens' : provider === 'gemini' ? `/models/${encodeURIComponent(model.model.replace(/^models\//u, ''))}:countTokens` : '/chat/completions/input_tokens';
      url.pathname = url.pathname.replace(/\/$/u, '') + endpoint;
      const headers = { 'content-type': 'application/json' };
      if (provider === 'anthropic') {
        headers['x-api-key'] = profile.apiKey;
        headers['anthropic-version'] = compiled.headers?.['anthropic-version'] ?? '2023-06-01';
        if (compiled.headers?.['anthropic-beta']) headers['anthropic-beta'] = compiled.headers['anthropic-beta'];
      } else if (provider === 'gemini') headers['x-goog-api-key'] = profile.apiKey;
      else if (profile.apiKey) headers.authorization = `Bearer ${profile.apiKey}`;
      signal?.throwIfAborted();
      let response;
      try { response = await fetchFn(url.href, { method: 'POST', headers, body: JSON.stringify(body), signal, redirect: 'error' }); }
      catch { signal?.throwIfAborted(); fail('CTX_TOKEN_NETWORK', 'The selected token counter could not be reached.'); }
      signal?.throwIfAborted();
      if ([404, 405, 501].includes(response.status)) return heuristic();
      if ([401, 403].includes(response.status)) fail('CTX_TOKEN_AUTH', 'The token counter rejected the injected credential.');
      if (!response.ok) fail('CTX_TOKEN_HTTP', `The token counter failed with HTTP ${response.status}.`);
      let result;
      try { result = await response.json(); } catch { fail('CTX_TOKEN_RESPONSE_INVALID', 'The token counter returned invalid JSON.'); }
      const inputTokens = provider === 'gemini' ? result?.totalTokens : result?.input_tokens;
      if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) fail('CTX_TOKEN_RESPONSE_INVALID', 'The token counter returned an invalid input token count.');
      // Provider preflight is a measurement, not a promise of later billed usage.
      return { ...base, inputTokens, method: runtime ? 'runtime' : 'provider', exact: runtime };
    },
  };
}

export async function countPreparedContext(request, ports) {
  return createContextTokenCounter(ports).countPreparedContext(request);
}
