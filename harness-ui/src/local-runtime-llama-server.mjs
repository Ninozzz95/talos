import { parseRuntimeEventEnvelope } from './local-runtime-events.mjs';
import { createStreamPartitioner } from './stream-partition.mjs';

export class LlamaServerRuntimeError extends Error {
  constructor(message, code = 'RUNTIME_FAILED') {
    super(message);
    this.name = 'LlamaServerRuntimeError';
    this.code = code;
  }
}

function runtimeInvalid(message) {
  return new LlamaServerRuntimeError(message, 'RUNTIME_INVALID');
}

function envelope({ runId, turnId, seq, type, runtimeId = 'llama.cpp', ...payload }, now) {
  return parseRuntimeEventEnvelope({ runId, turnId, runtimeId, seq, at: now().toISOString(), type, ...payload });
}

async function readText(response) {
  return typeof response.text === 'function' ? response.text() : '';
}

async function* sseEvents(response) {
  if (!response.body || typeof response.body.getReader !== 'function') throw new LlamaServerRuntimeError('SSE body is missing', 'RUNTIME_SSE_INVALID');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  try {
    while (!finished) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '') continue;
        if (data === '[DONE]') { finished = true; break; }
        try { yield JSON.parse(data); } catch { yield { __invalid: true }; }
      }
      if (done) break;
    }
    if (buffer.startsWith('data:')) {
      const data = buffer.slice(5).trim();
      if (data && data !== '[DONE]') {
        try { yield JSON.parse(data); } catch { yield { __invalid: true }; }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function createLlamaServerRuntime({ supervisor, fetchImpl = fetch, now = () => new Date() } = {}) {
  if (!supervisor || typeof supervisor.status !== 'function') throw new LlamaServerRuntimeError('supervisor is required', 'RUNTIME_MISCONFIGURED');
  const activeRequests = new Map();

  function baseUrl() {
    const status = supervisor.status();
    if (!status.baseUrl || status.state !== 'ready') throw new LlamaServerRuntimeError('runtime is not ready', 'RUNTIME_NOT_READY');
    return status.baseUrl;
  }

  async function jsonRequest(path) {
    const response = typeof supervisor.request === 'function'
      ? await supervisor.request(path, { headers: { Accept: 'application/json' } })
      : await fetchImpl(`${baseUrl()}${path}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new LlamaServerRuntimeError(`runtime returned HTTP ${response.status}`, 'RUNTIME_HTTP_ERROR');
    try { return await response.json(); } catch { throw new LlamaServerRuntimeError('runtime returned invalid JSON', 'RUNTIME_RESPONSE_INVALID'); }
  }

  async function probe() {
    return jsonRequest('/props');
  }

  async function listModels() {
    const body = await jsonRequest('/v1/models');
    if (!Array.isArray(body?.data)) throw new LlamaServerRuntimeError('runtime model list is invalid', 'RUNTIME_RESPONSE_INVALID');
    return body.data;
  }

  async function load(options) {
    return supervisor.start(options);
  }

  async function unload() {
    return supervisor.stop();
  }

  async function health() {
    return supervisor.health();
  }

  async function metrics() {
    const response = typeof supervisor.request === 'function'
      ? await supervisor.request('/metrics', { headers: { Accept: 'text/plain' } })
      : await fetchImpl(`${baseUrl()}/metrics`, { headers: { Accept: 'text/plain' } });
    if (!response.ok) throw new LlamaServerRuntimeError(`runtime returned HTTP ${response.status}`, 'RUNTIME_HTTP_ERROR');
    return readText(response);
  }

  async function* generateStream({ runId, turnId, modelId, messages, reasoning, reasoningFormat, parseToolCalls = false, maxTokens = 512, signal, requestId } = {}) {
    if (typeof runId !== 'string' || runId.trim() === '' || typeof turnId !== 'string' || turnId.trim() === '' || typeof modelId !== 'string' || modelId.trim() === '' || !Array.isArray(messages)) throw runtimeInvalid('stream request is invalid');
    const controller = new AbortController();
    if (signal?.aborted) controller.abort(signal.reason);
    const combinedSignal = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    if (signal && typeof AbortSignal.any !== 'function') signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    if (requestId) activeRequests.set(requestId, controller);
    let response;
    try {
      const body = { model: modelId, messages, stream: true, max_tokens: Number.isInteger(maxTokens) && maxTokens > 0 ? maxTokens : 512 };
      if (reasoning?.effort) body.reasoning_effort = reasoning.effort;
      if (reasoningFormat) body.reasoning_format = reasoningFormat;
      if (parseToolCalls) body.parse_tool_calls = true;
      const requestOptions = {
          method: 'POST',
          headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: combinedSignal,
        };
      response = typeof supervisor.request === 'function'
        ? await supervisor.request('/v1/chat/completions', requestOptions)
        : await fetchImpl(`${baseUrl()}/v1/chat/completions`, requestOptions);
      if (!response.ok) throw new LlamaServerRuntimeError(`runtime returned HTTP ${response.status}: ${await readText(response)}`, 'RUNTIME_HTTP_ERROR');
      let seq = 0;
      const pendingTools = new Map();
      let taggedEvents = [];
      const taggedContent = createStreamPartitioner({
        onText: (value) => taggedEvents.push({ type: 'text', value }),
        onReasoning: (value) => taggedEvents.push({ type: 'reasoning', value }),
        onToolCall: (value) => taggedEvents.push({ type: 'tool_call', ...value }),
      });
      const flushTaggedEvents = function* () {
        const events = taggedEvents;
        taggedEvents = [];
        for (const event of events) {
          if (event.type === 'tool_call') {
            yield envelope({ runId, turnId, seq: seq++, type: 'tool_call', id: event.id || `tagged-tool-${seq}`, name: event.name, arguments: typeof event.arguments === 'string' ? event.arguments : JSON.stringify(event.arguments ?? {}) }, now);
          } else {
            yield envelope({ runId, turnId, seq: seq++, type: event.type, value: event.value }, now);
          }
        }
      };
      for await (const chunk of sseEvents(response)) {
        if (chunk.__invalid) {
          yield envelope({ runId, turnId, seq: seq++, type: 'error', code: 'RUNTIME_SSE_INVALID', message: 'runtime emitted malformed SSE JSON', retryable: false }, now);
          continue;
        }
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
        if (typeof reasoningDelta === 'string' && reasoningDelta !== '') yield envelope({ runId, turnId, seq: seq++, type: 'reasoning', value: reasoningDelta }, now);
        if (typeof delta.content === 'string' && delta.content !== '') {
          taggedContent.push(delta.content);
          yield* flushTaggedEvents();
        }
        for (const call of delta.tool_calls ?? []) {
          const key = call.id ?? String(call.index ?? pendingTools.size);
          const previous = pendingTools.get(key) ?? { id: key, name: '', arguments: '', emitted: false };
          previous.name += call.function?.name ?? '';
          previous.arguments += call.function?.arguments ?? '';
          pendingTools.set(key, previous);
          if (!previous.emitted) {
            try {
              JSON.parse(previous.arguments);
              yield envelope({ runId, turnId, seq: seq++, type: 'tool_call', id: previous.id, name: previous.name, arguments: previous.arguments }, now);
              previous.emitted = true;
            } catch { /* stream fragments are completed at the end */ }
          }
        }
      }
      taggedContent.finish();
      yield* flushTaggedEvents();
      for (const tool of pendingTools.values()) {
        if (tool.emitted) continue;
        yield envelope({ runId, turnId, seq: seq++, type: 'error', code: 'TOOL_CALL_MALFORMED', message: `malformed tool call ${tool.id}`, retryable: false }, now);
      }
      yield envelope({ runId, turnId, seq: seq++, type: 'done' }, now);
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

  return Object.freeze({ probe, listModels, load, unload, generateStream, cancel, health, metrics });
}
