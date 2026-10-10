/*
 * C5 (owner 10/10/2026, «parametrizzare E accorpare», «Testo a righe») — `notes_find` (elenco + ricerca in un attrezzo) e la
 *   mappa dei nomi accorpati (`ATTREZZI_RINOMINATI`, condizioni della CLI: contratto §7). Ogni prova ha il suo verso contrario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { trovaNote } from '../src/letture-delle-sezioni.mjs';
import { ATTREZZI_RINOMINATI, fraseAttrezzoRinominato, migraPermessiPerAttrezzo, ATTREZZI_ESTESI_OPENAI, PARAMETRI_ELENCO } from '../src/kernel/talosHarness.mjs';

const nota = (i, titolo, contenuto, giorno) => ({ id: `n${i}`, titolo, contenuto, aggiornataAlle: `2026-10-${String(giorno).padStart(2, '0')}T10:00:00.000Z` });
const NOTE = [
  nota(1, 'Zeta cancello', 'Il codice del cancello è 4471', 9),
  nota(2, 'Alfa spesa', 'Latte, pane, cancello nuovo da comprare', 3),
  nota(3, 'Beta riunione', 'Spostare la consegna', 5),
];

test('C5-NOTE-01: one tool, no overlap: the schema has query optional and the common parameters', () => {
  const nomi = ATTREZZI_ESTESI_OPENAI.map((a) => a.function.name);
  assert.ok(nomi.includes('notes_find'));
  assert.ok(!nomi.includes('notes_list') && !nomi.includes('notes_search'), 'the old names are no longer offered');
  const p = ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === 'notes_find').function.parameters;
  assert.deepEqual(p.required ?? [], [], 'query is optional: without it, it lists');
  for (const k of Object.keys(PARAMETRI_ELENCO)) assert.deepEqual(p.properties[k], PARAMETRI_ELENCO[k]);
});

test('C5-NOTE-02: without query it lists, most recent first; sort=title orders by title', () => {
  const recenti = trovaNote(NOTE, {}).split('\n');
  assert.equal(recenti[0], 'Notes: showing 3 of 3, most recently updated first.');
  assert.deepEqual(recenti.slice(1).map((r) => r.split(' — id ')[1]), ['n1', 'n3', 'n2']);
  const titoli = trovaNote(NOTE, { sort: 'title' }).split('\n');
  assert.equal(titoli[0], 'Notes: showing 3 of 3, by title.');
  assert.deepEqual(titoli.slice(1).map((r) => r.split(' — id ')[1]), ['n2', 'n3', 'n1']);
  // al contrario: «*» è come senza query, non una ricerca della parola «*»
  assert.equal(trovaNote(NOTE, { query: '*' }), trovaNote(NOTE, {}));
});

test('C5-NOTE-03: with query it searches by words, best first, with the same search as before', () => {
  const r = trovaNote(NOTE, { query: 'cancello codice' }).split('\n');
  assert.equal(r[0], 'Notes: 2 of 3 match «cancello», «codice», showing 2, best first.');
  assert.equal(r[1].split(' — id ')[1], 'n1', 'both words beat one word');
  // al contrario: niente trovato dice quante ce ne sono e come vederle
  assert.equal(trovaNote(NOTE, { query: 'zanzibar' }), 'No note contains «zanzibar». There are 3 notes in all: notes_find without query lists them, or search with other words.');
  assert.equal(trovaNote([], {}), 'There are no notes.');
});

test('C5-NOTE-04: limit + cursor page through, and the cursor of a list is refused for a search', () => {
  const molte = Array.from({ length: 7 }, (_, i) => nota(10 + i, `Nota ${i}`, `testo ${i}`, 1 + i));
  const prima = trovaNote(molte, { limit: 3 });
  const ultima = prima.split('\n').at(-1);
  assert.match(ultima, /^4 more\. Narrow with query=…, or continue with cursor=\S+$/);
  const cursore = ultima.split('cursor=')[1];
  const seconda = trovaNote(molte, { limit: 3, cursor: cursore });
  assert.deepEqual(seconda.split('\n').slice(1, 4).map((r) => r.split(' — id ')[1]), ['n13', 'n12', 'n11']);
  // al contrario: lo stesso cursore con una query è un altro elenco, e lo dice
  assert.match(trovaNote(molte, { limit: 3, cursor: cursore, query: 'testo' }), /filters changed since this cursor was issued/);
});

test('C5-NOTE-05: concise is name + excerpt + id; detailed adds when and how long', () => {
  const breve = trovaNote(NOTE, { query: 'riunione' }).split('\n')[1];
  assert.equal(breve, '- Beta riunione: Spostare la consegna — id n3');
  const lungo = trovaNote(NOTE, { query: 'riunione', response_format: 'detailed' }).split('\n')[1];
  assert.equal(lungo, '- Beta riunione: Spostare la consegna · updated 2026-10-05 10:00 · 20 characters — id n3');
});

test('C5-NOME-01: an old name says the new one and how to call it; an unknown name is not a rename', () => {
  assert.equal(fraseAttrezzoRinominato('notes_search'), 'notes_search was replaced by notes_find. Call notes_find with arguments like {"query": "words to find"}. Nothing was done.');
  assert.equal(fraseAttrezzoRinominato('notes_find'), null);
  assert.equal(fraseAttrezzoRinominato('toString'), null, 'no prototype lookup');
  for (const [vecchio, r] of Object.entries(ATTREZZI_RINOMINATI)) {
    assert.ok(ATTREZZI_ESTESI_OPENAI.some((a) => a.function.name === r.nuovo), `${vecchio} → ${r.nuovo}: the new tool exists`);
    assert.ok(!ATTREZZI_ESTESI_OPENAI.some((a) => a.function.name === vecchio), `${vecchio} is no longer offered`);
  }
});

test('C5-PERM-01: saved permissions migrate to the new name, and the stricter choice wins (a «nega» is never lost)', () => {
  assert.deepEqual(migraPermessiPerAttrezzo({ notes_list: 'sempre', notes_search: 'nega', shell: 'chiedi' }), { shell: 'chiedi', notes_find: 'nega' });
  assert.deepEqual(migraPermessiPerAttrezzo({ notes_search: 'chiedi', notes_list: 'sempre' }), { notes_find: 'chiedi' });
  // al contrario: una scelta già fatta sul nome NUOVO vince sulla migrazione; niente da migrare = identico
  assert.deepEqual(migraPermessiPerAttrezzo({ notes_find: 'sempre', notes_list: 'nega' }), { notes_find: 'sempre' });
  assert.deepEqual(migraPermessiPerAttrezzo({ shell: 'nega' }), { shell: 'nega' });
  assert.equal(migraPermessiPerAttrezzo(null), null);
});
