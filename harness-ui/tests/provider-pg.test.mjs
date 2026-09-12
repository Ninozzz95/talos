import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { REGISTRO_FORNITORI, ID_FORNITORI, verificaRegistro, catalogoDiRiservaPer } from '../src/provider-registry.mjs';
import { createProviderCredentialStore, PROVIDER_DEFINITIONS } from '../src/provider-credential-store.mjs';
import { createProviderProbe } from '../src/provider-probe.mjs';
import { risolviDestinazioneModello } from '../src/model-destination.mjs';
import { modelloRichiestaValido } from '../src/config.mjs';
import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { tokenDaCache, normalizzaUsage } from '../src/usage-cache.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderModelCatalog } from '../src/model-catalog-models-dev.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { PROVIDER_DIRETTI } from '../frontend/src/components/fonti-modelli.js';

// Aspettative indipendenti dal registro; fonti del 12/09/2026 nel rapporto P-G.
const ATTESI = {
  groq: ['Groq', 'https://api.groq.com/openai/v1', 'GROQ_API_KEY', 'groq'],
  cerebras: ['Cerebras', 'https://api.cerebras.ai/v1', 'CEREBRAS_API_KEY', 'cerebras'],
  mistral: ['Mistral', 'https://api.mistral.ai/v1', 'MISTRAL_API_KEY', 'mistral'],
  together: ['Together', 'https://api.together.ai/v1', 'TOGETHER_API_KEY', 'togetherai'],
  fireworks: ['Fireworks', 'https://api.fireworks.ai/inference/v1', 'FIREWORKS_API_KEY', 'fireworks-ai'],
  deepinfra: ['DeepInfra', 'https://api.deepinfra.com/v1/openai', 'DEEPINFRA_API_KEY', 'deepinfra'],
  novita: ['Novita', 'https://api.novita.ai/openai/v1', 'NOVITA_API_KEY', 'novita-ai'],
  nebius: ['Nebius', 'https://api.tokenfactory.nebius.com/v1', 'NEBIUS_API_KEY', 'nebius'],
  xai: ['xAI', 'https://api.x.ai/v1', 'XAI_API_KEY', 'xai'],
  'ollama-cloud': ['Ollama Cloud', 'https://ollama.com/v1', 'OLLAMA_API_KEY', 'ollama-cloud'],
  huggingface: ['Hugging Face', 'https://router.huggingface.co/v1', 'HF_TOKEN', 'huggingface'],
};
const PUBBLICI = ['deepinfra', 'novita', 'ollama-cloud', 'huggingface'];
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/provider-pg-models-dev-2026-09-12.json', import.meta.url), 'utf8'));
const CHIAVE_FINTA = 'credenziale-fittizia-pg';
const deps = store => ({ leggiChiave: store.getKey, leggiRuntime: store.getRuntime });
const modelloPer = id => Object.keys(FIXTURE.fornitori[ATTESI[id][3]].models)[0];
const corpoPer = id => ({ model: modelloPer(id), messages: [{ role: 'user', content: 'Scrivi soltanto pronto.' }], max_tokens: 16 });

async function ascolta(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.notEqual(server.address().port, 4174);
  return `http://127.0.0.1:${server.address().port}`;
}

test('PG-01 — undici percorsi chat P-G, ventinove record unici dopo P-I, P-J, P-K e P-L, e tutte le proiezioni coerenti', () => {
  assert.equal(ID_FORNITORI.length, 29, 'Hugging Face riusa il record; P-I: Kimi, MiniMax, Qwen; P-J: zai-anthropic, minimax-anthropic; P-K: azure, bedrock, vertex; P-L: esterno');
  // P-L · le nuove lane possono aggiungere record: restano obbligatori tutti i venti originali.
  const originali = ['openai', 'deepseek', 'zai', 'anthropic', 'gemini', 'openrouter', 'ollama', 'lmstudio', 'local', ...Object.keys(ATTESI)];
  assert.equal(new Set(originali).size, 20, 'Hugging Face riusa il record esistente');
  assert.ok(originali.every(id => ID_FORNITORI.includes(id)));
  assert.equal(new Set(ID_FORNITORI).size, ID_FORNITORI.length);
  // P-L · fine parità additiva.
  for (const [id, [nome, base, variabile, modelsDevId]] of Object.entries(ATTESI)) {
    const r = REGISTRO_FORNITORI[id];
    assert.ok(r, id);
    assert.equal(verificaRegistro({ [id]: r }), true);
    assert.equal(r.etichetta, nome);
    assert.equal(r.baseUrl, base);
    assert.equal(r.modelsDevId, modelsDevId);
    assert.equal(r.wire, 'openai-chat');
    assert.equal(r.destinazioneChat, true);
    assert.equal(r.chiaveObbligatoria, true);
    assert.deepEqual(r.endpoint, { chat: '/chat/completions', modelli: '/models' });
    assert.equal(r.auth.tipo, 'bearer');
    assert.equal(r.auth.header, 'Authorization');
    assert.ok(r.auth.nomeVariabile.includes(variabile));
    assert.equal(PROVIDER_DEFINITIONS[id].label, nome);
    assert.equal(PROVIDER_DIRETTI.find(p => p.id === id)?.etichetta, nome);
    assert.equal(modelloRichiestaValido(`${id}:${modelloPer(id)}`), true);
    assert.equal(r.modelloAusiliario, null);
    assert.match(r.motivoAusiliario, /qualificat/u);
    assert.ok(Object.isFrozen(r));
  }
});

