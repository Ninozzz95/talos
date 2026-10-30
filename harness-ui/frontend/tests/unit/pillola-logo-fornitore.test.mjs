/*
 * Owner 28/10/2026 notte (parità col Mobile): la pillola del modello mostra il logo della VIA D'ACCESSO e solo il nome del modello.
 * `viaDelModello` usa la stessa regola di forma di `separaFonteModello` sul server (`src/model-destination.mjs:66`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { viaDelModello } from '../../src/components/chat-foot.js';

test('PILLOLA-LOGO-01 — la via d\'accesso dall\'id: OpenRouter per autore/modello, il fornitore diretto per «fornitore:», il motore locale per «local:»', () => {
  assert.equal(viaDelModello('z-ai/glm-5.3-flash'), 'openrouter');
  assert.equal(viaDelModello('~anthropic/claude-haiku-latest'), 'openrouter', 'un alias del catalogo passa da OpenRouter');
  assert.equal(viaDelModello('meta-llama/llama-4:free'), 'openrouter', 'una barra prima dei due punti: è un id di OpenRouter, non un fornitore');
  assert.equal(viaDelModello('deepseek:deepseek-v4'), 'deepseek');
  assert.equal(viaDelModello('chatgpt:gpt-6-luna'), 'chatgpt');
  assert.equal(viaDelModello('anthropic:claude-opus-5-5'), 'anthropic');
  assert.equal(viaDelModello('local:unsloth-Qwen3.5-35B-A3B-GGUF-abc-Qwen3.5-35B-A3B-Q4_K_M-gguf'), 'local');
});

test('PILLOLA-LOGO-02 — AL CONTRARIO: nessun modello ⇒ nessuna via (la pillola tiene la sua icona e l\'invito a scegliere)', () => {
  for (const vuoto of [undefined, null, '', '   ', 42]) assert.equal(viaDelModello(vuoto), null, String(vuoto));
});
