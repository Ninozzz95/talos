import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeBuildManifest } from '../src/runtime-build-manifest.mjs';

const valid = {
  runtimeId: 'llama.cpp',
  version: 'b10695',
  commit: 'dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe',
  platform: 'win32-x64-vulkan',
  sha256: 'a'.repeat(64),
  source: 'https://github.com/ggml-org/llama.cpp/releases/tag/b10695',
};

test('accepts a pinned runtime build manifest', () => {
  assert.deepEqual(parseRuntimeBuildManifest(valid), valid);
});

test('rejects an incomplete pin or non-hex digest', () => {
  assert.throws(() => parseRuntimeBuildManifest({ ...valid, commit: 'short' }), { code: 'LOCAL_RUNTIME_INVALID' });
  assert.throws(() => parseRuntimeBuildManifest({ ...valid, sha256: 'not-a-digest' }), { code: 'LOCAL_RUNTIME_INVALID' });
});

test('rejects unknown manifest fields and unsafe source paths', () => {
  assert.throws(() => parseRuntimeBuildManifest({ ...valid, extra: true }), { code: 'LOCAL_RUNTIME_INVALID' });
  assert.throws(() => parseRuntimeBuildManifest({ ...valid, source: 'C:\\runtime\\llama-server.exe' }), { code: 'LOCAL_RUNTIME_INVALID' });
});
