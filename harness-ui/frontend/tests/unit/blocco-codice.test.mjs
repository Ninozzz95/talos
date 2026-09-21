import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaBloccoCodice, aggiornaBloccoCodice, etichettaLinguaggio, chiaveLinguaggio } from '../../src/components/conversazione.js';

/*
 * 09/09/2026 — l'owner con lo screenshot: «i blocchi di codice appaiono frammentati in strisce
 * come codice inline, separati dalla barra lingua/Copia».
 *
 * Misurato in Chromium 151 sul CSS SPEDITO (sonda locale: una pagina file:// con i due fogli
 * concatenati nello stesso ordine di `scripts/cancello/statico.mjs`), PRIMA della cura:
 *   .code-block             background rgba(0,0,0,0) · border none · border-radius 0px
 *   .code-block pre > code  display inline · background rgb(43,44,48) · padding 1px 5px · radius 5px
 *   code.getClientRects()   5 rettangoli per 5 righe   ⇒ le «strisce»
 *   54 token Prism          1 SOLO colore              ⇒ evidenziazione invisibile
 *   pre.tabIndex            -1 con scrollWidth > clientWidth ⇒ tastiera esclusa
 *
 * Le cause sono due e vanno provate separate: il CSS (i primi tre test, sui fogli veri) e il
 * markup del renderer (il resto).
 */

const QUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(QUI, '..', '..');
const leggi = (rel) => readFileSync(path.join(FRONTEND, rel), 'utf8');
/** Gli stessi due fogli, nello stesso ordine, che `scripts/cancello/statico.mjs` concatena per la app. */
const CSS_SPEDITO = [leggi('src/styles/index.css'), leggi('src/styles/foglio-monolite.css')].join('\n');

/** Le regole di un foglio il cui selettore nomina un pezzo, col loro corpo. */
function regoleCon(css, pezzoDelSelettore) {
  const fuori = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const selettore = m[1].trim();
    if (selettore.includes(pezzoDelSelettore)) fuori.push({ selettore, corpo: m[2] });
  }
  return fuori;
}
const REGOLE_BLOCCO = () => regoleCon(CSS_SPEDITO, '.code-block');

/**
 * I nomi di variabile che una dichiarazione usa come valore PRIMARIO, cioè quelli da cui dipende
 * davvero. `var(--talos-border, var(--line))` dipende da `--talos-border`: la fallback non scatta
 * mai finché il primo è definito, e segnalarla sarebbe un falso allarme.
 */
