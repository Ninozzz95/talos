// Decisione 193, punto 1 (owner 04/11/2026 19:41): «se un fornitore a valle perde la cache due volte nella stessa sessione, la sessione
// lo evita e passa a un altro». Forma: in-corso/FORMA-CACHE-193-194-2026-11-04.md.
// Misura che l'ha fatta nascere (RAPPORTO-CACHE-183): lo stesso corpo su Particle AI ha riletto 0, 0, 39168, 39168, 39168, 0 token;
// su Wafer 99,6-99,9% a ogni risveglio. Il nucleo conta le perdite `persa-dal-fornitore` per modello e fornitore nello stato della
// cache (che passa fra i giri), e alla seconda mette lo slug in `provider.ignore` (OpenRouter, «Provider routing»: «List of provider
// slugs to skip for this request», letta il 04/11/2026), solo se resta almeno un altro fornitore e solo verso OpenRouter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { talosLavora, modelloDiOpenRouter, contaPerditaDelFornitore } from '../src/kernel/talosHarness.mjs';
import { unisciInstradamento } from '../src/runtime-owner-adapter.mjs';
import { testoUscitaSfondo } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MODELLO = 'deepseek/deepseek-v4.1-flash-1017';
const DUE_FORNITORI = [{ provider_name: 'Particle AI', tag: 'particle-ai/fp8' }, { provider_name: 'Wafer', tag: 'wafer' }];

/**
 * Un OpenRouter finto. Le richieste di chat annotano il corpo e dicono chi ha servito (`provider`) e quanto è stato riletto
 * (`cached_tokens`); tutte tranne l'ultima chiamano un attrezzo, così un giro solo fa più richieste. Gli endpoint del modello
 * rispondono con `endpoints` (lo schema `PublicEndpoint`: `provider_name`, `tag`). `rifiutaIgnore`: un 404 quando il corpo porta
 * un `ignore` (nessun fornitore rimasto).
 */
function openRouter({ cache = [], chi = [], corpi = [], chiamateEndpoint = [], endpoints = DUE_FORNITORI, rifiutaIgnore = false } = {}) {
  let n = 0;
  return async (url, init) => {
    if (String(url).includes('/endpoints')) { chiamateEndpoint.push(String(url)); return Response.json({ data: { endpoints } }); }
    const corpo = JSON.parse(String(init?.body));
    corpi.push(corpo);
    if (rifiutaIgnore && Array.isArray(corpo?.provider?.ignore) && corpo.provider.ignore.length) {
      return Response.json({ error: { code: 404, message: 'No endpoints found matching your data policy and provider preferences.' } }, { status: 404 });
    }
    n += 1;
    const ultimo = n >= cache.length;
    const messaggio = ultimo
      ? { role: 'assistant', content: 'fatto' }
      : { role: 'assistant', content: null, tool_calls: [{ id: `k${n}`, type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] };
    return Response.json({ provider: chi[n - 1] ?? chi.at(-1), choices: [{ message: messaggio, finish_reason: ultimo ? 'stop' : 'tool_calls' }],
      usage: { prompt_tokens: 40_000, completion_tokens: 3, prompt_tokens_details: { cached_tokens: cache[n - 1] ?? 0 } } });
  };
}
async function giro(t, opzioni) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-cache-193-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  const esito = await talosLavora({ cartella, task: { consegna: 'elenca' }, modello: MODELLO, chiave: 'k',
    onGiro: (e) => { if (e?.tipo === 'cache-ricominciata' || e?.tipo === 'fornitore-evitato') eventi.push(e); }, ...opzioni });
  return { esito, eventi };
}
const risveglio = (messaggiFinali) => [...messaggiFinali,
  { role: 'user', content: testoUscitaSfondo({ comando: 'npm run build', esito: 'riuscito', codice: 0 }), talosOrigin: 'background-notice' }];
const ignoreDi = (corpo) => corpo?.provider?.ignore ?? null;

