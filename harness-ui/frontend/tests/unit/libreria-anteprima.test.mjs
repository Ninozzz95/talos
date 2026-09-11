import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatoFile, modiFile, serveLettura, righeCsv, separatoreDi, conteggioRighe, frasiRighe,
  dimensioneLeggibile, magazzinoFileLibreria, montaAnteprimaFile, contenutoModoFile,
} from '../../src/components/libreria-anteprima.js';

/*
 * 11/09/2026 — IL CONTENUTO DI UN FILE NEL DETTAGLIO DELLA LIBRERIA.
 *
 * ⛔ La foto dell'owner sul 4174: nome del file, tre metadati, «Azioni sul file» e un riquadro.
 *   Del file, niente. Qui si pretende il contrario, e SEMPRE nei due versi: un formato che si
 *   rende deve rendersi, e uno che non si rende deve DIRLO invece di mostrare byte.
 */

/* ------------------------------------------------------------------ un DOM finto, come L7 */

function nodoFinto(tag, doc) {
  const nodo = {
    tagName: String(tag).toUpperCase(),
    figli: [],
    dataset: {},
    className: '',
    textContent: '',
    style: {},
    attributi: new Map(),
    ascoltatori: new Map(),
    ownerDocument: doc,
    append(...nuovi) { for (const n of nuovi) if (n) nodo.figli.push(n); },
    replaceChildren(...nuovi) { nodo.figli = nuovi.filter(Boolean); },
    setAttribute(k, v) { nodo.attributi.set(k, String(v)); },
    getAttribute(k) { return nodo.attributi.get(k) ?? null; },
    addEventListener(tipo, fn) { nodo.ascoltatori.set(tipo, [...(nodo.ascoltatori.get(tipo) || []), fn]); },
    focus() { doc.activeElement = nodo; },
    discendenti() { return nodo.figli.flatMap((f) => [f, ...(f.discendenti ? f.discendenti() : [])]); },
    scatta(tipo, evento = {}) { for (const fn of nodo.ascoltatori.get(tipo) || []) fn({ target: nodo, preventDefault() {}, stopPropagation() {}, ...evento }); },
  };
  return nodo;
}
function documentoFinto() {
  const doc = { activeElement: null };
  doc.createElement = (tag) => nodoFinto(tag, doc);
  doc.createElementNS = (_ns, tag) => nodoFinto(tag, doc);
  doc.createTextNode = (t) => ({ textContent: String(t), figli: [], discendenti: () => [] });
  return doc;
}
function testoDi(nodi) {
  const uno = (n) => [n.textContent || '', ...(n.discendenti ? n.discendenti().map((f) => f.textContent || '') : [])].join(' ');
  return nodi.map(uno).join(' ');
}
function pannelloDi(pezzi) { return pezzi.find((n) => n.getAttribute?.('role') === 'tabpanel'); }
function listaDi(pezzi) { return pezzi.find((n) => n.getAttribute?.('role') === 'tablist') || null; }
function schedeDi(pezzi) { return listaDi(pezzi)?.figli || []; }

const MD = '# Titolo\n\nUn paragrafo.\n\n- primo\n- secondo\n';
const CSV = 'Nome,Costo\n"Rossi, Mario","0,015"\nBianchi,"0,020"\n';

/* ------------------------------------------------------------------------- i formati puri */

test('LIB-FORMATO: il nome dice che cosa sappiamo fare, e un nome senza estensione è BINARIO', () => {
  assert.equal(formatoFile('Nota.md'), 'markdown');
  assert.equal(formatoFile('NOTA.MARKDOWN'), 'markdown');
  assert.equal(formatoFile('dati.csv'), 'tabella');
  assert.equal(formatoFile('dati.tsv'), 'tabella');
  assert.equal(formatoFile('contratto.json'), 'testo');
  assert.equal(formatoFile('pagina.html'), 'testo');
  assert.equal(formatoFile('Relazione.pdf'), 'binario');
  assert.equal(formatoFile('Verbale.docx'), 'binario');
  assert.equal(formatoFile('Foto.png'), 'binario');
  // ⛔ verso contrario: ciò che non riconosciamo NON diventa testo da stampare a byte
  assert.equal(formatoFile('LEGGIMI'), 'binario');
  assert.equal(formatoFile(''), 'binario');
  assert.equal(formatoFile(null), 'binario');
  assert.equal(formatoFile('archivio.zip'), 'binario');
});

