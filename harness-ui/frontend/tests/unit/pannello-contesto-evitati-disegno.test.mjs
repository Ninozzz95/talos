/*
 * Decisione 193 (owner 04/11/2026): la riga «Evitato in questa sessione: {nome}» nella scheda Contesto, disegnata davvero (il modello puro
 * sta in `pannello-contesto.test.mjs`, PANNELLO-CONTESTO-EVITATI). DOM finto dei blocchi: niente jsdom fra le dipendenze del frontend.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { documento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { disegnaContesto } from '../../src/components/pannello/contesto.js';
import { creaStato } from '../fixtures/pannello-dati.mjs';

const S = creaStato(Date.parse('2026-11-04T19:00:00Z'));

function disegna(dati) {
  const doc = documento();
  /* la scheda cerca anche a livello di documento (menu aperti, rinomina): qui si guarda dentro il corpo */
  doc.querySelector = (s) => doc.body.querySelector(s);
  doc.querySelectorAll = (s) => doc.body.querySelectorAll(s);
  doc.documentElement = doc.body;
  doc.defaultView = { Node: doc.body.constructor, getComputedStyle: () => ({}) };
  const prima = globalThis.document;
  globalThis.document = doc;
  try {
    const contenitore = doc.createElement('div');
    doc.body.append(contenitore);
    disegnaContesto(contenitore, dati);
    return contenitore;
  } finally {
    globalThis.document = prima;
  }
}

test('PANNELLO-CONTESTO-EVITATI-DISEGNO — una nota per ogni fornitore evitato, col suo nome; nessuna senza evento', () => {
  impostaLingua('en');
  const c = disegna({ ...S.contesto, fornitoriEvitati: [{ fornitore: 'Particle AI', modello: 'deepseek/deepseek-v4.1-flash-1017' }, { fornitore: 'Novita', modello: 'z-ai/glm-5.3-flash' }] });
  const note = c.querySelectorAll('[data-contesto-fornitore-evitato]');
  assert.deepEqual([...note].map((n) => n.textContent), ['Avoided for this session: Particle AI (it lost the cache twice)', 'Avoided for this session: Novita (it lost the cache twice)']);
  assert.equal(disegna(S.contesto).querySelectorAll('[data-contesto-fornitore-evitato]').length, 0, 'al contrario: senza evento nessuna riga');
  impostaLingua('it');
});
