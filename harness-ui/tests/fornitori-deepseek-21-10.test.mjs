/*
 * P0 della ricognizione dei parametri dei fornitori (owner 21/10/2026: «ogni parametro definito dalla loro documentazione… previsto»).
 * DeepSeek, documentazione ufficiale letta il 21/10/2026: `thinking.type` enabled/disabled, `reasoning_effort` none/low/high/max
 * (api/create-chat-completion); con gli attrezzi il `reasoning_content` va rimandato in ogni richiesta successiva (guides/thinking_mode).
 * Prima lo sforzo partiva nella forma di OpenRouter (`reasoning: { effort }`), che DeepSeek non documenta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { createProviderProbe } from '../src/provider-probe.mjs';
import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('DS-01 lo sforzo parte nella forma di DeepSeek: thinking.type + reasoning_effort, mai `reasoning`', () => {
  for (const effort of ['low', 'high', 'max']) {
    const { corpo } = preparaRichiestaCompatibile('deepseek', { model: 'deepseek-flash', messages: [], reasoning: { effort } });
    assert.equal(Object.hasOwn(corpo, 'reasoning'), false, JSON.stringify(corpo));
    assert.equal(corpo.reasoning_effort, effort, JSON.stringify(corpo));
    assert.deepEqual(corpo.thinking, { type: 'enabled' }, JSON.stringify(corpo));
  }
  // «none» spegne il pensiero (doc: «none disables thinking mode»)
  const spento = preparaRichiestaCompatibile('deepseek', { model: 'deepseek-v4-pro', messages: [], reasoning: { effort: 'none' } }).corpo;
  assert.deepEqual(spento.thinking, { type: 'disabled' }, JSON.stringify(spento));
  assert.equal(Object.hasOwn(spento, 'reasoning'), false);
});

test('DS-04 un id fuori da modelliNoti (alias ancora accettati, id nuovi del catalogo) conserva lo sforzo; Z.AI resta per modello', () => {
  // quick_start/pricing, 21/10/2026: `deepseek-v4-flash` e `deepseek-v4-flash-vision-exp` «still accepted»
  for (const model of ['deepseek-v4-flash', 'deepseek:deepseek-v4-flash-vision-exp', 'deepseek-futuro-x']) {
    const { corpo, note } = preparaRichiestaCompatibile('deepseek', { model, messages: [], reasoning_effort: 'high' });
    assert.equal(corpo.reasoning_effort, 'high', JSON.stringify(corpo));
    assert.deepEqual(corpo.thinking, { type: 'enabled' }, JSON.stringify(corpo));
    assert.deepEqual(note, [], JSON.stringify(note));
  }
  // verso contrario: Z.AI non dichiara un ripiego, un id ignoto resta senza sforzo inventato (BUG-18)
  const zai = preparaRichiestaCompatibile('zai', { model: 'glm-ignoto', messages: [], reasoning_effort: 'high' });
  assert.equal(Object.hasOwn(zai.corpo, 'reasoning_effort'), false, JSON.stringify(zai.corpo));
});

test('DS-02 con gli attrezzi il reasoning_content dell’assistente riparte nella richiesta successiva (guides/thinking_mode: altrimenti 400)', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-deepseek-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'a.txt'), 'ciao\n');
  const corpi = []; let n = 0;
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body); corpi.push(body); n += 1;
    const usage = { prompt_tokens: 10, completion_tokens: 5 };
    if (n === 1) return Response.json({ choices: [{ message: { role: 'assistant', content: '', reasoning_content: 'PENSIERO-UNO', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.', reasoning_content: 'PENSIERO-DUE' }, finish_reason: 'stop' }], usage });
  };
  await talosLavora({ cartella, task: { consegna: 'Leggi a.txt.' }, modello: 'deepseek:deepseek-flash', chiave: 'fixture', fetchDiRete, comandoProva: 'node -e 0' });
  assert.ok(corpi.length >= 2, `premessa: due richieste (${corpi.length})`);
  const assistente = corpi[1].messages.find((m) => m.role === 'assistant' && Array.isArray(m.tool_calls));
  assert.ok(assistente, JSON.stringify(corpi[1].messages.map((m) => m.role)));
  assert.equal(assistente.reasoning_content, 'PENSIERO-UNO', `⛔ il pensiero col tool_call non riparte: ${JSON.stringify(assistente)}`);
});

test('DS-03 il traduttore compatibile non toglie il reasoning_content dai messaggi dell’assistente (la strada vera verso DeepSeek)', () => {
  const messages = [
    { role: 'user', content: 'Leggi a.txt.' },
    { role: 'assistant', content: '', reasoning_content: 'PENSIERO-UNO', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'ciao' },
  ];
  const { corpo } = preparaRichiestaCompatibile('deepseek', { model: 'deepseek-flash', messages, reasoning: { effort: 'high' } });
  assert.equal(corpo.messages[1].reasoning_content, 'PENSIERO-UNO', JSON.stringify(corpo.messages[1]));
});

test('DS-06 (D1) ogni messaggio dell\u2019assistente verso DeepSeek porta reasoning_content: il suo, o uno spazio — mai vuoto, mai inventato', () => {
  const messages = [
    { role: 'user', content: 'Leggi.' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, // giro a pensiero spento
    { role: 'tool', tool_call_id: 'c1', content: 'ciao' },
    { role: 'assistant', content: 'x', reasoning_content: '' }, // sessione vecchia: segnaposto vuoto
    { role: 'assistant', content: 'y', reasoning_content: 'PENSIERO' },
    { role: 'assistant', content: 'z', reasoning_content: null }, // dopo una compattazione
  ];
  const prima = structuredClone(messages);
  const { corpo } = preparaRichiestaCompatibile('deepseek', { model: 'deepseek-flash', messages, reasoning_effort: 'high' });
  assert.deepEqual(corpo.messages.filter((m) => m.role === 'assistant').map((m) => m.reasoning_content), [' ', ' ', 'PENSIERO', ' ']);
  assert.equal(Object.hasOwn(corpo.messages[0], 'reasoning_content'), false, 'solo i messaggi dell\u2019assistente');
  assert.equal(Object.hasOwn(corpo.messages[2], 'reasoning_content'), false);
  assert.deepEqual(messages, prima, 'il corpo del chiamante non cambia');
  // verso contrario: Z.AI non dichiara il rimando, i messaggi restano come sono
  const zai = preparaRichiestaCompatibile('zai', { model: 'glm-5.1', messages, reasoning_effort: 'high' }).corpo;
  assert.equal(Object.hasOwn(zai.messages[1], 'reasoning_content'), false, JSON.stringify(zai.messages[1]));
});

test('DS-07 (D2) la sonda dichiara lo sforzo di serie del fornitore: DeepSeek high, Z.AI resta max', async () => {
  const elenco = async (provider, variabile, id) => createProviderProbe({
    ...(() => { const store = createProviderCredentialStore({ env: { [variabile]: 'credenziale-del-server-finto' } }); return { leggiChiave: store.getKey, leggiRuntime: store.getRuntime }; })(),
    fetchImpl: async () => Response.json({ data: [{ id }] }),
  }).elencaModelli(provider);
  const ds = await elenco('deepseek', 'DEEPSEEK_API_KEY', 'deepseek-flash');
  assert.equal(ds.modelli[0].reasoning.defaultEffort, 'high', JSON.stringify(ds.modelli[0].reasoning));
  const zai = await elenco('zai', 'Z_AI_API_KEY', 'glm-5.3-flash');
  assert.equal(zai.modelli[0].reasoning.defaultEffort, 'max', 'verso contrario: Z.AI invariato');
  const conPredefinitoErrato = { ...REGISTRO_FORNITORI, deepseek: { ...REGISTRO_FORNITORI.deepseek, ragionamento: { ...REGISTRO_FORNITORI.deepseek.ragionamento, livelloPredefinito: 'medium' } } };
  assert.throws(() => verificaRegistro(conPredefinitoErrato), /default reasoning level/u);
});

test('DS-08 (D1, strada vera) il router reale verso un DeepSeek finto che risponde 400 senza ragionamento: col riempimento il giro passa', async (t) => {
  const { createServer } = await import('node:http');
  const { creaFetchMultiProvider } = await import('../src/runtime-owner-adapter.mjs');
  const ricevute = [];
  const server = createServer(async (req, res) => {
    const blocchi = []; for await (const b of req) blocchi.push(b);
    const corpo = JSON.parse(Buffer.concat(blocchi).toString()); ricevute.push(corpo);
    /* guides/thinking_mode: con gli attrezzi il reasoning_content va rimandato, altrimenti 400 */
    const manca = corpo.thinking?.type === 'enabled' && corpo.messages.some((m) => m.role === 'assistant' && !(typeof m.reasoning_content === 'string' && m.reasoning_content.length > 0));
    res.writeHead(manca ? 400 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(manca ? { error: { message: 'The reasoning_content in the thinking mode must be passed back to the API.' } }
      : { choices: [{ message: { role: 'assistant', content: 'fatto', reasoning_content: 'PENSIERO-DUE' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 } }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  assert.notEqual(server.address().port, 4174);
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: 'credenziale-del-server-finto' } });
  store.setRuntime('deepseek', { endpoint: `http://127.0.0.1:${server.address().port}` });
  const richiesta = creaFetchMultiProvider(fetch, { dipendenze: { leggiChiave: store.getKey, leggiRuntime: store.getRuntime } });
  // il giro prima era a pensiero «Spento»: l'assistente col tool_call non ha reasoning_content; ora la persona chiede «Alto»
  const messages = [
    { role: 'user', content: 'Leggi a.txt.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'ciao' },
    { role: 'user', content: 'E adesso?' },
  ];
  const risposta = await richiesta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'deepseek:deepseek-flash', messages, reasoning: { effort: 'high' }, stream: false }) });
  assert.equal(risposta.status, 200, JSON.stringify(ricevute.at(-1)?.messages));
  assert.equal(ricevute.at(-1).messages[1].reasoning_content, ' ');
});

