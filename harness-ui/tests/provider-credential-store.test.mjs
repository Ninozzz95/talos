import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PROVIDER_IDS,
  ProviderCredentialError,
  createProviderCredentialStore,
  normalizeProviderEndpoint,
} from '../src/provider-credential-store.mjs';

function fakeKeyring(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get(service, account) { return values.get(`${service}:${account}`) ?? null; },
    set(service, account, value) { values.set(`${service}:${account}`, value); },
    remove(service, account) { values.delete(`${service}:${account}`); },
  };
}

test('NATIVE-STORE-01 adapter collegati e credenziale configurata sono stati distinti', () => {
  const rows = createProviderCredentialStore({ env: {}, keyring: fakeKeyring() }).listPublic();
  for (const id of ['openai', 'anthropic', 'gemini']) {
    assert.equal(rows.find(row => row.id === id).execution, 'collegato');
    assert.equal(rows.find(row => row.id === id).keyConfigured, false);
  }
});

test('PROVIDER-STORE-01 bootstrap ambiente e lista pubblica non espongono i segreti', () => {
  const secret = 'sk-openrouter-private';
  const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: `  ${secret}  ` } });
  assert.deepEqual(PROVIDER_IDS, ['openai', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'ollama', 'huggingface']);
  assert.equal(store.getKey('openrouter'), secret);
  const publicRows = store.listPublic();
  assert.equal(publicRows.find((row) => row.id === 'openrouter').keyConfigured, true);
  assert.doesNotMatch(JSON.stringify(publicRows), /sk-openrouter-private/);
});

test('PROVIDER-STORE-02 chiave vuota o provider sconosciuto falliscono senza modificare lo stato', async () => {
  const keyring = fakeKeyring();
  const store = createProviderCredentialStore({ env: {}, keyring });
  assert.throws(() => store.setKey('openai', '   '), (error) => error instanceof ProviderCredentialError && error.code === 'PROVIDER_KEY_REQUIRED');
  assert.throws(() => store.setKey('non-esiste', 'secret'), (error) => error instanceof ProviderCredentialError && error.code === 'PROVIDER_INVALID');
  assert.equal(store.hasKey('openai'), false);
  assert.equal(keyring.values.size, 0);
});

test('PROVIDER-STORE-03 salva e rimuove dal portachiavi senza restituire il valore', async () => {
  const keyring = fakeKeyring();
  const store = createProviderCredentialStore({ env: {}, keyring });
  const saved = await store.setKey('openai', '  openai-secret  ');
  assert.deepEqual(saved, { provider: 'openai', keyConfigured: true });
  assert.equal(store.getKey('openai'), 'openai-secret');
  assert.equal(JSON.stringify(saved).includes('openai-secret'), false);
  const removed = await store.clearKey('openai');
  assert.deepEqual(removed, { provider: 'openai', keyConfigured: false });
  assert.equal(store.getKey('openai'), null);
});

test('PROVIDER-STORE-04 ricarica una chiave dal portachiavi e fallisce in modo esplicito senza backend', () => {
  const keyring = fakeKeyring({ 'talos-harness-provider:openrouter': 'persisted-secret' });
  const store = createProviderCredentialStore({ env: {}, keyring });
  store.loadFromKeyring();
  assert.equal(store.getKey('openrouter'), 'persisted-secret');
  const noKeyring = createProviderCredentialStore({ env: {} });
  assert.throws(() => noKeyring.setKey('openai', 'secret'), (error) => error instanceof ProviderCredentialError && error.code === 'PROVIDER_STORE_UNAVAILABLE');
});

test('PROVIDER-STORE-05 endpoint e timeout rispettano i limiti mobile', () => {
  assert.equal(normalizeProviderEndpoint('openai', 'https://api.openai.com/v1/'), 'https://api.openai.com/v1');
  assert.throws(() => normalizeProviderEndpoint('openai', 'ftp://example.test'), (error) => error instanceof ProviderCredentialError && error.code === 'PROVIDER_RUNTIME_INVALID');
  assert.throws(() => normalizeProviderEndpoint('openai', 'https://user:pass@example.test'), (error) => error instanceof ProviderCredentialError && error.code === 'PROVIDER_RUNTIME_INVALID');
  const store = createProviderCredentialStore({ env: {}, keyring: fakeKeyring() });
  assert.deepEqual(store.setRuntime('ollama', { endpoint: 'http://127.0.0.1:11434/' }), { provider: 'ollama', endpoint: 'http://127.0.0.1:11434', endpointConfigured: true, timeoutSeconds: 60 });
  assert.throws(() => store.setRuntime('openai', { timeoutSeconds: 301 }), (error) => error instanceof ProviderCredentialError && error.code === 'PROVIDER_RUNTIME_INVALID');
});

test('PROVIDER-STORE-06 le variabili ambiente non sono loggate e le righe pubbliche contengono solo presenza', () => {
  const entries = [];
  const secret = 'deepseek-secret-never-log';
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: secret }, keyring: fakeKeyring(), logger: (message) => entries.push(message) });
  store.loadFromKeyring();
  assert.doesNotMatch(entries.join('\n'), /deepseek-secret-never-log/);
  assert.equal(store.listPublic().some((row) => JSON.stringify(row).includes(secret)), false);
});

test('PROVIDER-RUNTIME-RESTART-01 endpoint e timeout sopravvivono al riavvio senza salvare chiavi', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'talos-provider-runtime-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const runtimeFile = join(directory, 'provider-runtime.json');
  const first = createProviderCredentialStore({
    env: { OPENAI_API_KEY: 'secret-never-on-disk' },
    keyring: fakeKeyring(),
    runtimeFile,
  });
  first.setRuntime('openai', { endpoint: 'https://gateway.example.test/v1/', timeoutSeconds: 125 });

  const persisted = readFileSync(runtimeFile, 'utf8');
  assert.doesNotMatch(persisted, /secret-never-on-disk/);
  const restarted = createProviderCredentialStore({ env: {}, keyring: fakeKeyring(), runtimeFile });
  assert.deepEqual(restarted.getRuntime('openai'), {
    provider: 'openai',
    endpoint: 'https://gateway.example.test/v1',
    endpointConfigured: true,
    timeoutSeconds: 125,
  });
});

test('PROVIDER-RUNTIME-RESTART-02 file corrotto o valori non validi sono ignorati senza interrompere il server', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'talos-provider-runtime-corrupt-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const runtimeFile = join(directory, 'provider-runtime.json');
  const entries = [];
  writeFileSync(runtimeFile, '{broken', 'utf8');
  const corrupt = createProviderCredentialStore({ env: {}, runtimeFile, logger: (message) => entries.push(message) });
  assert.equal(corrupt.getRuntime('openai').endpointConfigured, false);
  assert.match(entries.join('\n'), /preferenze provider ignorate/i);

  writeFileSync(runtimeFile, JSON.stringify({
    version: 1,
    providers: {
      openai: { endpoint: 'file:///private', timeoutSeconds: 60 },
      ollama: { endpoint: 'http://127.0.0.1:11434', timeoutSeconds: 999 },
      unknown: { endpoint: 'https://example.test', timeoutSeconds: 60 },
    },
  }), 'utf8');
  const invalid = createProviderCredentialStore({ env: {}, runtimeFile });
  assert.equal(invalid.getRuntime('openai').endpointConfigured, false);
  assert.equal(invalid.getRuntime('ollama').endpointConfigured, false);
});
