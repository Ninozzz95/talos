/*
 * D-8 (31/10/2026): un avviso solo si disegna subito, una raffica fa un ridisegno per finestra e l'ultimo stato arriva sempre a schermo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ridisegnoARaffica } from '../../src/components/notifiche.js';

function banco() {
  const timer = [];
  const conti = { ridisegni: 0 };
  const avviso = ridisegnoARaffica(() => { conti.ridisegni += 1; }, { attesa: 100, aspetta: (fn, ms) => { timer.push({ fn, ms }); } });
  return { avviso, conti, timer, scatta: () => timer.shift().fn() };
}

test('D8-01 a single notice redraws at once and leaves nothing behind', () => {
  const b = banco();
  b.avviso();
  assert.equal(b.conti.ridisegni, 1);
  assert.equal(b.timer[0].ms, 100);
  b.scatta();
  assert.equal(b.conti.ridisegni, 1);
  assert.equal(b.timer.length, 0);
});

test('D8-02 a burst of 300 notices in one window costs two redraws', () => {
  const b = banco();
  for (let i = 0; i < 300; i++) b.avviso();
  assert.equal(b.conti.ridisegni, 1);
  b.scatta();
  assert.equal(b.conti.ridisegni, 2, 'the last state reaches the screen');
  b.scatta();
  assert.equal(b.conti.ridisegni, 2);
  assert.equal(b.timer.length, 0);
});

test('D8-03 a notice during the closing window is not lost', () => {
  const b = banco();
  b.avviso();
  b.avviso();
  b.scatta();
  b.avviso();
  assert.equal(b.conti.ridisegni, 2);
  b.scatta();
  assert.equal(b.conti.ridisegni, 3);
});

test('D8-04 after a quiet window the next notice redraws at once again', () => {
  const b = banco();
  b.avviso();
  b.scatta();
  b.avviso();
  assert.equal(b.conti.ridisegni, 2);
});

test('D8-05 a redraw that throws does not leave the window stuck', () => {
  const timer = [];
  let volte = 0;
  const avviso = ridisegnoARaffica(() => { volte += 1; if (volte === 1) throw new Error('rotto'); }, { aspetta: (fn) => { timer.push(fn); } });
  assert.throws(() => avviso(), /rotto/u);
  timer.shift()();
  avviso();
  assert.equal(volte, 2);
});
