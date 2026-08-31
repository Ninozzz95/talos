import { createStreamPartitioner } from './stream-partition.mjs';

const PROVIDERS = Object.freeze({
  ollama: { baseUrl: 'http://127.0.0.1:11434', listPath: '/api/tags' },
  lmstudio: { baseUrl: 'http://127.0.0.1:1234', listPath: '/api/v1/models' },
});

export class OpenAiCompatibleRuntimeError extends Error {
  constructor(message, code = 'RUNTIME_FAILED') {
    super(message);
    this.name = 'OpenAiCompatibleRuntimeError';
    this.code = code;
  }
}

function fail(message, code = 'RUNTIME_INVALID') {
  throw new OpenAiCompatibleRuntimeError(message, code);
}

function capability(value) {
  return typeof value === 'boolean' ? { state: 'observed', value } : { state: 'unknown', value: null };
}

function context(value) {
  return Number.isSafeInteger(value) && value > 0
    ? { state: 'observed', value }
    : { state: 'unknown', value: null };
}

async function readJson(response) {
  if (!response?.ok) throw new OpenAiCompatibleRuntimeError(`runtime returned HTTP ${response?.status ?? 0}`, 'RUNTIME_HTTP_ERROR');
  try { return await response.json(); } catch { throw new OpenAiCompatibleRuntimeError('runtime returned invalid JSON', 'RUNTIME_RESPONSE_INVALID'); }
}

async function* readStreamLines(response) {
  if (!response?.ok) throw new OpenAiCompatibleRuntimeError(`runtime returned HTTP ${response?.status ?? 0}`, 'RUNTIME_HTTP_ERROR');
  if (!response.body || typeof response.body.getReader !== 'function') fail('runtime stream body is unavailable', 'RUNTIME_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? '';
      yield* lines;
      if (done) break;
    }
    if (buffer.trim() !== '') yield buffer;
  } finally { await reader.cancel().catch(() => {}); }
}

function normalizeOllamaModel(raw, observedAt) {
  const id = typeof raw?.name === 'string' && raw.name.trim() ? raw.name : '';
  if (!id) return null;
  const details = raw.details ?? {};
  return {
    id,
    name: id,
    source: 'ollama',
    context: context(details.context_length),
    verifiedContext: Number.isSafeInteger(details.context_length) && details.context_length > 0,
    capabilities: {
      vision: capability(Array.isArray(details.families) && details.families.some((family) => /(?:clip|vision|llava)/iu.test(family))),
      toolUse: { state: 'unknown', value: null },
      reasoning: { state: 'unknown', value: null },
    },
    sizeBytes: Number.isSafeInteger(raw.size) ? raw.size : null,
    quantization: typeof details.quantization_level === 'string' ? details.quantization_level : null,
    observedAt,
  };
}

function normalizeLmModel(raw, observedAt) {
  if (raw?.type !== 'llm' || typeof raw.key !== 'string' || raw.key.trim() === '') return null;
  const reasoning = raw.capabilities?.reasoning;
  const allowedReasoning = Array.isArray(reasoning?.allowed_options) ? reasoning.allowed_options : [];
  return {
    id: raw.key,
    name: typeof raw.display_name === 'string' && raw.display_name ? raw.display_name : raw.key,
    source: 'lmstudio',
    context: context(raw.max_context_length),
    verifiedContext: Number.isSafeInteger(raw.max_context_length) && raw.max_context_length > 0,
    capabilities: {
      vision: capability(raw.capabilities?.vision),
      toolUse: capability(raw.capabilities?.trained_for_tool_use),
      reasoning: allowedReasoning.length > 0 ? { state: 'observed', value: true } : { state: 'observed', value: false },
    },
    sizeBytes: Number.isSafeInteger(raw.size_bytes) ? raw.size_bytes : null,
    quantization: typeof raw.quantization?.name === 'string' ? raw.quantization.name : null,
    observedAt,
  };
}

