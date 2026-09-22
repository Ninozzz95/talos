/**
 * Partitions provider text streams before they reach the UI. Provider
 * delimiters are transport syntax, never user-visible assistant text.
 */

const OPEN_TAGS = Object.freeze([
  { tag: '<think>', mode: 'reasoning' },
  { tag: '<thinking>', mode: 'reasoning' },
  { tag: '<tool_call>', mode: 'tool' },
  { tag: '<tool_call_start>', mode: 'tool' },
]);
const CLOSE_TAGS = Object.freeze([
  '</think>',
  '</thinking>',
  '</tool_call>',
  '<tool_call_end>',
]);
const MAX_TAG_LENGTH = Math.max(...OPEN_TAGS.map(({ tag }) => tag.length), ...CLOSE_TAGS.map((tag) => tag.length));

function partialTagLength(value, tags) {
  const limit = Math.min(value.length, MAX_TAG_LENGTH - 1);
  for (let length = limit; length > 0; length -= 1) {
    const suffix = value.slice(-length);
    if (tags.some((tag) => tag.startsWith(suffix))) return length;
  }
  return 0;
}

function emitText(callback, value) {
  if (typeof value === 'string' && value !== '') callback(value);
}

function parseToolPayload(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { name: 'provider_tool', arguments: '{}' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim()
        : typeof parsed.tool === 'string' && parsed.tool.trim() ? parsed.tool.trim() : 'provider_tool';
      const argumentsValue = Object.hasOwn(parsed, 'arguments') ? parsed.arguments
        : Object.hasOwn(parsed, 'args') ? parsed.args : parsed;
      return { ...(typeof parsed.id === 'string' && parsed.id ? { id: parsed.id } : {}), name, arguments: typeof argumentsValue === 'string' ? argumentsValue : JSON.stringify(argumentsValue ?? {}) };
    }
  } catch { /* alcuni provider usano una sintassi chiamata non-JSON: la conserviamo come argomento */ }
  const call = /^\[?\s*([A-Za-z][\w.-]*)\s*\((.*)\)\s*\]?$/us.exec(raw);
  if (call) return { name: call[1], arguments: call[2].trim() || '{}' };
  return { name: 'provider_tool', arguments: raw };
}

export function createStreamPartitioner({ onText = () => {}, onReasoning = () => {}, onToolCall = () => {} } = {}) {
  let buffer = '';
  let mode = 'text';
  let toolBuffer = '';
  let finished = false;

  const emitMode = (value) => {
    if (mode === 'text') emitText(onText, value);
    else if (mode === 'reasoning') emitText(onReasoning, value);
    else if (mode === 'tool') toolBuffer += value;
  };

  const drain = (final = false) => {
    while (buffer) {
      if (mode === 'text') {
        let found = null;
        for (const candidate of OPEN_TAGS) {
          const index = buffer.indexOf(candidate.tag);
          if (index >= 0 && (!found || index < found.index)) found = { ...candidate, index };
        }
        if (!found) {
          const keep = final ? 0 : partialTagLength(buffer, OPEN_TAGS.map(({ tag }) => tag));
          const emitLength = Math.max(0, buffer.length - keep);
          emitMode(buffer.slice(0, emitLength));
          buffer = buffer.slice(emitLength);
          if (!final && buffer.length) return;
          continue;
        }
        emitMode(buffer.slice(0, found.index));
        buffer = buffer.slice(found.index + found.tag.length);
        mode = found.mode;
        toolBuffer = '';
        continue;
      }

      let close = null;
      for (const tag of CLOSE_TAGS) {
        const index = buffer.indexOf(tag);
        if (index >= 0 && (!close || index < close.index)) close = { tag, index };
      }
      if (!close) {
        const keep = final ? 0 : partialTagLength(buffer, CLOSE_TAGS);
        const emitLength = Math.max(0, buffer.length - keep);
        emitMode(buffer.slice(0, emitLength));
        buffer = buffer.slice(emitLength);
        if (!final && buffer.length) return;
        continue;
      }
      emitMode(buffer.slice(0, close.index));
      buffer = buffer.slice(close.index + close.tag.length);
      if (mode === 'tool') onToolCall(parseToolPayload(toolBuffer));
      mode = 'text';
      toolBuffer = '';
    }
  };

  const push = (chunk) => {
    if (finished || chunk === null || chunk === undefined) return;
    buffer += String(chunk);
    drain(false);
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    drain(true);
    if (mode === 'tool' && toolBuffer) onToolCall(parseToolPayload(toolBuffer));
    toolBuffer = '';
    mode = 'text';
  };
  return Object.freeze({ push, finish });
}

export { parseToolPayload };
