import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createModelsDevCatalog, createProviderModelCatalog, ModelsDevCatalogError } from '../src/model-catalog-models-dev.mjs';
import { loadConfig, ConfigurationError, modelloRichiestaValido } from '../src/config.mjs';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';
import { createModelCatalog } from '../src/model-catalog.mjs';
import { createHttpApp } from '../src/http-app.mjs';

// Fixture sintetica conforme al contratto models.dev esaminato il 12/09/2026.
// I suoi numeri sono dati di prova, non quotazioni da mostrare nel prodotto.
const MODELLO = {
  id: 'modello-prova', name: 'Modello di prova', limit: { context: 128000, output: 8000 },
  cost: { input: 1.2, output: 3.4, cache_read: 0.12, cache_write: 1.5 },
  tool_call: true, reasoning: false, modalities: { input: ['text', 'image'], output: ['text'] },
  release_date: '2026-09-01', last_updated: '2026-09-10',
};
const provider = (id, models = [MODELLO]) => ({ id, name: id, models: Object.fromEntries(models.map(m => [m.id, m])) });
const FIXTURE = {
  deepseek: provider('deepseek', [{ id: 'senza-dati', name: 'Senza dati' }, MODELLO]),
  zai: provider('zai'), google: provider('google'), anthropic: provider('anthropic'), openai: provider('openai'),
  openrouter: provider('openrouter', [{ ...MODELLO, id: 'autore/modello-prova' }]),
  lmstudio: provider('lmstudio'), huggingface: provider('huggingface'),
};
const ORA = Date.parse('2026-09-12T10:00:00Z');
const risposta = (data = FIXTURE, etag = 'W/"prima"') => Response.json(data, { headers: etag ? { ETag: etag } : {} });
const senzaRete = async () => { throw new Error('rete assente con informazioni riservate'); };

test('PF-MD-01 — ogni diretto remoto: rete giù senza copia restituisce riserva datata senza segreti', async t => {
  const { catalogo } = await banco(t, { fetchFn: senzaRete });
  const rotta = createProviderModelCatalog({ catalogo, chiaveConfigurata: () => true });
  for (const id of ['openai', 'deepseek', 'zai', 'anthropic', 'gemini']) {
    const r = await rotta.ottieni(id);
    assert.equal(r.fonte, 'riserva');
    assert.equal(r.motivo, 'catalogo non raggiungibile: elenco di riserva del 12/09/2026');
    assert.ok(r.modelli.length > 0);
    assert.deepEqual(r.modelliDiRiserva, r.modelli);
    assert.equal(r.daCache, false);
    assert.equal(r.aggiornatoAlle, null);
    assert.equal(r.etaCacheMs, null);
    assert.equal(r.credenzialeVerificata, false);
    for (const m of r.modelli) {
      assert.equal(m.catalogo.fonte, 'riserva');
      assert.equal(m.catalogo.motivo, r.motivo);
      assert.equal(m.capacita.toolCall, true);
      assert.equal(m.prezzoPrompt, null);
      assert.equal(m.contextLength, null);
      assert.equal(modelloRichiestaValido(m.id), true);
      assert.ok(m.id.startsWith(`${id}:`));
    }
    assert.doesNotMatch(JSON.stringify(r), /informazioni riservate/);
  }
});

test('PF-MD-02 — recupero dopo rinvio: torna al catalogo senza riserva, anche dopo riavvio', async t => {
  let disponibile = false, ora = ORA;
  const { catalogo, opts } = await banco(t, { clock: () => new Date(ora), retryMs: 1,
    fetchFn: async () => disponibile ? risposta() : senzaRete() });
  const rotta = createProviderModelCatalog({ catalogo, chiaveConfigurata: () => true });
  assert.equal((await rotta.ottieni('deepseek')).fonte, 'riserva');
  disponibile = true; ora += 2;
  const r = await rotta.ottieni('deepseek');
  assert.equal(r.fonte, 'models.dev');
  assert.equal(r.motivo, null);
  assert.equal(r.modelliDiRiserva, undefined);
  assert.equal(r.modelli[0].modelId, 'modello-prova');
  const nuovo = createProviderModelCatalog({ catalogo: createModelsDevCatalog({ ...opts, fetchFn: senzaRete }), chiaveConfigurata: () => true });
  assert.equal((await nuovo.ottieni('deepseek')).fonte, 'models.dev');
});

