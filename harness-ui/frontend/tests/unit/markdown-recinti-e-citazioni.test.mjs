import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderizzaMarkdown, bloccoCodiceNudo } from '../../src/components/markdown.js';

/*
 * BC-29, 12/09/2026 — «le note, se sono markdown, devono essere renderizzate in markdown» (owner).
 *
 * Nella foto del dettaglio di una nota in Anteprima: titoli, grassetto ed elenchi numerati resi, ma
 * un recinto ```…``` come righe di testo normale e una citazione «> …» col maggiore a schermo.
 * Due guasti DIVERSI, e le prove qui sotto li tengono separati perché anche le cure lo sono:
 *   · la CITAZIONE non esisteva nel renderer (nemmeno in chat)  ⇒ prove sul DOM, qui;
 *   · il RECINTO era reso ma il suo vestito era ambito alla sola bolla della chat ⇒ prove sul CSS
 *     spedito, in fondo a questo file.
 *
 * ⛔ Ogni prova sta anche nel verso contrario: la citazione che NON deve nascere, il testo che deve
 *   restare testo. Un ramo che non si prova a NON far scattare non si sa se discrimina.
 */

/* ------------------------------------------------------------------ un DOM finto, minimo e onesto */

/**
 * Il frontend non carica un DOM nelle unit (stessa scelta di `blocco-codice.test.mjs`).
 * ⛔ Questo finto registra anche `innerHTML`: la prova sull'escape deve poter dimostrare che il
 *   testo non fidato è passato da `createTextNode`, e non che «a schermo sembrava a posto».
 */
function creaDocumentoFinto() {
  const htmlAssegnati = [];
  const creaNodo = (tag, tipo = 'elemento') => {
    const nodo = {
      tag,
      tipo,
      figli: [],
      attributi: new Map(),
      style: {},
      classe: '',
      testoProprio: null,
      get className() { return nodo.classe; },
      set className(v) { nodo.classe = String(v); },
      get textContent() { return nodo.testoProprio !== null ? nodo.testoProprio : nodo.figli.map((f) => f.textContent).join(''); },
      set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; },
      get innerHTML() { return ''; },
      set innerHTML(v) { htmlAssegnati.push(String(v)); },
      appendChild: (f) => { nodo.figli.push(f); return f; },
      append: (...f) => nodo.figli.push(...f),
      setAttribute: (k, v) => nodo.attributi.set(k, String(v)),
      getAttribute: (k) => (nodo.attributi.has(k) ? nodo.attributi.get(k) : null),
    };
    return nodo;
  };
  return {
    htmlAssegnati,
    createElement: (tag) => creaNodo(tag),
    createTextNode: (t) => ({ tag: '#text', tipo: 'testo', figli: [], testo: String(t), get textContent() { return this.testo; } }),
    createDocumentFragment: () => creaNodo('#fragment', 'frammento'),
  };
}

/** I DISCENDENTI che portano quel tag (la radice no: serve a contare l'annidamento). */
function perTag(nodo, tag) {
  const fuori = [];
  const giro = (n) => (n.figli || []).forEach((f) => { if (f.tag === tag) fuori.push(f); giro(f); });
  giro(nodo);
  return fuori;
}
/** Tutti i discendenti che portano quella classe. */
function perClasse(nodo, classe) {
  const fuori = [];
  const giro = (n) => { if (String(n.classe || '').split(/\s+/).includes(classe)) fuori.push(n); (n.figli || []).forEach(giro); };
  giro(nodo);
  return fuori;
}
/** I figli DIRETTI che sono elementi, per guardare la forma del frammento senza indovinare. */
const formaDi = (nodo) => nodo.figli.filter((f) => f.tipo !== 'testo').map((f) => f.tag);

function rendi(testo, opzioni = {}) {
  const doc = creaDocumentoFinto();
  const frammento = renderizzaMarkdown(testo, { document: doc, ...opzioni });
  return { doc, frammento };
}

/* --------------------------------------------------------------------------------- i recinti */

