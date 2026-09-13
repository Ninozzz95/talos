import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { FONTI_RICERCA_IDS, SearchSourceError, createSearchSourceStore } from '../src/search-source-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function keyringFinto() {
  const m = new Map();
  return { m, get: (s, a) => m.get(`${s}/${a}`) ?? null, set: (s, a, v) => m.set(`${s}/${a}`, v), remove: (s, a) => m.delete(`${s}/${a}`) };
}
function cartellaProva(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-search-store-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  return join(dir, 'search-source.json');
}

test('SEARCH-STORE-01 — senza niente di configurato la fonte è DuckDuckGo, pronta, senza chiave: il modello può cercare da subito', () => {
  const store = createSearchSourceStore({ env: {}, keyring: keyringFinto(), file: null });
  const v = store.listPublic();
  assert.equal(v.source, 'duckduckgo');
  assert.equal(v.readiness, 'pronta');
  assert.deepEqual(FONTI_RICERCA_IDS, ['duckduckgo', 'tavily', 'brave', 'searxng', 'custom']);
  const k = store.perKernel({ trasportoSenzaChiave: () => 'trasporto' });
  assert.equal(k.ricercaWeb.provider, 'custom');
  assert.match(k.ricercaWeb.endpoint, /ricerca-senza-chiave\.talos\.invalid/);
  assert.equal(typeof k.richiediRicercaFn, 'function');
});

test('SEARCH-STORE-02 — le variabili d\'ambiente di oggi restano il seme: TALOS_HARNESS_SEARCH_* diventano fonte e chiave, e la chiave NON esce dalla vista pubblica', () => {
  const secret = 'tvly-never-shown';
  const store = createSearchSourceStore({ env: { TALOS_HARNESS_SEARCH_PROVIDER: 'tavily', TALOS_HARNESS_SEARCH_API_KEY: secret }, keyring: keyringFinto(), file: null });
  const v = store.listPublic();
  assert.equal(v.source, 'tavily');
  assert.equal(v.readiness, 'pronta');
  assert.equal(v.fonti.find((f) => f.id === 'tavily').keyConfigured, true);
  assert.doesNotMatch(JSON.stringify(v), /tvly-never-shown/);
  const k = store.perKernel();
  assert.deepEqual(k.ricercaWeb, { provider: 'tavily', apiKey: secret });
  assert.equal(k.richiediRicercaFn, undefined, 'per le fonti con chiave il kernel usa il PROPRIO trasporto con la guardia DNS');
});

test('SEARCH-STORE-03 — la scelta dalla UI vince sull\'ambiente, sopravvive su file, e la chiave va nel portachiavi (mai nel file)', (t) => {
  const file = cartellaProva(t);
  const keyring = keyringFinto();
  const store = createSearchSourceStore({ env: { TALOS_HARNESS_SEARCH_PROVIDER: 'tavily', TALOS_HARNESS_SEARCH_API_KEY: 'seme' }, keyring, file });
  store.setSource({ source: 'brave' });
  assert.equal(store.listPublic().readiness, 'chiave-mancante');
  store.setKey('brave', '  brave-secret  ');
  assert.equal(store.listPublic().readiness, 'pronta');
  assert.equal(keyring.m.get('talos-harness-search/brave'), 'brave-secret');
  const suDisco = readFileSync(file, 'utf8');
  assert.doesNotMatch(suDisco, /brave-secret|seme/);
  assert.match(suDisco, /"source": "brave"/);
  // riapertura: il file comanda anche se l'ambiente dice tavily
  const riaperto = createSearchSourceStore({ env: { TALOS_HARNESS_SEARCH_PROVIDER: 'tavily', TALOS_HARNESS_SEARCH_API_KEY: 'seme' }, keyring, file });
  assert.equal(riaperto.listPublic().source, 'brave');
  assert.equal(riaperto.perKernel().ricercaWeb.apiKey, 'brave-secret');
});

test('SEARCH-STORE-04 — SearXNG e custom vogliono un indirizzo valido; «off» spegne davvero (undefined per il kernel); AL CONTRARIO fonte ignota e chiave vuota sono rifiutate', (t) => {
  const store = createSearchSourceStore({ env: {}, keyring: keyringFinto(), file: cartellaProva(t) });
  store.setSource({ source: 'searxng' });
  assert.equal(store.listPublic().readiness, 'indirizzo-mancante');
  assert.equal(store.perKernel().ricercaWeb, undefined);
  assert.throws(() => store.setSource({ source: 'searxng', endpoint: 'non-un-url' }), (e) => e instanceof SearchSourceError && e.code === 'SEARCH_ENDPOINT_INVALID');
  store.setSource({ source: 'searxng', endpoint: 'https://searx.example.org/' });
  assert.deepEqual(store.perKernel().ricercaWeb, { provider: 'searxng', endpoint: 'https://searx.example.org' });
  store.setSource({ source: 'off' });
  assert.equal(store.listPublic().readiness, 'spenta');
  assert.equal(store.perKernel().ricercaWeb, undefined);
  assert.throws(() => store.setSource({ source: 'bing' }), (e) => e.code === 'SEARCH_SOURCE_INVALID');
  assert.throws(() => store.setKey('tavily', '   '), (e) => e.code === 'SEARCH_KEY_REQUIRED');
});

test('SEARCH-STORE-05 — senza portachiavi salvare una chiave fallisce chiuso, e la fonte resta «chiave-mancante»', () => {
  const store = createSearchSourceStore({ env: {}, keyring: null, file: null });
  store.setSource({ source: 'tavily' });
  assert.throws(() => store.setKey('tavily', 'x'), (e) => e.code === 'SEARCH_STORE_UNAVAILABLE');
  assert.equal(store.listPublic().readiness, 'chiave-mancante');
});
