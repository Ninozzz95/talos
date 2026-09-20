/** Read-only, bounded observations of bytes consumed by the real caller.
 * No clone/tee, background drain, re-encoding, or changes to request options.
 */
export const OBSERVER_LIMIT_BYTES = 256 * 1024;
const COUNTERS = [
  'timings.prompt_n', 'timings.prompt_ms', 'timings.prompt_per_second',
  'timings.cache_n', 'timings.predicted_n', 'timings.predicted_ms',
  'timings.predicted_per_second', 'timings.draft_n', 'timings.draft_n_accepted',
  'prompt_progress.total', 'prompt_progress.cache', 'prompt_progress.processed',
  'prompt_progress.time_ms', 'tokens_cached', 'tokens_evaluated', 'id_slot',
  'usage.prompt_tokens', 'usage.completion_tokens', 'usage.prompt_tokens_details.cached_tokens',
  'usage.completion_tokens_details.reasoning_tokens', 'default_generation_settings.n_ctx', 'total_slots',
];
const valueAt = (object, path) => path.split('.').reduce((o, k) => o?.[k], object);

export function createPacketObserver({ now = () => performance.now(), onMilestone = () => {} } = {}) {
  const observation = {
    firstChunkMs: null, firstModelDeltaMs: null, firstContentDeltaMs: null,
    firstReasoningDeltaMs: null, firstToolDeltaMs: null, lastModelDeltaMs: null,
    finishReason: null, doneMarker: false, nativeStop: null, serverError: false,
    server: Object.fromEntries(COUNTERS.map(k => [k, null])),
    malformedPackets: 0, oversizedFrames: 0, unterminatedFrame: false,
  };
  const notify = () => { try { onMilestone(structuredClone(observation)); } catch { /* telemetry is not transport */ } };
  const first = (key, timestamp) => {
    if (observation[key] !== null) return false;
    observation[key] = timestamp;
    return true;
  };
  function packet(data) {
    if (data === '[DONE]') { observation.doneMarker = true; return; }
    let p;
    try { p = JSON.parse(data); } catch { observation.malformedPackets++; return; }
    if (!p || typeof p !== 'object') { observation.malformedPackets++; return; }
    let changed = false;
    for (const key of COUNTERS) {
      const number = valueAt(p, key);
      if (typeof number === 'number' && Number.isFinite(number) && number >= 0) {
        if (observation.server[key] !== number) changed = true;
        observation.server[key] = number;
      }
    }
    if (p.error) observation.serverError = true;
    const choice = p.choices?.[0];
    const delta = choice?.delta ?? choice?.message;
    const timestamp = now();
    const content = delta?.content ?? p.content;
    const reasoning = delta?.reasoning_content ?? delta?.reasoning;
    const tools = Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0;
    const hasContent = typeof content === 'string' && content !== '';
    const hasReasoning = typeof reasoning === 'string' && reasoning !== '';
    if (hasContent || hasReasoning || tools) {
      changed = first('firstModelDeltaMs', timestamp) || changed;
      observation.lastModelDeltaMs = timestamp;
      if (hasContent) changed = first('firstContentDeltaMs', timestamp) || changed;
      if (hasReasoning) changed = first('firstReasoningDeltaMs', timestamp) || changed;
      if (tools) changed = first('firstToolDeltaMs', timestamp) || changed;
    }
    if (choice?.finish_reason != null) {
      observation.finishReason = ['stop', 'length', 'tool_calls', 'function_call', 'content_filter'].includes(choice.finish_reason)
        ? choice.finish_reason : 'other';
    }
    if (typeof p.stop === 'boolean') observation.nativeStop = p.stop;
    if (changed) notify();
  }
  return { observation, packet, firstChunk() { if (first('firstChunkMs', now())) notify(); } };
}