test('BC29-RECINTO-LINGUA: il recinto con lingua passa al blocco della chat, con la lingua dichiarata', () => {
  const visti = [];
  const { frammento } = rendi('Prima.\n\n```python\nprint("ciao")\n```\n\nDopo.', {
    bloccoCodice: (testo, linguaggio, chiuso) => {
      visti.push({ testo, linguaggio, chiuso });
      const doc = creaDocumentoFinto();
      const n = doc.createElement('div');
      n.className = 'code-block';
      return n;
    },
  });
  assert.deepEqual(visti, [{ testo: 'print("ciao")', linguaggio: 'python', chiuso: true }]);
  assert.deepEqual(formaDi(frammento), ['p', 'div', 'p'], 'il blocco sta FRA i due paragrafi, non dentro uno');
  assert.equal(perClasse(frammento, 'code-block').length, 1);
});

test('BC29-RECINTO-SENZA-LINGUA: nessuna lingua dichiarata ⇒ nessuna lingua inventata', () => {
  const visti = [];
  const { frammento } = rendi('```\nriga uno\n  riga due\n```', {
    bloccoCodice: (testo, linguaggio, chiuso) => {
      visti.push({ testo, linguaggio, chiuso });
      return creaDocumentoFinto().createElement('div');
    },
  });
  assert.deepEqual(visti, [{ testo: 'riga uno\n  riga due', linguaggio: '', chiuso: true }]);
  assert.deepEqual(formaDi(frammento), ['div']);
  // ⛔ verso contrario: l'indentazione del codice non si tocca — né trim né normalizzazioni
  assert.ok(visti[0].testo.includes('\n  riga due'));
});

test('BC29-RECINTO-DI-SERIE: senza un blocco iniettato esce un <pre><code>, non del testo', () => {
  /*
   * ⛔ È il caso del laboratorio e di chiunque monti il renderer senza la chat: prima di BC-29 il
   * renderer viveva dentro l'IIFE di `legacy/app.js` e questo caso non esisteva nemmeno.
   */
  const { frammento } = rendi('```js\nconst a = 1;\n```');
  assert.deepEqual(formaDi(frammento), ['pre']);
  const [pre] = perTag(frammento, 'pre');
  const [code] = perTag(pre, 'code');
  assert.equal(code.textContent, 'const a = 1;');
  assert.equal(code.className, 'language-js', 'la lingua dichiarata si scrive; senza dichiarazione niente classe');
  assert.equal(perTag(bloccoCodiceNudo(creaDocumentoFinto(), 'x', ''), 'code')[0].className, '');
});

test('BC29-RECINTO-APERTO: un recinto senza chiusura arriva comunque, dichiarato aperto', () => {
  const visti = [];
  rendi('```sql\nSELECT 1', { bloccoCodice: (testo, linguaggio, chiuso) => { visti.push(chiuso); return creaDocumentoFinto().createElement('div'); } });
  assert.deepEqual(visti, [false], 'durante lo streaming il blocco esiste già, ma si sa che non è finito');
});

/* ------------------------------------------------------------------------------ le citazioni */

test('BC29-CITAZIONE: «> …» diventa un blockquote, e il maggiore sparisce dal testo', () => {
  const { frammento } = rendi('> Una riga citata.');
  assert.deepEqual(formaDi(frammento), ['blockquote']);
  const [q] = perTag(frammento, 'blockquote');
  assert.equal(q.className, 'md-quote');
  assert.equal(q.textContent, 'Una riga citata.');
  assert.ok(!q.textContent.includes('>'), 'il marcatore non arriva a schermo: era esattamente il difetto della foto');
});

test('BC29-CITAZIONE-MULTILINEA: righe di seguito fanno UNA citazione, e la riga vuota la chiude', () => {
  const { frammento } = rendi('> Prima riga\n> seconda riga\n\nFuori.');
  assert.deepEqual(formaDi(frammento), ['blockquote', 'p']);
  const [q] = perTag(frammento, 'blockquote');
  assert.equal(perTag(q, 'p').length, 1, 'due righe di fila sono lo STESSO paragrafo dentro la citazione');
  assert.equal(q.textContent, 'Prima rigaseconda riga'); // il <br> in mezzo non porta testo
  assert.equal(perTag(q, 'br').length, 1);
  assert.equal(frammento.figli.at(-1).textContent, 'Fuori.');
});

