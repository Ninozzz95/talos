// R-08 (13/09/2026), giro da utente nuovo: la riga della sessione stampava la targa intera del
// modello locale («local:Qwen-Qwen3-0-6B-GGUF-…-Q8-0-gguf»), un nome tecnico a schermo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeModello } from '../../src/components/session-item.js';

test('R08-RIGA — un modello cloud mostra solo il nome, senza il fornitore', () => {
  assert.equal(nomeModello('z-ai/glm-5.3-flash'), 'glm-5.3-flash');
  assert.equal(nomeModello('openai/gpt-6'), 'gpt-6');
});

test('R08-RIGA — un modello locale mostra un nome leggibile, mai la targa con «local:»', () => {
  const riga = nomeModello('local:Qwen-Qwen3-0-6B-GGUF-23749fef-Qwen3-0-6B-Q8-0-gguf');
  assert.doesNotMatch(riga, /^local:/i);
  assert.doesNotMatch(riga, /gguf/i);
  assert.match(riga, /Qwen3/);
  assert.match(riga, /Q8_0/);
});

test('R08-RIGA — AL CONTRARIO: niente modello, niente riga', () => {
  assert.equal(nomeModello(''), null);
  assert.equal(nomeModello(undefined), null);
});