function variabiliPrimarie(corpo) {
  const nomi = [];
  const re = /var\(\s*(--[\w-]+)/g;
  let m;
  let profondita = 0;
  let ultimoIndice = 0;
  while ((m = re.exec(corpo))) {
    // quante var( aperte restano a questo punto: se ce n'è già una, questa è dentro una fallback
    for (let k = ultimoIndice; k < m.index; k += 1) {
      if (corpo[k] === '(') profondita += 1;
      else if (corpo[k] === ')') profondita = Math.max(0, profondita - 1);
    }
    ultimoIndice = m.index;
    if (profondita === 0) nomi.push(m[1]);
    profondita += 1; // la parentesi di questa var(
    ultimoIndice = m.index + m[0].length;
  }
  return nomi;
}

test('CODICE-CSS-VARIABILI: il blocco non si veste con variabili che nella chat NON esistono', () => {
  /*
   * ⛔ LA CAUSA VERA del contenitore sparito. `--line`, `--bg-deep`, `--radius-card`, `--font-mono`
   * sono dichiarate SOLO su `dialog.sheet-dialog, dialog.command-dialog, .ft-actions-menu,
   * .talos-dialog` (foglio-monolite.css riga 34). La conversazione non è nessuno dei quattro: dentro
   * `.assistant-copy` quelle var() non risolvono, la dichiarazione è invalida al tempo del valore
   * calcolato e CADE — bordo, angoli e fondo spariscono senza un errore da nessuna parte.
   * È lo stesso guasto che il foglio documenta in testa per il velo `.talos-dialog` (07/09).
   */
  const soloNeiVeli = ['--line', '--bg-deep', '--radius-card', '--font-mono', '--surface', '--text-2', '--muted', '--accent'];
  const colpevoli = [];
  for (const { selettore, corpo } of REGOLE_BLOCCO()) {
    if (/(^|,)\s*(dialog\.|\.ft-actions-menu|\.talos-dialog)/.test(selettore)) continue; // là dentro quelle var esistono
    for (const v of variabiliPrimarie(corpo)) if (soloNeiVeli.includes(v)) colpevoli.push(`${selettore} -> var(${v})`);
  }
  assert.deepEqual(colpevoli, [], `il blocco di codice si veste con variabili non definite nella chat:\n${colpevoli.join('\n')}`);
});

test('CODICE-CSS-STRISCE: dentro <pre> il chip del codice inline è spento e il codice è un blocco solo', () => {
  /*
   * `.talos-message code{background:var(--talos-panel-soft); padding:1px 5px; border-radius:5px}`
   * (index.css) prende ANCHE il <code> dentro <pre>: `code` è inline, ogni riga è un line box e ogni
   * line box si dipinge il suo rettangolo ⇒ le strisce. Cura di css-tricks.com («Styling Code In and
   * Out of Blocks»): `pre code{display:block; background:none; padding:0}`.
   */
  const reset = REGOLE_BLOCCO().filter(({ selettore, corpo }) => /pre\s*>?\s*code/.test(selettore)
    && /display\s*:\s*block/.test(corpo)
    && /background\s*:\s*(none|transparent)/.test(corpo)
    && /padding\s*:\s*0/.test(corpo));
  assert.ok(reset.length > 0, 'manca la regola che spegne il chip del codice inline dentro <pre>: le righe restano strisce');
});

test('CODICE-CSS-EVIDENZIAZIONE: i token di Prism hanno un colore, e il tema chiaro è tarato', () => {
  // Misurato: 54 token generati da Prism, 1 solo colore a schermo — gira, ma nessuna regola lo veste.
  for (const classe of ['comment', 'keyword', 'string', 'number', 'function', 'punctuation']) {
    assert.ok(REGOLE_BLOCCO().some(({ selettore, corpo }) => selettore.includes(`.token.${classe}`) && /color\s*:/.test(corpo)),
      `nessun colore per .token.${classe}: l'evidenziazione non si vede`);
  }
  assert.ok(REGOLE_BLOCCO().some(({ selettore }) => selettore.includes('[data-theme="light"]')),
    'nessuna taratura dei colori del codice per il tema chiaro');
});

/* ------------------------------------------------------------------ renderer */

/** Nodo finto: le unit di questo repo non caricano un DOM (stessa forma di `tests/unit/browser-vivo.test.mjs`). */
function nodoFinto(tag) {
  const attributi = new Map();
  const nodo = {
    tag,
    figli: [],
    ascolti: [],
    classi: new Set(),
    dataset: {},
    disabled: false,
    scrollLeft: 0,
    testoProprio: null,
    html: '',
    get className() { return [...nodo.classi].join(' '); },
    set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: {
      add: (...c) => c.forEach((x) => nodo.classi.add(x)),
      remove: (...c) => c.forEach((x) => nodo.classi.delete(x)),
      toggle: (c, forza) => (forza ? nodo.classi.add(c) : nodo.classi.delete(c)),
      contains: (c) => nodo.classi.has(c),
    },
    get textContent() { return nodo.testoProprio !== null ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(''); },
    set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; nodo.html = ''; },
    get innerHTML() { return nodo.html; },
    set innerHTML(v) { nodo.html = String(v); nodo.testoProprio = null; },
    setAttribute: (k, v) => attributi.set(k, String(v)),
    getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
    removeAttribute: (k) => attributi.delete(k),
    append: (...x) => nodo.figli.push(...x),
    addEventListener: (t, m) => nodo.ascolti.push({ t, m }),
    lancia: (t, e = {}) => nodo.ascolti.filter((a) => a.t === t).forEach((a) => a.m({ type: t, ...e })),
    /** Ricerca a mano: il finto non ha querySelector, e qui serve solo cercare per classe o per tag. */
    trova: (classe) => (nodo.classi.has(classe) ? nodo : nodo.figli.map((f) => f.trova?.(classe)).find(Boolean) || null),
    trovaTag: (t) => (nodo.tag === t ? nodo : nodo.figli.map((f) => f.trovaTag?.(t)).find(Boolean) || null),
  };
  return nodo;
}
const documentoFinto = () => ({ createElement: (tag) => nodoFinto(tag) });
const CODICE = "const a = 1;\n  const b = '  due  ';\n\tterza\n";

