import test from 'node:test';
import assert from 'node:assert/strict';
import { frasiRitratto, avvisoRitratto, numeroItaliano } from '../../src/components/cartella-ritratto.js';

// 06/09 — F9, F10, F19, F20, F21: la modale «Nuova sessione» dice cosa c'è nella cartella
// PRIMA di darla a un agente. Erano tutte ❌ nell'audit.

test('RITRATTO-NUMERI: le migliaia si separano sempre, senza dipendere dai dati locali del runtime', () => {
  assert.equal(numeroItaliano(1234), '1.234');
  assert.equal(numeroItaliano(20000), '20.000');
  assert.equal(numeroItaliano(7), '7');
  assert.equal(numeroItaliano('x'), '0');
});

test('RITRATTO-FRASE: file, cartelle, ramo, modifiche, repo annidati, istruzioni', () => {
  const r = {
    leggibile: true, radice: false, file: 1234, cartelle: 56, oltreIlTetto: false, tetto: 20000,
    git: { ramo: 'lane/harness-desktop', nonSalvate: 3, repoAnnidati: ['/a/mobile'] },
    istruzioni: ['CLAUDE.md'],
  };
  const f = frasiRitratto(r);
  assert.match(f, /1\.234 file/);
  assert.match(f, /56 cartelle/);
  assert.match(f, /ramo lane\/harness-desktop/);
  assert.match(f, /3 modifiche non salvate/);
  assert.match(f, /1 repo annidato\b/); // singolare, non «1 repo annidati»
  assert.match(f, /istruzioni: CLAUDE\.md/);
  // niente da salvare si dice così, non «0 modifiche»
  assert.match(frasiRitratto({ ...r, git: { ...r.git, nonSalvate: 0, repoAnnidati: [] } }), /niente da salvare/);
  // oltre il tetto non si finge un numero esatto
  assert.match(frasiRitratto({ ...r, oltreIlTetto: true }), /più di 20\.000 file/);
});

test('RITRATTO-AVVISO: solo quando serve — una radice, o una cartella enorme', () => {
  const base = { leggibile: true, radice: false, file: 10, cartelle: 1, oltreIlTetto: false, tetto: 20000, git: null, istruzioni: [] };
  assert.equal(avvisoRitratto(base), '', 'un progetto normale non merita un avviso: uno che compare sempre non si legge più');
  assert.match(avvisoRitratto({ ...base, radice: true }), /cartella radice/);
  assert.match(avvisoRitratto({ ...base, oltreIlTetto: true }), /più di 20\.000 file/);
});

test('RITRATTO-ILLEGGIBILE: senza dati non si scrive niente, mai numeri inventati', () => {
  assert.equal(frasiRitratto({ leggibile: false }), '');
  assert.equal(frasiRitratto(null), '');
  assert.equal(frasiRitratto(undefined), '');
  assert.equal(avvisoRitratto({ leggibile: false, radice: true }), '');
  assert.equal(avvisoRitratto(null), '');
});