test('CACHE-193-01 — due perdite dallo stesso fornitore, nello stesso giro: dalla richiesta dopo il corpo porta il suo slug in provider.ignore', async (t) => {
  const corpi = [];
  const chiamateEndpoint = [];
  // letti, persi (1), letti, persi (2), poi la richiesta che deve evitarlo
  const r = await giro(t, { fetchDiRete: openRouter({ cache: [0, 4_000, 0, 4_000, 0, 0], chi: ['Particle AI'], corpi, chiamateEndpoint }) });
  assert.equal(corpi.length, 6);
  assert.deepEqual(r.eventi.filter((e) => e.tipo === 'cache-ricominciata').map((e) => e.motivo), ['persa-dal-fornitore', 'persa-dal-fornitore'],
    'premessa (183): le due perdite hanno il nome vero');
  for (const corpo of corpi.slice(0, 5)) assert.equal(ignoreDi(corpo), null, 'prima della seconda perdita nessun fornitore si evita');
  assert.deepEqual(ignoreDi(corpi[5]), ['particle-ai'], 'lo slug di BASE, letto dagli endpoint del modello (mai indovinato dal nome)');
  assert.equal(chiamateEndpoint.length, 1, 'gli endpoint si leggono una volta, alla seconda perdita');
  assert.match(chiamateEndpoint[0], /\/api\/v1\/models\/deepseek\/deepseek-v4\.1-flash-1017\/endpoints$/u);
  const evitato = r.eventi.find((e) => e.tipo === 'fornitore-evitato');
  assert.deepEqual(evitato && { fornitore: evitato.fornitore, slug: evitato.slug, modello: evitato.modello, escluso: evitato.escluso, volte: evitato.volte },
    { fornitore: 'Particle AI', slug: 'particle-ai', modello: MODELLO, escluso: true, volte: 2 });
  assert.deepEqual(r.esito.statoCache?.fornitoriEvitati?.[MODELLO]?.map((f) => f.slug), ['particle-ai'], 'lo stato della cache lo porta al giro dopo');
});

test('CACHE-193-02 — la sessione: una perdita al primo risveglio e una al secondo, in due giri, bastano; il terzo risveglio lo evita', async (t) => {
  const corpi = [];
  const a = await giro(t, { fetchDiRete: openRouter({ cache: [0, 4_000], chi: ['Particle AI'], corpi }) });
  const b = await giro(t, { fetchDiRete: openRouter({ cache: [0, 4_000], chi: ['Particle AI'], corpi }), statoCachePrecedente: a.esito.statoCache,
    messaggiIniziali: risveglio(a.esito.messaggiFinali) });
  const c = await giro(t, { fetchDiRete: openRouter({ cache: [0], chi: ['Particle AI'], corpi }), statoCachePrecedente: b.esito.statoCache,
    messaggiIniziali: risveglio(b.esito.messaggiFinali) });
  const d = await giro(t, { fetchDiRete: openRouter({ cache: [0], chi: ['Wafer'], corpi }), statoCachePrecedente: c.esito.statoCache,
    messaggiIniziali: risveglio(c.esito.messaggiFinali) });
  assert.deepEqual([...b.eventi, ...c.eventi].filter((e) => e.tipo === 'cache-ricominciata').map((e) => e.motivo), ['persa-dal-fornitore', 'persa-dal-fornitore']);
  assert.deepEqual(ignoreDi(corpi.at(-1)), ['particle-ai'], 'il quarto giro parte già senza Particle AI');
  assert.equal(d.eventi.filter((e) => e.tipo === 'fornitore-evitato').length, 0, 'l\'evento esce una volta sola, quando si decide');
});

test('CACHE-193-03 — al contrario: una perdita sola, una «pausa» o un cambio di fornitore non contano', async (t) => {
  const corpi = [];
  await giro(t, { fetchDiRete: openRouter({ cache: [0, 4_000, 0, 0], chi: ['Particle AI'], corpi }) });
  assert.ok(corpi.every((c) => ignoreDi(c) === null), 'una perdita sola non basta');
  const cambi = [];
  // ogni «perdita» qui è un cambio di chi serve: motivo «fornitore», non conta contro nessuno
  await giro(t, { fetchDiRete: openRouter({ cache: [0, 4_000, 0, 4_000, 0, 0], chi: ['Particle AI', 'Particle AI', 'Wafer', 'Wafer', 'Particle AI', 'Particle AI'], corpi: cambi }) });
  assert.ok(cambi.every((c) => ignoreDi(c) === null), 'un cambio di fornitore è un fatto di OpenRouter, non una perdita del fornitore');
});

