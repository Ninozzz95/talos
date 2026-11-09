import test from 'node:test';
import assert from 'node:assert/strict';

import { esitoDelCambioDiModello, fasciaDelModello, notaModalitaVeloce } from '../../src/components/modalita-veloce.js';

/*
 * FE-047 (owner 31/10/2026) — la modalità veloce sul PC. Qui le regole pure; il filo vero (corpo delle richieste, fulmine, avviso) sta
 * in `tests/browser/modalita-veloce.spec.mjs`. ⛔ Due forme con lo stesso nome: sui modelli del catalogo `fasciaVeloce` è
 * `{ id, descrizione }`, sulle sessioni è un booleano.
 */
const LUNA = { id: 'chatgpt:gpt-6-luna', fasciaVeloce: { id: 'priority', descrizione: '1.5x speed' } };
const VECCHIO = { id: 'chatgpt:gpt-5-vecchio' };
const tr = (chiave) => `«${chiave}»`;

test('VELOCE-U1 — la fascia si legge solo dal catalogo, per id esatto', () => {
  assert.deepEqual(fasciaDelModello([VECCHIO, LUNA], LUNA.id), LUNA.fasciaVeloce);
  assert.equal(fasciaDelModello([VECCHIO, LUNA], VECCHIO.id), null);
  assert.equal(fasciaDelModello([VECCHIO, LUNA], 'chatgpt:gpt-6'), null, 'mai un id simile');
  assert.equal(fasciaDelModello(null, LUNA.id), null, 'catalogo non letto');
  assert.equal(fasciaDelModello([LUNA], null), null);
});

test('VELOCE-U2 — la forma booleana delle sessioni non vale come fascia di un modello', () => {
  for (const fasciaVeloce of [true, false, 'priority', {}, { id: '' }, { id: 1 }, null]) {
    assert.equal(fasciaDelModello([{ id: 'm', fasciaVeloce }], 'm'), null, JSON.stringify(fasciaVeloce));
  }
});

test('VELOCE-U3 — la frase del costo c\'è sempre; la riga del servizio solo per i tre testi conosciuti', () => {
  assert.equal(notaModalitaVeloce(tr, null), '«app.fastMode.cost»');
  assert.equal(notaModalitaVeloce(tr, '1.5x speed'), '«app.fastMode.cost» «app.fastMode.service15x»');
  assert.equal(notaModalitaVeloce(tr, '1.5x speed, increased usage'), '«app.fastMode.cost» «app.fastMode.service15xUsage»');
  assert.equal(notaModalitaVeloce(tr, '2x speed, increased usage'), '«app.fastMode.cost» «app.fastMode.service2xUsage»');
});

test('VELOCE-U4 — testo sconosciuto: nessuna riga, nemmeno se somiglia', () => {
  for (const testo of ['3x speed', '1.5X speed', ' 1.5x speed', '1.5x speed ', 'constructor', '__proto__', '', undefined, 15]) {
    assert.equal(notaModalitaVeloce(tr, testo), '«app.fastMode.cost»', String(testo));
  }
});

test('VELOCE-U5 — cambio di modello: tiene, spegne o aspetta il catalogo', () => {
  assert.equal(esitoDelCambioDiModello({ modello: LUNA.id, modelli: [LUNA] }), 'tieni');
  assert.equal(esitoDelCambioDiModello({ modello: VECCHIO.id, modelli: [LUNA, VECCHIO] }), 'spegni', 'il catalogo letto non lo dichiara');
  assert.equal(esitoDelCambioDiModello({ modello: 'z-ai/glm-5.3-flash', modelli: [LUNA] }), 'spegni', 'fuori dal piano');
  assert.equal(esitoDelCambioDiModello({ modello: 'z-ai/glm-5.3-flash', modelli: null }), 'spegni', 'fuori dal piano non serve il catalogo');
  assert.equal(esitoDelCambioDiModello({ modello: 'local:qwen.gguf', modelli: null }), 'spegni');
  assert.equal(esitoDelCambioDiModello({ modello: LUNA.id, modelli: null }), 'aspetta', 'un catalogo non letto non dice niente sul modello');
  assert.equal(esitoDelCambioDiModello({ modello: '', modelli: [LUNA] }), 'aspetta', 'nessun modello scelto');
});
