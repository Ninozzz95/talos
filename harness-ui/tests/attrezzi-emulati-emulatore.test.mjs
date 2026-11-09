/*
 * The door of the emulated tools (`creaEmulatore`), against an engine answered by hand: which routes it calls, in which order, how many times, and what reaches the kernel.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creaEmulatore } from '../src/attrezzi-emulati.mjs';

const LEGGI = { type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const sse = (...voci) => new Response(voci.map((v) => `data: ${JSON.stringify(v)}\n\n`).join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const CHIAMATA = [{ content: '<tool_call>' }, { content: '\n{"name": "read_file", ' }, { content: '"arguments": {"path": "x"}}' }, { content: '', stop: true, stop_type: 'eos', tokens_evaluated: 9, tokens_predicted: 3, timings: { prompt_n: 2 } }];

function motore({ caps = { supports_tools: false }, parole = ['<tool_call>'], completion = () => sse(...CHIAMATA), template = () => json({ prompt: 'RESO' }), props } = {}) {
  const chiamate = [];
  const chiama = async (percorso, o = {}) => {
    const corpo = o.body ? JSON.parse(o.body) : null;
    chiamate.push({ percorso, corpo, signal: o.signal, metodo: o.method });
    if (percorso.startsWith('/props')) return props ? props() : json({ chat_template_caps: caps });
    if (percorso === '/tokenize') return json({ tokens: parole.includes(corpo.content) ? [1] : [1, 2, 3] });
    if (percorso === '/apply-template') return template(corpo);
    if (percorso === '/completion') return completion(corpo);
    throw new Error(`rotta inattesa ${percorso}`);
  };
  return { chiama, chiamate, di: (p) => chiamate.filter((c) => c.percorso.startsWith(p)) };
}
const richiesta = (altro = {}) => ({ model: 'mio/modello', stream: true, messages: [{ role: 'user', content: 'U' }], tools: [LEGGI], ...altro });
const leggiTutto = async (r) => (await r.text()).split('\n\n').filter(Boolean).map((b) => b.slice(6));

test('a model that says no: template, then completion with the rendered text, and the kernel reads the chat route', async () => {
  const m = motore();
  const e = creaEmulatore({ chiama: m.chiama, nuovoId: () => 'x' });
  const r = await e.genera(richiesta());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/event-stream');
  const righe = await leggiTutto(r);
  assert.equal(righe.at(-1), '[DONE]');
  const pezzi = righe.slice(0, -1).map((x) => JSON.parse(x));
  const parti = pezzi.flatMap((p) => p.choices[0].delta.tool_calls ?? []);
  assert.equal(parti[0].function.name, 'read_file');
  assert.equal(parti.map((c) => c.function.arguments).join(''), '{"path": "x"}');
  assert.equal(pezzi.at(-1).choices[0].finish_reason, 'tool_calls');
  assert.deepEqual(pezzi.at(-1).usage, { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 });
  assert.equal(m.di('/completion')[0].corpo.prompt, 'RESO');
  assert.equal(m.di('/completion')[0].corpo.model, 'mio/modello', 'the router chooses by it');
  assert.equal(m.di('/apply-template')[0].corpo.model, 'mio/modello');
  assert.equal(m.di('/apply-template')[0].corpo.tools, undefined, 'tools go in the text: the engine would refuse them');
  assert.equal(m.di('/props')[0].percorso, '/props?model=mio%2Fmodello&autoload=false', 'a read must not load a model behind TALOS\' back (fourth review, M9)');
  assert.equal(m.di('/props')[0].metodo, 'GET');
});

test('Performance: props and tokenize once per model, and per model', async () => {
  const m = motore();
  const e = creaEmulatore({ chiama: m.chiama });
  for (let i = 0; i < 3; i += 1) await (await e.genera(richiesta())).text();
  assert.equal(m.di('/props').length, 1);
  assert.equal(m.di('/tokenize').length, 2);
  assert.equal(m.di('/apply-template').length, 3);
  await (await e.genera(richiesta({ model: 'altro' }))).text();
  assert.equal(m.di('/props').length, 2);
});

test('a model with tools of its own goes the way of today, and it is asked once', async () => {
  const m = motore({ caps: { supports_tools: true } });
  const e = creaEmulatore({ chiama: m.chiama });
  assert.equal(await e.genera(richiesta()), null);
  assert.equal(await e.genera(richiesta()), null);
  assert.equal(m.di('/props').length, 1);
  assert.equal(m.di('/completion').length, 0);
});

test('props that fail are not remembered as an answer', async () => {
  let n = 0;
  const m = motore({ props: () => { n += 1; return n === 1 ? json({}, 503) : json({ chat_template_caps: { supports_tools: false } }); } });
  const e = creaEmulatore({ chiama: m.chiama });
  assert.equal(await e.genera(richiesta()), null);
  assert.notEqual(await e.genera(richiesta()), null);
});

test('what this door is not for does not even knock', async () => {
  const m = motore();
  const e = creaEmulatore({ chiama: m.chiama });
  for (const c of [richiesta({ stream: false }), richiesta({ tools: [] }), richiesta({ tools: undefined }), richiesta({ tool_choice: 'none' }), null]) assert.equal(await e.genera(c), null);
  assert.equal(m.chiamate.length, 0);
});

test('the format comes from the vocabulary of that model', async () => {
  const mistral = motore({ parole: ['[TOOL_CALLS]'] });
  assert.equal((await creaEmulatore({ chiama: mistral.chiama }).formatoDi('m')).id, 'mistral');
  const nessuna = motore({ parole: [] });
  const f = await creaEmulatore({ chiama: nessuna.chiama }).formatoDi('m');
  assert.deepEqual([f.id, f.nelVocabolario], ['etichette', false]);
  const una = motore();
  await (await creaEmulatore({ chiama: una.chiama }).genera(richiesta())).text();
  assert.deepEqual(una.di('/completion')[0].corpo.preserved_tokens, ['<tool_call>']);
  assert.deepEqual(una.di('/tokenize')[0].corpo, { model: 'mio/modello', content: '<tool_call>', add_special: false, parse_special: true });
});

test('an engine that says no gives the request back, and it is written down', async () => {
  for (const motoreRotto of [motore({ template: () => json({}, 500) }), motore({ completion: () => json({ error: 'schema' }, 400) })]) {
    const righe = [];
    assert.equal(await creaEmulatore({ chiama: motoreRotto.chiama, registro: (r) => righe.push(r) }).genera(richiesta()), null);
    assert.equal(righe.length, 1);
    assert.match(righe[0], /emulated tools: the (template|engine) said (500|400)/u);
  }
  const righe = [];
  const caduto = motore({ completion: () => { throw new Error('connessione chiusa'); } });
  assert.equal(await creaEmulatore({ chiama: caduto.chiama, registro: (r) => righe.push(r) }).genera(richiesta()), null);
  assert.match(righe[0], /connessione chiusa/u);
});

test('the Stop is not a failure: it goes up as it is, and it reaches every route', async () => {
  const stop = new AbortController();
  const fermato = new Error('stopped');
  const m = motore({ completion: () => { stop.abort(fermato); throw fermato; } });
  await assert.rejects(creaEmulatore({ chiama: m.chiama }).genera(richiesta(), { signal: stop.signal }), /stopped/u);
  for (const c of m.chiamate) assert.equal(c.signal, stop.signal, c.percorso);
});

test('Performance: the next step gives back what the model wrote, byte by byte', async () => {
  const m = motore();
  const e = creaEmulatore({ chiama: m.chiama, nuovoId: () => 'x' });
  const righe = await leggiTutto(await e.genera(richiesta()));
  const id = JSON.parse(righe[0]).choices[0].delta.tool_calls[0].id;
  const storia = [{ role: 'user', content: 'U' }, { role: 'assistant', content: '', tool_calls: [{ id, function: { name: 'read_file', arguments: '{"path":"x"}' } }] }, { role: 'tool', content: 'r' }];
  await (await e.genera(richiesta({ messages: storia }))).text();
  assert.equal(m.di('/apply-template')[1].corpo.messages[2].content, '<tool_call>\n{"name": "read_file", "arguments": {"path": "x"}}');
});

test('the memory of the exact texts has a roof, and it drops the oldest', async () => {
  let n = 0;
  const m = motore();
  const e = creaEmulatore({ chiama: m.chiama, nuovoId: () => { n += 1; return n; } });
  const primo = JSON.parse((await leggiTutto(await e.genera(richiesta())))[0]).choices[0].delta.tool_calls[0].id;
  const storia = (id) => [{ role: 'assistant', content: '', tool_calls: [{ id, function: { name: 'read_file', arguments: '{"path":"x"}' } }] }];
  await (await e.genera(richiesta({ messages: storia(primo) }))).text();
  assert.ok(m.di('/apply-template').at(-1).corpo.messages[1].content.includes('"name": "read_file"'), 'still remembered');
  for (let i = 0; i < 512; i += 1) await (await e.genera(richiesta())).text();
  await (await e.genera(richiesta({ messages: storia(primo) }))).text();
  assert.ok(m.di('/apply-template').at(-1).corpo.messages[1].content.includes('"name":"read_file"'), 'written out again: a read more, nothing wrong');
});

test('an answer with no call leaves no exact text, and it ends as a chat answer', async () => {
  const m = motore({ completion: () => sse({ content: 'ciao' }, { content: '', stop: true, stop_type: 'eos', tokens_evaluated: 1, tokens_predicted: 1 }) });
  const righe = await leggiTutto(await creaEmulatore({ chiama: m.chiama }).genera(richiesta()));
  const pezzi = righe.slice(0, -1).map((x) => JSON.parse(x));
  assert.equal(pezzi[0].choices[0].delta.content, 'ciao');
  assert.equal(pezzi.at(-1).choices[0].finish_reason, 'stop');
});

test('an engine that falls in the middle: no end is invented, the stream just stops', async () => {
  const m = motore({ completion: () => sse({ content: 'mezza ' }) });
  const righe = await leggiTutto(await creaEmulatore({ chiama: m.chiama }).genera(richiesta()));
  assert.equal(righe.includes('[DONE]'), false);
  assert.equal(righe.some((x) => x !== '[DONE]' && JSON.parse(x).choices[0].finish_reason), false);
});

test('a stream cancelled by the kernel reaches the engine', async () => {
  let cancellato = null;
  const corpo = new ReadableStream({ pull: (c) => c.enqueue(new TextEncoder().encode('data: {"content":"a"}\n\n')), cancel: (motivo) => { cancellato = motivo; } });
  const m = motore({ completion: () => new Response(corpo, { status: 200 }) });
  const r = await creaEmulatore({ chiama: m.chiama }).genera(richiesta());
  const l = r.body.getReader();
  await l.read();
  await l.cancel('fermato');
  assert.equal(cancellato, 'fermato');
});

test('a vocabulary that cannot be read gives the generic format, it does not stop the conversation', async () => {
  const m = motore();
  const chiama = async (p, o) => (p === '/tokenize' ? new Response('rotto', { status: 500 }) : m.chiama(p, o));
  assert.deepEqual((await creaEmulatore({ chiama }).formatoDi('m')).id, 'etichette');
});

test('thinking opened by the template is thinking, end to end', async () => {
  const m = motore({ template: () => json({ prompt: 'RESO<think>\n' }), completion: () => sse({ content: 'penso' }, { content: '', stop: true, stop_type: 'eos' }) });
  const righe = await leggiTutto(await creaEmulatore({ chiama: m.chiama }).genera(richiesta()));
  assert.equal(JSON.parse(righe[0]).choices[0].delta.reasoning_content, 'penso');
});

test('the thinking options of the conversation reach the template', async () => {
  const m = motore();
  await (await creaEmulatore({ chiama: m.chiama }).genera(richiesta({ chat_template_kwargs: { enable_thinking: false }, thinking_budget_tokens: 0, reasoning_effort: 'none' }))).text();
  const c = m.di('/apply-template')[0].corpo;
  assert.deepEqual(c.chat_template_kwargs, { enable_thinking: false });
  assert.equal(c.thinking_budget_tokens, 0, 'fourth review D8: the person switched it off');
  assert.equal(c.reasoning_effort, 'none');
});

test('fourth review M4: an error of the engine in the middle reaches the kernel as on the chat route', async () => {
  const m = motore({ completion: () => sse({ content: 'mezza ' }, { error: { code: 500, message: 'Compute error.', type: 'server_error' } }) });
  const righe = await leggiTutto(await creaEmulatore({ chiama: m.chiama }).genera(richiesta()));
  assert.deepEqual(JSON.parse(righe.at(-1)).error, { code: 500, message: 'Compute error.', type: 'server_error' });
});

test('fourth review M7: what a model says holds as long as the engine that said it', async () => {
  let avvio = 1;
  const m = motore();
  const e = creaEmulatore({ chiama: m.chiama, identitaDelMotore: () => avvio });
  await (await e.genera(richiesta())).text();
  await (await e.genera(richiesta())).text();
  assert.equal(m.di('/props').length, 1);
  avvio = 2;
  await (await e.genera(richiesta())).text();
  assert.equal(m.di('/props').length, 2, 'the same name, another engine start');
});

test('fourth review D10: the patience of the chat route reaches the long read of the prompt', async () => {
  const dispatcher = { finto: true };
  const opzioni = [];
  const m = motore();
  const chiama = (p, o) => { if (p === '/completion') opzioni.push(o); return m.chiama(p, o); };
  await (await creaEmulatore({ chiama }).genera(richiesta(), { dispatcher })).text();
  assert.equal(opzioni[0].dispatcher, dispatcher);
  opzioni.length = 0;
  await (await creaEmulatore({ chiama }).genera(richiesta())).text();
  assert.equal('dispatcher' in opzioni[0], false);
});

test('fourth review M8: what goes wrong is written by default, not lost', async () => {
  const scritte = [];
  const prima = process.stderr.write;
  process.stderr.write = (t) => { scritte.push(String(t)); return true; };
  try {
    assert.equal(await creaEmulatore({ chiama: motore({ template: () => json({}, 500) }).chiama }).genera(richiesta()), null);
  } finally { process.stderr.write = prima; }
  assert.ok(scritte.some((r) => r.includes('emulated tools: the template said 500')));
});
