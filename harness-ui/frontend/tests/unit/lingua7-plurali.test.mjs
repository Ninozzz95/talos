import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { creaDiffInChat } from '../../src/components/conversazione.js';
import { raggruppaInHunk } from '../../src/components/diff-hunk.js';
import { impostaLingua, t, tn } from '../../src/components/lingua.js';
import { TESTI } from '../../src/i18n/testi/index.js';
import { chiaviPluraleFisso } from './aiuto-plurali.mjs';

/*
 * ⛔⛔ LINGUA-7 (08/10/2026, bugfixer; visto dal vivo sulla 4176, nella foto della figlia che scrive un file) — l'intestazione del
 *   diff in chat diceva «Differenza in c2a-prova-figlia.txt · 1 righe», e in inglese «1 lines»: il numero accanto a un plurale
 *   FISSO. Il plurale ora lo sceglie il numero (`tn`, Intl.PluralRules) fra le due voci `…One`/`…Many` della lingua.
 *   Curate qui: il titolo del diff, i punti nascosti del diff, la riga «altre N righe» dell'esito, l'etichetta d'accessibilità
 *   «N righe aggiunte, M tolte». Le altre frasi con lo stesso difetto di forma sono il debito elencato in
 *   `lingua7-plurali-debito.json`: il cancello qui sotto non ne lascia entrare di nuove.
 */
function nodoFinto(tag) {
  const nodo = {
    tag, figli: [], classi: new Set(), testoProprio: null, open: false,
    get className() { return [...nodo.classi].join(' '); },
    set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get textContent() { return nodo.testoProprio !== null ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(''); },
    set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; },
    setAttribute() {}, getAttribute: () => null, addEventListener() {},
    append: (...x) => nodo.figli.push(...x),
    tutti(classe, dentro = []) {
      if (nodo.classi.has(classe)) dentro.push(nodo);
      for (const f of nodo.figli) f.tutti?.(classe, dentro);
      return dentro;
    },
    trovaTag(t) { return nodo.tag === t ? nodo : nodo.figli.map((f) => f.trovaTag?.(t)).find(Boolean) || null; },
  };
  return nodo;
}
const documentoFinto = () => ({
  createElement: (tag) => nodoFinto(tag),
  createTextNode: (testo) => ({ tag: '#text', textContent: String(testo), figli: [], tutti: () => [], trovaTag: () => null }),
});
const titoloDelDiff = (righe, opzioni) => creaDiffInChat(raggruppaInHunk(righe, opzioni), { percorso: 'note.txt', document: documentoFinto() })
  .trovaTag('summary').textContent;

for (const [lingua, uno, molti] of [['it', '· 1 riga', '· 3 righe'], ['en', '· 1 line', '· 3 lines']]) {
  test(`LINGUA-7-01 (${lingua}) — il titolo del diff: «${uno}» con una riga, «${molti}» con tre`, (prova) => {
    impostaLingua(lingua);
    prova.after(() => impostaLingua('it'));
    assert.ok(titoloDelDiff([['add', 'scritto dalla figlia']]).endsWith(uno), titoloDelDiff([['add', 'scritto dalla figlia']]));
    assert.ok(titoloDelDiff([['add', 'a'], ['add', 'b'], ['add', 'c']]).endsWith(molti));
  });
}

test('LINGUA-7-02 — un solo punto nascosto, di una riga: la frase intera è al singolare, nelle due lingue', (prova) => {
  prova.after(() => impostaLingua('it'));
  // due modifiche lontane, una riga ciascuna: col tetto a 1 la seconda resta fuori
  const righe = [['add', 'prima'], ...Array.from({ length: 30 }, (_, i) => ['ctx', `riga ${i}`]), ['add', 'seconda']];
  const resto = (lingua) => {
    impostaLingua(lingua);
    return creaDiffInChat(raggruppaInHunk(righe, { contesto: 0, tetto: 1 }), { document: documentoFinto() })
      .tutti('talos-diff-chat__resto')[0]?.textContent;
  };
  assert.match(resto('it'), /^Un altro punto del file non è mostrato qui \(1 riga\)\./u);
  assert.match(resto('en'), /^One more location in the file is not shown here \(1 line\)\./u);
});

test('LINGUA-7-03 — «altre N righe» dell\'esito e l\'etichetta «N aggiunte, M tolte»: il plurale segue ogni numero', (prova) => {
  prova.after(() => impostaLingua('it'));
  const riassunto = (piu, meno) => t('chat.activity.diffSummary', {
    aggiunte: tn('chat.activity.linesAddedOne', 'chat.activity.linesAddedMany', piu),
    tolte: tn('chat.activity.linesRemovedOne', 'chat.activity.linesRemovedMany', meno),
  });
  const altre = (n) => tn('app.activity.moreLinesOne', 'app.activity.moreLinesMany', n, { nascoste: n, totale: n + 40 });
  impostaLingua('it');
  assert.equal(riassunto(1, 3), '1 riga aggiunta, 3 tolte');
  assert.equal(riassunto(2, 1), '2 righe aggiunte, 1 tolta');
  assert.equal(altre(1), 'Un’altra riga non è mostrata qui (in tutto 41).');
  assert.equal(altre(5), 'Altre 5 righe non sono mostrate qui (in tutto 45).');
  impostaLingua('en');
  assert.equal(riassunto(1, 3), '1 line added, 3 removed');
  assert.equal(altre(1), 'One more line is not shown here (41 in total).');
  assert.equal(altre(5), 'Another 5 lines are not shown here (45 in total).');
});

/*
 * ⛔ IL CANCELLO, a cricchetto: ogni frase inglese con un numero davanti a un plurale fisso deve stare nel debito di oggi, e ogni
 *   voce del debito deve esistere ancora con quella forma. Una frase nuova così non entra; una curata va tolta dal debito (il
 *   cricchetto scende e non risale). Per curarne una: due voci `…One`/`…Many` e `tn()` dove si chiama.
 */
test('LINGUA-7-04 — cancello: nessuna frase NUOVA con un numero davanti a un plurale fisso, e il debito scende soltanto', () => {
  const qui = path.dirname(fileURLToPath(import.meta.url));
  const debito = new Set(JSON.parse(readFileSync(path.join(qui, 'lingua7-plurali-debito.json'), 'utf8')));
  const oggi = chiaviPluraleFisso(TESTI.en);
  const nuove = oggi.filter((k) => !debito.has(k));
  assert.deepEqual(nuove, [], `frasi nuove con un plurale fisso dopo un numero (usare …One/…Many e tn()): ${nuove.join(', ')}`);
  const curate = [...debito].filter((k) => !oggi.includes(k));
  assert.deepEqual(curate, [], `voci curate ancora nel debito: toglierle da lingua7-plurali-debito.json: ${curate.join(', ')}`);
});
