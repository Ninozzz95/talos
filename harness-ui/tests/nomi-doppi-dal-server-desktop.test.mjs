/*
 * 16/10/2026 — la metà Desktop di `nomi-doppi-dal-server.test.mjs`: il numero del doppione del server (`nomeConSuffisso`,
 *   titolo-breve.mjs) è lo stesso del client (`nomeConSuffisso`, session-item.js) su testi di ogni forma — se divergessero, la
 *   rinomina del client e la nascita sul server darebbero a una sessione due nomi diversi.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { nomeConSuffisso as delServer } from '../src/titolo-breve.mjs';
import { nomeAutomaticoDiDelega, nomeConSuffisso as delClient } from '../frontend/src/components/session-item.js';
import { readFileSync } from 'node:fs';

const TESTI = [
  'Prova del bugfixer sui permessi',
  `Analizza ${'tutti i moduli del server '.repeat(6)}e scrivi un rapporto`,
  `ab ${'🏴󠁧󠁢󠁳󠁣󠁴󠁿'.repeat(30)}`,
  '中文测试'.repeat(30),
  'x'.repeat(200),
  `  spazi   strani\n\ta capo ${'parola '.repeat(20)}`,
  '-'.repeat(120),
  'corto',
];

test('NOMI-DOPPI-DESKTOP-01 — il numero del doppione è lo stesso sul server e nel client, con -2, -12 e -999', () => {
  for (const testo of TESTI) {
    for (const suffisso of ['-2', '-12', '-999']) {
      assert.equal(delServer(testo, suffisso), delClient(testo, suffisso), `${JSON.stringify(testo.slice(0, 20))} ${suffisso}`);
    }
  }
});

test('NOMI-DOPPI-DESKTOP-02 — fra sorelle il nome distintivo vince sul nome AUTOMATICO di una delega; AL CONTRARIO un nome scelto a mano vince sempre', () => {
  const delega = (nome) => ({ padreId: 'p', nome, taskDelega: 'Scrivi la parte del rapporto sul server' });
  assert.equal(nomeAutomaticoDiDelega(delega('Scrivi la parte del rapporto sul server')), true);
  assert.equal(nomeAutomaticoDiDelega(delega('Scrivi la parte del rapporto sul server-2')), true);
  const lungo = `Scrivi la parte del rapporto ${'sul modulo del server '.repeat(6)}`;
  const corto = delServer(lungo, ''); // `taskDelega` e il nome di nascita: già corti
  assert.equal(nomeAutomaticoDiDelega({ padreId: 'p', nome: delServer(corto, '-3'), taskDelega: corto }), true, 'troncato col numero, come lo fa il server');
  assert.equal(nomeAutomaticoDiDelega({ padreId: 'p', nome: 'Scrivi la parte-3…', taskDelega: 'Scrivi la parte del rapporto…' }), false, 'NOMI2-REV-03: un prefisso col numero è un nome scelto');
  assert.equal(nomeAutomaticoDiDelega(delega('Il mio nome')), false);
  assert.equal(nomeAutomaticoDiDelega(delega('Versione-2')), false, 'un numero su un nome che non è il compito');
  assert.equal(nomeAutomaticoDiDelega({ nome: 'X', taskDelega: 'X' }), false, 'senza madre non è una delega');
  // e la riga della barra usa davvero la precedenza: distintivo prima del nome automatico, poi il nome
  const riga = readFileSync(new URL('../frontend/src/components/session-item.js', import.meta.url), 'utf8');
  assert.match(riga, /\(nomeAutomaticoDiDelega\(sessione\) && opzioni\.nomeDistintivo\) \|\| sessione\.nome \|\| opzioni\.nomeDistintivo/u);
});

test('NOMI-DOPPI-DESKTOP-03 — owner 16/10 sera: anche la rinomina del client conta ogni sessione in elenco, ferma o al lavoro (la regola del server)', () => {
  const app = readFileSync(new URL('../frontend/src/legacy/app.js', import.meta.url), 'utf8');
  const inizio = app.indexOf('  function nomeUnicoSessione(nome, sessionId) {');
  const corpo = app.slice(inizio, app.indexOf('\n  }\n', inizio) + 4);
  const nomeUnicoSessione = new Function('state', 'nomeConSuffisso', `${corpo}; return nomeUnicoSessione;`);
  const state = { sessionSelection: { available: new Map([
    ['a', { sessionId: 'a', nome: 'refactor', conclusa: true }],
    ['b', { sessionId: 'b', nome: 'vecchia', interrotta: true }],
  ]) } };
  const unico = nomeUnicoSessione(state, delClient);
  assert.deepEqual(unico('refactor', 'nuova'), { nome: 'refactor-2', cambiato: true }, 'una conclusa tiene il suo nome');
  assert.deepEqual(unico('vecchia', 'nuova'), { nome: 'vecchia-2', cambiato: true }, 'una interrotta pure');
  assert.deepEqual(unico('refactor', 'a'), { nome: 'refactor', cambiato: false }, 'AL CONTRARIO: rinominare se stessa non è un doppione');
});