test('CODICE-MARKUP: un contenitore solo — intestazione e codice dentro lo stesso blocco', () => {
  const blocco = creaBloccoCodice({ testo: CODICE, linguaggio: 'js', chiuso: true }, { document: documentoFinto() });
  assert.ok(blocco.classList.contains('code-block'));
  assert.equal(blocco.figli.length, 2, 'due figli soli: la barra e il codice, dentro lo stesso contenitore');
  const [testa, pre] = blocco.figli;
  assert.ok(testa.classList.contains('code-block-head'));
  assert.equal(pre.tag, 'pre');
  assert.equal(testa.trova('code-block-lang').textContent, 'JavaScript'); // il nome dichiarato, scritto per le persone
  assert.equal(testa.trova('code-block-copy').textContent, 'Copia');
  assert.equal(blocco.dataset.lingua, 'javascript');
});

test('CODICE-FEDELTA: indentazione, spazi e tab arrivano interi al <code> e alla copia', () => {
  const copiati = [];
  const blocco = creaBloccoCodice(
    { testo: CODICE, linguaggio: 'nonesiste', chiuso: true },
    { document: documentoFinto(), evidenzia: () => null, copia: (t) => { copiati.push(t); return Promise.resolve(); } },
  );
  assert.equal(blocco.trovaTag('code').textContent, CODICE, 'il testo del modello non si tocca: né trim né normalizzazioni');
  blocco.trova('code-block-copy').lancia('click');
  assert.deepEqual(copiati, [CODICE], 'la copia dà il testo GREZZO, non quello evidenziato');
});

test('CODICE-TASTIERA: il <pre> che scorre è raggiungibile, e dice cosa contiene', () => {
  /*
   * Misurato prima: scrollWidth > clientWidth con tabIndex -1 ⇒ chi usa la tastiera non arriva a fine
   * riga. La regola axe `scrollable-region-focusable` (dequeuniversity, letta 09/09/2026) chiede il
   * solo `tabindex="0"`; il nome lo diamo con `role="group"` e NON con `role="region"`, che è un
   * landmark: in una chat piena di blocchi riempirebbe l'elenco dei punti di riferimento.
   */
  const blocco = creaBloccoCodice({ testo: CODICE, linguaggio: 'py', chiuso: true }, { document: documentoFinto() });
  const pre = blocco.trovaTag('pre');
  assert.equal(pre.getAttribute('tabindex'), '0');
  assert.equal(pre.getAttribute('role'), 'group');
  assert.equal(pre.getAttribute('aria-label'), 'Blocco di codice Python');
});

