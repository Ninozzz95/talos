/*
 * ⛔ Decisione 14 dell'owner (08/10/2026 sera) — CHI HA RISPOSTO DAVVERO, E CHI NON DEVE PIÙ RISPONDERE.
 *   Giro dal vivo dell'08/10: OpenRouter ha fatturato come risposta normale un testo «Your quota is exhausted… VIP.aaa USDT»,
 *   e niente diceva quale fornitore a valle l'aveva servita. Niente euristiche sul testo (regola della casa): si legge il campo
 *   `provider` che OpenRouter mette in ogni risposta (Hermes `agent/turn_usage.py:194-204`, `upstream=`), e la persona può
 *   escludere un fornitore (`provider.ignore`, docs OpenRouter «Provider Routing», 08/10; Hermes `providers_ignored`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as kernel from '../src/kernel/talosHarness.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { creaFetchMultiProvider, creaFetchOpenRouterResiliente, unisciEsclusi } from '../src/runtime-owner-adapter.mjs';
import { slugDelFornitore } from '../src/openrouter-fornitori.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { talosLavora, consumaFlussoSSE, chiamaConRitenta } = kernel;
const enc = new TextEncoder();
function flusso(fotogrammi, intestazioni = {}) {
  return new Response(new ReadableStream({
    start(c) {
      for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  }), { headers: { 'content-type': 'text/event-stream', ...intestazioni } });
}
const conFornitore = (provider, f) => ({ ...f, provider });
const testo = (t) => ({ id: 'gen-1', choices: [{ delta: { content: t } }] });
const fine = { choices: [{ delta: {}, finish_reason: 'stop' }] };

test('FAV-01 — il lettore del flusso tiene il fornitore a valle; un flusso senza il campo non porta niente di nuovo', async () => {
  const esito = await consumaFlussoSSE(flusso([conFornitore('DeepInfra', testo('ciao')), conFornitore('DeepInfra', fine)]), () => {});
  assert.equal(esito.fornitoreAValle, 'DeepInfra');
  // il primo nome vince (OpenRouter lo ripete in ogni pacchetto della stessa risposta); caratteri di controllo e spazi via
  const sporco = await consumaFlussoSSE(flusso([conFornitore(`  Chutes${String.fromCharCode(7)} `, testo('a')), conFornitore('Altro', fine)]), () => {});
  assert.equal(sporco.fornitoreAValle, 'Chutes');
  // al contrario: nessun `provider` (un fornitore diretto, il motore locale) ⇒ il campo non c'è proprio
  const senza = await consumaFlussoSSE(flusso([testo('ciao'), fine]), () => {});
  assert.equal(Object.hasOwn(senza, 'fornitoreAValle'), false);
  for (const strano of [42, null, '', '   ', { nome: 'x' }]) {
    assert.equal(Object.hasOwn(await consumaFlussoSSE(flusso([conFornitore(strano, testo('a')), fine]), () => {}), 'fornitoreAValle'), false, JSON.stringify(strano));
  }
});

test('FAV-02 — anche senza streaming (risposta JSON intera) il fornitore a valle arriva', async () => {
  const r = await chiamaConRitenta({ modello: 'x/y', chiave: 'k', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [],
    fetchDiRete: async () => new Response(JSON.stringify({ provider: 'Novita', choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }),
      { headers: { 'content-type': 'application/json' } }) });
  assert.equal(r.fornitoreAValle, 'Novita');
});

test('FAV-03 — il giro lo dice all\'ospite (`onGiro` tipo `fornitore-a-valle`), una volta per chiamata, col modello', async () => {
  const visti = [];
  const esito = await talosLavora({
    cartella: cartellaDiProva('talos-fornitore-'), task: { consegna: 'saluta' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k', onDelta: () => {},
    fetchDiRete: async () => flusso([conFornitore('DeepInfra', testo('Ciao!')), conFornitore('DeepInfra', fine)]),
    onGiro: (e) => { if (e.tipo === 'fornitore-a-valle') visti.push(e); },
  });
  assert.equal(esito.comeFinita, 'concluso');
  assert.deepEqual(visti.map((e) => [e.fornitore, e.modello]), [['DeepInfra', 'z-ai/glm-5.3-flash']]);
  // al contrario: senza il campo nessun evento
  const zitto = [];
  await talosLavora({
    cartella: cartellaDiProva('talos-fornitore-'), task: { consegna: 'saluta' }, modello: 'x', chiave: 'k', onDelta: () => {},
    fetchDiRete: async () => flusso([testo('Ciao!'), fine]), onGiro: (e) => { if (e.tipo === 'fornitore-a-valle') zitto.push(e); },
  });
  assert.deepEqual(zitto, []);
});

test('FAV-03b — il servizio lo trasforma in un evento CUSTOM persistibile, prima della fine del giro, senza segreti', async (t) => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const cartella = cartellaDiProva('talos-fornitore-servizio-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  await avviaSessione({ cartella, task: { consegna: 'Saluta.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-segreta',
    onEvento: (e) => eventi.push(e),
    talosLavoraFn: (opts) => talosLavora({ ...opts, giriMassimi: 1,
      fetchDiRete: async () => flusso([conFornitore('DeepInfra', testo('Ciao!')), conFornitore('DeepInfra', fine)]) }),
  });
  const inizio = eventi.find((e) => e.type === 'RunStarted');
  const fornitori = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.fornitore-a-valle');
  assert.equal(fornitori.length, 1);
  assert.deepEqual(fornitori[0].value, { schema: 'talos.fornitore-a-valle.v1', threadId: inizio.threadId, runId: inizio.runId, giro: 0,
    fornitore: 'DeepInfra', modello: 'z-ai/glm-5.3-flash' });
  assert.ok(eventi.indexOf(fornitori[0]) < eventi.findIndex((e) => e.type === 'RunFinished'), 'prima della fine');
  assert.doesNotMatch(JSON.stringify(fornitori), /chiave-segreta/u);
});

test('FAV-04 — `provider.ignore`: l\'elenco si unisce a quello già nella richiesta, solo verso OpenRouter', async () => {
  assert.deepEqual(unisciEsclusi(undefined, ['deepinfra']), { ignore: ['deepinfra'] });
  assert.deepEqual(unisciEsclusi({ sort: 'price', ignore: ['a'] }, ['a', 'b']), { sort: 'price', ignore: ['a', 'b'] });
  // UNIONE, non sostituzione: un fornitore già nell'ignore della richiesta e non nell'elenco resta (mutante B5 della review)
  assert.deepEqual(unisciEsclusi({ ignore: ['x'] }, ['a']), { ignore: ['x', 'a'] });
  const stesso = { ignore: ['a'] };
  assert.equal(unisciEsclusi(stesso, ['a']), stesso, 'niente da aggiungere: lo stesso oggetto');
  assert.equal(unisciEsclusi(undefined, []), undefined);
  const corpi = [];
  const finto = async (url, init) => { corpi.push([String(url), init?.body ? JSON.parse(init.body) : null]); return new Response('{}', { headers: { 'content-type': 'application/json' } }); };
  const trasporto = creaFetchOpenRouterResiliente(finto, { timeoutMsFn: () => 5_000, inattivitaMsFn: () => 5_000, esclusiFn: async () => ['deepinfra', 'chutes'] });
  await trasporto('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'x/y', messages: [] }) });
  assert.deepEqual(corpi[0][1].provider, { ignore: ['deepinfra', 'chutes'] });
  // al contrario: un altro indirizzo non si tocca; senza esclusi il corpo resta quello
  await trasporto('https://api.z.ai/api/paas/v4/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'glm', messages: [] }) });
  assert.equal(corpi[1][1].provider, undefined);
  const senza = creaFetchOpenRouterResiliente(finto, { timeoutMsFn: () => 5_000, inattivitaMsFn: () => 5_000 });
  const corpo = JSON.stringify({ model: 'x/y', messages: [] });
  await senza('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: corpo });
  assert.equal(corpi[2][1].provider, undefined);
});

test('FAV-05 — il negozio: elenco validato, salvato su disco, conservato quando cambiano endpoint o tempo', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-esclusi-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const runtimeFile = join(dir, 'providers.json');
  const store = createProviderCredentialStore({ env: {}, runtimeFile });
  assert.deepEqual(store.getRuntime('openrouter').esclusi, []);
  assert.deepEqual(store.impostaEsclusi('openrouter', [' DeepInfra ', 'deepinfra', 'deepinfra/turbo']).esclusi, ['deepinfra', 'deepinfra/turbo'], 'minuscole, senza doppioni');
  assert.deepEqual(JSON.parse(readFileSync(runtimeFile, 'utf8')).providers.openrouter.esclusi, ['deepinfra', 'deepinfra/turbo']);
  store.setRuntime('openrouter', { endpoint: 'https://openrouter.ai/api/v1', timeoutSeconds: 90 });
  assert.deepEqual(store.getRuntime('openrouter').esclusi, ['deepinfra', 'deepinfra/turbo'], 'cambiare il tempo non li perde');
  store.resetEndpoint('openrouter');
  assert.deepEqual(store.getRuntime('openrouter').esclusi, ['deepinfra', 'deepinfra/turbo'], 'nemmeno il ripristino dell\'indirizzo');
  // dopo un riavvio
  const riletto = createProviderCredentialStore({ env: {}, runtimeFile });
  assert.deepEqual(riletto.getRuntime('openrouter').esclusi, ['deepinfra', 'deepinfra/turbo']);
  assert.deepEqual(riletto.listPublic().find((p) => p.id === 'openrouter').esclusi, ['deepinfra', 'deepinfra/turbo']);
  // al contrario: forme sbagliate, troppi, un altro fornitore — niente si scrive
  for (const sbagliato of [['https://evil'], ['a b'], ['../x'], [42], 'deepinfra', Array.from({ length: 31 }, (_, i) => `p${i}`)]) {
    assert.throws(() => riletto.impostaEsclusi('openrouter', sbagliato), { code: 'PROVIDER_RUNTIME_INVALID' }, JSON.stringify(sbagliato));
  }
  assert.throws(() => riletto.impostaEsclusi('anthropic', ['x']), { code: 'PROVIDER_RUNTIME_INVALID' });
  assert.deepEqual(riletto.getRuntime('openrouter').esclusi, ['deepinfra', 'deepinfra/turbo']);
  assert.deepEqual(riletto.impostaEsclusi('openrouter', []).esclusi, [], 'lista vuota: nessuna esclusione');
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(runtimeFile, 'utf8')).providers.openrouter, 'esclusi'), false);
});

const ENDPOINT = (righe) => async (url) => new Response(JSON.stringify({ data: { id: 'z-ai/glm-5.3-flash', endpoints: righe } }), { status: 200, headers: { 'content-type': 'application/json' } });
test('FAV-06 — dal nome allo slug: l\'elenco endpoint del modello; mai indovinare', async () => {
  const chieste = [];
  const fetchFn = async (url, init) => { chieste.push(url); return ENDPOINT([{ provider_name: 'DeepInfra', tag: 'deepinfra/fp8' }, { provider_name: 'Chutes', tag: 'chutes' }])(url, init); };
  assert.equal(await slugDelFornitore({ fornitore: 'deepinfra', modello: 'openrouter:z-ai/glm-5.3-flash', fetchFn }), 'deepinfra', 'lo slug di BASE, e la fonte davanti si toglie');
  assert.equal(chieste[0], 'https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints');
  await assert.rejects(slugDelFornitore({ fornitore: 'VIP.aaa', modello: 'z-ai/glm-5.3-flash', fetchFn }), { code: 'OPENROUTER_PROVIDER_NOT_FOUND' });
  await assert.rejects(slugDelFornitore({ fornitore: 'Doppio', modello: 'a/b', fetchFn: ENDPOINT([{ provider_name: 'Doppio', tag: 'uno' }, { provider_name: 'Doppio', tag: 'due' }]) }), { code: 'OPENROUTER_PROVIDER_NOT_FOUND' });
  await assert.rejects(slugDelFornitore({ fornitore: 'X', modello: 'a/b', fetchFn: async () => new Response('no', { status: 500 }) }), { code: 'OPENROUTER_ENDPOINTS_UNAVAILABLE' });
  await assert.rejects(slugDelFornitore({ fornitore: 'X', modello: 'a/b', fetchFn: async () => { throw new Error('rete'); } }), { code: 'OPENROUTER_ENDPOINTS_UNAVAILABLE' });
  for (const modello of ['../../x', 'senza-barra', 'a/../b', 'https://evil/x']) {
    await assert.rejects(slugDelFornitore({ fornitore: 'X', modello, fetchFn }), { code: 'QUERY_INVALID' }, modello);
  }
});

test('FAV-07 — le rotte: elenco intero e «dalla risposta»; solo dalla finestra di TALOS', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-esclusi-http-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') });
  const server = createServer(createHttpApp({ staticHandler: async () => null, providerStore,
    fetchOpenRouterFn: ENDPOINT([{ provider_name: 'DeepInfra', tag: 'deepinfra' }]) }));
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => server.close(ok)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const finestra = { origin: base, 'sec-fetch-site': 'same-origin' };
  const post = async (percorso, corpo, intestazioni = finestra) => {
    const r = await fetch(`${base}${percorso}`, { method: 'POST', headers: { 'content-type': 'application/json', ...intestazioni }, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json() };
  };
  const dallaRisposta = await post('/api/v1/providers/openrouter/esclusi/dalla-risposta', { fornitore: 'DeepInfra', modello: 'z-ai/glm-5.3-flash' });
  assert.equal(dallaRisposta.status, 200, JSON.stringify(dallaRisposta.corpo));
  assert.deepEqual(dallaRisposta.corpo.data, { slug: 'deepinfra', giaEscluso: false, esclusi: ['deepinfra'] });
  assert.equal((await post('/api/v1/providers/openrouter/esclusi/dalla-risposta', { fornitore: 'DeepInfra', modello: 'z-ai/glm-5.3-flash' })).corpo.data.giaEscluso, true);
  const nonTrovato = await post('/api/v1/providers/openrouter/esclusi/dalla-risposta', { fornitore: 'VIP.aaa', modello: 'z-ai/glm-5.3-flash' });
  assert.equal(nonTrovato.status, 404);
  assert.equal(nonTrovato.corpo.error.code, 'OPENROUTER_PROVIDER_NOT_FOUND');
  assert.deepEqual((await post('/api/v1/providers/openrouter/esclusi', { esclusi: ['chutes', 'deepinfra'] })).corpo.data.esclusi, ['chutes', 'deepinfra']);
  assert.equal((await post('/api/v1/providers/openrouter/esclusi', { esclusi: ['a b'] })).status, 422);
  assert.equal((await post('/api/v1/providers/openrouter/esclusi', { lista: [] })).status, 400);
  // al contrario: senza la finestra (un curl da un giro, una pagina estranea) niente si scrive
  for (const intestazioni of [{}, { origin: 'http://evil.example' }]) {
    const no = await post('/api/v1/providers/openrouter/esclusi', { esclusi: [] }, intestazioni);
    assert.equal(no.status, 403);
    assert.equal(no.corpo.error.code, 'PROVIDER_SETTINGS_ORIGIN_FORBIDDEN');
  }
  assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, ['chutes', 'deepinfra']);
  // l'inventario delle rotte le conosce: un metodo sbagliato è 405 (non 404), come vuole il GUARDIANO
  for (const percorso of ['/api/v1/providers/openrouter/esclusi', '/api/v1/providers/openrouter/esclusi/dalla-risposta']) {
    assert.equal((await fetch(`${base}${percorso}`)).status, 405, percorso);
  }
});

test('FAV-07b — elenco endpoint di OpenRouter giù (500 o rete): la rotta risponde 502 e non scrive niente (nota della review)', async (t) => {
  for (const [nome, fetchOpenRouterFn] of [['500', async () => new Response('no', { status: 500 })], ['rete', async () => { throw new Error('rete'); }]]) {
    const dir = mkdtempSync(join(tmpdir(), 'talos-esclusi-502-'));
    t.after(() => rimuoviCartellaDiProva(dir));
    const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') });
    const server = createServer(createHttpApp({ staticHandler: async () => null, providerStore, fetchOpenRouterFn }));
    await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
    t.after(() => new Promise((ok) => server.close(ok)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const r = await fetch(`${base}/api/v1/providers/openrouter/esclusi/dalla-risposta`, { method: 'POST',
      headers: { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ fornitore: 'DeepInfra', modello: 'z-ai/glm-5.3-flash' }) });
    const corpo = await r.json();
    assert.equal(r.status, 502, nome);
    assert.equal(corpo.error.code, 'OPENROUTER_ENDPOINTS_UNAVAILABLE', nome);
    assert.deepEqual(providerStore.getRuntime('openrouter').esclusi, [], `${nome}: niente scritto`);
  }
});

test('FAV-05b — dal disco si legge tollerante: uno slug sbagliato a mano non costa la riga di OpenRouter (nota della review)', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-esclusi-disco-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const runtimeFile = join(dir, 'providers.json');
  writeFileSync(runtimeFile, JSON.stringify({ version: 1, providers: { openrouter: { endpoint: null, endpointConfigured: false, timeoutSeconds: 90,
    esclusi: ['DeepInfra', 'non valido!', 'deepinfra', 42, 'chutes'] } } }));
  const avvisi = [];
  const store = createProviderCredentialStore({ env: {}, runtimeFile, logger: (m) => avvisi.push(m) });
  assert.equal(store.getRuntime('openrouter').timeoutSeconds, 90, 'il tempo massimo resta');
  assert.deepEqual(store.getRuntime('openrouter').esclusi, ['deepinfra', 'chutes'], 'restano i buoni, minuscoli e senza doppioni');
  assert.ok(avvisi.some((m) => /3 entries ignored/u.test(m)), JSON.stringify(avvisi));
  assert.doesNotMatch(avvisi.join(' '), /non valido/u, 'l\'avviso non riporta il contenuto');
  // al contrario: un campo che non è un elenco si ignora (il campo, non la riga)
  writeFileSync(runtimeFile, JSON.stringify({ version: 1, providers: { openrouter: { endpoint: null, endpointConfigured: false, timeoutSeconds: 75, esclusi: 'deepinfra' } } }));
  const due = createProviderCredentialStore({ env: {}, runtimeFile });
  assert.equal(due.getRuntime('openrouter').timeoutSeconds, 75);
  assert.deepEqual(due.getRuntime('openrouter').esclusi, []);
});

/* Nota 2 della review (08/10 notte), misurata con la chiave vera: tutti i fornitori esclusi ⇒ OpenRouter 404 con il passo
   d'instradamento fallito nei metadati. Corpo copiato da quella risposta (il messaggio accorciato non conta: si legge il dato). */