test('PF-MD-03 — copia valida prioritaria; copia corrotta rifiutata con riserva e avviso', async t => {
  const { catalogo, opts } = await banco(t);
  await catalogo.ottieni('deepseek');
  const crea = () => createProviderModelCatalog({ catalogo: createModelsDevCatalog({ ...opts,
    ttlMs: 1, clock: () => new Date(ORA + 100), fetchFn: senzaRete }), chiaveConfigurata: () => true });
  const copia = await crea().ottieni('deepseek');
  assert.equal(copia.fonte, 'models.dev');
  assert.equal(copia.fallbackRete, true);
  assert.equal(copia.modelliDiRiserva, undefined);
  await writeFile(catalogo.percorsoCache, '{rotto');
  const riserva = await crea().ottieni('deepseek');
  assert.equal(riserva.fonte, 'riserva');
  assert.ok(riserva.avvisi.some(a => a.codice === 'CATALOG_CACHE_CORRUPT'));
});

test('PF-MD-04 — rotta HTTP senza server: 200 con riserva, poi catalogo; senza chiave resta 422', async t => {
  let collegato = true, disponibile = false;
  const { catalogo } = await banco(t, { retryMs: 0, fetchFn: async () => disponibile ? risposta() : senzaRete() });
  const rotta = createProviderModelCatalog({ catalogo, chiaveConfigurata: () => collegato });
  const app = createHttpApp({ staticHandler: async () => null, catalogoFornitoriFn: rotta.ottieni });
  const richiesta = () => new Promise(resolve => {
    let status;
    app({ method: 'GET', url: '/api/v1/providers/deepseek/models', headers: {} }, {
      writeHead(codice) { status = codice; }, end(corpo) { resolve({ status, corpo: JSON.parse(corpo.toString()) }); },
    });
  });
  const giu = await richiesta();
  assert.equal(giu.status, 200);
  assert.equal(giu.corpo.data.fonte, 'riserva');
  disponibile = true;
  const su = await richiesta();
  assert.equal(su.status, 200);
  assert.equal(su.corpo.data.fonte, 'models.dev');
  collegato = false;
  assert.equal((await richiesta()).status, 422);
});

test('PF-MD-05 — HTTP/JSON invalidi senza copia: riserva; catalogo valido vuoto resta fatto esplicito', async t => {
  const { opts } = await banco(t);
  for (const fetchFn of [async () => new Response(null, { status: 503 }), async () => new Response('{rotto')]) {
    const rotta = createProviderModelCatalog({ catalogo: createModelsDevCatalog({ ...opts, fetchFn }), chiaveConfigurata: () => true });
    assert.equal((await rotta.ottieni('deepseek')).fonte, 'riserva');
  }
  const rotta = createProviderModelCatalog({ catalogo: createModelsDevCatalog({ ...opts,
    fetchFn: async () => risposta({ deepseek: provider('deepseek', []) }) }), chiaveConfigurata: () => true });
  const r = await rotta.ottieni('deepseek');
  assert.equal(r.fonte, 'models.dev');
  assert.deepEqual(r.modelli, []);
});

async function banco(t, extra = {}) {
  const cartellaStore = await mkdtemp(join(tmpdir(), 'talos-pe-test-'));
  t.after(() => rm(cartellaStore, { recursive: true, force: true }));
  const opts = { cartellaStore, clock: () => new Date(ORA), fetchFn: async () => risposta(), ...extra };
  return { opts, catalogo: createModelsDevCatalog(opts) };
}

