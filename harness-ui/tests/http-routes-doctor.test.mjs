import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { API_SCHEMA, createHttpApp } from '../src/http-app.mjs';

async function listen(t, { diagnosiFn } = {}) {
  const app = createHttpApp({
    staticHandler: async () => null,
    diagnosiFn,
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

test('⭐ GET /api/v1/doctor torna DAVVERO quello che diagnosiFn produce, nella busta standard', async (t) => {
  const { base } = await listen(t, {
    diagnosiFn: async () => ({ chiaveApi: true, shell: 'wsl2', git: true, naviga: true }),
  });
  const risposta = await fetch(`${base}/api/v1/doctor`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.meta.schema, API_SCHEMA);
  assert.deepEqual(corpo.data, { chiaveApi: true, shell: 'wsl2', git: true, naviga: true });
});

test('⛔ senza diagnosiFn configurato: 404, REPORT_UNAVAILABLE — mai un "Healthy" inventato', async (t) => {
  const { base } = await listen(t, { diagnosiFn: null });
  const risposta = await fetch(`${base}/api/v1/doctor`);
  assert.equal(risposta.status, 404);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, false);
  assert.equal(corpo.error.code, 'REPORT_UNAVAILABLE');
});
