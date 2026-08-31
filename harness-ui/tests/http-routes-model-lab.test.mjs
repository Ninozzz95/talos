import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

async function listen(t, capacitaMacchinaFn, extra = {}) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, capacitaMacchinaFn, ...extra }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('MODEL-LAB-HTTP-CAPACITY-01 restituisce la misura nella busta API standard', async (t) => {
  const base = await listen(t, async () => ({ schema: 'talos.model-lab.capacity/1', memory: { totalBytes: 1, freeBytes: 2 }, storage: { totalBytes: 3, availableBytes: 4, reserveBytes: 5, allocatableBytes: 0 }, runtime: { status: 'unconfigured' } }));
  const response = await fetch(`${base}/api/v1/model-lab/capacity`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.schema, 'talos.model-lab.capacity/1');
});

test('MODEL-LAB-HTTP-UNAVAILABLE-01 non inventa capacità quando la dipendenza manca', async (t) => {
  const base = await listen(t, null);
  const response = await fetch(`${base}/api/v1/model-lab/capacity`);
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'REPORT_UNAVAILABLE');
});

test('MODEL-LAB-HTTP-QUERY-01 rifiuta query non dichiarate', async (t) => {
  const base = await listen(t, async () => ({}));
  const response = await fetch(`${base}/api/v1/model-lab/capacity?refresh=1`);
  assert.equal(response.status, 400);
});

test('HTTP-LOCAL-RUNTIME-01 espone solo lo stato osservato degli adapter locali', async (t) => {
  const base = await listen(t, null, { localRuntimes: {
    ollama: {
      detect: async () => ({ provider: 'ollama', state: 'observed', baseUrl: 'http://127.0.0.1:11434' }),
      listModels: async () => [{ id: 'qwen3:8b', name: 'qwen3:8b', source: 'ollama', context: { state: 'observed', value: 65536 } }],
    },
    lmstudio: { detect: async () => ({ provider: 'lmstudio', state: 'unknown', baseUrl: 'http://127.0.0.1:1234' }) },
  } });
  const response = await fetch(`${base}/api/v1/runtime`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.data.items.map(({ runtimeId, state }) => ({ runtimeId, state })), [
    { runtimeId: 'ollama', state: 'observed' }, { runtimeId: 'lmstudio', state: 'unknown' },
  ]);
  assert.deepEqual(body.data.items[0].models, [{ id: 'qwen3:8b', name: 'qwen3:8b', source: 'ollama', context: { state: 'observed', value: 65536 } }]);
  assert.deepEqual(body.data.items[1].models, []);
});

test('HTTP-LOCAL-RUNTIME-MODELS-ERROR-01 dichiara il fallimento catalogo senza perdere lo stato osservato', async (t) => {
  const base = await listen(t, null, { localRuntimes: {
    ollama: {
      detect: async () => ({ provider: 'ollama', state: 'observed', baseUrl: 'http://127.0.0.1:11434' }),
      listModels: async () => { const error = new Error('catalogo rotto'); error.code = 'RUNTIME_RESPONSE_INVALID'; throw error; },
    },
  } });
  const body = await (await fetch(`${base}/api/v1/runtime`)).json();
  assert.equal(body.data.items[0].state, 'observed');
  assert.deepEqual(body.data.items[0].models, []);
  assert.equal(body.data.items[0].modelsError, 'RUNTIME_RESPONSE_INVALID');
});

test('HTTP-LOCAL-MODEL-01 elenca modelli dal catalogo locale e carica con runtime scelto', async (t) => {
  let loaded;
  const base = await listen(t, null, {
    localModelStore: { list: async () => [{ id: 'qwen3', state: 'ready' }] },
    localRuntimes: { lmstudio: { load: async (modelId, options) => { loaded = { modelId, options }; return { state: 'loaded' }; } } },
  });
  const list = await (await fetch(`${base}/api/v1/local-models`)).json();
  assert.deepEqual(list.data.items, [{ id: 'qwen3', state: 'ready' }]);
  const load = await fetch(`${base}/api/v1/runtime/load`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runtimeId: 'lmstudio', modelId: 'qwen3', contextLength: 4096 }) });
  assert.equal(load.status, 200);
  assert.deepEqual(loaded, { modelId: 'qwen3', options: { contextLength: 4096 } });
});

test('HTTP-LOCAL-CANCEL-01 delega il cancel alla sessione e rifiuta id sconosciuti', async (t) => {
  const calls = [];
  const base = await listen(t, null, { sessionRegistry: { ferma: (id) => { calls.push(id); return id === 'ok'; } } });
  const ok = await fetch(`${base}/api/v1/sessions/ok/cancel`, { method: 'POST', body: '{}' });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls, ['ok']);
  const missing = await fetch(`${base}/api/v1/sessions/missing/cancel`, { method: 'POST', body: '{}' });
  assert.equal(missing.status, 404);
});

