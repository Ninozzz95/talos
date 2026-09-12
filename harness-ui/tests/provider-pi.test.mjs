import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { REGISTRO_FORNITORI, ID_FORNITORI, verificaRegistro, catalogoDiRiservaPer } from '../src/provider-registry.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { createProviderProbe } from '../src/provider-probe.mjs';
import { risolviDestinazioneModello, validaFallbackProviders } from '../src/model-destination.mjs';
import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { tokenDaCache, tokenScrittiInCache, normalizzaUsage } from '../src/usage-cache.mjs';
import { createModelsDevCatalog, createProviderModelCatalog } from '../src/model-catalog-models-dev.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createHttpApp } from '../src/http-app.mjs';

const ATTESI = {
  kimi: ['Kimi', 'https://api.moonshot.ai/v1', 'MOONSHOT_API_KEY', 'moonshotai', 'kimi-k2.6'],
  minimax: ['MiniMax', 'https://api.minimax.io/v1', 'MINIMAX_API_KEY', 'minimax', 'MiniMax-M2.5'],
  qwen: ['Qwen', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'DASHSCOPE_API_KEY', 'alibaba', 'qwen-flash'],
};
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/provider-pi-models-dev-2026-09-12.json', import.meta.url), 'utf8'));
const CHIAVE = 'credenziale-finta-pi';
const deps = store => ({ leggiChiave: store.getKey, leggiRuntime: store.getRuntime });
const storePer = id => createProviderCredentialStore({ env: { [ATTESI[id][2]]: CHIAVE } });
const prepara = (id, model, altre = {}) => preparaRichiestaCompatibile(id, { model, ...altre });
const pagina = (n = 1, totale = 2) => ({ success: true, output: { total: totale, page_no: n, page_size: 1,
  models: [{ model: n === 1 ? 'qwen-flash' : 'qwen3.8-flash', name: n === 1 ? 'Qwen Flash' : 'Qwen 3.8 Flash' }] } });

async function ascolta(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.notEqual(server.address().port, 4174);
  return `http://127.0.0.1:${server.address().port}`;
}

test('PI-01 — ventitré record, tre contratti internazionali completi, chiavi e modelli distinti', () => {
  assert.equal(ID_FORNITORI.length, 23);
  for (const [id, [nome, base, variabile, catalogo, ausiliario]] of Object.entries(ATTESI)) {
    const r = REGISTRO_FORNITORI[id];
    assert.ok(r, id);
    assert.equal(verificaRegistro({ [id]: r }), true);
    assert.equal(r.etichetta, nome);
    assert.equal(r.baseUrl, base);
    assert.equal(r.wire, 'openai-chat');
    assert.equal(r.auth.header, 'Authorization');
    assert.ok(r.auth.nomeVariabile.includes(variabile));
    assert.equal(r.modelsDevId, catalogo);
    assert.equal(r.modelloAusiliario, ausiliario);
    assert.equal(r.indirizzoModificabile, true);
    assert.equal(r.credenziale, true);
    assert.equal(r.chiaveObbligatoria, true);
    assert.equal(r.destinazioneChat, true);
    assert.equal(r.esecuzione, 'collegato');
    const s = storePer(id);
    const d = risolviDestinazioneModello(`${id}:${ausiliario}`, deps(s));
    assert.equal(d.url, `${base}/chat/completions`);
    assert.equal(d.headers.Authorization, `Bearer ${CHIAVE}`);
    assert.equal(s.listPublic().filter(p => p.id === id).length, 1);
    assert.equal(JSON.stringify(s.listPublic()).includes(CHIAVE), false);
    for (const altro of Object.keys(ATTESI).filter(p => p !== id)) assert.equal(s.hasKey(altro), false);
  }
  assert.equal(createProviderCredentialStore({ env: { KIMI_API_KEY: CHIAVE } }).getKey('kimi'), CHIAVE);
});

