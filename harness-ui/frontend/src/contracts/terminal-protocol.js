const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const DATA_FRAME = 0;
export const CONTROL_FRAME = 1;

export function encodeTerminalFrame(type, payload) {
  if (type !== DATA_FRAME && type !== CONTROL_FRAME) throw new TypeError('Tipo frame terminale non valido');
  const bytes = encoder.encode(String(payload));
  const frame = new Uint8Array(bytes.length + 1);
  frame[0] = type;
  frame.set(bytes, 1);
  return frame.buffer;
}

export function decodeTerminalFrame(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length === 0 || (bytes[0] !== DATA_FRAME && bytes[0] !== CONTROL_FRAME)) return null;
  return { type: bytes[0], payload: decoder.decode(bytes.subarray(1)) };
}
