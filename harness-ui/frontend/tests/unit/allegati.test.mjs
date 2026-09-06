import test from 'node:test';
import assert from 'node:assert/strict';
import { VIE_ALLEGATO, stimaTokenTesto, stimaTokenImmagine, famigliaModello, etichettaCosto, costoAllegato, costoTotale, nomeBreveAllegato } from '../../src/components/allegati.js';

// 06/09 — B4/B6/B7/B9: il «+» allega e basta, e ogni allegato dichiara quanto contesto costa.

test('ALLEGATI-VIE: le quattro vie del «+», nell’ordine, tutte con nome e aiuto (B6)', () => {
  assert.equal(VIE_ALLEGATO.length, 4);
  assert.deepEqual(VIE_ALLEGATO.map((v) => v.id), ['workspace', 'disco', 'immagine', 'schermata']);
  for (const v of VIE_ALLEGATO) assert.ok(v.etichetta && v.aiuto && v.icona, `via incompleta: ${v.id}`);
});

test('ALLEGATI-TESTO: ~4 caratteri per token, e niente numeri inventati sul vuoto', () => {
  assert.equal(stimaTokenTesto(4000), 1000);
  assert.equal(stimaTokenTesto(1), 1);
  // AL CONTRARIO: su niente non si stima niente
  assert.equal(stimaTokenTesto(0), 0);
  assert.equal(stimaTokenTesto(-10), 0);
  assert.equal(stimaTokenTesto('molti'), 0);
  assert.equal(stimaTokenTesto(undefined), 0);
});

test('ALLEGATI-IMMAGINE: ogni famiglia conta a modo suo, e Claude ha un tetto', () => {
  // Claude: larghezza × altezza / 750 → 1000×1000 ≈ 1334
  assert.equal(stimaTokenImmagine(1000, 1000, 'claude'), 1334);
  // e oltre il tetto non sale
  assert.equal(stimaTokenImmagine(4000, 4000, 'claude'), 1568);
  // OpenAI: 85 di base + 170 per riquadro da 512 px → 1024×1024 = 4 riquadri
  assert.equal(stimaTokenImmagine(1024, 1024, 'openai'), 85 + 170 * 4);
  // Gemini: riquadri da 768 px a 258 token
  assert.equal(stimaTokenImmagine(768, 768, 'gemini'), 258);
  assert.equal(stimaTokenImmagine(1000, 800, 'gemini'), 258 * 4);
  // AL CONTRARIO: misure assurde non producono un numero
  assert.equal(stimaTokenImmagine(0, 500, 'claude'), 0);
  assert.equal(stimaTokenImmagine('x', 'y', 'claude'), 0);
});

test('ALLEGATI-FAMIGLIA: la si ricava dall’identificatore, e nel dubbio si sceglie il conto prudente', () => {
  assert.equal(famigliaModello('claude-opus-5'), 'claude');
  assert.equal(famigliaModello('openai/gpt-5.2'), 'openai');
  assert.equal(famigliaModello('google/gemini-3.8-flash'), 'gemini');
  assert.equal(famigliaModello('z-ai/glm-5.3-flash'), 'claude');
  assert.equal(famigliaModello(''), 'claude');
});

test('ALLEGATI-ETICHETTA: la tilde dice che è una stima, non una misura', () => {
  assert.equal(etichettaCosto(340), '~340 token');
  assert.equal(etichettaCosto(1334), '~1,3k token');
  assert.equal(etichettaCosto(24000), '~24k token');
  // AL CONTRARIO: zero non si scrive, si tace
  assert.equal(etichettaCosto(0), '');
  assert.equal(etichettaCosto(null), '');
});

test('ALLEGATI-COSTO: un allegato e la somma di tutti', () => {
  const file = { tipo: 'testo', caratteri: 8000 };
  const foto = { tipo: 'immagine', larghezza: 1000, altezza: 1000 };
  assert.equal(costoAllegato(file, 'claude-opus-5').token, 2000);
  assert.equal(costoAllegato(foto, 'claude-opus-5').token, 1334);
  assert.equal(costoAllegato(foto, 'openai/gpt-5.2').token, 85 + 170 * 4);
  assert.equal(costoTotale([file, foto], 'claude-opus-5').token, 3334);
  assert.equal(costoTotale([file, foto], 'claude-opus-5').etichetta, '~3,3k token');
  // AL CONTRARIO: nessun allegato, nessuna riga
  assert.equal(costoTotale([], 'claude-opus-5').etichetta, '');
  assert.equal(costoAllegato(null, 'claude-opus-5').token, 0);
});

test('ALLEGATI-NOME: si accorcia il nome, mai l’estensione', () => {
  assert.equal(nomeBreveAllegato('C:/progetti/app/src/session-registry.mjs'), 'session-registry.mjs');
  assert.equal(nomeBreveAllegato('/a/b/un-nome-molto-molto-lungo-davvero.mjs'), 'un-nome-molto-molto-lun….mjs');
  assert.ok(nomeBreveAllegato('/a/b/un-nome-molto-molto-lungo-davvero.mjs').endsWith('.mjs'));
  assert.equal(nomeBreveAllegato(''), '');
});