test('CACHE-193-04 — se resta un solo fornitore non si esclude: l\'evento lo dice, il corpo resta com\'è', async (t) => {
  const corpi = [];
  const r = await giro(t, { fetchDiRete: openRouter({ cache: [0, 4_000, 0, 4_000, 0, 0], chi: ['Particle AI'], corpi,
    endpoints: [{ provider_name: 'Particle AI', tag: 'particle-ai/fp8' }] }) });
  assert.ok(corpi.every((c) => ignoreDi(c) === null), 'mai `ignore` sull\'unico fornitore del modello');
  const evitato = r.eventi.find((e) => e.tipo === 'fornitore-evitato');
  assert.deepEqual(evitato && { escluso: evitato.escluso, motivo: evitato.motivo }, { escluso: false, motivo: 'unico-fornitore' });
});

test('CACHE-193-05 — una via diretta non riceve mai il campo `provider` né la lettura degli endpoint', async (t) => {
  const corpi = [];
  const chiamateEndpoint = [];
  await giro(t, { modello: 'deepseek:deepseek-v4-flash', fetchDiRete: openRouter({ cache: [0, 4_000, 0, 4_000, 0, 0], chi: ['Particle AI'], corpi, chiamateEndpoint }) });
  assert.ok(corpi.every((c) => !Object.hasOwn(c, 'provider')), 'un compatibile di terzi potrebbe rifiutare un campo che non conosce');
  assert.equal(chiamateEndpoint.length, 0);
  /* anche un id di una via diretta CON la barra (LM Studio: «qwen/qwen3-4b») non conta perdite: non è un fornitore di OpenRouter */
  const conBarra = await giro(t, { modello: 'lmstudio:qwen/qwen3-4b', fetchDiRete: openRouter({ cache: [0, 4_000, 0, 4_000, 0, 0], chi: ['Particle AI'], corpi, chiamateEndpoint }) });
  assert.equal(conBarra.esito.statoCache?.perditeDelFornitore, undefined, 'nessuna perdita contata fuori da OpenRouter');
  assert.equal(chiamateEndpoint.length, 0);
});

test('CACHE-193-11 — chi va a OpenRouter: un id con la barra, senza via o con `openrouter:`; mai una via diretta né un id senza barra', () => {
  for (const si of ['deepseek/deepseek-v4.1-flash-1017', 'openrouter:deepseek/deepseek-v4.1-flash-1017', 'openrouter:z-ai/glm-5.3-flash']) assert.equal(modelloDiOpenRouter(si), true, si);
  for (const no of ['deepseek:deepseek-v4-flash', 'lmstudio:qwen/qwen3-4b', 'zai:glm-5.3-flash', 'gpt-5', 'openrouter:', '', null, 3]) assert.equal(modelloDiOpenRouter(no), false, String(no));
});

