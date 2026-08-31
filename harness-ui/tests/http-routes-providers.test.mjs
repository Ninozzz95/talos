import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

async function listen(t, providerStore) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, providerStore }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function request(base, path, body) {
  return fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('PROVIDER-HTTP-01 elenco provider e stato pubblico non espongono la chiave', async (t) => {
  const secret = 'sk-http-never-returned';
  const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: secret } });
  const base = await listen(t, store);
  const response = await request(base, '/api/v1/providers');
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /OpenRouter/);
  assert.doesNotMatch(text, /sk-http-never-returned/);
  assert.equal(JSON.parse(text).data.items.find((row) => row.id === 'openrouter').keyConfigured, true);
});

test('PROVIDER-HTTP-02 salva, legge presenza e rimuove una chiave', async (t) => {
  const keyring = { value: null, get: () => keyring.value, set: (_service, _account, value) => { keyring.value = value; }, remove: () => { keyring.value = null; } };
  const store = createProviderCredentialStore({ env: {}, keyring });
  const base = await listen(t, store);
  const save = await request(base, '/api/v1/providers/openai/key', { key: '  openai-http-secret  ' });
  const saveText = await save.text();
  assert.equal(save.status, 200);
  assert.deepEqual(JSON.parse(saveText).data, { provider: 'openai', keyConfigured: true });
  assert.doesNotMatch(saveText, /openai-http-secret/);
  const remove = await request(base, '/api/v1/providers/openai/key/remove', {});
  assert.equal(remove.status, 200);
  assert.deepEqual((await remove.json()).data, { provider: 'openai', keyConfigured: false });
  assert.equal(store.hasKey('openai'), false);
});

test('PROVIDER-HTTP-03 runtime endpoint e timeout sono separati dal segreto', async (t) => {
  const store = createProviderCredentialStore({ env: {}, keyring: { get: () => null, set() {}, remove() {} } });
  const base = await listen(t, store);
  const save = await request(base, '/api/v1/providers/ollama/runtime', { endpoint: 'http://127.0.0.1:11434/', timeoutSeconds: 90 });
  assert.equal(save.status, 200);
  assert.deepEqual((await save.json()).data, { provider: 'ollama', endpoint: 'http://127.0.0.1:11434', endpointConfigured: true, timeoutSeconds: 90 });
  const read = await request(base, '/api/v1/providers/ollama/runtime');
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).data, { provider: 'ollama', endpoint: 'http://127.0.0.1:11434', endpointConfigured: true, timeoutSeconds: 90 });
});

test('PROVIDER-HTTP-05 Anthropic e Gemini conservano il timeout senza mostrare un endpoint non previsto dal mobile', async (t) => {
  const store = createProviderCredentialStore({ env: {}, keyring: { get: () => null, set() {}, remove() {} } });
  const base = await listen(t, store);
  for (const provider of ['anthropic', 'gemini']) {
    const save = await request(base, `/api/v1/providers/${provider}/runtime`, { endpoint: '', timeoutSeconds: 95 });
    assert.equal(save.status, 200);
    assert.deepEqual((await save.json()).data, { provider, endpoint: store.getRuntime(provider).endpoint, endpointConfigured: false, timeoutSeconds: 95 });
  }
});

test('PROVIDER-HTTP-04 provider sconosciuto, query e body extra restano errori naturali', async (t) => {
  const store = createProviderCredentialStore({ env: {}, keyring: { get: () => null, set() {}, remove() {} } });
  const base = await listen(t, store);
  const unknown = await request(base, '/api/v1/providers/unknown/key', { key: 'x' });
  assert.equal(unknown.status, 422);
  assert.equal((await unknown.json()).error.code, 'PROVIDER_INVALID');
  const extra = await request(base, '/api/v1/providers/openai/key', { key: 'x', leaked: 'no' });
  assert.equal(extra.status, 400);
  assert.equal((await extra.json()).error.code, 'QUERY_INVALID');
  const query = await request(base, '/api/v1/providers?secret=1');
  assert.equal(query.status, 400);
  assert.equal((await query.json()).error.code, 'QUERY_INVALID');
});
