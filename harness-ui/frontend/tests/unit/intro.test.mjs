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

// 06/09 — audit delle decisioni E17/F16: la combinazione «cartella fuori dai progetti + permesso
// diverso da Accesso pieno» è impossibile per il server, e va detta DOVE si sceglie.
test('INTRO-CARTELLA-FUORI: Avanti non passa con una combinazione che il server rifiuterebbe', () => {
  const progetti = ['C:/progetti/AVM'];
  const dentro = (cartella) => progetti.some((p) => cartella === p || cartella.startsWith(`${p}/`));
  assert.equal(dentro('C:/progetti/AVM'), true);
  assert.equal(dentro('C:/progetti/AVM/src'), true);
  assert.equal(dentro('C:/Users/x/Temp/prova'), false);
  // la regola dell'Avanti, come la applica mostraPasso
  const bloccato = (cartella, politica, confermaPieno = false) => {
    const fuori = !dentro(cartella);
    return !politica || (fuori && politica !== 'Full access') || (politica === 'Full access' && !confermaPieno);
  };
  assert.equal(bloccato('C:/Users/x/Temp/prova', 'Workspace write'), true);
  assert.equal(bloccato('C:/Users/x/Temp/prova', 'Full access', true), false);
  assert.equal(bloccato('C:/progetti/AVM', 'Workspace write'), false);
  assert.equal(bloccato('C:/progetti/AVM', null), true);
});
