import test from 'node:test';
import assert from 'node:assert/strict';
import { renderizzaMarkdown } from '../../src/components/markdown.js';

/*
 * 09/10/2026 (bugfixer; visto dal collega nella prova dal vivo della 4B con glm-5.3-flash) — una risposta della chat mostrava
 *   `\<argomento\>` con le barre. CommonMark 0.31.2 (spec.commonmark.org, §2.4 «Backslash escapes», letta il 09/10/2026): «Any
 *   ASCII punctuation character may be backslash-escaped», e il segno vale come carattere letterale, quindi non forma markup;
 *   «Backslash escapes do not work in code blocks, code spans, autolinks, or raw HTML». Una barra davanti a qualunque altra cosa
 *   resta una barra: i percorsi Windows con lettere dopo la barra non cambiano.
 */
function documentoFinto() {
  const nodo = (tag) => {
    const n = { tag, figli: [], testoProprio: null, attributi: new Map(),
      get textContent() { return n.testoProprio !== null ? n.testoProprio : n.figli.map((f) => f.textContent).join(''); },
      set textContent(v) { n.testoProprio = String(v); n.figli = []; },
      set innerHTML(_v) {}, get innerHTML() { return ''; },
      appendChild: (f) => { n.figli.push(f); return f; }, append: (...f) => n.figli.push(...f),
      setAttribute: (k, v) => n.attributi.set(k, String(v)), getAttribute: (k) => n.attributi.get(k) ?? null,
      className: '', style: {} };
    return n;
  };
  return { createElement: nodo, createDocumentFragment: () => nodo('#fragment'),
    createTextNode: (t) => ({ tag: '#text', figli: [], testo: String(t), get textContent() { return this.testo; } }) };
}
const albero = (testo) => renderizzaMarkdown(testo, { document: documentoFinto() });
const testoDi = (testo) => albero(testo).textContent;
const tagDi = (testo, tag) => { const fuori = []; const giro = (n) => (n.figli || []).forEach((f) => { if (f.tag === tag) fuori.push(f.textContent); giro(f); }); giro(albero(testo)); return fuori; };

test('MD-ESCAPE-01: il caso della foto — `\\<argomento\\>` si legge `<argomento>`', () => {
  assert.equal(testoDi('Usa \\<argomento\\> qui'), 'Usa <argomento> qui');
});

test('MD-ESCAPE-02: un segno con la barra non forma markup — `\\*non corsivo\\*` resta testo, e il corsivo vero c\u2019è ancora', () => {
  assert.deepEqual(tagDi('\\*non corsivo\\* e *corsivo*', 'em'), ['corsivo']);
  assert.equal(testoDi('\\*non corsivo\\* e *corsivo*'), '*non corsivo* e corsivo');
  assert.deepEqual(tagDi('\\_x\\_', 'em'), []);
  assert.equal(testoDi('\\_x\\_'), '_x_');
});

test('MD-ESCAPE-03: AL CONTRARIO — negli span di codice la barra resta (CommonMark §2.4)', () => {
  assert.deepEqual(tagDi('codice `a\\<b` resta', 'code'), ['a\\<b']);
});

test('MD-ESCAPE-04: dentro il grassetto l\u2019escape vale ancora', () => {
  assert.deepEqual(tagDi('**x\\_y** forte', 'strong'), ['x_y']);
});

test('MD-ESCAPE-05: AL CONTRARIO — una barra davanti a una lettera, a una cifra o in fondo resta com\u2019è', () => {
  for (const testo of ['percorso C:\\Users\\persona resta', 'fine riga \\', 'il file C:\\x\\call_shell_1.log', 'a\\1b']) {
    assert.equal(testoDi(testo), testo, `invariato: «${testo}»`);
  }
});
