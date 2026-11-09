/*
 * FE-040, casi difficili del bozzetto 4: «Percorso che non esiste: lo dice e propone la cartella più vicina», «Cartella senza permesso: lo dice e blocca».
 * Il motivo lo dà il server (`folder-missing`, `folder-denied`); qui si legge e si cerca il nome più simile fra le sorelle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { motivoCartella, cartellaGenitore, cartellaPiuVicina } from '../../src/components/cartella-vicina.js';

const voci = (...nomi) => nomi.map((name) => ({ name, path: `C:\\Lavoro\\${name}` }));

test('VICINA-01 il motivo si legge dal problema o dall\'errore; un altro motivo non è nostro', () => {
  assert.equal(motivoCartella({ problem: { reason: 'folder-missing' } }), 'inesistente');
  assert.equal(motivoCartella({ reason: 'folder-denied' }), 'negata');
  assert.equal(motivoCartella({ reason: 'altro' }), null);
  assert.equal(motivoCartella(null), null);
});

test('VICINA-02 il genitore su Windows e su Linux; una radice non ne ha', () => {
  assert.equal(cartellaGenitore('C:\\Lavoro\\Stio'), 'C:\\Lavoro');
  assert.equal(cartellaGenitore('C:\\Lavoro\\Stio\\'), 'C:\\Lavoro');
  assert.equal(cartellaGenitore('C:\\Lavoro'), 'C:\\');
  assert.equal(cartellaGenitore('/home/nino/sito'), '/home/nino');
  assert.equal(cartellaGenitore('/home'), '/');
  assert.equal(cartellaGenitore('C:\\'), null);
  assert.equal(cartellaGenitore('/'), null);
  assert.equal(cartellaGenitore(''), null);
});

test('VICINA-03 il refuso del bozzetto: «Stio» trova «Sito» (due lettere scambiate)', () => {
  assert.equal(cartellaPiuVicina('C:\\Lavoro\\Stio', voci('TALOS', 'Sito', 'Foto')).name, 'Sito');
});

test('VICINA-04 maiuscole e lettera mancante o in più', () => {
  assert.equal(cartellaPiuVicina('C:\\Lavoro\\talos', voci('Foto', 'TALOS')).name, 'TALOS');
  assert.equal(cartellaPiuVicina('C:\\Lavoro\\Fotoo', voci('Foto', 'TALOS')).name, 'Foto');
  assert.equal(cartellaPiuVicina('C:\\Lavoro\\Ftoo', voci('Foto', 'TALOS')).name, 'Foto');
});

test('VICINA-05 il più simile vince, a pari merito il primo', () => {
  assert.equal(cartellaPiuVicina('C:\\Lavoro\\sito-web', voci('sito-wev', 'sito-web2')).name, 'sito-wev');
  assert.equal(cartellaPiuVicina('C:\\L\\abcd', voci('abcx', 'abcy')).name, 'abcx');
});

test('VICINA-06 niente di simile: niente proposta di nome', () => {
  assert.equal(cartellaPiuVicina('C:\\Lavoro\\Contabilita', voci('TALOS', 'Foto')), null);
  assert.equal(cartellaPiuVicina('C:\\Lavoro\\ab', voci('xy', 'cd')), null, 'due lettere diverse su due non sono un refuso');
  assert.equal(cartellaPiuVicina('C:\\Lavoro\\Sito', []), null);
  assert.equal(cartellaPiuVicina('', voci('Sito')), null);
  assert.equal(cartellaPiuVicina('C:\\Lavoro\\Sito', null), null);
});

test('VICINA-07 la finestra è cablata: motivo dedicato, proposta col percorso vero, comandi di prima ancora lì', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /motivoCartella\(error\)/u);
  assert.match(app, /app\.workspace\.folder\.\$\{motivo\}/u);
  assert.match(app, /proponiCartellaVicina\(path, actions, generation\)/u);
  assert.match(app, /retry\.textContent = tr\('app\.common\.tryAgain'\)/u);
  assert.match(app, /doctor\.textContent = tr\('app\.common\.openDoctor'\)/u);
});

test('VICINA-08 le frasi ci sono nelle due lingue', () => {
  const testi = readFileSync(new URL('../../src/i18n/testi/app.js', import.meta.url), 'utf8');
  for (const k of ['workspace.folder.inesistente', 'workspace.folder.negata', 'workspace.folder.use']) assert.equal(testi.split(`'${k}'`).length - 1, 2, k);
});
