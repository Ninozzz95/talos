/*
 * ⛔ 08/10/2026 (owner: «impossibile che su Anthropic 5.x non si possa aggiustare il ragionamento») — LO SFORZO ARRIVA A CLAUDE PER NOME, E I BLOCCHI
 * DI PENSIERO NON INCASTRANO LA SESSIONE.
 *
 * (1) Il `reasoning` comune dell'SDK (4.0.49) non conosce «max» e manda «xhigh» come «max» sui modelli che non la dichiarano; con le opzioni esplicite il
 *     livello scelto dalla persona (i cinque che Anthropic dichiara in `capabilities.effort`) va a `output_config.effort` tale e quale, con
 *     `thinking:{type:"adaptive", display:"summarized"}`.
 * (2) Dal Fable 5.1 un blocco di pensiero firmato vale solo finché `system`, `tools` e i messaggi prima restano uguali (account dal 31/08/2026: 400 su ogni
 *     richiesta dopo). Per i modelli 5.1+ si chiede ad Anthropic di scartare il blocco invalido (`block_binding.prefix_mismatch_behavior:"drop_block"`),
 *     con la beta `thinking-binding-controls-2026-08-01` che l'SDK aggiunge da sé. Letto: OpenCode transform.ts:690-739 (24/09/2026); doc Anthropic
 *     «Preserved thinking» (08/10/2026); misurato dal vivo il perimetro dei modelli (scratchpad/live/binding-scope.mjs).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { anthropicAccettaXhigh, anthropicLegaIlPensiero, anthropicPensaAdattivo, nativeProviderResponse } from '../src/native-provider-adapter.mjs';

const messages = [{ role: 'system', content: 'Aiuta la persona.' }, { role: 'user', content: 'Dimmi pronto.' }];
const reply = (model) => ({ id: 'msg_test', type: 'message', role: 'assistant', model, content: [{ type: 'text', text: 'pronto' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 2 } });
async function invia(model, body) {
  let wire;
  await nativeProviderResponse({
    provider: 'anthropic', model, apiKey: 'test-only-key', body: { messages, ...body },
    fetchFn: async (url, init) => { wire = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) }; return new Response(JSON.stringify(reply(model)), { headers: { 'content-type': 'application/json' } }); },
  });
  return wire;
}
const BETA = 'thinking-binding-controls-2026-08-01';
const stato = (model, parti) => ({ role: 'assistant', content: 'ok', talos_provider_state: { version: 1, provider: 'anthropic', model, content: parti } });
const CON_PENSIERO = (model) => [...messages, stato(model, [{ type: 'reasoning', text: 'penso', providerOptions: { anthropic: { signature: 'firma' } } }, { type: 'text', text: 'ok' }]), { role: 'user', content: 'e poi?' }];

test('SFORZO-1: ognuno dei cinque livelli arriva a Claude per nome (anche «max» e «xhigh»), con il ragionamento adattivo che mostra il testo', async () => {
  for (const livello of ['low', 'medium', 'high', 'xhigh', 'max']) {
    const { body } = await invia('claude-opus-5-5', { reasoning_effort: livello });
    assert.equal(body.output_config.effort, livello, `livello ${livello}`);
    assert.equal(body.thinking.type, 'adaptive');
    assert.equal(body.thinking.display, 'summarized', 'senza, i modelli nuovi restituiscono blocchi di pensiero vuoti');
  }
  const { body } = await invia('claude-opus-5-5', { reasoning: { effort: 'max' } });
  assert.equal(body.output_config.effort, 'max', 'anche dalla forma `reasoning.effort` del desktop');
});

test('SFORZO-2: modelli 5.1+ — il pensiero chiede di SCARTARE il blocco invalido, con la beta; i modelli prima no', async () => {
  for (const modello of ['claude-opus-5-5', 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1']) {
    const wire = await invia(modello, { reasoning_effort: 'high' });
    assert.deepEqual(wire.body.thinking.block_binding, { prefix_mismatch_behavior: 'drop_block' }, modello);
    assert.match(wire.headers.get('anthropic-beta') ?? '', new RegExp(BETA), modello);
  }
  for (const modello of ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-opus-4-6']) {
    const wire = await invia(modello, { reasoning_effort: 'high' });
    assert.equal(wire.body.thinking.block_binding, undefined, `${modello}: il legame non c'è prima del 5.1`);
    assert.doesNotMatch(wire.headers.get('anthropic-beta') ?? '', new RegExp(BETA), modello);
    assert.equal(wire.body.output_config.effort, 'high', modello);
  }
});

test('SFORZO-3: AL CONTRARIO — un modello a budget (prima del 4.6) resta sul percorso dell’SDK, come prima', async () => {
  const { body } = await invia('claude-haiku-4-5-20251001', { reasoning_effort: 'high' });
  assert.equal(body.thinking.type, 'enabled');
  assert.equal(typeof body.thinking.budget_tokens, 'number');
  assert.equal(body.output_config?.effort, undefined);
});

test('SFORZO-4: senza ragionamento richiesto e senza blocchi in storia la richiesta NON porta `thinking` (nessun costo imposto)', async () => {
  for (const modello of ['claude-opus-5-5', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']) {
    const { body, headers } = await invia(modello, {});
    assert.equal(body.thinking, undefined, modello);
    assert.equal(body.output_config, undefined, modello);
    assert.doesNotMatch(headers.get('anthropic-beta') ?? '', new RegExp(BETA), modello);
  }
});

test('SFORZO-5: senza pensiero richiesto ma con blocchi firmati dello stesso modello in storia, un modello 5.1+ manda il SOLO legame; gli altri niente', async () => {
  const lega = await invia('claude-opus-5-5', { messages: CON_PENSIERO('claude-opus-5-5') });
  assert.deepEqual(lega.body.thinking, { block_binding: { prefix_mismatch_behavior: 'drop_block' } }, 'forma «recovery»: nessun tipo, il pensiero non si accende');
  assert.match(lega.headers.get('anthropic-beta') ?? '', new RegExp(BETA));
  assert.equal((await invia('claude-sonnet-4-6', { messages: CON_PENSIERO('claude-sonnet-4-6') })).body.thinking, undefined);
  assert.equal((await invia('claude-opus-5-5', { messages: CON_PENSIERO('claude-fable-5-1') })).body.thinking, undefined, 'blocchi di un ALTRO modello non si rimandano: niente da legare');
});

test('SFORZO-6: spegnere il ragionamento e un livello che Anthropic non conosce NON entrano nelle opzioni esplicite', async () => {
  const spento = await invia('claude-opus-5-5', { reasoning: { enabled: false } });
  assert.equal(spento.body.thinking?.block_binding, undefined);
  assert.equal(spento.body.output_config?.effort, undefined);
  const minimo = await invia('claude-opus-5-5', { reasoning_effort: 'minimal' });
  assert.equal(minimo.body.thinking?.block_binding, undefined, '«minimal» lo traduce l’SDK come prima');
  assert.equal(minimo.body.output_config.effort, 'low');
});

test('SFORZO-7: le due regole sull’id — adattivo dal 4.6, legame dal 5.1 (Mythos 5.1 escluso), id senza versione = moderno senza legame', () => {
  const tabella = {
    'claude-opus-5-5': [true, true], 'claude-haiku-5-5': [true, true], 'claude-sonnet-5-5': [true, true], 'claude-fable-5-1': [true, true],
    'claude-mythos-5-1': [true, false], 'claude-opus-5': [true, false], 'claude-sonnet-5': [true, false], 'claude-fable-5': [true, false],
    'claude-opus-4-8': [true, false], 'claude-opus-4-7': [true, false], 'claude-sonnet-4-6': [true, false], 'claude-opus-4-6': [true, false],
    'claude-opus-4-5-20251101': [false, false], 'claude-haiku-4-5-20251001': [false, false], 'claude-sonnet-4-5-20250929': [false, false],
    'claude-futuro': [true, false],
  };
  for (const [id, [adattivo, lega]] of Object.entries(tabella)) {
    assert.equal(anthropicPensaAdattivo(id), adattivo, `adattivo ${id}`);
    assert.equal(anthropicLegaIlPensiero(id), lega, `legame ${id}`);
  }
});

/* 08/10/2026, controprova dal vivo: `claude-opus-4-6` con effort «xhigh» risponde 400 «This model does not support effort level 'xhigh'. Supported levels:
   high, low, max, medium». Prima delle opzioni esplicite l'SDK lo mandava come «max»; Hermes (anthropic_adapter.py:75,181,617, clone 07/10/2026), Pi
   (anthropic-messages.ts:841-864, 26/09) e OpenCode (transform.ts:660-684, 23/09) fanno lo stesso: dove «xhigh» non esiste si sale a «max». */