test('LIB-MODI: due modi dove c’è una resa diversa dal testo, uno solo dove sarebbe lo stesso blocco', () => {
  assert.deepEqual(modiFile('markdown'), ['anteprima', 'testo']);
  assert.deepEqual(modiFile('tabella'), ['anteprima', 'testo']);
  assert.deepEqual(modiFile('binario'), ['anteprima', 'testo']);
  // ⛔ un `.json` renderebbe lo stesso monospazio due volte: un interruttore con una scelta sola
  //    non è un interruttore (stessa regola della riga dei filtri con un filtro solo)
  assert.deepEqual(modiFile('testo'), ['testo']);
  // ⛔ e su un binario non si chiede NIENTE al server
  assert.equal(serveLettura('binario'), false);
  assert.equal(serveLettura('markdown'), true);
});

test('LIB-CSV: le virgolette proteggono il separatore, e una virgola dentro una cella non spezza la riga', () => {
  const righe = righeCsv(CSV);
  assert.equal(righe.length, 3);
  assert.deepEqual(righe[0], ['Nome', 'Costo']);
  // ⛔ È LA PROVA CHE CONTA: con `split(',')` questa riga avrebbe quattro celle invece di due
  assert.deepEqual(righe[1], ['Rossi, Mario', '0,015']);
  assert.deepEqual(righe[2], ['Bianchi', '0,020']);
  // le virgolette raddoppiate sono UNA virgoletta
  assert.deepEqual(righeCsv('a,"dice ""sì"""')[0], ['a', 'dice "sì"']);
  // CRLF e a capo finale non inventano una riga in più
  assert.equal(righeCsv('a,b\r\nc,d\r\n').length, 2);
  assert.equal(righeCsv('').length, 0);
  // il `.tsv` non si legge a virgole
  assert.equal(separatoreDi('dati.tsv'), '\t');
  assert.equal(separatoreDi('dati.csv'), ',');
  assert.deepEqual(righeCsv('a\tb', '\t')[0], ['a', 'b']);
});

test('LIB-MISURE: righe e taglia, e su una tabella l’intestazione non è un dato', () => {
  assert.equal(conteggioRighe('a\nb\nc\n'), 3);
  assert.equal(conteggioRighe('a\nb\nc'), 3);
  assert.equal(conteggioRighe(''), 0);
  /* ⛔ VISTO NELLA FOTO (csv, 1440): il bottone diceva «Mostra tutte le 30 righe» e la misura
     sotto «31 righe». Adesso le due frasi contano la stessa cosa. */
  assert.equal(frasiRighe('tabella', 'i\n1\n2\n'), '2 righe di dati');
  assert.equal(frasiRighe('markdown', 'a\nb\nc\n'), '3 righe');
  assert.equal(dimensioneLeggibile(512), '512 byte');
  assert.ok(dimensioneLeggibile(2048).endsWith('kB'));
  assert.ok(dimensioneLeggibile(5 * 1024 * 1024).endsWith('MB'));
  assert.equal(dimensioneLeggibile(-1), '');
});

/* ------------------------------------------------------------------- il pannello, montato */

function monta(voce, { testo = null, opzioni = {} } = {}) {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const magazzino = magazzinoFileLibreria(schermo);
  if (testo !== null) magazzino.file.set(String(voce.id), { stato: 'pronto', testo, byte: Buffer.byteLength(testo) });
  const pezzi = montaAnteprimaFile(voce, {
    doc, magazzino, ridisegna: () => {}, opzioni: { leggiFile: async () => testo ?? '', ...opzioni },
  });
  return { doc, pezzi, magazzino };
}

