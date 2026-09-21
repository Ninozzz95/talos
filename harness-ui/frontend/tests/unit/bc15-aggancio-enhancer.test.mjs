import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fraseProvenienza } from '../../src/components/migliora-prompt.js';

/*
 * ⭐⭐⭐ BC-15, 11/09/2026 — IL PULSANTE CHE MANCAVA.
 *
 * Il componente `components/migliora-prompt.js` e la rotta
 * `POST /api/v1/sessions/:id/migliora-prompt` esistevano già da poche ore e non erano
 * raggiungibili da nessun gesto: nel composer non c'era nessun pulsante, cioè una funzione
 * intera scritta, provata e invisibile. Qui si prova l'AGGANCIO — la parte che nessuna delle
 * 16 prove del componente poteva vedere.
 *
 * Misurato dal vivo (banco mio su porta privata, mai il 4174; sessione e riscrittura FINTE a
 * livello di rete, quindi nessun modello chiamato e nessun costo):
 *   · il pulsante è 38×38 come gli altri due bottoni-icona della barra, il glifo `#i-sparkles`
 *     esiste nello sprite;
 *   · il pannello si apre 7 px sopra il composer, dentro lo schermo, `role="dialog"`;
 *   · «Sostituisci» scrive nel composer e il composer CRESCE (125 px, 5 righe) — cioè l'evento
 *     `input` è arrivato: senza, resterebbe una barra che non sa di avere un messaggio;
 *   · senza una chat avviata si legge «Avvia la chat: la riscrittura usa il modello di questa
 *     conversazione.» invece di un 404;
 *   · zero errori a runtime, tema chiaro e tema scuro.
 */

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const TEMPLATE = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
const APP_NUDO = APP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('BC15-PULSANTE: c’è, nella barra del composer, con un nome che una persona capisce', () => {
  assert.match(TEMPLATE, /id="miglioraPromptBtn"/);
  assert.match(TEMPLATE, /aria-label="Migliora il prompt"/);
  assert.match(TEMPLATE, /aria-controls="miglioraPromptPannello"/);
  // stessa classe dei due bottoni-icona che ha già la barra: nessuna grammatica nuova
  assert.match(TEMPLATE, /class="talos-composer__attach" id="miglioraPromptBtn"/);
  // e sta dopo il «+»: le due cose che si fanno al messaggio prima di mandarlo stanno insieme
  assert.ok(TEMPLATE.indexOf('id="capabilityBtn"') < TEMPLATE.indexOf('id="miglioraPromptBtn"'));
});

test('BC15-GLIFO: il simbolo usato esiste davvero nello sprite', () => {
  assert.match(TEMPLATE, /<symbol id="i-sparkles"/);
  assert.match(TEMPLATE, /id="miglioraPromptBtn"[\s\S]{0,220}href="#i-sparkles"/);
});

test('BC15-EVENTO: dopo l’inserimento il composer viene avvisato', () => {
  assert.match(APP_NUDO, /applica: \(\{ modo, testo \}\) => \{[\s\S]{0,420}dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
});

test('BC15-MODELLO: non si sceglie, si dichiara — e la dichiarazione segue il modello della chat', () => {
  assert.match(APP_NUDO, /const modello = state\.model \|\| '';/);
  assert.match(APP_NUDO, /if \(miglioraPrompt && miglioraPromptModello === modello\) return miglioraPrompt;/);
  // nessun modello passato da fuori alla rotta: il corpo porta solo prompt e profondità
  assert.match(APP_NUDO, /migliora-prompt`, \{ prompt, profondita \}\)/);
});

test('BC15-SENZA-CHAT: il pulsante non si spegne, spiega', () => {
  assert.doesNotMatch(TEMPLATE, /id="miglioraPromptBtn"[^>]*disabled/);
  assert.match(APP_NUDO, /Avvia la chat: la riscrittura usa il modello di questa conversazione\./);
});

test('BC15-PROVENIENZA: senza un nome, la frase non si ripete', () => {
  // ⛔ trovato nella foto: «Lo riscrive il modello di questa chat, il modello di questa chat.»
  assert.equal(fraseProvenienza(''), 'Lo riscrive il modello di questa chat.');
  assert.equal(fraseProvenienza('z-ai/glm-5.3-flash'), 'Lo riscrive glm-5.3-flash, il modello di questa chat.');
});

test('BC15-MORDE: tolto l’evento «input», la guardia diventa rossa', () => {
  const mutato = APP_NUDO.replace("input.dispatchEvent(new Event('input', { bubbles: true }));", 'void input;');
  assert.doesNotMatch(mutato, /applica: \(\{ modo, testo \}\) => \{[\s\S]{0,420}dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
});
