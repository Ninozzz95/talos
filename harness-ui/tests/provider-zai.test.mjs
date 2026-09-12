import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { createProviderProbe } from '../src/provider-probe.mjs';
import { risolviDestinazioneModello, separaFonteModello } from '../src/model-destination.mjs';
import * as runtime from '../src/openai-compatible-runtime.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { tokenDaCache } from '../src/usage-cache.mjs';
import { createHttpApp } from '../src/http-app.mjs';

const CHIAVE_FINTA = 'credenziale-del-server-finto';
const prepara = (body) => runtime.preparaRichiestaCompatibile('zai', body);
const modello = 'glm-5.3-flash';
const deps = (store) => ({ leggiChiave: store.getKey, leggiRuntime: store.getRuntime });

test('PD-01 — record Z.AI valido, listino datato e secondo profilo inattivo', () => {
  const r = REGISTRO_FORNITORI.zai;
  assert.ok(r);
  assert.equal(verificaRegistro({ zai: r }), true);
  assert.equal(r.etichetta, 'Z.AI');
  assert.equal(r.baseUrl, 'https://api.z.ai/api/paas/v4');
  assert.equal(r.wire, 'openai-chat');
  assert.equal(r.profili['anthropic-messages'].stato, 'in preparazione');
  assert.equal(r.profili['anthropic-messages'].lotto, 'P-J');
  assert.equal(r.prezzi.data, '2026-09-12');
  assert.deepEqual(r.modelliNoti.map(m => m.id), ['glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'glm-5', 'glm-4.6']);
  assert.equal(r.modelliNoti[0].prezzi.ingresso, 0.15);
  assert.equal(r.modelliNoti[0].prezzi.uscita, 0.5);
  assert.equal(r.modelliNoti[0].contestoDichiarato, '1M');
  assert.deepEqual(r.modelliNoti[0].ragionamento.livelli, ['high', 'max']);
  assert.deepEqual(r.modelliNoti.at(-1).ragionamento.livelli, []);
  for (const modifica of [
    { ...r, modelliNoti: [{ ...r.modelliNoti[0], contextLength: -1 }] },
    { ...r, modelliNoti: [{ ...r.modelliNoti[0], prezzi: { ingresso: -1 } }] },
    { ...r, modelliNoti: [{ ...r.modelliNoti[0], ragionamento: { livelli: ['low'], thinking: ['enabled'] } }] },
  ]) assert.throws(() => verificaRegistro({ zai: modifica }), { code: 'PROVIDER_REGISTRY_INVALID' });
});

test('PD-02 — i tre alias ambiente e la custodia alimentano lo stesso record senza esporre segreti', () => {
  for (const alias of ['GLM_API_KEY', 'ZAI_API_KEY', 'Z_AI_API_KEY']) {
    const store = createProviderCredentialStore({ env: { [alias]: CHIAVE_FINTA } });
    assert.equal(store.hasKey('zai'), true);
    assert.equal(store.listPublic().find(p => p.id === 'zai').label, 'Z.AI');
    assert.equal(JSON.stringify(store.listPublic()).includes(CHIAVE_FINTA), false);
  }
  const store = createProviderCredentialStore({ env: { GLM_API_KEY: 'seme-finto' }, keyring: {
    get: (service, account) => service === 'talos-harness-provider' && account === 'zai' ? CHIAVE_FINTA : null,
  } });
  store.loadFromKeyring();
  assert.equal(store.getKey('zai'), CHIAVE_FINTA);
  assert.equal(store.listPublic().find(p => p.id === 'zai').origineChiave, 'custodia');
});

test('PD-03 — senza chiave nessuna disponibilità, sonda o richiesta di catalogo', async () => {
  const store = createProviderCredentialStore({ env: {} });
  const probe = createProviderProbe({ ...deps(store), fetchImpl: () => assert.fail('Nessuna rete senza chiave') });
  assert.equal(store.listPublic().filter(p => p.keyConfigured).some(p => p.id === 'zai'), false);
  const esito = await probe.prova('zai');
  assert.equal(esito.esito, 'non-provabile');
  assert.equal(esito.millisecondi, null);
  assert.match(esito.motivo, /Z\.AI/u);
  await assert.rejects(probe.elencaModelli('zai'), { code: 'PROVIDER_KEY_MISSING' });
  assert.throws(() => risolviDestinazioneModello('zai:glm-5.3-flash', deps(store)), e => e.code === 'PROVIDER_KEY_MISSING' && e.message.includes('Z.AI'));
});

test('PD-04 — sonda 200, 401, 404 e corpo malformato dicono cose diverse', async () => {
  const store = createProviderCredentialStore({ env: { ZAI_API_KEY: CHIAVE_FINTA } });
  const risultati = [];
  for (const [status, body] of [[200, { data: [{ id: modello }] }], [401, {}], [404, {}], [200, {}]]) {
    const probe = createProviderProbe({ ...deps(store), fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.z.ai/api/paas/v4/models');
      assert.equal(init.headers.Authorization, `Bearer ${CHIAVE_FINTA}`);
      assert.equal(init.redirect, 'error');
      return Response.json(body, { status });
    } });
    const esito = await probe.prova('zai');
    assert.match(esito.motivo, /Z\.AI/u);
    assert.equal(esito.httpStatus, status);
    assert.equal(JSON.stringify(esito).includes(CHIAVE_FINTA), false);
    risultati.push(esito.esito);
  }
  assert.deepEqual(risultati, ['collegato', 'non-autorizzato', 'errore', 'errore']);
});

test('PD-05 — catalogo remoto arricchito, ripiego 404 dichiarato, mai ripiego su 401', async () => {
  const store = createProviderCredentialStore({ env: { Z_AI_API_KEY: CHIAVE_FINTA } });
  const elenco = async (status, body) => createProviderProbe({ ...deps(store), fetchImpl: async () => Response.json(body, { status }) }).elencaModelli('zai');
  const live = await elenco(200, { data: [{ id: modello }, { id: 'glm-futuro' }] });
  assert.equal(live.modelli[0].id, 'zai:glm-5.3-flash');
  assert.equal(live.modelli[0].nome, 'GLM-5.3-Flash');
  assert.equal(live.modelli[0].contextLength, 1_000_000);
  assert.equal(live.modelli[0].prezzi.data, '2026-09-12');
  assert.deepEqual(live.modelli[0].reasoning, { supportedEfforts: ['high', 'max'], defaultEffort: 'max', defaultEnabled: true, mandatory: true });
  assert.equal(live.modelli[1].contextLength, null);
  const fallback = await elenco(404, {});
  assert.equal(fallback.fonte, 'documentazione');
  assert.equal(fallback.credenzialeVerificata, false);
  assert.match(fallback.avviso, /404/u);
  assert.match(fallback.modelli[0].nome, /catalogo documentato/u);
  await assert.rejects(elenco(401, {}), e => e.code === 'CATALOG_UPSTREAM_ERROR' && e.message.includes('Z.AI'));
});

test('PD-06 — destinazione diretta Bearer; la famiglia z-ai/ resta su OpenRouter', () => {
  const store = createProviderCredentialStore({ env: { GLM_API_KEY: CHIAVE_FINTA } });
  const d = risolviDestinazioneModello(`zai:${modello}`, deps(store));
  assert.equal(d.url, 'https://api.z.ai/api/paas/v4/chat/completions');
  assert.equal(d.headers.Authorization, `Bearer ${CHIAVE_FINTA}`);
  assert.equal(d.modelloRemoto, modello);
  assert.deepEqual(separaFonteModello(`z-ai/${modello}`), { fonte: 'openrouter', modelloRemoto: `z-ai/${modello}` });
});

test('PD-07 — high/max solo sui modelli previsti; low omesso e dichiarato in tutte le forme', () => {
  for (const id of ['glm-5.2', 'glm-5.3', modello]) for (const effort of ['high', 'max']) {
    const original = { model: id, messages: [], reasoning: { effort } };
    const result = prepara(original);
    assert.equal(result.corpo.reasoning_effort, effort);
    assert.deepEqual(result.corpo.thinking, { type: 'enabled' });
    assert.equal(result.corpo.reasoning, undefined);
    assert.equal(original.reasoning.effort, effort);
    assert.deepEqual(result.avvisi, []);
  }
  for (const extra of [{ reasoning: { effort: 'low' } }, { reasoning_effort: 'low' }, { extra_body: { reasoning_effort: 'low' } }]) {
    const result = prepara({ model: modello, ...extra });
    assert.equal(result.corpo.reasoning_effort, undefined);
    assert.equal(result.corpo.extra_body, undefined);
    assert.match(result.avvisi.join(' '), /Z\.AI/u);
    assert.match(result.avvisi.join(' '), /non inviato/u);
  }
  for (const id of ['glm-4.6', 'glm-5', 'glm-futuro']) {
    const result = prepara({ model: id, reasoning_effort: 'high' });
    assert.equal(result.corpo.reasoning_effort, undefined);
    assert.equal(result.avvisi.length, 1);
  }
  const or = { model: `z-ai/${modello}`, reasoning: { effort: 'low' } };
  assert.equal(runtime.preparaRichiestaCompatibile('openrouter', or).corpo, or);
});

test('PD-08 — thinking disabled consentito fino a 5.2, dichiarato impossibile su 5.3/Flash', () => {
  for (const model of ['glm-4.6', 'glm-5', 'glm-5.2']) {
    const result = prepara({ model, reasoning: { enabled: false, effort: 'high' } });
    assert.equal(result.corpo.thinking.type, 'disabled');
    assert.equal(result.corpo.reasoning_effort, undefined);
  }
  for (const model of ['glm-5.3', modello]) {
    const result = prepara({ model, extra_body: { thinking: { type: 'disabled' } } });
    assert.equal(result.corpo.thinking.type, 'enabled');
    assert.match(result.avvisi.join(' '), /non consente di disattivare/u);
  }
  assert.equal(prepara({ model: modello }).corpo.thinking, undefined, 'nessuna preferenza: default del server');
});

test('PD-11 — controllo del ragionamento malformato respinto con un errore leggibile', () => {
  for (const thinking of [false, 'disabled', [], { type: 'inventato' }, {}]) {
    assert.throws(() => prepara({ model: modello, thinking }), e => e.code === 'RUNTIME_INVALID' && e.message.includes('Z.AI'));
  }
});

async function ascolta(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  assert.notEqual(server.address().port, 4174);
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('PD-09 — server Z.AI FINTO: rotte HTTP, streaming e ciclo tool con credenziale finta', async t => {
  let richieste = 0;
  const upstream = await ascolta(t, async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${CHIAVE_FINTA}`);
    if (req.method === 'GET' && req.url === '/api/paas/v4/models') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ data: [{ id: modello }] }));
    }
    richieste++;
    assert.equal(req.url, '/api/paas/v4/chat/completions');
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    assert.equal(body.model, modello);
    assert.equal(body.reasoning_effort, 'high');
    assert.equal(body.extra_body, undefined);
    res.setHeader('Content-Type', 'text/event-stream');
    const delta = richieste === 1
      ? { tool_calls: [{ index: 0, id: 'chiamata-finta', type: 'function', function: { name: 'numero', arguments: '{}' } }] }
      : { content: 'uno.' };
    if (richieste === 2) assert.equal(body.messages.at(-1).tool_call_id, 'chiamata-finta');
    res.end(`data: ${JSON.stringify({ choices: [{ delta }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })}\n\ndata: [DONE]\n\n`);
  });
  const store = createProviderCredentialStore({ env: { GLM_API_KEY: CHIAVE_FINTA } });
  store.setRuntime('zai', { endpoint: `${upstream}/api/paas/v4` });
  const probe = createProviderProbe(deps(store));
  const app = await ascolta(t, createHttpApp({ staticHandler: async () => null, providerStore: store, providerProbe: probe }));
  const cat = await fetch(`${app}/api/v1/providers/zai/models`);
  assert.equal(cat.status, 200);
  assert.equal((await cat.json()).data.modelli[0].nome, 'GLM-5.3-Flash');
  assert.equal((await probe.prova('zai')).esito, 'collegato');
  const d = risolviDestinazioneModello(`zai:${modello}`, deps(store));
  const messages = [{ role: 'user', content: 'Rispondi solo: uno.' }];
  for (let giro = 0; giro < 2; giro++) {
    // Adattatore esplicito: il suo aggancio al router di produzione è PD-10.
    const { corpo } = prepara({ model: d.modelloRemoto, messages, stream: true, reasoning: { effort: 'high' }, tools: [{ type: 'function', function: { name: 'numero', parameters: { type: 'object', properties: {} } } }] });
    const response = await fetch(d.url, { method: 'POST', headers: d.headers, body: JSON.stringify(corpo) });
    assert.equal(response.status, 200);
    const sse = await response.text();
    const chunk = JSON.parse(sse.split('\n')[0].slice(6));
    assert.equal(tokenDaCache(chunk.usage, 'zai'), null, 'cache non misurata dal finto');
    if (giro === 0) {
      assert.equal(chunk.choices[0].delta.tool_calls[0].function.name, 'numero');
      messages.push({ role: 'assistant', content: null, tool_calls: chunk.choices[0].delta.tool_calls }, { role: 'tool', tool_call_id: 'chiamata-finta', content: 'uno' });
    } else assert.equal(chunk.choices[0].delta.content, 'uno.');
  }
  assert.equal(richieste, 2);
});

test('PD-10 — il router effettivo deve omettere low prima dell’invio a Z.AI', async () => {
  const store = createProviderCredentialStore({ env: { GLM_API_KEY: CHIAVE_FINTA } });
  const avvisi = [];
  let inviato;
  const fetchInstradata = creaFetchMultiProvider(async (_url, init) => {
    inviato = JSON.parse(init.body);
    return Response.json({ choices: [], usage: { prompt_tokens: 10 } });
  }, { dipendenze: deps(store), onAvviso: avviso => avvisi.push(avviso) });
  await fetchInstradata('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: `zai:${modello}`, reasoning_effort: 'low', messages: [] }) });
  assert.equal(inviato.reasoning_effort, undefined, 'aggancio fuori perimetro: vedere diff nel rapporto P-D');
  assert.match(avvisi.join(' '), /Z\.AI/u, 'l’omissione deve essere dichiarata al chiamante');
});
