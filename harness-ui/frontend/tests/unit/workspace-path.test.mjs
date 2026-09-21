import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizzaCartella, nomeCartellaValido, ultimoSegmento, cartellaSuperiore } from '../../src/domain/workspace-path.ts';

// 06/09 B7b — l'Intro del mockup con i dati veri: percorsi Windows, nomi di cartella, i cancelli fra i passi.

test('WORKSPACE-PERCORSI: normalizzazione Windows, segmento finale, cartella superiore (la radice del disco resta «C:\\»)', () => {
  assert.equal(normalizzaCartella('C:/Users/esempio/Desktop/'), 'C:\\Users\\esempio\\Desktop');
  assert.equal(normalizzaCartella('c:'), 'C:\\');
  assert.equal(ultimoSegmento('C:\\Users\\esempio\\Desktop\\projects'), 'projects');
  assert.equal(ultimoSegmento('C:\\'), 'C:\\');
  assert.equal(cartellaSuperiore('C:\\Users\\esempio'), 'C:\\Users');
  assert.equal(cartellaSuperiore('C:\\Users'), 'C:\\');
  assert.equal(cartellaSuperiore('C:\\'), null);
});

test('WORKSPACE-NOME: un nome di cartella non contiene separatori né è un punto', () => {
  assert.equal(nomeCartellaValido('nuovo-progetto'), true);
  assert.equal(nomeCartellaValido(' '), false);
  assert.equal(nomeCartellaValido('..'), false);
  assert.equal(nomeCartellaValido('a/b'), false);
  assert.equal(nomeCartellaValido('a:b'), false);
});

