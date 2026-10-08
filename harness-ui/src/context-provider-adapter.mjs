// AVM owns canonical messages. The existing pinned SDK adapter owns wire formats.
import { ID_NATIVI_SDK } from './provider-registry.mjs';
import { creaIniettoreSezioni } from './sezioni-istruzioni.mjs';
import { healEchoedMarker } from './eco-del-marcatore.mjs';
import { ripristinaArgomentiVuotiInPlace } from './argomenti-vuoti.mjs';

// BC-48 A: gli originali ricevono soltanto nuovi messaggi, prima di archivio e misura.
export function collegaSezioniAiContextHooks({ contextHooks, file, cartella, radice } = {}) {
  if (!contextHooks) return contextHooks;
  const inietta = creaIniettoreSezioni({ file, cartella, radice });
  return {
    ...contextHooks,
    async capture(input) {
      inietta(input.messages);
      return contextHooks.capture?.(input);
    },
    async prepare(input) {
      inietta(input.messages);
      return contextHooks.prepare(input);
    },
  };
}

const fail = (code, message, extra = {}) => { throw Object.assign(new Error(message), { code, ...extra }); };
const clone = value => structuredClone(value);
const identity = value => value && typeof value.provider === 'string' && value.provider && typeof value.model === 'string' && value.model;
// Historical tool arguments are re-canonicalized before replay (Hermes-style) so strict providers
// never see whitespace or ordering drift accumulated by older builds. Unparseable text is kept as-is.
const canonicalArgs = value => {
  if (typeof value !== 'string') return value;
  try { const parsed = JSON.parse(value); return parsed !== null && typeof parsed === 'object' ? JSON.stringify(parsed) : value; } catch { return value; }
};

export function createContextModelAdapter({ resolveModel, callModel, usagePolicy } = {}) {
  if (typeof resolveModel !== 'function' || typeof callModel !== 'function') fail('CTX_MODEL_PORT_INVALID', 'Model resolution and invocation must be injected.');
  return {
    prepareContext({ messages, model, reset = false }) {
      return prepareProviderContext({ messages, provider: model.provider, model: model.model, reset });
    },
    async resolveModel({ sessionModel, settings }) {
      const selected = settings?.model?.mode === 'explicit' ? settings.model : sessionModel;
      if (!identity(selected)) fail('CTX_MODEL_INVALID', 'A session or explicit model is required.');
      const resolved = await resolveModel(clone({ sessionModel, settings }));
      if (!identity(resolved) || resolved.provider !== selected.provider || resolved.model !== selected.model) fail('CTX_MODEL_MISMATCH', 'The resolver changed the selected provider or model.');
      if (!Number.isSafeInteger(resolved.windowTokens) || resolved.windowTokens <= 0 || !Number.isSafeInteger(resolved.responseReserve) || resolved.responseReserve < 0 || resolved.responseReserve >= resolved.windowTokens) fail('CTX_MODEL_INVALID', 'The model context window and response reserve are invalid.');
      return clone(resolved);
    },
    async summarize({ model, messages, maxOutputTokens, signal, operationId, focus }) {
      signal?.throwIfAborted();
      if (!identity(model) || !Array.isArray(messages) || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) fail('CTX_MODEL_INVALID', 'A model, messages and positive output limit are required.');
      const request = { provider: model.provider, model: model.model, messages: clone(messages), maxOutputTokens, signal, operationId, tools: [], maxRetries: 0, ...(focus !== undefined ? { focus } : {}) };
      if (usagePolicy?.authorize && await usagePolicy.authorize({ model: clone(model), operationId, maxOutputTokens, signal }) !== true) fail('CTX_USAGE_DENIED', 'The session usage policy declined this summary.');
      signal?.throwIfAborted();
      const response = await callModel(request);
      // Usage must survive validation failure so the caller can account for a billed attempt.
      const usage = response?.usage === undefined ? undefined : clone(response.usage);
      if (signal?.aborted) {
        try { signal.throwIfAborted(); } catch (error) { if (usage !== undefined) error.usage = usage; throw error; }
      }
      if (typeof response?.text !== 'string' || typeof response?.finishReason !== 'string' || !response.finishReason) fail('CTX_SUMMARY_RESPONSE_INVALID', 'The summary response lacks text or an explicit finish reason.', { usage });
      return { text: response.text, finishReason: response.finishReason, usage, model: clone(model) };
    },
  };
}

