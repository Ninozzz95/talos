import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { createOpenAiCompatibleRuntime } from '../src/openai-compatible-runtime.mjs';

async function listen(t, providerStore, extra = {}) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, providerStore, ...extra }));
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


/*
 * ⭐⭐⭐ P-C, 12/09 — LM STUDIO ARRIVA IN CHAT, PROVATO CON UN LM STUDIO FINTO.
 *
 * ⛔ Nessun LM Studio vero e nessuna porta 1234: la `fetch` del runtime e iniettata, e la risposta
 *   ha la forma documentata da 🌐 `https://lmstudio.ai/docs/app/api/endpoints/rest` (`/api/v1/models`,
 *   letto 12/09/2026). Provare contro un LM Studio installato direbbe solo che ce l'ho io.
 *
 * ⛔ Il difetto che chiude: il motore era scoperto, sondato, caricabile e scaricabile da sempre —
 *   e i suoi modelli non arrivavano da nessuna parte, perche `lmstudio` non era una fonte.
 */
const MODELLI_LM_FINTI = {
  models: [
    { type: 'llm', key: 'qwen3-8b-instruct', display_name: 'Qwen3 8B Instruct', max_context_length: 32768,
      capabilities: { vision: false, trained_for_tool_use: true, reasoning: { allowed_options: ['low', 'high'] } },
      quantization: { name: 'Q4_K_M' }, size_bytes: 4_800_000_000 },
    { type: 'embeddings', key: 'nomic-embed', display_name: 'Nomic Embed' },
  ],
};

test('PROVIDER-HTTP-06 (P-C) il catalogo LM Studio esce dal runtime locale, con le capacita OSSERVATE', async (t) => {
  let chiesto = null;
  const runtime = createOpenAiCompatibleRuntime({
    fetchImpl: async (url) => { chiesto = String(url); return Response.json(MODELLI_LM_FINTI); },
    now: () => new Date('2026-09-12T10:00:00.000Z'),
  });
  const store = createProviderCredentialStore({ env: {}, keyring: { get: () => null, set() {}, remove() {} } });
  const base = await listen(t, store, { localRuntimes: { lmstudio: { listModels: () => runtime.listModels('lmstudio') } } });

  const risposta = await request(base, '/api/v1/providers/lmstudio/models');
  assert.equal(risposta.status, 200, 'la rotta deve esistere: prima la regex conosceva solo openai|anthropic|gemini');
  const { data } = await risposta.json();
  assert.equal(chiesto, 'http://127.0.0.1:1234/api/v1/models', 'l’indirizzo e il percorso li dichiara il registro');
  assert.equal(data.provider, 'lmstudio');
  assert.equal(data.modelli.length, 1, 'un modello di embedding non e una destinazione di chat');

  const modello = data.modelli[0];
  assert.equal(modello.id, 'lmstudio:qwen3-8b-instruct', 'il prefisso della fonte si mette qui, e il fornitore non lo vede mai');
  assert.equal(modello.nome, 'Qwen3 8B Instruct');
  assert.equal(modello.contextLength, 32768);
  assert.equal(modello.contestoVerificato, true);
  /* ⭐ Le capacita sono OSSERVATE, non indovinate: e la ragione per cui questo fornitore vale piu
     di una riga in piu nel selettore. Ollama, sugli stessi campi, non dice niente. */
  assert.deepEqual(modello.capacita, { visione: 'osservato-no', toolUse: 'osservato-si', reasoning: 'osservato-si' });
  assert.deepEqual(modello.inputModalities, ['text']);
  assert.equal(modello.quantizzazione, 'Q4_K_M');
});

test('PROVIDER-HTTP-07 (P-C, verso contrario) LM Studio spento NON diventa «zero modelli»', async (t) => {
  /*
   * ⛔ «Non raggiungibile» e «nessun modello» sono due fatti diversi, e la striscia delle fonti li
   *   disegna diversi: un 200 con lista vuota direbbe alla persona che LM Studio non ha modelli
   *   installati, cioe la manderebbe a scaricarne uno invece che ad accenderlo.
   */
  const runtime = createOpenAiCompatibleRuntime({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  const store = createProviderCredentialStore({ env: {}, keyring: { get: () => null, set() {}, remove() {} } });
  const base = await listen(t, store, { localRuntimes: { lmstudio: { listModels: () => runtime.listModels('lmstudio') } } });
  const risposta = await request(base, '/api/v1/providers/lmstudio/models');
  assert.equal(risposta.status, 503);
  assert.equal((await risposta.json()).error.code, 'RUNTIME_UNREACHABLE');
});

test('PROVIDER-HTTP-08 (P-C, verso contrario) senza runtime locale configurato si dichiara, non si finge', async (t) => {
  const store = createProviderCredentialStore({ env: {}, keyring: { get: () => null, set() {}, remove() {} } });
  /* La sonda c'e (e cosi che il server e sempre configurato), il motore locale no: la rotta esiste
     e deve dire CHE COSA manca, non rispondere 404 come un indirizzo inventato. */
  const base = await listen(t, store, { localRuntimes: null, providerProbe: { prova: async () => {}, elencaModelli: async () => { throw new Error('non deve essere chiamata'); } } });
  const risposta = await request(base, '/api/v1/providers/lmstudio/models');
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'REPORT_UNAVAILABLE');
});

test('PROVIDER-HTTP-PH pool: /keys aggiunge una seconda chiave, /keys/remove la toglie per impronta, e nessun segreto esce', async (t) => {
  const conti = new Map();
  const keyring = {
    get: (service, account) => conti.get(`${service}\u0000${account}`) ?? null,
    set: (service, account, value) => { conti.set(`${service}\u0000${account}`, value); },
    remove: (service, account) => { conti.delete(`${service}\u0000${account}`); },
  };
  const store = createProviderCredentialStore({ env: {}, keyring });
  const base = await listen(t, store);
  const prima = await request(base, '/api/v1/providers/openai/keys', { key: 'sk-pool-prima-segreta' });
  assert.equal(prima.status, 200);
  const seconda = await request(base, '/api/v1/providers/openai/keys', { key: 'sk-pool-seconda-segreta', priorita: 5 });
  const testoSeconda = await seconda.text();
  assert.equal(seconda.status, 200);
  assert.doesNotMatch(testoSeconda, /sk-pool-/);
  const voceSeconda = JSON.parse(testoSeconda).data;
  assert.match(voceSeconda.impronta, /^[a-f0-9]{64}$/);
  assert.equal(voceSeconda.stato, 'disponibile');
  const elenco = await (await request(base, '/api/v1/providers')).text();
  assert.doesNotMatch(elenco, /sk-pool-/);
  assert.equal(JSON.parse(elenco).data.items.find((row) => row.id === 'openai').pool.length, 2);
  const corpoSbagliato = await request(base, '/api/v1/providers/openai/keys/remove', { impronta: 'non-una-impronta' });
  assert.equal(corpoSbagliato.status, 400);
  const rimossa = await request(base, '/api/v1/providers/openai/keys/remove', { impronta: voceSeconda.impronta });
  assert.equal(rimossa.status, 200);
  assert.deepEqual((await rimossa.json()).data.pool.length, 1);
  assert.equal(store.hasKey('openai'), true);
  const nonTrovata = await request(base, '/api/v1/providers/openai/keys/remove', { impronta: voceSeconda.impronta });
  assert.equal(nonTrovata.status, 404);
});