test('LIB-MD: l’Anteprima rende il Markdown, il Testo mostra il sorgente col cancelletto', () => {
  const voce = { id: 'lib-md', nome: 'Nota.md' };
  const { pezzi } = monta(voce, { testo: MD });
  const schede = schedeDi(pezzi);
  assert.deepEqual(schede.map((b) => b.textContent), ['Anteprima', 'Testo']);
  assert.equal(schede[0].getAttribute('aria-selected'), 'true');
  assert.equal(schede.filter((b) => b.tabIndex === 0).length, 1, 'un solo stop del Tab');
  const pannello = pannelloDi(pezzi);
  assert.equal(pannello.getAttribute('aria-labelledby'), schede[0].id);
  assert.ok(schede.every((b) => b.getAttribute('aria-controls') === pannello.id));
  // reso: il cancelletto del titolo non si vede, e il titolo sì
  const anteprima = testoDi([pannello]);
  assert.ok(anteprima.includes('Titolo'));
  assert.ok(!anteprima.includes('# Titolo'));
  assert.ok(anteprima.includes('3 righe') || anteprima.includes('righe'), 'la misura del file c’è');

  // ⛔ verso contrario: in «Testo» il sorgente c'è per intero, cancelletto compreso
  listaDi(pezzi).scatta('click', { target: { closest: () => schede[1] } });
  const grezzo = testoDi([pannelloDi(pezzi)]);
  assert.ok(grezzo.includes('# Titolo'));
  assert.ok(grezzo.includes('- primo'));
});

test('LIB-CSV-A-SCHERMO: l’Anteprima è una tabella con l’intestazione, il Testo è il file', () => {
  const voce = { id: 'lib-csv', nome: 'dati.csv' };
  const { pezzi } = monta(voce, { testo: CSV });
  const pannello = pannelloDi(pezzi);
  const tabelle = pannello.discendenti().filter((n) => n.tagName === 'TABLE');
  assert.equal(tabelle.length, 1);
  const intestazioni = pannello.discendenti().filter((n) => n.tagName === 'TH');
  assert.deepEqual(intestazioni.map((n) => n.textContent), ['Nome', 'Costo']);
  const celle = pannello.discendenti().filter((n) => n.tagName === 'TD');
  assert.ok(celle.some((n) => n.textContent === 'Rossi, Mario'), 'la cella con la virgola resta una cella');
  assert.ok(testoDi([pannello]).includes('2 righe di dati'));

  // ⛔ verso contrario: in «Testo» non c'è nessuna tabella, c'è il file
  const schede = schedeDi(pezzi);
  listaDi(pezzi).scatta('click', { target: { closest: () => schede[1] } });
  const dopo = pannelloDi(pezzi);
  assert.equal(dopo.discendenti().filter((n) => n.tagName === 'TABLE').length, 0);
  assert.ok(testoDi([dopo]).includes('"Rossi, Mario"'));
});

test('LIB-CSV-TAGLIO: oltre trenta righe se ne mostrano trenta, e il bottone dice quante sono in tutto', () => {
  const testo = ['a,b', ...Array.from({ length: 60 }, (_, i) => `r${i},${i}`)].join('\n');
  const voce = { id: 'lib-lungo', nome: 'lungo.csv' };
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const magazzino = magazzinoFileLibreria(schermo);
  magazzino.file.set('lib-lungo', { stato: 'pronto', testo, byte: testo.length });
  let ridisegnata = 0;
  const monta1 = () => montaAnteprimaFile(voce, { doc, magazzino, ridisegna: () => { ridisegnata += 1; }, opzioni: { leggiFile: async () => testo } });
  const pezzi = monta1();
  const righe = pannelloDi(pezzi).discendenti().filter((n) => n.tagName === 'TR');
  assert.equal(righe.length, 30, 'intestazione più ventinove righe di dati');
  const apri = pannelloDi(pezzi).figli.find((n) => n.tagName === 'BUTTON');
  assert.equal(apri.textContent, 'Mostra tutte le 60 righe');
  apri.scatta('click');
  assert.equal(ridisegnata, 1, 'il bottone chiede il ridisegno, non riscrive il pannello da sé');
  // ⛔ verso contrario: dopo l'apertura le righe ci sono tutte e il bottone sparisce
  const dopo = monta1();
  assert.equal(pannelloDi(dopo).discendenti().filter((n) => n.tagName === 'TR').length, 61);
  assert.equal(pannelloDi(dopo).figli.filter((n) => n.tagName === 'BUTTON').length, 0);
});

