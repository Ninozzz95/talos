// P-K-bis/P-L-bis: rete cloud sostituita, processo ACP esclusivamente finto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createProviderCredentialStore, PROVIDER_IDS } from '../src/provider-credential-store.mjs';
import { createProviderProbe } from '../src/provider-probe.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { leggiRuntimeAgenteEsterno } from '../src/acp-agent.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';

const endpoint = id => id === 'vertex' ? 'https://esempio.test/v1/projects/progetto/locations/global/endpoints/openapi' : 'https://esempio.test/openai/v1';
function banco(t, modo = 'normale') {
  const cwd = mkdtempSync(join(tmpdir(), 'talos-pklbis-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const diario = join(cwd, 'diario.jsonl');
  const agente = { comando: process.execPath, argomenti: [fileURLToPath(new URL('./fixtures/acp-agent-finto.mjs', import.meta.url)), modo, diario], cwd, variabiliAmbiente: [], timeoutMs: 2000 };
  return { cwd, diario, agente, runtimeFile: join(cwd, 'preferenze.json'), leggi: () => readFileSync(diario, 'utf8').trim().split('\n').map(JSON.parse) };
}
const sonda = (store, extra = {}) => createProviderProbe({ leggiChiave: store.getKey, leggiRuntime: store.getRuntime, env: {}, fetchImpl: () => assert.fail('Rete vietata'), ...extra });
async function ascolta(t, store, extra = {}) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, providerStore: store, providerProbe: sonda(store), ...extra }));
  await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', r); });
  assert.notEqual(server.address().port, 4174);
  t.after(() => new Promise(r => { server.close(r); server.closeAllConnections(); }));
  return async (path, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/providers${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, ...(await r.json()) };
  };
}

for (const id of ['azure', 'vertex', 'bedrock']) test(`PKLB-PREF-01 ${id}: modelli salvati, riletti e indipendenti dalle riserve`, t => {
  const f = banco(t), store = createProviderCredentialStore({ env: {}, runtimeFile: f.runtimeFile });
  const modelli = [{ id: id === 'vertex' ? 'google/gemini-2.5-flash' : 'distribuzione-uno', nome: 'Lavoro' }];
  assert.deepEqual(store.setRuntime(id, { endpoint: endpoint(id), timeoutSeconds: 35, modelli }).modelli, modelli);
  const riletto = createProviderCredentialStore({ env: {}, runtimeFile: f.runtimeFile });
  assert.deepEqual(riletto.getRuntime(id).modelli, modelli);
  const row = riletto.listPublic().find(r => r.id === id);
  assert.deepEqual(row.modelli, modelli); assert.deepEqual(row.modelliDiRiserva, []);
  assert.equal(JSON.parse(readFileSync(f.runtimeFile)).version, 1);
  row.modelli[0].id = 'mutazione';
  assert.deepEqual(riletto.getRuntime(id).modelli, modelli);
  riletto.setRuntime(id, { endpoint: endpoint(id), timeoutSeconds: 40 });
  assert.deepEqual(riletto.getRuntime(id).modelli, modelli, 'salvataggio legacy conserva la lista');
  riletto.resetEndpoint(id);
  assert.deepEqual(riletto.getRuntime(id).modelli, modelli, 'ripristino indirizzo conserva la lista');
  riletto.setRuntime(id, { modelli: [] });
  assert.deepEqual(createProviderCredentialStore({ env: {}, runtimeFile: f.runtimeFile }).getRuntime(id).modelli, []);
});

test('PKLB-PREF-02: preferenze v1 vecchie valide e riga corrotta isolata', t => {
  const f = banco(t), messaggi = [];
  writeFileSync(f.runtimeFile, JSON.stringify({ version: 1, providers: { azure: { endpoint: endpoint('azure'), timeoutSeconds: 30 }, vertex: { endpoint: endpoint('vertex'), modelli: [{ id: '' }] } } }));
  const store = createProviderCredentialStore({ env: {}, runtimeFile: f.runtimeFile, logger: m => messaggi.push(m) });
  assert.equal(store.getRuntime('azure').timeoutSeconds, 30);
  assert.deepEqual(store.getRuntime('azure').modelli, []);
  assert.deepEqual(store.getRuntime('vertex').modelli, []);
  assert.equal(messaggi.length, 1);
});

