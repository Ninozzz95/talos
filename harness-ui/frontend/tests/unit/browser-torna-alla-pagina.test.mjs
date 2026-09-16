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
 * mockup: la guardia sta sulle condizioni che, tolte, fanno tornare il difetto. Il comportamento
 * vero — tre schede, tre modi, il ritorno sulla prima — si prova dal vivo in
 * `tests/browser/browser-p0.spec.mjs`, sulla app vera: questo file tiene ferme le CONDIZIONI, quello
 * misura il RISULTATO. Nessuno dei due basta da solo.
 */

const SORGENTE = readFileSync(new URL('../../src/components/browser.js', import.meta.url), 'utf8');
const senzaCommenti = SORGENTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('IL RIPIEGO AL TESTO non zittisce chi ha CHIESTO la pagina', () => {
  assert.match(
    senzaCommenti,
    /if \(modoDi\(s\.id\) === 'pagina' && stato\.modiChiesti\[s\.id\] !== 'pagina'\) impostaModo\(s\.id, 'testo'\);/,
    'senza la seconda condizione il render annulla il clic su «Pagina», per sempre',
  );
});

test('CHIEDERE LA PAGINA su un sito che vieta la cornice APRE la pagina viva', () => {
  assert.match(senzaCommenti, /incorniciabile === false[\s\S]{0,260}azioni\.apri\?\./,
    'il clic deve chiamare l\'apertura viva quando la cornice non è possibile: il ripiego è trasparente');
});

/*
 * ⛔⛔⛔ 16/09/2026 — QUESTA PROVA È STATA GIRATA UNA TERZA VOLTA, e va detto perché, perché la
 * seconda volta l'ho scritta io per difendere una decisione che l'owner ha poi ribaltato.
 *
 * Le tre epoche, in ordine:
 *   · 08/09 — «la scelta si RIPRENDE al cambio scheda» (`const suo = modiScelti[…]`);
 *   · 11/09 — owner: «navigando nelle schede mi appare la visuale codice sorgente… voglio che di
 *     default ci sia sempre la visuale a pagina, sempre, anche se cambio scheda mentre sono in
 *     modalità sorgente» ⇒ la prova fu girata per pretendere il RIAZZERAMENTO a ogni cambio scheda;
 *   · 16/09 — owner, P0 punto 5: «ogni tab deve mantenere indipendentemente il proprio stato…
 *     Tab A → Pagina, B → Testo, C → Pagina; tornando su A deve restare Pagina; associato all'ID
 *     della singola tab; sopravvive a switch, re-render, aggiornamento contenuto, navigazione nella
 *     stessa tab, streaming, modifiche delle altre tab».
 *
 * ⛔ Il 16/09 non contraddice l'11/09: lo CHIUDE MEGLIO. Il difetto dell'11/09 era che `stato.modo`
 *   era UNA VARIABILE SOLA per tutto il browser — si trascinava dietro l'ultimo valore, e la mappa
 *   `modiScelti` copriva solo metà dei casi. Il riazzeramento toglieva il trascinamento *e* la
 *   memoria. Tenere il modo PER ID toglie il trascinamento e basta: una scheda mai toccata nasce in
 *   «pagina» (`modoPredefinito`), quindi il sorgente non segue più la navigazione — che è ciò che
 *   l'owner chiedeva l'11/09 — e una scheda toccata si ricorda ciò che le hai chiesto.
 *
 * ⇒ Le guardie qui sotto pretendono il CONTRARIO di quelle dell'11/09, e la ragione sta scritta
 *   sopra: chi le girerà una quarta volta deve poter leggere perché.
 */
test('OGNI SCHEDA IL SUO MODO: la memoria è una mappa per id, non una variabile sola', () => {
  assert.match(senzaCommenti, /modi: \{\}, modiChiesti: \{\}/, 'due mappe per id: ciò che si vede e ciò che è stato chiesto');
  assert.match(senzaCommenti, /const modoDi = \(id\) => \(id && stato\.modi\[id\]\) \|\| stato\.modoPredefinito;/,
    'il modo di una scheda si legge per id, col predefinito per chi non ne ha uno');
  assert.ok(!/\bstato\.modo\b\s*=/.test(senzaCommenti),
    '⛔ è tornata la variabile globale del modo: è la causa del trascinamento segnalato l’11/09');
});

