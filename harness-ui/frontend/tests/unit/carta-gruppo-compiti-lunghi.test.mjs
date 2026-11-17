/*
 * Long tasks, A and B (owner 13/11/2026 04:35; judge v1759 a) — the pure pieces of the permission card of several calls of the same tool
 * in one answer: the group is checked, every call is listed with its arguments (the target included), past three the rest waits under
 * «Show all», secrets stay hidden; the words in English and in Italian, with the count.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bloccoDelGruppo, gruppoDellaCarta, testoDelleRisposte, CHIAMATE_VISIBILI } from '../../src/components/carta-gruppo.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { documento, clic } from './aiuto-dom-blocchi.mjs';

const CHIAVE = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef';
const gruppoDi = (n, argomenti = (i) => ({ title: `bug ${i}` })) => ({ totale: n, chiamate: Array.from({ length: n }, (_, i) => ({ toolCallId: `c${i}`, argomenti: argomenti(i) })) });
const testi = (nodi) => nodi.map((n) => n.textContent);

test('GRUPPO-01: only a well formed group of two or more calls is a group; anything else is the card of one call', () => {
  assert.deepEqual(gruppoDellaCarta({ gruppo: gruppoDi(2) }), gruppoDi(2));
  for (const g of [undefined, null, 'x', { totale: 1, chiamate: [{ toolCallId: 'a' }] }, { totale: 3, chiamate: gruppoDi(2).chiamate },
    { totale: 2, chiamate: [{ toolCallId: 'a' }, { toolCallId: '' }] }, { totale: '2', chiamate: gruppoDi(2).chiamate }, { totale: 2, chiamate: 'x' }]) {
    assert.equal(gruppoDellaCarta({ gruppo: g }), null, JSON.stringify(g));
  }
  assert.deepEqual(gruppoDellaCarta({ gruppo: { totale: 2, chiamate: [{ toolCallId: 'a', argomenti: ['x'] }, { toolCallId: 'b', argomenti: null }] } }).chiamate.map((c) => c.argomenti), [{}, {}]);
});

test('GRUPPO-02 (judge v1759 a): EVERY call is listed with its arguments; past three the rest is folded under «Show all», which opens and closes', (t) => {
  t.after(() => impostaLingua('it'));
  impostaLingua('en');
  const doc = documento();
  const blocco = bloccoDelGruppo(doc, gruppoDi(8));
  doc.body.append(blocco);
  const voci = blocco.querySelectorAll('[role="listitem"]');
  assert.equal(voci.length, 8);
  assert.deepEqual(voci.map((v) => v.dataset.chiamata), Array.from({ length: 8 }, (_, i) => `c${i}`));
  assert.deepEqual(voci.map((v) => v.querySelector('.talos-kv__v').textContent), Array.from({ length: 8 }, (_, i) => `bug ${i}`));
  assert.deepEqual(voci.map((v) => v.hidden), [false, false, false, true, true, true, true, true]);
  const tutto = blocco.querySelector('.talos-approval__mostra-tutto');
  assert.equal(tutto.textContent, 'Show all 8');
  clic(tutto);
  assert.deepEqual(voci.map((v) => v.hidden), Array(8).fill(false));
  assert.equal(tutto.getAttribute('aria-expanded'), 'true');
  assert.equal(tutto.textContent, 'Show fewer');
  clic(tutto);
  assert.equal(voci.filter((v) => v.hidden).length, 5);
  assert.equal(blocco.getAttribute('aria-label'), 'The 8 calls this answer covers');
});

test('GRUPPO-03: three calls or fewer show everything and no «Show all»', () => {
  const doc = documento();
  for (const n of [2, CHIAMATE_VISIBILI]) {
    const blocco = bloccoDelGruppo(doc, gruppoDi(n));
    assert.equal(blocco.querySelectorAll('[role="listitem"]').filter((v) => v.hidden).length, 0);
    assert.equal(blocco.querySelector('.talos-approval__mostra-tutto'), null);
  }
});

test('GRUPPO-04: every argument of a call has its row; secrets are hidden by form and by name; a call with no arguments says so', (t) => {
  t.after(() => impostaLingua('it'));
  impostaLingua('it');
  const doc = documento();
  const blocco = bloccoDelGruppo(doc, gruppoDi(2, (i) => (i === 0 ? { file: 'src/a.js', api_key: 'qualunque', note: `chiave ${CHIAVE}` } : {})));
  const [prima, seconda] = blocco.querySelectorAll('[role="listitem"]');
  assert.equal(prima.querySelectorAll('.talos-kv').length, 3);
  assert.ok(!JSON.stringify(testi(prima.querySelectorAll('.talos-kv__v'))).includes(CHIAVE));
  assert.ok(testi(prima.querySelectorAll('.talos-kv__v')).includes('[redacted]'));
  assert.equal(seconda.querySelector('.talos-approval__chiamata-vuota').textContent, 'Nessun dettaglio');
});

test('GRUPPO-05: the words of the card, English then Italian, with the count; the note names «for this tool» only when it is there', (t) => {
  t.after(() => impostaLingua('it'));
  impostaLingua('en');
  assert.deepEqual(testoDelleRisposte(gruppoDi(5)), { conteggio: '5 calls in this reply', consentiTutte: 'Allow all 5', negaTutte: 'Deny all 5', nota: 'Your answer covers these 5 calls' });
  assert.equal(testoDelleRisposte(gruppoDi(5), { conStrumento: true }).nota, 'All 5: only these calls. For this tool: the whole session');
  impostaLingua('it');
  assert.deepEqual(testoDelleRisposte(gruppoDi(6)), { conteggio: '6 chiamate in questa risposta', consentiTutte: 'Consenti tutte e 6', negaTutte: 'Nega tutte e 6', nota: 'La risposta vale per queste 6 chiamate' });
});

/* the reviewer's ROSSO (13/11/2026): the calls were told apart by a thin line only, a field name stayed English in the Italian card,
   and a cut card did not say what it left out (judge v1778: «+N fields», English then Italian, One/Many) */
