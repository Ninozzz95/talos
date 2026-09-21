import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createContextAssetAdapter } from '../src/context-asset-adapter.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==', 'base64');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function store() {
  const rows = new Map();
  return { rows, async putBlob({ sessionId, id, bytes, mimeType, sha256 }) {
    rows.set(`${sessionId}/${id}`, { id, bytes: Uint8Array.from(bytes), mimeType, sha256 });
    return { id, mimeType, sha256, byteLength: bytes.length };
  }, async readBlob({ sessionId, id }) { return rows.get(`${sessionId}/${id}`) ?? null; } };
}

test('CTX-ASSET-ROUNDTRIP preserves byte/hash/MIME and session ownership', async () => {
  const disk = store(); const api = createContextAssetAdapter({ store: disk });
  const manifest = await api.archiveContextAsset({ sessionId: 's', id: 'image', mimeType: 'image/png', bytes: png, sha256: digest(png) });
  assert.equal(manifest.sha256, digest(png)); assert.equal(manifest.byteLength, png.length);
  const result = await api.resolveContextAsset({ sessionId: 's', id: 'image', modelCapabilities: { vision: true } });
  assert.deepEqual(Buffer.from(result.bytes), png); assert.equal(result.mimeType, 'image/png');
  result.bytes[0] = 0;
  assert.equal((await api.resolveContextAsset({ sessionId: 's', id: 'image', modelCapabilities: { vision: true } })).bytes[0], 137);
  await assert.rejects(api.resolveContextAsset({ sessionId: 'other', id: 'image', modelCapabilities: { vision: true } }), { code: 'CTX_ASSET_MISSING' });
});

test('CTX-ASSET-CAPABILITY rejects unsupported vision, MIME and byte limits', async () => {
  const api = createContextAssetAdapter({ store: store() });
  await api.archiveContextAsset({ sessionId: 's', id: 'image', mimeType: 'image/png', bytes: png });
  for (const modelCapabilities of [{}, { vision: false }, { vision: true, supportedMimeTypes: ['image/jpeg'] }, { vision: true, maxAssetBytes: 4 }]) {
    await assert.rejects(api.resolveContextAsset({ sessionId: 's', id: 'image', modelCapabilities }), { code: 'CTX_ASSET_CAPABILITY' });
  }
});

test('CTX-ASSET-HASH checks bytes and declared MIME both before archive and on recovery', async () => {
  const disk = store(); const api = createContextAssetAdapter({ store: disk });
  await assert.rejects(api.archiveContextAsset({ sessionId: 's', id: 'a', mimeType: 'image/jpeg', bytes: png }), { code: 'CTX_ASSET_MIME' });
  await assert.rejects(api.archiveContextAsset({ sessionId: 's', id: 'a', mimeType: 'image/png', bytes: png, sha256: '0'.repeat(64) }), { code: 'CTX_ASSET_HASH' });
  await api.archiveContextAsset({ sessionId: 's', id: 'a', mimeType: 'image/png', bytes: png });
  disk.rows.get('s/a').bytes[12] ^= 1;
  await assert.rejects(api.resolveContextAsset({ sessionId: 's', id: 'a', modelCapabilities: { vision: true } }), { code: 'CTX_ASSET_HASH' });
});

test('CTX-ASSET-READ-PORT receives session authority and cannot fetch arbitrary URLs', async () => {
  let calls = 0;
  const api = createContextAssetAdapter({ store: store(), readAsset: async request => { calls++; assert.deepEqual(request, { sessionId: 's', id: 'known' }); return { sessionId: 's', id: 'known', bytes: png, mimeType: 'image/png', sha256: digest(png) }; } });
  await api.archiveContextAsset({ sessionId: 's', id: 'known', mimeType: 'image/png' });
  await assert.rejects(api.archiveContextAsset({ sessionId: 's', id: 'https://arbitrary.example/image', mimeType: 'image/png' }), { code: 'CTX_ASSET_INVALID' });
  assert.equal(calls, 1);
  const foreign = createContextAssetAdapter({ store: store(), readAsset: async () => ({ sessionId: 'other', id: 'known', bytes: png, mimeType: 'image/png' }) });
  await assert.rejects(foreign.archiveContextAsset({ sessionId: 's', id: 'known', mimeType: 'image/png' }), { code: 'CTX_ASSET_OWNERSHIP' });
});

test('CTX-ASSET-MALFORMED-HASH rejects malformed read-port reference without TypeError', async () => {
  const api = createContextAssetAdapter({ store: store(), readAsset: async () => ({ sessionId: 's', id: 'known', bytes: png, mimeType: 'image/png' }) });
  await assert.rejects(api.archiveContextAsset({ sessionId: 's', id: 'known', mimeType: 'image/png', sha256: 42 }), { code: 'CTX_ASSET_HASH' });
});
