/**
 * Native llama-server -> shared kernel boundary.
 * Text/reasoning remain streaming. Tool deltas are withheld until BOTH the
 * provider finish_reason and [DONE] have been validated. This is deliberate:
 * the shared kernel can stop reading early on a repeated-tool sequence.
 * Never let that compatibility behaviour execute an uncommitted local call.
 */
import { createParser } from 'eventsource-parser';

export class LocalKernelError extends Error {
  constructor(message, code = 'LOCAL_KERNEL_PROTOCOL_INVALID') {
    super(message);
    this.name = 'LocalKernelError';
    this.code = code;
  }
}

const MAX_EVENT_CHARS = 1024 * 1024;
const MAX_TOOL_CHARS = 4 * 1024 * 1024;
const MAX_CALLS = 128;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => new LocalKernelError(message);
const nonempty = value => typeof value === 'string' && value.trim() !== '';

function toolCollector() {
  const calls = new Map();
  const ids = new Map();
  let size = 0;
  return {
    push(fragments) {
      if (!Array.isArray(fragments)) throw invalid('Frammenti tool locali non validi.');
      for (const fragment of fragments) {
        if (!object(fragment) || !Number.isSafeInteger(fragment.index) || fragment.index < 0
            || (fragment.type !== undefined && fragment.type !== 'function')) throw invalid('Indice o tipo della chiamata locale non valido.');
        let call = calls.get(fragment.index);
        if (!call) {
          if (calls.size >= MAX_CALLS) throw invalid('Troppe chiamate nello stesso completamento locale.');
          call = { id: '', name: [], args: [] };
          calls.set(fragment.index, call);
        }
        if (fragment.id !== undefined) {
          if (!nonempty(fragment.id) || fragment.id.length > 256 || (call.id && call.id !== fragment.id)
              || (ids.has(fragment.id) && ids.get(fragment.id) !== fragment.index)) throw invalid('Identità tool locale ambigua.');
          call.id = fragment.id;
          ids.set(fragment.id, fragment.index);
        }
        if (fragment.function !== undefined && !object(fragment.function)) throw invalid('Funzione tool locale non valida.');
        for (const [field, target] of [['name', call.name], ['arguments', call.args]]) {
          const part = fragment.function?.[field];
          if (part === undefined) continue;
          if (typeof part !== 'string') throw invalid('Frammento tool locale non testuale.');
          size += part.length;
          if (size > MAX_TOOL_CHARS) throw invalid('Argomenti tool locali oltre il limite del trasporto.');
          if (part !== '') target.push(part);
        }
      }
    },
    finish(reason) {
      if (calls.size && reason !== 'tool_calls') throw invalid('Chiamata tool locale senza completamento tool_calls.');
      if (!calls.size && reason === 'tool_calls') throw invalid('Completamento tool_calls senza chiamate.');
      return [...calls.values()].map((call, index) => {
        const name = call.name.join('');
        const args = call.args.join('');
        if (!call.id || !nonempty(name) || name.length > 256) throw invalid('Chiamata tool locale incompleta.');
        let parsed;
        try { parsed = JSON.parse(args); } catch { throw invalid('Argomenti tool locali non JSON.'); }
        if (!object(parsed)) throw invalid('Gli argomenti tool locali devono essere un oggetto JSON.');
        return { index, id: call.id, type: 'function', function: { name, arguments: args } };
      });
    },
  };
}

/** Validate a non-streaming completion without executing or rewriting its tools. */
export function validateLocalCompletion(body) {
  if (!object(body) || body.error || !Array.isArray(body.choices) || body.choices.length !== 1) throw invalid('Risposta locale non valida.');
  const choice = body.choices[0];
  if (!object(choice?.message) || !['stop', 'length', 'tool_calls'].includes(choice.finish_reason)) throw invalid('Risposta locale senza conclusione valida.');
  if (choice.index !== undefined && choice.index !== 0) throw invalid('Indice della risposta locale non valido.');
  if (choice.message.role !== undefined && choice.message.role !== 'assistant') throw invalid('Ruolo della risposta locale non valido.');
  for (const field of ['content', 'reasoning', 'reasoning_content']) {
    if (choice.message[field] != null && typeof choice.message[field] !== 'string') throw invalid('Contenuto locale non testuale.');
  }
  if (choice.message.function_call || choice.message.talos_provider_state) throw invalid('Messaggio locale non supportato.');
  const collector = toolCollector();
  const tools = choice.message.tool_calls;
  if (tools !== undefined) {
    if (!Array.isArray(tools)) throw invalid('Chiamate tool locali non valide.');
    collector.push(tools.map((call, index) => ({ ...call, index })));
  }
  collector.finish(choice.finish_reason);
  return body;
}

/** Bound body reads are also used for /props and non-streaming completions. */
export async function readLocalJson(response, { signal, maxBytes = 8 * 1024 * 1024 } = {}) {
  if (!response.body) throw invalid('Corpo della risposta locale assente.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    for (;;) {
      const item = await reader.read();
      signal?.throwIfAborted();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > maxBytes) throw invalid('Risposta locale oltre il limite del trasporto.');
      chunks.push(item.value);
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw invalid('Risposta locale non JSON.'); }
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * Pull-driven, bounded SSE canonicalization. No speculative tool execution,
 * no EOF-as-success, no guessed native IDs. Limits are transport protection,
 * not output token limits. Unusual nonstandard streams fail explicitly.
 */