test('PE-01 — fixture: ordine, prefissi e prezzi per milione convertiti una sola volta', async t => {
  const { catalogo } = await banco(t);
  const dati = await catalogo.ottieni('deepseek');
  assert.equal(dati.disponibile, true);
  assert.deepEqual(dati.modelli.map(m => m.id), ['deepseek:modello-prova', 'deepseek:senza-dati']);
  const m = dati.modelli[0];
  assert.equal(m.nome, MODELLO.name);
  assert.equal(m.contextLength, 128000);
  assert.equal(m.maxOutputTokens, 8000);
  assert.equal(m.prezzoPrompt, 1.2 / 1_000_000);
  assert.equal(m.prezzoCompletion, 3.4 / 1_000_000);
  assert.equal(m.prezzoCacheRead, 0.12 / 1_000_000);
  assert.equal(m.prezzoCacheWrite, 1.5 / 1_000_000);
  assert.equal(m.prezziPerMilione.input, 1.2);
  assert.equal(m.prezziPerMilione.valuta, 'USD');
  assert.deepEqual(m.capacita, { toolCall: true, reasoning: false });
  assert.deepEqual(m.inputModalities, ['text', 'image']);
  assert.equal(m.ultimoAggiornamentoFonte, '2026-09-10');
  assert.equal(m.catalogo.aggiornatoAlle, new Date(ORA).toISOString());
  for (const id of ['deepseek', 'zai', 'gemini', 'anthropic', 'openai']) {
    const r = await catalogo.ottieni(id);
    assert.ok(r.modelli.every(m => modelloRichiestaValido(m.id)));
    assert.equal(r.modelsDevId, id === 'gemini' ? 'google' : id);
  }
});

test('PE-02 — assenza non equivale a zero o false; zero pubblicato resta zero', async t => {
  const fixture = structuredClone(FIXTURE);
  fixture.zai.models[MODELLO.id].cost = { input: 0, output: 0, cache_write: 0 };
  const { catalogo } = await banco(t, { fetchFn: async () => risposta(fixture) });
  const m = (await catalogo.ottieni('deepseek')).modelli[1];
  for (const campo of ['contextLength', 'maxOutputTokens', 'prezzoPrompt', 'prezzoCompletion', 'prezzoCacheRead', 'prezzoCacheWrite']) assert.equal(m[campo], null);
  assert.deepEqual(m.capacita, { toolCall: null, reasoning: null });
  assert.equal(m.inputModalities, null);
  assert.equal(m.reasoning, null, 'nessun livello di ragionamento dedotto da un booleano');
  const gratis = (await catalogo.ottieni('zai')).modelli[0];
  assert.equal(gratis.prezzoPrompt, 0);
  assert.equal(gratis.prezzoCacheWrite, 0);
  assert.equal(gratis.prezzoCacheRead, null);
});

test('PE-03 — fasce di contesto e compatibilità context_over_200k conservate', async t => {
  const fixture = structuredClone(FIXTURE);
  fixture.zai.models[MODELLO.id].cost.tiers = [{ tier: { type: 'context', size: 200000 }, input: 2.4, output: 6.8 }];
  fixture.zai.models[MODELLO.id].cost.context_over_200k = { input: 2.4, output: 6.8 };
  const { catalogo } = await banco(t, { fetchFn: async () => risposta(fixture) });
  const m = (await catalogo.ottieni('zai')).modelli[0];
  assert.equal(m.prezziPerMilione.tiers[0].input, 2.4);
  assert.equal(m.prezziPerMilione.tiers[0].tier.size, 200000);
  assert.equal(m.prezziPerMilione.context_over_200k.output, 6.8);
});

