/* Contratto del segno, riga 36 (05/11/2026): le risposte dalla bolla vanno alla sessione che usa il computer, MAI alla chat visibile.
   Oggi la bolla sa la sessione (`{tipo:'sessione'}` → `stato.sessionId`) ma la manda solo con «Apri in TALOS»: «Ferma», il messaggio
   scritto, la risposta a una carta e la riga «Posso» partono senza, e chi le riceve può solo indovinare (la chat visibile).
   ROSSO finché ogni uscita non porta la sessione. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { documento, clic, orologio } from './aiuto-dom-blocchi.mjs';
import { creaBolla } from '../../src/components/computer-use/bolla.js';

function scena() {
  const document = documento();
  const finestra = new EventTarget();
  finestra.open = () => null;
  const canale = { mandati: [], onmessage: null, postMessage(m) { canale.mandati.push(m); }, arriva(data) { canale.onmessage?.({ data }); } };
  const clock = orologio();
  const b = creaBolla({ document, finestra, canale, timer: clock.timer, adesso: clock.adesso });
  document.body.append(b.nodo);
  return { canale, b };
}
const passo = { tipo: 'evento', evento: { name: 'talos.computer-use-passo', value: { fase: 'annuncio', n: 1, bersaglio: 'Cerco' } } };
const consenso = { tipo: 'domanda', id: 'q1', porta: 'consenso', dati: { obiettivo: 'x', domini: [], app: [], accessi: [], posso: { pagare: true, inviare: false, cancellare: false, tetto: null } } };

test('BOS-01 «Ferma» porta la sessione che usa il computer', () => {
  const { b, canale } = scena();
  canale.arriva({ tipo: 'sessione', sessionId: 's-cu' });
  canale.arriva(passo);
  clic(b.nodo.querySelector('[data-ferma]'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'ferma', sessionId: 's-cu' });
});

test('BOS-02 la risposta a una carta e la riga «Posso» portano la sessione', () => {
  const { b, canale } = scena();
  canale.arriva({ tipo: 'sessione', sessionId: 's-cu' });
  canale.arriva(consenso);
  clic(b.nodo.querySelectorAll('button').find((x) => x.textContent.startsWith('inviare')));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'posso', id: 'q1', valore: { pagare: true, inviare: true, cancellare: false, tetto: null }, sessionId: 's-cu' });
  clic(b.nodo.querySelector('.cs-sempre'));
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'risposta', id: 'q1', valore: 'sempre', sessionId: 's-cu' });
});

test('BOS-03 il messaggio scritto durante il compito porta la sessione', () => {
  const { b, canale } = scena();
  canale.arriva({ tipo: 'sessione', sessionId: 's-cu' });
  const campo = b.nodo.querySelector('textarea');
  campo.value = 'prendi quello delle 9';
  const e = new Event('keydown', { cancelable: true }); e.key = 'Enter'; e.shiftKey = false;
  campo.dispatchEvent(e);
  assert.deepEqual(canale.mandati.at(-1), { tipo: 'messaggio', testo: 'prendi quello delle 9', sessionId: 's-cu' });
});

test('BOS-04 la sessione cambiata vale per la risposta dopo: mai quella vecchia', () => {
  const { b, canale } = scena();
  canale.arriva({ tipo: 'sessione', sessionId: 's-vecchia' });
  canale.arriva({ tipo: 'sessione', sessionId: 's-nuova' });
  canale.arriva(passo);
  clic(b.nodo.querySelector('[data-ferma]'));
  assert.equal(canale.mandati.at(-1).sessionId, 's-nuova');
});
