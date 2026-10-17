/*
 * Owner 14/10/2026 (mockup approvato, carta «Sì, così»): una sessione Z.AI che parte senza indirizzo scelto non è un guasto —
 * è una scelta che manca. Il server la ferma prima della rete con `PROVIDER_ENDPOINT_NOT_CHOSEN` («Choose where your Z.AI key
 * goes: …», `src/model-destination.mjs`); qui diventa la carta gialla «Da scegliere», col nome nel titolo e una porta sola.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spiegaErrore, vestizioneErrore, tonoDelTick } from '../../src/components/errori.js';

const SERVER = 'Choose where your Z.AI key goes: Model Lab → Providers → Configure.';

test('ERRORI-INDIRIZZO-01 il codice del server diventa la carta «Da scegliere» di Z.AI: gialla, col nome nel titolo, senza rimedi da leggere', () => {
  const s = spiegaErrore(SERVER, 'PROVIDER_ENDPOINT_NOT_CHOSEN');
  assert.equal(s.id, 'indirizzo-fornitore-da-scegliere');
  assert.equal(s.famiglia, 'indirizzo-fornitore', 'la famiglia è il gancio con cui la chat attacca «Scegli l’indirizzo»');
  assert.equal(s.fornitore, 'Z.AI', 'il nome serve alla chat per aprire la modale di QUEL fornitore');
  assert.equal(s.cosa, 'Non è partito niente: TALOS non sa ancora dove mandare la tua chiave Z.AI.');
  assert.match(s.perche, /piano GLM Coding e uno per il saldo a consumo, in Internazionale e in Cina/u);
  assert.deepEqual(s.rimedi, []);
  assert.equal(s.azione, 'Scegli l’indirizzo', 'la porta della carta ha la sua etichetta nella lingua della persona');
  const v = vestizioneErrore(s);
  assert.equal(v.badge, 'Da scegliere');
  assert.equal(v.titolo, 'Z.AI · indirizzo da scegliere');
  assert.equal(v.tono, 'warning');
  assert.equal(tonoDelTick(v), 'warning', 'il tick del giro segue la carta: niente rosso');
});

test('ERRORI-INDIRIZZO-02 riconosciuto anche dal solo testo (il codice perso per strada), e un altro fornitore ha la frase generica', () => {
  assert.equal(spiegaErrore(SERVER, '').id, 'indirizzo-fornitore-da-scegliere');
  const altro = spiegaErrore('Choose where your Acme key goes: Model Lab → Providers → Configure.', 'PROVIDER_ENDPOINT_NOT_CHOSEN');
  assert.equal(altro.fornitore, 'Acme');
  assert.match(altro.perche, /più indirizzi/u);
  assert.equal(vestizioneErrore(altro).titolo, 'Acme · indirizzo da scegliere');
});

test('ERRORI-INDIRIZZO-03 AL CONTRARIO: la chiave che manca resta la sua carta, e un errore qualunque resta rosso senza nome nel titolo', () => {
  const chiave = spiegaErrore('The key for Z.AI is missing.', 'PROVIDER_KEY_MISSING');
  assert.equal(chiave.id, 'chiave-fornitore-mancante');
  const v = vestizioneErrore(spiegaErrore('boom', 'internal-error'));
  assert.equal(v.tono, 'danger');
  assert.equal(v.titolo, 'TALOS · errore');
});