const PARTICLE = { provider_name: 'Particle AI', tag: 'particle-ai/fp8' };
const WAFER = { provider_name: 'Wafer', tag: 'wafer' };
const endpointFinti = (endpoints, chiamate = []) => async (url) => { chiamate.push(String(url)); return Response.json({ data: { endpoints } }); };
test('CACHE-193-12 — il conto delle perdite, da solo: decisione presa una volta, sessione che non evita più, nome con due slug, gli evitati di prima contano', async () => {
  const M = MODELLO;
  // la sessione ha smesso di evitare per questo modello (dopo un 404): le perdite non si contano più
  const smesso = { senzaEvitare: [M] };
  const chiamate = [];
  assert.equal(await contaPerditaDelFornitore(smesso, { modello: M, fornitore: 'Particle AI', fetchDiRete: endpointFinti([PARTICLE, WAFER], chiamate) }), smesso);
  assert.equal(chiamate.length, 0);
  // già deciso: la terza perdita conta ma non rilegge gli endpoint e non avvisa di nuovo
  const deciso = { perditeDelFornitore: { [M]: { 'Particle AI': { volte: 2, deciso: true } } }, fornitoriEvitati: { [M]: [{ slug: 'particle-ai', fornitore: 'Particle AI' }] } };
  const avvisi = [];
  const terza = await contaPerditaDelFornitore(deciso, { modello: M, fornitore: 'Particle AI', fetchDiRete: endpointFinti([PARTICLE, WAFER], chiamate), avvisa: (e) => avvisi.push(e) });
  assert.equal(chiamate.length, 0, 'gli endpoint non si rileggono');
  assert.equal(avvisi.length, 0, 'l\'evento esce una volta sola');
  assert.equal(terza.perditeDelFornitore[M]['Particle AI'].volte, 3);
  // un nome che porta a due slug di base diversi: non si indovina
  const due = { perditeDelFornitore: { [M]: { 'Particle AI': { volte: 1, deciso: false } } } };
  const doppio = [];
  const r = await contaPerditaDelFornitore(due, { modello: M, fornitore: 'Particle AI', fetchDiRete: endpointFinti([PARTICLE, { provider_name: 'Particle AI', tag: 'particle/us' }, WAFER]), avvisa: (e) => doppio.push(e) });
  assert.deepEqual(doppio.map((e) => [e.escluso, e.motivo, e.slug]), [[false, 'slug-sconosciuto', null]]);
  assert.equal(r.fornitoriEvitati, undefined);
  // Particle AI è già evitato; ora perde Wafer, e senza Particle AI resterebbe nessuno: non si esclude
  const unico = [];
  const w = await contaPerditaDelFornitore({ ...deciso, perditeDelFornitore: { [M]: { ...deciso.perditeDelFornitore[M], Wafer: { volte: 1, deciso: false } } } },
    { modello: M, fornitore: 'Wafer', fetchDiRete: endpointFinti([PARTICLE, WAFER]), avvisa: (e) => unico.push(e) });
  assert.deepEqual(unico.map((e) => [e.escluso, e.motivo, e.slug]), [[false, 'unico-fornitore', 'wafer']]);
  assert.deepEqual(w.fornitoriEvitati[M].map((f) => f.slug), ['particle-ai'], 'gli evitati di prima restano, Wafer non si aggiunge');
});

test('CACHE-193-06 — rete di sicurezza: un 404 «nessun fornitore» su un ignore messo dal nucleo riprova una volta senza, e la sessione smette di evitare', async (t) => {
  const corpi = [];
  const r = await giro(t, { fetchDiRete: openRouter({ cache: [0, 4_000, 0, 4_000, 0, 0], chi: ['Particle AI'], corpi, rifiutaIgnore: true }) });
  const conIgnore = corpi.findIndex((c) => Array.isArray(ignoreDi(c)));
  assert.ok(conIgnore > 0, 'premessa: il nucleo ha provato a evitarlo');
  assert.equal(ignoreDi(corpi[conIgnore + 1]), null, 'la richiesta dopo il 404 parte senza gli evitati');
  assert.equal(r.esito.comeFinita, 'concluso', 'il giro non muore per una scelta automatica');
  assert.equal(r.esito.statoCache?.fornitoriEvitati?.[MODELLO]?.length ?? 0, 0, 'per questo modello non si evita più');
});

test('CACHE-193-07 — vale per modello: cambiato il modello, gli evitati del modello di prima non partono', async (t) => {
  const corpi = [];
  const a = await giro(t, { fetchDiRete: openRouter({ cache: [0, 4_000, 0, 4_000, 0, 0], chi: ['Particle AI'], corpi }) });
  assert.deepEqual(ignoreDi(corpi.at(-1)), ['particle-ai'], 'premessa');
  const altri = [];
  await giro(t, { modello: 'z-ai/glm-5.3-flash', fetchDiRete: openRouter({ cache: [0], chi: ['Particle AI'], corpi: altri }), statoCachePrecedente: a.esito.statoCache,
    messaggiIniziali: risveglio(a.esito.messaggiFinali) });
  assert.equal(ignoreDi(altri[0]), null);
});

