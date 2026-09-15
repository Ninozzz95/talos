import test from 'node:test';
import assert from 'node:assert/strict';
import { limitiDialogo, misuraDialogo, leggiMisure, salvaMisura, dimenticaMisura, CHIAVE_MISURE, CHIAVI_MISURA } from '../../src/components/dialoghi.js';

// 06/09 B7 — dialoghi ridimensionabili e ricordati: i limiti, la misura, la memoria (stessa chiave del monolite).

function memoria() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }

test('DLG-LIMITI: minimo per velo, massimo dalla finestra; la palette è più stretta', () => {
  const l = limitiDialogo('veloModello', { innerWidth: 1440, innerHeight: 900, pad: 24 });
  assert.deepEqual(l, { minW: 520, minH: 340, maxW: 1392, maxH: 810 });
  const p = limitiDialogo('veloComandi', { innerWidth: 1440, innerHeight: 900, pad: 24 });
  assert.equal(p.minW, 420); assert.equal(p.minH, 240);
  const piccola = limitiDialogo('veloModello', { innerWidth: 500, innerHeight: 400, pad: 24 });
  assert.equal(piccola.maxW, 452);
  assert.equal(piccola.minW, 452, 'il minimo non supera il massimo: in una finestra stretta coincidono');
});

test('DLG-MISURA: dentro i limiti, arrotondata; valori assurdi tornano al minimo', () => {
  const l = limitiDialogo('veloModello', { innerWidth: 1440, innerHeight: 900, pad: 24 });
  assert.deepEqual(misuraDialogo(700.6, 500.2, l), { width: 701, height: 500 });
  assert.deepEqual(misuraDialogo(5000, 5000, l), { width: 1392, height: 810 });
  assert.deepEqual(misuraDialogo('x', NaN, l), { width: 520, height: 340 });
});

test('DLG-MEMORIA: si salva e si legge per chiave logica del mockup, si dimentica col doppio clic', () => {
  const s = memoria();
  assert.deepEqual(leggiMisure(s), {});
  salvaMisura(CHIAVI_MISURA.veloModello, { width: 700.4, height: 500 }, s);
  assert.deepEqual(leggiMisure(s), { 'sheet:model': { width: 700, height: 500 } });
  assert.equal(JSON.parse(s.getItem(CHIAVE_MISURE))['sheet:model'].width, 700);
  dimenticaMisura(CHIAVI_MISURA.veloModello, s);
  assert.deepEqual(leggiMisure(s), {});
  s.setItem(CHIAVE_MISURE, 'non json'); // verso contrario: memoria corrotta → vuoto, mai un'eccezione
  assert.deepEqual(leggiMisure(s), {});
});
