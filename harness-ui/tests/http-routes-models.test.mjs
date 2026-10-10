import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { API_SCHEMA, createHttpApp } from '../src/http-app.mjs';
import { filoRagionamentoDiretti, livelliRagionamentoDiretti } from '../src/model-destination.mjs';

async function listen(t, { catalogoModelliFn } = {}) {
  const app = createHttpApp({
    staticHandler: async () => null,
    catalogoModelliFn,
  });
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}` };
}

test('⭐ GET /api/v1/models torna DAVVERO quello che catalogoModelliFn produce, nella busta standard', async (t) => {
  const modelli = [{ id: 'deepseek/deepseek-chat', provider: 'deepseek', nome: 'DeepSeek: Chat', contextLength: 64000, prezzoPrompt: '0.0000002', prezzoCompletion: '0.0000006' }];
  const { base } = await listen(t, {
    catalogoModelliFn: async ({ forzaAggiornamento }) => ({ modelli, daCache: !forzaAggiornamento, aggiornatoAlle: '2026-08-27T10:00:00.000Z' }),
  });
  const risposta = await fetch(`${base}/api/v1/models`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.meta.schema, API_SCHEMA);
  /* ⛔ BUG-7 cura3 (revisore C3-A/M3, 05/10/2026): la busta porta anche `livelliDiretti` (http-app.mjs, campo
     additivo D2) — l'asserzione profonda lo dichiara invece di cadere sulla chiave in più. */
  /* A9 (09/10/2026): e `filoDiretti`, che cosa arriva al fornitore per ogni livello (additivo come sopra). */
  /* A9, seguito OpenRouter (09/10/2026): e `filoCatalogo`, lo stesso per le voci del catalogo (qui nessuna ha `reasoning`: vuoto). */
  assert.deepEqual(corpo.data, { modelli, daCache: true, aggiornatoAlle: '2026-08-27T10:00:00.000Z', livelliDiretti: livelliRagionamentoDiretti(), filoDiretti: filoRagionamentoDiretti(), filoCatalogo: {} });
});

test('A9-OR-ROTTA — /api/v1/models porta il filo delle voci del catalogo, per id esatto', async (t) => {
  const modelli = [
    { id: 'z-ai/glm-5.3-flash', reasoning: { supportedEfforts: ['max', 'high', 'low'], defaultEffort: 'max', defaultEnabled: true, mandatory: true } },
    { id: 'deepseek/deepseek-chat' },
  ];
  const { base } = await listen(t, { catalogoModelliFn: async () => ({ modelli, daCache: true, aggiornatoAlle: '2026-10-09T10:00:00.000Z' }) });
  const corpo = await (await fetch(`${base}/api/v1/models`)).json();
  assert.deepEqual(corpo.data.filoCatalogo, { 'z-ai/glm-5.3-flash': { none: 'low', minimal: 'low', low: 'low', medium: 'low', high: 'high', xhigh: 'max', max: 'max', auto: 'max' } });
  assert.deepEqual(corpo.data.modelli, modelli, 'il catalogo resta com’era');
});

test('⭐⭐ ?forza=1 passa forzaAggiornamento:true a catalogoModelliFn', async (t) => {
  let ricevuto;
  const { base } = await listen(t, {
    catalogoModelliFn: async (opts) => { ricevuto = opts; return { modelli: [], daCache: false, aggiornatoAlle: '2026-08-27T10:00:00.000Z' }; },
  });
  await fetch(`${base}/api/v1/models?forza=1`);
  assert.deepEqual(ricevuto, { forzaAggiornamento: true });
});

test('⛔ senza catalogoModelliFn configurato: 404, REPORT_UNAVAILABLE', async (t) => {
  const { base } = await listen(t, { catalogoModelliFn: null });
  const risposta = await fetch(`${base}/api/v1/models`);
  assert.equal(risposta.status, 404);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, false);
  assert.equal(corpo.error.code, 'REPORT_UNAVAILABLE');
});

test('⛔ un errore CATALOG_UNREACHABLE dal catalogo diventa 503, mai un 500 generico', async (t) => {
  const { base } = await listen(t, {
    catalogoModelliFn: async () => { const e = new Error('rete giù'); e.code = 'CATALOG_UNREACHABLE'; throw e; },
  });
  const risposta = await fetch(`${base}/api/v1/models`);
  assert.equal(risposta.status, 503);
  const corpo = await risposta.json();
  assert.equal(corpo.error.code, 'CATALOG_UNREACHABLE');
});

test('⛔ una query non ammessa (chiave diversa da "forza") è QUERY_INVALID', async (t) => {
  const { base } = await listen(t, { catalogoModelliFn: async () => ({ modelli: [], daCache: false, aggiornatoAlle: '' }) });
  const risposta = await fetch(`${base}/api/v1/models?altro=1`);
  assert.equal(risposta.status, 400);
});