test('CACHE-193-08 — la scelta della persona vince: un fornitore nel suo `order` o `only` per il modello non si esclude in automatico', () => {
  assert.deepEqual(unisciInstradamento({ ignore: ['particle-ai'] }, { order: ['particle-ai', 'wafer'] }).ignore ?? [], []);
  assert.deepEqual(unisciInstradamento({ ignore: ['particle-ai'] }, { only: ['particle-ai'] }).ignore ?? [], []);
  // al contrario: un ignore della persona resta, e uno del nucleo su un fornitore che la persona non ha nominato resta
  assert.deepEqual(unisciInstradamento({ ignore: ['particle-ai'] }, { ignore: ['deepinfra'] }).ignore, ['particle-ai', 'deepinfra']);
  assert.deepEqual(unisciInstradamento({ ignore: ['particle-ai'] }, { order: ['wafer'] }).ignore, ['particle-ai']);
  // condizione della CLI (04/11): si confronta lo slug di BASE, nei due versi
  assert.deepEqual(unisciInstradamento({ ignore: ['deepinfra/fp8'] }, { order: ['deepinfra'] }).ignore ?? [], []);
  assert.deepEqual(unisciInstradamento({ ignore: ['deepinfra'] }, { only: ['deepinfra/fp8'] }).ignore ?? [], []);
  assert.deepEqual(unisciInstradamento({ ignore: ['deepinfra/fp8', 'particle-ai'] }, { order: ['DeepInfra'] }).ignore, ['particle-ai']);
});

/* Una riserva su un altro fornitore rifà la chiamata del nucleo con un altro modello: l'adattatore toglie `provider` fuori da OpenRouter. */
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
async function corpoSpedito(modello) {
  let corpo = null;
  const custodia = new Map();
  const providerStore = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'sk-or-finta', DEEPSEEK_API_KEY: 'sk-ds-finta' },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } } });
  const adapter = createOwnerRuntimeAdapter({ modulePath: 'C:/fixture/runtime.mjs', providerStore,
    destinazioneModelloDeps: { leggiChiave: (p) => { try { return providerStore.getKey(p); } catch { return null; } }, leggiRuntime: (p) => { try { return providerStore.getRuntime(p); } catch { return {}; } } },
    importFn: async () => ({ talosLavora: (input) => input.fetchDiRete('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
      body: JSON.stringify({ model: modello, messages: [{ role: 'user', content: 'ciao' }], provider: { ignore: ['particle-ai'] } }) }) }) });
  await adapter.talosLavora({ contextHooks: {}, checkpointSessionId: 'sessione-193',
    fetchDiRete: async (_url, init) => { corpo = JSON.parse(init.body); return Response.json({ id: 'x', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 1 } }); } });
  return corpo;
}
test('CACHE-193-09 — l\'adattatore: `provider` parte solo verso OpenRouter (una riserva su un altro fornitore non lo riceve)', async () => {
  assert.equal(Object.hasOwn(await corpoSpedito('deepseek:deepseek-v4-flash'), 'provider'), false);
  assert.deepEqual((await corpoSpedito(MODELLO)).provider?.ignore, ['particle-ai'], 'al contrario: verso OpenRouter resta');
});

test('CACHE-193-10 — il servizio: `talos.fornitore-evitato` con lo stesso runId e giro di `talos.cache-ricominciata` che l\'ha deciso', async (t) => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const cartella = mkdtempSync(join(tmpdir(), 'talos-cache-193-servizio-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  await avviaSessione({ cartella, task: { consegna: 'elenca' }, modello: MODELLO, chiave: 'k', onEvento: (e) => eventi.push(e),
    talosLavoraFn: (opts) => talosLavora({ ...opts, fetchDiRete: openRouter({ cache: [0, 4_000, 0, 4_000, 0, 0], chi: ['Particle AI'] }) }) });
  const evitato = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.fornitore-evitato');
  assert.equal(evitato.length, 1);
  const ultimaPerdita = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.cache-ricominciata').at(-1);
  const { at, ...resto } = evitato[0].value;
  assert.deepEqual(resto, { schema: 'talos.fornitore-evitato.v1', threadId: ultimaPerdita.value.threadId, runId: ultimaPerdita.value.runId, giro: ultimaPerdita.value.giro,
    modello: MODELLO, fornitore: 'Particle AI', slug: 'particle-ai', escluso: true, volte: 2 });
  assert.equal(typeof at, 'string');
});
