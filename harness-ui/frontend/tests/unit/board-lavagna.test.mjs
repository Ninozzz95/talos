/*
 * FE-009 (owner 31/10/2026): la lavagna è una vista della Bacheca con gli stati di oggi, quattro colonne, niente trascinamento. Le interrotte
 * stanno in Da riprendere col loro badge. Dati veri: nessun conto dei passi finché non esiste la lista, e nessuna frase inventata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento } from './aiuto-dom-blocchi.mjs';
import { CHIAVE_VISTA_BOARD, CLASSI_STATO_BOARD, colonneDellaLavagna, creaLavagnaBoard, leggiVistaBoard, scriviVistaBoard, selezionaSessioniBoard, statoBoard } from '../../src/components/board.js';

const SESSIONI = [
  { sessionId: 'a', nome: 'Al lavoro', conclusa: false, modello: 'z-ai/glm-5.3-flash', avviataAlle: new Date(Date.now() - 120000).toISOString() },
  { sessionId: 'b', nome: 'Ferma su una carta', conclusa: false, inAttesaApprovazione: true },
  { sessionId: 'c', nome: 'Andata male', conclusa: true, ultimoEsito: 'errore' },
  { sessionId: 'd', nome: 'Interrotta', conclusa: true, interrotta: true },
  { sessionId: 'e', nome: 'Finita', conclusa: true, ultimoEsito: 'successo' },
];
const ids = (colonna) => colonna.sessioni.map((s) => s.sessionId);

test('LAV-01 quattro colonne, gli stati di oggi; le interrotte stanno in Da riprendere col loro badge', () => {
  const colonne = colonneDellaLavagna(SESSIONI);
  assert.deepEqual(colonne.map((c) => c.id), ['vivo', 'attesa', 'riprendere', 'concluse']);
  assert.deepEqual(colonne.map(ids), [['a'], ['b'], ['c', 'd'], ['e']]);
  assert.equal(statoBoard(SESSIONI[3]).chiave, 'interrotto');
});

test('LAV-02 ogni stato che la Bacheca conosce ha una colonna, e uno stato nuovo non fa sparire la sessione', () => {
  const FORME = { vivo: { conclusa: false }, attesa: { conclusa: false, inAttesaApprovazione: true }, successo: { conclusa: true, ultimoEsito: 'successo' },
    errore: { conclusa: true, ultimoEsito: 'errore' }, fermata: { conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'fermata' }, interrotto: { conclusa: true, interrotta: true },
    pendente: { conclusa: true, primoMessaggioAtteso: true }, agenti: { conclusa: true, discendentiAlLavoro: 2 }, 'in-pausa': { conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'in-pausa' }, ignoto: { conclusa: true } };
  assert.deepEqual(Object.keys(FORME).sort(), [...CLASSI_STATO_BOARD].sort(), 'una classe nuova deve finire anche qui');
  for (const [chiave, sessione] of Object.entries(FORME)) {
    const conte = colonneDellaLavagna([{ sessionId: chiave, ...sessione }]).reduce((n, c) => n + c.sessioni.length, 0);
    assert.equal(conte, 1, chiave);
  }
});

test('LAV-02b uno stato senza colonna sua finisce in Da riprendere, e dice cos’è', () => {
  const sessione = { sessionId: 'z', conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'in-pausa' };
  const riprendere = colonneDellaLavagna([sessione]).find((c) => c.id === 'riprendere');
  assert.deepEqual(ids(riprendere), ['z']);
  assert.notEqual(statoBoard(sessione).testo, 'Stato non riconosciuto');
});

test('LAV-03 la Nuova aspetta il primo messaggio della persona; l’ordine della Bacheca resta', () => {
  const [, attesa] = colonneDellaLavagna([{ sessionId: 'x', conclusa: true, primoMessaggioAtteso: true }]);
  assert.deepEqual(ids(attesa), ['x']);
  const [vivo] = colonneDellaLavagna([{ sessionId: 'p', conclusa: false }, { sessionId: 'q', conclusa: false }]);
  assert.deepEqual(ids(vivo), ['p', 'q']);
});

test('LAV-03b una chat che ha risposto coi suoi agenti al lavoro è In corso, e dice quanti sono', () => {
  const sessione = { sessionId: 'y', conclusa: true, discendentiAlLavoro: 2 };
  const [vivo] = colonneDellaLavagna([sessione]);
  assert.deepEqual(ids(vivo), ['y']);
  assert.equal(statoBoard(sessione).testo, '2 agenti al lavoro');
  assert.equal(statoBoard(sessione).tono, 'accent');
  assert.deepEqual(selezionaSessioniBoard([sessione], { stato: 'vivo' }).map((s) => s.sessionId), ['y'], 'il filtro In corso la trova');
});

test('LAV-04 la scheda: titolo, badge, modello e quando; niente passi inventati; nessun HTML dai dati', () => {
  const document = documento();
  const nodo = creaLavagnaBoard([{ ...SESSIONI[0], nome: '<img src=x onerror=alert(1)>' }], { document });
  const scheda = nodo.querySelector('.lav-carta');
  assert.equal(scheda.dataset.boardSessionId, 'a');
  const titolo = scheda.querySelector('.talos-board-session');
  assert.equal(titolo.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(titolo.querySelector('img'), null);
  assert.ok(scheda.querySelector('.talos-badge--accent'));
  assert.match(scheda.textContent, /glm-5\.3-flash/u);
  assert.match(scheda.textContent, /2 min/u);
  assert.doesNotMatch(scheda.textContent, /passi|steps/iu);
});

test('LAV-04b con la lista dei Passi la scheda dice a che punto è', () => {
  const nodo = creaLavagnaBoard([{ ...SESSIONI[0], passi: { fatti: 3, totale: 7 } }], { document: documento() });
  assert.equal(nodo.querySelector('.talos-measure').textContent, '3 di 7 passi');
});

test('LAV-05 sotto la scheda il motivo di chiusura vero; se non c’è, nessuna riga vuota', () => {
  const document = documento();
  const conMotivo = creaLavagnaBoard([SESSIONI[4]], { document, metriche: { e: { chiusura: { motivo: 'fine-lavoro' } } } });
  assert.equal(conMotivo.querySelector('.lav-nota').textContent, 'fine lavoro');
  const senza = creaLavagnaBoard([SESSIONI[4]], { document });
  assert.equal(senza.querySelector('.lav-nota'), null);
});

test('LAV-06 un clic apre, il menu resta quello delle righe, si apre anche da tastiera', () => {
  const document = documento();
  const aperte = []; const menu = [];
  const nodo = creaLavagnaBoard([SESSIONI[0]], { document, onApri: (s) => aperte.push(s.sessionId), onMenu: (s) => menu.push(s.sessionId) });
  const scheda = nodo.querySelector('.lav-carta');
  scheda.dispatchEvent(new Event('click', { bubbles: true }));
  assert.deepEqual(aperte, ['a']);
  scheda.dispatchEvent(Object.assign(new Event('contextmenu', { bubbles: true }), { clientX: 1, clientY: 2 }));
  assert.deepEqual(menu, ['a']);
  assert.equal(scheda.querySelector('button').type, 'button');
});

test('LAV-07 una colonna vuota lo dice; senza sessioni resta il messaggio della Bacheca, non quattro colonne vuote', () => {
  const document = documento();
  const nodo = creaLavagnaBoard([SESSIONI[0]], { document });
  assert.equal(nodo.querySelectorAll('.lav-col').length, 4);
  assert.equal(nodo.querySelectorAll('.lav-vuota').length, 3);
  const vuota = creaLavagnaBoard([], { document, vuoto: 'Nessuna sessione ancora' });
  assert.equal(vuota.querySelectorAll('.lav-col').length, 0);
  assert.equal(vuota.querySelector('.lav-vuota').textContent, 'Nessuna sessione ancora');
});

test('LAV-08 prende il posto della tabella: stesso id, stesso ruolo, stessa ancora per il ridisegno', () => {
  const nodo = creaLavagnaBoard(SESSIONI, { document: documento() });
  assert.equal(nodo.id, 'boardTabella');
  assert.equal(nodo.getAttribute('role'), 'tabpanel');
  assert.equal(nodo.dataset.c, 'DataTable');
  assert.equal(nodo.style.getPropertyValue?.('--n') ?? '4', '4');
});

test('LAV-09 la scelta della vista si ricorda, e una memoria rotta vale Tabella', () => {
  const m = new Map();
  const memoria = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(leggiVistaBoard(memoria), 'tabella');
  scriviVistaBoard(memoria, 'lavagna');
  assert.equal(m.get(CHIAVE_VISTA_BOARD), 'lavagna');
  assert.equal(leggiVistaBoard(memoria), 'lavagna');
  m.set(CHIAVE_VISTA_BOARD, 'inventata');
  assert.equal(leggiVistaBoard(memoria), 'tabella');
  assert.equal(leggiVistaBoard({ getItem() { throw new Error('no'); } }), 'tabella');
  assert.equal(leggiVistaBoard(undefined), 'tabella');
  assert.doesNotThrow(() => scriviVistaBoard({ setItem() { throw new Error('no'); } }, 'lavagna'));
});

test('LAV-10 l’interruttore sta nella testata della Bacheca e lo stile è caricato', () => {
  const pagina = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
  assert.match(pagina, /data-board-vista="tabella"/u);
  assert.match(pagina, /data-board-vista="lavagna"/u);
  const stile = readFileSync(new URL('../../src/styles/main.css', import.meta.url), 'utf8');
  assert.match(stile, /@import '\.\/lavagna\.css'/u);
  const css = readFileSync(new URL('../../src/styles/lavagna.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 520px\)/u);
});
