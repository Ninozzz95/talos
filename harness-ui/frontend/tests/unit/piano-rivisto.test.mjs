import test from 'node:test';
import assert from 'node:assert/strict';
import { differenzeDelPiano, rigaDelPiano } from '../../src/components/piano-rivisto.js';

/* owner 27/10/2026 («il piano rivisto in fondo»): «Cosa è cambiato» nasce da qui, riga per riga, come `diff`. */

test('PIANO-DIFF-01 una riga si confronta senza numerazione, puntini, titoli, segni di markdown e collegamenti', () => {
  assert.equal(rigaDelPiano('3. **Migro** il `database`'), 'Migro il database');
  assert.equal(rigaDelPiano('- [la guida](https://x.y/z) e  basta'), 'la guida e basta');
  assert.equal(rigaDelPiano('## Piano'), 'Piano');
  assert.equal(rigaDelPiano('   '), '');
});

test('PIANO-DIFF-02 il caso del bozzetto: due passi aggiunti, uno tolto, al loro posto', () => {
  const ops = differenzeDelPiano('1. Leggo\n2. Cache\n3. Migro il database', '1. Leggo\n2. Cache\n3. Test della cache\n4. Lancio la suite');
  assert.deepEqual(ops.map((o) => `${o.tipo}:${o.riga}`), [
    'uguale:Leggo', 'uguale:Cache', 'tolta:Migro il database', 'aggiunta:Test della cache', 'aggiunta:Lancio la suite',
  ]);
});

test('PIANO-DIFF-03 AL CONTRARIO: rinumerare o riformattare non è un cambiamento; le righe vuote non contano', () => {
  const ops = differenzeDelPiano('1. Leggo\n\n2. Cache', '- **Leggo**\n- Cache\n');
  assert.ok(ops.every((o) => o.tipo === 'uguale'), JSON.stringify(ops));
  assert.deepEqual(differenzeDelPiano('', ''), []);
});

test('PIANO-DIFF-04 uno spostamento è una tolta e un\'aggiunta, mai una riga persa', () => {
  const ops = differenzeDelPiano('A\nB\nC', 'C\nA\nB');
  const conta = (tipo) => ops.filter((o) => o.tipo === tipo).length;
  assert.equal(conta('uguale') + conta('tolta'), 3);
  assert.equal(conta('uguale') + conta('aggiunta'), 3);
});