export function createOpenAiCompatibleRuntime({
  fetchImpl = fetch,
  now = () => new Date(),
  endpoints = {},
} = {}) {
  const activeRequests = new Map();
  const configs = Object.freeze({
    ollama: { ...PROVIDERS.ollama, ...(endpoints.ollama ?? {}) },
    lmstudio: { ...PROVIDERS.lmstudio, ...(endpoints.lmstudio ?? {}) },
  });

  function config(provider) {
    if (!Object.hasOwn(configs, provider)) fail(`unknown local provider: ${provider}`);
    return configs[provider];
  }

  async function request(provider, path, options = {}) {
    const target = `${config(provider).baseUrl}${path}`;
    try { return await fetchImpl(target, { ...options, headers: { Accept: 'application/json', ...(options.headers ?? {}) } }); }
    catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new OpenAiCompatibleRuntimeError(`runtime ${provider} unreachable: ${error.message}`, 'RUNTIME_UNREACHABLE');
    }
  }

  async function detect(provider) {
    const observedAt = now().toISOString();
    try {
      const body = await readJson(await request(provider, config(provider).listPath));
      const valid = provider === 'ollama' ? Array.isArray(body?.models) : Array.isArray(body?.models);
      if (!valid) return { provider, state: 'unknown', baseUrl: config(provider).baseUrl, observedAt, failureReason: 'INVALID_RESPONSE' };
      return { provider, state: 'observed', baseUrl: config(provider).baseUrl, observedAt };
    } catch (error) {
      return { provider, state: 'unknown', baseUrl: config(provider).baseUrl, observedAt, failureReason: error.code || 'RUNTIME_FAILED' };
    }
  }

  async function listModels(provider) {
    const body = await readJson(await request(provider, config(provider).listPath));
    if (!Array.isArray(body?.models)) fail('runtime model list is invalid', 'RUNTIME_RESPONSE_INVALID');
    const observedAt = now().toISOString();
    const normalize = provider === 'ollama' ? normalizeOllamaModel : normalizeLmModel;
    return body.models.map((model) => normalize(model, observedAt)).filter(Boolean);
  }

  async function inspect(provider, modelId) {
    const model = (await listModels(provider)).find(({ id }) => id === modelId);
    if (!model) fail(`model ${modelId} not found in ${provider}`, 'MODEL_NOT_FOUND');
    return model;
  }

  async function load(provider, modelId, { contextLength } = {}) {
    if (provider !== 'lmstudio') fail('Ollama manages loading through its own lifecycle', 'RUNTIME_OPERATION_UNSUPPORTED');
    const body = await readJson(await request(provider, '/api/v1/models/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelId, ...(contextLength ? { context_length: contextLength } : {}) }) }));
    if (!['loaded', 'already_loaded'].includes(body?.status)) fail('LM Studio did not confirm model load', 'MODEL_LOAD_UNCONFIRMED');
    return { state: 'loaded', provider, modelId, observedAt: now().toISOString() };
  }

  async function unload(provider, modelId) {
    if (provider !== 'lmstudio') fail('Ollama manages unloading through its own lifecycle', 'RUNTIME_OPERATION_UNSUPPORTED');
    const body = await readJson(await request(provider, '/api/v1/models/unload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelId }) }));
    if (!['unloaded', 'already_unloaded'].includes(body?.status)) fail('LM Studio did not confirm model unload', 'MODEL_UNLOAD_UNCONFIRMED');
    return { state: 'unloaded', provider, modelId, observedAt: now().toISOString() };
  }

  async function* generateStream({ provider, modelId, messages, tools, signal, requestId } = {}) {
    if (!Array.isArray(messages) || typeof modelId !== 'string' || modelId.trim() === '') fail('stream request is invalid');
    const controller = new AbortController();
    if (signal?.aborted) controller.abort(signal.reason);
    const combinedSignal = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    if (signal && typeof AbortSignal.any !== 'function') signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    if (requestId) activeRequests.set(requestId, controller);
    const isOllama = provider === 'ollama';
    const body = isOllama
      ? { model: modelId, messages, stream: true, ...(tools ? { tools } : {}) }
      : { model: modelId, messages, stream: true, ...(tools ? { tools } : {}) };
    let taggedEvents = [];
    const taggedContent = createStreamPartitioner({
      onText: (value) => taggedEvents.push({ type: 'text', value }),
      onReasoning: (value) => taggedEvents.push({ type: 'reasoning', value }),
      onToolCall: (value) => taggedEvents.push({ type: 'tool_call', ...value }),
    });
    const flushTaggedEvents = function* () {
      const events = taggedEvents;
      taggedEvents = [];
      for (const event of events) yield event;
    };
    try {
      const response = await request(provider, isOllama ? '/api/chat' : '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: isOllama ? 'application/x-ndjson' : 'text/event-stream' }, body: JSON.stringify(body), signal: combinedSignal });
      for await (const line of readStreamLines(response)) {
      const trimmed = line.trim();
      if (!trimmed || (!isOllama && !trimmed.startsWith('data:'))) continue;
      const payload = isOllama ? trimmed : trimmed.slice(5).trim();
      if (payload === '[DONE]') { taggedContent.finish(); yield* flushTaggedEvents(); yield { type: 'done' }; return; }
      let chunk;
      try { chunk = JSON.parse(payload); } catch { yield { type: 'error', code: 'RUNTIME_RESPONSE_INVALID', message: 'runtime emitted malformed stream JSON' }; continue; }
      if (isOllama) {
        if (typeof chunk.message?.thinking === 'string' && chunk.message.thinking) yield { type: 'reasoning', value: chunk.message.thinking };
        if (typeof chunk.message?.content === 'string' && chunk.message.content) {
          taggedContent.push(chunk.message.content);
          yield* flushTaggedEvents();
        }
        for (const call of chunk.message?.tool_calls ?? []) yield { type: 'tool_call', name: call.function?.name ?? '', arguments: call.function?.arguments ?? {} };
        if (chunk.done === true) yield { type: 'done' };
      } else {
        const delta = chunk.choices?.[0]?.delta ?? {};
        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (typeof reasoning === 'string' && reasoning) yield { type: 'reasoning', value: reasoning };
        if (typeof delta.content === 'string' && delta.content) {
          taggedContent.push(delta.content);
          yield* flushTaggedEvents();
        }
        for (const call of delta.tool_calls ?? []) yield { type: 'tool_call', id: call.id, name: call.function?.name ?? '', arguments: call.function?.arguments ?? '' };
      }
      }
      taggedContent.finish();
      yield* flushTaggedEvents();
    } finally {
      if (requestId) activeRequests.delete(requestId);
    }
  }

  function cancel(requestId) {
    const controller = activeRequests.get(requestId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async function health(provider) {
    const response = await request(provider, provider === 'ollama' ? '/' : '/api/v1/models');
    return { provider, ok: Boolean(response.ok), observedAt: now().toISOString() };
  }

  return Object.freeze({ detect, listModels, inspect, load, unload, generateStream, cancel, health });
}
