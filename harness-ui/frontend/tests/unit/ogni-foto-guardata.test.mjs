import test from 'node:test';
import assert from 'node:assert/strict';
import { fotoNominate, giudicaLeFoto, nomeDellaFoto, fotoDaGuardare } from '../../../scripts/cancello/ogni-foto-guardata.mjs';

/*
 * ⛔⛔⛔ 07/09/2026, owner: «ispezionare ogni singola prova immagine DEVE ESSERE TRASFORMATO IN UN
 *   CANCELLO, ricordatelo». Il difetto che lo fa nascere è mio, dello stesso giorno: la prova del
 *   browser scattava otto foto, io ne guardavo tre e dichiaravo «PASSA». Nelle altre cinque c'erano
 *   quattro difetti veri, di quelli che nessun numero trova — un fumetto che copriva la barra delle
 *   viste, un riquadro grigio vuoto, una scritta ripetuta, un rimedio falso.
 *
 * Un cancello sull'occhio non può misurare l'occhio: misura la TRACCIA. Ogni foto dev'essere
 * nominata in un'ispezione che dice qualcosa. E, come ogni cancello qui, si prova anche AL CONTRARIO.
 */

const FINTO = {
  esiste: new Set(['/foto', '/foto/01-una.png', '/foto/02-due.png']),
  existsSync: (d) => FINTO.esiste.has(d),
  readdirSync: (d) => (d === '/foto'
    ? [{ name: '01-una.png', isDirectory: () => false }, { name: '02-due.png', isDirectory: () => false }]
    : []),
  statSync: () => ({ mtimeMs: 1_000 }),
};

test('UNA FOTO NOMINATA con un verdetto vale come guardata', () => {
  const nominate = fotoNominate(['- 01-una.png: la barra è al suo posto e il titolo si tronca']);
  assert.equal(nominate.has('01-una.png'), true);
});

test('AL CONTRARIO — il solo NOME non basta: un elenco lo scrive anche chi non ha aperto niente', () => {
  const nominate = fotoNominate(['01-una.png', '- 02-due.png:', 'foto: 03-tre.png ok']);
  assert.equal(nominate.has('01-una.png'), false);
  assert.equal(nominate.has('02-due.png'), false);
  assert.equal(nominate.has('03-tre.png'), false, 'due parole non sono un\'ispezione');
});

test('IL GIUDIZIO: due foto scattate, una guardata → il cancello dice quale manca', () => {
  const esito = giudicaLeFoto({
    cartelle: ['/foto'], dopo: 0, deps: FINTO,
    testi: ['Ho guardato 01-una.png: tutto a posto, nessun pixel fuori riga'],
  });
  assert.equal(esito.ok, false);
  assert.deepEqual(esito.mancanti, ['02-due.png']);
  assert.equal(esito.guardate, 1);
  assert.equal(esito.totali, 2);
});

test('AL CONTRARIO — guardate tutte: il cancello tace', () => {
  const esito = giudicaLeFoto({
    cartelle: ['/foto'], dopo: 0, deps: FINTO,
    testi: ['01-una.png: la vista viva dipinge la pagina intera', '02-due.png: la cornice torna e la tela sparisce'],
  });
  assert.equal(esito.ok, true, `non doveva bloccare: mancano ${esito.mancanti.join(', ')}`);
});

test('SOLO LE FOTO DI ADESSO: lo storico non si riguarda a ogni commit', () => {
  const vecchie = { ...FINTO, statSync: () => ({ mtimeMs: 500 }) };
  const esito = giudicaLeFoto({ cartelle: ['/foto'], dopo: 900, deps: vecchie, testi: [] });
  assert.equal(esito.ok, true);
  assert.equal(esito.totali, 0, 'una foto più vecchia del codice non riguarda questa verifica');
});

test('IL NOME si legge da qualunque percorso, con le barre di qualunque sistema', () => {
  assert.equal(nomeDellaFoto('C:\\temp\\prove\\foto\\03-clic.png'), '03-clic.png');
  assert.equal(nomeDellaFoto('/tmp/prove/foto/03-clic.png'), '03-clic.png');
});

test('LE FOTO SI CERCANO anche nelle sottocartelle, che è dove finiscono davvero', () => {
  const conSottocartella = {
    existsSync: () => true,
    readdirSync: (d) => (d === '/foto'
      ? [{ name: 'C27', isDirectory: () => true }]
      : [{ name: '01-dentro.png', isDirectory: () => false }]),
    statSync: () => ({ mtimeMs: 2_000 }),
  };
  const trovate = fotoDaGuardare(['/foto'], 0, conSottocartella);
  assert.equal(trovate.length, 1);
  assert.equal(trovate[0].nome, '01-dentro.png');
});