test('AL CAMBIO SCHEDA NON SI RIAZZERA PIÙ NIENTE — ordine owner del 16/09', () => {
  const cambio = /nuovo\.attiva !== stato\.attiva\)\s*\{([\s\S]*?)\n {6}\}/.exec(senzaCommenti);
  assert.ok(cambio, 'il ramo del cambio scheda deve esistere: ci vive il freno delle riaperture');
  assert.ok(!/stato\.modo\s*=\s*'pagina'/.test(cambio[1]),
    '⛔ il riazzeramento dell’11/09 è tornato: cancella la scelta della persona, che il 16/09 deve sopravvivere');
  assert.match(cambio[1], /stato\.riaperte\.delete\(nuovo\.attiva\)/,
    'il freno anti-anello della riapertura resta: quello non c’entra col modo');
});

/*
 * ⛔ IL VERSO CONTRARIO, e non è una formalità: la via più pigra per «ogni scheda il suo modo»
 *   sarebbe scrivere anche la richiesta esplicita (`modiChiesti`) a ogni cambio di modo automatico,
 *   e sarebbe un danno — una richiesta ESPLICITA di pagina disattiva il ripiego al testo
 *   (`corniceDellaLettura`), e su un sito che vieta la cornice lascerebbe un riquadro vuoto al posto
 *   del testo che l'agente ha letto. Le due mappe restano due.
 */
test('AL CONTRARIO — il ripiego automatico scrive il MODO, mai la richiesta della persona', () => {
  const ripiego = /if \(modoDi\(s\.id\) === 'pagina' && stato\.modiChiesti\[s\.id\] !== 'pagina'\) ([^\n]*)/.exec(senzaCommenti);
  assert.ok(ripiego, 'il ripiego deve esistere');
  assert.ok(!/modiChiesti\[[^\]]+\]\s*=/.test(ripiego[1]),
    '⛔ il ripiego automatico non deve fingere una richiesta della persona, o non scatterà mai più');
  assert.match(senzaCommenti, /stato\.modiChiesti\[s\.id\] === 'pagina'/,
    'una scheda che aveva chiesto Pagina su un sito non incorniciabile si riapre pilotata: la cura dell\'08/09 resta intatta');
});

/*
 * ⛔ 16/09 — e il ripiego di UNA scheda non tocca le altre: il timeout della cornice cattura l'id
 *   della scheda a cui appartiene (`idSuo`) invece di scrivere sulla variabile globale. Senza questa
 *   riga, una cornice lenta buttava in «Testo» anche le schede che stavano benissimo.
 */
test('AL CONTRARIO — il ripiego a tempo scrive sulla SUA scheda, non su quella attiva in quel momento', () => {
  assert.match(senzaCommenti, /const idSuo = s\.id;[\s\S]{0,400}impostaModo\(idSuo, 'testo'\)/,
    'l’id si cattura alla creazione della cornice: quando l’attesa scade, l’attiva può essere un’altra');
});

test('LO STATO NASCE senza una scelta della persona: il ripiego automatico deve poter agire', () => {
  assert.match(senzaCommenti, /modiChiesti: \{\}/, 'nessuna richiesta esplicita alla nascita');
  assert.match(senzaCommenti, /modoPredefinito: modoIniziale === 'testo' \? 'testo' : 'pagina'/,
    'il predefinito resta dichiarato qui, non nascosto in una condizione');
});

/*
 * ⛔ 16/09, punto 4(a) — LE MAPPE PER ID NON CRESCONO PER SEMPRE. Una memoria indicizzata da un id
 *   che nessuno pota è una perdita lenta: dopo un pomeriggio di navigazione tiene le scelte di
 *   schede che non esistono più. Si potano contro le schede vive, a ogni aggiornamento.
 */
test('LE MAPPE SI POTANO: ciò che riguarda una scheda chiusa se ne va con lei', () => {
  assert.match(senzaCommenti, /const vivi = new Set\(stato\.schede\.map\(\(x\) => x\.id\)\);/);
  assert.match(senzaCommenti, /for \(const mappa of \[stato\.modi, stato\.modiChiesti\]\)[^\n]*delete mappa\[k\]/);
  assert.match(senzaCommenti, /for \(const c of el\.live\?\.querySelectorAll\('iframe'\) \|\| \[\]\) if \(!vivi\.has\(c\.dataset\.browserId\)\) c\.remove\(\);/,
    'anche le cornici delle schede chiuse se ne vanno: sono documenti vivi, non nodi vuoti');
});
