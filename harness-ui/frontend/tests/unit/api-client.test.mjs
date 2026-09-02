import assert from 'node:assert/strict';
import test from 'node:test';

import { TalosApiError, createApiClient, resolveApiUrl } from '../../src/contracts/api-client.js';

test('PHASE1-REST-BOUNDARY-01 gestisce JSON 204 errori e abort', async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: 'http://127.0.0.1:4174', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/empty')) return new Response(null, { status: 204 });
    if (url.endsWith('/fail')) return new Response(JSON.stringify({ error: { code: 'NOPE', message: 'Non disponibile' } }), { status: 409, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }});
  assert.deepEqual(await client.get('/api/v1/health'), { ok: true });
  assert.equal(await client.post('/api/v1/empty', { hello: 'world' }), null);
  await assert.rejects(client.get('/api/v1/fail'), (error) => error instanceof TalosApiError && error.code === 'NOPE' && error.status === 409);
  const controller = new AbortController();
  await client.get('/api/v1/health', { signal: controller.signal });
  assert.equal(calls.at(-1).options.signal, controller.signal);
  assert.throws(() => resolveApiUrl('/admin', ''), /\/api\/v1\//u);
});