export function localKernelStream(response, { signal } = {}) {
  if (!response.body) throw invalid('Stream locale assente.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  const collector = toolCollector();
  let finishReason = null;
  let completed = false;
  let sawDelta = false;
  let closed = false;
  let pending = [];
  let remaining = '';
  let streamController;
  const encode = packet => encoder.encode(`data: ${typeof packet === 'string' ? packet : JSON.stringify(packet)}\n\n`);
  const abort = () => {
    if (closed) return;
    closed = true;
    pending = []; remaining = '';
    streamController?.error(signal.reason);
    void cleanup(signal.reason).catch(() => {});
  };
  const cleanup = async (reason) => {
    closed = true;
    pending = []; remaining = '';
    signal?.removeEventListener('abort', abort);
    await reader.cancel(reason).catch(() => {});
    reader.releaseLock();
  };
  const parser = createParser({
    maxBufferSize: MAX_EVENT_CHARS,
    onError(error) { throw invalid(`SSE locale non valido: ${error.type}.`); },
    onEvent({ data }) {
      if (completed) return; // [DONE] is the logical transport boundary.
      if (data === '[DONE]') {
        if (!finishReason) throw invalid('Stream locale senza finish_reason.');
        const calls = collector.finish(finishReason);
        // Release native calls only after all arguments and the terminal marker
        // are valid. The kernel retains its own schema/permission validation.
        if (calls.length) pending.push(encode({ choices: [{ index: 0, delta: { tool_calls: calls }, finish_reason: null }] }));
        pending.push(encode({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }] }), encode('[DONE]'));
        completed = true;
        return;
      }
      let packet;
      try { packet = JSON.parse(data); } catch { throw invalid('SSE locale contiene JSON malformato.'); }
      if (!object(packet) || packet.error || !Array.isArray(packet.choices) || packet.choices.length > 1) throw invalid('Evento locale non valido.');
      if (packet.choices.length === 0) {
        if (packet.usage) pending.push(encode(packet));
        return;
      }
      const choice = packet.choices[0];
      if (!object(choice) || (choice.index !== undefined && choice.index !== 0)) throw invalid('Scelta streaming locale non supportata.');
      if (choice.message) {
        if (sawDelta || finishReason) throw invalid('Risposta locale mista fra messaggio completo e delta.');
        validateLocalCompletion(packet);
        const { tool_calls, ...visible } = choice.message;
        if (tool_calls) collector.push(tool_calls.map((call, index) => ({ ...call, index })));
        finishReason = choice.finish_reason;
        pending.push(encode({ ...packet, choices: [{ index: 0, delta: visible, finish_reason: null }] }));
        return;
      }
      sawDelta = true;
      const delta = choice.delta ?? {};
      if (!object(delta) || finishReason) throw invalid('Delta locale fuori dal completamento.');
      for (const key of ['content', 'reasoning', 'reasoning_content']) {
        if (delta[key] != null && typeof delta[key] !== 'string') throw invalid('Contenuto locale non testuale.');
      }
      if ((delta.role !== undefined && delta.role !== 'assistant') || delta.function_call || delta.talos_provider_state) {
        throw invalid('Delta locale non supportato dal contratto nativo.');
      }
      if (delta.tool_calls !== undefined) collector.push(delta.tool_calls);
      if (choice.finish_reason != null) {
        if (!['stop', 'length', 'tool_calls'].includes(choice.finish_reason)) throw invalid('Conclusione locale non supportata.');
        finishReason = choice.finish_reason;
      }
      // A canonical single-line JSON event also handles upstream multiline data
      // and CRLF without changing the shared kernel parser.
      const { tool_calls, ...visible } = delta;
      if (Object.keys(visible).length || packet.usage) pending.push(encode({ ...packet, choices: [{ ...choice, delta: visible, finish_reason: null }] }));
    },
  });
  const body = new ReadableStream({
    start(controller) {
      streamController = controller;
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    },
    async pull(controller) {
      if (closed) return;
      try {
        while (!pending.length && !completed) {
          signal?.throwIfAborted();
          if (remaining) {
            const part = remaining.slice(0, 16384);
            remaining = remaining.slice(16384);
            parser.feed(part);
          } else {
            const item = await reader.read();
            signal?.throwIfAborted();
            if (item.done) {
              try { decoder.decode(); } catch { throw invalid('UTF-8 locale incompleto.'); }
              throw invalid('Stream locale troncato prima di [DONE].');
            }
            try { remaining = decoder.decode(item.value, { stream: true }); } catch { throw invalid('UTF-8 locale non valido.'); }
          }
        }
        if (closed) return;
        if (pending.length) controller.enqueue(pending.shift());
        if (completed && !pending.length) {
          controller.close();
          await cleanup();
        }
      } catch (error) {
        if (!closed) controller.error(error);
        await cleanup(error);
      }
    },
    cancel: cleanup,
  }, { highWaterMark: 0 });
  return new Response(body, { status: response.status, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}

/** A server can return a complete JSON body even when stream was requested. */
export function localCompletionStream(body) {
  const choice = validateLocalCompletion(body).choices[0];
  const { tool_calls, ...visible } = choice.message;
  const delta = { ...visible, ...(tool_calls ? { tool_calls: tool_calls.map((call, index) => ({ ...call, index })) } : {}) };
  const packets = [{ choices: [{ index: 0, delta, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason }], ...(body.usage ? { usage: body.usage } : {}) }];
  return new Response(packets.map(packet => `data: ${JSON.stringify(packet)}\n\n`).join('') + 'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}