test('PKLB-INVALID-01: modelli malformati, capacità arbitrarie e segreti respinti senza scrivere', t => {
  const f = banco(t), store = createProviderCredentialStore({ env: { AZURE_OPENAI_API_KEY: 'segreto-finto-pklbis' }, runtimeFile: f.runtimeFile });
  for (const modelli of [null, {}, ['modello'], [{ id: '' }], [{ id: ' x' }], [{ id: 'x\ny' }], [{ id: 'https://segreto.test' }], [{ id: 'x', nome: '' }], [{ id: 'x', nome: '<script>' }], [{ id: 'x', toolCalling: true }], [{ id: 'x' }, { id: 'x' }], Array.from({ length: 51 }, (_, i) => ({ id: `m${i}` })), [{ id: 'segreto-finto-pklbis' }]]) {
    assert.throws(() => store.setRuntime('azure', { endpoint: endpoint('azure'), modelli }), { code: 'PROVIDER_RUNTIME_INVALID' });
  }
  assert.equal(existsSync(f.runtimeFile), false);
  assert.throws(() => store.setRuntime('openai', { endpoint: 'https://esempio.test/v1', modelli: [] }), { code: 'PROVIDER_RUNTIME_INVALID' });
  assert.equal(store.setRuntime('azure', { endpoint: endpoint('azure'), modelli: Array.from({ length: 50 }, (_, i) => ({ id: `m${i}` })) }).modelli.length, 50);
});

test('PKLB-PREF-03: agente persistito e pubblico, nessuna credenziale nel file', t => {
  const f = banco(t), env = { PL_CHIAVE_DICHIARATA: 'segreto-finto-pl' };
  const agente = { ...f.agente, variabiliAmbiente: ['PL_CHIAVE_DICHIARATA'] };
  const store = createProviderCredentialStore({ env, runtimeFile: f.runtimeFile });
  assert.deepEqual(store.setRuntime('esterno', { agente }).agente, agente);
  const riletto = createProviderCredentialStore({ env, runtimeFile: f.runtimeFile });
  assert.deepEqual(riletto.getRuntime('esterno').agente, agente);
  const row = riletto.listPublic().find(r => r.id === 'esterno');
  assert.deepEqual(row.agente, agente); assert.equal(row.keyConfigured, false); assert.equal(row.requiresKey, false);
  assert.equal(PROVIDER_IDS.includes('esterno'), false, 'non entra nel portachiavi');
  assert.throws(() => store.setKey('esterno', 'non-salvare'), { code: 'PROVIDER_INVALID' });
  assert.doesNotMatch(readFileSync(f.runtimeFile, 'utf8'), /segreto-finto-pl/);
  assert.equal(existsSync(f.diario), false, 'salvare non avvia processi');
});

test('PKLB-INVALID-02: agente respinto per percorsi, shell, valori ambiente e segreti negli argomenti', t => {
  const f = banco(t), env = { PL_CHIAVE_DICHIARATA: 'segreto-finto-pl' }, store = createProviderCredentialStore({ env, runtimeFile: f.runtimeFile });
  writeFileSync(join(f.cwd, 'agente.cmd'), '@echo prova');
  for (const altro of [{ comando: 'node' }, { comando: join(f.cwd, 'agente.cmd') }, { cwd: '.' }, { variabiliAmbiente: ['PL_CHIAVE_DICHIARATA=segreto-finto-pl'] }, { variabiliAmbiente: { PL_CHIAVE_DICHIARATA: 'segreto-finto-pl' } }, { argomenti: ['--api-key', 'segreto-finto-pl'] }, { timeoutMs: 0 }, { nome: 'campo-estraneo' }]) {
    assert.throws(() => store.setRuntime('esterno', { agente: { ...f.agente, ...altro } }), { code: 'PROVIDER_RUNTIME_INVALID' });
  }
  assert.equal(existsSync(f.runtimeFile), false);
  assert.throws(() => store.setRuntime('azure', { endpoint: endpoint('azure'), agente: f.agente }), { code: 'PROVIDER_RUNTIME_INVALID' });
});

test('PKLB-REG-TIMEOUT: un salvataggio legacy senza timeout mantiene il default precedente di 60 secondi', () => {
  const store = createProviderCredentialStore({ env: {} });
  store.setRuntime('openai', { endpoint: 'https://esempio.test/v1', timeoutSeconds: 120 });
  assert.equal(store.setRuntime('openai', { endpoint: 'https://esempio.test/v1' }).timeoutSeconds, 60);
});

test('PKLB-REG-CUSTODIA: una chiave custodita non entra negli argomenti dell’agente', t => {
  const f = banco(t), entries = new Map(), keyring = { get: (s, k) => entries.get(s + k), set: (s, k, v) => entries.set(s + k, v), remove: (s, k) => entries.delete(s + k) };
  const store = createProviderCredentialStore({ env: {}, keyring, runtimeFile: f.runtimeFile });
  store.setKey('openai', 'segreto-custodito-pklbis');
  assert.throws(() => store.setRuntime('esterno', { agente: { ...f.agente, argomenti: ['segreto-custodito-pklbis'] } }), { code: 'PROVIDER_RUNTIME_INVALID' });
  assert.equal(existsSync(f.runtimeFile), false);
});

