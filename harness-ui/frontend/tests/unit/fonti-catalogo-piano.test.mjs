/*
 * 11/10/2026 — trovato dal vivo con l'account dell'owner collegato: nel selettore dei modelli il gruppo «ChatGPT plan» non compariva
 * (owner: «fai in modo che anche nella modale di selezione del modello appaiano i modelli dell'abbonamento»). Il selettore decideva
 * chi ha un catalogo dall'elenco delle CHIAVI (`/api/v1/providers`), e il piano non è una chiave: è un accesso
 * (`/api/v1/auth/chatgpt/stato`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fornitoriConCatalogo, fontiDelSelettore } from '../../src/components/fonti-modelli.js';

const CHIAVI = [{ id: 'openai', keyConfigured: false }, { id: 'deepseek', keyConfigured: true }, { id: 'lmstudio', keyConfigured: false }];

test('CATALOGO-PIANO-01: col piano collegato e abilitato «chatgpt» ha un catalogo, anche se non è una riga delle chiavi', () => {
  const ids = fornitoriConCatalogo(CHIAVI, { pianoChatgpt: { collegato: true, pianoAbilitato: true } });
  assert.deepEqual([...ids].sort(), ['chatgpt', 'deepseek', 'lmstudio']);
  const fonti = fontiDelSelettore({ openrouter: [], locali: [], diretti: { chatgpt: [{ id: 'chatgpt:gpt-6-sol' }], deepseek: [], openai: null, anthropic: null, gemini: null, lmstudio: [] } });
  assert.ok(fonti.some((f) => f.id === 'chatgpt' && f.conto === 1), 'la scheda del piano compare col suo conteggio');
});

test('CATALOGO-PIANO-02 AL CONTRARIO: scollegato, piano non abilitato o stato non letto ⇒ niente catalogo del piano; le chiavi come prima', () => {
  for (const pianoChatgpt of [null, undefined, { collegato: false, pianoAbilitato: false }, { collegato: true, pianoAbilitato: false }, 'storto']) {
    assert.deepEqual([...fornitoriConCatalogo(CHIAVI, { pianoChatgpt })].sort(), ['deepseek', 'lmstudio'], JSON.stringify(pianoChatgpt));
  }
  assert.deepEqual([...fornitoriConCatalogo([], {})], []);
  const fonti = fontiDelSelettore({ openrouter: [], locali: [], diretti: { chatgpt: null, deepseek: null, openai: null, anthropic: null, gemini: null, lmstudio: [] } });
  assert.equal(fonti.some((f) => f.id === 'chatgpt'), false, 'senza catalogo la scheda del piano non c è');
});
