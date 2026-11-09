/*
 * FE-016, 03/11: i campi nuovi di Computer use (`feat/computer-use-protezioni` b2ca0180f). «Consenti sempre» deciso dall'owner: `consensoDelCompito` accetta 'si' | 'sempre' | 'no',
 * anche sul luogo nuovo; un luogo già ricordato arriva con `ricordato: true`; le decisioni del consenso portano `fonte: 'ricordato' | 'sempre'`; un'azione sotto una finestra
 * di TALOS finisce `non-eseguita` col motivo `coperto-da-talos`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { cartaDelCompito, cartaFine } from '../../src/components/computer-use/carte.js';
import { fraseDelPasso, paroleDellaFonte } from '../../src/components/computer-use/parole.js';
import { STATO_PILLOLA_INIZIALE, statoPillola } from '../../src/components/computer-use/pillola.js';

const PIANO = { obiettivo: 'Compra', domini: [{ nome: 'trenitalia.example', ricordato: true }, { nome: 'nuovo.example' }], app: [{ nome: 'WhatsApp', ricordato: true }], accessi: [], posso: null };

test('RIC-01 la carta risponde col valore del contratto: «Consenti sempre» è \'sempre\'', () => {
  const document = documento();
  const risposte = [];
  const c = cartaDelCompito(PIANO, { document, alRisposta: (r) => risposte.push(r) });
  clic(c.querySelector('.cs-si'));
  clic(c.querySelector('.cs-sempre'));
  clic(c.querySelector('.cs-no'));
  clic(c.querySelector('.cs-x'));
  assert.deepEqual(risposte, ['si', 'sempre', 'no', 'no']);
});

test('RIC-02 anche il luogo nuovo si può ricordare', () => {
  const document = documento();
  const risposte = [];
  const c = cartaDelCompito({ nuovo: { dominio: 'prenotazioni.example' } }, { document, alRisposta: (r) => risposte.push(r) });
  clic(c.querySelector('.cs-sempre'));
  assert.deepEqual(risposte, ['sempre']);
});

test('RIC-03 i luoghi già ricordati si riconoscono nella riga «Dove lavoro»; gli altri no', () => {
  const document = documento();
  const t0 = cartaDelCompito(PIANO, { document }).textContent;
  assert.match(t0, /trenitalia\.example \(ricordato\)/u);
  assert.match(t0, /WhatsApp \(ricordato\)/u);
  assert.doesNotMatch(t0, /nuovo\.example \(ricordato\)/u);
});

test('RIC-04 chi ha deciso: il consenso ricordato e il «sempre» hanno le loro parole e il loro titolo', () => {
  assert.equal(paroleDellaFonte({ fonte: 'ricordato' }), 'Dai luoghi che hai ricordato');
  assert.equal(paroleDellaFonte({ fonte: 'sempre' }), 'Col tuo «Consenti sempre»');
  const document = documento();
  const c = cartaFine({ decisioni: [{ passo: 0, protezione: null, azione: 'consenso', fonte: 'ricordato' }, { passo: 4, protezione: null, azione: 'consenso', fonte: 'sempre' }], spese: [] }, { document });
  // revisione M del 04/11, D2: la stessa parola della carta del compito («Dove lavoro»)
  assert.equal(c.textContent.split('Dove lavoro').length - 1, 2);
  assert.doesNotMatch(c.textContent, /Dove lavorare/u);
  assert.doesNotMatch(c.textContent, /Azione delicata/u);
});

test('RIC-05 il passo coperto da TALOS si dice nella pillola, poi si torna alla frase del gruppo', () => {
  assert.match(fraseDelPasso({ esito: 'non-eseguita', motivo: 'coperto-da-talos' }), /finestra di TALOS/u);
  assert.equal(fraseDelPasso({ esito: 'non-eseguita', motivo: 'altro' }), '');
  assert.equal(fraseDelPasso({ esito: 'confermata', motivo: 'coperto-da-talos' }), '');
  let s = statoPillola(STATO_PILLOLA_INIZIALE, { name: 'talos.computer-use-passo', value: { fase: 'annuncio', bersaglio: 'Cerca' } });
  s = statoPillola(s, { name: 'talos.computer-use-passo', value: { fase: 'esito', esito: 'non-eseguita', motivo: 'coperto-da-talos' } });
  assert.match(s.fase, /finestra di TALOS/u);
  s = statoPillola(s, { name: 'talos.computer-use-passo', value: { fase: 'esito', esito: 'confermata', motivo: null } });
  assert.match(s.fase, /finestra di TALOS/u, 'un esito normale non cambia la frase');
  s = statoPillola(s, { name: 'talos.computer-use-passo', value: { fase: 'annuncio', bersaglio: 'Altro' } });
  assert.equal(s.fase, 'Altro');
});
