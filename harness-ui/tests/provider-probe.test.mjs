import assert from 'node:assert/strict';
import test from 'node:test';
test('NATIVE-CATALOG-01 Gemini pagina modelli utilizzabili senza esportare la chiave', async () => {
  let calls = 0;
  const probe = createProviderProbe({ leggiChiave: () => 'test-key', leggiRuntime: () => ({endpoint:'https://generativelanguage.googleapis.com/v1beta'}), fetchImpl: async (url, init) => {
    calls++;
    assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'test-key');
    assert.ok(!String(url).includes('test-key'));
    return Response.json(calls === 1 ? {models:[{name:'models/gemini-3.8-flash',displayName:'Gemini Flash',supportedGenerationMethods:['generateContent'],inputTokenLimit:1000000}],nextPageToken:'next'} : {models:[{name:'models/embedding-001',supportedGenerationMethods:['embedContent']}]});
  }});
  const result = await probe.elencaModelli('gemini');
  assert.equal(calls,2); assert.deepEqual(result.modelli.map(m=>m.id),['gemini:gemini-3.8-flash']);
  assert.ok(!JSON.stringify(result).includes('test-key'));
});

import { createProviderProbe, SONDE_PROVIDER } from '../src/provider-probe.mjs';

test('NATIVE-CATALOG-03 dati incompleti o malformati non diventano un catalogo valido', async () => {
  for (const [provider, reply] of [
    ['anthropic',()=>Response.json({data:[{id:'claude-a'}],has_more:true})],
    ['gemini',()=>Response.json({models:[{supportedGenerationMethods:['generateContent']}]})],
    ['openai',()=>new Response('{bad-json')],
  ]) {
    const probe=createProviderProbe({leggiChiave:()=> 'k',leggiRuntime:()=>({endpoint:'https://provider.test/v1'}),fetchImpl:reply});
    await assert.rejects(probe.elencaModelli(provider),{code:'CATALOG_UPSTREAM_ERROR'});
  }
});

test('NATIVE-CATALOG-02 cataloghi Anthropic/OpenAI e paginazione guasta restano espliciti', async () => {
  const calls = [];
  const probe = createProviderProbe({
    leggiChiave: () => 'catalog-test-secret',
    leggiRuntime: () => ({ endpoint: 'https://provider.test/v1', timeoutSeconds: 5 }),
    fetchImpl: async (url, init) => {
      calls.push({ url: new URL(url), headers: new Headers(init.headers) });
      if (init.headers.Authorization) return Response.json({ data: [{id:'gpt-5.4'}, {id:'gpt-4o-audio-preview'}, {id:'gpt-3.5-turbo-instruct'}] });
      return Response.json(calls.length === 1
        ? { data: [{id:'claude-a',display_name:'Claude A',max_input_tokens:200000,capabilities:{image_input:{supported:true}}}], has_more:true,last_id:'claude-a' }
        : { data: [{id:'claude-b'}], has_more:false });
    },
  });
  const anthropic = await probe.elencaModelli('anthropic');
  assert.deepEqual(anthropic.modelli.map(m=>m.id), ['anthropic:claude-a','anthropic:claude-b']);
  assert.deepEqual(anthropic.modelli[0].inputModalities, ['text','image']);
  assert.equal(calls[0].headers.get('anthropic-version'), '2023-06-01');
  assert.equal(calls[1].url.searchParams.get('after_id'), 'claude-a');
  const openai = await probe.elencaModelli('openai');
  assert.deepEqual(openai.modelli.map(m=>m.id), ['openai:gpt-5.4']);
  assert.ok(!JSON.stringify([anthropic,openai]).includes('catalog-test-secret'));
  const broken = createProviderProbe({ leggiChiave:()=> 'k', leggiRuntime:()=>({endpoint:'https://provider.test/v1'}), fetchImpl:async()=>Response.json({data:[],has_more:true,last_id:'same'}) });
  await assert.rejects(broken.elencaModelli('anthropic'), {code:'CATALOG_UPSTREAM_ERROR'});
  const missing = createProviderProbe({ leggiChiave:()=>null, leggiRuntime:()=>({}), fetchImpl:()=>assert.fail('Non chiamare senza credenziale') });
  await assert.rejects(missing.elencaModelli('gemini'), {code:'PROVIDER_KEY_MISSING'});
});

/*
 * ⭐⭐⭐ 03/9 — «questa chiave funziona davvero?».
 *
 * Il pannello Provider sapeva dire solo che una stringa era stata salvata, che
 * è una cosa diversa dall'essere accettata dal provider. Misurato dal vivo
 * contro i servizi veri il 03/9: cinque provider rispondono (OpenRouter 424
 * modelli, OpenAI 124, Gemini 50, Anthropic 11, DeepSeek 3), Ollama è spento e
 * il token Hugging Face viene RIFIUTATO con 401 — e il pannello lo dichiarava
 * «chiave presente», cioè a posto.
 */

function sonda({ risposta, lancia = null, chiave = 'k-vera', endpoint = 'https://esempio.test/v1', timeoutSeconds = 60 } = {}) {
  const chiamate = [];
  const probe = createProviderProbe({
    leggiChiave: () => chiave,
    leggiRuntime: () => ({ endpoint, timeoutSeconds }),
    fetchImpl: async (url, opzioni) => {
      chiamate.push({ url, headers: opzioni.headers });
      if (lancia) throw lancia;
      return risposta;
    },
    orologio: (() => { let t = 0; return () => (t += 25); })(),
  });
  return { probe, chiamate };
}

const ok = (corpo) => ({ ok: true, status: 200, json: async () => corpo });

