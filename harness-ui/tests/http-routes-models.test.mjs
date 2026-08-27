import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { API_SCHEMA, createHttpApp } from '../src/http-app.mjs';

async function listen(t, { catalogoModelliFn } = {}) {
  const app = createHttpApp({
    campaignService: { listCampaigns: async () => [] },
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
  assert.deepEqual(corpo.data, { modelli, daCache: true, aggiornatoAlle: '2026-08-27T10:00:00.000Z' });
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
