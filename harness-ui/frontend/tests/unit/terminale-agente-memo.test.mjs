/*
 * BUG-C (owner 04/10/2026) → BUG-23 (owner 05/10/2026): il memo delle schede agente.
 * Il memo (`schedeAgenteConMemo`) deve: (1) restituire LO STESSO array quando nulla è cambiato (così `app.js`
 * salta la scrittura per riferimento), (2) ricalcolare quando arriva un EVENTO nuovo (solo Start/Args/Result/
 * Approval arrivano in `eventiAttrezzi`), (3) NON ricalcolare per un delta di uscita: i delta non cambiano la
 * struttura, il testo vivo lo scrive DIRETTAMENTE la xterm (cura F1 di BUG-23) — la chiave NON guarda più la
 * `revisione` delle uscite, ed è questo che ammazza l'O(N) per frame, (4) ricalcolare quando cambia la sessione.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaMemoSchedeAgente, schedeAgenteConMemo } from '../../src/components/terminale-agente.js';

const START = { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'shell', comando: 'npm test', ricevutoA: 1_000, giro: 1, chi: 'agente' };
const EVENTI = [START];

test('BUG-C MEMO-1: niente di nuovo ⇒ LO STESSO array (per riferimento), non un ricalcolo', () => {
  const memo = creaMemoSchedeAgente();
  const a = schedeAgenteConMemo(EVENTI, { sessione: 's1' }, memo);
  const b = schedeAgenteConMemo(EVENTI, { sessione: 's1' }, memo);
  assert.equal(b, a, 'stesso input: il memo deve restituire lo stesso array');
});

test('BUG-C MEMO-2: un evento nuovo ⇒ ricalcolo', () => {
  const memo = creaMemoSchedeAgente();
  const a = schedeAgenteConMemo(EVENTI, { sessione: 's1' }, memo);
  const b = schedeAgenteConMemo([...EVENTI, { type: 'ToolCallStart', toolCallId: 't2', toolCallName: 'shell', comando: 'ls', ricevutoA: 2_000, giro: 1, chi: 'agente' }], { sessione: 's1' }, memo);
  assert.notEqual(b, a, 'eventi in piu: ricalcolo');
});

test('BUG23 MEMO-3: un delta di uscita (revisione su, size uguale) ⇒ NESSUN ricalcolo (il testo vivo lo scrive la xterm, F1)', () => {
  const memo = creaMemoSchedeAgente();
  const uscite = new Map();
  const a = schedeAgenteConMemo(EVENTI, { sessione: 's1', uscite }, memo);
  uscite.set('t1', { vivo: 'riga di output\r\n' });
  uscite.revisione = 1;
  const b = schedeAgenteConMemo(EVENTI, { sessione: 's1', uscite }, memo);
  assert.equal(b, a, 'il delta non cambia la struttura: ricalcolare a ogni frame era il lag');
});

test('BUG-C MEMO-4: sessione diversa ⇒ ricalcolo (la cache non porta schede di un altra sessione)', () => {
  const memo = creaMemoSchedeAgente();
  const a = schedeAgenteConMemo(EVENTI, { sessione: 's1' }, memo);
  const b = schedeAgenteConMemo(EVENTI, { sessione: 's2' }, memo);
  assert.notEqual(b, a);
});

test('BUG23 MEMO-5: una scheda chiusa a mano (chiuse cresce) ⇒ ricalcolo', () => {
  const memo = creaMemoSchedeAgente();
  const a = schedeAgenteConMemo(EVENTI, { sessione: 's1', chiuse: new Map() }, memo);
  const b = schedeAgenteConMemo(EVENTI, { sessione: 's1', chiuse: new Map([['agente', 1]]) }, memo);
  assert.notEqual(b, a, 'la chiusura a mano cambia ciò che si vede: ricalcolo');
});
