/*
 * Revisione della strada nativa (21/10/2026), coi casi chiesti dalla CLI: per ciascun filo (Anthropic, Responses, Gemini) il tetto d'uscita
 * passa come `finish_reason: 'length'` col testo parziale e senza stato firmato; la finestra piena (Anthropic `model_context_window_exceeded`)
 * esce come «contesto pieno» e non entra MAI nella catena delle continuazioni; uno `stop` normale non cambia.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { classificaErroreFornitore } from '../src/kernel/compattazione-desktop.mjs';

const messaggi = [{ role: 'user', content: 'Scrivi tanto.' }];
const anthropic = (stop_reason) => Response.json({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Parziale' }],
  stop_reason, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 2 } });
const gemini = (finishReason) => Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'Parziale' }] }, finishReason }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } });
const responses = (incompleto) => {
  const fine = incompleto
    ? { type: 'response.incomplete', response: { id: 'r1', created_at: 0, model: 'gpt-5-mini', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: { input_tokens: 5, output_tokens: 2 } } }
    : { type: 'response.completed', response: { id: 'r1', created_at: 0, model: 'gpt-5-mini', output: [], usage: { input_tokens: 5, output_tokens: 2 } } };
  const eventi = [
    { type: 'response.created', response: { id: 'r1', created_at: 0, model: 'gpt-5-mini' } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'm1', role: 'assistant', content: [] } },
    { type: 'response.output_text.delta', item_id: 'm1', output_index: 0, content_index: 0, delta: 'Parziale' },
    fine,
  ];
  return new Response(eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
};
const chiama = (provider, model, risposta, extra = {}) => nativeProviderResponse({ provider, model, apiKey: 'test-only-key', body: { messages: messaggi, ...extra }, fetchFn: async () => risposta() });

/** Gli eventi SSE che il kernel riceverebbe: l'ultimo `finish_reason` e se c'è stato firmato. */
async function letturaFlusso(risposta) {
  const testo = await risposta.text();
  const pacchetti = testo.split('\n\n').filter((r) => r.startsWith('data: {')).map((r) => JSON.parse(r.slice(6)));
  const fine = pacchetti.map((p) => p.choices?.[0]?.finish_reason).filter(Boolean).at(-1);
  return { fine, firmato: pacchetti.some((p) => p.choices?.[0]?.delta?.talos_provider_state), testo: pacchetti.map((p) => p.choices?.[0]?.delta?.content ?? '').join('') };
}

test('NATIVE-FINE-01 tetto d\'uscita senza streaming: `length` col testo parziale, senza stato firmato (Anthropic, Gemini)', async () => {
  for (const [provider, model, risposta] of [['anthropic', 'claude-opus-5-5', () => anthropic('max_tokens')], ['gemini', 'gemini-3-flash', () => gemini('MAX_TOKENS')]]) {
    const corpo = await (await chiama(provider, model, risposta)).json();
    assert.equal(corpo.choices[0].finish_reason, 'length', provider);
    assert.equal(corpo.choices[0].message.content, 'Parziale', provider);
    assert.equal(Object.hasOwn(corpo.choices[0].message, 'talos_provider_state'), false, `${provider}: niente stato firmato da un taglio`);
  }
});

test('NATIVE-FINE-02 tetto d\'uscita in streaming: `length` (Anthropic, Responses, Gemini)', async () => {
  const sseAnthropic = () => new Response([
    { type: 'message_start', message: { id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Parziale' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'max_tokens', stop_sequence: null }, usage: { output_tokens: 2 } },
    { type: 'message_stop' },
  ].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  const sseGemini = () => new Response(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Parziale' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  for (const [provider, model, risposta] of [['anthropic', 'claude-opus-5-5', sseAnthropic], ['gemini', 'gemini-3-flash', sseGemini], ['openai', 'gpt-5-mini', () => responses(true)]]) {
    const letto = await letturaFlusso(await chiama(provider, model, risposta, { stream: true }));
    assert.equal(letto.fine, 'length', provider);
    assert.equal(letto.firmato, false, provider);
    assert.match(letto.testo, /Parziale/u, provider);
  }
});

test('NATIVE-FINE-03 finestra piena (Anthropic): mai `length`; senza streaming un 400 col marcatore che il classificatore riconosce', async () => {
  const risposta = await chiama('anthropic', 'claude-opus-5-5', () => anthropic('model_context_window_exceeded'));
  assert.equal(risposta.status, 400);
  const testo = await risposta.text();
  assert.equal(JSON.parse(testo).error.code, 'context_length_exceeded');
  assert.equal(classificaErroreFornitore({ message: testo, status: 400 }), 'contesto-pieno');
});

test('NATIVE-FINE-04 finestra piena in streaming: un errore col marcatore, nessun pacchetto `length` prima', async () => {
  const sse = () => new Response([
    { type: 'message_start', message: { id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Parziale' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'model_context_window_exceeded', stop_sequence: null }, usage: { output_tokens: 2 } },
    { type: 'message_stop' },
  ].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  const risposta = await chiama('anthropic', 'claude-opus-5-5', sse, { stream: true });
  const lettore = risposta.body.getReader();
  let testo = '';
  let errore = null;
  try { for (;;) { const { done, value } = await lettore.read(); if (done) break; testo += new TextDecoder().decode(value); } } catch (e) { errore = e; }
  assert.ok(errore, 'il flusso finisce con un errore');
  assert.equal(errore.code, 'NATIVE_CONTEXT_WINDOW_EXCEEDED');
  assert.equal(classificaErroreFornitore({ message: errore.message }), 'contesto-pieno');
  assert.doesNotMatch(testo, /"finish_reason":"length"/u, 'una finestra piena non entra mai nella catena delle continuazioni');
});

test('NATIVE-FINE-05 verso contrario: uno `stop` normale resta com\'era, con lo stato firmato', async () => {
  const corpo = await (await chiama('anthropic', 'claude-opus-5-5', () => anthropic('end_turn'))).json();
  assert.equal(corpo.choices[0].finish_reason, 'stop');
  assert.ok(corpo.choices[0].message.talos_provider_state);
  assert.equal((await letturaFlusso(await chiama('openai', 'gpt-5-mini', () => responses(false), { stream: true }))).fine, 'stop');
});