test('BC29-CITAZIONE-PIGRA: la continuazione senza «>» resta dentro, un altro blocco no', () => {
  /*
   * GFM, «Block quotes» (github.github.com/gfm, letto il 12/09/2026): laziness — «block quote
   * markers may be omitted from lines where paragraph continuation text follows». Vale per la
   * CONTINUAZIONE di un paragrafo, non per l'inizio di un altro costrutto.
   */
  const pigra = rendi('> Prima\ncontinua qui').frammento;
  assert.deepEqual(formaDi(pigra), ['blockquote']);
  assert.equal(perTag(pigra, 'blockquote')[0].textContent, 'Primacontinua qui');

  // ⛔ verso contrario: un titolo subito sotto NON viene risucchiato dalla citazione
  const conTitolo = rendi('> Prima\n## Un titolo').frammento;
  assert.deepEqual(formaDi(conTitolo), ['blockquote', 'h2']);
  assert.equal(perTag(conTitolo, 'h2')[0].textContent, 'Un titolo');

  // ⛔ e nemmeno un elenco
  const conElenco = rendi('> Prima\n- uno\n- due').frammento;
  assert.deepEqual(formaDi(conElenco), ['blockquote', 'ul']);
  assert.equal(perTag(conElenco, 'li').length, 2);
});

test('BC29-CITAZIONE-ANNIDATA: «>>» fa una citazione dentro la citazione', () => {
  const { frammento } = rendi('> fuori\n>\n> > dentro\n');
  const quote = perTag(frammento, 'blockquote');
  assert.equal(quote.length, 2, 'due livelli, non due citazioni affiancate');
  const esterna = quote[0];
  assert.equal(perTag(esterna, 'blockquote').length, 1);
  assert.equal(quote[1].textContent, 'dentro');
  assert.ok(esterna.textContent.includes('fuori') && esterna.textContent.includes('dentro'));
});

test('BC29-CITAZIONE-CON-RECINTO: dentro una citazione valgono gli altri blocchi', () => {
  const visti = [];
  const { frammento } = rendi('> Guarda:\n> ```js\n> const a = 1;\n> ```', {
    bloccoCodice: (testo, linguaggio) => { visti.push({ testo, linguaggio }); return creaDocumentoFinto().createElement('div'); },
  });
  assert.deepEqual(formaDi(frammento), ['blockquote']);
  assert.deepEqual(visti, [{ testo: 'const a = 1;', linguaggio: 'js' }], 'il recinto dentro la citazione passa dallo stesso blocco della chat');
});

test('BC29-NIENTE-CITAZIONE: un maggiore che non è un marcatore resta testo', () => {
  // ⛔ verso contrario del ramo: senza questi casi non si sa se discrimina o se prende tutto.
  for (const riga of ['a > b', 'if (x > 1) return;', '     > troppo rientrato']) {
    const { frammento } = rendi(riga);
    assert.deepEqual(formaDi(frammento), ['p'], `«${riga}» non è una citazione`);
    assert.equal(perTag(frammento, 'blockquote').length, 0);
  }
  // ⛔ e il maggiore CI DEVE essere nel testo, non mangiato
  assert.equal(rendi('a > b').frammento.figli[0].textContent, 'a > b');
});

/* ------------------------------------------------------------ ciò che la chat già faceva, uguale */