test('PG-02 — chiavi ambiente isolate; assenza blocca destinazione, sonda e catalogo prima della rete', async () => {
  const vuoto = createProviderCredentialStore({ env: {} });
  const sonda = createProviderProbe({ ...deps(vuoto), fetchImpl: () => assert.fail('Rete senza chiave') });
  const catalogo = createProviderModelCatalog({ catalogo: { ottieni: () => assert.fail('Catalogo prima della chiave') }, chiaveConfigurata: vuoto.hasKey });
  for (const [id, [nome, base, variabile]] of Object.entries(ATTESI)) {
    assert.equal(vuoto.hasKey(id), false);
    assert.equal(vuoto.listPublic().find(p => p.id === id).keyConfigured, false);
    const prova = await sonda.prova(id);
    assert.equal(prova.esito, 'non-provabile');
    assert.equal(prova.millisecondi, null);
    assert.ok(prova.motivo.includes(nome));
    await assert.rejects(sonda.elencaModelli(id), { code: 'PROVIDER_KEY_MISSING' });
    await assert.rejects(catalogo.ottieni(id), { code: 'PROVIDER_KEY_REQUIRED' });
    assert.throws(() => risolviDestinazioneModello(`${id}:${modelloPer(id)}`, deps(vuoto)), { code: 'PROVIDER_KEY_MISSING' });
    const store = createProviderCredentialStore({ env: { [variabile]: CHIAVE_FINTA } });
    assert.deepEqual(store.listPublic().filter(p => p.keyConfigured).map(p => p.id).sort(),
      (id === 'ollama-cloud' ? ['ollama', 'ollama-cloud'] : [id]).sort(),
      'PG-REG-OLLAMA: alias ambiente locale preesistente; custodie distinte');
    const destinazione = risolviDestinazioneModello(`${id}:${modelloPer(id)}`, deps(store));
    assert.equal(destinazione.url, `${base}/chat/completions`);
    assert.equal(destinazione.modelloRemoto, modelloPer(id));
    assert.equal(destinazione.headers.Authorization, `Bearer ${CHIAVE_FINTA}`);
    assert.equal(JSON.stringify(store.listPublic()).includes(CHIAVE_FINTA), false);
  }
});

test('PG-03 — sonda di ogni fornitore: 200 valido, 401, 404 e corpo malformato distinti', async () => {
  for (const [id, [nome, base, variabile]] of Object.entries(ATTESI)) {
    const store = createProviderCredentialStore({ env: { [variabile]: CHIAVE_FINTA } });
    for (const [status, body, esito] of [[200, { data: [{ id: modelloPer(id) }] }, 'collegato'], [401, {}, 'non-autorizzato'], [404, {}, 'errore'], [200, {}, 'errore'], [200, { data: [null] }, 'errore']]) {
      const probe = createProviderProbe({ ...deps(store), fetchImpl: async (url, init) => {
        assert.equal(url, `${base}/models`);
        assert.equal(init.method, 'GET');
        assert.equal(init.redirect, 'error');
        assert.equal(init.headers.Authorization, `Bearer ${CHIAVE_FINTA}`);
        return Response.json(body, { status });
      } });
      const risultato = await probe.prova(id);
      assert.equal(risultato.esito, esito, `${id}/${status}`);
      assert.equal(risultato.httpStatus, status);
      assert.ok(risultato.motivo.includes(nome));
      assert.equal(JSON.stringify(risultato).includes(CHIAVE_FINTA), false);
      if (esito === 'collegato' && PUBBLICI.includes(id)) {
        assert.equal(risultato.credenzialeVerificata, false);
        assert.match(risultato.motivo, /pubblico.*chiave non verificata/iu);
      }
      if (status === 404) assert.match(risultato.motivo, /non è verificata/u);
    }
  }
});

