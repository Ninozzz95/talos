// P-J — SDK reale, fornitori finti; nessuna generazione remota e nessuna chiave reale.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { REGISTRO_FORNITORI, ID_NATIVI_SDK } from '../src/provider-registry.mjs';
import { createProviderCredentialStore, leggiScadenzaFornitore } from '../src/provider-credential-store.mjs';
import { risolviDestinazioneModello, validaFallbackProviders } from '../src/model-destination.mjs';
import { createProviderProbe } from '../src/provider-probe.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { nativeProviderResponse, stripNativeMetadata } from '../src/native-provider-adapter.mjs';
import { tokenDaCache, tokenScrittiInCache } from '../src/usage-cache.mjs';
import { chiamaConRitenta, consumaFlussoSSE } from '../src/kernel/talosHarness.mjs';

const ATTESI = {
  'zai-anthropic': { nome: 'Z.AI (porta Anthropic)', base: 'https://api.z.ai/api/anthropic/v1', env: 'ZAI_ANTHROPIC_API_KEY', modello: 'glm-5.3-flash', auth: 'authorization' },
  'minimax-anthropic': { nome: 'MiniMax (porta Anthropic)', base: 'https://api.minimax.io/anthropic/v1', env: 'MINIMAX_API_KEY', modello: 'MiniMax-M2.5', auth: 'x-api-key' },
};
const messaggi = [{ role: 'system', content: 'Aiuta la persona.' }, { role: 'user', content: 'Dimmi pronto.' }];
const attrezzi = [{ type: 'function', function: { name: 'leggi', description: 'Legge una nota', parameters: { type: 'object', properties: { percorso: { type: 'string' } }, required: ['percorso'] } } }];
const dipendenze = store => ({ leggiChiave: store.getKey, leggiRuntime: store.getRuntime });
const risposta = (model, usage = { input_tokens: 11, output_tokens: 2 }) => ({ id: 'msg_pj', type: 'message', role: 'assistant', model, content: [{ type: 'text', text: 'Pronto.' }], stop_reason: 'end_turn', stop_sequence: null, usage });
const json = (res, body, status = 200, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
function custodia(env = {}) {
  const valori = new Map();
  return createProviderCredentialStore({ env, keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
}
async function banco(t, rispondi) {
  const richieste = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const testo = Buffer.concat(chunks).toString();
    const r = { url: req.url, method: req.method, headers: req.headers, body: testo ? JSON.parse(testo) : null };
    richieste.push(r); rispondi(r, res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.notEqual(server.address().port, 4174);
  const base = `http://127.0.0.1:${server.address().port}`;
  const store = custodia(Object.fromEntries(Object.entries(ATTESI).map(([p, a]) => [a.env, `finta-${p}`])));
  for (const p of Object.keys(ATTESI)) store.setRuntime(p, { endpoint: `${base}/${p}/anthropic/v1` });
  // Anche un instradamento sbagliato resta locale: nessuna fuga verso un servizio reale.
  store.setKey('openrouter', 'finta-openrouter'); store.setRuntime('openrouter', { endpoint: `${base}/openrouter` });
  const rete = (url, init) => { assert.equal(new URL(url).origin, base, 'Vietata rete esterna nel banco P-J'); return fetch(url, init); };
  const invia = (provider, body = {}, opzioni = {}) => creaFetchMultiProvider(rete, { dipendenze: dipendenze(store), ...opzioni })('https://openrouter.invalid/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ messages: messaggi, ...body, model: `${provider}:${body.model ?? ATTESI[provider].modello}` }) });
  return { store, rete, richieste, invia, base };
}

test('PJ-01 — record distinti, sorgenti e SDK comuni; Z.AI OpenAI resta invariato', () => {
  for (const [p, a] of Object.entries(ATTESI)) {
    const r = REGISTRO_FORNITORI[p]; assert.ok(r, p);
    assert.equal(r.etichetta, a.nome); assert.equal(r.baseUrl, a.base);
    assert.equal(r.wire, 'anthropic-messages'); assert.ok(ID_NATIVI_SDK.includes(p));
    assert.deepEqual(r.auth.nomeVariabile, [a.env]);
    assert.ok(r.modelliDiRiserva.every(m => m.toolCalling && m.data === '2026-09-12' && m.fonte.startsWith('https://')));
    assert.equal(validaFallbackProviders([{ provider: p, model: a.modello }], { usaAttrezzi: true }).length, 1);
  }
  assert.equal(REGISTRO_FORNITORI.zai.wire, 'openai-chat');
  assert.equal(REGISTRO_FORNITORI.zai.baseUrl, 'https://api.z.ai/api/paas/v4');
  assert.equal(REGISTRO_FORNITORI['minimax-anthropic'].modelloAusiliario, 'MiniMax-M2.5');
});

test('PJ-02 — entrambi i record attraversano router e SDK con propria base, chiave e modello', async t => {
  const b = await banco(t, (r, res) => json(res, risposta(r.body.model)));
  for (const [p, a] of Object.entries(ATTESI)) {
    assert.equal((await (await b.invia(p, { tools: attrezzi })).json()).choices[0].message.content, 'Pronto.');
    const r = b.richieste.at(-1);
    assert.equal(r.url, `/${p}/anthropic/v1/messages`); assert.equal(r.method, 'POST');
    assert.equal(r.headers[a.auth], `${a.auth === 'authorization' ? 'Bearer ' : ''}finta-${p}`);
    assert.equal(r.headers[a.auth === 'authorization' ? 'x-api-key' : 'authorization'], undefined);
    assert.equal(r.headers['anthropic-version'], '2023-06-01');
    assert.equal(JSON.parse(readFileSync(new URL('../node_modules/@ai-sdk/anthropic/package.json', import.meta.url), 'utf8')).version, '4.0.49');
    assert.equal(r.body.model, a.modello); assert.equal(r.body.tools[0].name, 'leggi');
    assert.equal(r.body.system[0].text, 'Aiuta la persona.');
  }
});

test('PJ-03 — Anthropic vero ignora ambiente terzo; metadati originali invariati', async () => {
  const vecchio = process.env.ANTHROPIC_BASE_URL; process.env.ANTHROPIC_BASE_URL = 'https://terzo.invalid/anthropic/v1';
  try {
    let target;
    await nativeProviderResponse({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'finta-anthropic', body: { messages: messaggi }, fetchFn: async (url, init) => {
      target = String(url); assert.equal(new Headers(init.headers).get('x-api-key'), 'finta-anthropic');
      return Response.json(risposta('claude-sonnet-5'));
    } });
    assert.equal(target, 'https://api.anthropic.com/v1/messages');
    const m = { role: 'assistant', content: 'Pronto.', talos_provider_state: { provider: 'anthropic' } };
    assert.deepEqual(stripNativeMetadata([m]), [{ role: 'assistant', content: 'Pronto.' }]); assert.ok(m.talos_provider_state);
  } finally { if (vecchio === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = vecchio; }
});

test('PJ-04 — chiave assente blocca prima della rete, nessuna eredità da altre porte', async () => {
  const store = custodia({ ANTHROPIC_API_KEY: 'finta-anthropic', ZAI_API_KEY: 'finta-zai-openai' });
  const sonda = createProviderProbe({ ...dipendenze(store), fetchImpl: () => assert.fail('Rete senza chiave') });
  for (const [p, a] of Object.entries(ATTESI)) {
    assert.equal(store.hasKey(p), false);
    assert.throws(() => risolviDestinazioneModello(`${p}:${a.modello}`, dipendenze(store)), { code: 'PROVIDER_KEY_MISSING' });
    await assert.rejects(() => nativeProviderResponse({ provider: p, model: a.modello, body: { messages: messaggi }, fetchFn: () => assert.fail('Rete senza chiave') }), { code: 'PROVIDER_KEY_MISSING' });
    assert.equal((await sonda.prova(p)).esito, 'non-provabile');
    await assert.rejects(() => sonda.elencaModelli(p), { code: 'PROVIDER_KEY_MISSING' });
  }
});

test('PJ-05 — MiniMax sonda GET 200/401/404 e falso 200; Z.AI richiede consenso alla sonda minima', async t => {
  let status = 200, malformato = false;
  const b = await banco(t, (r, res) => json(res, malformato ? {} : r.method === 'GET' ? { data: [{ id: 'MiniMax-M3' }] } : risposta(r.body.model), status));
  const sonda = createProviderProbe({ ...dipendenze(b.store), fetchImpl: b.rete });
  for (const [s, esito] of [[200, 'collegato'], [401, 'non-autorizzato'], [404, 'errore']]) {
    status = s; const r = await sonda.prova('minimax-anthropic'); assert.equal(r.esito, esito); assert.equal(r.httpStatus, s);
    assert.equal(b.richieste.at(-1).method, 'GET'); assert.equal(b.richieste.at(-1).url, '/minimax-anthropic/anthropic/v1/models');
    assert.equal(b.richieste.at(-1).headers['x-api-key'], 'finta-minimax-anthropic');
    if (s === 404) assert.match(r.motivo, /non è verificata/);
  }
  status = 200; malformato = true; assert.equal((await sonda.prova('minimax-anthropic')).esito, 'errore'); malformato = false;
  const prima = b.richieste.length; const nessuna = await sonda.prova('zai-anthropic');
  assert.equal(nessuna.esito, 'non-sondabile'); assert.equal(nessuna.millisecondi, null); assert.equal(b.richieste.length, prima);
  for (const [s, esito] of [[200, 'collegato'], [401, 'non-autorizzato'], [404, 'errore']]) {
    status = s; const r = await sonda.prova('zai-anthropic', { consentiGenerazione: true }); assert.equal(r.esito, esito); assert.equal(r.httpStatus, s);
    const inviata = b.richieste.at(-1); assert.equal(inviata.url, '/zai-anthropic/anthropic/v1/messages'); assert.equal(inviata.method, 'POST');
    assert.equal(inviata.body.max_tokens, 1); assert.equal(inviata.headers.authorization, 'Bearer finta-zai-anthropic');
    assert.equal(inviata.headers['anthropic-version'], '2023-06-01');
    if (s === 404) assert.match(r.motivo, /non.*verificat/);
  }
  status = 200; malformato = true; assert.equal((await sonda.prova('zai-anthropic', { consentiGenerazione: true })).esito, 'errore');
});

test('PJ-06 — MiniMax cataloga tutte le pagine; Z.AI dichiara la riserva senza chiamate implicite', async t => {
  let ciclo = false;
  const b = await banco(t, (r, res) => json(res, r.url.includes('after_id') && !ciclo ? { data: [{ id: 'MiniMax-M2.5', display_name: 'MiniMax M2.5' }], has_more: false } : { data: [{ id: 'MiniMax-M3', display_name: 'MiniMax M3' }], has_more: true, last_id: 'MiniMax-M3' }));
  const sonda = createProviderProbe({ ...dipendenze(b.store), fetchImpl: b.rete });
  const c = await sonda.elencaModelli('minimax-anthropic'); assert.deepEqual(c.modelli.map(m => m.id), ['minimax-anthropic:MiniMax-M3', 'minimax-anthropic:MiniMax-M2.5']);
  assert.equal(new URL(b.richieste[1].url, b.base).searchParams.get('after_id'), 'MiniMax-M3');
  assert.equal(b.richieste[1].headers['x-api-key'], 'finta-minimax-anthropic');
  ciclo = true; await assert.rejects(() => sonda.elencaModelli('minimax-anthropic'), { code: 'CATALOG_UPSTREAM_ERROR' });
  const prima = b.richieste.length, z = await sonda.elencaModelli('zai-anthropic');
  assert.equal(b.richieste.length, prima); assert.equal(z.fonte, 'documentazione'); assert.equal(z.credenzialeVerificata, false);
  assert.ok(z.modelli.some(m => m.id === 'zai-anthropic:glm-5.3-flash')); assert.match(z.avviso, /non verificat/);
});

test('PJ-07 — cache Anthropic terzi: letture, scritture, assenza e zero distinti', async t => {
  let usage;
  const b = await banco(t, (r, res) => json(res, risposta(r.body.model, usage)));
  for (const p of Object.keys(ATTESI)) for (const valori of [null, [0, 0], [70, 20]]) {
    usage = { input_tokens: 11, output_tokens: 2, ...(valori ? { cache_read_input_tokens: valori[0], cache_creation_input_tokens: valori[1] } : {}) };
    const u = (await (await b.invia(p)).json()).usage;
    assert.equal(tokenDaCache(usage, p), valori?.[0] ?? null); assert.equal(tokenScrittiInCache(usage, p), valori?.[1] ?? null);
    assert.equal(u.prompt_tokens_details.cached_tokens, valori?.[0]); assert.equal(u.prompt_tokens_details.cache_write_tokens, valori?.[1]);
    assert.equal(tokenScrittiInCache(u, p), valori?.[1] ?? null);
    assert.equal(u.prompt_tokens, 11 + (valori?.[0] ?? 0) + (valori?.[1] ?? 0)); assert.equal(u.total_tokens, u.prompt_tokens + 2);
  }
});

test('PJ-08 — strumenti e thinking restano dopo serializzazione; cambio fornitore toglie firme estranee', async t => {
  let primo = true;
  const contenuto = [{ type: 'thinking', thinking: 'Leggo la nota.', signature: 'firma-finta-pj' }, { type: 'tool_use', id: 'tool_pj', name: 'leggi', input: { percorso: 'nota.txt' } }];
  const b = await banco(t, (r, res) => json(res, primo ? { ...risposta(r.body.model), content: contenuto, stop_reason: 'tool_use' } : risposta(r.body.model)));
  for (const p of Object.keys(ATTESI)) {
    primo = true; const assistant = (await (await b.invia(p, { tools: attrezzi })).json()).choices[0].message;
    assert.equal(assistant.tool_calls[0].function.name, 'leggi'); assert.equal(assistant.talos_provider_state.provider, p);
    primo = false; const storia = JSON.parse(JSON.stringify([...messaggi, assistant, { role: 'tool', tool_call_id: 'tool_pj', content: 'Nota letta.' }, { role: 'user', content: 'contnua da lì' }]));
    await b.invia(p, { messages: storia, tools: attrezzi });
    assert.ok(b.richieste.at(-1).body.messages.some(m => m.content.some(c => c.type === 'thinking' && c.signature === 'firma-finta-pj')));
    assert.ok(b.richieste.at(-1).body.messages.some(m => m.content.some(c => c.type === 'tool_result' && c.tool_use_id === 'tool_pj')));
    await b.invia(p === 'minimax-anthropic' ? 'zai-anthropic' : 'minimax-anthropic', { messages: storia, tools: attrezzi });
    assert.equal(JSON.stringify(b.richieste.at(-1).body).includes('firma-finta-pj'), false);
  }
});

test('PJ-09 — SSE passa nel parser kernel con cache misurata o assente; troncamento esplicito', async t => {
  let cache = true, tronco = false;
  const b = await banco(t, (r, res) => {
    const frames = [
      { type: 'message_start', message: { ...risposta(r.body.model), content: [], stop_reason: null, usage: { input_tokens: 11, output_tokens: 0, ...(cache ? { cache_read_input_tokens: 70, cache_creation_input_tokens: 20 } : {}) } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Pronto.' } },
      { type: 'content_block_stop', index: 0 },
      ...(!tronco ? [{ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } }, { type: 'message_stop' }] : []),
    ];
    res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(frames.map(f => `event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`).join(''));
  });
  for (const p of Object.keys(ATTESI)) {
    for (const c of [true, false]) { cache = c; const r = await consumaFlussoSSE(await b.invia(p, { stream: true })); assert.equal(r.scelta.content, 'Pronto.'); assert.equal(r.usage.prompt_tokens_details.cached_tokens, c ? 70 : undefined); assert.equal(r.usage.prompt_tokens_details.cache_write_tokens, c ? 20 : undefined); }
    tronco = true; await assert.rejects(() => b.invia(p, { stream: true }).then(consumaFlussoSSE)); tronco = false;
  }
});

test('PJ-10 — 429, 401 e 5xx passano da P-H e mettono la chiave in panchina senza esporla', async t => {
  let status;
  const b = await banco(t, (r, res) => json(res, { type: 'error', error: { type: 'api_error', message: `HTTP ${status}: finta-${r.url.split('/')[1]}` } }, status, { 'Retry-After': '120' }));
  for (const p of Object.keys(ATTESI)) for (const [s, classe] of [[429, 'traffico'], [401, 'credenziale'], [500, 'guasto-fornitore'], [503, 'guasto-fornitore']]) {
    b.store.setKey(p, `finta-${p}`); status = s;
    const res = await b.invia(p, {}, { providerStore: b.store }); assert.equal(res.status, s); assert.equal((await res.text()).includes('finta-'), false);
    assert.equal(b.store.elencaPool(p)[0].causa, classe);
    const prima = b.richieste.length; await b.invia(p, {}, { providerStore: b.store }); assert.equal(b.richieste.length, prima);
  }
});

test('PJ-11 — kernel reale: rotazione seconda chiave e fallback fra porte Anthropic', async t => {
  const b = await banco(t, (r, res) => {
    if (r.headers.authorization === 'Bearer finta-zai-anthropic') json(res, { error: { message: 'rate limit' } }, 429, { 'Retry-After': '120' });
    else json(res, risposta(r.body.model));
  });
  const eventi = [], consumi = [];
  const crea = () => creaFetchMultiProvider(b.rete, { providerStore: b.store, dipendenze: dipendenze(b.store), fallbackProviders: [{ provider: 'minimax-anthropic', model: 'MiniMax-M2.5' }], onCambioFornitore: e => eventi.push(e), onConsumoFornitore: e => consumi.push(e) });
  const opzioni = { modello: 'zai-anthropic:glm-5.3-flash', chiave: 'finta-kernel', messaggi, attrezzi: [], dormi: async () => {}, caso: () => 0 };
  const esegui = f => f.eseguiConFallback(extra => chiamaConRitenta({ ...opzioni, ...extra }), opzioni);
  b.store.aggiungiChiave('zai-anthropic', 'finta-seconda');
  assert.equal((await esegui(crea())).fornitoreEffettivo, 'zai-anthropic'); assert.equal(eventi.length, 0);
  b.store.setKey('zai-anthropic', 'finta-zai-anthropic');
  // Custodia nuova per la prova fallback: la chiave aggiuntiva non deve poter servire il tentativo.
  const pool = b.store.elencaPool('zai-anthropic');
  for (const voce of pool) b.store.mettiInPanchina('zai-anthropic', voce.impronta, { classe: 'traffico', headers: new Headers({ 'Retry-After': '120' }) });
  const r = await esegui(crea()); assert.equal(r.fornitoreEffettivo, 'minimax-anthropic'); assert.equal(r.scelta.content, 'Pronto.');
  assert.equal(eventi.filter(e => e.tipo === 'cambio-fornitore').length, 1); assert.equal(consumi.at(-1).provider, 'minimax-anthropic');
  assert.equal(JSON.stringify([eventi, consumi]).includes('finta-'), false);
});

test('PJ-12 — scadenze Anthropic sui nuovi record; header assente non inventa una misura', () => {
  const ora = Date.parse('2026-09-12T12:00:00Z');
  for (const p of Object.keys(ATTESI)) {
    assert.equal(leggiScadenzaFornitore(p, { headers: { 'anthropic-ratelimit-tokens-remaining': '0', 'anthropic-ratelimit-tokens-reset': '2026-09-12T12:03:00Z' } }, ora), ora + 180000);
    assert.equal(leggiScadenzaFornitore(p, { headers: {} }, ora), null);
  }
});

test('PJ-13 — opzioni terze esplicite: nessun livello o stop ignorato in silenzio', async t => {
  const b = await banco(t, (r, res) => json(res, risposta(r.body.model)));
  for (const effort of ['high', 'max']) {
    await b.invia('zai-anthropic', { reasoning_effort: effort });
    assert.equal(b.richieste.at(-1).body.output_config.effort, effort);
    assert.equal(b.richieste.at(-1).body.thinking.type, 'adaptive');
    assert.equal(b.richieste.at(-1).body.reasoning_effort, undefined);
  }
  for (const [p, body] of [
    ['zai-anthropic', { reasoning_effort: 'low' }], ['zai-anthropic', { reasoning: { enabled: false } }],
    ['minimax-anthropic', { reasoning_effort: 'high' }], ['minimax-anthropic', { stop: ['ALT'] }], ['minimax-anthropic', { reasoning: { enabled: false } }],
  ]) {
    const prima = b.richieste.length;
    await assert.rejects(() => b.invia(p, body), { code: 'PROVIDER_REASONING_UNSUPPORTED' });
    assert.equal(b.richieste.length, prima);
  }
  for (const enabled of [true, false]) {
    await b.invia('minimax-anthropic', { model: 'MiniMax-M3', reasoning: { enabled } });
    assert.equal(b.richieste.at(-1).body.thinking.type, enabled ? 'adaptive' : 'disabled');
  }
});

test('PJ-14 — HTTP reale: credenziali, cataloghi e sonda ordinaria senza generazione implicita', async t => {
  const { createHttpApp } = await import('../src/http-app.mjs');
  const b = await banco(t, (_r, res) => json(res, { data: [{ id: 'MiniMax-M2.5', display_name: 'MiniMax M2.5' }], has_more: false }));
  const providerProbe = createProviderProbe({ ...dipendenze(b.store), fetchImpl: b.rete });
  const app = createServer(createHttpApp({ providerStore: b.store, providerProbe, staticHandler: async () => null }));
  await new Promise((resolve, reject) => { app.once('error', reject); app.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { app.close(resolve); app.closeAllConnections(); }));
  assert.notEqual(app.address().port, 4174);
  const base = `http://127.0.0.1:${app.address().port}`;
  const lista = await (await fetch(`${base}/api/v1/providers`)).json();
  assert.equal(JSON.stringify(lista).includes('finta-'), false);
  for (const [p, a] of Object.entries(ATTESI)) {
    assert.equal(lista.data.items.find(r => r.id === p).label, a.nome);
    const runtime = await fetch(`${base}/api/v1/providers/${p}/runtime`); assert.equal(runtime.status, 200);
    const catalogo = await fetch(`${base}/api/v1/providers/${p}/models`); assert.equal(catalogo.status, 200);
    assert.ok((await catalogo.json()).data.modelli.some(m => m.id.startsWith(`${p}:`)));
  }
  const prima = b.richieste.length;
  const sonda = await fetch(`${base}/api/v1/providers/zai-anthropic/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(sonda.status, 200); assert.equal((await sonda.json()).data.esito, 'non-sondabile');
  assert.equal(b.richieste.length, prima);
});

test('PJ-15 — errori HTTP durante stream: stessa panchina P-H e nessuna chiave nella risposta', async t => {
  let status;
  const b = await banco(t, (_r, res) => json(res, { type: 'error', error: { type: 'api_error', message: `HTTP ${status} finta-minimax finta-zai-anthropic` } }, status));
  for (const p of Object.keys(ATTESI)) for (const [s, classe] of [[429, 'traffico'], [401, 'credenziale'], [503, 'guasto-fornitore']]) {
    status = s; b.store.setKey(p, `finta-${p}`);
    await assert.rejects(() => b.invia(p, { stream: true }, { providerStore: b.store }).then(r => r.text()), e => !String(e).includes('finta-'));
    assert.equal(b.store.elencaPool(p)[0].causa, classe);
  }
});

test('PJ-16 — fallback nel kernel nei due versi OpenAI e Anthropic, storia strumenti preservata', async t => {
  let guasto;
  const b = await banco(t, (r, res) => {
    if (r.url.startsWith(`/${guasto}/`)) return json(res, { error: { message: 'upstream error' } }, 503);
    if (r.url.includes('/openrouter/')) return json(res, { choices: [{ message: { role: 'assistant', content: 'Pronto.' } }], usage: { prompt_tokens: 11, completion_tokens: 2 } });
    json(res, risposta(r.body.model));
  });
  const storia = [...messaggi, { role: 'assistant', content: null, tool_calls: [{ id: 'tool_pj', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"nota.txt"}' } }] }, { role: 'tool', tool_call_id: 'tool_pj', content: 'Nota già letta.' }, { role: 'user', content: 'contnua su https://esempio.test/nota' }];
  for (const [origine, riserva, model] of [['openrouter', 'minimax-anthropic', 'MiniMax-M2.5'], ['minimax-anthropic', 'openrouter', 'openai/gpt-5-nano']]) {
    guasto = origine; b.store.setKey('minimax-anthropic', 'finta-minimax-anthropic'); b.store.setKey('openrouter', 'finta-openrouter');
    const eventi = [];
    const f = creaFetchMultiProvider(b.rete, { providerStore: b.store, dipendenze: dipendenze(b.store), fallbackProviders: [{ provider: riserva, model }], onCambioFornitore: e => eventi.push(e), onConsumoFornitore: () => {} });
    const opzioni = { modello: `${origine}:${origine === 'minimax-anthropic' ? 'MiniMax-M2.5' : 'openai/gpt-5-nano'}`, chiave: 'finta-kernel', messaggi: storia, attrezzi, dormi: async () => {}, caso: () => 0 };
    const r = await f.eseguiConFallback(extra => chiamaConRitenta({ ...opzioni, ...extra }), opzioni);
    assert.equal(r.fornitoreEffettivo, riserva); assert.equal(eventi.length, 1);
    const corpo = JSON.stringify(b.richieste.at(-1).body);
    assert.ok(corpo.includes('Nota già letta.')); assert.ok(corpo.includes('https://esempio.test/nota')); assert.ok(corpo.includes('tool_pj'));
    assert.equal(JSON.stringify(eventi).includes('finta-'), false);
  }
});

test('PJ-17 — risposta incompleta del terzo usa il nome umano, senza ID tecnico', async t => {
  const b = await banco(t, (r, res) => json(res, { ...risposta(r.body.model), stop_reason: 'max_tokens' }));
  await assert.rejects(() => b.invia('zai-anthropic'), e => e.code === 'NATIVE_RESPONSE_INCOMPLETE' && e.message.includes('Z.AI (porta Anthropic)') && !e.message.includes('zai-anthropic'));
});

test('PJ-18 — senza override l’SDK usa la base del record; entrambe le autenticazioni sono isolate', async () => {
  for (const [provider, a] of Object.entries(ATTESI)) {
    let chiamate = 0;
    await nativeProviderResponse({ provider, model: a.modello, apiKey: `finta-${provider}`, body: { messages: messaggi }, fetchFn: async (url, init) => {
      chiamate++; assert.equal(String(url), `${a.base}/messages`);
      const headers = new Headers(init.headers);
      assert.equal(headers.get(a.auth), `${a.auth === 'authorization' ? 'Bearer ' : ''}finta-${provider}`);
      assert.equal(headers.has(a.auth === 'authorization' ? 'x-api-key' : 'authorization'), false);
      return Response.json(risposta(a.modello));
    } });
    assert.equal(chiamate, 1);
  }
});
