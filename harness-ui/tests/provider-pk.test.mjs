// P-K — contratti ufficiali consultati il 12/09/2026; soltanto server finti.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REGISTRO_FORNITORI, verificaRegistro, AUTH } from '../src/provider-registry.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { risolviDestinazioneModello } from '../src/model-destination.mjs';
import { createProviderProbe } from '../src/provider-probe.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { normalizzaUsage, tokenDaCache, tokenScrittiInCache } from '../src/usage-cache.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { PROVIDER_DIRETTI } from '../frontend/src/components/fonti-modelli.js';

const FINTA = 'chiave-finta-riservata-pk';
const CASI = {
  azure: { nome: 'Azure AI Foundry', env: 'AZURE_OPENAI_API_KEY', percorso: '/openai/v1', modello: 'distribuzione-owner' },
  bedrock: { nome: 'Amazon Bedrock', env: 'AWS_BEARER_TOKEN_BEDROCK', percorso: '/openai/v1', modello: 'openai.gpt-oss-120b' },
  vertex: { nome: 'Google Vertex AI', env: 'VERTEX_ACCESS_TOKEN', percorso: '/v1/projects/progetto-pk/locations/europe-west1/endpoints/openapi', modello: 'google/gemini-2.5-flash' },
};
const deps = s => ({ leggiChiave: s.getKey, leggiRuntime: s.getRuntime });
const richiesta = (id, altro = {}) => ({ method: 'POST', body: JSON.stringify({ model: `${id}:${CASI[id].modello}`, messages: [{ role: 'user', content: 'Scrivi pronto.' }], ...altro }) });
const origine = 'https://non-chiamare.invalid/chat/completions';
async function ascolta(t, handler) {
  const s = createServer(handler);
  await new Promise((resolve, reject) => { s.once('error', reject); s.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { s.close(resolve); s.closeAllConnections(); }));
  assert.notEqual(s.address().port, 4174);
  return `http://127.0.0.1:${s.address().port}`;
}
function storePer(id, endpoint, chiave = FINTA, extra = {}) {
  const s = createProviderCredentialStore({ env: { [CASI[id].env]: chiave }, ...extra });
  s.setRuntime(id, { endpoint, timeoutSeconds: 35 });
  return s;
}
function nessunSegreto(valore) { assert.ok(!String(valore).includes(FINTA), 'Una credenziale finta è uscita dal trasporto'); }

test('PK-01 — tre record validi, autentificazioni esistenti e copie UI nei due versi', () => {
  for (const [id, c] of Object.entries(CASI)) {
    const r = REGISTRO_FORNITORI[id];
    assert.ok(r, `Record ${id} assente`);
    assert.equal(r.etichetta, c.nome);
    assert.equal(r.wire, 'openai-chat');
    assert.ok(AUTH.includes(r.auth.tipo));
    assert.equal(r.chiaveObbligatoria, true);
    assert.equal(r.indirizzoModificabile, true);
    assert.equal(verificaRegistro({ [id]: r }), true);
    assert.throws(() => verificaRegistro({ [id]: { ...r, auth: { ...r.auth, tipo: 'inventata' } } }));
    assert.equal(PROVIDER_DIRETTI.find(p => p.id === id)?.etichetta, c.nome);
    assert.deepEqual(r.modelliDiRiserva, []);
    assert.equal(r.modelloAusiliario, null);
    assert.throws(() => verificaRegistro({ [id]: { ...r, catalogo: { ...r.catalogo, riservaConfigurazione: undefined } } }));
  }
});