test('PG-04 — server HTTP finto per Groq e Hugging Face; catalogo non nasconde 401 o 404', async t => {
  let stato = 200; let numero = 0;
  const base = await ascolta(t, (req, res) => {
    numero += 1;
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/v1/models');
    assert.equal(req.headers.authorization, `Bearer ${CHIAVE_FINTA}`);
    res.writeHead(stato, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stato === 200 ? { data: [{ id: 'modello-del-server-finto' }] } : { error: { message: CHIAVE_FINTA } }));
  });
  for (const id of ['groq', 'huggingface']) {
    const store = createProviderCredentialStore({ env: { [ATTESI[id][2]]: CHIAVE_FINTA } });
    store.setRuntime(id, { endpoint: `${base}/v1` });
    const probe = createProviderProbe(deps(store));
    for (stato of [200, 401, 404]) {
      assert.equal((await probe.prova(id)).httpStatus, stato);
      if (stato === 200) assert.equal((await probe.elencaModelli(id)).modelli[0].id, `${id}:modello-del-server-finto`);
      else await assert.rejects(probe.elencaModelli(id), e => e.code === 'CATALOG_UPSTREAM_ERROR' && !e.message.includes(CHIAVE_FINTA));
    }
  }
  assert.equal(numero, 12);
});

test('PG-05 — alias uscita documentati e conflitti: nessuna mutazione né estensione agli altri', () => {
  for (const id of ['groq', 'cerebras', 'xai']) {
    const corpo = corpoPer(id); const prima = structuredClone(corpo);
    const adattata = preparaRichiestaCompatibile(id, corpo);
    assert.equal(adattata.corpo.max_tokens, undefined);
    assert.equal(adattata.corpo.max_completion_tokens, 16);
    assert.deepEqual(corpo, prima);
    assert.deepEqual(adattata.avvisi, []);
    assert.throws(() => preparaRichiestaCompatibile(id, { ...corpo, max_completion_tokens: 32 }), { code: 'RUNTIME_INVALID' });
    assert.equal(preparaRichiestaCompatibile(id, { ...corpo, max_completion_tokens: 16 }).corpo.max_tokens, undefined);
    assert.equal(Object.hasOwn(preparaRichiestaCompatibile(id, { ...corpo, max_tokens: null, max_completion_tokens: 16 }).corpo, 'max_tokens'), false,
      'PG-REG-LIMITE-NULL: due alias presenti restano vietati anche con null');
  }
  for (const id of ['mistral', 'together', 'fireworks', 'deepinfra', 'novita', 'nebius', 'ollama-cloud', 'huggingface', 'deepseek', 'openrouter']) {
    const corpo = { model: 'modello-non-qualificato', max_tokens: 17, reasoning_effort: 'high', tool_choice: 'required' };
    assert.deepEqual(preparaRichiestaCompatibile(id, corpo), { corpo, avvisi: [] }, id);
  }
});

test('PG-06 — ragionamento documentato e strumenti: solo le particolarità del profilo', () => {
  for (const id of ['groq', 'cerebras', 'mistral', 'fireworks', 'nebius', 'xai', 'huggingface']) {
    const corpo = { ...corpoPer(id), reasoning: { effort: 'high' }, tool_choice: 'auto' };
    const risultato = preparaRichiestaCompatibile(id, corpo);
    assert.equal(risultato.corpo.reasoning_effort, 'high', id);
    assert.equal(risultato.corpo.reasoning, undefined, id);
    assert.equal(risultato.corpo.tool_choice, 'auto', id);
    assert.deepEqual(risultato.avvisi, []);
  }
  const richiesto = { ...corpoPer('cerebras'), tools: [{ type: 'function', function: { name: 'ora', parameters: { type: 'object', properties: {} } } }], response_format: { type: 'json_object' } };
  assert.throws(() => preparaRichiestaCompatibile('cerebras', richiesto), { code: 'RUNTIME_INVALID' });
  assert.doesNotThrow(() => preparaRichiestaCompatibile('cerebras', { ...richiesto, model: 'qwen-3.8-27b' }));
  assert.doesNotThrow(() => preparaRichiestaCompatibile('groq', richiesto));
  for (const id of ['groq', 'cerebras']) {
    const r = preparaRichiestaCompatibile(id, { ...corpoPer(id), reasoning_effort: 'none' });
    assert.equal(r.corpo.reasoning_effort, undefined);
    assert.equal(r.avvisi.length, 1);
    assert.ok(r.avvisi[0].includes(ATTESI[id][0]));
  }
  assert.equal(preparaRichiestaCompatibile('xai', { model: 'grok-4.3', reasoning_effort: 'none' }).corpo.reasoning_effort, 'none');
  assert.equal(preparaRichiestaCompatibile('xai', { model: 'grok-4.6', reasoning_effort: 'none' }).avvisi.length, 1);
  for (const id of ['together', 'deepinfra', 'ollama-cloud', 'novita']) {
    const corpo = { ...corpoPer(id), reasoning: { effort: 'high' } };
    assert.deepEqual(preparaRichiestaCompatibile(id, corpo), { corpo, avvisi: [] });
  }
});

