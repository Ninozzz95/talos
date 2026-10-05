/*
 * BUG-C (owner 04/10/2026): la scheda Terminale era laggosa perché a ogni frame, durante l'output
 * di un comando, `schedeAgenteDagliEventi` ripercorreva TUTTI gli eventi e `testoSchedaAgente`
 * ricostruiva il testo intero. Il memo (`schedeAgenteConMemo`) deve: (1) restituire LO STESSO
 * array quando nulla è cambiato (così `app.js` salta la scrittura per riferimento), (2) ricalcolare
 * quando arriva un evento, (3) ricalcolare quando cambiano le uscite vive (i delta non cambiano la
 * size della mappa: serve la `revisione`), (4) ricalcolare quando cambia la sessione.
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

test('BUG-C MEMO-3: un delta di uscita (revisione su, size uguale) ⇒ ricalcolo', () => {
  const memo = creaMemoSchedeAgente();
  const uscite = new Map();
  const a = schedeAgenteConMemo(EVENTI, { sessione: 's1', uscite }, memo);
  uscite.set('t1', { vivo: 'riga di output\r\n' });
  uscite.revisione = 1;
  const b = schedeAgenteConMemo(EVENTI, { sessione: 's1', uscite }, memo);
  assert.notEqual(b, a, 'delta senza nuovo evento: la revisione forza il ricalcolo');
});

test('BUG-C MEMO-4: sessione diversa ⇒ ricalcolo (la cache non porta schede di un altra sessione)', () => {
  const memo = creaMemoSchedeAgente();
  const a = schedeAgenteConMemo(EVENTI, { sessione: 's1' }, memo);
  const b = schedeAgenteConMemo(EVENTI, { sessione: 's2' }, memo);
  assert.notEqual(b, a);
});
