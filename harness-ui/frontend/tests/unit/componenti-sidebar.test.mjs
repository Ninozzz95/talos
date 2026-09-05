import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nomeModello, oraCompatta, statoSessione } from '../../src/components/session-item.js';
import { LUOGHI, LUOGHI_ALTRI } from '../../src/components/nav-item.js';

/*
 * Le funzioni PURE dei componenti della sidebar (Fase 2, S-01 e S-02). Il
 * markup lo prova il cancello dei componenti contro il mockup; qui si provano
 * le derivazioni, anche al VERSO CONTRARIO (regola 5-bis).
 */

test('statoSessione: l\'ordine degli stati — attesa prima di vivo, interrotta prima di conclusa', () => {
  assert.equal(statoSessione({ inAttesaApprovazione: true, conclusa: false }).classe, 'attesa');
  assert.equal(statoSessione({ conclusa: false }).classe, 'vivo');
  assert.equal(statoSessione({ conclusa: true, interrotta: true, ultimoEsito: 'successo' }).classe, 'interrotto');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'errore' }).testo, 'errore');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'giri-finiti' }).testo, 'giri finiti');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo' }).tono, 'success');
});

test('statoSessione: nessun esito registrato NON è un successo (niente pallino colorato)', () => {
  const s = statoSessione({ conclusa: true });
  assert.equal(s.classe, 'ignoto');
  assert.equal(s.tono, null);
  assert.match(s.testo, /esito non registrato/u);
});

test('oraCompatta: oggi l\'ora, ieri «ieri», poi i giorni, poi la data', () => {
  const adesso = new Date('2026-09-04T18:30:00');
  assert.equal(oraCompatta('2026-09-04T18:09:00', adesso), '18:09');
  assert.equal(oraCompatta('2026-09-03T23:59:00', adesso), 'ieri');
  assert.equal(oraCompatta('2026-09-02T08:00:00', adesso), '2 g');
  assert.equal(oraCompatta('2026-08-20T08:00:00', adesso), '20/08');
  assert.equal(oraCompatta('non-una-data', adesso), '');
});

test('nomeModello: via il fornitore, mai una stringa vuota', () => {
  assert.equal(nomeModello('google/gemini-3.7-flash'), 'gemini-3.7-flash');
  assert.equal(nomeModello('claude-opus-5'), 'claude-opus-5');
  assert.equal(nomeModello(''), null);
  assert.equal(nomeModello(undefined), null);
});

test('LUOGHI: le voci del mockup, nell\'ordine, con una sola voce senza schermata (Note)', () => {
  assert.deepEqual(LUOGHI.map((l) => l.vaia), ['capability', 'board', 'libreria', 'memoria', 'attivita']);
  assert.deepEqual(LUOGHI_ALTRI.filter((l) => !l.vaia).map((l) => l.conteggio), ['note']);
});