test('PG-07 — cache: numero e zero espliciti, assenza non misurata, nessun totale alterato', () => {
  for (const id of Object.keys(ATTESI)) {
    const usage = { prompt_tokens: 71, completion_tokens: 5, total_tokens: 76 };
    assert.equal(tokenDaCache(usage, id), null);
    assert.equal(normalizzaUsage(usage, id), usage);
    if (['ollama-cloud', 'huggingface'].includes(id)) assert.deepEqual(REGISTRO_FORNITORI[id].cache.letturaUsage, []);
    else {
      const campo = id === 'together' ? 'cached_tokens' : 'prompt_tokens_details';
      for (const n of [0, 53]) {
        const dichiarato = { ...usage, [campo]: campo === 'cached_tokens' ? n : { cached_tokens: n } };
        assert.equal(tokenDaCache(dichiarato, id), n);
        assert.equal(normalizzaUsage(dichiarato, id).total_tokens, 76);
      }
    }
  }
});

function verificaPubblico(catalogo) {
  for (const id of Object.keys(ATTESI)) {
    const r = REGISTRO_FORNITORI[id];
    for (const m of r.modelliDiRiserva) assert.equal(catalogo[r.modelsDevId]?.models[m.id]?.tool_call, true, `${id}/${m.id}: strumenti pubblicati`);
  }
}

test('PG-08 — fixture pubblica indipendente e verso contrario su modelli e strumenti', () => {
  verificaPubblico(FIXTURE.fornitori);
  const errata = structuredClone(FIXTURE.fornitori);
  errata.groq.models[modelloPer('groq')].tool_call = false;
  assert.throws(() => verificaPubblico(errata), /strumenti pubblicati/u);
  delete errata.groq.models[modelloPer('groq')];
  assert.throws(() => verificaPubblico(errata), /strumenti pubblicati/u);
  for (const id of Object.keys(ATTESI)) {
    const r = catalogoDiRiservaPer(id);
    assert.equal(r.modelli[0].id, `${id}:${modelloPer(id)}`);
    assert.equal(r.modelli[0].prezzoPrompt, null);
    assert.equal(r.modelli[0].contestoVerificato, false);
    assert.equal(r.modelli[0].dataDichiarazione, FIXTURE.data);
  }
});

test('PG-PUB — confronto anche con il GET integrale, acquisito senza credenziali', { skip: !process.env.TALOS_PG_CATALOGO_PUBBLICO }, () => {
  verificaPubblico(JSON.parse(readFileSync(process.env.TALOS_PG_CATALOGO_PUBBLICO, 'utf8')));
});

test('PG-09 — router AVM reale verso server finto: modello, corpo, tool calling e usage attraversano il confine', async t => {
  const ricevute = [];
  const base = await ascolta(t, async (req, res) => {
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.headers.authorization, `Bearer ${CHIAVE_FINTA}`);
    const blocchi = []; for await (const b of req) blocchi.push(b);
    ricevute.push(JSON.parse(Buffer.concat(blocchi).toString()));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'pronto' } }], usage: { prompt_tokens: 71, completion_tokens: 5, total_tokens: 76 } }));
  });
  for (const id of Object.keys(ATTESI)) {
    const store = createProviderCredentialStore({ env: { [ATTESI[id][2]]: CHIAVE_FINTA } });
    store.setRuntime(id, { endpoint: `${base}/v1` });
    const richiesta = creaFetchMultiProvider(fetch, { dipendenze: deps(store) });
    const risposta = await richiesta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ ...corpoPer(id), model: `${id}:${modelloPer(id)}`, tool_choice: 'auto', stream: false }) });
    assert.equal(ricevute.at(-1).model, modelloPer(id));
    assert.equal(ricevute.at(-1).tool_choice, 'auto');
    const json = await risposta.json();
    assert.equal(json.choices[0].message.content, 'pronto');
    assert.deepEqual(json.usage, { prompt_tokens: 71, completion_tokens: 5, total_tokens: 76 });
    assert.equal(tokenDaCache(json.usage, id), null);
  }
  assert.equal(ricevute.length, 11);
});

