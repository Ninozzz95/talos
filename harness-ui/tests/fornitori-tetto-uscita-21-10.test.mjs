/*
 * P1 della ricognizione (21/10/2026): un limite d'uscita sopra il massimo che il registro dichiara per il modello si abbassa prima di
 * partire, con una nota; sotto il massimo, o su un modello che il registro non conosce, il corpo resta com'è.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';

test('TU-01 Z.AI: sopra 131.072 si abbassa al massimo del modello, con una nota', () => {
  const { corpo, note } = preparaRichiestaCompatibile('zai', { model: 'glm-5.3-flash', messages: [], max_tokens: 200_000 });
  assert.equal(corpo.max_tokens, 131_072);
  assert.equal(note.filter((n) => n.includes('131072')).length, 1);
  assert.equal(preparaRichiestaCompatibile('zai', { model: 'zai:GLM-5.2', messages: [], max_tokens: 500_000 }).corpo.max_tokens, 131_072, 'prefisso e maiuscole');
  assert.equal(preparaRichiestaCompatibile('zai', { model: 'glm-5.3', messages: [], max_completion_tokens: 500_000 }).corpo.max_completion_tokens, 131_072, 'anche l\'altro nome del limite');
});

test('TU-02 verso contrario: sotto il massimo, al massimo esatto e su un modello ignoto il corpo resta com\'è', () => {
  for (const max_tokens of [1, 4096, 131_072]) {
    const { corpo, note } = preparaRichiestaCompatibile('zai', { model: 'glm-5.3-flash', messages: [], max_tokens });
    assert.equal(corpo.max_tokens, max_tokens);
    assert.deepEqual(note.filter((n) => n.includes('output limit')), []);
  }
  assert.equal(preparaRichiestaCompatibile('zai', { model: 'glm-9-futuro', messages: [], max_tokens: 900_000 }).corpo.max_tokens, 900_000);
  // Groq scrive il limite come max_completion_tokens (suo profilo); senza modelliNoti nessun tetto
  assert.equal(preparaRichiestaCompatibile('groq', { model: 'openai/gpt-oss-20b', messages: [], max_tokens: 900_000 }).corpo.max_completion_tokens, 900_000, 'nessun modelliNoti');
});

test('TU-03 il corpo del chiamante non cambia', () => {
  const entrata = { model: 'glm-5.3-flash', messages: [], max_tokens: 200_000 };
  preparaRichiestaCompatibile('zai', entrata);
  assert.equal(entrata.max_tokens, 200_000);
});
