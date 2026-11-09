/*
 * FE-003 (decisione del 31/10: «apribile a lato o a tutto schermo»; bozzetto `bozzetto-ui-generativa/pc.js:77-96`): le due viste di un blocco. Stessi dati, stesso stato:
 * filtri e ordine valgono in tutti i posti, e un blocco dà un'azione sola da qualunque vista.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio } from './aiuto-dom-blocchi.mjs';
import { creaAggancioBlocchi } from '../../src/components/blocchi/aggancio.js';
import { creaVisteDelBlocco } from '../../src/components/blocchi/viste.js';

const fixture = (n) => readFileSync(new URL(`../../../tests/fixtures/blocchi/${n}`, import.meta.url), 'utf8').trim();
const TABELLA = fixture('01-tabella.txt');
const SCELTE = fixture('03-scelte.txt');

function scena() {
  const document = documento();
  const colonna = document.createElement('aside');
  document.body.append(colonna);
  const aperte = [];
  const viste = creaVisteDelBlocco({ document, colonna: () => colonna, apriColonna: () => aperte.push('colonna') });
  const inviati = [];
  const a = creaAggancioBlocchi({ document, sessione: () => 's1', consegna: (testo) => inviati.push(testo), timer: orologio().timer, azioni: { lato: viste.lato, schermo: viste.schermo } });
  const inLinea = (testo) => { const nodo = a.blocco(testo, true); document.body.append(nodo); return nodo; };
  return { document, colonna, viste, aperte, inviati, inLinea };
}
/* scena 8, cure del 05/11/2026 (review G-A, HIGH 3): le azioni del blocco stanno nel menu «⋯», che vive nel corpo della pagina
   (`#menuDelBlocco`): se il blocco non ha il bottone, si apre il suo «⋯» e si cerca lì */
const bottone = (nodo, testo) => {
  const qui = nodo.querySelectorAll('button').find((b) => b.textContent.trim().startsWith(testo));
  if (qui) return qui;
  const piu = nodo.querySelector('button[aria-haspopup="menu"]');
  if (!piu) return undefined;
  if (piu.getAttribute('aria-expanded') !== 'true') clic(piu);
  return nodo.ownerDocument.body.querySelector('#menuDelBlocco')?.querySelectorAll('[role="menuitem"]').find((b) => b.textContent.trim().startsWith(testo));
};
const tasto = (nodo, key) => { const e = new Event('keydown'); e.key = key; e.preventDefault = () => {}; e.stopPropagation = () => {}; nodo.dispatchEvent(e); };
const righe = (nodo) => nodo.querySelectorAll('tbody tr').map((r) => r.textContent);

test('VISTE-01 le due azioni ci sono solo se chi monta le sa fare; «Salva in Libreria» oggi no', () => {
  const { inLinea } = scena();
  const nodo = inLinea(TABELLA);
  assert.ok(bottone(nodo, 'Apri a lato'));
  assert.ok(bottone(nodo, 'Tutto schermo'));
  assert.equal(bottone(nodo, 'Salva in Libreria'), undefined);
  const senza = creaAggancioBlocchi({ document: documento(), sessione: () => 's1', consegna() {}, timer: orologio().timer }).blocco(TABELLA, true);
  assert.equal(bottone(senza, 'Apri a lato'), undefined);
});

test('VISTE-02 a lato: nella colonna, che si apre, col titolo una volta sola e senza riaprire se stesso', () => {
  const { colonna, aperte, inLinea } = scena();
  clic(bottone(inLinea(TABELLA), 'Apri a lato'));
  const lato = colonna.querySelector('.gu-lato');
  assert.ok(lato);
  assert.deepEqual(aperte, ['colonna']);
  assert.equal(lato.querySelectorAll('h2').length, 1);
  assert.equal(lato.querySelectorAll('.gu__titolo').length, 0, 'il titolo sta nella testata del pannello');
  assert.equal(bottone(lato.querySelector('.gu-lato__corpo'), 'Apri a lato'), undefined);
  assert.ok(bottone(lato.querySelector('.gu-lato__testa'), 'Tutto schermo'));
  assert.ok(lato.querySelector('table'));
});