test('PE-04 — ETag invariato: 304 senza leggere il corpo né cambiare data del download', async t => {
  let chiamate = 0, ora = ORA;
  const { catalogo } = await banco(t, { clock: () => new Date(ora), fetchFn: async (_, opts) => {
    chiamate++;
    if (chiamate === 1) return risposta();
    assert.equal(opts.headers['If-None-Match'], 'W/"prima"');
    return { status: 304, headers: new Headers({ ETag: '"prima"' }), json() { assert.fail('304 non ha corpo'); } };
  } });
  await catalogo.ottieni('deepseek');
  ora += 5000;
  const r = await catalogo.ottieni('zai', { forzaAggiornamento: true });
  assert.equal(chiamate, 2);
  assert.equal(r.daCache, true);
  assert.equal(r.etaCacheMs, 5000);
  assert.equal(r.aggiornatoAlle, new Date(ORA).toISOString());
  assert.equal(r.verificatoAlle, new Date(ora).toISOString());
  const busta = JSON.parse(await readFile(catalogo.percorsoCache, 'utf8'));
  assert.equal(busta.etag, '"prima"');
});

test('PE-05 — riavvio: copia fresca su disco e ETag persistito senza scaricare di nuovo', async t => {
  const { catalogo, opts } = await banco(t);
  await catalogo.ottieni('deepseek');
  let chiamate = 0;
  const riavviato = createModelsDevCatalog({ ...opts, fetchFn: async (_, options) => {
    chiamate++;
    assert.equal(options.headers['If-None-Match'], 'W/"prima"');
    return new Response(null, { status: 304 });
  } });
  assert.equal((await riavviato.ottieni('deepseek')).daCache, true);
  assert.equal(chiamate, 0);
  await riavviato.ottieni('deepseek', { forzaAggiornamento: true });
  assert.equal(chiamate, 1);
});

test('PE-06 — rete assente: copia vecchia con età misurata e avviso persistente durante il rinvio', async t => {
  const { catalogo, opts } = await banco(t);
  await catalogo.ottieni('deepseek');
  let chiamate = 0;
  const riletto = createModelsDevCatalog({ ...opts, ttlMs: 1, clock: () => new Date(ORA + 86400000), fetchFn: async () => { chiamate++; return senzaRete(); } });
  const r = await riletto.ottieni('deepseek');
  assert.equal(r.etaCacheMs, 86400000);
  assert.equal(r.fallbackRete, true);
  assert.equal(r.daCache, true);
  assert.match(r.avvisi[0].messaggio, /copia salvata/iu);
  assert.doesNotMatch(JSON.stringify(r), /informazioni riservate/);
  assert.equal((await riletto.ottieni('zai')).fallbackRete, true);
  assert.equal(chiamate, 1);
});

test('PE-07 — cache corrotta: JSON invalido, forma errata e impronta alterata rifiutati esplicitamente', async t => {
  const { catalogo, opts } = await banco(t);
  await catalogo.ottieni('deepseek');
  const busta = JSON.parse(await readFile(catalogo.percorsoCache, 'utf8'));
  const malformata = { ...busta, dati: { deepseek: { id: 'deepseek', models: [] } } };
  malformata.sha256 = createHash('sha256').update(JSON.stringify(malformata.dati)).digest('hex');
  for (const testo of ['{rotto', JSON.stringify(malformata), JSON.stringify({ ...busta, sha256: '0'.repeat(64) })]) {
    await writeFile(catalogo.percorsoCache, testo);
    const nuovo = createModelsDevCatalog({ ...opts, fetchFn: senzaRete });
    await assert.rejects(nuovo.ottieni('deepseek'), e => e instanceof ModelsDevCatalogError && e.code === 'CATALOG_CACHE_CORRUPT' && /rifiutata/iu.test(e.message));
  }
});