for (const [id, c] of Object.entries(CASI)) {
  test(`PK-02 ${id} — senza credenziale nessuna rete, configurazione incompleta respinta`, async () => {
    const s = storePer(id, `https://esempio.test${c.percorso}`, '');
    let chiamate = 0;
    const f = creaFetchMultiProvider(async () => { chiamate++; throw Error('Rete vietata'); }, { dipendenze: deps(s), providerStore: s });
    await assert.rejects(f(origine, richiesta(id)), { code: 'PROVIDER_KEY_MISSING' });
    assert.equal(chiamate, 0);
    const prova = await createProviderProbe({ ...deps(s), fetchImpl: f }).prova(id);
    assert.ok(['non-provabile', 'non-sondabile'].includes(prova.esito));
    assert.equal(prova.millisecondi, null);
    if (id !== 'bedrock') assert.throws(() => risolviDestinazioneModello(`${id}:${c.modello}`, deps(createProviderCredentialStore({ env: { [c.env]: FINTA } }))), { code: 'PROVIDER_RUNTIME_INVALID' });
  });

  test(`PK-03 ${id} — intestazioni, percorso, modello e conversazione contro HTTP finto`, async t => {
    const ricevute = [];
    const base = await ascolta(t, async (req, res) => {
      let testo = ''; for await (const pezzo of req) testo += pezzo;
      ricevute.push({ url: req.url, headers: req.headers, body: JSON.parse(testo) });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Pronto.' } }], usage: { prompt_tokens: 42, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 20 } } }));
    });
    const s = storePer(id, base + c.percorso);
    const f = creaFetchMultiProvider(fetch, { dipendenze: deps(s), providerStore: s });
    const messaggi = [{ role: 'user', content: 'Cerca il foglo.' }, { role: 'assistant', content: null, tool_calls: [{ id: 'uno', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'uno', content: 'Trovato' }, { role: 'user', content: 'Riprova, graze.' }];
    const r = await f(origine, richiesta(id, { messages: messaggi, tools: [{ type: 'function', function: { name: 'leggi', parameters: { type: 'object', properties: {} } } }], max_tokens: 16 }));
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.equal(corpo.usage.prompt_tokens_details.cached_tokens, 20);
    assert.equal(ricevute[0].url, c.percorso + '/chat/completions');
    assert.equal(ricevute[0].headers[id === 'azure' ? 'api-key' : 'authorization'], id === 'azure' ? FINTA : `Bearer ${FINTA}`);
    assert.equal(ricevute[0].headers[id === 'azure' ? 'authorization' : 'api-key'], undefined);
    assert.equal(ricevute[0].body.model, c.modello);
    assert.deepEqual(ricevute[0].body.messages, messaggi);
    assert.equal(ricevute[0].body.tools[0].function.name, 'leggi');
    nessunSegreto(JSON.stringify(corpo));
  });

  test(`PK-04/05 ${id} — 401/403/404/429/503 distinti, panchine e segreti oscurati`, async t => {
    let stato = 401;
    const base = await ascolta(t, (_req, res) => { res.writeHead(stato, { 'Content-Type': 'application/json', 'Retry-After': '10' }); res.end(JSON.stringify({ error: { message: FINTA } })); });
    for (stato of [401, 403, 404, 429, 503]) {
      const logs = [], s = storePer(id, base + c.percorso, FINTA, { logger: m => logs.push(m), ora: () => 1000 });
      const f = creaFetchMultiProvider(fetch, { dipendenze: deps(s), providerStore: s, onAvviso: m => logs.push(m) });
      const r = await f(origine, richiesta(id));
      assert.equal(r.status, stato);
      nessunSegreto(await r.text()); nessunSegreto(JSON.stringify(logs)); nessunSegreto(JSON.stringify(s.listPublic()));
      const p = s.elencaPool(id)[0];
      assert.equal(p.causa, [401, 403].includes(stato) ? 'credenziale' : stato === 429 ? 'traffico' : stato === 503 ? 'guasto-fornitore' : null);
      if (stato !== 404) assert.equal(s.scegliChiave(id), null);
    }
  });

  test(`PK-04 ${id} — sonda senza inferenza e senza falso esito positivo`, async t => {
    let stato = 200, chiamate = 0;
    const base = await ascolta(t, (req, res) => {
      chiamate++; assert.equal(req.method, 'GET');
      assert.equal(req.headers[id === 'azure' ? 'api-key' : 'authorization'], id === 'azure' ? FINTA : `Bearer ${FINTA}`);
      res.writeHead(stato, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stato === 200 ? { data: [{ id: 'modello' }] } : { error: { message: FINTA } }));
    });
    const s = storePer(id, base + c.percorso), p = createProviderProbe({ ...deps(s), fetchImpl: fetch });
    for (stato of [200, 401, 403, 404]) {
      const r = await p.prova(id); nessunSegreto(JSON.stringify(r));
      if (id === 'vertex') { assert.equal(r.esito, 'non-sondabile'); assert.equal(chiamate, 0); assert.equal(r.millisecondi, null); }
      else { assert.equal(r.httpStatus, stato); assert.equal(r.esito, stato === 200 ? 'collegato' : stato === 404 ? 'errore' : 'non-autorizzato'); }
    }
  });
}

test('PK-06 — cache dichiarata, zero distinto da assenza e scritture senza letture', () => {
  for (const id of Object.keys(CASI)) { assert.equal(tokenDaCache({}, id), null); assert.equal(tokenDaCache({ prompt_tokens_details: { cached_tokens: 0 } }, id), 0); }
  const u = { prompt_tokens: 100, cacheReadInputTokens: 30, cacheWriteInputTokens: 12 };
  assert.equal(tokenDaCache(u, 'bedrock'), 30); assert.equal(tokenScrittiInCache(u, 'bedrock'), 12);
  assert.equal(normalizzaUsage(u, 'bedrock').prompt_tokens, 100);
  assert.equal(normalizzaUsage({ cacheWriteInputTokens: 12 }, 'bedrock').prompt_tokens_details.cache_write_tokens, 12);
  assert.equal(tokenDaCache({ cacheReadInputTokens: -1 }, 'bedrock'), null);
  assert.equal(tokenDaCache({ prompt_tokens_details: { cached_tokens: 20 }, cacheReadInputTokens: 30 }, 'bedrock'), 20);
});

test('PK-07/10 — configurazione ufficiale via HTTP, persistenza v1 e nessun segreto su disco', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-pk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const runtimeFile = join(dir, 'preferenze.json');
  const s = createProviderCredentialStore({ env: {}, runtimeFile });
  const base = await ascolta(t, createHttpApp({ providerStore: s, staticHandler: async () => null }));
  const url = 'https://europe-west1-aiplatform.googleapis.com/v1/projects/progetto-pk/locations/europe-west1/endpoints/openapi';
  const r = await fetch(`${base}/api/v1/providers/vertex/runtime`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: url, timeoutSeconds: 35 }) });
  assert.equal(r.status, 200);
  const runtime = (await r.json()).data;
  assert.equal(runtime.progetto, 'progetto-pk'); assert.equal(runtime.regione, 'europe-west1'); assert.equal(runtime.versioneApi, 'v1');
  const riaperto = createProviderCredentialStore({ env: {}, runtimeFile });
  assert.deepEqual(riaperto.getRuntime('vertex'), runtime);
  const file = readFileSync(runtimeFile, 'utf8'); assert.equal(JSON.parse(file).version, 1); nessunSegreto(file);
  for (const id of Object.keys(CASI)) assert.throws(() => s.setRuntime(id, { endpoint: `https://esempio.test/v1?key=${FINTA}` }), { code: 'PROVIDER_RUNTIME_INVALID' });
});

