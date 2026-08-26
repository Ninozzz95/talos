import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { leggiContestoWorkspace } from '../src/workspace-context.mjs';

const quiRepo = dirname(dirname(fileURLToPath(import.meta.url))); // harness-ui/, dentro il repo git vero

test('⭐ su un repository git VERO (questo stesso repo), il branch è reale — nessun mock', () => {
  const contesto = leggiContestoWorkspace({ cartella: quiRepo, progetto: null });
  assert.equal(contesto.cartella, quiRepo);
  assert.equal(typeof contesto.branch, 'string');
  assert.ok(contesto.branch.length > 0, 'un repo git vero ha sempre un branch (anche "HEAD" se distaccato)');
});

test('⭐⭐ e il VERSO CONTRARIO, su una cartella VERA che non è un repository: branch è null, non un errore', () => {
  const vuota = mkdtempSync(join(tmpdir(), 'workspace-context-non-git-'));
  try {
    const contesto = leggiContestoWorkspace({ cartella: vuota, progetto: 'listino' });
    assert.equal(contesto.progetto, 'listino');
    assert.equal(contesto.cartella, vuota);
    assert.equal(contesto.branch, null);
  } finally {
    rmSync(vuota, { recursive: true, force: true });
  }
});

test('un exec che lancia per qualunque motivo (git assente, permessi) produce branch null, mai un\'eccezione', () => {
  const execCheGetta = () => { throw new Error('git: comando non trovato'); };
  const contesto = leggiContestoWorkspace({ cartella: '/qualunque', progetto: 'x' }, { exec: execCheGetta });
  assert.equal(contesto.branch, null);
});

test('un branch con output vuoto (git risponde ma senza testo) è null, non una stringa vuota', () => {
  const execVuoto = () => '   \n';
  const contesto = leggiContestoWorkspace({ cartella: '/qualunque' }, { exec: execVuoto });
  assert.equal(contesto.branch, null);
});

test('progetto viene passato attraverso senza modifiche, incluso null', () => {
  assert.equal(leggiContestoWorkspace({ cartella: '/x', progetto: 'inventario' }, { exec: () => 'main' }).progetto, 'inventario');
  assert.equal(leggiContestoWorkspace({ cartella: '/x' }, { exec: () => 'main' }).progetto, null);
});
