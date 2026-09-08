import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * ⛔ 08/09/2026, owner: «non riesco a provarlo perché quando clicco pagina la pagina non si
 *   ricarica». Riprodotto sul 4174: su un sito che vieta la cornice, `corniceDellaLettura`
 *   rimetteva il modo a 'testo' a OGNI render — quindi il clic su «Pagina» durava un istante e
 *   veniva annullato. Un pulsante che non fa niente e non dice niente.
 *
 * ⛔ La prova che avevo scritto il giorno prima diceva VERDE su questo giro: controllava che il
 *   TESTO sparisse, non che la PAGINA tornasse. Sono due fatti diversi, e quello che conta è il
 *   secondo — chi guarda vuole vedere la pagina, non il non-vedere il testo.
 *
 * Ricerca 08/09/2026 (Hermes Agent, «Browser Automation» e «Browser CDP Supervisor»): il loro
 * ripiego fra motori è TRASPARENTE — quello che un motore non sa fare viene ritentato sull'altro
 * senza che la persona debba saperlo. Stesso principio qui: chiedere «Pagina» su un sito che
 * vieta la cornice non è una richiesta impossibile, è il caso per cui esiste il browser pilotato.
 *
 * Si legge il sorgente perché la regia sta dentro `creaBrowser`, che vuole tutto il DOM del
 * mockup: la guardia sta sulle condizioni che, tolte, fanno tornare il difetto.
 */

const SORGENTE = readFileSync(new URL('../../src/components/browser.js', import.meta.url), 'utf8');
const senzaCommenti = SORGENTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('IL RIPIEGO AL TESTO non zittisce chi ha CHIESTO la pagina', () => {
  assert.match(
    senzaCommenti,
    /if \(stato\.modo === 'pagina' && stato\.modoChiesto !== 'pagina'\) stato\.modo = 'testo';/,
    'senza la seconda condizione il render annulla il clic su «Pagina», per sempre',
  );
});

test('CHIEDERE LA PAGINA su un sito che vieta la cornice APRE la pagina viva', () => {
  assert.match(senzaCommenti, /incorniciabile === false[\s\S]{0,160}azioni\.apri\?\./,
    'il clic deve chiamare l\'apertura viva quando la cornice non è possibile: il ripiego è trasparente');
});

/*
 * ⛔ 08/09/2026, owner: «se il pulsante pagina viene cliccato e cambio scheda mi va a
 *   visualizzazione sorgente, non deve succedere, deve ricordare la mia scelta».
 *   Questa prova diceva il CONTRARIO — l'avevo scritta io poche ore prima per difendere la mia
 *   decisione di azzerare la scelta al cambio scheda, che era sbagliata: è una PREFERENZA.
 *   La guardia non si cancella, si GIRA: adesso pretende il contrario e resta una guardia.
 */
test('LA SCELTA SI RICORDA, per scheda: cambiando pagina e tornando indietro si ritrova', () => {
  assert.match(senzaCommenti, /stato\.modiScelti\[[^\]]+\] = scelto/,
    'la scelta va messa via con l\'id della scheda a cui appartiene');
  assert.match(senzaCommenti, /const suo = stato\.modiScelti\[nuovo\.attiva\] \|\| null/,
    'e ripresa quando quella scheda torna attiva');
});

test('AL CONTRARIO — due schede restano indipendenti: non una scelta sola per tutte', () => {
  assert.match(senzaCommenti, /modiScelti: \{\}/, 'una memoria per scheda, non un valore unico');
});

test('LO STATO NASCE senza una scelta della persona: il ripiego automatico deve poter agire', () => {
  assert.match(senzaCommenti, /modoChiesto: null/);
});