test('PE-08 — recupero dalla copia corrotta: nessun If-None-Match, rifiuto dichiarato anche dopo 200', async t => {
  const { catalogo, opts } = await banco(t);
  await catalogo.ottieni('deepseek');
  await writeFile(catalogo.percorsoCache, '{}');
  const nuovo = createModelsDevCatalog({ ...opts, fetchFn: async (_, options) => {
    assert.equal(options.headers['If-None-Match'], undefined);
    return risposta();
  } });
  const r = await nuovo.ottieni('deepseek');
  assert.equal(r.disponibile, true);
  assert.ok(r.avvisi.some(a => a.codice === 'CATALOG_CACHE_CORRUPT'));
});

test('PE-09 — risposta errata non sovrascrive la copia valida; tipi e identità non sono coerciti', async t => {
  const { catalogo, opts } = await banco(t);
  await catalogo.ottieni('deepseek');
  const prima = await readFile(catalogo.percorsoCache, 'utf8');
  for (const modifica of [f => { f.deepseek.models[MODELLO.id].cost.input = '1.2'; }, f => { f.deepseek.models[MODELLO.id].tool_call = 'false'; }, f => { f.deepseek.models[MODELLO.id].id = 'altro'; }, f => { f.deepseek.models[MODELLO.id].cost.input = -1; }]) {
    const fixture = structuredClone(FIXTURE); modifica(fixture);
    const nuovo = createModelsDevCatalog({ ...opts, fetchFn: async () => risposta(fixture) });
    const r = await nuovo.ottieni('deepseek', { forzaAggiornamento: true });
    assert.equal(r.fallbackRete, true);
    assert.equal(r.modelli[0].prezziPerMilione.input, 1.2);
    assert.equal(await readFile(catalogo.percorsoCache, 'utf8'), prima);
  }
});

test('PE-10 — mappa completa; non esiste non è un registro rotto né un modello inventato', async t => {
  assert.deepEqual(Object.fromEntries(Object.entries(REGISTRO_FORNITORI).map(([id, r]) => [id, r.modelsDevId])), {
    openai: 'openai', deepseek: 'deepseek', zai: 'zai', anthropic: 'anthropic', gemini: 'google', openrouter: 'openrouter',
    ollama: null, lmstudio: 'lmstudio', huggingface: 'huggingface', local: null,
    groq: 'groq', cerebras: 'cerebras', mistral: 'mistral', together: 'togetherai', fireworks: 'fireworks-ai',
    deepinfra: 'deepinfra', novita: 'novita-ai', nebius: 'nebius', xai: 'xai', 'ollama-cloud': 'ollama-cloud',
    kimi: 'moonshotai', minimax: 'minimax', qwen: 'alibaba',
    'zai-anthropic': 'zai-coding-plan', 'minimax-anthropic': 'minimax', // P-J: le porte Anthropic (12/09)
    azure: null, bedrock: null, vertex: null, // P-K: i cataloghi cloud dipendono dal collegamento dell'owner, non da models.dev
  });
  const { catalogo } = await banco(t, { fetchFn: async () => assert.fail('nessun fetch senza mappa') });
  for (const id of ['ollama', 'local', 'inesistente', '__proto__']) {
    const r = await catalogo.ottieni(id);
    assert.equal(r.disponibile, false);
    assert.match(r.motivo, /catalogo.*non disponibile/iu);
    assert.deepEqual(r.modelli, []);
  }
  assert.equal(verificaRegistro(), true);
});

test('PE-11 — richieste simultanee condividono un solo download', async t => {
  let chiamate = 0;
  const { catalogo } = await banco(t, { fetchFn: async () => { chiamate++; await new Promise(r => setImmediate(r)); return risposta(); } });
  const risultati = await Promise.all(['deepseek', 'zai', 'gemini'].map(id => catalogo.ottieni(id)));
  assert.equal(chiamate, 1);
  assert.ok(risultati.every(r => r.modelli.length));
});