test('BC29-NESSUNA-REGRESSIONE: titoli, grassetto, elenchi, separatore e tabella come prima', () => {
  const { frammento } = rendi([
    '# Titolo',
    '',
    'Testo con **grassetto**, *corsivo* e `codice`.',
    '',
    '1. uno',
    '2. due',
    '',
    '---',
    '',
    '| A | B |',
    '| --- | ---: |',
    '| 1 | 2 |',
  ].join('\n'));
  assert.deepEqual(formaDi(frammento), ['h1', 'p', 'ol', 'hr', 'div']);
  assert.equal(perTag(frammento, 'strong')[0].textContent, 'grassetto');
  assert.equal(perTag(frammento, 'em')[0].textContent, 'corsivo');
  assert.equal(perTag(frammento, 'code')[0].textContent, 'codice');
  assert.equal(perTag(frammento, 'li').length, 2);
  const [tabella] = perTag(frammento, 'table');
  assert.equal(tabella.className, 'md-table');
  assert.equal(perTag(tabella, 'th').length, 2);
  assert.equal(perTag(tabella, 'td')[1].style.textAlign, 'right');
});

test('BC29-MESSAGGIO-DI-CHAT: una risposta con codice dà lo stesso DOM di prima della cura', () => {
  /*
   * La fixture è un messaggio come li scrive il modello: prosa, un recinto, un elenco. La forma è
   * quella che la chat produceva prima di BC-29 — se cambiasse, la cura delle note avrebbe toccato
   * la conversazione, che è la cosa da non fare.
   */
  const MESSAGGIO = [
    'Ho aggiornato il file. Ecco la funzione:',
    '',
    '```js',
    'export function somma(a, b) {',
    '  return a + b;',
    '}',
    '```',
    '',
    'Restano due cose:',
    '',
    '- i test',
    '- il changelog',
  ].join('\n');
  const blocchi = [];
  const { frammento } = rendi(MESSAGGIO, {
    bloccoCodice: (testo, linguaggio, chiuso) => {
      blocchi.push({ testo, linguaggio, chiuso });
      const n = creaDocumentoFinto().createElement('div');
      n.className = 'code-block';
      return n;
    },
  });
  assert.deepEqual(formaDi(frammento), ['p', 'div', 'p', 'ul']);
  assert.deepEqual(blocchi, [{ testo: 'export function somma(a, b) {\n  return a + b;\n}', linguaggio: 'js', chiuso: true }]);
  assert.equal(perTag(frammento, 'li').length, 2);
  assert.equal(perTag(frammento, 'blockquote').length, 0, 'nessuna citazione dove non ce n’era');
});

/* --------------------------------------------------------------- il verso contrario: l'escape */

test('BC29-ESCAPE: il testo non fidato resta TESTO, anche dentro una citazione o un recinto', () => {
  /*
   * ⛔ Il testo arriva dal modello o da un file della persona. La prova non è «a schermo sembra a
   * posto»: il documento finto registra ogni assegnazione a `innerHTML`, e qui devono essere ZERO.
   */
  const VELENO = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  for (const sorgente of [VELENO, `> ${VELENO}`, `# ${VELENO}`, `- ${VELENO}`, `| ${VELENO} |\n| --- |\n| x |`]) {
    const { doc, frammento } = rendi(sorgente);
    assert.deepEqual(doc.htmlAssegnati, [], `innerHTML usato per «${sorgente.slice(0, 24)}…»`);
    assert.equal(perTag(frammento, 'img').length, 0);
    assert.equal(perTag(frammento, 'script').length, 0);
    assert.ok(frammento.textContent.includes('<img src=x'), 'il markup velenoso resta leggibile come testo');
  }
});

/* ------------------------------------------------------------------------- il CSS che è spedito */

const QUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(QUI, '..', '..');
const CSS_SPEDITO = readFileSync(path.join(FRONTEND, 'src/styles/index.css'), 'utf8');

/**
 * Le regole di un foglio il cui selettore nomina un pezzo, col loro corpo.
 * ⛔ I commenti si tolgono PRIMA: senza, il commento che precede una regola finisce dentro il
 *   «selettore» e una prova sull'ambito misurerebbe il testo di una glossa invece del CSS.
 */
function regoleCon(css, pezzoDelSelettore) {
  const senzaCommenti = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const fuori = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(senzaCommenti))) {
    const selettore = m[1].trim();
    if (selettore.includes(pezzoDelSelettore)) fuori.push({ selettore, corpo: m[2] });
  }
  return fuori;
}

