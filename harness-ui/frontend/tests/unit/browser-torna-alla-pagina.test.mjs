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
/*
 * ⛔⛔⛔ 11/09/2026 — QUESTA PROVA È STATA GIRATA UNA SECONDA VOLTA, e va detto perché.
 *
 * L'08/09 pretendeva che la scelta si RIPRENDESSE al cambio scheda (`const suo = modiScelti[…]`).
 * L'owner, 11/09, guardando il browser integrato dopo una ricerca web: «navigando nelle schede mi
 * appare la visuale codice sorgente. Voglio che di default ci sia sempre la visuale a pagina,
 * quella renderizzata, sempre, anche se cambio scheda mentre sono in modalità sorgente».
 *
 * ⛔ Non è un capriccio che ribalta l'08/09: è lo STESSO difetto, che quella cura non aveva
 *   chiuso. Riprendere la scelta della scheda di destinazione non bastava, perché quando quella
 *   scheda non ne aveva una (`suo` null) `stato.modo` non veniva toccato e restava quello della
 *   scheda di PARTENZA — cioè il sorgente si trascinava su una scheda che non l'aveva mai chiesto.
 *
 * ⇒ La regola nuova è più semplice e non ha casi scoperti: **al cambio scheda il modo torna
 *   sempre a 'pagina'**. Il sorgente resta a un clic e vale finché resti su quella scheda; non
 *   segue più la navigazione.
 */
test('SEMPRE PAGINA: cambiando scheda il modo si riazzera, non si eredita dalla scheda di prima', () => {
  const cambio = /nuovo\.attiva !== stato\.attiva\)\s*\{([\s\S]*?)\n {6}\}/.exec(senzaCommenti);
  assert.ok(cambio, 'il ramo del cambio scheda deve esistere');
  assert.match(cambio[1], /stato\.modo = 'pagina'/,
    '⛔ al cambio scheda il modo deve tornare a pagina: è la richiesta dell’owner dell’11/09');
  assert.ok(!/const suo = stato\.modiScelti\[nuovo\.attiva\]/.test(senzaCommenti),
    '⛔ è tornata l’eredità del modo dalla scheda precedente: è esattamente il difetto segnalato');
});

/*
 * ⛔ IL VERSO CONTRARIO, e non è una formalità: la via più pigra per «sempre pagina» sarebbe
 *   scrivere anche `modoChiesto = 'pagina'`, e sarebbe un danno — una richiesta ESPLICITA di
 *   pagina disattiva il ripiego al testo (`corniceDellaLettura`), e su un sito che vieta la
 *   cornice lascerebbe un riquadro vuoto al posto del testo che l'agente ha letto.
 */
test('AL CONTRARIO — il riazzeramento non finge una richiesta della persona, o il ripiego al testo muore', () => {
  const cambio = /nuovo\.attiva !== stato\.attiva\)\s*\{([\s\S]*?)\n {6}\}/.exec(senzaCommenti);
  assert.match(cambio[1], /stato\.modoChiesto = null/,
    'modoChiesto torna a null: nessuna richiesta esplicita, così il ripiego automatico resta libero di agire');
  assert.match(senzaCommenti, /stato\.modo === 'pagina' && stato\.modoChiesto !== 'pagina'/,
    'e il ripiego al testo per i siti che vietano la cornice deve essere ancora lì');
});

test('LA SCELTA PER SCHEDA resta solo dove porta ancora informazione: riaprire col browser pilotato', () => {
  assert.match(senzaCommenti, /stato\.modiScelti\[[^\]]+\] = scelto/,
    'la scelta va comunque messa via con l\'id della scheda a cui appartiene');
  assert.match(senzaCommenti, /stato\.modiScelti\[s\.id\] === 'pagina'/,
    'una scheda che aveva chiesto Pagina su un sito non incorniciabile si riapre pilotata: la cura dell\'08/09 resta intatta');
});

test('AL CONTRARIO — due schede restano indipendenti: non una scelta sola per tutte', () => {
  assert.match(senzaCommenti, /modiScelti: \{\}/, 'una memoria per scheda, non un valore unico');
});

test('LO STATO NASCE senza una scelta della persona: il ripiego automatico deve poter agire', () => {
  assert.match(senzaCommenti, /modoChiesto: null/);
});