test('PE-12 — URL differenti non condividono copia né ETag', async t => {
  const { catalogo, opts } = await banco(t);
  await catalogo.ottieni('deepseek');
  const mirror = createModelsDevCatalog({ ...opts, url: 'https://catalogo.example.test/api.json', fetchFn: async (url, options) => {
    assert.equal(url, 'https://catalogo.example.test/api.json');
    assert.equal(options.headers['If-None-Match'], undefined);
    return risposta();
  } });
  assert.notEqual(mirror.percorsoCache, catalogo.percorsoCache);
  assert.equal((await mirror.ottieni('zai')).daCache, false);
});

test('PE-13 — funzione per la rotta: chiave controllata prima del catalogo, mai inviata alla fonte', async t => {
  let chiamate = 0, collegato = false;
  const { catalogo } = await banco(t, { fetchFn: async (_, opts) => {
    chiamate++;
    assert.deepEqual(Object.keys(opts.headers), ['Accept']);
    assert.equal(opts.credentials, 'omit');
    return risposta();
  } });
  const rotta = createProviderModelCatalog({ catalogo, chiaveConfigurata: async () => collegato });
  await assert.rejects(rotta.ottieni('deepseek'), e => e.code === 'PROVIDER_KEY_REQUIRED');
  assert.equal(chiamate, 0);
  collegato = true;
  assert.equal((await rotta.ottieni('deepseek')).modelli[0].id, 'deepseek:modello-prova');
  assert.equal(chiamate, 1);
  collegato = false;
  await assert.rejects(rotta.ottieni('deepseek'), e => e.code === 'PROVIDER_KEY_REQUIRED');
});

test('PE-14 — URL configurabile coerente, HTTP(S) senza credenziali; cartella dati rispettata', async t => {
  const config = loadConfig({});
  assert.equal(config.modelsDevUrl, 'https://models.dev/api.json');
  assert.equal(loadConfig({ TALOS_HARNESS_UI_MODELS_DEV_URL: ' https://esempio.test/api.json ' }).modelsDevUrl, 'https://esempio.test/api.json');
  for (const url of ['file:///cache.json', 'https://utente:segreto@esempio.test/api.json', 'errore', 'https://esempio.test/api.json#parte']) {
    assert.throws(() => loadConfig({ TALOS_HARNESS_UI_MODELS_DEV_URL: url }), ConfigurationError);
  }
  const { catalogo, opts } = await banco(t);
  assert.ok(catalogo.percorsoCache.startsWith(join(opts.cartellaStore, 'cache')));
});

test('PE-15 — OpenRouter conserva catalogo e prezzi per token; la mappa non aggiunge un prefisso', async t => {
  const { catalogo } = await banco(t);
  assert.equal((await catalogo.ottieni('openrouter')).modelli[0].id, 'autore/modello-prova');
  const openrouter = createModelCatalog({ fetchFn: async () => Response.json({ data: [{ id: '~autore/modello', name: 'Nome', pricing: { prompt: '0.0000012' } }] }) });
  const r = await openrouter.ottieni();
  assert.equal(r.modelli[0].id, '~autore/modello');
  assert.equal(r.modelli[0].provider, 'autore');
  assert.equal(r.modelli[0].prezzoPrompt, '0.0000012');
});

test('PE-16 — senza copia: errori HTTP/JSON/304 sono dichiarati, mai successo vuoto', async t => {
  const { opts } = await banco(t);
  for (const fetchFn of [senzaRete, async () => new Response(null, { status: 503 }), async () => new Response('{rotto'), async () => new Response(null, { status: 304 }), async () => risposta({})]) {
    const c = createModelsDevCatalog({ ...opts, fetchFn });
    await assert.rejects(c.ottieni('deepseek'), ModelsDevCatalogError);
  }
});

test('PE-16b — scrittura disco fallita: dati vivi utilizzabili, persistenza dichiarata indisponibile', async t => {
  const { catalogo } = await banco(t, { fsImpl: { writeFile: async () => { throw new Error('disco pieno'); } } });
  const r = await catalogo.ottieni('deepseek');
  assert.equal(r.disponibile, true);
  assert.ok(r.avvisi.some(a => a.codice === 'CATALOG_CACHE_WRITE_FAILED'));
});

