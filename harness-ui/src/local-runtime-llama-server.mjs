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

  /**
   * L'id del modello effettivamente caricato adesso, o `null` se non c'è
   * nessun runtime pronto.
   *
   * ⛔ 02/9 — serve a `inspectModel()` per NON attribuire l'`n_ctx` osservato
   * a un modello diverso da quello che lo ha prodotto. Si legge dal
   * supervisore (codice nostro, lo stesso valore che finisce in `--alias`) e
   * non da un campo indovinato dentro `/props`: llama.cpp ne espone di
   * simili, ma un nome di campo dedotto invece che verificato è già costato
   * tre difetti su questo stesso sottosistema il 02/9.
   */
  function loadedModelId() {
    try {
      const stato = supervisor.status();
      return stato?.state === 'ready' && typeof stato.modelId === 'string' && stato.modelId !== ''
        ? stato.modelId
        : null;
    } catch { return null; }
  }

  async function listModels() {
    const body = await jsonRequest('/v1/models');
    if (!Array.isArray(body?.data)) throw new LlamaServerRuntimeError('runtime model list is invalid', 'RUNTIME_RESPONSE_INVALID');
    return body.data;
  }

  /** ⛔ `options` viaggia intero, `contextLength` compreso: era qui che si perdeva. */
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
      combinedSignal.throwIfAborted();
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
      const pendingTools = new Set();
      const toolsByIndex = new Map();
      const toolsById = new Map();
      // A valid JSON prefix is not a completed call (e.g. "1" then "2").
      // Join and validate once, at finish_reason or ordinary stream EOF.
      // Aborted/failed readers never reach the final flush.
      const flushNativeTools = function* () {
        for (const tool of pendingTools) {
          combinedSignal.throwIfAborted();
          let event;
          try {
            event = envelope({ runId, turnId, seq, type: 'tool_call', id: tool.id,
              name: tool.names.join(''), arguments: tool.arguments.join('') }, now);
          } catch (error) {
            if (error?.code !== 'LOCAL_RUNTIME_INVALID') throw error;
            event = envelope({ runId, turnId, seq, type: 'error', code: 'TOOL_CALL_MALFORMED',
              message: `malformed tool call ${tool.id}`, retryable: false }, now);
          }
          seq++;
          yield event;
        }
        pendingTools.clear();
        toolsByIndex.clear();
        toolsById.clear();
      };
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
        combinedSignal.throwIfAborted();
        if (chunk.__invalid) {
          yield envelope({ runId, turnId, seq: seq++, type: 'error', code: 'RUNTIME_SSE_INVALID', message: 'runtime emitted malformed SSE JSON', retryable: false }, now);
          continue;
        }
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (!delta) {
          if (choice?.finish_reason != null) yield* flushNativeTools();
          continue;
        }
        const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
        if (typeof reasoningDelta === 'string' && reasoningDelta !== '') yield envelope({ runId, turnId, seq: seq++, type: 'reasoning', value: reasoningDelta }, now);
        if (typeof delta.content === 'string' && delta.content !== '') {
          taggedContent.push(delta.content);
          yield* flushTaggedEvents();
        }
        for (const call of delta.tool_calls ?? []) {
          // OpenAI-style deltas normally supply id/name only in the first
          // fragment; index remains stable. Keep id-only legacy streams too.
          const index = Number.isInteger(call.index) && call.index >= 0 ? call.index : null;
          const hasId = call.id !== undefined && call.id !== null;
          const tool = (index !== null ? toolsByIndex.get(index) : undefined)
            ?? (hasId ? toolsById.get(call.id) : undefined)
            ?? { id: call.id ?? String(index ?? pendingTools.size), names: [], arguments: [] };
          pendingTools.add(tool);
          if (index !== null) toolsByIndex.set(index, tool);
          if (hasId) { tool.id = call.id; toolsById.set(call.id, tool); }
          if (call.function?.name != null) tool.names.push(call.function.name);
          if (call.function?.arguments != null) tool.arguments.push(call.function.arguments);
        }
        if (choice.finish_reason != null) yield* flushNativeTools();
      }
      combinedSignal.throwIfAborted();
      taggedContent.finish();
      yield* flushTaggedEvents();
      yield* flushNativeTools();
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

  return Object.freeze({ probe, loadedModelId, listModels, load, unload, generateStream, cancel, health, metrics });
}
