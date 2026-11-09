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

/* Rossa della suite del blocco 24 (LINGUA-7-04), classificata il 01/11/2026 sera: DIFETTO. La riga della scheda video lenta (FE-050, `a3453c50e`) diceva
   «{adesso} tokens per second» e «{migliore} tokens per second» con il plurale fisso: «1 tokens per second» quando la scheda va a un token al secondo. */
test('LINGUA-7-05 — la scheda lenta: il plurale segue il numero, nelle due lingue', async (prova) => {
  prova.after(() => impostaLingua('it'));
  const { testiSchedaLenta } = await import('../../src/components/context-separator.js');
  const v = (adesso, migliore) => testiSchedaLenta({ adesso, migliore, modello: 'm', scheda: 'GPU', versione: 'b1' });
  impostaLingua('en');
  assert.equal(v(1, 40).riga, 'The graphics card is slower than usual: 1 token per second instead of 40. Restarting the PC usually brings it back to full speed.');
  assert.equal(v(12, 40).riga, 'The graphics card is slower than usual: 12 tokens per second instead of 40. Restarting the PC usually brings it back to full speed.');
  assert.equal(v(0, 1).dettagli, 'm on GPU, engine b1. The best speed seen on this PC was 1 token per second.');
  assert.equal(v(0, 40).dettagli, 'm on GPU, engine b1. The best speed seen on this PC was 40 tokens per second.');
  impostaLingua('it');
  assert.equal(v(1, 40).riga, 'La scheda video va più piano del solito: 1 token al secondo invece di 40. Riavviare il PC di solito la riporta alla velocità piena.');
  assert.equal(v(0, 1).dettagli, 'm su GPU, motore b1. La velocità migliore vista su questo PC era 1 token al secondo.');
});

/* Rossa della suite del blocco computer use (LINGUA-7-04), 05/11/2026: la riga dei dati locali (0e6cdf514) diceva «{n} items» con il plurale fisso.
   Oggi compare solo da 2 in su, ma la frase non deve dipendere da chi la chiama: due voci `…One`/`…Many` e `tn()`. */
test('LINGUA-7-06 — i dati locali: «1 item» e «3 items», «1 voce» e «3 voci»', (prova) => {
  prova.after(() => impostaLingua('it'));
  const voci = (n) => tn('app.settings.localData.itemsOne', 'app.settings.localData.itemsMany', n);
  impostaLingua('en');
  assert.deepEqual([voci(1), voci(3)], ['1 item', '3 items']);
  impostaLingua('it');
  assert.deepEqual([voci(1), voci(3)], ['1 voce', '3 voci']);
  const sorgente = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/legacy/app.js'), 'utf8');
  assert.match(sorgente, /trn\('app\.settings\.localData\.itemsOne', 'app\.settings\.localData\.itemsMany', quante\)/u, 'la pagina sceglie il plurale con tn()');
});
