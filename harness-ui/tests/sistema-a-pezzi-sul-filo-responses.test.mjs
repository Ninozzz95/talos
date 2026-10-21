/*
 * ⛔ CLI 0.6.10 (17/10/2026), dal vivo sul piano ChatGPT dell'owner (fork di una chat rotta, diagnostico temporaneo): il servizio
 *   rispondeva HTTP 400 `invalid_value` «Invalid value: 'text'. Supported values are: 'input_text', …» su
 *   `input[3].content[0].type`. In una chat LUNGA, dopo un cambio del progetto, l'ultimo messaggio di sistema è l'aggiornamento
 *   appeso in coda; il kernel lo marca per la cache come `[{ type: 'text', text, cache_control }]` (`conMarcatoreDiCache`, prefisso
 *   oltre 16.000 caratteri) e l'adattatore lo passava com'era: un `developer` con un pezzo `text`, che il filo Responses rifiuta.
 *   Da lì ogni giro della chat falliva. Una chat corta resta sotto la soglia, ed è per questo che una prova corta passava.
 * SAS-01 il piano col marcatore vero del kernel · SAS-02 la chiave API OpenAI, stesso filo · SAS-03 Anthropic tiene il marcatore.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { conMarcatoreDiCache } from '../src/kernel/talosHarness.mjs';
import { creaFetchDelPiano } from '../src/chatgpt-richiesta.mjs';
import { nativeProviderResponse, toNativeMessages } from '../src/native-provider-adapter.mjs';
import { fornitore } from '../src/provider-registry.mjs';

const sse = (pezzi) => `${pezzi.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('')}data: [DONE]\n\n`;
const COMPLETA = [{ type: 'response.completed', response: { id: 'r', status: 'completed', output: [{ type: 'message', id: 'm', role: 'assistant', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1 } } }];
const AGGIORNAMENTO = 'Project context update: the following REPLACES the working sheet, project instructions and folder map you received earlier in this conversation. Those no longer apply.\n\nWorking sheet — v2';

/** Una chat lunga (oltre la soglia della cache) con l'aggiornamento del progetto appeso dopo la domanda nuova, marcata dal kernel. */
function chatLungaMarcata() {
  const storia = [{ role: 'system', content: 'You are a coding agent.' }, { role: 'system', content: 'Working sheet — v1' }, { role: 'user', content: 'Start.' }];
  for (let i = 0; i < 12; i += 1) {
    storia.push({ role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.js"}' } }] });
    storia.push({ role: 'tool', tool_call_id: `c${i}`, content: 'x'.repeat(2000) });
  }
  storia.push({ role: 'assistant', content: 'Done.' }, { role: 'user', content: 'And now?' }, { role: 'system', content: AGGIORNAMENTO });
  return conMarcatoreDiCache(storia);
}

async function richiesta(provider, messaggi) {
  let corpo = null;
  const rete = async (_url, opzioni) => { corpo = JSON.parse(opzioni.body); return new Response(sse(COMPLETA), { status: 200, headers: { 'content-type': 'text/event-stream' } }); };
  const r = await nativeProviderResponse({ provider, model: 'gpt-6.1-sol', apiKey: 'test-only-key', baseURL: 'https://api.openai.com/v1',
    fetchFn: provider === 'chatgpt' ? creaFetchDelPiano(rete) : rete, body: { messages: messaggi, stream: true } });
  await r.text();
  return corpo;
}
const pezziText = (input) => input.flatMap((v) => (Array.isArray(v.content) ? v.content : [])).filter((c) => c?.type === 'text');

test('SAS-01 — piano ChatGPT: l\'aggiornamento marcato dal kernel arriva come testo, nessun pezzo `text` nella richiesta', async () => {
  const messaggi = chatLungaMarcata();
  assert.ok(Array.isArray(messaggi.at(-1).content) && messaggi.at(-1).content[0].cache_control, 'premessa: il kernel ha marcato l\'aggiornamento in coda (chat oltre la soglia)');
  const { input } = await richiesta('chatgpt', messaggi);
  assert.deepEqual(pezziText(input), [], 'a plan request carries a content part of type `text`: the service answers 400 invalid_value');
  const ultimo = input.at(-1);
  assert.equal(ultimo.role, 'developer');
  assert.equal(ultimo.content, AGGIORNAMENTO, 'the update is not sent as its plain text');
});

test('SAS-02 — chiave API OpenAI, stesso filo Responses: stesso testo, niente pezzi `text`', async () => {
  const { input } = await richiesta('openai', chatLungaMarcata());
  assert.deepEqual(pezziText(input), []);
  assert.equal(input.at(-1).content, AGGIORNAMENTO);
});

/* ⛔ Revisione 3 del bugfixer (17/10): sul filo Anthropic l'SDK metteva l'ARRAY intero dentro `text` del blocco di sistema (corpo
   catturato), e su Gemini dentro `parts[].text`: la stessa richiesta storta, e il marcatore perso. La prova prima diceva «tiene
   cache_control» solo perché la parola compariva DENTRO quel testo: ora si guarda la forma. */
async function corpoAnthropic(provider) {
  let corpo = null;
  const model = 'claude-sonnet-5-5';
  await nativeProviderResponse({ provider, model, apiKey: 'test-only-key', body: { messages: chatLungaMarcata() },
    fetchFn: async (_url, init) => { corpo = JSON.parse(init.body); return new Response(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 2 } }), { headers: { 'content-type': 'application/json' } }); } });
  return corpo;
}
for (const provider of ['anthropic', 'zai-anthropic', 'minimax-anthropic']) {
  test(`SAS-03 — ${provider}: ogni blocco di sistema ha un testo STRINGA, e l'aggiornamento porta il marcatore della cache dove l'API lo legge`, async () => {
    const corpo = await corpoAnthropic(provider);
    const sistema = Array.isArray(corpo.system) ? corpo.system : [{ type: 'text', text: corpo.system }];
    assert.ok(sistema.every((b) => typeof b.text === 'string'), `a system block of ${provider} carries a non-string text: ${JSON.stringify(sistema.map((b) => typeof b.text))}`);
    const blocco = sistema.find((b) => b.text.startsWith('Project context update'));
    assert.ok(blocco, 'the update is not in the system blocks');
    /* owner 21/10/2026 sera, «come Hermes» (revisione M1): il marcatore solo a chi lo DICHIARA nel registro. Z.AI sulla porta Anthropic
       non lo dichiara e la sua documentazione non lo nomina (letta il 21/10): il testo resta stringa, il marcatore non parte. */
    if (fornitore(provider).cache?.marcatore === 'cache_control') {
      assert.deepEqual(blocco.cache_control, { type: 'ephemeral', ttl: '1h' }, 'the cache marker did not reach the update\'s system block');
      assert.equal(sistema.filter((b) => b.cache_control).length, 1, 'only the block the kernel marked carries the marker');
    } else {
      assert.equal(sistema.filter((b) => b.cache_control).length, 0, `${provider} does not declare the marker: none is sent`);
    }
  });
}

test('SAS-04 — Gemini: le istruzioni di sistema sono testo, mai un array dentro `text`', async () => {
  let corpo = null;
  await nativeProviderResponse({ provider: 'gemini', model: 'gemini-3-flash', apiKey: 'test-only-key', body: { messages: chatLungaMarcata() },
    fetchFn: async (_url, init) => { corpo = JSON.parse(init.body); return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 } }); } });
  const parti = corpo.systemInstruction?.parts ?? [];
  assert.ok(parti.length > 0, 'premessa: Gemini riceve le istruzioni di sistema');
  assert.ok(parti.every((p) => typeof p.text === 'string'), 'a Gemini system part carries a non-string text');
  assert.ok(parti.some((p) => p.text.startsWith('Project context update')), 'the update is not among the Gemini system parts');
});

test('SAS-05 AL CONTRARIO — un pezzo che non è testo in un sistema si ferma, non si scarta in silenzio', () => {
  assert.throws(() => toNativeMessages([{ role: 'system', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }, { role: 'user', content: 'x' }], { provider: 'chatgpt', model: 'm' }),
    /Content not supported by the provider: image_url/u);
});