test('PE-17 / PG-REG-HF-CATALOGO — locali non diventano installati; Hugging Face chat richiede la chiave', async t => {
  const { catalogo } = await banco(t);
  const rotta = createProviderModelCatalog({ catalogo, chiaveConfigurata: () => true });
  for (const id of ['lmstudio', 'ollama', 'local', 'openrouter']) {
    await assert.rejects(rotta.ottieni(id), e => e.code === 'REPORT_UNAVAILABLE');
  }
  assert.equal((await catalogo.ottieni('lmstudio')).modelli[0].contestoVerificato, false);
  assert.equal((await rotta.ottieni('huggingface')).provider, 'huggingface');
  const senzaChiave = createProviderModelCatalog({ catalogo, chiaveConfigurata: () => false });
  await assert.rejects(senzaChiave.ottieni('huggingface'), { code: 'PROVIDER_KEY_REQUIRED' });
});

test('PE-18 — fornitore mappato assente dalla fonte: indisponibilità esplicita e chiave non accusata', async t => {
  const { catalogo } = await banco(t, { fetchFn: async () => risposta({ deepseek: FIXTURE.deepseek }) });
  const r = await catalogo.ottieni('zai');
  assert.equal(r.disponibile, false);
  assert.match(r.motivo, /Catalogo Z\.AI non disponibile/);
  const rotta = createProviderModelCatalog({ catalogo, chiaveConfigurata: () => true });
  await assert.rejects(rotta.ottieni('zai'), e => e.code === 'CATALOG_UPSTREAM_ERROR');
});

test('PE-19 — modificare un risultato non altera i prezzi della copia condivisa', async t => {
  const { catalogo } = await banco(t);
  const r = await catalogo.ottieni('deepseek');
  r.modelli[0].prezziPerMilione.input = 999;
  assert.equal((await catalogo.ottieni('deepseek')).modelli[0].prezziPerMilione.input, 1.2);
});

test('PE-20 — senza copia il rinvio evita richieste ripetute; aggiornamento forzato riprova', async t => {
  let chiamate = 0;
  const { catalogo } = await banco(t, { fetchFn: async () => { chiamate++; return senzaRete(); } });
  await assert.rejects(catalogo.ottieni('deepseek'));
  await assert.rejects(catalogo.ottieni('zai'));
  assert.equal(chiamate, 1);
  await assert.rejects(catalogo.ottieni('zai', { forzaAggiornamento: true }));
  assert.equal(chiamate, 2);
});

test('PE-21 — rotta HTTP reale in memoria: 422 senza chiave, 200 coi prezzi, 503 senza catalogo', async t => {
  let collegato = false;
  const { catalogo } = await banco(t, { fetchFn: async () => risposta({ deepseek: FIXTURE.deepseek }) });
  const rotta = createProviderModelCatalog({ catalogo, chiaveConfigurata: () => collegato });
  const app = createHttpApp({ staticHandler: async () => null, providerProbe: { elencaModelli: rotta.ottieni } });
  const richiesta = provider => new Promise(resolve => {
    let status;
    app({ method: 'GET', url: `/api/v1/providers/${provider}/models`, headers: {} }, {
      writeHead(codice) { status = codice; },
      end(corpo) { resolve({ status, corpo: JSON.parse(corpo.toString()) }); },
    });
  });
  assert.equal((await richiesta('deepseek')).status, 422);
  collegato = true;
  const successo = await richiesta('deepseek');
  assert.equal(successo.status, 200);
  assert.equal(successo.corpo.data.modelli[0].prezziPerMilione.input, 1.2);
  assert.equal(successo.corpo.data.credenzialeVerificata, false);
  const assente = await richiesta('zai');
  assert.equal(assente.status, 503);
  assert.equal(assente.corpo.error.code, 'CATALOG_UPSTREAM_ERROR');
});
