/*
 * FE-003, blocco 4 della forma: l'aggancio dei blocchi nella chat del PC. Un recinto `talos-blocco` diventa un blocco; mentre arriva è lo
 * STESSO nodo, che riceve solo il pezzo nuovo; un clic diventa un messaggio della persona, uno solo, anche dopo una ricarica.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spento, documento, clic, orologio } from './aiuto-dom-blocchi.mjs';
import { bloccoPerLaBolla, creaAggancioBlocchi, eRecintoDiBlocco, impronta, testoDellAzione } from '../../src/components/blocchi/aggancio.js';
import { bollaDaInviare, bollaPerLaRigiocata } from '../../src/components/bolla-della-persona.js';
import { LINGUA_DEL_RECINTO } from '../../../src/blocchi/catalogo.mjs';

const fixture = (n) => readFileSync(new URL(`../../../tests/fixtures/blocchi/${n}`, import.meta.url), 'utf8');
const SCELTE = fixture('03-scelte.txt').trim();

function aggancio(extra = {}) {
  const document = documento();
  const inviati = [];
  const a = creaAggancioBlocchi({ document, sessione: () => 's1', consegna: (testo, azione) => inviati.push({ testo, azione }), timer: orologio().timer, ...extra });
  return { a, inviati, document };
}
const bottoni = (nodo) => nodo.querySelectorAll('button').filter((b) => /Continua|Continue/u.test(b.textContent));

test('AGG-01 solo la lingua del catalogo è un blocco', () => {
  assert.equal(eRecintoDiBlocco(LINGUA_DEL_RECINTO), true);
  assert.equal(eRecintoDiBlocco('javascript'), false);
  assert.equal(eRecintoDiBlocco(''), false);
  assert.equal(eRecintoDiBlocco(undefined), false);
});

test('AGG-02 un recinto chiuso diventa un blocco disegnato', () => {
  const { a } = aggancio();
  const nodo = a.blocco(SCELTE, true);
  assert.match(nodo.getAttribute('class'), /\bgu\b/u);
  assert.equal(bottoni(nodo).length, 1);
});

test('AGG-03 mentre arriva è lo stesso nodo, e riceve solo il pezzo nuovo', () => {
  const { a } = aggancio();
  const meta = Math.floor(SCELTE.length / 2);
  const primo = a.blocco(SCELTE.slice(0, meta), false);
  assert.equal(a.blocco(SCELTE.slice(0, meta), false), primo, 'lo stesso testo ridisegnato non crea niente');
  assert.equal(a.blocco(SCELTE.slice(0, meta + 3), false), primo);
  assert.equal(a.blocco(SCELTE, true), primo, 'alla chiusura resta lo stesso elemento');
  assert.equal(bottoni(primo).length, 1, 'a fine recinto le scelte si accendono');
  assert.equal(a.viviAperti(), 0);
});

test('AGG-04 un blocco nuovo non si attacca a quello aperto prima', () => {
  const { a } = aggancio();
  const primo = a.blocco('root = Scelte("uno"', false);
  const secondo = a.blocco('root = Avviso(', false);
  assert.notEqual(primo, secondo);
  assert.equal(a.viviAperti(), 2);
  a.azzera();
  assert.equal(a.viviAperti(), 0, 'cambiata sessione o fermato il giro, niente secondi che corrono');
});

test('AGG-05 un clic è un messaggio solo, col testo dell’azione', () => {
  const { a, inviati } = aggancio();
  const nodo = a.blocco(SCELTE, true);
  clic(bottoni(nodo)[0]);
  clic(bottoni(nodo)[0]);
  assert.equal(inviati.length, 1);
  assert.equal(inviati[0].testo, 'Continua');
  assert.equal(inviati[0].azione.evento, 'talos.blocco.azione.v1');
});

const azioneDi = (nodo, inviati) => { clic(bottoni(nodo)[0]); return inviati.at(-1).azione; };

test('AGG-06 dopo una ricarica il blocco usato torna spento dal giornale; nella stessa chat un altro testo no', () => {
  const uno = aggancio();
  const { chiave, tipo } = azioneDi(uno.a.blocco(SCELTE, true), uno.inviati);
  const due = aggancio();
  due.a.spegni(chiave, { tipo });
  const nodo = due.a.blocco(SCELTE, true);
  assert.equal(spento(bottoni(nodo)[0]), true);
  clic(bottoni(nodo)[0]);
  assert.equal(due.inviati.length, 0, 'la riga rigiocata non rimanda il messaggio');
  clic(bottoni(due.a.blocco(SCELTE.replace('Come vuoi procedere?', 'Da dove parto?'), true))[0]);
  assert.equal(due.inviati.length, 1, 'stesso id, messaggio diverso: è un altro blocco');
});

test('AGG-06b un blocco nato vivo e lo stesso blocco ridisegnato hanno la stessa chiave', () => {
  const uno = aggancio();
  uno.a.blocco(SCELTE.slice(0, 10), false);
  const nodo = uno.a.blocco(SCELTE, true);
  const { chiave } = azioneDi(nodo, uno.inviati);
  assert.equal(uno.inviati[0].testo, 'Continua');
  const due = aggancio();
  due.a.spegni(chiave);
  assert.equal(spento(bottoni(due.a.blocco(SCELTE, true))[0]), true);
});

test('AGG-07 la stessa frase in un’altra sessione è un altro blocco', () => {
  const uno = aggancio({ sessione: () => 's1' });
  const { chiave } = azioneDi(uno.a.blocco(SCELTE, true), uno.inviati);
  const altra = aggancio({ sessione: () => 's2' });
  altra.a.spegni(chiave);
  clic(bottoni(altra.a.blocco(SCELTE, true))[0]);
  assert.equal(altra.inviati.length, 1);
});

test('AGG-08 il gesto non sta più nella memoria del browser', () => {
  const sorgente = readFileSync(new URL('../../src/components/blocchi/aggancio.js', import.meta.url), 'utf8');
  assert.equal(/localStorage|getItem|setItem/u.test(sorgente), false);
});

test('AGG-09 il testo dell’azione: la scelta, o le risposte del modulo', () => {
  assert.equal(testoDellAzione({ tipo: 'scelte', valore: 'Continua' }, {}), 'Continua');
  const blocco = { tipo: 'modulo', campi: [{ id: 'a', etichetta: 'Tono' }] };
  assert.equal(testoDellAzione({ tipo: 'modulo', valore: { a: 'Breve' } }, blocco), 'Tono: Breve');
});

test('AGG-10 l’impronta è stabile e distingue i testi', () => {
  assert.equal(impronta('abc'), impronta('abc'));
  assert.notEqual(impronta('abc'), impronta('abd'));
});

test('AGG-13 all’evento il blocco già disegnato si spegne, anche se l’evento arriva dopo il testo', () => {
  const uno = aggancio();
  const { chiave } = azioneDi(uno.a.blocco(SCELTE, true), uno.inviati);
  const { a, document, inviati } = aggancio();
  const nodo = a.blocco(SCELTE, true);
  document.body.append(nodo);
  assert.equal(spento(bottoni(nodo)[0]), false);
  a.spegni(chiave, { tipo: 'scelte', valore: 'Continua' });
  const nuovo = document.body.childNodes.at(-1);
  assert.notEqual(nuovo, nodo);
  assert.equal(spento(bottoni(nuovo)[0]), true);
  assert.equal(bottoni(nuovo)[0].getAttribute('aria-pressed'), 'true', 'la scelta resta segnata');
  clic(bottoni(nuovo)[0]);
  assert.equal(inviati.length, 0);
  a.spegni(chiave, { tipo: 'scelte' });
  assert.equal(document.body.childNodes.at(-1), nuovo, 'la seconda notizia non ridisegna niente');
});

test('AGG-13b il blocco da cui parte il gesto non si ridisegna quando torna il suo evento; un blocco fuori dalla pagina nemmeno', () => {
  const { a, document, inviati } = aggancio();
  const nodo = a.blocco(SCELTE, true);
  document.body.append(nodo);
  const { chiave } = azioneDi(nodo, inviati);
  a.spegni(chiave, { tipo: 'scelte' });
  assert.equal(document.body.childNodes.at(-1), nodo);
  const fuori = aggancio();
  const staccato = fuori.a.blocco(SCELTE, true);
  fuori.a.spegni(chiave);
  assert.equal(staccato.parentNode, null);
  fuori.a.spegni(undefined);
  fuori.a.spegni('');
});

test('AGG-13c cambiando chat non resta un riferimento a un nodo vecchio', () => {
  const uno = aggancio();
  const { chiave } = azioneDi(uno.a.blocco(SCELTE, true), uno.inviati);
  const { a, document } = aggancio();
  const nodo = a.blocco(SCELTE, true);
  document.body.append(nodo);
  a.azzera();
  a.spegni(chiave);
  assert.equal(document.body.childNodes.at(-1), nodo);
});

test('AGG-14 nella bolla va il blocco senza il valore, e torna nella rigiocata', () => {
  const azione = { evento: 'talos.blocco.azione.v1', idBlocco: 'p', tipo: 'scelte', valore: 'segreto', chiave: 's1:a#p', titolo: 'Titolo' };
  const blocco = bloccoPerLaBolla(azione);
  assert.deepEqual(blocco, { idBlocco: 'p', tipo: 'scelte', chiave: 's1:a#p', titolo: 'Titolo' });
  assert.equal(Object.hasOwn(bloccoPerLaBolla({ ...azione, titolo: null }), 'titolo'), false);
  const bolla = bollaDaInviare('Continua', 'Continua', [], blocco);
  assert.deepEqual(bolla, { testo: 'Continua', allegati: [], blocco }, 'testo uguale al modello: la bolla parte lo stesso');
  assert.equal(bollaDaInviare('Continua', 'Continua', []), null, 'AL CONTRARIO: senza blocco nessuna bolla');
  assert.deepEqual(bollaPerLaRigiocata({ bolla, consegna: 'Continua', lingue: { intestazioni: [], prefissiFile: [] } }).blocco, blocco);
});

test('AGG-11 un recinto rotto resta un blocco onesto, col testo a disposizione', () => {
  const { a } = aggancio();
  const nodo = a.blocco(fixture('20-rotto-tipo-sconosciuto.txt').trim(), true);
  assert.match(nodo.textContent, /Mostra il testo|Show the text/u);
});

test('AGG-12 la chat passa dall’aggancio prima del blocco di codice', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /const bloccoCodiceDellaChat = \(testoCodice, linguaggioDichiarato, chiuso, info = ''\) => \(eRecintoDiBlocco\(linguaggioDichiarato\)\s*\? aggancioBlocchi\(\)\.blocco\(testoCodice, chiuso, info\)/u); // G-B3: the fence info carries the name stamped by the host
});

/* G-B4 (06/11/2026), p2: the live handler lives inside app.js's closure — not reachable without a browser — so, like AGG-12, its line is
   read from the source: without it a version event from the stream would never reach the screen (a B3 survivor). */
test('G-B4 p2 the live stream hands every block-version event to the hook, and nothing after it', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(evento\.type === 'CUSTOM' && evento\.name === EVENTO_VERSIONE_DEL_BLOCCO\) \{ aggancioBlocchi\(\)\.aggiornaVersione\(evento\); return; \}/u);
});

test('G-B4 UIG-1.20 the save maps a 409 to the next number the server gave, and any other failure to a plain refusal', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const riga = app.split('\n').find((r) => r.includes('salvaVersione: (valore) =>')) ?? '';
  assert.match(riga, /\/blocchi\/versione`, valore\)/u);
  assert.match(riga, /\.status === 409 && Number\.isInteger\(e\?\.problem\?\.params\?\.prossima\)\s*\?\s*\{ ok: false, prossima: e\.problem\.params\.prossima \}\s*:\s*\{ ok: false \}/u);
});