test('DS-09 il registro accetta rimandaRagionamento solo true o assente', () => {
  const con = (rimandaRagionamento) => ({ ...REGISTRO_FORNITORI, deepseek: { ...REGISTRO_FORNITORI.deepseek, ragionamento: { ...REGISTRO_FORNITORI.deepseek.ragionamento, rimandaRagionamento } } });
  for (const errato of [false, 'true', 1, null]) assert.throws(() => verificaRegistro(con(errato)), /rimandaRagionamento/u, String(errato));
  assert.equal(verificaRegistro(con(true)), true);
});

test('DS-05 il registro respinge un ripiego malformato e accetta quello dichiarato', () => {
  assert.equal(verificaRegistro(), true);
  const conRipiego = (modelliIgnoti) => ({ ...REGISTRO_FORNITORI, deepseek: { ...REGISTRO_FORNITORI.deepseek, ragionamento: { ...REGISTRO_FORNITORI.deepseek.ragionamento, modelliIgnoti } } });
  for (const errato of [null, {}, { livelli: ['ultra'], thinking: ['enabled'] }, { livelli: ['high'], thinking: ['magico'] }, { livelli: 'high', thinking: [] }]) {
    assert.throws(() => verificaRegistro(conRipiego(errato)), /unknown models/u, JSON.stringify(errato));
  }
});
