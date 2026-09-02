import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GgufHeaderError, readGgufHeader } from '../src/gguf-header.mjs';

const VALUE_TYPE = { UINT8: 0, UINT32: 4, FLOAT32: 6, STRING: 8, ARRAY: 9, UINT64: 10 };

function u32le(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }
function u64le(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; }
function ggufString(s) { const body = Buffer.from(s, 'utf8'); return Buffer.concat([u64le(body.length), body]); }
function kvUint32(key, value) { return Buffer.concat([ggufString(key), u32le(VALUE_TYPE.UINT32), u32le(value)]); }
function kvString(key, value) { return Buffer.concat([ggufString(key), u32le(VALUE_TYPE.STRING), ggufString(value)]); }
function kvStringArray(key, values) {
  const elements = values.map((v) => ggufString(v));
  return Buffer.concat([ggufString(key), u32le(VALUE_TYPE.ARRAY), u32le(VALUE_TYPE.STRING), u64le(values.length), ...elements]);
}

function buildGguf({ version = 3, tensorCount = 0, entries = [] } = {}) {
  return Buffer.concat([
    Buffer.from('GGUF', 'ascii'),
    u32le(version),
    u64le(tensorCount),
    u64le(entries.length),
    ...entries,
  ]);
}

async function withFixture(buffer, run) {
  const dir = await mkdtemp(join(tmpdir(), 'gguf-header-test-'));
  const path = join(dir, 'model.gguf');
  await writeFile(path, buffer);
  try { return await run(path); } finally { await rm(dir, { recursive: true, force: true }); }
}

const VALID_ENTRIES = [
  kvString('general.architecture', 'testarch'),
  // Un array PRIMA delle chiavi che servono: prova che il cursore avanza
  // correttamente attraverso un valore composito, non solo attraverso scalari.
  kvStringArray('tokenizer.ggml.tokens', ['<pad>', '<eos>', 'ciao']),
  kvUint32('testarch.context_length', 4096),
  kvUint32('testarch.embedding_length', 64),
  kvUint32('testarch.block_count', 8),
];

test('legge un file GGUF minimo valido, costruito a mano byte per byte', async () => {
  const buffer = buildGguf({ entries: VALID_ENTRIES });
  await withFixture(buffer, async (path) => {
    const header = await readGgufHeader(path);
    assert.equal(header.magic, 'GGUF');
    assert.equal(header.version, 3);
    assert.equal(header.trainedContext, 4096);
    // pesi (dimensione file) + KV cache: 2 * blockCount(8) * ctx(4096) * embd(64) * 2 = 8_388_608
    assert.equal(header.estimatedWorkingBytes, buffer.length + 8_388_608);
  });
});

test('l\'ordine delle chiavi non conta — le stesse chiavi in un ordine diverso danno lo stesso risultato', async () => {
  const shuffled = [VALID_ENTRIES[2], VALID_ENTRIES[0], VALID_ENTRIES[3], VALID_ENTRIES[1], VALID_ENTRIES[4]];
  const buffer = buildGguf({ entries: shuffled });
  await withFixture(buffer, async (path) => {
    const header = await readGgufHeader(path);
    assert.equal(header.trainedContext, 4096);
  });
});

test('AL CONTRARIO — magic sbagliato viene rifiutato, mai interpretato come GGUF', async () => {
  const buffer = Buffer.concat([Buffer.from('FAKE', 'ascii'), u32le(3), u64le(0), u64le(0)]);
  await withFixture(buffer, async (path) => {
    await assert.rejects(() => readGgufHeader(path), (error) => {
      assert.ok(error instanceof GgufHeaderError);
      assert.equal(error.code, 'GGUF_HEADER_MAGIC_MISMATCH');
      return true;
    });
  });
});

test('AL CONTRARIO — una versione diversa da 3 viene rifiutata esplicitamente, non ignorata', async () => {
  const buffer = buildGguf({ version: 2, entries: VALID_ENTRIES });
  await withFixture(buffer, async (path) => {
    await assert.rejects(() => readGgufHeader(path), (error) => {
      assert.equal(error.code, 'GGUF_HEADER_VERSION_UNSUPPORTED');
      return true;
    });
  });
});

test('AL CONTRARIO — un file troncato a metà metadata fallisce onestamente, non legge byte a caso', async () => {
  const buffer = buildGguf({ entries: VALID_ENTRIES });
  const truncated = buffer.subarray(0, buffer.length - 5);
  await withFixture(truncated, async (path) => {
    await assert.rejects(() => readGgufHeader(path), (error) => {
      assert.equal(error.code, 'GGUF_HEADER_TRUNCATED');
      return true;
    });
  });
});

