import test from 'node:test';
import assert from 'node:assert/strict';
import { titoloScheda, nomeShell, prossimaAttivaDopoChiusura, cicla, nomeSchedaValido, SCHEDE_MASSIME } from '../../src/components/terminale.js';

// 06/09 B1 — le schede del Terminale: nomi, fuoco alla chiusura, ciclo, tetto.

test('TERMINALE-NOMI: la shell dichiarata dal server dà il nome; le omonime si numerano; il nome scelto vince', () => {
  assert.equal(nomeShell('git-bash'), 'Git Bash');
  assert.equal(nomeShell('cmd-fallback'), 'cmd.exe');
  assert.equal(nomeShell('posix-shell', '/usr/bin/zsh'), 'zsh');
  assert.equal(nomeShell(undefined), 'shell');
  const a = { terminalId: 'a', origine: 'tu', shell: 'git-bash' };
  const b = { terminalId: 'b', origine: 'tu', shell: 'git-bash' };
  const c = { terminalId: 'c', origine: 'tu', shell: 'git-bash', titolo: 'build' };
  assert.equal(titoloScheda(a, [a, b, c]), 'tu · Git Bash');
  assert.equal(titoloScheda(b, [a, b, c]), 'tu · Git Bash 2');
  assert.equal(titoloScheda(c, [a, b, c]), 'build');
  assert.equal(titoloScheda({ terminalId: 'g', origine: 'agente', giro: 7 }), 'agente · giro 7');
});

test('TERMINALE-CHIUSURA: il fuoco passa alla vicina che prende il posto, poi alla precedente, poi a nessuna (Hermes closeTerminal)', () => {
  assert.equal(prossimaAttivaDopoChiusura(['a', 'b', 'c'], 1), 'c');
  assert.equal(prossimaAttivaDopoChiusura(['a', 'b', 'c'], 2), 'b');
  assert.equal(prossimaAttivaDopoChiusura(['a'], 0), null);
});

test('TERMINALE-CICLO: frecce cicliche; con una scheda sola resta lì', () => {
  assert.equal(cicla(['a', 'b', 'c'], 'c', 1), 'a');
  assert.equal(cicla(['a', 'b', 'c'], 'a', -1), 'c');
  assert.equal(cicla(['a'], 'a', 1), 'a');
  assert.equal(cicla([], null, 1), null);
});

test('TERMINALE-NOME-VALIDO e tetto: vuoto no, 41 caratteri no; il tetto è quello del server (8)', () => {
  assert.equal(nomeSchedaValido('  '), false);
  assert.equal(nomeSchedaValido('x'.repeat(41)), false);
  assert.equal(nomeSchedaValido('build'), true);
  assert.equal(SCHEDE_MASSIME, 8);
});