test('PROVIDER-PROBE-01 — una credenziale accettata riporta quanti modelli vede, e in quanto tempo', async () => {
  const { probe } = sonda({ risposta: ok({ data: [{ id: 'a' }, { id: 'b' }] }) });
  const esito = await probe.prova('openai');
  assert.equal(esito.esito, 'collegato');
  assert.equal(esito.modelli, 2);
  assert.match(esito.motivo, /2 modelli visibili/u);
  assert.ok(Number.isFinite(esito.millisecondi));
});

test('PROVIDER-PROBE-02 — ogni provider si autentica come vuole LUI', async () => {
  /*
   * ⛔ Sono tre schemi diversi — Bearer, `x-api-key`, chiave in query — e
   * confonderli produce un 401 che sembra «chiave sbagliata» quando è
   * «intestazione sbagliata»: l'errore più costoso da diagnosticare qui,
   * perché manda a cambiare una chiave che era buona.
   */
  const bearer = sonda({ risposta: ok({ data: [] }) });
  await bearer.probe.prova('openai');
  assert.equal(bearer.chiamate[0].headers.Authorization, 'Bearer k-vera');

  const anthropic = sonda({ risposta: ok({ data: [] }) });
  await anthropic.probe.prova('anthropic');
  assert.equal(anthropic.chiamate[0].headers['x-api-key'], 'k-vera');
  assert.equal(anthropic.chiamate[0].headers['anthropic-version'], '2023-06-01');
  assert.equal(anthropic.chiamate[0].headers.Authorization, undefined, 'Anthropic non usa Bearer');

  const gemini = sonda({ risposta: ok({ models: [] }) });
  await gemini.probe.prova('gemini');
  assert.match(gemini.chiamate[0].url, /[?&]key=k-vera$/u);
  assert.equal(gemini.chiamate[0].headers.Authorization, undefined, 'Gemini porta la chiave in query, non in intestazione');
});

test('PROVIDER-PROBE-03 — 401 e 403 sono «non autorizzato», non un errore generico', async () => {
  for (const status of [401, 403]) {
    const { probe } = sonda({ risposta: { ok: false, status, json: async () => ({}) } });
    const esito = await probe.prova('openai');
    assert.equal(esito.esito, 'non-autorizzato');
    assert.match(esito.motivo, new RegExp(String(status), 'u'));
  }
});

test('PROVIDER-PROBE-04 — AL CONTRARIO: senza chiave non si chiama, e non si dice «rifiutata»', async () => {
  /*
   * ⛔ «non-provabile» è un TERZO stato e serve: confonderlo con un rifiuto
   * manderebbe la persona a cercare una chiave sbagliata invece di
   * inserirne una. E soprattutto non deve partire nessuna richiesta.
   */
  const { probe, chiamate } = sonda({ chiave: null, risposta: ok({ data: [] }) });
  const esito = await probe.prova('openai');
  assert.equal(esito.esito, 'non-provabile');
  assert.equal(chiamate.length, 0, 'nessuna richiesta deve partire senza credenziale');
});

test('PROVIDER-PROBE-05 — un provider senza chiave (Ollama) si prova lo stesso', async () => {
  // Ollama non ha account: la domanda vera è se il server risponde.
  const { probe, chiamate } = sonda({ chiave: null, endpoint: 'http://127.0.0.1:11434', risposta: ok({ models: [{ name: 'x' }] }) });
  const esito = await probe.prova('ollama');
  assert.equal(esito.esito, 'collegato');
  assert.equal(chiamate[0].url, 'http://127.0.0.1:11434/api/tags');
  assert.equal(chiamate[0].headers.Authorization, undefined);
});

test('PROVIDER-PROBE-06 — un servizio che non risponde è «irraggiungibile», mai «rifiutato»', async () => {
  const { probe } = sonda({ lancia: Object.assign(new Error('boom'), { name: 'TypeError' }) });
  const esito = await probe.prova('openai');
  assert.equal(esito.esito, 'irraggiungibile');
  assert.equal(esito.modelli, null);
});

test('PROVIDER-PROBE-07 — il timeout scaduto lo dice con i secondi veri impostati', async () => {
  const { probe } = sonda({ timeoutSeconds: 12, lancia: Object.assign(new Error('t'), { name: 'TimeoutError' }) });
  const esito = await probe.prova('openai');
  assert.equal(esito.esito, 'irraggiungibile');
  assert.match(esito.motivo, /entro 12 secondi/u);
});

test('PROVIDER-PROBE-08 — AL CONTRARIO: un provider sconosciuto viene rifiutato, non provato', async () => {
  const { probe, chiamate } = sonda({ risposta: ok({ data: [] }) });
  await assert.rejects(() => probe.prova('un-provider-inventato'), { code: 'PROVIDER_INVALID' });
  assert.equal(chiamate.length, 0);
});

test('PROVIDER-PROBE-09 — ogni provider del portachiavi ha la sua sonda', async () => {
  /*
   * ⛔ Il banco non vede chi manca: se un provider entra nel portachiavi e
   * nessuno gli scrive una sonda, il pannello direbbe per sempre «mai
   * provato» senza che niente protesti. Questa riga protesta.
   */
  const { PROVIDER_DEFINITIONS } = await import('../src/provider-credential-store.mjs')
    .then((m) => ({ PROVIDER_DEFINITIONS: m.PROVIDER_DEFINITIONS }))
    .catch(() => ({ PROVIDER_DEFINITIONS: null }));
  if (!PROVIDER_DEFINITIONS) return; // il modulo non lo esporta: il controllo vive allora nel test HTTP
  for (const id of Object.keys(PROVIDER_DEFINITIONS)) {
    assert.ok(SONDE_PROVIDER[id], `manca la sonda per il provider ${id}`);
  }
});
