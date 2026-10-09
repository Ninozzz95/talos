import test from 'node:test';
import assert from 'node:assert/strict';
import { renderizzaMarkdown } from '../../src/components/markdown.js';

/*
 * 08/10/2026 (bugfixer, da una foto dal vivo) — `call_shell_1.log` in una risposta della chat usciva «call*shell*1.log», col
 *   pezzo fra i trattini bassi in corsivo. CommonMark 0.31.2 (spec.commonmark.org, §6.2, regole 2 e 4, esempio 374, letta
 *   l'08/10/2026): un `_` apre il corsivo solo se non sta DENTRO una parola (non preceduto da lettera o cifra) e lo chiude solo
 *   se non è seguito da lettera o cifra — «Intraword emphasis is disallowed for `_`». I nomi snake_case, i file e le variabili
 *   d'ambiente nelle risposte dei modelli sono esattamente questo caso.
 * ⛔ Il `*` resta com'era: CommonMark ammette `*` dentro le parole (regole 1 e 3).
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
const corsivi = (testo) => {
  const fuori = [];
  const giro = (n) => (n.figli || []).forEach((f) => { if (f.tag === 'em') fuori.push(f.textContent); giro(f); });
  giro(renderizzaMarkdown(testo, { document: documentoFinto() }));
  return fuori;
};
const testoDi = (testo) => renderizzaMarkdown(testo, { document: documentoFinto() }).textContent;

test('MD-TRATTINO-01: un `_` DENTRO una parola non fa corsivo (il caso della foto, snake_case, variabili)', () => {
  for (const testo of ['Output file: C:\\x\\call_shell_1.log', 'usa snake_case_name qui', 'la variabile TALOS_DESKTOP_DATA_DIR', '__init__.py', 'è_x_y', 'nome_file_ fine', 'apre _x_y']) {
    assert.deepEqual(corsivi(testo), [], `nessun corsivo in «${testo}»`);
  }
  assert.equal(testoDi('Output file: call_shell_1.log'), 'Output file: call_shell_1.log', 'il testo resta intero, trattini compresi');
});

test('MD-TRATTINO-02 AL CONTRARIO: `_parola_` fra spazi o punteggiatura resta corsivo; `*` dentro le parole pure', () => {
  assert.deepEqual(corsivi('una _parola_ in corsivo'), ['parola']);
  assert.deepEqual(corsivi('_inizio_ di riga'), ['inizio']);
  assert.deepEqual(corsivi('(vedi _qui_).'), ['qui']);
  assert.deepEqual(corsivi('due _parole insieme_ qui'), ['parole insieme']);
  assert.deepEqual(corsivi('un*po*così'), ['po'], 'CommonMark ammette `*` dentro una parola');
});
