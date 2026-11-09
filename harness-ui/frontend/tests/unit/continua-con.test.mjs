/*
 * «Continua adesso con…» (owner 27/10/2026 notte, «Sì, un clic per continuare»; bozzetto approvato il 28/10): quali modelli proporre
 * quando il piano ChatGPT ha finito l'uso. Solo modelli GIÀ configurati, mai quello bloccato, mai scelti al posto della persona.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { fornitoreDelModello, modelliPerContinuare } from '../../src/components/continua-con.js';

const riga = (modelId, alle) => ({ sessionId: `s-${modelId}-${alle}`, modelId, modello: modelId, ultimaRispostaAlle: alle, avviataAlle: alle });
// in disordine apposta: l'elenco del server non promette un ordine, la recenza la decide la funzione
const SESSIONI = [
  riga('local:qwen3.5-4b-vecchio', '2026-10-01T10:00:00.000Z'),
  riga('deepseek:deepseek-v4-flash', '2026-10-17T10:00:00.000Z'),
  riga('chatgpt:gpt-6-luna', '2026-10-28T08:00:00.000Z'),
  riga('z-ai/glm-5.3-flash', '2026-10-25T21:39:39.263Z'),
  riga('chatgpt:gpt-6.1-sol', '2026-10-22T17:44:52.630Z'),
  riga('local:LiquidAI-LFM2-5-24B-A2B-GGUF-0912d33141f7-LFM2-5-24B-A2B-Q4-K-M-gguf', '2026-10-19T14:14:42.350Z'),
  riga('z-ai/glm-5.3-flash', '2026-10-18T10:00:00.000Z'),
  riga('gemini:gemini-3.5-flash', '2026-10-16T10:00:00.000Z'),
];

test('CONTINUA-01 — il fornitore si legge dall\'id: locale, diretto col prefisso, OpenRouter con la barra; un id che non si sa leggere è null', () => {
  assert.equal(fornitoreDelModello('local:qwen3.5-9b'), 'local');
  assert.equal(fornitoreDelModello('chatgpt:gpt-6-luna'), 'chatgpt');
  assert.equal(fornitoreDelModello('zai:glm-5.3-flash'), 'zai');
  assert.equal(fornitoreDelModello('z-ai/glm-5.3-flash'), 'openrouter');
  for (const storto of ['', '   ', null, undefined, 42, 'boh:modello', 'senza-niente']) assert.equal(fornitoreDelModello(storto), null, String(storto));
});

test('CONTINUA-02 — le proposte: i più recenti, uno per modello, mai il fornitore bloccato, solo fornitori configurati o modelli locali; al massimo due', () => {
  impostaLingua('en');
  const proposte = modelliPerContinuare({ sessioni: SESSIONI, bloccato: 'chatgpt:gpt-6-luna', configurati: new Set(['openrouter', 'gemini', 'openai', 'chatgpt']) }); // il piano collegato è «configurato», ma è lui il bloccato
  assert.deepEqual(proposte.map((p) => p.valore), ['z-ai/glm-5.3-flash', 'local:LiquidAI-LFM2-5-24B-A2B-GGUF-0912d33141f7-LFM2-5-24B-A2B-Q4-K-M-gguf']);
  assert.equal(proposte[0].testo, 'glm-5.3-flash');
  assert.equal(proposte[0].fornitore, 'OpenRouter');
  assert.doesNotMatch(proposte[1].testo, /^local:/u, 'un modello locale col suo nome umano, mai la targa');
  // con tre posti entra Gemini; DeepSeek no: la sua chiave non c'è
  assert.deepEqual(modelliPerContinuare({ sessioni: SESSIONI, bloccato: 'chatgpt:gpt-6-luna', configurati: new Set(['openrouter', 'gemini']), massimo: 3 }).map((p) => p.valore),
    ['z-ai/glm-5.3-flash', 'local:LiquidAI-LFM2-5-24B-A2B-GGUF-0912d33141f7-LFM2-5-24B-A2B-Q4-K-M-gguf', 'gemini:gemini-3.5-flash']);
  impostaLingua('it');
});

test('CONTINUA-03 (verso contrario) — niente sessioni, niente fornitori configurati, o solo modelli del piano bloccato: nessuna proposta', () => {
  assert.deepEqual(modelliPerContinuare({ sessioni: [], bloccato: 'chatgpt:gpt-6-luna', configurati: new Set(['openrouter']) }), []);
  assert.deepEqual(modelliPerContinuare({ sessioni: SESSIONI.filter((r) => r.modelId.startsWith('chatgpt:')), bloccato: 'chatgpt:gpt-6-luna', configurati: new Set(['openrouter']) }), []);
  // senza sapere chi è configurato restano solo i modelli di questo computer, che non chiedono chiavi
  assert.deepEqual(modelliPerContinuare({ sessioni: SESSIONI, bloccato: 'chatgpt:gpt-6-luna', configurati: null }).map((p) => p.valore),
    ['local:LiquidAI-LFM2-5-24B-A2B-GGUF-0912d33141f7-LFM2-5-24B-A2B-Q4-K-M-gguf', 'local:qwen3.5-4b-vecchio']);
  // un elenco storto non rompe
  assert.deepEqual(modelliPerContinuare({ sessioni: [null, 3, { modelId: '' }], bloccato: null, configurati: new Set() }), []);
});
