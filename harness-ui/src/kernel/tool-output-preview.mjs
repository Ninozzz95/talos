/** Bounded, ephemeral projection of decoded process output; this is not an archive. */
export function createToolOutputPreview({onOutput, limit = 40_000, batchSize = 2_048, intervalMs = 120, now = Date.now} = {}) {
  if (typeof onOutput !== 'function' || typeof now !== 'function'
    || !Number.isSafeInteger(limit) || limit < 0
    || !Number.isSafeInteger(batchSize) || batchSize < 1
    || !Number.isSafeInteger(intervalMs) || intervalMs < 0) {
    throw new TypeError('Invalid tool output preview configuration');
  }
  let pending = '', emitted = 0, received = 0, lastEmission = 0;
  let exhausted = limit === 0;

  function flush() {
    if (!pending) return;
    const delta = pending;
    pending = '';
    emitted += delta.length;
    onOutput(delta);
  }

  function append(text) {
    if (typeof text !== 'string') throw new TypeError('Tool output preview requires decoded text');
    received += text.length;
    if (!text || exhausted) return;
    const available = limit - emitted - pending.length;
    let end = Math.min(available, text.length);
    // String indices are UTF-16 units. Keep a prefix without splitting a valid surrogate pair.
    if (end > 0 && end < text.length
      && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff
      && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end--;
    exhausted = end < text.length || end === available;
    // Copy only the admitted prefix: a small slice must not retain a huge source string.
    if (end) pending += Buffer.from(text.slice(0, end), 'utf16le').toString('utf16le');
    if (!pending) return;
    const instant = now();
    if (pending.length >= batchSize || instant - lastEmission >= intervalMs) {
      lastEmission = instant;
      flush();
    }
  }

  function snapshot() {
    const omitted = received - emitted - pending.length;
    return {receivedCodeUnits: received, emittedCodeUnits: emitted, bufferedCodeUnits: pending.length, omittedCodeUnits: omitted, truncated: omitted > 0};
  }

  return Object.freeze({append, flush, snapshot});
}