test('PK-08 — token Entra esplicito, token scaduto e JSON malformato prima della rete', async () => {
  const token = JSON.stringify({ versione: 1, tipo: 'bearer', valore: FINTA, scadeAlle: '2099-01-01T00:00:00Z' });
  const s = storePer('azure', 'https://risorsa.openai.azure.com', token);
  const d = risolviDestinazioneModello('azure:nome-owner', deps(s));
  assert.equal(d.headers.Authorization, `Bearer ${FINTA}`); assert.equal(d.headers['api-key'], undefined);
  assert.equal(d.url, 'https://risorsa.openai.azure.com/openai/v1/chat/completions');
  for (const value of [token.replace('2099', '2001'), '{json-danneggiato']) {
    const scaduto = storePer('vertex', `https://esempio.test${CASI.vertex.percorso}`, value);
    let rete = 0;
    const f = creaFetchMultiProvider(async () => { rete++; }, { dipendenze: deps(scaduto), providerStore: scaduto });
    await assert.rejects(f(origine, richiesta('vertex')), e => { nessunSegreto(e.message); return e.code === 'PROVIDER_CLOUD_CREDENTIAL_INVALID' || e.code === 'PROVIDER_CLOUD_TOKEN_EXPIRED'; });
    assert.equal(rete, 0);
    assert.equal(scaduto.elencaPool('vertex')[0].causa, 'credenziale');
  }
});

