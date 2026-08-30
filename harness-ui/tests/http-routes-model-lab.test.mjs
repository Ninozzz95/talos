import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

async function listen(t, capacitaMacchinaFn) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, capacitaMacchinaFn }));
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