test('GRUPPO-06: every call of the list has its number, English then Italian («Call 2 of 3» / «Chiamata 2 di 3»)', (t) => {
  t.after(() => impostaLingua('it'));
  impostaLingua('en');
  const doc = documento();
  const numeri = (b) => b.querySelectorAll('[role="listitem"]').map((v) => v.querySelector('.talos-approval__chiamata-numero')?.textContent);
  assert.deepEqual(numeri(bloccoDelGruppo(doc, gruppoDi(3))), ['Call 1 of 3', 'Call 2 of 3', 'Call 3 of 3']);
  impostaLingua('it');
  assert.deepEqual(numeri(bloccoDelGruppo(doc, gruppoDi(5))), ['Chiamata 1 di 5', 'Chiamata 2 di 5', 'Chiamata 3 di 5', 'Chiamata 4 di 5', 'Chiamata 5 di 5']);
});

test('GRUPPO-07 (judge v1778): past 12 fields the card says how many it leaves out, «+N fields» / «+N campi», one and many', (t) => {
  t.after(() => impostaLingua('it'));
  const campi = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${String(i).padStart(2, '0')}`, `v${i}`]));
  const doc = documento();
  const piu = (b) => b.querySelectorAll('[role="listitem"]').map((v) => v.querySelector('.talos-approval__campi-in-piu')?.textContent ?? null);
  impostaLingua('en');
  const en = bloccoDelGruppo(doc, gruppoDi(3, (i) => campi([12, 13, 15][i])));
  assert.deepEqual(piu(en), [null, '+1 field', '+3 fields']);
  assert.deepEqual(en.querySelectorAll('[role="listitem"]').map((v) => v.querySelectorAll('.talos-kv').length), [12, 12, 12]);
  impostaLingua('it');
  assert.deepEqual(piu(bloccoDelGruppo(doc, gruppoDi(2, (i) => campi([13, 14][i])))), ['+1 campo', '+2 campi']);
});

test('GRUPPO-09: one call of 20 fields — its number, 12 rows, «+8 fields», raw names as data; its neighbour of 12 fields has no «+N»', (t) => {
  t.after(() => impostaLingua('it'));
  impostaLingua('en');
  const campi = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${String(i).padStart(2, '0')}`, `v${i}`]));
  const doc = documento();
  const [venti, dodici] = bloccoDelGruppo(doc, gruppoDi(2, (i) => campi(i === 0 ? 20 : 12))).querySelectorAll('[role="listitem"]');
  assert.equal(venti.querySelector('.talos-approval__chiamata-numero').textContent, 'Call 1 of 2');
  assert.equal(dodici.querySelector('.talos-approval__chiamata-numero').textContent, 'Call 2 of 2');
  assert.equal(venti.querySelectorAll('.talos-kv').length, 12);
  assert.equal(venti.querySelector('.talos-approval__campi-in-piu').textContent, '+8 fields');
  assert.equal(dodici.querySelector('.talos-approval__campi-in-piu'), null);
  assert.ok(venti.querySelectorAll('.talos-kv__k').every((k) => k.classList.contains('talos-kv__k--dato')), 'f00…f11 have no translation');
});

test('GRUPPO-08: a field name with no translation is shown as data (an identifier, not an English word of the card); a known one is translated', (t) => {
  t.after(() => impostaLingua('it'));
  impostaLingua('it');
  const doc = documento();
  const blocco = bloccoDelGruppo(doc, gruppoDi(2, () => ({ labels: 'bug', path: 'src/a.js' })));
  const [labels, path] = blocco.querySelectorAll('[role="listitem"]')[0].querySelectorAll('.talos-kv__k');
  assert.equal(labels.textContent, 'labels');
  assert.ok(labels.classList.contains('talos-kv__k--dato'), labels.className);
  assert.equal(labels.getAttribute('translate'), 'no');
  assert.notEqual(path.textContent, 'path');
  assert.ok(!path.classList.contains('talos-kv__k--dato'));
});
