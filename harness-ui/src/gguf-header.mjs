import { open } from 'node:fs/promises';

/*
 * Fase 5, punto 4 del piano — parser minimo del formato binario GGUF.
 * Spec ufficiale letta fresca prima di scrivere (regola vincolante del
 * progetto), verificata byte per byte contro un file REALE già presente
 * in `.local-models/` (Qwen3-0.6B.Q2_K.gguf — magic/version/tensor_count/
 * metadata_kv_count/prima chiave "general.architecture" tutti confermati
 * a mano con un hex dump prima di scrivere una riga di codice):
 * https://github.com/ggml-org/ggml/blob/master/docs/gguf.md
 *
 * Layout: uint32 magic ("GGUF") · uint32 version · uint64 tensor_count ·
 * uint64 metadata_kv_count · metadata_kv_count coppie (chiave stringa
 * length-prefixed, uint32 tipo, valore tipato). Tutto little-endian (il
 * caso reale osservato — la spec permette anche big-endian dalla v3 in
 * poi, non supportato qui: un parser "minimo" dichiarato tale, non un
 * mockup che finge di coprire tutto).
 */

export class GgufHeaderError extends Error {
  constructor(message, code = 'GGUF_HEADER_INVALID') { super(message); this.name = 'GgufHeaderError'; this.code = code; }
}
function fail(message, code = 'GGUF_HEADER_INVALID') { throw new GgufHeaderError(message, code); }

// La metadata reale osservata (inclusi vocabolari tokenizer di centinaia di
// migliaia di voci) sta ben sotto questa soglia — i TENSORI, che seguono la
// metadata e pesano i GB veri del file, restano fuori: non li leggiamo mai.
const MAX_PREFIX_BYTES = 32 * 1024 * 1024;

const VALUE_TYPE = Object.freeze({
  UINT8: 0, INT8: 1, UINT16: 2, INT16: 3, UINT32: 4, INT32: 5, FLOAT32: 6,
  BOOL: 7, STRING: 8, ARRAY: 9, UINT64: 10, INT64: 11, FLOAT64: 12,
});

class Cursor {
  constructor(buffer) { this.buffer = buffer; this.offset = 0; }
  need(bytes) { if (this.offset + bytes > this.buffer.length) fail('metadata truncated, or exceeds the read prefix', 'GGUF_HEADER_TRUNCATED'); }
  bytes(count) { this.need(count); const v = this.buffer.subarray(this.offset, this.offset + count); this.offset += count; return v; }
  u8() { this.need(1); const v = this.buffer.readUInt8(this.offset); this.offset += 1; return v; }
  i8() { this.need(1); const v = this.buffer.readInt8(this.offset); this.offset += 1; return v; }
  u16() { this.need(2); const v = this.buffer.readUInt16LE(this.offset); this.offset += 2; return v; }
  i16() { this.need(2); const v = this.buffer.readInt16LE(this.offset); this.offset += 2; return v; }
  u32() { this.need(4); const v = this.buffer.readUInt32LE(this.offset); this.offset += 4; return v; }
  i32() { this.need(4); const v = this.buffer.readInt32LE(this.offset); this.offset += 4; return v; }
  f32() { this.need(4); const v = this.buffer.readFloatLE(this.offset); this.offset += 4; return v; }
  f64() { this.need(8); const v = this.buffer.readDoubleLE(this.offset); this.offset += 8; return v; }
  u64() { this.need(8); const v = this.buffer.readBigUInt64LE(this.offset); this.offset += 8; return v; }
  i64() { this.need(8); const v = this.buffer.readBigInt64LE(this.offset); this.offset += 8; return v; }
  string() {
    const len = this.u64();
    if (len > BigInt(this.buffer.length)) fail('metadata string length exceeds the read prefix', 'GGUF_HEADER_TRUNCATED');
    return this.bytes(Number(len)).toString('utf8');
  }
}