test('PKLB-REG-SCRITTURA: errore di persistenza conserva modelli e agente precedenti', t => {
  const f = banco(t), store = createProviderCredentialStore({ env: {}, runtimeFile: join(f.cwd, 'manca', 'preferenze.json') });
  assert.throws(() => store.setRuntime('azure', { modelli: [{ id: 'modello' }] }), { code: 'PROVIDER_RUNTIME_UNAVAILABLE' });
  assert.deepEqual(store.getRuntime('azure').modelli, []);
  assert.throws(() => store.setRuntime('esterno', { agente: f.agente }), { code: 'PROVIDER_RUNTIME_UNAVAILABLE' });
  assert.equal(store.getRuntime('esterno').agente, null);
});

test('PKLB-HTTP-VUOTO: un catalogo da configurare è 422, non un errore interno', async t => {
  const store = createProviderCredentialStore({ env: {} }), req = await ascolta(t, store);
  for (const id of ['azure', 'vertex', 'esterno']) {
    const r = await req(`/${id}/models`);
    assert.equal(r.status, 422, id);
    assert.equal(r.error.code, 'CATALOG_CONFIGURATION_REQUIRED', id);
  }
});

test('PKLB-ACP-01: preferenze prima dell’ambiente; compatibilità runtime P-L', t => {
  const f = banco(t), env = { TALOS_AGENTE_ESTERNO: JSON.stringify({ ...f.agente, timeoutMs: 700 }) };
  assert.deepEqual(leggiRuntimeAgenteEsterno({ agente: f.agente }, { env }), f.agente);
  assert.deepEqual(leggiRuntimeAgenteEsterno(f.agente, { env }), f.agente);
  assert.equal(leggiRuntimeAgenteEsterno({}, { env }).timeoutMs, 700);
  assert.throws(() => leggiRuntimeAgenteEsterno({}, { env: {} }), { code: 'ACP_NOT_CONFIGURED' });
  assert.throws(() => leggiRuntimeAgenteEsterno({ agente: {} }, { env }), { code: 'ACP_RUNTIME_INVALID' });
});

