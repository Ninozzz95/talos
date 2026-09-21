import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeProviderResponse, toNativeMessages, stripNativeMetadata } from '../src/native-provider-adapter.mjs';
import { consumaFlussoSSE } from '../src/kernel/talosHarness.mjs';

const picture = 'data:image/png;base64,iVBORw0KGgo=';
const messages = [{ role: 'system', content: 'Aiuta la persona.' }, { role: 'user', content: [{ type: 'text', text: 'Cosa vedi?' }, { type: 'image_url', image_url: { url: picture } }] }];
const tools = [{ type: 'function', function: { name: 'leggi', description: 'Legge un file', parameters: { type: 'object', properties: { percorso: { type: 'string' } }, required: ['percorso'] } } }];
const native = (provider, body, fetchFn, extra = {}) => nativeProviderResponse({ provider, model: provider === 'anthropic' ? 'claude-sonnet-5' : 'gemini-3.8-flash', apiKey: 'test-only-key', body, fetchFn, ...extra });
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const anthropicReply = { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: 'Vedo due forme.' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 17, output_tokens: 5 } };
const geminiReply = { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'leggi', args: { percorso: 'nota.txt' } }, thoughtSignature: 'signed-by-provider' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 7, totalTokenCount: 27 }, modelVersion: 'gemini-3.8-flash' };

test('NATIVE-10 OpenAI Responses conserva immagini, strumenti e ragionamento cifrato', async () => {
  let wire;
  const reply = {id:'resp_test',created_at:1700000000,model:'gpt-5.4-mini',status:'completed',output:[
    {type:'reasoning',id:'rs_test',summary:[],encrypted_content:'encrypted-fixture'},
    {type:'function_call',id:'fc_test',call_id:'call_test',name:'leggi',arguments:'{"percorso":"nota.txt"}',status:'completed'},
  ],usage:{input_tokens:30,output_tokens:9,total_tokens:39,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:2}},error:null,incomplete_details:null};
  const result = await native('openai',{messages,tools,reasoning:{effort:'low'}},async(url,init)=>{wire={url:String(url),body:JSON.parse(init.body)};return json(reply);},{model:'gpt-5.4-mini'});
  const assistant = (await result.json()).choices[0].message;
  assert.match(wire.url,/api\.openai\.com\/v1\/responses$/);
  assert.equal(wire.body.store,false);
  assert.equal(wire.body.reasoning.effort,'low');
  assert.ok(wire.body.include.includes('reasoning.encrypted_content'));
  assert.ok(wire.body.input.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='input_image'&&p.image_url===picture)));
  assert.equal(wire.body.tools[0].name,'leggi');
  assert.equal(assistant.tool_calls[0].id,'call_test');
  const restored=JSON.parse(JSON.stringify([...messages,assistant,{role:'tool',tool_call_id:'call_test',content:'Contenuto letto'}]));
  await native('openai',{messages:restored,tools},async(_url,init)=>{wire=JSON.parse(init.body);return json({...reply,output:[{type:'message',id:'msg_test',role:'assistant',status:'completed',content:[{type:'output_text',text:'Ho letto.',annotations:[]}]}]});},{model:'gpt-5.4-mini'});
  assert.ok(wire.input.some(p=>p.type==='reasoning'&&p.encrypted_content==='encrypted-fixture'));
  assert.ok(wire.input.some(p=>p.type==='function_call_output'&&p.call_id==='call_test'&&p.output==='Contenuto letto'));
});

test('NATIVE-01 Anthropic usa Messages nativo con pixel e schema strumenti', async () => {
  let wire;
  const result = await native('anthropic', { messages, tools }, async (url, init) => { wire = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) }; return json(anthropicReply); });
  const output = await result.json();
  assert.match(wire.url, /api\.anthropic\.com\/v1\/messages$/);
  assert.equal(wire.headers.get('x-api-key'), 'test-only-key');
  assert.equal(wire.body.messages[0].content.find(x => x.type === 'image').source.data, 'iVBORw0KGgo=');
  assert.equal(wire.body.tools[0].name, 'leggi');
  assert.equal(output.choices[0].message.content, 'Vedo due forme.');
  assert.equal(output.usage.prompt_tokens, 17);
  assert.ok(!JSON.stringify(output).includes('test-only-key'));
});

