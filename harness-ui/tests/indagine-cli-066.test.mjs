/*
 * ⛔ INDAGINE per la sessione CLI (bugfixer, 15/10/2026) — base r4 `e1cbc26f4`. Prove ROSSE apposta, ciascuna col suo controllo.
 *  - F-Y-001: sul filo Responses (piano ChatGPT) l'adattatore (`native-provider-adapter.mjs:199-204`) costruisce gli argomenti di una
 *    chiamata SOLO dai pezzi `tool-input-delta`. Se il flusso porta gli argomenti solo in `response.output_item.done` (nessun
 *    `response.function_call_arguments.delta`), l'SDK `@ai-sdk/openai` 4.0.61 emette `tool-input-start` e poi `tool-call` con
 *    l'`input` intero — e l'adattatore ignora quel `tool-call`: al kernel arriva `arguments: ''`, cioè `{}`. Un attrezzo senza
 *    argomenti obbligatori (`elenca`) «funziona», `chatgpt_account` risponde «needs action…».
 *  - F-Y-004: tre chiamate IDENTICHE nella stessa risposta ⇒ `limitaRipetizioniIdentiche` (`talosHarness.mjs:631-652`) tiene le
 *    prime DUE e scarta dalla terza; la nota dice «The extra copies were not run», ma una copia è girata.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-INDAGINE-CLI-066-2026-10-15.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { limitaRipetizioniIdentiche, notaCopieScartate } from '../src/kernel/talosHarness.mjs';

const sse = (eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
function flussoResponses({ conDelta }) {
  const argomenti = '{"action":"status"}';
  const voce = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'chatgpt_account', arguments: '', status: 'in_progress' };
  return sse([
    { type: 'response.created', sequence_number: 0, response: { id: 'resp_1', created_at: 1, model: 'gpt-x', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', sequence_number: 1, output_index: 0, item: voce },
    ...(conDelta ? [{ type: 'response.function_call_arguments.delta', sequence_number: 2, output_index: 0, item_id: 'fc_1', delta: argomenti }] : []),
    { type: 'response.output_item.done', sequence_number: 3, output_index: 0, item: { ...voce, arguments: argomenti, status: 'completed' } },
    { type: 'response.completed', sequence_number: 4, response: { id: 'resp_1', created_at: 1, model: 'gpt-x', status: 'completed', output: [{ ...voce, arguments: argomenti, status: 'completed' }],
      usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
  ]);
}
async function argomentiArrivati({ conDelta }) {
  const risposta = await nativeProviderResponse({
    provider: 'chatgpt', model: 'gpt-x', apiKey: 'token-del-piano',
    body: { stream: true, messages: [{ role: 'user', content: 'status?' }],
      tools: [{ type: 'function', function: { name: 'chatgpt_account', description: 'ChatGPT account', parameters: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] } } }] },
    fetchFn: async () => new Response(flussoResponses({ conDelta }), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
  });
  const testo = await risposta.text();
  let argomenti = null;
  for (const riga of testo.split('\n')) {
    if (!riga.startsWith('data: ') || riga === 'data: [DONE]') continue;
    for (const c of JSON.parse(riga.slice(6)).choices?.[0]?.delta?.tool_calls ?? []) {
      if (c.function?.arguments !== undefined) argomenti = (argomenti ?? '') + c.function.arguments;
    }
  }
  return argomenti;
}

test('F-Y-001 controllo — with argument deltas on the Responses wire the arguments reach the kernel', async () => {
  assert.equal(await argomentiArrivati({ conDelta: true }), '{"action":"status"}');
});

test('F-Y-001 (S2) — arguments only in response.output_item.done (no delta events): the kernel receives an empty string', async () => {
  assert.equal(await argomentiArrivati({ conDelta: false }), '{"action":"status"}', 'the tool-call part carries the full input, and the adapter drops it');
});

test('F-Y-004 (S3) — three identical calls in one answer: only ONE runs (contract R54), and the note does not say the opposite of what happened', () => {
  const copia = (id) => ({ id, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } });
  const { toolCalls, ripetizione } = limitaRipetizioniIdentiche([copia('1'), copia('2'), copia('3')]);
  assert.ok(ripetizione, 'premessa: la ripetizione è vista');
  // la nota cambia forma con la cura di F-Y-002 (prefisso comune): la premessa resta «dice che le copie non sono girate»
  assert.match(notaCopieScartate(ripetizione), /extra copies were not run/iu, 'premessa: la nota dice che le copie non sono girate');
  assert.equal(toolCalls.length, 1, `${toolCalls.length} identical copies are kept and run`);
});
