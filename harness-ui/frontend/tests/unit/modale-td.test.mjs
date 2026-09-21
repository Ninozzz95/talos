import test from 'node:test';
import assert from 'node:assert/strict';
import { apriModale, chiudiModale, confermaModale, modaleAperta } from '../../src/components/modale-td.js';

/*
 * Lotto G, 11/09/2026 — la modale del mockup, che qui è un `<dialog>` nativo.
 *
 * ⛔ Le unit di questo repo non caricano un DOM: qui sotto c'è un documento finto che sa fare SOLO
 *   ciò che `modale-td.js` tocca davvero — è lo stesso stile di `browser-vivo.test.mjs` e
 *   `tooltip.test.mjs`. Serve a provare le tre cose che non si vedono in una foto: che ne resti
 *   UNA sola aperta, che il fuoco parta dalla via d'uscita, e che Esc non scappi verso la app.
 */

function nodoFinto(tag, doc) {
  const nodo = {
    tagName: String(tag).toUpperCase(),
    figli: [],
    genitore: null,
    attributi: new Map(),
    dataset: {},
    className: '',
    textContent: '',
    type: tag === 'input' ? 'text' : undefined,
    open: false,
    fuoco: 0,
    ascoltatori: new Map(),
    ownerDocument: doc,
    append(...nuovi) { for (const n of nuovi) { if (!n) continue; n.genitore = nodo; nodo.figli.push(n); } },
    prepend(...nuovi) { for (const n of nuovi.reverse()) { if (!n) continue; n.genitore = nodo; nodo.figli.unshift(n); } },
    remove() { if (nodo.genitore) nodo.genitore.figli = nodo.genitore.figli.filter((f) => f !== nodo); nodo.genitore = null; },
    setAttribute(k, v) { nodo.attributi.set(k, String(v)); },
    getAttribute(k) { return nodo.attributi.get(k) ?? null; },
    addEventListener(tipo, fn) { nodo.ascoltatori.set(tipo, [...(nodo.ascoltatori.get(tipo) || []), fn]); },
    focus() { nodo.fuoco += 1; doc.activeElement = nodo; },
    showModal() { nodo.open = true; },
    close() { nodo.open = false; nodo.scatta('close', {}); },
    scatta(tipo, evento) { for (const fn of nodo.ascoltatori.get(tipo) || []) fn({ target: nodo, ...evento }); },
    discendenti() { return nodo.figli.flatMap((f) => [f, ...f.discendenti()]); },
    querySelector(selettore) {
      const tag0 = selettore.split(',')[0].trim().split(/[:[.]/)[0].toUpperCase();
      const tutti = [tag0, ...selettore.split(',').slice(1).map((s) => s.trim().split(/[:[.]/)[0].toUpperCase())];
      return nodo.discendenti().find((f) => tutti.includes(f.tagName)) || null;
    },
    querySelectorAll() { return []; },
  };
  return nodo;
}

function documentoFinto() {
  const doc = { activeElement: null };
  doc.createElement = (tag) => nodoFinto(tag, doc);
  doc.createElementNS = (_ns, tag) => nodoFinto(tag, doc);
  doc.body = nodoFinto('body', doc);
  return doc;
}

function testo(nodo) {
  return [nodo.textContent, ...nodo.discendenti().map((f) => f.textContent)].filter(Boolean).join('|');
}

test('MODALE-APERTURA: nasce un <dialog> modale, col titolo collegato e il fondo cliccabile', () => {
  const doc = documentoFinto();
  const aperta = apriModale('Temi e atmosfere', [doc.createElement('p')], { document: doc });
  assert.ok(aperta, 'la modale esiste');
  assert.equal(aperta.dialogo.tagName, 'DIALOG');
  assert.equal(aperta.dialogo.className, 'td-modal');
  assert.equal(aperta.dialogo.open, true, 'aperta con showModal()');
  assert.ok(aperta.dialogo.getAttribute('aria-labelledby'), 'il titolo è collegato per chi ascolta');
  assert.equal(doc.body.figli.length, 1);
  chiudiModale();
  assert.equal(doc.body.figli.length, 0, 'chiudendo il dialogo esce dal documento');
  assert.equal(modaleAperta(), null);
});

test('MODALE-UNA-ALLA-VOLTA: aprirne una seconda chiude la prima (due showModal impilati perdono il fuoco)', () => {
  const doc = documentoFinto();
  const prima = apriModale('Prima', [], { document: doc });
  const seconda = apriModale('Seconda', [], { document: doc });
  assert.notEqual(prima.dialogo, seconda.dialogo);
  assert.equal(doc.body.figli.length, 1, 'nel documento ne resta UNA');
  assert.equal(doc.body.figli[0], seconda.dialogo);
  chiudiModale();
});

test('MODALE-ESC: l’Escape si ferma sulla modale e non risale alla catena della app', () => {
  const doc = documentoFinto();
  const aperta = apriModale('Titolo', [], { document: doc });
  let fermato = 0;
  aperta.dialogo.scatta('keydown', { key: 'Escape', stopPropagation: () => { fermato += 1; } });
  assert.equal(fermato, 1, 'senza questo, chiudere una modale chiederebbe «fermo il giro?»');
  // ⛔ verso contrario: un tasto qualsiasi NON viene fermato
  aperta.dialogo.scatta('keydown', { key: 'a', stopPropagation: () => { fermato += 1; } });
  assert.equal(fermato, 1);
  chiudiModale();
});

test('MODALE-FONDO: il clic sul fondo chiude, quello sul contenuto no', () => {
  const doc = documentoFinto();
  const aperta = apriModale('Titolo', [], { document: doc });
  aperta.dialogo.scatta('click', { target: aperta.contenuto });
  assert.ok(modaleAperta(), 'un clic dentro non chiude niente');
  aperta.dialogo.scatta('click', { target: aperta.dialogo });
  assert.equal(modaleAperta(), null, 'il clic sul fondo chiude');
});

test('CONFERMA: dice la conseguenza, il fuoco parte da «Annulla» e l’azione parte solo se la scegli', () => {
  const doc = documentoFinto();
  let eseguita = 0;
  const aperta = confermaModale({
    titolo: 'Rimetto tutte le preferenze ai valori iniziali?',
    domanda: 'Tema, densità, lingua e cartelle ricordate tornano come appena installato.',
    conseguenza: 'Le conversazioni e i file NON vengono toccati.',
    etichettaConferma: 'Ripristina',
    onConferma: () => { eseguita += 1; },
    document: doc,
  });
  const parole = testo(aperta.dialogo);
  assert.match(parole, /NON vengono toccati/, 'la conseguenza è scritta, non sottintesa');
  assert.match(parole, /Ripristina/);
  // ⛔ Il fuoco sta sulla via d'uscita: un Invio di troppo non distrugge niente.
  assert.equal(doc.activeElement.textContent, 'Annulla');
  assert.equal(eseguita, 0, 'aprire la conferma non esegue niente');
  const bottoni = aperta.dialogo.discendenti().filter((n) => n.tagName === 'BUTTON');
  const conferma = bottoni.find((b) => b.textContent === 'Ripristina');
  conferma.scatta('click', {});
  assert.equal(eseguita, 1);
  assert.equal(modaleAperta(), null, 'confermando la modale si chiude da sola');
});
