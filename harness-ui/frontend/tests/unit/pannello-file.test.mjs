/*
 * PANNELLO v2 — la scheda FILE, le AGGIUNTE pure (MAPPA F-01…F-05): chi ha scritto o letto cosa, in quale giro, «di questa
 * richiesta», le collisioni, il conto sulla scheda. L'esploratore di oggi non è qui: ha le sue prove, intatte.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { modelloFile, contoFile } from '../../src/components/pannello/file.js';

test('PNFI-U01 — scritti col giro e i +/−, letti a parte; «di questa richiesta» dal giro dell’ultimo messaggio della persona', () => {
  impostaLingua('it');
  const dati = {
    scritti: [{ path: 'src/a.js', giro: 3, aggiunte: 4, rimozioni: 1 }, { path: 'src/vecchio.js', giro: 1, nuovo: true }],
    letti: [{ path: 'src/b.js', giro: 3 }, { path: 'src/a.js', giro: 3 }],
    richiesta: { giroDa: 3 },
  };
  const conv = modelloFile(dati, 'conversazione');
  assert.deepEqual(conv.scritti.map((v) => v.path), ['src/a.js', 'src/vecchio.js'], 'il più recente in cima');
  assert.deepEqual(conv.letti.map((v) => v.path), ['src/b.js'], 'un file scritto non si ripete fra i letti');
  const ric = modelloFile(dati, 'richiesta');
  assert.deepEqual(ric.scritti.map((v) => v.path), ['src/a.js'], 'il giro 1 non è di questa richiesta');
  assert.equal(ric.conti.richiesta, 2);
});

test('PNFI-U02 — due che scrivono lo stesso file: «da guardare» in cima UNA volta, e il pallino sulla scheda', () => {
  impostaLingua('it');
  const dati = {
    scritti: [{ path: 'README.md', giro: 2 }],
    agenti: [{ nome: 'Revisore', attivita: { file: [{ percorso: 'README.md', scritto: true }, { percorso: 'x.js', letto: true }] } }],
  };
  const m = modelloFile(dati, 'conversazione');
  assert.deepEqual(m.daGuardare.map((v) => v.path), ['README.md']);
  assert.equal(m.scritti.some((v) => v.path === 'README.md'), false, 'non si ripete fra gli scritti');
  const c = contoFile(dati);
  assert.equal(c.attenzione, 1);
  assert.equal(c.numero, 2);
  assert.match(c.descrizione, /2/u);
});

test('PNFI-U03 — dati vuoti o storti: nessuna eccezione, nessun numero', () => {
  assert.deepEqual(contoFile({}), { numero: null, attenzione: 0, descrizione: '' });
  const m = modelloFile({ scritti: 'no', letti: null, agenti: [{ attivita: { file: [{ percorso: 7 }] } }] });
  assert.equal(m.conti.conversazione, 0);
});