test('PG-10 — rotte prodotto isolate: gli undici cataloghi e le sonde sono raggiungibili senza cambiare http-app', async t => {
  const store = createProviderCredentialStore({ env: Object.fromEntries(Object.values(ATTESI).map(([, , variabile]) => [variabile, CHIAVE_FINTA])) });
  const probe = createProviderProbe({ ...deps(store), fetchImpl: async () => Response.json({ data: [{ id: 'modello-finto' }] }) });
  const base = await ascolta(t, createHttpApp({ staticHandler: async () => null, providerStore: store, providerProbe: probe }));
  for (const id of Object.keys(ATTESI)) {
    const catalogo = await fetch(`${base}/api/v1/providers/${id}/models`);
    assert.equal(catalogo.status, 200, id);
    const prova = await fetch(`${base}/api/v1/providers/${id}/test`, { method: 'POST' });
    assert.equal(prova.status, 200, id);
    assert.equal((await prova.json()).data.esito, 'collegato');
  }
  const pubblico = await (await fetch(`${base}/api/v1/providers`)).text();
  assert.equal(pubblico.includes(CHIAVE_FINTA), false);
});

test('PG-11 — Hugging Face conserva gli alias e lo stesso account nel portachiavi dei download', () => {
  for (const variabile of ['HF_TOKEN', 'HUGGINGFACE_HUB_TOKEN']) {
    const store = createProviderCredentialStore({ env: { [variabile]: CHIAVE_FINTA } });
    assert.equal(store.getKey('huggingface'), CHIAVE_FINTA);
  }
  const chiamate = [];
  const store = createProviderCredentialStore({ env: {}, keyring: { get: (servizio, account) => {
    chiamate.push([servizio, account]);
    return account === 'huggingface' ? CHIAVE_FINTA : null;
  } } });
  store.loadFromKeyring();
  assert.equal(store.getKey('huggingface'), CHIAVE_FINTA);
  assert.equal(chiamate.filter(([servizio, account]) => servizio === 'talos-harness-provider' && account === 'huggingface').length, 1);
  assert.equal(store.listPublic().filter(p => p.id.startsWith('huggingface')).length, 1);
});

test('PG-12 — uscite del banco conservate: OpenRouter invariato e SSE/errore non riscritti', async () => {
  const store = createProviderCredentialStore({ env: { GROQ_API_KEY: CHIAVE_FINTA, OPENROUTER_API_KEY: CHIAVE_FINTA } });
  for (const originale of [new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }), Response.json({ error: { message: 'quota' } }, { status: 429 })]) {
    const richiesta = creaFetchMultiProvider(async () => originale, { dipendenze: deps(store) });
    const risposta = await richiesta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ ...corpoPer('groq'), model: `groq:${modelloPer('groq')}` }) });
    assert.equal(risposta, originale);
  }
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const init = { method: 'POST', body: JSON.stringify({ model: 'openai/gpt-oss-20b', messages: [], reasoning: { effort: 'high' }, max_tokens: 16 }) };
  const richiesta = creaFetchMultiProvider(async (u, i) => { assert.equal(u, url); assert.equal(i, init); return Response.json({ choices: [] }); }, { dipendenze: deps(store) });
  await richiesta(url, init);
});

test('PG-13 — profilo di compatibilità malformato respinto e nessuna preferenza discordante nascosta', () => {
  const base = REGISTRO_FORNITORI.groq;
  assert.ok(base?.richiestaCompatibile);
  for (const modifica of [
    { limiteUscita: 'inventato' }, { ragionamento: 'inventato' }, { modelli: [] }, { fonte: '' },
    { modelli: { m: { livelliRagionamento: ['telepatia'] } } },
  ]) assert.throws(() => verificaRegistro({ groq: { ...base, richiestaCompatibile: { ...base.richiestaCompatibile, ...modifica } } }), { code: 'PROVIDER_REGISTRY_INVALID' });
  assert.throws(() => preparaRichiestaCompatibile('groq', { ...corpoPer('groq'), reasoning: { effort: 'low' }, reasoning_effort: 'high' }), { code: 'RUNTIME_INVALID' });
  assert.throws(() => preparaRichiestaCompatibile('groq', { ...corpoPer('groq'), reasoning: 'high' }), { code: 'RUNTIME_INVALID' });
});