test('PK-09 — redirect cloud bloccato anche senza pool; errore di rete senza segreto', async t => {
  let rubate = 0;
  const destinazione = await ascolta(t, (_req, res) => { rubate++; res.end('{}'); });
  const base = await ascolta(t, (_req, res) => { res.writeHead(307, { Location: destinazione }); res.end(); });
  const s = storePer('azure', base);
  const f = creaFetchMultiProvider(fetch, { dipendenze: deps(s) });
  await assert.rejects(f(origine, richiesta('azure')), e => { nessunSegreto(e.message); return true; });
  assert.equal(rubate, 0);
  const rotta = creaFetchMultiProvider(async () => { throw Error(FINTA); }, { dipendenze: deps(s) });
  await assert.rejects(rotta(origine, richiesta('azure')), e => { nessunSegreto(e.message); return true; });
});

test('PK-11 — versione Azure precedente, distribuzione nel percorso, nessuna riscrittura del modello', () => {
  const s = storePer('azure', 'https://risorsa.openai.azure.com/openai?api-version=2024-10-21');
  const d = risolviDestinazioneModello('azure:distribuzione-owner', deps(s));
  assert.equal(d.url, 'https://risorsa.openai.azure.com/openai/deployments/distribuzione-owner/chat/completions?api-version=2024-10-21');
  assert.throws(() => risolviDestinazioneModello('azure:../falso', deps(s)));
  assert.equal(s.getRuntime('azure').versioneApi, '2024-10-21');
  const input = { model: 'google/gemini-2.5-flash', messages: [], reasoning: { effort: 'high' } };
  const output = preparaRichiestaCompatibile('vertex', input);
  assert.equal(output.corpo.reasoning_effort, 'high'); assert.equal(output.corpo.reasoning, undefined);
  assert.ok(input.reasoning);
});
// P-K — fine

test('PK-12 — catalogo Azure v1 distinto dalla versione della chat', async () => {
  const s = storePer('azure', 'https://risorsa.openai.azure.com/openai?api-version=2024-10-21');
  const richieste = [];
  const p = createProviderProbe({ ...deps(s), fetchImpl: async (url, init) => { richieste.push({ url, init }); return Response.json({ data: [] }); } });
  assert.equal((await p.prova('azure')).httpStatus, 200);
  assert.equal(richieste[0].url, 'https://risorsa.openai.azure.com/openai/v1/models');
});

test('PK-13 — streaming canonico e consumo finale senza conteggi inventati', async t => {
  const sse = 'data: {"choices":[{"delta":{"content":"Pronto"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":42,"completion_tokens":2,"prompt_tokens_details":{"cached_tokens":20}}}\n\ndata: [DONE]\n\n';
  const base = await ascolta(t, (req, res) => { assert.equal(req.method, 'POST'); res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(sse); });
  for (const [id, c] of Object.entries(CASI)) {
    const s = storePer(id, base + c.percorso);
    const f = creaFetchMultiProvider(fetch, { dipendenze: deps(s), providerStore: s });
    const r = await f(origine, richiesta(id, { stream: true, stream_options: { include_usage: true } }));
    assert.equal(r.headers.get('content-type'), 'text/event-stream'); assert.equal(await r.text(), sse);
  }
});