test('SFORZO-8: «xhigh» su un modello 4.6 va come «max» (il 400 dal vivo), dal 4.7 va per nome; gli altri livelli non si toccano', async () => {
  for (const modello of ['claude-opus-4-6', 'claude-sonnet-4-6']) {
    assert.equal((await invia(modello, { reasoning_effort: 'xhigh' })).body.output_config.effort, 'max', `${modello}: xhigh non esiste`);
    for (const livello of ['low', 'medium', 'high', 'max']) {
      assert.equal((await invia(modello, { reasoning_effort: livello })).body.output_config.effort, livello, `${modello}: ${livello} resta com'è`);
    }
  }
  for (const modello of ['claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5-5', 'claude-sonnet-5', 'claude-fable-5-1', 'claude-futuro']) {
    assert.equal((await invia(modello, { reasoning_effort: 'xhigh' })).body.output_config.effort, 'xhigh', `${modello}: xhigh per nome`);
  }
  assert.equal((await invia('claude-opus-4-6', { reasoning: { effort: 'xhigh' } })).body.output_config.effort, 'max', 'anche dalla forma `reasoning.effort`');
  assert.equal(anthropicAccettaXhigh('claude-opus-4-6'), false);
  assert.equal(anthropicAccettaXhigh('claude-opus-4-20250514'), false, 'la data nell’id non è una versione');
  assert.equal(anthropicAccettaXhigh('claude-opus-4-2025'), false, 'un anno nudo non è un minore: la versione ha al massimo due cifre');
  assert.equal(anthropicAccettaXhigh('claude-opus-4-7'), true);
});
