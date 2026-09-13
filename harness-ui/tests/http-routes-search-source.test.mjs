import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createSearchSourceStore } from '../src/search-source-store.mjs';

function keyringFinto() {
  const m = new Map();
  return { get: (s, a) => m.get(`${s}/${a}`) ?? null, set: (s, a, v) => m.set(`${s}/${a}`, v), remove: (s, a) => m.delete(`${s}/${a}`) };
}
async function listen(t, deps) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, ...deps }));
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

test('SEARCH-HTTP-01 — GET /search-source: fonte, prontezza e catalogo, mai la chiave', async (t) => {
  const store = createSearchSourceStore({ env: { TALOS_HARNESS_SEARCH_PROVIDER: 'tavily', TALOS_HARNESS_SEARCH_API_KEY: 'tvly-http-secret' }, keyring: keyringFinto(), file: null });
  const base = await listen(t, { searchSourceStore: store });
  const r = await request(base, '/api/v1/search-source');
  assert.equal(r.status, 200);
  const testo = await r.text();
  assert.doesNotMatch(testo, /tvly-http-secret/);
  const { data } = JSON.parse(testo);
  assert.equal(data.source, 'tavily');
  assert.equal(data.readiness, 'pronta');
  assert.equal(data.fonti.length, 5);
  assert.equal(data.fonti.find((f) => f.id === 'duckduckgo').keyless, true);
  assert.notEqual((await request(base, '/api/v1/search-source?x=1')).status, 200);
});

test('SEARCH-HTTP-02 — scegliere la fonte, salvare/rimuovere la chiave: la risposta non contiene mai la chiave', async (t) => {
  const store = createSearchSourceStore({ env: {}, keyring: keyringFinto(), file: null });
  const base = await listen(t, { searchSourceStore: store });
  const scelta = await request(base, '/api/v1/search-source', { source: 'brave' });
  assert.equal(scelta.status, 200);
  assert.equal((await scelta.json()).data.readiness, 'chiave-mancante');
  const salva = await request(base, '/api/v1/search-source/key', { source: 'brave', key: '  brave-http-secret ' });
  assert.equal(salva.status, 200);
  const corpo = await salva.text();
  assert.doesNotMatch(corpo, /brave-http-secret/);
  assert.equal(JSON.parse(corpo).data.readiness, 'pronta');
  const rimuovi = await request(base, '/api/v1/search-source/key/remove', { source: 'brave' });
  assert.equal(rimuovi.status, 200);
  assert.equal((await rimuovi.json()).data.readiness, 'chiave-mancante');
  const spegni = await request(base, '/api/v1/search-source', { source: 'off' });
  assert.equal((await spegni.json()).data.readiness, 'spenta');
});

test('SEARCH-HTTP-03 — AL CONTRARIO: fonte ignota, corpo con campi extra, chiave vuota, indirizzo rotto sono errori con codice', async (t) => {
  const store = createSearchSourceStore({ env: {}, keyring: keyringFinto(), file: null });
  const base = await listen(t, { searchSourceStore: store });
  assert.equal((await (await request(base, '/api/v1/search-source', { source: 'bing' })).json()).error.code, 'SEARCH_SOURCE_INVALID');
  assert.equal((await (await request(base, '/api/v1/search-source', { source: 'tavily', leaked: 1 })).json()).error.code, 'QUERY_INVALID');
  assert.equal((await (await request(base, '/api/v1/search-source/key', { source: 'tavily', key: '  ' })).json()).error.code, 'SEARCH_KEY_REQUIRED');
  assert.equal((await (await request(base, '/api/v1/search-source', { source: 'searxng', endpoint: 'ftp://x' })).json()).error.code, 'SEARCH_ENDPOINT_INVALID');
});

test('SEARCH-HTTP-04 — /test esegue la prova iniettata solo quando la fonte è pronta; altrimenti SEARCH_NOT_READY', async (t) => {
  const store = createSearchSourceStore({ env: {}, keyring: keyringFinto(), file: null });
  const chiamate = [];
  const base = await listen(t, { searchSourceStore: store, provaRicercaWebFn: async (q) => { chiamate.push(q); return { fonte: 'duckduckgo', risultati: 2, titoli: ['a', 'b'] }; } });
  const ok = await request(base, '/api/v1/search-source/test', { query: 'talos' });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data, { fonte: 'duckduckgo', risultati: 2, titoli: ['a', 'b'] });
  assert.deepEqual(chiamate, ['talos']);
  await request(base, '/api/v1/search-source', { source: 'searxng' });
  const nonPronta = await request(base, '/api/v1/search-source/test', {});
  assert.equal(nonPronta.status, 409);
  assert.equal((await nonPronta.json()).error.code, 'SEARCH_NOT_READY');
  assert.equal(chiamate.length, 1);
});

test('SEARCH-HTTP-05 — senza store la rotta dichiara SEARCH_STORE_UNAVAILABLE', async (t) => {
  const base = await listen(t, {});
  const r = await request(base, '/api/v1/search-source');
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, 'SEARCH_STORE_UNAVAILABLE');
});