test('PK-14 — due chiavi cloud: rifiuto della prima, seconda scelta e custodia dopo riavvio', async t => {
  const dati = new Map(), keyring = { get: (s, p) => dati.get(`${s}/${p}`) ?? null, set: (s, p, v) => dati.set(`${s}/${p}`, v), remove: (s, p) => dati.delete(`${s}/${p}`) };
  const ricevute = [];
  const base = await ascolta(t, (req, res) => { const k = req.headers.authorization; ricevute.push(k); res.writeHead(k === `Bearer ${FINTA}` ? 401 : 200, { 'Content-Type': 'application/json' }); res.end('{}'); });
  const s = storePer('bedrock', base, '', { keyring });
  s.aggiungiChiave('bedrock', FINTA); s.aggiungiChiave('bedrock', 'seconda-chiave-finta-pk');
  const f = creaFetchMultiProvider(fetch, { dipendenze: deps(s), providerStore: s });
  assert.equal((await f(origine, richiesta('bedrock'))).status, 401);
  assert.equal((await f(origine, richiesta('bedrock'))).status, 200);
  assert.deepEqual(ricevute, [`Bearer ${FINTA}`, 'Bearer seconda-chiave-finta-pk']);
  const riaperto = createProviderCredentialStore({ env: {}, keyring }); riaperto.loadFromKeyring();
  assert.equal(riaperto.elencaPool('bedrock')[0].causa, 'credenziale');
  assert.equal(riaperto.getKey('bedrock'), 'seconda-chiave-finta-pk');
  nessunSegreto(JSON.stringify(riaperto.listPublic()));
});

test('PK-15 — nessuna ricerca implicita di account cloud o credenziali SDK', () => {
  const s = createProviderCredentialStore({ env: { AWS_ACCESS_KEY_ID: FINTA, AWS_SECRET_ACCESS_KEY: FINTA, AWS_PROFILE: 'non-leggere', GOOGLE_APPLICATION_CREDENTIALS: 'non-leggere.json' } });
  for (const id of Object.keys(CASI)) assert.equal(s.getKey(id), null);
  for (const id of ['bedrock', 'vertex']) {
    const json = JSON.stringify({ type: 'service_account', private_key: FINTA });
    const r = storePer(id, `https://esempio.test${CASI[id].percorso}`, json);
    assert.throws(() => risolviDestinazioneModello(`${id}:${CASI[id].modello}`, deps(r)), { code: 'PROVIDER_CLOUD_CREDENTIAL_INVALID' });
  }
});

test('PK-16 — catalogo Bedrock senza corpi di errore pubblici; niente distribuzioni inventate', async t => {
  let stato = 200;
  const base = await ascolta(t, (req, res) => { assert.equal(req.url, '/openai/v1/models'); assert.equal(req.headers.authorization, `Bearer ${FINTA}`); res.writeHead(stato, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(stato === 200 ? { data: [{ id: 'openai.gpt-oss-120b' }] } : { error: { message: FINTA } })); });
  const s = storePer('bedrock', base), p = createProviderProbe({ ...deps(s) });
  assert.equal((await p.elencaModelli('bedrock')).modelli[0].id, 'bedrock:openai.gpt-oss-120b');
  for (stato of [401, 403, 404]) await assert.rejects(p.elencaModelli('bedrock'), e => { nessunSegreto(e.message); return e.code === 'CATALOG_UPSTREAM_ERROR'; });
  for (const id of ['azure', 'vertex']) {
    const s = storePer(id, `https://esempio.test${CASI[id].percorso}`);
    const p = createProviderProbe({ ...deps(s), fetchImpl: async () => { assert.fail('Nessuna rete per il catalogo non disponibile'); } });
    await assert.rejects(p.elencaModelli(id), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
  }
});
