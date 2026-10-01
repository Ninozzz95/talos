/*
 * ⭐ RISPOSTA TAGLIATA DAL TETTO (owner 30/09 sera: «sì, dopo OEM36»; richiesta della lane CLI, ticket F-001 del benchmark).
 * Quando il modello si ferma perché ha finito lo spazio per la risposta (`max_tokens`), la risposta arriva tagliata e nessuno
 * lo diceva. L'evento `risposta` del kernel ora porta, in modo ADDITIVO come `usage` e `totali`:
 *   · `motivoFine`: il motivo così come l'ha dato il fornitore, solo se noto;
 *   · `troncataDalTetto: true`: solo quando il taglio è per il tetto — `length`, o il motivo nativo `max_tokens` /
 *     `MAX_TOKENS` / `max_output_tokens` che OpenRouter porta in `native_finish_reason`.
 * Come normalizzano gli altri (letti nel codice il 30/09): Pi `packages/ai/src/types.ts:443` (StopReason «length») e
 * `api/anthropic-messages.ts:1510` (max_tokens → length); Hermes `tests/agent/test_anthropic_truncation_continuation.py:59`
 * («max_tokens stop_reason must map to OpenAI-style 'length'»). Solo il SEGNALE: la continuazione automatica di Hermes
 * (`agent/turn_truncation.py`) è un'altra decisione, non presa.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
function flusso(fotogrammi) {
  return new Response(new ReadableStream({
    start(c) {
      for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  }));
}
async function rispostaCon(chiusura) {
  const eventi = [];
  await talosLavora({
    cartella: cartellaDiProva('talos-finish-reason-'), task: { consegna: 'scrivi' }, modello: 'x', chiave: 'y',
    onDelta: () => {}, onGiro: (e) => eventi.push(e),
    fetchDiRete: async () => flusso([{ choices: [{ delta: { content: 'testo a metà' } }] }, chiusura]),
  });
  return eventi.find((e) => e.tipo === 'risposta');
}

test('FINISH-LENGTH: a response cut by max_tokens says so on the risposta event', async () => {
  const e = await rispostaCon({ choices: [{ delta: {}, finish_reason: 'length' }] });
  assert.equal(e.motivoFine, 'length');
  assert.equal(e.troncataDalTetto, true);
  assert.equal(e.risposta.content, 'testo a metà', 'the partial text is kept as it arrived');
});

for (const nativo of ['max_tokens', 'MAX_TOKENS', 'max_output_tokens']) test(`FINISH-NATIVE-${nativo}: the provider's native reason also marks the cut`, async () => {
  const e = await rispostaCon({ choices: [{ delta: {}, finish_reason: 'stop', native_finish_reason: nativo }] });
  assert.equal(e.motivoFine, 'stop');
  assert.equal(e.troncataDalTetto, true);
});

test('FINISH-STOP: a normal end carries its reason and no cut flag', async () => {
  const e = await rispostaCon({ choices: [{ delta: {}, finish_reason: 'stop' }] });
  assert.equal(e.motivoFine, 'stop');
  assert.equal('troncataDalTetto' in e, false);
});

test('FINISH-UNKNOWN: without a reason from the provider nothing is invented', async () => {
  const e = await rispostaCon({ choices: [{ delta: {} }] });
  assert.equal('motivoFine' in e, false);
  assert.equal('troncataDalTetto' in e, false);
});
