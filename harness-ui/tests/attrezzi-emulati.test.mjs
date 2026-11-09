/*
 * Tools for the models that do not have them (`src/attrezzi-emulati.mjs`). Pure functions, no engine: the proof on a real model is the bench.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FORMATI, corpoDellaCompletion, creaLettoreSse, creaTraduttore, haBisognoDiEmulazione, istruzioni, leggiChiamata, riscriviMessaggi, schemaDegliAttrezzi, scegliFormato } from '../src/attrezzi-emulati.mjs';

const LEGGI = { type: 'function', function: { name: 'read_file', description: 'Read a file.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } };
const SENZA_PARAMETRI = { type: 'function', function: { name: 'time_now' } };
const T = FORMATI.etichette;
const M = FORMATI.mistral;
const traduttore = (o = {}) => { let n = 0; return creaTraduttore({ formato: T, modello: 'm', nuovoId: () => (n += 1), adesso: () => 7, ...o }); };
const unisci = (pezzi, campo) => pezzi.map((p) => p.choices[0].delta[campo] ?? '').join('');
/** The call as the kernel rebuilds it from its pieces (`talosHarness.mjs:1252`). */
const chiamataDa = (pezzi) => {
  const parti = pezzi.flatMap((p) => p.choices[0].delta.tool_calls ?? []);
  return parti.length ? { id: parti[0].id, nome: parti[0].function?.name, argomenti: parti.map((c) => c.function?.arguments ?? '').join('') } : null;
};

test('only a template that says no: a missing answer is not a no', () => {
  assert.equal(haBisognoDiEmulazione({ chat_template_caps: { supports_tools: false } }), true);
  for (const p of [{ chat_template_caps: { supports_tools: true } }, { chat_template_caps: {} }, {}, null, undefined]) assert.equal(haBisognoDiEmulazione(p), false);
});

test('the format of the family when the vocabulary has it, the labels otherwise', () => {
  assert.equal(scegliFormato((s) => s === '[TOOL_CALLS]').id, 'mistral');
  assert.equal(scegliFormato((s) => s === '[TOOL_CALLS]').nelVocabolario, true);
  assert.equal(scegliFormato((s) => s === '<tool_call>').id, 'etichette');
  assert.equal(scegliFormato((s) => s === '<tool_call>').nelVocabolario, true);
  assert.equal(scegliFormato().id, 'etichette');
  assert.equal(scegliFormato().nelVocabolario, false);
});

test('the schema: one of the tools offered, its own arguments, and no name out of the list', () => {
  const s = schemaDegliAttrezzi([LEGGI, SENZA_PARAMETRI, { type: 'other' }, { type: 'function', function: {} }, null], T);
  assert.deepEqual(s.anyOf.map((a) => a.properties.name.const), ['read_file', 'time_now']);
  assert.deepEqual(s.anyOf[0].properties.arguments, LEGGI.function.parameters);
  assert.deepEqual(s.anyOf[1].properties.arguments, { type: 'object' }, 'a tool with no parameters still has an object');
  assert.deepEqual(s.anyOf[0].required, ['name', 'arguments']);
  assert.equal(s.anyOf[0].additionalProperties, false);
  assert.deepEqual(schemaDegliAttrezzi([{ type: 'function', function: { name: 'x', parameters: {} } }], T).anyOf[0].properties.arguments, { type: 'object' });
  const elenco = schemaDegliAttrezzi([LEGGI], M);
  assert.equal(elenco.type, 'array');
  assert.deepEqual([elenco.minItems, elenco.maxItems], [1, 1], 'one call per answer');
});

