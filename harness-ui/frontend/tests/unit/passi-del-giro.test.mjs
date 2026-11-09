/*
 * FE-008: i Passi a schermo. Il testo viene dal modello: solo testo (il DOM finto lancia su `innerHTML`). Nessun timer nuovo. Una revisione vecchia
 * non riporta indietro la lista.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { creaFiltroChiamatePassi, creaPassiDelGiro, finestraPassi } from '../../src/components/passi-del-giro.js';

const voci = (n, ora) => Array.from({ length: n }, (_, i) => ({ testo: `passo ${i}`, stato: i < ora ? 'completed' : i === ora ? 'in_progress' : 'pending', ...(i <= ora ? { iniziatoAl: 1000 } : {}), ...(i < ora ? { finitoAl: 4000 } : {}) }));
const lista = (revisione, ...a) => ({ revisione, voci: voci(...a) });
const nomi = (nodo) => nodo.querySelectorAll('.talos-tool-row__name').map((n) => n.textContent);
function vista(extra = {}) {
  const document = documento();
  const corse = [];
  const p = creaPassiDelGiro({ document, durata: (ms) => `${ms / 1000} s`, quandoCorre: () => corse.push(1), ...extra });
  return { p, nodo: p.nodo, corse };
}

test('PASSI-FE-01 fino a cinque voci attorno a quella in corso, «altri N» per il resto', () => {
  assert.deepEqual(finestraPassi(voci(3, 1)).visibili.length, 3);
  const inizio = finestraPassi(voci(9, 0));
  assert.deepEqual(inizio.visibili.map((v) => v.testo), ['passo 0', 'passo 1', 'passo 2', 'passo 3', 'passo 4']);
  assert.equal(inizio.resto, 4);
  const mezzo = finestraPassi(voci(9, 4));
  assert.equal(mezzo.visibili[0].testo, 'passo 3', 'la precedente resta sopra');
  assert.equal(mezzo.resto, 1);
  const fine = finestraPassi(voci(9, 9));
  assert.equal(fine.visibili.at(-1).testo, 'passo 8');
  assert.equal(fine.resto, 0);
  const { p, nodo } = vista();
  p.aggiorna(lista(1, 9, 0));
  assert.equal(nodo.querySelector('.passi-altri').textContent, 'altri 4');
});

test('PASSI-FE-02 una revisione vecchia si scarta, una voce sconosciuta non rompe', () => {
  const { p, nodo } = vista();
  assert.equal(p.aggiorna(lista(2, 3, 1)), true);
  assert.equal(p.aggiorna(lista(1, 7, 0)), false);
  assert.equal(p.aggiorna(lista(2, 7, 0)), false);
  assert.equal(nomi(nodo).length, 3);
  for (const storto of [null, {}, { revisione: 3 }, { revisione: 'x', voci: [] }]) assert.equal(p.aggiorna(storto), false);
  assert.equal(p.aggiorna({ revisione: 3, voci: [{ testo: 'x', stato: 'inventato' }] }), true);
  assert.equal(nodo.querySelector('.talos-tool-row').dataset.passo, 'no');
});

test('PASSI-FE-03 il testo del modello resta testo; la testata conta fatti su totale senza le annullate', () => {
  const { p, nodo } = vista();
  const male = '<img src=x onerror=alert(1)>';
  p.aggiorna({ revisione: 1, voci: [{ testo: male, stato: 'completed' }, { testo: 'via', stato: 'cancelled' }, { testo: 'b', stato: 'in_progress', iniziatoAl: 1 }] });
  assert.equal(nomi(nodo)[0], male);
  assert.equal(nodo.querySelector('img'), null);
  assert.equal(nodo.querySelector('.talos-grow').textContent, 'Passi · 1 di 2');
});

test('PASSI-FE-04 i secondi: la voce in corso usa l\'orologio della riga viva, le fatte dicono quanto ci hanno messo; nessun timer nuovo', () => {
  const { p, nodo, corse } = vista();
  p.aggiorna(lista(1, 3, 1));
  const righe = nodo.querySelectorAll('.talos-tool-row');
  assert.equal(righe[1].querySelector('.talos-tool-row__detail').dataset.attivitaDa, '1000');
  assert.equal(righe[0].querySelector('.talos-tool-row__detail').textContent, '3 s');
  assert.equal(righe[2].querySelector('.talos-tool-row__detail').textContent, '');
  assert.equal(corse.length, 1);
  const sorgente = readFileSync(new URL('../../src/components/passi-del-giro.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.equal(/setInterval|setTimeout/u.test(sorgente), false);
});

test('PASSI-FE-05 si apre e si chiude dalla testata; a lista finita si chiude da sola, e la prossima la riapre', () => {
  const { p, nodo } = vista();
  assert.equal(nodo.hidden, true, 'senza lista non c\'è');
  p.aggiorna(lista(1, 3, 1));
  assert.equal(nodo.hidden, false);
  assert.equal(nodo.querySelector('.talos-activity__body').hidden, false);
  p.fineGiro();
  assert.equal(nodo.querySelector('.talos-activity__body').hidden, false, 'con voci aperte resta aperta');
  clic(nodo.querySelector('.talos-activity__head'));
  assert.equal(nodo.querySelector('.talos-activity__head').getAttribute('aria-expanded'), 'false');
  p.aggiorna(lista(2, 3, 2));
  assert.equal(nodo.querySelector('.talos-activity__body').hidden, true, 'chi l\'ha chiusa la trova chiusa');
  p.aggiorna(lista(3, 3, 3));
  p.fineGiro();
  assert.equal(nodo.querySelector('.talos-activity__head').getAttribute('aria-expanded'), 'false');
  p.aggiorna(lista(4, 2, 0));
  assert.equal(nodo.querySelector('.talos-activity__body').hidden, false, 'una lista nuova si riapre');
  p.azzera();
  assert.equal(nodo.hidden, true);
  assert.equal(p.aggiorna(lista(1, 2, 0)), true, 'cambiando chat si riparte da capo');
});

test('PASSI-FE-05b aperta e con la lista finita, a fine giro si chiude', () => {
  const { p, nodo } = vista();
  p.aggiorna(lista(1, 2, 2));
  assert.equal(nodo.querySelector('.talos-activity__body').hidden, false);
  p.fineGiro();
  assert.equal(nodo.querySelector('.talos-activity__body').hidden, true);
});

test('PASSI-FE-06 le chiamate di `steps_update` non stanno nell\'elenco degli strumenti; le altre sì', () => {
  const salta = creaFiltroChiamatePassi();
  assert.equal(salta({ type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'steps_update' }), true);
  assert.equal(salta({ type: 'ToolCallArgs', toolCallId: 'a' }), true);
  assert.equal(salta({ type: 'ToolCallResult', toolCallId: 'a' }), true);
  assert.equal(salta({ type: 'ToolCallStart', toolCallId: 'b', toolCallName: 'leggi' }), false);
  assert.equal(salta({ type: 'ToolCallResult', toolCallId: 'b' }), false);
  assert.equal(salta({ type: 'TextMessageContent', delta: 'x' }), false);
});

test('PASSI-FE-07 la chat è collegata: evento, filtro, fine giro e cambio di chat; lo stile è caricato', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /evento\.name === EVENTO_PASSI/u);
  assert.match(app, /chiamataDeiPassi\(evento\)/u);
  assert.match(app, /passiDelGiro\?\.fineGiro\(\)/u);
  assert.match(app, /passiDelGiro\?\.azzera\(\)/u);
  assert.match(readFileSync(new URL('../../src/styles/main.css', import.meta.url), 'utf8'), /@import '\.\/passi-del-giro\.css'/u);
});

test('PASSI-FE-08 owner 04/11: la revisione conta dentro la sessione; la lista di un\'altra sessione si sostituisce sempre', () => {
  const { p, nodo } = vista();
  assert.equal(p.aggiorna(lista(5, 3, 1), 'chat-a'), true);
  assert.equal(p.aggiorna(lista(4, 3, 2), 'chat-a'), false, 'dentro la stessa sessione una revisione vecchia si scarta ancora');
  assert.equal(p.aggiorna(lista(1, 2, 0), 'chat-b'), true, 'la 1 della chat nuova non la scarta la 5 di A');
  assert.equal(nomi(nodo).length, 2);
  assert.equal(p.aggiorna(lista(1, 2, 1), 'chat-b'), false);
  clic(nodo.querySelector('.talos-activity__head'));
  assert.equal(p.aggiorna(lista(2, 4, 0), 'chat-c'), true);
  assert.equal(nodo.querySelector('.talos-activity__body').hidden, false, 'chiusa a mano in un\'altra chat: questa si apre');
});

test('PASSI-FE-09 la chat tenuta pronta porta via la sua lista e la riporta com\'era', () => {
  const { p, nodo } = vista();
  assert.equal(p.istantanea(), null, 'senza lista niente da portare via');
  p.aggiorna(lista(3, 3, 3), 'chat-a');
  p.fineGiro();
  const presa = p.istantanea();
  assert.deepEqual({ sessione: presa.sessione, revisione: presa.stato.revisione, aperta: presa.aperta }, { sessione: 'chat-a', revisione: 3, aperta: false });
  p.azzera();
  assert.equal(nodo.hidden, true);
  p.ripristina(presa);
  assert.equal(nodo.hidden, false);
  assert.equal(nomi(nodo).length, 3);
  assert.equal(nodo.querySelector('.talos-activity__head').getAttribute('aria-expanded'), 'false', 'chiusa com\'era');
  assert.equal(p.aggiorna(lista(3, 3, 2), 'chat-a'), false, 'e con la sua revisione');
  p.ripristina(null);
  assert.equal(nodo.hidden, true, 'una chat pronta senza lista non ne mostra una');
});

test('PASSI-FE-10 la lista si toglie quando la chat cambia davvero, per ogni strada, e l\'evento dice di chi è', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const generazione = app.slice(app.indexOf('function nuovaGenerazioneSessione('), app.indexOf('outputSessionController.abort()'));
  assert.match(generazione, /parcheggiaChatAperta\(\);[\s\S]*if \(!continua\) passiDelGiro\?\.azzera\(\);/u, 'dopo il parcheggio, solo se la chat cambia');
  const testa = app.slice(app.indexOf('function passaASessione('), app.indexOf('if (state.sessionSelection.active) {', app.indexOf('function passaASessione(')));
  assert.doesNotMatch(testa, /passiDelGiro\?\.azzera\(\)/u, 'ricliccare la chat aperta non toglie la sua lista');
  /* P1 (04/11): la chiave è la sessione dell'evento; la storia ereditata di un ramo passa con `sessioneDegliEventi` = il padre */
  assert.match(app, /passiNelPiede\(\)\?\.aggiorna\(evento\.value, sessioneDegliEventi \?\? state\.realSession\.id\)/u);
  assert.match(app, /passi: passiDelGiro\?\.istantanea\(\) \?\? null/u);
  assert.match(app, /passiNelPiede\(\)\?\.ripristina\(voce\.moduli\.passi\)/u);
});