export function prepareProviderContext({ messages, provider, model, reset = false } = {}) {
  if (!Array.isArray(messages) || typeof provider !== 'string' || typeof model !== 'string') fail('CTX_PROVIDER_CONTEXT_INVALID', 'Messages and target provider/model are required.');
  const prepared = clone(messages);
  const pending = new Map(); const seen = new Set(); const warnings = new Set();
  if (healEchoedMarker(prepared)) warnings.add('CTX_ECHOED_MARKER_REMOVED');
  // Una chiamata salvata con argomenti vuoti (zero frammenti dallo stream) parte come l'oggetto vuoto: la copia, mai la storia.
  ripristinaArgomentiVuotiInPlace(prepared);
  for (const message of prepared) {
    if (!message || typeof message !== 'object') fail('CTX_PROVIDER_CONTEXT_INVALID', 'Invalid message.');
    for (const call of message.tool_calls ?? []) {
      if (message.role !== 'assistant' || !call?.id || !call.function?.name || seen.has(call.id)) fail('CTX_PENDING_TOOLS', 'Tool calls must have unique IDs and an assistant owner.');
      if (pending.size && !message.tool_calls.some(c => pending.has(c.id))) fail('CTX_PENDING_TOOLS', 'A tool batch must close before a new assistant call.');
      seen.add(call.id); pending.set(call.id, call);
    }
    if (message.role === 'tool') {
      if (!pending.has(message.tool_call_id)) fail('CTX_PENDING_TOOLS', 'Tool result has no pending call.');
      pending.delete(message.tool_call_id);
    } else if (pending.size && !message.tool_calls?.length) fail('CTX_PENDING_TOOLS', 'A tool batch must close before another conversational message.');
  }
  // An interrupted turn leaves its tool calls unanswered at the tail of the history. Close them
  // with synthetic results in the prepared view only, so strict pairing wires accept the replay
  // without rewriting the stored history. Structural breaks mid-history remain hard failures.
  if (pending.size) {
    for (const [id] of pending) prepared.push({ role: 'tool', tool_call_id: id, content: JSON.stringify({ status: 'error', error: 'interrupted_before_result', interrupted: true }) });
    pending.clear();
  }
  let resetApplied = reset;
  for (const message of prepared) {
    const state = message.talos_provider_state;
    const matching = state?.version === 1 && state.provider === provider && state.model === model && Array.isArray(state.content);
    const incompatible = Boolean(state) && !matching;
    // Gemini 3 SDK injects a validator-bypass sentinel for unsigned tool replay.
    // Keep original signatures, or carry a closed exchange as historical data.
    const firstNativeCall = matching ? state.content.find(p => p.type === 'tool-call') : undefined;
    const signature = firstNativeCall?.providerOptions?.google?.thoughtSignature;
    const unsignedGemini = provider === 'gemini' && message.tool_calls?.length && !(typeof signature === 'string' && signature && signature !== 'skip_thought_signature_validator');
    if (reset) {
      // Explicit reset strips the opaque state only; the exchange stays native and paired.
      resetApplied = true;
      delete message.talos_provider_state; delete message.reasoning_content;
      if (state) warnings.add('CTX_NATIVE_STATE_RESET');
    } else if (incompatible) {
      // The recorded state no longer matches the target (model switch, restart, version bump).
      // Re-anchor the native exchange instead of degrading tool calls to historical text: a
      // same-provider state keeps its recorded native content re-anchored to the target model,
      // anything else drops the opaque state while keeping the portable tool pairing. Historical
      // arguments are re-canonicalized so every provider receives a stable, idempotent payload.
      resetApplied = true;
      if (Array.isArray(state.content) && state.provider === provider) message.talos_provider_state = { ...state, version: 1, provider, model };
      else delete message.talos_provider_state;
      delete message.reasoning_content;
      if (state) warnings.add('CTX_NATIVE_MODEL_CHANGED');
      for (const call of message.tool_calls ?? []) call.function.arguments = canonicalArgs(call.function.arguments);
    } else if (unsignedGemini) {
      // Keep the exchange native: never fabricate or strip signatures here, replay unsigned calls
      // as recorded. The previous data conversion hid the gap and poisoned every later turn.
      warnings.add('CTX_GEMINI_SIGNATURE_MISSING');
    }
  }
  // No historical-data conversion happens here anymore: tool exchanges stay native and paired,
  // interrupted tails carry synthetic closing results, and incompatible states are re-anchored
  // above. The prepared context is a pure, idempotent function of its input.
  return { messages: prepared, resetApplied, warnings: [...warnings] };
}