test('HTTP-LOCAL-SESSION-01 inoltra provider/runtime/model e consenso senza passare da OpenRouter', async (t) => {
  let request;
  const base = await listen(t, null, { sessionRegistry: {
    avvia: (taskId, options) => { request = { taskId, options }; return { sessionId: 'local-session' }; },
  } });
  const response = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 'task-vero', provider: 'local', runtimeId: 'ollama', modelId: 'qwen3:8b', fallbackConsent: true }) });
  assert.equal(response.status, 200);
  assert.equal(request.taskId, 'task-vero');
  assert.deepEqual(request.options, { modelloScelto: null, modelloPlannerScelto: null, reasoningScelto: null, mobile: false, permessiScelto: null, permessiPerAttrezzoScelto: null, provider: 'local', runtimeId: 'ollama', modelId: 'qwen3:8b', fallbackConsent: true });
});

test('MODEL-LAB-HTTP-MODEL-ACTIONS-01 espone rinomina, copia percorso relativo ed eliminazione', async (t) => {
  const calls = [];
  const store = {
    list: async () => [{ id: 'qwen3', name: 'Qwen', path: 'qwen3/model.gguf', state: 'ready' }],
    rename: async (id, name) => { calls.push(['rename', id, name]); return { id, name, path: 'qwen3/model.gguf', state: 'ready' }; },
    remove: async (id) => { calls.push(['delete', id]); return true; },
    inspect: async (id) => ({ id, path: 'qwen3/model.gguf', state: 'ready' }),
  };
  const base = await listen(t, null, { localModelStore: store });
  const rename = await fetch(`${base}/api/v1/local-models/qwen3/rename`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Qwen locale' }) });
  assert.equal(rename.status, 200);
  assert.equal((await rename.json()).data.name, 'Qwen locale');
  const copy = await fetch(`${base}/api/v1/local-models/qwen3/copy-path`, { method: 'POST', body: '{}' });
  assert.equal(copy.status, 200);
  assert.equal((await copy.json()).data.path, 'qwen3/model.gguf');
  const deletion = await fetch(`${base}/api/v1/local-models/qwen3/delete`, { method: 'POST', body: '{}' });
  assert.equal(deletion.status, 200);
  assert.deepEqual(calls, [['rename', 'qwen3', 'Qwen locale'], ['delete', 'qwen3']]);
});

test('MODEL-LAB-HTTP-HF-QUERY-01 inoltra filtri e cursore al client Hub', async (t) => {
  let received;
  const base = await listen(t, null, { hfHubClient: { searchModels: async (options) => { received = options; return { items: [], nextCursor: 'next' }; } } });
  const response = await fetch(`${base}/api/v1/huggingface/search?query=qwen&limit=10&cursor=abc&sort=likes&direction=1&author=org&filter=q4&filter=text-generation`);
  assert.equal(response.status, 200);
  assert.deepEqual(received, { query: 'qwen', limit: 10, cursor: 'abc', sort: 'likes', direction: '1', author: 'org', filters: ['q4', 'text-generation'] });
});

test('MODEL-LAB-HTTP-IMPORT-01 inoltra uno stream binario e metadata senza esporre percorsi locali', async (t) => {
  let received;
  const base = await listen(t, null, { localModelTransfer: {
    importStream: async (stream, metadata) => { const chunks = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); received = { bytes: Buffer.concat(chunks), metadata }; return { id: metadata.id, state: 'ready' }; },
  } });
  const response = await fetch(`${base}/api/v1/local-models/import`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-talos-model-id': 'local-gguf', 'x-talos-model-filename': 'model.gguf', 'x-talos-model-bytes': '4', 'x-talos-model-name': 'Modello locale' }, body: Buffer.from('GGUF') });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { bytes: Buffer.from('GGUF'), metadata: { id: 'local-gguf', filename: 'model.gguf', expectedBytes: 4, name: 'Modello locale' } });
});

test('MODEL-LAB-HTTP-IMPORT-02 rifiuta il vecchio JSON con sourcePath', async (t) => {
  const base = await listen(t, null, { localModelTransfer: { importStream: async () => ({}) } });
  const response = await fetch(`${base}/api/v1/local-models/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourcePath: 'C:\\\\segreto\\\\model.gguf' }) });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.code, 'LOCAL_IMPORT_INVALID');
});

test('MODEL-LAB-HTTP-IMPORT-03 considera facoltativo il nome visualizzato', async (t) => {
  let metadata;
  const base = await listen(t, null, { localModelTransfer: { importStream: async (_stream, value) => { metadata = value; return { id: value.id, state: 'ready' }; } } });
  const response = await fetch(`${base}/api/v1/local-models/import`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-talos-model-id': 'local-gguf', 'x-talos-model-filename': 'model.gguf', 'x-talos-model-bytes': '4' }, body: Buffer.from('GGUF') });
  assert.equal(response.status, 200);
  assert.deepEqual(metadata, { id: 'local-gguf', filename: 'model.gguf', expectedBytes: 4 });
});
