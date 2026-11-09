import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { bersaglioDelSuggerimento } from '../../src/components/bersaglio-suggerimento.js';

test('SUGGERIMENTO-01 un percorso assoluto diventa il nome del file, su Windows e sugli altri sistemi', () => {
  assert.equal(bersaglioDelSuggerimento('C:\\Users\\persona\\AppData\\incollati\\testo-1.txt'), 'testo-1.txt');
  assert.equal(bersaglioDelSuggerimento('C:/Users/persona/nota.md'), 'nota.md');
  assert.equal(bersaglioDelSuggerimento('/home/persona/nota.md'), 'nota.md');
  assert.equal(bersaglioDelSuggerimento('\\\\server\\cartella\\nota.md'), 'nota.md');
});

test('SUGGERIMENTO-02 un percorso del progetto e un testo restano come sono', () => {
  assert.equal(bersaglioDelSuggerimento('src/app.js'), 'src/app.js');
  assert.equal(bersaglioDelSuggerimento('la pagina dei prezzi'), 'la pagina dei prezzi');
  assert.equal(bersaglioDelSuggerimento(null), '');
});

test('SUGGERIMENTO-03 il compositore lo usa davvero', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /const bersaglio = bersaglioDelSuggerimento\(bersaglioAttrezzoNudo\(ultimo\.nome, ultimo\.argomenti\)\);/u);
});