const TUTTI_ESCLUSI = { error: { message: 'All providers have been ignored. To change your default ignored providers, visit: https://openrouter.ai/settings/privacy', code: 404,
  metadata: { routing_funnel: [{ step: 'Initial Endpoints', endpoint_count: 34 }], failed_routing_step: 'Filter by Ignored Providers' } } };
async function bancoRifiuto(t, stato, corpo, { modello = 'openai/gpt-5-nano', provider = 'openrouter' } = {}) {
  const richieste = [], cambi = [];
  const server = createServer(async (req, res) => {
    for await (const _ of req) { /* consuma */ }
    richieste.push(req.url);
    res.writeHead(stato, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(corpo));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => { server.closeAllConnections(); server.close(ok); }));
  const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'fav08-locale', DEEPSEEK_API_KEY: 'fav08-altra' } });
  for (const p of ['openrouter', 'deepseek']) store.setRuntime(p, { endpoint: `http://127.0.0.1:${server.address().port}/${p}` });
  const trasporto = creaFetchMultiProvider(fetch, { providerStore: store,
    dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) },
    fallbackProviders: [{ provider: 'deepseek', model: 'deepseek-chat' }], onCambioFornitore: (e) => cambi.push(e), onConsumoFornitore: () => {} });
  const errore = await chiamaConRitenta({ modello: provider === 'openrouter' ? modello : 'deepseek:deepseek-chat', chiave: 'non-usata', messaggi: [{ role: 'user', content: 'ciao' }],
    attrezzi: [], fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0 }).then(() => null, (e) => e);
  return { errore, richieste, cambi, store };
}