test('BC29-CSS-AMBITO: il blocco di codice non è più vestito SOLO dentro la bolla della chat', () => {
  /*
   * LA CAUSA della foto. Le 44 regole del blocco portavano
   * `:is(.assistant-copy, .talos-message__body--comando)` in testa: nel dettaglio di una nota il
   * markup arrivava giusto e nudo ⇒ «righe di testo normale, niente monospazio, niente blocco».
   */
  const ambite = regoleCon(CSS_SPEDITO, '.code-block').filter(({ selettore }) => selettore.includes('.assistant-copy'));
  assert.deepEqual(ambite.map((r) => r.selettore), [], 'una regola del blocco di codice è ancora chiusa dentro la chat');
  // e il vestito c'è davvero: fondo, bordo e monospazio
  assert.ok(regoleCon(CSS_SPEDITO, '.code-block').some(({ selettore, corpo }) => selettore.trim() === '.code-block' && /background\s*:/.test(corpo) && /border\s*:/.test(corpo)));
  assert.ok(regoleCon(CSS_SPEDITO, '.code-block').some(({ selettore, corpo }) => /pre\s*>\s*code/.test(selettore) && /font-family\s*:\s*var\(--talos-font-mono/.test(corpo)));
});

test('BC29-CSS-STRISCE: il chip del codice inline resta spento dentro <pre>, e vince per PESO', () => {
  /*
   * ⛔ Tolto l'antenato, `.code-block pre code` peserebbe (0,1,1) come `.talos-message code`
   * (background + padding + border-radius): un pareggio deciso dall'ORDINE del file, cioè le
   * strisce del 09/09 a un `@import` di distanza. Il figlio diretto porta a (0,1,2).
   */
  const reset = regoleCon(CSS_SPEDITO, '.code-block').filter(({ selettore, corpo }) => /pre\s*>\s*code/.test(selettore)
    && /display\s*:\s*block/.test(corpo) && /background\s*:\s*(none|transparent)/.test(corpo) && /padding\s*:\s*0/.test(corpo));
  assert.ok(reset.length > 0, 'manca `.code-block pre > code{display:block;background:none;padding:0}`');
});

test('BC29-CSS-CITAZIONE: `.md-quote` è vestita, e come il passaggio che TALOS ha già', () => {
  const regole = regoleCon(CSS_SPEDITO, '.md-quote');
  const base = regole.find(({ selettore }) => selettore.trim() === '.md-quote');
  assert.ok(base, 'nessuno stile per la citazione: il blockquote uscirebbe col rientro di serie del browser');
  assert.match(base.corpo, /border-left\s*:\s*2px solid var\(--talos-accent-border\)/, 'stesso filetto di `.td-passaggio`, non un secondo linguaggio visivo');
  assert.ok(!base.corpo.includes('.assistant-copy'), 'la citazione vale in chat E nel dettaglio');
  assert.ok(regole.some(({ selettore }) => /\.md-quote\s+\.md-quote/.test(selettore)), 'il secondo livello deve distinguersi dal primo');
  // i colori vengono dai token dei temi: chiaro e scuro non si scrivono due volte
  for (const { corpo } of regole) {
    const colori = corpo.match(/#[0-9a-fA-F]{3,8}/g) || [];
    assert.deepEqual(colori, [], `la citazione non scrive colori a mano: ${colori.join(', ')}`);
  }
});

test('BC29-CSS-TABELLA: anche la tabella GFM è vestita fuori dalla chat', () => {
  const ambite = regoleCon(CSS_SPEDITO, '.md-table').filter(({ selettore }) => selettore.includes('.assistant-copy'));
  assert.deepEqual(ambite.map((r) => r.selettore), [], 'la tabella è ancora chiusa dentro la chat');
  assert.ok(regoleCon(CSS_SPEDITO, '.md-table').some(({ selettore, corpo }) => selettore.trim() === '.md-table' && /border-collapse/.test(corpo)));
});
