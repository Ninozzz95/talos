/*
 * C5 (owner 10/10/2026) — il contratto comune degli elenchi: `src/elenco-paginato.mjs`, contratto
 * `.claude/CONTRATTO-C5-ATTREZZI-BOZZA-2026-10-10.md` §1. Ogni prova ha il suo verso contrario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_PREDEFINITO, LIMITE_MASSIMO, leggiParametriElenco, paginaDa, testoElenco, codificaCursore, decodificaCursore,
  improntaFiltri, confrontaChiavi,
} from '../src/elenco-paginato.mjs';

const voci = (n) => Array.from({ length: n }, (_, i) => ({ id: `v${String(i).padStart(3, '0')}`, quando: 1000 + i }));
const chiaveDi = (v) => [v.quando, v.id];
const ATT = 'notes_find';

test('C5-EL-01: defaults are small and stated; above 100 is clamped and the note says so', () => {
  assert.equal(LIMITE_PREDEFINITO, 20);
  assert.equal(LIMITE_MASSIMO, 100);
  assert.deepEqual(leggiParametriElenco({}), { limite: 20, formato: 'concise', ordine: null, cursore: null, note: [] });
  const grande = leggiParametriElenco({ limit: 500 });
  assert.equal(grande.limite, 100);
  assert.match(grande.note.join(' '), /limit was reduced to 100/);
  // al contrario: valori non validi tornano al predefinito senza note inventate
  for (const l of [0, -3, 'tanti', null]) assert.equal(leggiParametriElenco({ limit: l }).limite, 20);
  assert.equal(leggiParametriElenco({ limit: 7.9 }).limite, 7);
});

test('C5-EL-02: response_format and sort fall back with an actionable note, never silently', () => {
  const r = leggiParametriElenco({ response_format: 'brief', sort: 'size' }, { ordini: ['recent', 'name'], ordinePredefinito: 'recent' });
  assert.equal(r.formato, 'concise');
  assert.equal(r.ordine, 'recent');
  assert.match(r.note.join(' '), /response_format "brief" is unknown/);
  assert.match(r.note.join(' '), /sort "size" is unknown: used "recent". Valid: recent, name/);
  // al contrario: valori validi passano senza note
  assert.deepEqual(leggiParametriElenco({ response_format: 'detailed', sort: 'name' }, { ordini: ['recent', 'name'], ordinePredefinito: 'recent' }).note, []);
});

test('C5-EL-03: pages chain through the cursor and cover every item exactly once', () => {
  const tutte = voci(45);
  const viste = [];
  let cursore = null;
  for (let giro = 0; giro < 10; giro += 1) {
    const p = paginaDa(tutte, { attrezzo: ATT, filtri: { query: 'x' }, chiaveDi, limite: 20, cursore });
    assert.equal(p.ok, true);
    viste.push(...p.pagina.map((v) => v.id));
    if (!p.has_more) { assert.equal(p.next_cursor, null); break; }
    cursore = p.next_cursor;
  }
  assert.deepEqual(viste, tutte.map((v) => v.id));
});

test('C5-EL-04: an item added or removed between two pages neither skips nor repeats (why the owner chose a cursor)', () => {
  const tutte = voci(30);
  const prima = paginaDa(tutte, { attrezzo: ATT, filtri: {}, chiaveDi, limite: 10, cursore: null });
  // fra le due chiamate: sparisce una voce GIÀ vista e ne compare una nuova in testa (più vecchia di tutte)
  const dopo = [{ id: 'nuova', quando: 1 }, ...tutte.filter((v) => v.id !== 'v003')];
  const seconda = paginaDa(dopo, { attrezzo: ATT, filtri: {}, chiaveDi, limite: 10, cursore: prima.next_cursor });
  assert.deepEqual(seconda.pagina.map((v) => v.id), tutte.slice(10, 20).map((v) => v.id), 'continues right after the last seen item');
  // al contrario: con la SOLA sparizione di una voce già vista, uno scostamento numerico salta v010; il cursore no
  const senzaUna = tutte.filter((v) => v.id !== 'v003');
  assert.equal(senzaUna.slice(10, 20)[0].id, 'v011', 'an offset would skip v010');
  const conCursore = paginaDa(senzaUna, { attrezzo: ATT, filtri: {}, chiaveDi, limite: 10, cursore: prima.next_cursor });
  assert.equal(conCursore.pagina[0].id, 'v010', 'the cursor does not');
  // e se sparisce proprio l'ULTIMA voce vista (v009), si prosegue da v010: non si ricomincia da capo
  const senzaUltima = tutte.filter((v) => v.id !== 'v009');
  const dopoUltima = paginaDa(senzaUltima, { attrezzo: ATT, filtri: {}, chiaveDi, limite: 10, cursore: prima.next_cursor });
  assert.equal(dopoUltima.pagina[0].id, 'v010', 'the last seen item vanished: continue after its key');
});

test('C5-EL-05: a cursor reused with other filters, from another tool, or damaged is refused with an actionable note', () => {
  const c = codificaCursore({ attrezzo: ATT, chiave: [1005, 'v005'], filtri: { status: 'open' } });
  assert.deepEqual(decodificaCursore(c, { attrezzo: ATT, filtri: { status: 'open' } }), { ok: true, chiave: [1005, 'v005'] });
  assert.match(decodificaCursore(c, { attrezzo: ATT, filtri: { status: 'done' } }).nota, /filters changed since this cursor was issued/);
  assert.match(decodificaCursore(c, { attrezzo: 'tasks_find', filtri: { status: 'open' } }).nota, /belongs to notes_find, not tasks_find/);
  for (const rotto of ['abc', '', 'eyJ2Ijo5fQ']) assert.match(decodificaCursore(rotto, { attrezzo: ATT, filtri: {} }).nota, /not valid/);
  // la pagina rifiutata non è un errore che rompe: è una nota che dice cosa rifare
  const p = paginaDa(voci(5), { attrezzo: ATT, filtri: { status: 'done' }, chiaveDi, limite: 2, cursore: c });
  assert.equal(p.ok, false);
  assert.match(p.nota, /Call notes_find again without cursor/);
});

test('C5-EL-06: the filter fingerprint ignores empty filters and key order, and changes with a value', () => {
  assert.equal(improntaFiltri({ a: 1, b: 'x' }), improntaFiltri({ b: 'x', a: 1 }));
  assert.equal(improntaFiltri({ a: 1, b: '' , c: null, d: undefined }), improntaFiltri({ a: 1 }));
  assert.notEqual(improntaFiltri({ a: 1 }), improntaFiltri({ a: 2 }));
});

test('C5-EL-07: the answer is text lines (owner 10/10): header, one line per item, notes, and the cursor line only when there is more', () => {
  const p = paginaDa(voci(25), { attrezzo: ATT, filtri: {}, chiaveDi, limite: 20, cursore: null });
  const t = testoElenco({ testa: 'Notes: showing 20 of 25, most recent first.', righe: p.pagina.map((v) => `${v.id} — id ${v.id}`), has_more: p.has_more,
    next_cursor: p.next_cursor, restanti: p.restanti, note: ['limit was reduced to 100, the maximum.'], suggerimentoFiltro: 'query=…' });
  const righe = t.split('\n');
  assert.equal(righe[0], 'Notes: showing 20 of 25, most recent first.');
  assert.equal(righe.filter((r) => r.startsWith('- ')).length, 20);
  assert.equal(righe.at(-2), 'limit was reduced to 100, the maximum.', 'notes before the last line');
  assert.equal(righe.at(-1), `5 more. Narrow with query=…, or continue with cursor=${p.next_cursor}`, 'the cursor verbatim on the last line');
  // al contrario: l'ultima pagina non ha la riga del cursore, nemmeno se qualcuno passa un cursore
  const ultima = testoElenco({ testa: 'Notes: showing 1 of 1.', righe: ['x'], has_more: false, next_cursor: 'non-deve-uscire' });
  assert.equal(ultima, 'Notes: showing 1 of 1.\n- x');
});

test('C5-EL-08: keys compare as tuples, numbers as numbers', () => {
  assert.equal(confrontaChiavi([2, 'a'], [10, 'a']), -1, '2 < 10 as numbers, not as strings');
  assert.equal(confrontaChiavi([5, 'b'], [5, 'a']), 1);
  assert.equal(confrontaChiavi([5, 'a'], [5, 'a']), 0);
  assert.equal(confrontaChiavi([5], [5, 'a']), -1);
});

test('C5-EL-09: a limit out of range is said, not silently replaced (review C5); an absent limit says nothing', async () => {
  const { leggiParametriElenco: lp } = await import('../src/elenco-paginato.mjs');
  assert.deepEqual(lp({ limit: 0 }).note, ['limit must be between 1 and 100: used 20.']);
  assert.deepEqual(lp({ limit: -3 }).note, ['limit must be between 1 and 100: used 20.']);
  assert.deepEqual(lp({}).note, []);
});