/** SSE framing only for observation. The production parser still receives original bytes. */
export function createSseObserver(onPacket, { maxBytes = OBSERVER_LIMIT_BYTES } = {}) {
  const decoder = new TextDecoder();
  let parts = [], lineLength = 0, data = [], frameBytes = 0, skip = false, afterCR = false;
  let oversized = 0;
  function lineEnd() {
    const line = parts.join(''); parts = []; lineLength = 0;
    if (line === '' && !skip) {
      if (data.length) onPacket(data.join('\n'));
      data = []; frameBytes = 0;
    } else if (line === '' && skip) {
      skip = false; frameBytes = 0; data = [];
    } else if (!skip && (line === 'data' || line.startsWith('data:'))) {
      let value = line === 'data' ? '' : line.slice(5);
      if (value.startsWith(' ')) value = value.slice(1);
      frameBytes += Buffer.byteLength(value) + 1;
      if (frameBytes > maxBytes) { skip = true; oversized++; data = []; }
      else data.push(value);
    }
  }
  function text(value) {
    let offset = 0;
    if (afterCR && value.startsWith('\n')) offset = 1;
    if (value.length) afterCR = false;
    while (offset < value.length) {
      const lf = value.indexOf('\n', offset), cr = value.indexOf('\r', offset);
      const end = lf < 0 ? cr : cr < 0 ? lf : Math.min(lf, cr);
      const piece = value.slice(offset, end < 0 ? value.length : end);
      // Count even discarded lines so an oversized line cannot look like a blank delimiter.
      lineLength += Buffer.byteLength(piece);
      if (!skip && frameBytes + lineLength > maxBytes) { skip = true; oversized++; parts = []; data = []; }
      if (!skip && parts.length >= 4096) { skip = true; oversized++; parts = []; data = []; }
      if (!skip) parts.push(piece);
      if (end < 0) break;
      const isBlank = lineLength === 0;
      if (skip) {
        if (isBlank) { skip = false; frameBytes = 0; data = []; }
        parts = []; lineLength = 0;
      } else lineEnd();
      afterCR = value[end] === '\r';
      offset = end + 1;
      if (afterCR && value[offset] === '\n') { offset++; afterCR = false; }
    }
  }
  return {
    push(bytes) {
      // Bound transient UTF-8 decoding too, even for unusually large upstream chunks.
      for (let offset = 0; offset < bytes.byteLength; offset += 64 * 1024) text(decoder.decode(bytes.subarray(offset, offset + 64 * 1024), { stream: true }));
    },
    finish() {
      text(decoder.decode());
      // No dispatch of an unframed tail. Mark it explicitly; never invent terminal success.
      return { oversizedFrames: oversized, unterminatedFrame: lineLength > 0 || data.length > 0 || skip };
    },
  };
}

export function observeResponse(response, { now = () => performance.now(), onMilestone, onEnd = () => {}, maxBytes = OBSERVER_LIMIT_BYTES } = {}) {
  if (!response?.body || typeof response.body.getReader !== 'function' || !response.headers?.get || response.status < 200 || response.status > 599 || [204, 205, 304].includes(response.status)) return response;
  const collector = createPacketObserver({ now, onMilestone });
  const sse = response.headers.get('content-type')?.includes('text/event-stream');
  const parser = sse ? createSseObserver(collector.packet, { maxBytes }) : null;
  const reader = response.body.getReader();
  let ended = false, totalBytes = 0, jsonBytes = 0, jsonBuffer = null, disabled = false;
  const end = (outcome) => {
    if (ended) return;
    ended = true;
    try {
      if (!disabled && parser) Object.assign(collector.observation, parser.finish());
      else if (!disabled && !sse && jsonBytes <= maxBytes && jsonBuffer) collector.packet(jsonBuffer.subarray(0, jsonBytes).toString('utf8'));
    } catch { disabled = true; }
    jsonBuffer = null;
    try { onEnd({ ...collector.observation, totalBytes, outcome, endMs: now(), observerFailed: disabled }); } catch { /* best effort */ }
    try { reader.releaseLock(); } catch { /* a cancel may still be pending */ }
  };
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) { end('eof'); controller.close(); return; }
        totalBytes += value.byteLength;
        if (!disabled) {
          try {
            collector.firstChunk();
            if (parser) parser.push(value);
            else {
              jsonBytes += value.byteLength;
              if (jsonBytes <= maxBytes) {
                jsonBuffer ??= Buffer.allocUnsafe(maxBytes);
                jsonBuffer.set(value, jsonBytes - value.byteLength);
              }
              else { jsonBuffer = null; collector.observation.oversizedFrames = 1; }
            }
          } catch { disabled = true; }
        }
        controller.enqueue(value);
      } catch (error) { end('transport-error'); controller.error(error); }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } finally { end('cancelled'); }
    },
  }, { highWaterMark: 0 });
  const observed = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  for (const key of ['url', 'redirected', 'type']) Object.defineProperty(observed, key, { value: response[key] });
  return observed;
}