test('the request: the grammar only after the signal, the schema past the signal, and the cache on', () => {
  const c = corpoDellaCompletion({ prompt: 'P', corpo: { temperature: 0.2, max_tokens: 99, top_k: 5, messages: [], tools: [LEGGI], stream_options: {} }, tools: [LEGGI], formato: T });
  assert.equal(c.prompt, 'P');
  assert.equal(c.stream, true);
  assert.equal(c.cache_prompt, true, 'Performance: declared in the request');
  assert.equal(c.grammar_lazy, true, 'never from the first word (Constraint Tax)');
  assert.deepEqual(c.grammar_triggers, [{ type: 2, value: '<tool_call>\\s*(\\{)' }]);
  assert.ok(new RegExp(c.grammar_triggers[0].value, 'u').test('hello <tool_call>\n{'));
  assert.equal(new RegExp(c.grammar_triggers[0].value, 'u').test('hello <tool_call'), false);
  assert.equal(c.n_predict, 99);
  assert.equal(c.temperature, 0.2);
  assert.equal(c.top_k, 5);
  for (const fuori of ['messages', 'tools', 'stream_options', 'max_tokens', 'preserved_tokens']) assert.equal(fuori in c, false, fuori);
  assert.deepEqual(corpoDellaCompletion({ prompt: 'P', corpo: { max_completion_tokens: 3 }, tools: [LEGGI], formato: T }).n_predict, 3);
  assert.equal('n_predict' in corpoDellaCompletion({ prompt: 'P', corpo: {}, tools: [LEGGI], formato: T }), false);
  assert.equal('temperature' in corpoDellaCompletion({ prompt: 'P', corpo: {}, tools: [LEGGI], formato: T }), false);
});

test('a signal that is one word of the vocabulary must be kept, or the engine would not write it', () => {
  const c = corpoDellaCompletion({ prompt: 'P', corpo: {}, tools: [LEGGI], formato: scegliFormato((s) => s === '[TOOL_CALLS]') });
  assert.deepEqual(c.preserved_tokens, ['[TOOL_CALLS]']);
  assert.deepEqual(c.grammar_triggers, [{ type: 2, value: '\\[TOOL_CALLS\\]\\s*(\\[)' }]);
});

test('the history: instructions in the first system message, or a new one, and only there', () => {
  const con = riscriviMessaggi([{ role: 'system', content: 'S' }, { role: 'system', content: 'S2' }, { role: 'user', content: 'U' }], [LEGGI], T);
  assert.ok(con[0].content.startsWith('S\n\n'));
  assert.ok(con[0].content.includes('read_file'));
  assert.equal(con[1].content, 'S2');
  const senza = riscriviMessaggi([{ role: 'user', content: 'U' }], [LEGGI], T);
  assert.equal(senza[0].role, 'system');
  assert.equal(senza[1].content, 'U');
  assert.equal(riscriviMessaggi([{ role: 'developer', content: 'D' }], [LEGGI], T)[0].role, 'developer');
  assert.ok(riscriviMessaggi([{ role: 'system', content: [{ type: 'text', text: 'A' }, { type: 'image_url' }, { type: 'text', text: 'B' }] }], [LEGGI], T)[0].content.startsWith('AB\n\n'));
});

test('the history: a call becomes the model\'s text, results become one user message', () => {
  const m = riscriviMessaggi([
    { role: 'user', content: 'U' },
    { role: 'assistant', content: 'ok ', tool_calls: [{ id: 'a', function: { name: 'read_file', arguments: '{"path":"x"}' } }, { id: 'b', function: { name: 'time_now', arguments: '' } }] },
    { role: 'tool', tool_call_id: 'a', content: 'uno' },
    { role: 'tool', tool_call_id: 'b', content: [{ type: 'text', text: 'due' }] },
    { role: 'user', content: 'dopo' },
    { role: 'assistant', content: 'fine' },
  ], [LEGGI], T);
  assert.equal(m[2].content, 'ok <tool_call>{"name":"read_file","arguments":{"path":"x"}}</tool_call><tool_call>{"name":"time_now","arguments":{}}</tool_call>');
  assert.equal(m[2].tool_calls, undefined);
  assert.deepEqual(m[3], { role: 'user', content: '<tool_response>\nuno\n</tool_response>\n<tool_response>\ndue\n</tool_response>\n\ndopo' }, 'never two `user` in a row: many of these templates throw (fourth review, M2)');
  assert.deepEqual(m[4], { role: 'assistant', content: 'fine' });
});

test('arguments as an object, and results of a Mistral family', () => {
  const m = riscriviMessaggi([{ role: 'assistant', content: null, tool_calls: [{ id: 'a', function: { name: 'x', arguments: { a: 1 } } }] }, { role: 'tool', content: 'r' }], [LEGGI], M);
  assert.equal(m[1].content, '[TOOL_CALLS][{"name":"x","arguments":{"a":1}}]');
  assert.equal(m[2].content, '[TOOL_RESULTS]r[/TOOL_RESULTS]');
});