function readTypedValue(cursor, type) {
  switch (type) {
    case VALUE_TYPE.UINT8: return cursor.u8();
    case VALUE_TYPE.INT8: return cursor.i8();
    case VALUE_TYPE.UINT16: return cursor.u16();
    case VALUE_TYPE.INT16: return cursor.i16();
    case VALUE_TYPE.UINT32: return cursor.u32();
    case VALUE_TYPE.INT32: return cursor.i32();
    case VALUE_TYPE.FLOAT32: return cursor.f32();
    case VALUE_TYPE.BOOL: return cursor.u8() !== 0;
    case VALUE_TYPE.STRING: return cursor.string();
    case VALUE_TYPE.UINT64: return cursor.u64();
    case VALUE_TYPE.INT64: return cursor.i64();
    case VALUE_TYPE.FLOAT64: return cursor.f64();
    case VALUE_TYPE.ARRAY: {
      const elementType = cursor.u32();
      const count = cursor.u64();
      if (count > BigInt(cursor.buffer.length)) fail('metadata array length exceeds the read prefix', 'GGUF_HEADER_TRUNCATED');
      const values = new Array(Number(count));
      for (let i = 0; i < values.length; i += 1) values[i] = readTypedValue(cursor, elementType);
      return values;
    }
    default: fail(`unknown GGUF metadata value type ${type}`, 'GGUF_HEADER_UNKNOWN_TYPE');
  }
  return undefined; // istruzione morta, solo per lint: fail() lancia sempre
}

function positiveSafeInteger(value, label) {
  const n = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(n) || n <= 0) fail(`${label} is missing or not a positive integer`, 'GGUF_HEADER_METADATA_MISSING');
  return n;
}

/*
 * Stima dichiarata, non misurata (coerente con lo stato 'declared' che
 * local-runtime-probe.mjs assegna a estimatedWorkingBytes): pesi caricati
 * (≈ dimensione del file) + KV-cache stimata con la formula standard
 * (2 per K+V · strati · contesto · embedding · 2 byte per valore fp16).
 * ⛔ Semplificazione dichiarata: usa embedding_length INTERO anche per
 * architetture con grouped-query attention (meno teste KV della
 * dimensione piena) — sovrastima invece di sottostimare, appropriato per
 * un controllo "ci sta?" prima di caricare: meglio dire "forse non ci
 * sta" che far girare un modello che poi va in OOM davvero.
 */
function estimateWorkingBytes({ fileBytes, blockCount, contextLength, embeddingLength }) {
  const kvCacheBytes = 2 * blockCount * contextLength * embeddingLength * 2;
  return fileBytes + kvCacheBytes;
}

export async function readGgufHeader(path) {
  if (typeof path !== 'string' || !path) fail('path is required', 'GGUF_HEADER_MISCONFIGURED');
  const handle = await open(path, 'r');
  try {
    const { size: fileBytes } = await handle.stat();
    const prefixSize = Math.min(fileBytes, MAX_PREFIX_BYTES);
    const buffer = Buffer.alloc(prefixSize);
    const { bytesRead } = await handle.read(buffer, 0, prefixSize, 0);
    const cursor = new Cursor(buffer.subarray(0, bytesRead));

    const magic = cursor.bytes(4).toString('ascii');
    const version = cursor.u32();
    if (magic !== 'GGUF') fail('not a GGUF file (magic mismatch)', 'GGUF_HEADER_MAGIC_MISMATCH');
    if (version !== 3) fail(`unsupported GGUF version ${version} (only 3 is supported)`, 'GGUF_HEADER_VERSION_UNSUPPORTED');
    cursor.u64(); // tensor_count — non serve per questa stima, letto solo per avanzare correttamente
    const metadataCount = cursor.u64();
    if (metadataCount > 1_000_000n) fail('metadata_kv_count is implausibly large', 'GGUF_HEADER_INVALID');

    const metadata = new Map();
    for (let i = 0n; i < metadataCount; i += 1n) {
      const key = cursor.string();
      const type = cursor.u32();
      metadata.set(key, readTypedValue(cursor, type));
    }

    const architecture = metadata.get('general.architecture');
    if (typeof architecture !== 'string' || !architecture) fail('general.architecture metadata key is missing', 'GGUF_HEADER_ARCHITECTURE_MISSING');
    const contextLength = positiveSafeInteger(metadata.get(`${architecture}.context_length`), `${architecture}.context_length`);
    const embeddingLength = positiveSafeInteger(metadata.get(`${architecture}.embedding_length`), `${architecture}.embedding_length`);
    const blockCount = positiveSafeInteger(metadata.get(`${architecture}.block_count`), `${architecture}.block_count`);

    return {
      magic,
      version,
      trainedContext: contextLength,
      estimatedWorkingBytes: estimateWorkingBytes({ fileBytes, blockCount, contextLength, embeddingLength }),
    };
  } finally {
    await handle.close();
  }
}