for (const id of ['azure', 'vertex']) test(`PKLB-CATALOG-01 ${id}: lista configurata senza rete; vuota richiede configurazione`, async () => {
  const store = createProviderCredentialStore({ env: {} }), p = sonda(store);
  await assert.rejects(p.elencaModelli(id), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
  store.setRuntime(id, { modelli: [{ id: 'modello-uno', nome: 'Lavoro' }] });
  const c = await p.elencaModelli(id);
  assert.equal(c.fonte, 'configurazione'); assert.equal(c.credenzialeVerificata, false);
  assert.equal(c.modelli[0].id, `${id}:modello-uno`); assert.equal(c.modelli[0].nome, 'Lavoro');
  assert.equal(c.modelli[0].toolCalling, 'ignoto'); assert.equal(c.modelli[0].capacita.toolCall, null);
});

test('PKLB-CATALOG-02: Bedrock aggiunge configurati senza duplicati, non copre errori remoti', async () => {
  const store = createProviderCredentialStore({ env: { AWS_BEARER_TOKEN_BEDROCK: 'finta' } });
  store.setRuntime('bedrock', { endpoint: endpoint('bedrock'), modelli: [{ id: 'modello-uno', nome: 'Owner' }, { id: 'modello-due' }] });
  const p = sonda(store, { fetchImpl: async () => Response.json({ data: [{ id: 'modello-uno' }, { id: 'modello-tre' }] }) });
  const c = await p.elencaModelli('bedrock');
  assert.deepEqual(c.modelli.map(m => m.id).sort(), ['bedrock:modello-uno', 'bedrock:modello-due', 'bedrock:modello-tre'].sort());
  assert.equal(c.modelli.find(m => m.id === 'bedrock:modello-due').fonte, 'configurazione');
  assert.equal(c.modelli.find(m => m.id === 'bedrock:modello-due').credenzialeVerificata, false);
  await assert.rejects(sonda(store, { fetchImpl: async () => new Response('', { status: 403 }) }).elencaModelli('bedrock'), { code: 'CATALOG_UPSTREAM_ERROR' });
});

test('PKLB-CATALOG-03: esterno configurato/non configurato senza avviare processi', async t => {
  const f = banco(t), store = createProviderCredentialStore({ env: {} }), p = sonda(store);
  await assert.rejects(p.elencaModelli('esterno'), e => e.code === 'CATALOG_CONFIGURATION_REQUIRED' && e.message === "Configura l'agente esterno in Fornitori e accessi");
  store.setRuntime('esterno', { agente: f.agente });
  const c = await p.elencaModelli('esterno');
  assert.equal(c.modelli.length, 1); assert.equal(c.modelli[0].id, 'esterno:predefinito');
  assert.equal(c.modelli[0].nome, 'Agente esterno'); assert.equal(existsSync(f.diario), false);
  assert.equal((await sonda(createProviderCredentialStore({ env: {} }), { env: { TALOS_AGENTE_ESTERNO: JSON.stringify(f.agente) } }).elencaModelli('esterno')).modelli.length, 1);
});

for (const modo of ['normale', 'versione', 'handshake-fermo']) test(`PKLB-ACP-02 ${modo}: prova initialize e chiusura senza sessione o prompt`, async t => {
  const f = banco(t, modo), store = createProviderCredentialStore({ env: {} });
  store.setRuntime('esterno', { agente: { ...f.agente, timeoutMs: modo === 'handshake-fermo' ? 300 : 2000 } });
  const p = sonda(store), esito = await p.prova('esterno');
  assert.equal(esito.esito, modo === 'normale' ? 'collegato' : 'errore');
  assert.ok(Number.isFinite(esito.millisecondi));
  assert.deepEqual(f.leggi().filter(m => m.method).map(m => m.method), ['initialize']);
  assert.throws(() => process.kill(f.leggi()[0].pid, 0), { code: 'ESRCH' });
  if (modo === 'normale') assert.equal((await p.elencaModelli('esterno')).modelli[0].nome, 'Agente di prova');
});

test('PKLB-HTTP-01: campi nuovi e whitelist, invalidi senza scritture o avvio', async t => {
  const f = banco(t), store = createProviderCredentialStore({ env: {}, runtimeFile: f.runtimeFile }), req = await ascolta(t, store);
  assert.equal((await req('/azure/runtime', { endpoint: endpoint('azure'), timeoutSeconds: 35, modelli: [{ id: 'lavoro' }] })).status, 200);
  assert.equal((await req('/esterno/runtime', { agente: f.agente })).status, 200);
  assert.deepEqual((await req('/esterno/runtime')).data.agente, f.agente);
  for (const [id, body] of [['azure', { modelli: [{ id: '' }] }], ['esterno', { agente: { ...f.agente, comando: 'node' } }], ['azure', { endpoint: endpoint('azure'), timeoutSeconds: 35, altro: 'no' }], ['esterno', { agente: f.agente, endpoint: '' }], ['esterno', { agente: f.agente, modelli: [] }], ['azure', []], ['azure', null]]) {
    const r = await req(`/${id}/runtime`, body); assert.ok([400, 422].includes(r.status), JSON.stringify(r));
  }
  assert.equal(existsSync(f.diario), false);
});

test('PKLB-REG-CINQUANTA: la rotta accetta cinquanta modelli con nome entro i limiti dello store', async t => {
  const store = createProviderCredentialStore({ env: {} }), req = await ascolta(t, store);
  const modelli = Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`.padEnd(200, 'a'), nome: 'Nome leggibile '.padEnd(120, 'à') }));
  const r = await req('/azure/runtime', { modelli });
  assert.equal(r.status, 200); assert.equal(r.data.modelli.length, 50);
});

test('PKLB-HTTP-02: catalogo agente attraversa la rotta anche con catalogoFornitoriFn di produzione', async t => {
  const f = banco(t), store = createProviderCredentialStore({ env: {} });
  store.setRuntime('esterno', { agente: f.agente });
  const req = await ascolta(t, store, { catalogoFornitoriFn: () => assert.fail('Il catalogo remoto non possiede ACP') });
  const c = await req('/esterno/models'); assert.equal(c.status, 200); assert.equal(c.data.modelli[0].id, 'esterno:predefinito');
  assert.equal((await req('/test-inventato/models')).ok, false);
  const r = await req('/esterno/test', {}); assert.equal(r.data.esito, 'collegato');
  assert.deepEqual(f.leggi().filter(m => m.method).map(m => m.method), ['initialize']);
});

test('PKLB-REG-ROUTER: preferenze rilette arrivano al router P-L invariato', async t => {
  const f = banco(t), store = createProviderCredentialStore({ env: {}, runtimeFile: f.runtimeFile });
  store.setRuntime('esterno', { agente: f.agente });
  const riletto = createProviderCredentialStore({ env: {}, runtimeFile: f.runtimeFile });
  const instrada = creaFetchMultiProvider(() => assert.fail('Nessuna rete'), { dipendenze: { leggiChiave: riletto.getKey, leggiRuntime: riletto.getRuntime } });
  const r = await instrada('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'esterno:predefinito', stream: false, messages: [{ role: 'user', content: 'Ciaoo, riprendi da https://esempio.test' }] }) });
  assert.match((await r.json()).choices[0].message.content, /Prima dopo/);
});