test('AL CONTRARIO — general.architecture mancante fallisce esplicitamente, mai un\'architettura inventata', async () => {
  const buffer = buildGguf({ entries: [kvUint32('qualcosa.altro', 1)] });
  await withFixture(buffer, async (path) => {
    await assert.rejects(() => readGgufHeader(path), (error) => {
      assert.equal(error.code, 'GGUF_HEADER_ARCHITECTURE_MISSING');
      return true;
    });
  });
});

test('AL CONTRARIO — context_length mancante per l\'architettura dichiarata fallisce, mai un numero a caso', async () => {
  const buffer = buildGguf({ entries: [kvString('general.architecture', 'testarch')] });
  await withFixture(buffer, async (path) => {
    await assert.rejects(() => readGgufHeader(path), (error) => {
      assert.equal(error.code, 'GGUF_HEADER_METADATA_MISSING');
      return true;
    });
  });
});

test('AL CONTRARIO — un tipo di valore metadata sconosciuto fallisce invece di corrompere la lettura successiva', async () => {
  const bogus = Buffer.concat([ggufString('chiave.strana'), u32le(99), u32le(0)]);
  const buffer = buildGguf({ entries: [bogus] });
  await withFixture(buffer, async (path) => {
    await assert.rejects(() => readGgufHeader(path), (error) => {
      assert.equal(error.code, 'GGUF_HEADER_UNKNOWN_TYPE');
      return true;
    });
  });
});

test('AL CONTRARIO — path non stringa o vuoto viene rifiutato prima di toccare il filesystem', async () => {
  await assert.rejects(() => readGgufHeader(''), (error) => { assert.equal(error.code, 'GGUF_HEADER_MISCONFIGURED'); return true; });
  await assert.rejects(() => readGgufHeader(null), (error) => { assert.equal(error.code, 'GGUF_HEADER_MISCONFIGURED'); return true; });
});

test('un file inesistente fallisce con l\'errore reale del filesystem, non un errore GGUF fuorviante', async () => {
  await assert.rejects(() => readGgufHeader(join(tmpdir(), 'questo-file-non-esiste-mai-1234567.gguf')), (error) => {
    assert.equal(error.code, 'ENOENT');
    return true;
  });
});

test('file GGUF reali del sottomodulo llama.cpp — non un mock, il formato vero, riproducibile ovunque il sottomodulo sia inizializzato', async (t) => {
  // ⛔ Solo il sottomodulo `mobile/third_party/llama.cpp` (tracciato, pin
  // riproducibile): mai un file sotto `.local-models/` (gitignored, un
  // modello scaricato a mano su QUESTA macchina — verificato: `git
  // check-ignore` lo conferma) — un test che dipende da un file assente
  // altrove fallirebbe ovunque tranne qui, il contrario di un test.
  const reali = [
    '../mobile/third_party/llama.cpp/models/ggml-vocab-llama-bpe.gguf',
    '../mobile/third_party/llama.cpp/models/ggml-vocab-falcon.gguf',
  ];
  for (const relativo of reali) {
    const path = join(import.meta.dirname, '..', relativo);
    if (!existsSync(path)) { t.skip(`sottomodulo llama.cpp non inizializzato qui: ${relativo}`); continue; }
    const header = await readGgufHeader(path);
    assert.equal(header.magic, 'GGUF');
    assert.equal(header.version, 3);
    assert.ok(Number.isSafeInteger(header.trainedContext) && header.trainedContext > 0, `trainedContext non valido per ${relativo}`);
    assert.ok(Number.isSafeInteger(header.estimatedWorkingBytes) && header.estimatedWorkingBytes > 0, `estimatedWorkingBytes non valido per ${relativo}`);
  }
});

test('file GGUF reale, scaricato per davvero da Hugging Face (locale, gitignored — salta se assente altrove)', async (t) => {
  const path = join(import.meta.dirname, '..', '.local-models/qwen3-0.6b-q2-k-16d75108d73a/Qwen3-0.6B.Q2_K.gguf');
  if (!existsSync(path)) { t.skip('modello locale non presente su questa macchina (.local-models/ è gitignored)'); return; }
  const header = await readGgufHeader(path);
  assert.equal(header.magic, 'GGUF');
  assert.equal(header.version, 3);
  assert.ok(Number.isSafeInteger(header.trainedContext) && header.trainedContext > 0);
  assert.ok(Number.isSafeInteger(header.estimatedWorkingBytes) && header.estimatedWorkingBytes > 0);
});