test('Performance: the same history gives the same bytes, and a turn of the model goes back exactly as it was written', () => {
  const storia = [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }, { role: 'assistant', content: '', tool_calls: [{ id: 'a', function: { name: 'read_file', arguments: '{"path":"x"}' } }] }, { role: 'tool', content: 'r' }];
  assert.deepEqual(riscriviMessaggi(storia, [LEGGI], T), riscriviMessaggi(structuredClone(storia), [LEGGI], T));
  const esatto = '<think>\nhm\n</think>\n<tool_call>\n{"name": "read_file", "arguments": {"path": "x"}}';
  assert.equal(riscriviMessaggi(storia, [LEGGI], T, new Map([['a', esatto]]))[2].content, esatto);
  const passo1 = riscriviMessaggi(storia.slice(0, 2), [LEGGI], T);
  const passo2 = riscriviMessaggi(storia, [LEGGI], T, new Map([['a', esatto]]));
  assert.deepEqual(passo2.slice(0, 2), passo1, 'what came before does not move');
});

test('a turn with two calls is not one text: it is written out', () => {
  const storia = [{ role: 'assistant', content: '', tool_calls: [{ id: 'a', function: { name: 'x', arguments: '{}' } }, { id: 'b', function: { name: 'y', arguments: '{}' } }] }];
  assert.ok(riscriviMessaggi(storia, [LEGGI], T, new Map([['a', 'esatto']]))[1].content.includes('"y"'));
});

test('the instructions say the format, every tool, and that answering is open', () => {
  const t = istruzioni([LEGGI, SENZA_PARAMETRI], T);
  assert.ok(t.includes('<tool_call>{"name":"tool_name","arguments":{"argument":"value"}}</tool_call>'));
  assert.ok(t.includes(JSON.stringify({ name: 'read_file', description: 'Read a file.', parameters: LEGGI.function.parameters })));
  assert.ok(t.includes('{"name":"time_now","description":"","parameters":{"type":"object"}}'));
  assert.ok(t.includes('If no tool is needed, just answer.'));
  assert.ok(istruzioni([LEGGI], M).includes('[TOOL_CALLS][{"name":"tool_name"'));
});

test('reading a call: with or without the closing label, and what is not one is null', () => {
  assert.deepEqual(leggiChiamata(' {"name":"a","arguments":{"b":1}}\n', T), { nome: 'a', argomenti: '{"b":1}' });
  assert.deepEqual(leggiChiamata('{"name":"a","arguments":{}}</tool_call>\n', T), { nome: 'a', argomenti: '{}' });
  assert.deepEqual(leggiChiamata('{"name":"a","arguments":"{\\"b\\":1}"}', T), { nome: 'a', argomenti: '{"b":1}' });
  assert.deepEqual(leggiChiamata('[{"name":"a","arguments":{}}]', M), { nome: 'a', argomenti: '{}' });
  for (const no of ['{"name":"a"', '{"arguments":{}}', '{"name":"","arguments":{}}', '{"name":"a"}', '7', 'null']) assert.equal(leggiChiamata(no, T), null, no);
  assert.deepEqual(leggiChiamata('{"name":"a","arguments":{}}', M), { nome: 'a', argomenti: '{}' }, 'one call written bare, by a model without the grammar (fifth review, R-03)');
  assert.equal(leggiChiamata('{"name":"a","arguments":{}}</tool_call> e poi la risposta', T), null, 'a quoted example, followed by an answer (fifth review, R-04)');
});

test('text passes at once, and only what could be a label is held back', () => {
  const t = traduttore();
  assert.equal(unisci(t.spingi('ciao '), 'content'), 'ciao ');
  assert.equal(unisci(t.spingi('a <to'), 'content'), 'a ');
  assert.equal(unisci(t.spingi('ol'), 'content'), '');
  assert.equal(unisci(t.spingi('do x'), 'content'), '<tooldo x', 'not a label after all');
  const fine = t.fine({ stop_type: 'eos' });
  assert.equal(fine.at(-1).choices[0].finish_reason, 'stop');
});

test('the end gives back a held piece: nothing is lost', () => {
  const t = traduttore();
  t.spingi('a <tool');
  assert.equal(unisci(t.fine({}), 'content'), '<tool');
});