test('CODICE-LINGUA-IGNOTA: si scrive quello che ha dichiarato il modello, non si indovina', () => {
  const doc = documentoFinto();
  const ignota = creaBloccoCodice({ testo: 'x', linguaggio: 'brainfuck', chiuso: true }, { document: doc, evidenzia: () => null });
  assert.equal(ignota.trova('code-block-lang').textContent, 'brainfuck');
  assert.equal(ignota.trovaTag('code').className, '', 'nessuna classe language-* se la grammatica non c’è');
  const nessuna = creaBloccoCodice({ testo: 'x', chiuso: true }, { document: doc, evidenzia: () => null });
  assert.equal(nessuna.trova('code-block-lang').textContent, 'testo');
  assert.equal(nessuna.trovaTag('pre').getAttribute('aria-label'), 'Blocco di codice');
  assert.equal(chiaveLinguaggio('py'), 'python');
  assert.equal(etichettaLinguaggio('  '), '');
});

test('CODICE-IN-ARRIVO: mentre il fence è aperto niente evidenziazione e niente copia a metà', () => {
  // Streamdown (streamdown.ai/docs/code-blocks, letto 09/09/2026): il pulsante copia si disabilita
  // durante lo streaming, e il blocco si disegna comunque anche senza i backtick di chiusura.
  let evidenziato = 0;
  const blocco = creaBloccoCodice(
    { testo: 'const a =', linguaggio: 'js', chiuso: false },
    { document: documentoFinto(), evidenzia: () => { evidenziato += 1; return '<span>x</span>'; } },
  );
  assert.ok(blocco.classList.contains('code-block-in-arrivo'));
  assert.equal(evidenziato, 0, 'evidenziare un testo che cambia a ogni frame è sfarfallio e costo, non colore');
  const bottone = blocco.trova('code-block-copy');
  assert.equal(bottone.disabled, true);
  assert.equal(bottone.textContent, 'In arrivo…');
  assert.equal(blocco.trovaTag('code').textContent, 'const a =', 'il testo si legge già mentre arriva');
});

test('CODICE-STREAMING: il blocco si aggiorna SUL POSTO e non perde la posizione di scorrimento', () => {
  /*
   * `renderizzaMarkdownIncrementale` (app.js) tiene il fence aperto nella CODA, e la coda si
   * distrugge a ogni frame: oggi il blocco viene ricostruito da zero e con lui se ne vanno
   * scorrimento e selezione. Con l'aggiornamento sul posto i nodi restano gli stessi.
   */
  const blocco = creaBloccoCodice({ testo: 'riga 1\n', linguaggio: 'js', chiuso: false }, { document: documentoFinto(), evidenzia: (t) => `EVID(${t})` });
  const pre = blocco.trovaTag('pre');
  const code = blocco.trovaTag('code');
  pre.scrollLeft = 120;
  aggiornaBloccoCodice(blocco, { testo: 'riga 1\nriga 2\n', chiuso: false });
  assert.equal(blocco.trovaTag('code'), code, 'stesso nodo: niente ricostruzione');
  assert.equal(code.textContent, 'riga 1\nriga 2\n');
  assert.equal(pre.scrollLeft, 120, 'la posizione di scorrimento non si perde a metà lettura');
  aggiornaBloccoCodice(blocco, { testo: 'riga 1\nriga 2\n', chiuso: true });
  assert.equal(blocco.classList.contains('code-block-in-arrivo'), false);
  assert.equal(blocco.trova('code-block-copy').disabled, false);
  assert.equal(code.innerHTML, 'EVID(riga 1\nriga 2\n)', 'alla chiusura del fence, e solo lì, si evidenzia');
});

test('CODICE-AL-CONTRARIO: il testo del modello resta testo, mai markup eseguito', () => {
  const veleno = '<img src=x onerror="alert(1)">';
  const blocco = creaBloccoCodice({ testo: veleno, linguaggio: 'nonesiste', chiuso: true }, { document: documentoFinto(), evidenzia: () => null });
  const code = blocco.trovaTag('code');
  assert.equal(code.textContent, veleno);
  assert.equal(code.innerHTML, '', 'senza grammatica non si passa MAI da innerHTML');
});