test('PI-02 — chiave assente: destinazione, sonda e cataloghi bloccati prima della rete', async () => {
  const s = createProviderCredentialStore({ env: {} });
  const probe = createProviderProbe({ ...deps(s), fetchImpl: () => assert.fail('Rete senza chiave') });
  const catalogo = createProviderModelCatalog({ catalogo: { ottieni: () => assert.fail('Catalogo senza chiave') }, chiaveConfigurata: s.hasKey });
  for (const [id, [, , , , modello]] of Object.entries(ATTESI)) {
    assert.throws(() => risolviDestinazioneModello(`${id}:${modello}`, deps(s)), { code: 'PROVIDER_KEY_MISSING' });
    const r = await probe.prova(id);
    assert.equal(r.esito, 'non-provabile');
    assert.equal(r.millisecondi, null);
    await assert.rejects(probe.elencaModelli(id), { code: 'PROVIDER_KEY_MISSING' });
    await assert.rejects(catalogo.ottieni(id), { code: 'PROVIDER_KEY_REQUIRED' });
  }
});

test('PI-03 — server HTTP finto per tutti: 200, 401, 404, dati malformati e catalogo paginato', async t => {
  let stato = 200; let malformata = false; let chiamate = 0;
  const base = await ascolta(t, (req, res) => {
    chiamate++;
    assert.equal(req.method, 'GET');
    assert.equal(req.headers.authorization, `Bearer ${CHIAVE}`);
    const u = new URL(req.url, 'http://localhost');
    assert.ok(['/v1/models', '/api/v1/models'].includes(u.pathname));
    const corpo = malformata ? { data: [null] } : u.pathname === '/api/v1/models'
      ? pagina(Number(u.searchParams.get('page_no') ?? 1)) : { data: [{ id: 'modello-finto' }] };
    res.writeHead(stato, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stato === 200 ? corpo : { error: { message: CHIAVE } }));
  });
  for (const id of Object.keys(ATTESI)) {
    const s = storePer(id);
    s.setRuntime(id, { endpoint: `${base}${id === 'qwen' ? '/compatible-mode/v1' : '/v1'}` });
    const probe = createProviderProbe(deps(s));
    for (const [status, esito] of [[200, 'collegato'], [401, 'non-autorizzato'], [404, 'errore']]) {
      stato = status;
      const r = await probe.prova(id);
      assert.equal(r.esito, esito, id);
      assert.equal(r.httpStatus, stato);
      assert.equal(JSON.stringify(r).includes(CHIAVE), false);
      if (stato === 200) {
        const c = await probe.elencaModelli(id);
        assert.equal(c.modelli.length, id === 'qwen' ? 2 : 1);
        if (id === 'qwen') assert.deepEqual(c.modelli.map(m => m.id), ['qwen:qwen-flash', 'qwen:qwen3.8-flash']);
      } else {
        await assert.rejects(probe.elencaModelli(id), e => e.code === 'CATALOG_UPSTREAM_ERROR' && !e.message.includes(CHIAVE));
        if (stato === 404) assert.match(r.motivo, /non è verificata/u);
      }
    }
    stato = 200; malformata = true;
    assert.equal((await probe.prova(id)).esito, 'errore');
    await assert.rejects(probe.elencaModelli(id), { code: 'CATALOG_UPSTREAM_ERROR' });
    malformata = false;
  }
  assert.equal(chiamate, 25);
});

test('PI-REG-PAGINA — DashScope: errore logico 200 e pagina ripetuta/incompleta non diventano successo', async () => {
  const s = storePer('qwen');
  for (const errata of [null, {}, { ...pagina(), success: false }, { ...pagina(), output: { ...pagina().output, total: -1 } },
    { ...pagina(), output: { ...pagina().output, models: [null] } }]) {
    const probe = createProviderProbe({ ...deps(s), fetchImpl: async () => Response.json(errata) });
    assert.equal((await probe.prova('qwen')).esito, 'errore');
    await assert.rejects(probe.elencaModelli('qwen'), { code: 'CATALOG_UPSTREAM_ERROR' });
  }
  for (const seconda of [pagina(1), { ...pagina(2), output: { ...pagina(2).output, models: [] } },
    { ...pagina(2), output: { ...pagina(2).output, models: pagina(1).output.models } }]) {
    let n = 0;
    const probe = createProviderProbe({ ...deps(s), fetchImpl: async () => Response.json(++n === 1 ? pagina() : seconda) });
    await assert.rejects(probe.elencaModelli('qwen'), { code: 'CATALOG_UPSTREAM_ERROR' });
    assert.equal(n, 2);
  }
});

