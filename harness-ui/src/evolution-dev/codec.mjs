// Closed development subset of contracts/dev_bridge.proto, not the guest ABI.
// Generated Rust/Prost and this bounded JS codec share byte-level vectors in CI.
export const Kind = Object.freeze({ RUN: 1, CONTINUE: 2, CANCEL: 3, READY: 4, FINISHED: 5 });
export const Status = Object.freeze({ NONE: 0, SUCCEEDED: 1, CANCELLED: 2, FAILED: 3 });
export const MAX_FRAME = 256;
const fields = ['version', 'invocationId', 'kind', 'status', 'value', 'bytesReleased',
  'workerTerminated', 'cleanupComplete', 'workerExitCode', 'workerDigest'];
const bytes = new Set([2, 10]);
const bools = new Set([7, 8]);
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function uint(value) {
  requireValue(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, 'uint32 required');
  const out = [];
  do { const digit = value % 128; value = Math.floor(value / 128); out.push(digit | (value ? 128 : 0)); } while (value);
  return Buffer.from(out);
}
function base(message) {
  requireValue(message.version === 1, 'development version');
  requireValue(Buffer.isBuffer(message.invocationId) && message.invocationId.length === 16
    && message.invocationId.some(v => v !== 0), 'development identity');
  requireValue(Number.isInteger(message.kind) && message.kind >= 1 && message.kind <= 5, 'development kind');
}
export function encodeDevPayload(message) {
  requireValue(message && typeof message === 'object', 'message required');
  requireValue(Object.keys(message).every(key => fields.includes(key)), 'unknown development field');
  base(message);
  const out = [];
  for (let index = 0; index < fields.length; index++) {
    const tag = index + 1, value = message[fields[index]];
    if (value === undefined) continue;
    if (bytes.has(tag)) {
      requireValue(Buffer.isBuffer(value), 'bytes required');
      requireValue(value.length <= MAX_FRAME, 'bytes bound');
      if (value.length) out.push(uint(tag * 8 + 2), uint(value.length), value);
    } else {
      if (bools.has(tag)) requireValue(typeof value === 'boolean', 'bool required');
      const number = bools.has(tag) ? Number(value) : value;
      const encoded = uint(number);
      if (number) out.push(uint(tag * 8), encoded);
    }
  }
  const result = Buffer.concat(out);
  requireValue(result.length > 0 && result.length <= MAX_FRAME, 'frame bound');
  return result;
}
export function encodeDevFrame(message) {
  const payload = encodeDevPayload(message), prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(payload.length); return Buffer.concat([prefix, payload]);
}
export function decodeDevPayload(payload) {
  requireValue(Buffer.isBuffer(payload) && payload.length > 0 && payload.length <= MAX_FRAME, 'frame bound');
  let at = 0;
  function readUint() {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      requireValue(at < payload.length, 'truncated varint');
      const byte = payload[at++];
      if (i === 4) requireValue(byte < 16, 'varint overflow');
      value += (byte & 127) * 2 ** (7 * i);
      if (!(byte & 128)) return value;
    }
    throw new Error('varint overflow');
  }
  const result = { version: 0, invocationId: Buffer.alloc(0), kind: 0, status: 0, value: 0,
    bytesReleased: 0, workerTerminated: false, cleanupComplete: false, workerExitCode: 0,
    workerDigest: Buffer.alloc(0) };
  const seen = new Set();
  while (at < payload.length) {
    const key = readUint(), tag = Math.floor(key / 8), type = key % 8;
    requireValue(tag >= 1 && tag <= fields.length && !seen.has(tag), 'unknown/duplicate field');
    seen.add(tag);
    requireValue(type === (bytes.has(tag) ? 2 : 0), 'wrong wire type');
    if (bytes.has(tag)) {
      const n = readUint(); requireValue(n <= payload.length - at, 'truncated bytes');
      result[fields[tag - 1]] = Buffer.from(payload.subarray(at, at + n)); at += n;
    } else {
      const value = readUint();
      if (bools.has(tag)) requireValue(value <= 1, 'invalid bool');
      result[fields[tag - 1]] = bools.has(tag) ? Boolean(value) : value;
    }
  }
  base(result);
  requireValue(encodeDevPayload(result).equals(payload), 'noncanonical development frame');
  return result;
}
export function createDevDecoder(onFrame) {
  let buffer = Buffer.alloc(0), total = 0;
  return Object.freeze({
    push(chunk) {
      requireValue(Buffer.isBuffer(chunk), 'binary stream required');
      total += chunk.length;
      requireValue(total <= 2 * (MAX_FRAME + 4), 'output budget');
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const n = buffer.readUInt32LE();
        requireValue(n > 0 && n <= MAX_FRAME, 'frame prefix bound');
        if (buffer.length < n + 4) break;
        const frame = decodeDevPayload(buffer.subarray(4, n + 4));
        buffer = buffer.subarray(n + 4); onFrame(frame);
      }
    },
    finish() { requireValue(buffer.length === 0, 'truncated development output'); },
  });
}
