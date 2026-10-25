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

test('B9-NOME (revisione a blocco 9, nota sulla Home e la barra) — targhe locali corte o strane: un nome pulito, mai doppio o di spazi', () => {
  assert.equal(nomeModello('local:   '), null, 'solo spazi: niente riga');
  assert.equal(nomeModello('local:7B'), '7B', 'non «7B · 7B»');
  assert.equal(nomeModello('local:Q4_K_M'), 'Q4_K_M', 'non «K M»');
  assert.equal(nomeModello('local:author-Model-Q4_K_M.gguf'), 'Model · Q4_K_M', 'la quantizzazione non resta nel nome');
  assert.equal(nomeModello('local:Mistral-7B-Instruct-v0.3.Q4_K_M.gguf'), 'Mistral · 7B · Q4_K_M', 'anche dopo un punto');
  /* A10-9 (blocco 10): «0-6B» è 0,6 B, non 6 B; «Llama-3-8B» resta 8 B */
  assert.equal(nomeModello('local:Qwen-Qwen3-0-6B-GGUF-23749fef-Qwen3-0-6B-Q8-0-gguf'), 'Qwen3 · 0.6B · Q8_0');
  assert.equal(nomeModello('local:meta-Llama-3-8B-Q4_K_M.gguf'), 'Llama 3 · 8B · Q4_K_M');
  /* il verso contrario: i casi di sempre restano uguali */
  assert.equal(nomeModello('local:bartowski-Qwen3-8B-Q4_K_M.gguf'), 'Qwen3 · 8B · Q4_K_M');
  assert.equal(nomeModello('chatgpt:gpt-6-luna'), 'gpt-6-luna');
});
