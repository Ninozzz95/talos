import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { createGeneratedImageStore, GeneratedImageStoreError } from '../src/generated-image-store.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('P0.4 image persistence writes bytes and a verifiable sidecar, then reopens after a fresh store instance', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'talos-generated-image-'));
  try {
    const bytes = Buffer.from([137, 80, 78, 71, 1, 2, 3]);
    const promptHash = createHash('sha256').update('draw a cat').digest('hex');
    const first = createGeneratedImageStore({ rootDir, now: () => new Date('2026-08-31T12:00:00.000Z') });
    const saved = await first.persistGeneratedImage({ bytes, mimeType: 'image/png', source: 'openrouter/bytedance-seed/seedream-4.5', promptHash });
    assert.equal(saved.bytes, bytes.byteLength);
    assert.equal(saved.sha256, createHash('sha256').update(bytes).digest('hex'));
    const second = createGeneratedImageStore({ rootDir });
    const reopened = await second.readGeneratedImage(saved.id);
    assert.deepEqual(reopened.bytes, bytes);
    assert.equal(reopened.mimeType, 'image/png');
    assert.equal(reopened.promptHash, promptHash);
  } finally {
    await rimuoviCartellaDiProvaAttesa(rootDir);
  }
});

test('P0.4 image persistence rejects unsupported or empty content before touching disk', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'talos-generated-image-'));
  try {
    const store = createGeneratedImageStore({ rootDir });
    await assert.rejects(() => store.persistGeneratedImage({ bytes: Buffer.alloc(0), mimeType: 'image/png', source: 'openrouter' }), (error) => error instanceof GeneratedImageStoreError && error.code === 'TALOS_IMAGE_PERSIST_INVALID');
    await assert.rejects(() => store.persistGeneratedImage({ bytes: Buffer.from([1]), mimeType: 'image/svg+xml', source: 'openrouter' }), (error) => error instanceof GeneratedImageStoreError && error.code === 'TALOS_IMAGE_PERSIST_INVALID');
    await assert.rejects(() => store.persistGeneratedImage({ bytes: Buffer.from([1]), mimeType: 'image/png', source: '' }), (error) => error instanceof GeneratedImageStoreError && error.code === 'TALOS_IMAGE_PERSIST_INVALID');
    await assert.rejects(() => readFile(join(rootDir, 'anything')), /ENOENT/);
  } finally {
    await rimuoviCartellaDiProvaAttesa(rootDir);
  }
});

test('P0.4 image persistence fails closed when the stored bytes are tampered with', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'talos-generated-image-'));
  try {
    const store = createGeneratedImageStore({ rootDir });
    const saved = await store.persistGeneratedImage({ bytes: Buffer.from([1, 2, 3]), mimeType: 'image/webp', source: 'openrouter' });
    await (await import('node:fs/promises')).writeFile(saved.path, Buffer.from([9]));
    await assert.rejects(() => store.readGeneratedImage(saved.id), (error) => error instanceof GeneratedImageStoreError && error.code === 'TALOS_IMAGE_PERSIST_CORRUPT');
  } finally {
    await rimuoviCartellaDiProvaAttesa(rootDir);
  }
});