/** Compile through the same public SDK API as inference, stopping before I/O. */
export async function buildPreparedProviderRequest({ messages, tools = [], model, signal, requestOptions = {} } = {}) {
  signal?.throwIfAborted();
  if (!identity(model) || !Array.isArray(tools)) fail('CTX_PROVIDER_CONTEXT_INVALID', 'A target model and tool list are required.');
  const allowed = ['reasoning_effort', 'reasoning', 'tool_choice', 'max_tokens', 'max_completion_tokens', 'temperature', 'top_p', 'stop'];
  if (!requestOptions || typeof requestOptions !== 'object' || Array.isArray(requestOptions) || Object.keys(requestOptions).some(key => !allowed.includes(key))) fail('CTX_PROVIDER_CONTEXT_INVALID', 'Only supported nonsecret request options may be compiled.');
  for (const key of ['max_tokens', 'max_completion_tokens']) {
    if (requestOptions[key] !== undefined && (!Number.isSafeInteger(requestOptions[key]) || requestOptions[key] < 1 || (Number.isSafeInteger(model.responseReserve) && requestOptions[key] > model.responseReserve))) fail('CTX_PROVIDER_CONTEXT_INVALID', 'The output token limit must fit the reserved model budget.');
  }
  const prepared = prepareProviderContext({ messages, provider: model.provider, model: model.model });
  if (!ID_NATIVI_SDK.includes(model.provider)) {
    return { body: { model: model.model, messages: prepared.messages.map(({ talos_provider_state, ...message }) => message), ...(tools.length ? { tools: clone(tools) } : {}), ...clone(requestOptions) }, headers: {} };
  }
  const { nativeProviderResponse } = await import('./native-provider-adapter.mjs');
  const sentinel = new Error('Context request compiled locally.');
  let captured;
  try {
    await nativeProviderResponse({
      provider: model.provider, model: model.model, apiKey: 'context-local-serialization-only',
      body: { messages: prepared.messages, tools: clone(tools), ...clone(requestOptions), stream: false }, signal,
      fetchFn: async (_url, init) => {
        signal?.throwIfAborted();
        const headers = new Headers(init.headers);
        captured = { body: JSON.parse(init.body), headers: Object.fromEntries(['anthropic-version', 'anthropic-beta'].filter(name => headers.has(name)).map(name => [name, headers.get(name)])) };
        throw sentinel;
      },
    });
  } catch {
    signal?.throwIfAborted();
    if (!captured) fail('CTX_PROVIDER_SERIALIZATION', 'The pinned SDK could not serialize this context.');
  }
  if (!captured) fail('CTX_PROVIDER_SERIALIZATION', 'The pinned SDK did not produce a request.');
  return captured;
}