test('VISTE-03 filtri e ordine valgono in tutti e due i posti', () => {
  const { colonna, inLinea } = scena();
  const nodo = inLinea(TABELLA);
  clic(bottone(nodo, 'Apri a lato'));
  const lato = colonna.querySelector('.gu-lato');
  const prima = righe(nodo);
  assert.deepEqual(righe(lato), prima);
  const ordina = lato.querySelectorAll('th button[data-ordina]').at(-1);
  clic(ordina); clic(ordina);
  assert.notDeepEqual(righe(nodo), prima, 'la riga in chat segue il lato');
  assert.deepEqual(righe(nodo), righe(lato));
});

test('VISTE-04 la frase in chat dice che lo stato è condiviso, solo per la tabella e solo mentre è aperto', () => {
  const { colonna, inLinea } = scena();
  const tab = inLinea(TABELLA);
  clic(bottone(tab, 'Apri a lato'));
  assert.equal(tab.querySelectorAll('.gu-qui').length, 1);
  clic(bottone(colonna.querySelector('.gu-lato'), 'Chiudi'));
  assert.equal(colonna.querySelector('.gu-lato'), null);
  assert.equal(tab.querySelectorAll('.gu-qui').length, 0);
  const sce = inLinea(SCELTE);
  clic(bottone(sce, 'Apri a lato'));
  assert.equal(sce.querySelectorAll('.gu-qui').length, 0);
});

test('VISTE-05 un secondo blocco prende il posto del primo, e la sua frase se ne va', () => {
  const { colonna, inLinea } = scena();
  const uno = inLinea(TABELLA);
  clic(bottone(uno, 'Apri a lato'));
  clic(bottone(inLinea(SCELTE), 'Apri a lato'));
  assert.equal(colonna.querySelectorAll('.gu-lato').length, 1);
  assert.equal(colonna.querySelector('.gu-lato table'), null);
  assert.equal(uno.querySelectorAll('.gu-qui').length, 0);
});

test('VISTE-06 a tutto schermo: dialogo modale, fuoco sull\'uscita, Esc esce e il fuoco torna dov\'era', () => {
  const { document, inLinea } = scena();
  const nodo = inLinea(TABELLA);
  const tastoSchermo = bottone(nodo, 'Tutto schermo');
  tastoSchermo.focus();
  clic(tastoSchermo);
  const s = document.body.querySelector('.gu-schermo');
  assert.equal(s.getAttribute('role'), 'dialog');
  assert.equal(s.getAttribute('aria-modal'), 'true');
  assert.ok(s.getAttribute('aria-label'));
  assert.equal(document.activeElement, bottone(s, 'Esci'));
  tasto(s, 'Escape');
  assert.equal(document.body.querySelector('.gu-schermo'), null);
  /* scena 8: la voce del menu non c'è più (il menu si chiude e rimette il fuoco su «⋯» PRIMA dell'azione, UIG-8.5): il fuoco torna su «⋯» */
  assert.equal(document.activeElement, nodo.querySelector('button[aria-haspopup="menu"]'));
});

test('VISTE-07 dallo schermo a lato, e dal lato allo schermo; uno schermo solo', () => {
  const { document, colonna, inLinea } = scena();
  const nodo = inLinea(TABELLA);
  clic(bottone(nodo, 'Tutto schermo'));
  clic(bottone(document.body.querySelector('.gu-schermo'), 'Apri a lato'));
  assert.equal(document.body.querySelector('.gu-schermo'), null);
  assert.ok(colonna.querySelector('.gu-lato'));
  clic(bottone(colonna.querySelector('.gu-lato'), 'Tutto schermo'));
  clic(bottone(nodo, 'Tutto schermo'));
  assert.equal(document.body.querySelectorAll('.gu-schermo').length, 1);
  assert.ok(colonna.querySelector('.gu-lato'), 'il lato resta sotto lo schermo');
});

