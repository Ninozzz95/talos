import test from 'node:test';
import assert from 'node:assert/strict';
import { analizzaDiffUnificato, raggruppaVoci, letteraStato, GRUPPI } from '../../src/components/scheda-github.js';

/* F6-1 (26/09/2026) — le parti pure della scheda «GitHub»: il diff di git nella forma a pezzi della chat, i quattro gruppi, la lettera. */

test('GITHUB-DIFF-01: il formato unificato diventa pezzi con le righe del file NUOVO, e i numeri di riga veri', () => {
  const testo = [
    'diff --git a/a.js b/a.js', 'index 1..2 100644', '--- a/a.js', '+++ b/a.js',
    '@@ -10,3 +10,4 @@ function f() {', ' uno', '-due', '+DUE', '+tre', ' quattro',
    '@@ -40 +41 @@', '-vecchia', '+nuova',
    '\\ No newline at end of file', '',
  ].join('\n');
  const { pezzi, aggiunte, rimozioni } = analizzaDiffUnificato(testo);
  assert.equal(pezzi.length, 2);
  assert.deepEqual([pezzi[0].daRiga, pezzi[0].aRiga], [10, 13]);
  assert.deepEqual(pezzi[0].righe.map((r) => `${r.tipo}:${r.numero}:${r.testo}`), ['ctx:10:uno', 'del:11:due', 'add:11:DUE', 'add:12:tre', 'ctx:13:quattro']);
  // «@@ -40 +41 @@» senza conteggio vuol dire UNA riga
  assert.deepEqual([pezzi[1].daRiga, pezzi[1].aRiga], [41, 41]);
  assert.deepEqual(pezzi[1].righe.map((r) => r.tipo), ['del', 'add'], 'la riga «\\ No newline» non è contenuto');
  // qui i due file sono sfasati di una riga: la tolta porta il numero del VECCHIO (40), l'aggiunta quello del nuovo (41)
  assert.deepEqual(pezzi[1].righe.map((r) => `${r.tipo}:${r.numero}`), ['del:40', 'add:41']);
  assert.equal(aggiunte, 3);
  assert.equal(rimozioni, 2);
  assert.ok(pezzi.every((p) => p.righe.every((r) => !r.testo.startsWith('@@'))), 'l\'intestazione di git non finisce fra le righe');
});

test('GITHUB-DIFF-02: un pezzo che toglie soltanto non ha righe del file nuovo; il testo vuoto non ha pezzi', () => {
  const { pezzi } = analizzaDiffUnificato('@@ -5,2 +4,0 @@\n-a\n-b\n');
  assert.equal(pezzi[0].daRiga, null);
  assert.equal(pezzi[0].aRiga, null);
  assert.deepEqual(analizzaDiffUnificato('').pezzi, []);
  assert.deepEqual(analizzaDiffUnificato(null).pezzi, []);
});

test('GITHUB-GRUPPI-01: i quattro gruppi di VS Code, nell\'ordine; un file preparato e poi cambiato sta in DUE gruppi', () => {
  assert.deepEqual(GRUPPI.map((g) => g.chiave), ['conflitti', 'preparati', 'modificati', 'nuovi']);
  const g = raggruppaVoci([
    { percorso: 'c.js', conflitto: true, staged: false, nonStaged: false, tipo: 'conflitto' },
    { percorso: 'p.js', staged: true, nonStaged: false, tipo: 'modificato' },
    { percorso: 'pm.js', staged: true, nonStaged: true, tipo: 'modificato' },
    { percorso: 'm.js', staged: false, nonStaged: true, tipo: 'modificato' },
    { percorso: 'n.txt', staged: false, nonStaged: true, tipo: 'nonTracciato' },
    { percorso: 'i.log', staged: false, nonStaged: false, tipo: 'ignorato' },
  ]);
  assert.deepEqual(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((x) => x.percorso)])), {
    conflitti: ['c.js'], preparati: ['p.js', 'pm.js'], modificati: ['pm.js', 'm.js'], nuovi: ['n.txt'],
  });
  assert.deepEqual(raggruppaVoci(undefined), { conflitti: [], preparati: [], modificati: [], nuovi: [] });
});

test('GITHUB-LETTERA-01: la lettera viene dall\'indice per i preparati e dall\'albero per i modificati', () => {
  const voce = { x: 'A', y: 'M' };
  assert.equal(letteraStato(voce, 'preparati').lettera, 'A');
  assert.equal(letteraStato(voce, 'modificati').lettera, 'M');
  assert.equal(letteraStato({ x: 'R', y: ' ' }, 'preparati').parola, 'rinominato');
  assert.equal(letteraStato({ x: '?', y: '?' }, 'nuovi').lettera, 'U');
  assert.equal(letteraStato({ x: 'U', y: 'U' }, 'conflitti').lettera, '!');
  assert.equal(letteraStato({ x: ' ', y: 'Z' }, 'modificati').lettera, 'M', 'una lettera che non conosciamo non diventa una lettera inventata');
});

/* F6-3 (27/09/2026) — il riepilogo dei controlli di una PR: gli esiti presenti, dal più importante, con la frase nella lingua. */
test('GITHUB-PR-CONTROLLI: gli esiti presenti in ordine d\'importanza, e la frase al singolare e al plurale nelle due lingue', async () => {
  const { riassuntoControlli, fraseControlli, ESITI_CONTROLLO } = await import('../../src/components/scheda-github.js');
  const { impostaLingua } = await import('../../src/components/lingua.js');
  assert.deepEqual(ESITI_CONTROLLO, ['fallito', 'in-corso', 'annullato', 'passato', 'saltato']);
  const conteggi = { passati: 3, falliti: 1, inCorso: 0, saltati: 2, annullati: 0 };
  assert.deepEqual(riassuntoControlli(conteggi), [{ esito: 'fallito', n: 1 }, { esito: 'passato', n: 3 }, { esito: 'saltato', n: 2 }]);
  assert.deepEqual(riassuntoControlli(null), []);
  assert.deepEqual(riassuntoControlli({ passati: 0, falliti: 0, inCorso: 0, saltati: 0, annullati: 0 }), []);
  impostaLingua('it');
  assert.equal(fraseControlli(conteggi), '1 fallito, 3 passati, 2 saltati');
  assert.equal(fraseControlli({ inCorso: 2, annullati: 1 }), '2 in corso, 1 annullato');
  impostaLingua('en');
  assert.equal(fraseControlli(conteggi), '1 failed, 3 passed, 2 skipped');
  impostaLingua('it');
});