test('NATIVE-02 Gemini conserva firma dopo serializzazione e risultato strumento', async () => {
  let wire;
  const result = await native('gemini', { messages, tools }, async (url, init) => { wire = { url: String(url), body: JSON.parse(init.body) }; return json(geminiReply); });
  const assistant = (await result.json()).choices[0].message;
  assert.match(wire.url, /:generateContent$/);
  assert.equal(wire.body.contents[0].parts.find(x => x.inlineData).inlineData.data, 'iVBORw0KGgo=');
  const restored = JSON.parse(JSON.stringify([...messages, assistant, { role: 'tool', tool_call_id: assistant.tool_calls[0].id, content: 'La decisione è verde.' }]));
  await native('gemini', { messages: restored, tools }, async (url, init) => { wire = JSON.parse(init.body); return json({ ...geminiReply, candidates: [{ content: { role: 'model', parts: [{ text: 'Verde.' }] }, finishReason: 'STOP' }] }); });
  assert.equal(wire.contents.find(x => x.role === 'model').parts.find(x => x.functionCall).thoughtSignature, 'signed-by-provider');
  assert.equal(wire.contents.at(-1).parts[0].functionResponse.name, 'leggi');
});

test('NATIVE-03 stream Gemini passa dal parser kernel con usage e firma', async () => {
  const frames = [geminiReply];
  const result = await native('gemini', { messages, tools, stream: true }, async () => new Response(frames.map(x => `data: ${JSON.stringify(x)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } }));
  const parsed = await consumaFlussoSSE(result);
  assert.equal(parsed.scelta.tool_calls[0].function.name, 'leggi');
  assert.equal(parsed.scelta.talos_provider_state.provider, 'gemini');
  assert.equal(parsed.usage.prompt_tokens, 20);
});

test('NATIVE-04 errore e annullamento non diventano risposte vuote riuscite', async () => {
  await assert.rejects(() => native('anthropic', { messages }, async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'Chiave rifiutata' } }), { status: 401, headers: { 'content-type': 'application/json' } })), /Chiave rifiutata/);
  const abort = new AbortController(); abort.abort();
  let calls = 0;
  await assert.rejects(() => native('gemini', { messages }, async () => { calls++; return json(geminiReply); }, { signal: abort.signal }));
  assert.equal(calls, 0);
});

test('NATIVE-05 cambio provider elimina stato estraneo senza cambiare testo o strumenti', () => {
  const assistant = { role: 'assistant', content: 'ok', talos_provider_state: { version: 1, provider: 'gemini', model: 'gemini-3.8-flash', content: [{ type: 'text', text: 'secret-signature-text', providerOptions: { google: { thoughtSignature: 'firma' } } }] } };
  assert.deepEqual(stripNativeMetadata([assistant]), [{ role: 'assistant', content: 'ok' }]);
  assert.equal(toNativeMessages([assistant], { provider: 'anthropic', model: 'claude-sonnet-5' })[0].content[0].text, 'ok');
  assert.ok(assistant.talos_provider_state);
  assert.throws(() => toNativeMessages([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'http://localhost/private' } }] }], { provider: 'gemini' }), /immagine/i);
});

test('NATIVE-07 stream troncato fallisce esplicitamente e inoltra stopSequences', async () => {
  let body;
  const result = await native('gemini', { messages, stream: true, stop: ['ALT'] }, async (_, init) => {
    body = JSON.parse(init.body);
    return new Response('data: ' + JSON.stringify({ ...geminiReply, candidates: [{ content: { role: 'model', parts: [{ text: 'Parziale' }] }, finishReason: 'MAX_TOKENS' }] }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  await assert.rejects(() => result.text(), /incompleta.*length/);
  assert.deepEqual(body.generationConfig.stopSequences, ['ALT']);
});

test('NATIVE-08 EOF senza finishReason non viene promosso a risposta riuscita', async () => {
  const result = await native('gemini', { messages, stream: true }, async () => new Response('data: ' + JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{text:'Un quad'}] } }], usageMetadata:{promptTokenCount:20,candidatesTokenCount:18,totalTokenCount:38} }) + '\n\n', { headers:{'content-type':'text/event-stream'} }));
  await assert.rejects(() => consumaFlussoSSE(result), /incompleta.*other/);
});