test('PI-04 — Kimi K2: temperatura del server, thinking, strumenti e isolamento da K3', () => {
  const origine = { model: 'kimi-k2.6', temperature: 0.2, reasoning: { enabled: false }, max_tokens: 16, stream: true, stream_options: { include_usage: true } };
  const copia = structuredClone(origine);
  const r = preparaRichiestaCompatibile('kimi', origine);
  assert.equal(r.corpo.temperature, undefined);
  assert.deepEqual(r.corpo.thinking, { type: 'disabled' });
  assert.equal(r.corpo.reasoning, undefined);
  assert.equal(r.corpo.max_tokens, 16);
  assert.deepEqual(r.corpo.stream_options, origine.stream_options);
  assert.ok(r.avvisi.length);
  assert.deepEqual(origine, copia);
  const attivo = prepara('kimi', 'kimi-k2.7-code', { reasoning: { enabled: true } });
  assert.deepEqual(attivo.corpo.thinking, { type: 'enabled', keep: 'all' });
  const impossibile = prepara('kimi', 'kimi-k2.7-code', { reasoning: { enabled: false } });
  assert.equal(impossibile.corpo.thinking.type, 'enabled');
  assert.ok(impossibile.avvisi.length);
  for (const model of ['kimi-k2.6', 'kimi-k2.7-code']) {
    assert.throws(() => prepara('kimi', model, { tool_choice: 'required' }), { code: 'RUNTIME_INVALID' });
    assert.throws(() => prepara('kimi', model, { tool_choice: { type: 'function', function: { name: 'ora' } } }), { code: 'RUNTIME_INVALID' });
  }
  assert.doesNotThrow(() => prepara('kimi', 'kimi-k2.6', { thinking: { type: 'disabled' }, tool_choice: { type: 'function', function: { name: 'ora' } } }));
  const k3 = { model: 'kimi-k3', reasoning_effort: 'max', temperature: 1 };
  assert.deepEqual(preparaRichiestaCompatibile('kimi', k3), { corpo: k3, avvisi: [] });
});

test('PI-05 — MiniMax: M3 adaptive/disabled, M2.7 sempre attivo, nessuno split implicito', () => {
  assert.deepEqual(prepara('minimax', 'MiniMax-M3', { reasoning: { enabled: true } }).corpo.thinking, { type: 'adaptive' });
  const r = prepara('minimax', 'MiniMax-M3', { extra_body: { thinking: { type: 'disabled' } }, temperature: 0, max_tokens: 18, tool_choice: 'auto' });
  assert.deepEqual(r.corpo.thinking, { type: 'disabled' });
  assert.equal(r.corpo.extra_body, undefined);
  assert.equal(r.corpo.temperature, 0);
  assert.equal(r.corpo.max_tokens, 18);
  assert.equal(r.corpo.reasoning_split, undefined);
  const fisso = prepara('minimax', 'MiniMax-M2.7', { thinking: { type: 'disabled' } });
  assert.notEqual(fisso.corpo.thinking?.type, 'disabled');
  assert.ok(fisso.avvisi.length);
});

test('PI-06 — Qwen: booleano thinking sul wire, streaming vincolato solo dove documentato', () => {
  for (const enabled of [true, false]) {
    const r = prepara('qwen', 'qwen3.8-flash', { reasoning: { enabled }, stream: false });
    assert.equal(r.corpo.enable_thinking, enabled);
    assert.equal(r.corpo.reasoning, undefined);
    assert.equal(r.corpo.stream, false);
  }
  assert.throws(() => prepara('qwen', 'qwen3-32b', { enable_thinking: true, stream: false }), { code: 'RUNTIME_INVALID' });
  assert.throws(() => prepara('qwen', 'qwen3-32b', {}), { code: 'RUNTIME_INVALID' });
  assert.equal(prepara('qwen', 'qwen3-32b', { reasoning: { enabled: false }, stream: false }).corpo.enable_thinking, false);
  const messages = [{ role: 'system', content: [{ type: 'text', text: 'Contesto', cache_control: { type: 'ephemeral' } }] }];
  const r = prepara('qwen', 'qwen-flash', { extra_body: { enable_thinking: false }, messages, stream: true, stream_options: { include_usage: true }, max_tokens: 21 });
  assert.equal(r.corpo.enable_thinking, false);
  assert.deepEqual(r.corpo.messages, messages);
  assert.equal(r.corpo.max_tokens, 21);
  assert.deepEqual(r.corpo.stream_options, { include_usage: true });
});

