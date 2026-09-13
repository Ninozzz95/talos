import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { STATO_FINESTRA_DEFAULT, leggiStatoFinestra, salvaStatoFinestra } from '../window-state.mjs';

function file(t) { const dir = mkdtempSync(join(tmpdir(), 'talos-window-state-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return join(dir, 'window-state.json'); }
const SCHERMO = { x: 0, y: 0, width: 2560, height: 1440 };

test('R01-VASSOIO — spento di serie, scelta esplicita persistente; stringhe non accettate', (t) => {
  const f = file(t);
  assert.equal(leggiStatoFinestra(f).restaNelVassoio, false);
  salvaStatoFinestra(f, { width: 1024, height: 800, restaNelVassoio: true });
  assert.equal(leggiStatoFinestra(f).restaNelVassoio, true);
  salvaStatoFinestra(f, { width: 1024, height: 800, restaNelVassoio: 'true' });
  assert.equal(leggiStatoFinestra(f).restaNelVassoio, false);
});

test('FINESTRA-01 — senza file: i default; salva → rileggi: gli stessi valori, e la chiave non contiene altro che geometria', (t) => {
  const f = file(t);
  assert.deepEqual(leggiStatoFinestra(f, [SCHERMO]), { ...STATO_FINESTRA_DEFAULT });
  salvaStatoFinestra(f, { x: 100, y: 50, width: 1200, height: 800, massimizzata: false });
  assert.deepEqual(leggiStatoFinestra(f, [SCHERMO]), { x: 100, y: 50, width: 1200, height: 800, massimizzata: false, restaNelVassoio: false });
  assert.doesNotMatch(readFileSync(f, 'utf8'), /token|chiave/i);
});

test('FINESTRA-02 — AL CONTRARIO: una posizione fuori da ogni schermo (monitor staccato) perde x/y ma tiene le dimensioni; dimensioni sotto il minimo tornano ai default; JSON rotto = default', (t) => {
  const f = file(t);
  salvaStatoFinestra(f, { x: 5000, y: 5000, width: 1200, height: 800 });
  const fuori = leggiStatoFinestra(f, [SCHERMO]);
  assert.equal(fuori.x, undefined); assert.equal(fuori.y, undefined);
  assert.equal(fuori.width, 1200);
  salvaStatoFinestra(f, { x: 10, y: 10, width: 300, height: 200 });
  const piccola = leggiStatoFinestra(f, [SCHERMO]);
  assert.equal(piccola.width, STATO_FINESTRA_DEFAULT.width); assert.equal(piccola.height, STATO_FINESTRA_DEFAULT.height);
  writeFileSync(f, '{non json');
  assert.deepEqual(leggiStatoFinestra(f, [SCHERMO]), { ...STATO_FINESTRA_DEFAULT });
});

test('FINESTRA-03 — senza informazioni sugli schermi (test, avvio prima di `screen`) la posizione salvata si accetta; massimizzata sopravvive', (t) => {
  const f = file(t);
  salvaStatoFinestra(f, { x: 20, y: 30, width: 1000, height: 700, massimizzata: true });
  const s = leggiStatoFinestra(f, []);
  assert.equal(s.x, 20); assert.equal(s.massimizzata, true);
});
