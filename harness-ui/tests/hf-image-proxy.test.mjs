import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchAllowedHfImage } from '../src/hf-image-proxy.mjs';

function response(bytes, { status = 200, contentType = 'image/png', location = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType, ...(location ? { location } : {}) }),
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

test('Hugging Face image proxy accepts an official HTTPS image and bounds bytes', async () => {
  const result = await fetchAllowedHfImage('https://cdn-lfs.huggingface.co/card.png', {
    fetchImpl: async () => response([137, 80, 78, 71]),
    lookupFn: async () => [{ address: '18.165.122.1', family: 4 }],
    maxBytes: 16,
  });
  assert.equal(result.mimeType, 'image/png');
  assert.deepEqual([...result.bytes], [137, 80, 78, 71]);
});

test('proxy rejects arbitrary hosts, private redirects and active SVG content before exposing bytes', async () => {
  await assert.rejects(fetchAllowedHfImage('https://evil.example/card.png', { fetchImpl: async () => response([]) }), { code: 'HF_IMAGE_HOST_REJECTED' });
  await assert.rejects(fetchAllowedHfImage('https://huggingface.co/card.png', {
    fetchImpl: async () => response([], { status: 302, location: 'http://127.0.0.1/admin' }),
    lookupFn: async () => [{ address: '18.165.122.1', family: 4 }],
  }), { code: 'HF_IMAGE_REDIRECT_REJECTED' });
  await assert.rejects(fetchAllowedHfImage('https://huggingface.co/card.svg', {
    fetchImpl: async () => response([60, 115, 118, 103], { contentType: 'image/svg+xml' }),
    lookupFn: async () => [{ address: '18.165.122.1', family: 4 }],
  }), { code: 'HF_IMAGE_MIME_REJECTED' });
});

test('proxy aborts oversized responses and rejects private resolved addresses', async () => {
  await assert.rejects(fetchAllowedHfImage('https://huggingface.co/large.png', {
    fetchImpl: async () => response(new Array(17).fill(1), { contentType: 'image/png' }),
    lookupFn: async () => [{ address: '18.165.122.1', family: 4 }],
    maxBytes: 16,
  }), { code: 'HF_IMAGE_TOO_LARGE' });
  await assert.rejects(fetchAllowedHfImage('https://huggingface.co/private.png', {
    fetchImpl: async () => response([]),
    lookupFn: async () => [{ address: '127.0.0.1', family: 4 }],
  }), { code: 'HF_IMAGE_PRIVATE_ADDRESS' });
});
