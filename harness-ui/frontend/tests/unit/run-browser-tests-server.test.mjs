import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { leggiOpzioneServer } from '../../scripts/run-browser-tests.mjs';

/* ⭐ Decisione 106 dell'owner (03/11/2026, «lente + due server»): `--server=2` è un'opzione NOSTRA del lanciatore, che accende i
   due server di prova (`playwright.config.mjs`, `TALOS_PW_SERVER`). Playwright non la conosce: deve sparire dagli argomenti, e
   senza di lei la corsa resta quella di prima. */
const lanciatore = fileURLToPath(new URL('../../scripts/run-browser-tests.mjs', import.meta.url));

test('DUE-SERVER-LANCIATORE-01 — senza --server la corsa resta a un server e gli argomenti passano interi, nell\'ordine', () => {
  const argomenti = ['--workers=4', '--grep-invert', 'STREAMING-VERO|SONDA', 'tests/browser/a.spec.mjs'];
  assert.deepEqual(leggiOpzioneServer(argomenti), { server: 1, argomenti });
  assert.deepEqual(leggiOpzioneServer([]), { server: 1, argomenti: [] });
});

test('DUE-SERVER-LANCIATORE-02 — --server=2 e --server 2 accendono i due server e spariscono dagli argomenti di Playwright', () => {
  assert.deepEqual(leggiOpzioneServer(['--server=2', '--workers=8']), { server: 2, argomenti: ['--workers=8'] });
  assert.deepEqual(leggiOpzioneServer(['--workers=8', '--server', '2', 'x.spec.mjs']), { server: 2, argomenti: ['--workers=8', 'x.spec.mjs'] });
  assert.deepEqual(leggiOpzioneServer(['--server=1', '--list']), { server: 1, argomenti: ['--list'] }, '--server=1 è la corsa di sempre');
});

test('DUE-SERVER-LANCIATORE-03 — un valore che non è 1 o 2 ferma la corsa, mai un server unico preso per buono', () => {
  for (const sbagliato of [['--server=3'], ['--server=0'], ['--server='], ['--server'], ['--server', 'due'], ['--server=2x']]) {
    assert.throws(() => leggiOpzioneServer(sbagliato), /--server vuole 1 o 2/, sbagliato.join(' '));
  }
  /* `--list` e un file che non esiste: se un giorno l'opzione sbagliata passasse, Playwright elencherebbe zero prove invece di
     lanciare la suite intera da dentro una prova unitaria. */
  const figlio = spawnSync(process.execPath, [lanciatore, '--server=3', '--list', 'nessun-file-decisione-106.spec.mjs'], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(figlio.status, 2, 'il lanciatore esce con 2, come per le dipendenze mancanti');
  assert.match(figlio.stderr, /Gate browser bloccato: --server vuole 1 o 2/);
});