test('a call, cut in pieces of any size, comes out as the chat route writes it', () => {
  for (const passo of [1, 2, 3, 7, 1000]) {
    const t = traduttore();
    const testo = 'guardo<tool_call>\n{"name": "read_file", "arguments": {"path": "x"}}';
    const pezzi = [];
    for (let i = 0; i < testo.length; i += passo) pezzi.push(...t.spingi(testo.slice(i, i + passo)));
    assert.equal(unisci(pezzi, 'content'), 'guardo', `passo ${passo}`);
    const fine = t.fine({ stop_type: 'eos', tokens_evaluated: 10, tokens_predicted: 4, timings: { prompt_n: 3 } });
    assert.deepEqual(chiamataDa([...pezzi, ...fine]), { id: 'emulata-talos-1', nome: 'read_file', argomenti: '{"path": "x"}' }, 'the arguments as the model wrote them, without the last brace of the envelope');
    assert.equal(fine.at(-1).choices[0].finish_reason, 'tool_calls');
    assert.deepEqual(fine.at(-1).usage, { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 });
    assert.deepEqual(fine.at(-1).timings, { prompt_n: 3 }, 'the engine times reach the kernel (`talosHarness.mjs:1208`)');
    assert.equal(t.testoEsatto(), testo);
    assert.equal(t.idChiamata(), 'emulata-talos-1');
  }
});

test('thinking is thinking, also when the template opened it in the prompt', () => {
  const t = traduttore();
  const a = t.spingi('<think>penso</th');
  const b = t.spingi('ink>detto');
  assert.equal(unisci(a, 'reasoning_content'), 'penso');
  assert.equal(unisci(b, 'content'), 'detto');
  const aperto = traduttore({ prompt: 'x<think>\n' });
  assert.equal(unisci(aperto.spingi('penso'), 'reasoning_content'), 'penso');
  assert.equal(unisci(aperto.spingi('</think>detto'), 'content'), 'detto');
  assert.equal(aperto.testoEsatto(), '<think>\npenso</think>detto');
  const senzaACapo = traduttore({ prompt: 'x<think>' });
  senzaACapo.spingi('a</think>b');
  assert.equal(senzaACapo.testoEsatto(), '<think>a</think>b', 'byte by byte, whatever the template opened');
  assert.equal(unisci(traduttore({ prompt: 'x<think>fine</think>' }).spingi('testo'), 'content'), 'testo');
});

test('a signal inside the thinking is not a call', () => {
  const t = traduttore();
  const p = [...t.spingi('<think>forse <tool_call> no</think>ok')];
  const f = t.fine({});
  assert.ok(unisci([...p, ...f], 'reasoning_content').includes('<tool_call> no'));
  assert.equal(unisci([...p, ...f], 'content'), 'ok', 'what came after the thinking is the answer');
  assert.equal(f.at(-1).choices[0].finish_reason, 'stop');
});

test('a call cut by the limit of words is not lost: it reaches the person and the reason says so', () => {
  const t = traduttore();
  t.spingi('<tool_call>{"name":"x","argum');
  const f = t.fine({ stop_type: 'limit' });
  assert.equal(unisci(f, 'content'), '<tool_call>{"name":"x","argum');
  assert.equal(f.at(-1).choices[0].finish_reason, 'length');
  assert.equal(f.some((p) => p.choices[0].delta.tool_calls), false);
});

test('an answer with no usage from the engine has no invented one', () => {
  assert.equal('usage' in traduttore().fine({}).at(-1), false);
  assert.equal('timings' in traduttore().fine({}).at(-1), false);
});

test('the Mistral family, through the same reader', () => {
  const t = traduttore({ formato: M });
  const pezzi = t.spingi('[TOOL_CALLS] [{"name":"a","arguments":{"b":2}}]');
  assert.deepEqual(chiamataDa([...pezzi, ...t.fine({})]), { id: 'emulata-talos-1', nome: 'a', argomenti: '{"b":2}' });
});

test('fourth review D3: a long call is not silent: the name at once, the arguments in pieces, before the end', () => {
  const t = traduttore();
  const primi = t.spingi('<tool_call>{"name": "write_file", "arguments": {"path": "x", "content": "');
  assert.deepEqual(primi[0].choices[0].delta.tool_calls, [{ index: 0, id: 'emulata-talos-1', type: 'function', function: { name: 'write_file', arguments: '' } }]);
  const dopo = t.spingi('riga '.repeat(100));
  assert.ok(dopo.length > 0, 'data for the kernel, or it cuts the stream after 300 s');
  assert.ok(chiamataDa([...primi, ...dopo]).argomenti.startsWith('{"path": "x", "content": "riga riga'));
  const fine = t.fine({ stop_type: 'eos' });
  assert.equal(fine.at(-1).choices[0].finish_reason, 'tool_calls', 'fifth review R-03: the engine said eos, so the call goes, and the tool says what is wrong with it');
  const t2 = traduttore();
  t2.spingi('<tool_call>{"name": "w", "arguments": {"c": "' + 'x'.repeat(200));
  assert.equal(t2.fine({ stop_type: 'limit' }).at(-1).choices[0].finish_reason, 'length', 'cut by the limit');
});