test('PI-REG-CONFLITTI e PI-REG-ISOLAMENTO — opzioni malformate/discordanti respinte, altri modelli invariati', () => {
  for (const [id, [, , , , model]] of Object.entries(ATTESI)) {
    for (const errata of [{ reasoning: 'high' }, { extra_body: [] }, { reasoning: { enabled: false, effort: 'high' } },
      { reasoning: { enabled: false }, reasoning_effort: 'high' }, { extra_body: { model: 'dirottato' } },
      { extra_body: { messages: [] } }]) {
      assert.throws(() => prepara(id, model, errata), { code: 'RUNTIME_INVALID' }, id);
    }
    const r = prepara(id, model, { reasoning_effort: 'high' });
    assert.equal(r.corpo.reasoning_effort, undefined);
    assert.ok(r.avvisi.length, 'livello trasformato in controllo binario dichiarato');
    const sconosciuto = { model: 'modello-futuro', temperature: 0.2, reasoning: { effort: 'high' }, tool_choice: 'required' };
    assert.deepEqual(preparaRichiestaCompatibile(id, sconosciuto), { corpo: sconosciuto, avvisi: [] });
  }
  assert.throws(() => prepara('qwen', 'qwen-flash', { enable_thinking: false, extra_body: { enable_thinking: true } }), { code: 'RUNTIME_INVALID' });
  for (const id of ['deepseek', 'openrouter', 'novita']) {
    const corpo = { model: 'kimi-k2.6', temperature: 0.2, reasoning_effort: 'high', tool_choice: 'required' };
    assert.deepEqual(preparaRichiestaCompatibile(id, corpo), { corpo, avvisi: [] });
  }
});

test('PI-REG-PROFILO — contratto del thinking e origine della sonda validati nei due versi', () => {
  for (const id of Object.keys(ATTESI)) {
    const r = REGISTRO_FORNITORI[id];
    const p = r.richiestaCompatibile;
    const [nome, modello] = Object.entries(p.modelli)[0];
    for (const thinking of [null, {}, { ...modello.thinking, attivo: 'magico' },
      { ...modello.thinking, disattivabile: 'sì' }, { ...modello.thinking, predefinito: null },
      { ...modello.thinking, soloStreaming: 'sì' }, { ...modello.thinking, conserva: 'tutto' }]) {
      assert.throws(() => verificaRegistro({ [id]: { ...r, richiestaCompatibile: { ...p,
        modelli: { [nome]: { ...modello, thinking } } } } }), { code: 'PROVIDER_REGISTRY_INVALID' });
    }
    assert.equal(verificaRegistro({ [id]: r }), true);
  }
  const r = REGISTRO_FORNITORI.qwen;
  // PI-REG-ORIGINE: WHATWG URL tratta anche le barre inverse come separatori di autorità.
  for (const percorso of ['//altro.example/models', '/\\altro.example/models', 'https://altro.example/models', 'models']) {
    assert.throws(() => verificaRegistro({ qwen: { ...r, sonda: { ...r.sonda, percorso } } }), { code: 'PROVIDER_REGISTRY_INVALID' });
  }
});

test('PI-07 — cache documentata: Kimi primo livello, assenza non misurata, zero solo esplicito', () => {
  for (const id of Object.keys(ATTESI)) {
    const usage = { prompt_tokens: 71, completion_tokens: 5, total_tokens: 76 };
    assert.equal(tokenDaCache(usage, id), null);
    assert.equal(tokenScrittiInCache(usage, id), null);
    assert.equal(normalizzaUsage(usage, id), usage);
    for (const n of [0, 53]) {
      const u = { ...usage, ...(id === 'kimi' ? { cached_tokens: n, prompt_tokens_details: { cached_tokens: 4 } } : { prompt_tokens_details: { cached_tokens: n } }) };
      assert.equal(tokenDaCache(u, id), n);
      assert.equal(normalizzaUsage(u, id).prompt_tokens_details.cached_tokens, n);
      assert.equal(normalizzaUsage(u, id).total_tokens, 76);
    }
  }
  assert.equal(tokenScrittiInCache({ prompt_tokens_details: { cache_creation_input_tokens: 21 } }, 'qwen'), 21);
  for (const id of ['kimi', 'minimax']) assert.equal(tokenScrittiInCache({ prompt_tokens_details: { cache_creation_input_tokens: 21 } }, id), null);
});

