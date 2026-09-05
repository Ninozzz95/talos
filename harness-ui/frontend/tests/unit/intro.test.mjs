import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizzaCartella, nomeCartellaValido, ultimoSegmento, cartellaSuperiore, riepilogo, passoConsentito } from '../../src/components/intro.js';

// 06/09 B7b — l'Intro del mockup con i dati veri: percorsi Windows, nomi di cartella, i cancelli fra i passi.

test('INTRO-PERCORSI: normalizzazione Windows, segmento finale, cartella superiore (la radice del disco resta «C:\\»)', () => {
  assert.equal(normalizzaCartella('C:/Users/Antonino/Desktop/'), 'C:\\Users\\Antonino\\Desktop');
  assert.equal(normalizzaCartella('c:'), 'C:\\');
  assert.equal(ultimoSegmento('C:\\Users\\Antonino\\Desktop\\projects'), 'projects');
  assert.equal(ultimoSegmento('C:\\'), 'C:\\');
  assert.equal(cartellaSuperiore('C:\\Users\\Antonino'), 'C:\\Users');
  assert.equal(cartellaSuperiore('C:\\Users'), 'C:\\');
  assert.equal(cartellaSuperiore('C:\\'), null);
});

test('INTRO-NOME: un nome di cartella non contiene separatori né è un punto', () => {
  assert.equal(nomeCartellaValido('nuovo-progetto'), true);
  assert.equal(nomeCartellaValido(' '), false);
  assert.equal(nomeCartellaValido('..'), false);
  assert.equal(nomeCartellaValido('a/b'), false);
  assert.equal(nomeCartellaValido('a:b'), false);
});

test('INTRO-PASSI: non si salta un passo senza la scelta; «Accesso pieno» vuole la conferma', () => {
  assert.deepEqual(passoConsentito(1, { cartella: '' }), { ok: false, torna: 0, messaggio: 'Scegli prima una cartella.' });
  assert.deepEqual(passoConsentito(2, { cartella: 'C:\\x', modello: '' }).torna, 1);
  assert.equal(passoConsentito(3, { cartella: 'C:\\x', modello: 'm', politica: 'Full access', confermaPieno: false }).torna, 2);
  assert.equal(passoConsentito(3, { cartella: 'C:\\x', modello: 'm', politica: 'Full access', confermaPieno: true }).ok, true);
  assert.equal(passoConsentito(3, { cartella: 'C:\\x', modello: 'm', politica: 'Workspace write' }).ok, true);
  assert.equal(riepilogo({ cartella: 'C:\\x', modello: 'GLM 4.7 flash', politica: 'Scrive nel progetto' }), 'Cartella: C:\\x · Modello: GLM 4.7 flash · Permessi: Scrive nel progetto');
  assert.equal(riepilogo({}), 'Cartella: da scegliere · Modello: da scegliere · Permessi: da scegliere');
});