test('VISTE-08 una scelta in una vista spegne le altre: un messaggio solo', () => {
  const { colonna, inviati, inLinea } = scena();
  const nodo = inLinea(SCELTE);
  clic(bottone(nodo, 'Apri a lato'));
  clic(bottone(colonna.querySelector('.gu-lato__corpo'), 'Continua'));
  clic(bottone(nodo, 'Continua'));
  assert.equal(inviati.length, 1);
});

test('VISTE-09 cambiare chat chiude tutto', () => {
  const { document, colonna, viste, inLinea } = scena();
  const nodo = inLinea(TABELLA);
  clic(bottone(nodo, 'Apri a lato'));
  clic(bottone(nodo, 'Tutto schermo'));
  viste.chiudi();
  assert.equal(colonna.querySelector('.gu-lato'), null);
  assert.equal(document.body.querySelector('.gu-schermo'), null);
  viste.chiudi();
});

test('VISTE-10 senza colonna (pagina stretta, vista piena) il blocco si apre a tutto schermo', () => {
  const document = documento();
  const viste = creaVisteDelBlocco({ document, colonna: () => null, apriColonna() {} });
  const a = creaAggancioBlocchi({ document, sessione: () => 's1', consegna() {}, timer: orologio().timer, azioni: { lato: viste.lato, schermo: viste.schermo } });
  const nodo = a.blocco(TABELLA, true);
  document.body.append(nodo);
  clic(bottone(nodo, 'Apri a lato'));
  assert.ok(document.body.querySelector('.gu-schermo'));
});

test('VISTE-11 la chat è cablata: colonna vera, chiusura al cambio di chat, stili', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  /* decision 399: the column under the name the bridge gives it (`#inspectorPanel`); the page-level proof is `blocchi-lato-pagina-vera-browser.test.mjs` */
  assert.match(app, /creaVisteDelBlocco\(\{ document, colonna: \(\) => inspectorPanel, apriColonna: \(\) => openPanel\('inspector'\) \}\)/u);
  assert.match(app, /\n  const inspectorPanel = \$\('#inspectorPanel'\);/u);
  assert.match(app, /azioni: \{ lato: visteDeiBlocchi\.lato, schermo: visteDeiBlocchi\.schermo, libreria: salvaBloccoInLibreria \}/u); // decisione 142
  /* cura 288 round 3: the views close on every row click, the hook resets only when the chat really changes (after the parking) */
  const passa = app.slice(app.indexOf('function passaASessione('));
  assert.ok(passa.indexOf('visteDeiBlocchi.chiudi();') < passa.indexOf('if (state.sessionSelection.active) {'), 'views closed first');
  /* cura BG3 round 4 (E1): the reset sits in `nuovaGenerazioneSessione`, right after the parking, for every chat change */
  assert.match(passa, /const generation = nuovaGenerazioneSessione\(\{ parcheggia: /u);
  const parcheggio = app.indexOf('if (!continua && parcheggia) parcheggiaChatAperta();');
  const azzera = app.indexOf('if (!continua) aggancioDeiBlocchi?.azzera();');
  assert.ok(parcheggio > 0 && azzera > parcheggio, 'the reset follows the parking');
  const tra = app.slice(app.indexOf('\n', parcheggio) + 1, azzera).split('\n').map((r) => r.trim()).filter(Boolean);
  assert.ok(tra.every((r) => r.startsWith('/*') || !/[;{}]\s*$/u.test(r) || r.endsWith('*/')), `only a comment between them: ${tra.join(' | ')}`);
  const css = readFileSync(new URL('../../src/styles/blocchi.css', import.meta.url), 'utf8');
  for (const c of ['.gu-lato{', '.gu-schermo{', '.gu-qui{']) assert.ok(css.includes(c), c);
});

test('VISTE-12 le parole nelle due lingue', () => {
  const testi = readFileSync(new URL('../../src/i18n/testi/blocchi.js', import.meta.url), 'utf8');
  for (const k of ['actions.exit', 'side.shared']) assert.equal(testi.split(`'${k}'`).length - 1, 2, k);
});