test('FAV-08 — tutti i fornitori esclusi: un codice suo, non transitorio, una richiesta sola, niente riserva, la chiave resta disponibile', async (t) => {
  const { errore, richieste, cambi, store } = await bancoRifiuto(t, 404, TUTTI_ESCLUSI);
  assert.equal(errore?.code, 'OPENROUTER_ALL_PROVIDERS_EXCLUDED');
  assert.equal(errore.transitorio, false);
  assert.match(errore.message, /excluded list/u);
  assert.equal(richieste.length, 1, 'nessun ritento');
  assert.deepEqual(cambi, [], 'nessun fornitore di riserva');
  assert.ok(store.elencaPool('openrouter').every((k) => k.stato === 'disponibile'), 'la chiave non va in panchina');
});

test('FAV-08b — AL CONTRARIO: un 404 di OpenRouter con un altro passo, o lo stesso corpo da un altro fornitore, restano com\'erano', async (t) => {
  const altroPasso = { error: { ...TUTTI_ESCLUSI.error, metadata: { failed_routing_step: 'Filter by Data Policy' } } };
  for (const [nome, stato, corpo, opzioni] of [['altro-passo', 404, altroPasso, {}], ['solo-prosa', 404, { error: { message: 'All providers have been ignored.' } }, {}],
    ['altro-fornitore', 404, TUTTI_ESCLUSI, { provider: 'deepseek' }]]) {
    const { errore } = await bancoRifiuto(t, stato, corpo, opzioni);
    assert.notEqual(errore?.code, 'OPENROUTER_ALL_PROVIDERS_EXCLUDED', nome);
  }
});