test('fourth review D3: what goes out in pieces rebuilds exactly the arguments, whatever the closing', () => {
  for (const chiusura of ['}', '}\n', ' }', '}\n</tool_call>', '}</tool_call>\n']) {
    const t = traduttore();
    const argomenti = `{"content": "${'x'.repeat(300)}"}`;
    const pezzi = t.spingi(`<tool_call>{"name": "w", "arguments": ${argomenti}${chiusura}`);
    const fine = t.fine({ stop_type: 'eos' });
    assert.equal(chiamataDa([...pezzi, ...fine]).argomenti, argomenti, JSON.stringify(chiusura));
    assert.equal(fine.at(-1).choices[0].finish_reason, 'tool_calls');
  }
});

test('fourth review D3: a model free of the grammar can write the fields in another order: the call is read whole at the end', () => {
  const t = traduttore();
  assert.deepEqual(t.spingi('<tool_call>{"arguments": {"b": 1}, "name": "a"}'), []);
  assert.deepEqual(chiamataDa(t.fine({})), { id: 'emulata-talos-1', nome: 'a', argomenti: '{"b":1}' });
});

test('fourth review D6: a whole call written inside the thinking is the call: the grammar closed it there, and nothing else would follow', () => {
  const t = traduttore();
  t.spingi('<think>I should answer like this: <tool_call>{"name": "read_file", "arguments": {"path": "x"}}');
  const fine = t.fine({ stop_type: 'eos' });
  assert.deepEqual(chiamataDa(fine), { id: 'emulata-talos-1', nome: 'read_file', argomenti: '{"path":"x"}' });
  assert.equal(fine.at(-1).choices[0].finish_reason, 'tool_calls');
  const prova = traduttore();
  prova.spingi('<think>forse <tool_call> no');
  assert.equal(prova.fine({}).at(-1).choices[0].finish_reason, 'stop', 'the label alone is not a call');
  const finita = traduttore();
  finita.spingi('<think>a <tool_call>{"name": "x", "arguments": {}}</think>ok');
  assert.equal(finita.fine({}).at(-1).choices[0].finish_reason, 'stop', 'the thinking closed: it was an example');
});

test('fourth review D9: the closing label inside the arguments of a valid call', () => {
  const testo = JSON.stringify({ name: 'write_file', arguments: { content: 'the end is </tool_call> here' } });
  assert.deepEqual(leggiChiamata(testo, T), { nome: 'write_file', argomenti: '{"content":"the end is </tool_call> here"}' });
  assert.deepEqual(leggiChiamata(`${testo}</tool_call>`, T)?.nome, 'write_file');
  assert.deepEqual(leggiChiamata(`${testo}\n</tool_call>\n`, T)?.nome, 'write_file');
});

test('fifth review R-01, R-02: a call written while thinking, with a signal or a closing of the thinking inside its arguments', () => {
  const t = traduttore();
  const argomenti = JSON.stringify({ content: 'a <tool_call> b </think> c' });
  const p = t.spingi(`<think>scrivo: <tool_call>{"name": "w", "arguments": ${argomenti}}`);
  assert.equal(p.some((x) => x.choices[0].delta.tool_calls), false, 'inside the thinking it is read whole at the end');
  const f = t.fine({ stop_type: 'eos' });
  assert.deepEqual(chiamataDa(f), { id: 'emulata-talos-1', nome: 'w', argomenti });
  assert.equal(unisci([...p, ...f], 'content'), '', 'nothing of the call reaches the answer');
});

test('fifth review R-05: a piece of arguments never ends in half a character', () => {
  const t = traduttore();
  const pezzi = [];
  const testo = `<tool_call>{"name": "w", "arguments": {"c": "${'😀'.repeat(200)}"}}`;
  for (let i = 0; i < testo.length; i += 7) pezzi.push(...t.spingi(testo.slice(i, i + 7)));
  let pezziDegliArgomenti = 0;
  for (const x of pezzi) for (const c of x.choices[0].delta.tool_calls ?? []) {
    if (!c.function.arguments) continue;
    pezziDegliArgomenti += 1;
    assert.equal(/[\uD800-\uDBFF]$/.test(c.function.arguments), false, 'no piece ends in a lone high surrogate');
    assert.equal(/^[\uDC00-\uDFFF]/.test(c.function.arguments), false, 'no piece starts with a lone low surrogate');
  }
  assert.ok(pezziDegliArgomenti > 5, 'the arguments really travelled in pieces');
  assert.equal(chiamataDa([...pezzi, ...t.fine({})]).argomenti, `{"c": "${'😀'.repeat(200)}"}`);
});

