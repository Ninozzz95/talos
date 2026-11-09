import test from 'node:test';
import assert from 'node:assert/strict';
import { letturaDellaCatena } from '../../src/components/carta-compattazione.js';
import { TESTI } from '../../src/i18n/testi/index.js';

/* FE-053: la frase della carta dalla `catena` del server, nelle parole del bozzetto approvato. La scena e l'atteso vengono da `bozzetto-compattazione/dati.js` */
const traduciIn = (lingua) => (k, v = {}) => { const testo = TESTI[lingua][k]; assert.equal(typeof testo, 'string', `${lingua} manca ${k}`); return testo.replace(/\{(\w+)\}/gu, (_, n) => v[n]); };
const it = { traduci: traduciIn('it'), ora: () => '14:30', nomi: (id) => id.split('/').pop() };
const en = { traduci: traduciIn('en'), ora: () => '14:30', nomi: (id) => id.split('/').pop() };
const SCELTO = { ruolo: 'scelto', modello: 'z-ai/glm-5.3-flash', stato: 'pronto', origine: 'scelta' };
const RISERVA = { ruolo: 'riserva', modello: 'qwen/qwen3.7-flash', stato: 'pronto', origine: 'scelta' };
const SENZA = { ruolo: 'senza-modello', modello: null, stato: 'pronto' };
const FINE = 1_800_000_000_000;

test('CARTA-COMP-01 — tutti pronti: la catena intera, nelle due lingue', () => {
  assert.deepEqual(letturaDellaCatena([SCELTO, RISERVA, SENZA], it), { frase: 'Adesso: glm-5.3-flash, poi qwen3.7-flash se non risponde, poi una compattazione rapida senza modello.', avviso: null });
  assert.deepEqual(letturaDellaCatena([SCELTO, RISERVA, SENZA], en), { frase: 'Now: glm-5.3-flash, then qwen3.7-flash if it does not answer, then a quick compaction without a model.', avviso: null });
});

test('CARTA-COMP-02 — nessuna scelta: il modello della conversazione, senza riserva', () => {
  assert.equal(letturaDellaCatena([{ ruolo: 'scelto', modello: null, stato: 'pronto', origine: 'serie' }, SENZA], it).frase, 'Adesso: il modello della conversazione, poi una compattazione rapida senza modello.');
});

test('CARTA-COMP-03 — limite con l\'ora: piano solo con `diAccount`, altrimenti fornitore', () => {
  const fermo = (diAccount) => ({ ...SCELTO, stato: 'bloccato', motivo: 'limite', finoAlle: FINE, diAccount });
  assert.match(letturaDellaCatena([fermo(true), RISERVA, SENZA], it).frase, /glm-5\.3-flash \(in attesa fino alle 14:30, limite del piano\), poi qwen3\.7-flash/u);
  assert.match(letturaDellaCatena([fermo(false), RISERVA, SENZA], it).frase, /limite del fornitore/u);
});

test('CARTA-COMP-04 — riserva sullo stesso conto: «stesso limite»; di un altro fornitore: la sua ora', () => {
  const primo = { ...SCELTO, stato: 'bloccato', motivo: 'limite', finoAlle: FINE, diAccount: true };
  assert.match(letturaDellaCatena([primo, { ...RISERVA, stato: 'bloccato', motivo: 'limite', finoAlle: FINE, diAccount: true }, SENZA], it).frase, /poi qwen3\.7-flash \(stesso limite\) se non risponde/u);
  assert.match(letturaDellaCatena([primo, { ...RISERVA, stato: 'bloccato', motivo: 'limite', finoAlle: FINE + 60_000, diAccount: false }, SENZA], it).frase, /poi qwen3\.7-flash \(in attesa fino alle 14:30, limite del fornitore\)/u);
  assert.match(letturaDellaCatena([primo, { ...RISERVA, stato: 'bloccato', motivo: 'limite', finoAlle: FINE, diAccount: false }, SENZA], it).frase, /limite del fornitore/u, 'stessa ora, ma non dello stesso conto');
  assert.match(letturaDellaCatena([primo, { ...RISERVA, stato: 'bloccato', motivo: 'limite', finoAlle: FINE + 60_000, diAccount: true }, SENZA], it).frase, /poi qwen3\.7-flash \(in attesa fino alle 14:30, limite del piano\)/u, 'stesso conto, ma un\'altra ora');
});

test('CARTA-COMP-05 — AL CONTRARIO: un fermo senza ora non sta nella carta, il modello resta scritto come pronto', () => {
  const r = letturaDellaCatena([{ ...SCELTO, stato: 'bloccato', motivo: 'rete', finoAlle: null }, RISERVA, SENZA], it);
  assert.equal(r.frase, 'Adesso: glm-5.3-flash, poi qwen3.7-flash se non risponde, poi una compattazione rapida senza modello.');
  assert.equal(r.avviso, null);
});

test('CARTA-COMP-06 — scelto inutilizzabile: niente frase, l\'avviso col perché, e il tasto apre il modello', () => {
  assert.deepEqual(letturaDellaCatena([{ ...SCELTO, stato: 'inutilizzabile', motivo: 'senza-chiave' }, RISERVA, SENZA], it), { frase: null, avviso: { testo: 'Manca la chiave per glm-5.3-flash.', scelta: 'modello' } });
});

test('CARTA-COMP-07 — riserva inutilizzabile: esce dalla frase, l\'avviso apre la riserva', () => {
  assert.deepEqual(letturaDellaCatena([SCELTO, { ...RISERVA, stato: 'inutilizzabile', motivo: 'non-trovato' }, SENZA], it), {
    frase: 'Adesso: glm-5.3-flash, poi una compattazione rapida senza modello.',
    avviso: { testo: 'qwen3.7-flash non è disponibile col tuo account o coi tuoi fornitori.', scelta: 'riserva' },
  });
});

test('CARTA-COMP-08 — ogni motivo inutilizzabile ha la sua frase nelle due lingue, e la catena vuota non dice niente', () => {
  for (const motivo of ['non-trovato', 'senza-chiave', 'accesso-negato', 'non-configurato']) {
    for (const opzioni of [it, en]) assert.match(letturaDellaCatena([{ ...SCELTO, stato: 'inutilizzabile', motivo }, SENZA], opzioni).avviso.testo, /glm-5\.3-flash/u, motivo);
  }
  assert.deepEqual(letturaDellaCatena([], it), { frase: null, avviso: null });
  assert.deepEqual(letturaDellaCatena(undefined, it), { frase: null, avviso: null });
});