test('LIB-BINARIO: un PDF non mostra byte — dice cosa si può fare, e i due modi non dicono la stessa cosa', () => {
  let aperto = null;
  const voce = { id: 'lib-pdf', nome: 'Relazione.pdf' };
  const { pezzi } = monta(voce, { testo: null, opzioni: { onApri: (v) => { aperto = v.id; } } });
  const anteprima = testoDi([pannelloDi(pezzi)]);
  assert.ok(anteprima.includes('si apre con l’app del sistema'));
  assert.ok(!anteprima.includes('righe'), 'niente misure su un file che non abbiamo letto');
  const bottone = pannelloDi(pezzi).discendenti().find((n) => n.tagName === 'BUTTON');
  bottone.scatta('click');
  assert.equal(aperto, 'lib-pdf', 'il bottone chiama l’azione vera, non una finta');

  // ⛔ le due assenze sono DIVERSE: una è sul disegnare, l'altra sull'estrarre le parole
  const schede = schedeDi(pezzi);
  listaDi(pezzi).scatta('click', { target: { closest: () => schede[1] } });
  const testo = testoDi([pannelloDi(pezzi)]);
  assert.ok(testo.includes('non si estrae'));
  assert.notEqual(testo, anteprima);
});

test('LIB-TESTO: un `.json` non ha un interruttore, perché avrebbe una scelta sola', () => {
  const voce = { id: 'lib-json', nome: 'contratto.json' };
  const { pezzi } = monta(voce, { testo: '{"a":1}\n' });
  assert.equal(listaDi(pezzi), null, 'nessuna striscia di schede');
  const pannello = pannelloDi(pezzi);
  assert.equal(pannello.getAttribute('aria-label'), 'Contenuto di contratto.json');
  assert.ok(testoDi([pannello]).includes('{"a":1}'));
});

test('LIB-MODO-RICORDATO: il modo scelto torna, ma solo se questo file ce l’ha', () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const magazzino = magazzinoFileLibreria(schermo);
  magazzino.file.set('lib-md', { stato: 'pronto', testo: MD, byte: 10 });
  magazzino.file.set('lib-pdf', { stato: 'pronto', testo: '', byte: 0 });
  const monta1 = (voce) => montaAnteprimaFile(voce, { doc, magazzino, ridisegna: () => {}, opzioni: { leggiFile: async () => MD } });

  const md = { id: 'lib-md', nome: 'Nota.md' };
  const primo = monta1(md);
  const schede = schedeDi(primo);
  listaDi(primo).scatta('click', { target: { closest: () => schede[1] } });
  // riaperto lo stesso file, il modo è quello scelto
  assert.equal(schedeDi(monta1(md)).find((b) => b.getAttribute('aria-selected') === 'true').dataset.modo, 'testo');
  // ⛔ verso contrario: un file di testo NON ha «Anteprima», e il modo ricordato non lo inventa
  const json = { id: 'lib-json', nome: 'dati.json' };
  magazzino.modi.set('lib-json', 'anteprima');
  const terzo = monta1(json);
  assert.equal(listaDi(terzo), null);
  assert.ok(testoDi([pannelloDi(terzo)]).length >= 0);
});

test('LIB-ATTESA-ED-ERRORE: si dice che si sta leggendo, e perché non si è riusciti — senza fingere', () => {
  const doc = documentoFinto();
  const voce = { id: 'x', nome: 'Nota.md' };
  const base = { voce, nome: 'Nota.md', formato: 'markdown', magazzino: { tabelleAperte: new Set() }, ridisegna: () => {} };
  const leggendo = contenutoModoFile(doc, 'anteprima', { ...base, lettura: { stato: 'caricando' }, opzioni: { leggiFile: () => {} } });
  assert.ok(testoDi(leggendo).includes('Leggo il file'));
  const rotto = contenutoModoFile(doc, 'testo', { ...base, lettura: { stato: 'errore', errore: 'HTTP 404' }, opzioni: { leggiFile: () => {} } });
  assert.ok(testoDi(rotto).includes('HTTP 404'));
  /* ⛔ Un errore si ANNUNCIA: senza `role="alert"` chi usa un lettore di schermo non sa che il
     pannello è cambiato. (Questa riga prima non poteva fallire: riscritta perché mordesse.) */
  assert.ok(rotto[0].discendenti().some((n) => n.getAttribute?.('role') === 'alert'), 'l’errore ha role="alert"');
  // ⛔ senza lettore non si mostra un'attesa che non finirà mai: si dice che manca la sessione
  const senza = contenutoModoFile(doc, 'testo', { ...base, lettura: null, opzioni: {} });
  assert.ok(testoDi(senza).includes('manca la sessione'));
});
