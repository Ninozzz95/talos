import assert from 'node:assert/strict';
import test from 'node:test';

import { origineDellaRichiesta } from '../src/http-app.mjs';

/*
 * ⛔⛔ D-11 — «chi ha creato questa sessione», la domanda che il 10/09 non ha avuto risposta.
 *
 * Quattro sessioni comparse sul 4174 con un modello fuori regola; cinque piste seguite, due sessioni
 * interrogate, una corrispondenza testuale esatta con lo scenario della pipeline QA, e nessun modo
 * di sapere chi avesse fatto quel POST — perché il dato non lo registrava nessuno, e i log del
 * server li azzera ogni riavvio.
 *
 * ⛔ DIAGNOSTICA, NON SICUREZZA: sono valori che scrive il chiamante, quindi falsificabili. Servono
 *   a riconoscere uno strumento di casa, non a decidere alcunché — e nessun test qui deve mai
 *   suggerire il contrario.
 */

const finta = (headers = {}, indirizzo = '127.0.0.1') => ({ headers, socket: { remoteAddress: indirizzo } });

test('D-11: un nostro strumento che si dichiara viene riconosciuto per nome', () => {
  const o = origineDellaRichiesta(finta({ 'x-talos-origine': 'qa-visual-pipeline', 'user-agent': 'node' }));
  assert.equal(o.dichiarata, 'qa-visual-pipeline');
  assert.equal(o.agente, 'node');
  assert.equal(o.indirizzo, '127.0.0.1');
});

test('D-11: senza dichiarazione resta l’User-Agent, che separa un browser da uno script', () => {
  const browser = origineDellaRichiesta(finta({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/141' }));
  const script = origineDellaRichiesta(finta({ 'user-agent': 'undici' }));
  assert.equal(browser.dichiarata, undefined, 'un browser non dichiara niente, ed è normale');
  assert.match(browser.agente, /Chrome/);
  assert.equal(script.agente, 'undici');
});

/* ⛔ AL CONTRARIO: mai inventare un'origine che non c'è. «sconosciuto» sarebbe una bugia comoda. */
test('D-11, AL CONTRARIO: senza niente da dire non si inventa un’origine', () => {
  assert.equal(origineDellaRichiesta({ headers: {}, socket: {} }), null);
  assert.equal(origineDellaRichiesta(undefined), null);
  assert.equal(origineDellaRichiesta({}), null);
});

test('D-11, AL CONTRARIO: campi vuoti o di soli spazi valgono come assenti', () => {
  assert.equal(origineDellaRichiesta(finta({ 'x-talos-origine': '   ', 'user-agent': '' }, '')), null);
});

/*
 * ⛔ Un'intestazione la scrive il chiamante: può essere lunga a piacere, e finisce su disco in ogni
 * record di sessione. Si taglia, o un campo diagnostico diventa un modo per gonfiare il registro.
 */
test('D-11: un campo enorme viene tagliato, non scritto per intero', () => {
  const o = origineDellaRichiesta(finta({ 'x-talos-origine': 'x'.repeat(5000), 'user-agent': 'y'.repeat(5000) }));
  assert.equal(o.dichiarata.length, 200);
  assert.equal(o.agente.length, 200);
});

test('D-11: l’indirizzo da solo basta a produrre un’origine', () => {
  const o = origineDellaRichiesta(finta({}, '::1'));
  assert.deepEqual(o, { indirizzo: '::1' });
});