test('fourth review M3: `<think>` in the middle of an answer is a word of the answer', () => {
  const t = traduttore();
  const p = t.spingi('Metti il tag <think> nel template e ricordati di chiuderlo.');
  assert.equal(unisci(p, 'content'), 'Metti il tag <think> nel template e ricordati di chiuderlo.');
  assert.equal(unisci(traduttore().spingi('\n  <think>penso'), 'reasoning_content'), 'penso', 'only spaces before it: the answer has not started');
  const seconda = traduttore();
  seconda.spingi('Ecco.');
  assert.equal(unisci(seconda.spingi(' <think>x'), 'content'), ' <think>x', 'also in a later piece');
});

test('every piece carries the shape of the chat route', () => {
  const [p] = traduttore().spingi('x');
  assert.deepEqual(p, { id: 'talos-1', object: 'chat.completion.chunk', created: 7, model: 'm', choices: [{ index: 0, delta: { content: 'x' }, finish_reason: null }] });
});

test('a user message with parts after a result stays as it is: images are not text', () => {
  const pezzi = [{ type: 'text', text: 'dopo' }, { type: 'image_url', image_url: { url: 'x' } }];
  const m = riscriviMessaggi([{ role: 'tool', content: 'r' }, { role: 'user', content: pezzi }], [LEGGI], T);
  assert.deepEqual(m.at(-1), { role: 'user', content: pezzi });
});

test('a result after a message of the person stays apart: only results join', () => {
  const m = riscriviMessaggi([{ role: 'user', content: 'U' }, { role: 'tool', content: 'r' }], [LEGGI], T);
  assert.deepEqual(m.slice(1), [{ role: 'user', content: 'U' }, { role: 'user', content: '<tool_response>\nr\n</tool_response>' }]);
});

test('the first signal decides, not the first in the list: a label inside the arguments is an argument', () => {
  const t = traduttore();
  const pezzi = t.spingi('<tool_call>{"name":"a","arguments":{"b":"<think>"}}');
  assert.deepEqual(chiamataDa([...pezzi, ...t.fine({})]), { id: 'emulata-talos-1', nome: 'a', argomenti: '{"b":"<think>"}' });
});

test('the stream reader: pieces of any size, and what is not data stays out', () => {
  const leggi = creaLettoreSse();
  assert.deepEqual(leggi('data: {"a"'), []);
  assert.deepEqual(leggi(':1}\r\n\ndata: {"b":2}\n\nevent: x\ndata: [DONE]\n\ndata: rotto\n'), [{ a: 1 }, { b: 2 }]);
});

/* E1, decision 121 (FORMA-CARTA-EMULATI-D-2026-11-03, test 14): every emulated call says so in its id, so the kernel can put the card
 * in front of it. The mark can only ADD a card: a provider that sent `emulata-` by chance would make TALOS ask more, never less. */
test('E1-14: every emulated id starts with emulata-, while streaming and at the end, in both families', () => {
  for (const formato of [T, M]) {
    const t = traduttore({ formato });
    const testo = formato === T ? '<tool_call>{"name": "write_file", "arguments": {"path": "x", "content": "y"}}' : '[TOOL_CALLS] [{"name":"write_file","arguments":{"path":"x"}}]';
    const pezzi = [];
    for (const c of testo) pezzi.push(...t.spingi(c));
    const fine = t.fine({});
    const ids = [...pezzi, ...fine].flatMap((p) => p.choices[0].delta.tool_calls ?? []).map((c) => c.id).filter(Boolean);
    assert.ok(ids.length > 0, `${formato.id}: the call came out`);
    for (const id of ids) assert.match(id, /^emulata-/, `${formato.id}: ${id}`);
    assert.match(t.idChiamata(), /^emulata-/);
    assert.equal(chiamataDa([...pezzi, ...fine]).id, t.idChiamata(), 'the id the kernel sees is the id the emulator remembers');
  }
});