test('PI-08 — P-H: solo riserve dichiarate con strumenti; nessuna autocertificazione del client', () => {
  for (const id of Object.keys(ATTESI)) {
    const r = REGISTRO_FORNITORI[id];
    assert.ok(r?.modelliDiRiserva?.length);
    for (const m of r.modelliDiRiserva) {
      assert.deepEqual(validaFallbackProviders([{ provider: id, model: m.id }], { usaAttrezzi: true }), [{ provider: id, model: m.id }]);
      assert.throws(() => verificaRegistro({ [id]: { ...r, modelliDiRiserva: [{ ...m, toolCalling: false }] } }), { code: 'PROVIDER_REGISTRY_INVALID' });
    }
    assert.throws(() => validaFallbackProviders([{ provider: id, model: 'senza-prova' }], { usaAttrezzi: true }), { code: 'PROVIDER_FALLBACK_TOOLS_UNSUPPORTED' });
    assert.throws(() => validaFallbackProviders([{ provider: id, model: r.modelliDiRiserva[0].id, toolCalling: true }], { usaAttrezzi: true }), { code: 'PROVIDER_FALLBACK_INVALID' });
  }
});

test('PI-09 — router reale verso HTTP finto: tool call, ritorno strumento, cache e avvisi', async t => {
  const ricevute = [];
  const base = await ascolta(t, async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${CHIAVE}`);
    assert.equal(req.url, '/v1/chat/completions');
    const parti = []; for await (const p of req) parti.push(p);
    const corpo = JSON.parse(Buffer.concat(parti).toString()); ricevute.push(corpo);
    const secondo = corpo.messages.at(-1).role === 'tool';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: secondo ? { role: 'assistant', content: 'Sono le 12.' }
      : { role: 'assistant', content: '', reasoning_content: 'Verifico.', tool_calls: [{ id: 'ora-1', type: 'function', function: { name: 'ora', arguments: '{}' } }] } }],
    usage: { prompt_tokens: 71, completion_tokens: 5, total_tokens: 76, ...(corpo.model.startsWith('kimi-') ? { cached_tokens: 53 } : {}) } }));
  });
  for (const [id, [, , , , ausiliario]] of Object.entries(ATTESI)) {
    const modello = id === 'minimax' ? 'MiniMax-M3' : ausiliario;
    const s = storePer(id); s.setRuntime(id, { endpoint: `${base}/v1` });
    const avvisi = [];
    const richiesta = creaFetchMultiProvider(fetch, { dipendenze: deps(s), onAvviso: a => avvisi.push(a) });
    const messages = [{ role: 'user', content: 'che ore sn? usa lo strumento' }];
    const corpo = { model: `${id}:${modello}`, messages, reasoning: { enabled: false }, stream: false,
      tools: [{ type: 'function', function: { name: 'ora', parameters: { type: 'object', properties: {} } } }] };
    const primo = await (await richiesta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify(corpo) })).json();
    messages.push(primo.choices[0].message, { role: 'tool', tool_call_id: 'ora-1', content: '12:00' });
    const secondo = await (await richiesta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify(corpo) })).json();
    assert.equal(secondo.choices[0].message.content, 'Sono le 12.');
    assert.equal(ricevute.at(-1).model, modello);
    assert.equal(ricevute.at(-1).reasoning, undefined);
    if (id === 'qwen') assert.equal(ricevute.at(-1).enable_thinking, false);
    else assert.equal(ricevute.at(-1).thinking.type, 'disabled');
    assert.equal(ricevute.at(-1).messages[1].reasoning_content, 'Verifico.');
    assert.equal(tokenDaCache(secondo.usage, id), id === 'kimi' ? 53 : null);
    assert.deepEqual(avvisi, []);
  }
  assert.equal(ricevute.length, 6);
});

test('PI-REG-AVVISI — modifica non silenziosa: senza canale avvisi si ferma prima della rete', async () => {
  const store = storePer('kimi');
  const corpo = JSON.stringify({ model: 'kimi:kimi-k2.6', messages: [{ role: 'user', content: 'Ciao' }], temperature: 0.2 });
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const chiuso = creaFetchMultiProvider(() => assert.fail('Non deve partire senza avviso'), { dipendenze: deps(store) });
  await assert.rejects(chiuso(url, { method: 'POST', body: corpo }), { code: 'PROVIDER_REASONING_UNSUPPORTED' });
  const avvisi = [];
  const aperto = creaFetchMultiProvider(async (u, opzioni) => {
    assert.equal(u, 'https://api.moonshot.ai/v1/chat/completions');
    assert.equal(JSON.parse(opzioni.body).temperature, undefined);
    return Response.json({ choices: [], usage: { prompt_tokens: 10, cached_tokens: 6 } });
  }, { dipendenze: deps(store), onAvviso: a => avvisi.push(a) });
  const r = await (await aperto(url, { method: 'POST', body: corpo })).json();
  assert.equal(r.usage.prompt_tokens_details.cached_tokens, 6);
  assert.equal(avvisi.length, 1);
  assert.match(avvisi[0], /temperatura/);
  assert.equal(avvisi[0].includes(CHIAVE), false);
});

function verificaPubblico(catalogo) {
  for (const id of Object.keys(ATTESI)) {
    const r = REGISTRO_FORNITORI[id];
    assert.ok(r);
    for (const m of r.modelliDiRiserva) assert.equal(catalogo[r.modelsDevId]?.models[m.id]?.tool_call, true, `${id}/${m.id}: strumenti pubblicati`);
  }
}

test('PI-10 — fixture indipendente, catalogo models.dev e rotte prodotto senza modifiche ai file vietati', async t => {
  verificaPubblico(FIXTURE.fornitori);
  const errata = structuredClone(FIXTURE.fornitori);
  errata.moonshotai.models['kimi-k2.6'].tool_call = false;
  assert.throws(() => verificaPubblico(errata), /strumenti pubblicati/u);
  const cartellaStore = await mkdtemp(join(tmpdir(), 'talos-pi-catalogo-'));
  // La rimozione riguarda esclusivamente la cartella temporanea appena creata da questo test.
  assert.ok(resolve(cartellaStore).startsWith(`${resolve(tmpdir())}${sep}talos-pi-catalogo-`));
  t.after(() => rm(cartellaStore, { recursive: true, force: true }));
  const catalogo = createModelsDevCatalog({ cartellaStore, fetchFn: async () => Response.json(FIXTURE.fornitori) });
  const store = createProviderCredentialStore({ env: Object.fromEntries(Object.values(ATTESI).map(([, , v]) => [v, CHIAVE])) });
  const probe = createProviderProbe({ ...deps(store), fetchImpl: async u => Response.json(new URL(u).pathname === '/api/v1/models' ? pagina(1, 1) : { data: [{ id: 'modello-finto' }] }) });
  const base = await ascolta(t, createHttpApp({ staticHandler: async () => null, providerStore: store, providerProbe: probe }));
  for (const id of Object.keys(ATTESI)) {
    const c = await catalogo.ottieni(id);
    assert.equal(c.disponibile, true);
    assert.ok(c.modelli.length > 0);
    assert.equal(catalogoDiRiservaPer(id).modelli[0].prezzoPrompt, null);
    assert.equal((await fetch(`${base}/api/v1/providers/${id}/models`)).status, 200);
    const p = await fetch(`${base}/api/v1/providers/${id}/test`, { method: 'POST' });
    assert.equal((await p.json()).data.esito, 'collegato');
  }
  assert.equal((await (await fetch(`${base}/api/v1/providers`)).text()).includes(CHIAVE), false);
});

test('PI-PUB — confronto con GET pubblico integrale, senza credenziali', { skip: !process.env.TALOS_PI_CATALOGO_PUBBLICO }, () => {
  verificaPubblico(JSON.parse(readFileSync(process.env.TALOS_PI_CATALOGO_PUBBLICO, 'utf8')));
});
