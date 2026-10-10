/*
 * C5 (owner 10/10/2026, «parametrizzare E accorpare», «Testo a righe») — `memory_find`: `memory_list` + `memory_search` in un
 *   attrezzo, sopra la lettura comune delle sezioni (`trovaInSezione`), col filtro `kind` del contratto §2. Ogni prova ha il
 *   suo verso contrario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { trovaMemorie } from '../src/letture-delle-sezioni.mjs';
import { bloccoDelleMemorie } from '../src/memorie-nel-prompt.mjs';
import { ATTREZZI_ESTESI_OPENAI, PARAMETRI_ELENCO, fraseAttrezzoRinominato } from '../src/kernel/talosHarness.mjs';

const memoria = (i, titolo, contenuto, genere, giorno) => ({ id: `m${i}`, titolo, contenuto, genere,
  aggiornataAlle: `2026-10-${String(giorno).padStart(2, '0')}T10:00:00.000Z` });
const MEMORIE = [
  memoria(1, 'Lingua', 'Rispondi sempre in italiano', 'preference', 9),
  memoria(2, 'Porta del server', 'Il server vero è il 4174, quello di prova il 4177', 'project_fact', 3),
  memoria(3, 'Commit', 'I messaggi di commit si scrivono in inglese', 'policy_note', 5),
];
const ids = (testo) => testo.split('\n').filter((r) => r.startsWith('- ')).map((r) => r.split(' — id ')[1]);

test('C5-MEM-01: one tool, no overlap: query optional, kind with the four kinds, the common parameters', () => {
  const nomi = ATTREZZI_ESTESI_OPENAI.map((a) => a.function.name);
  assert.ok(nomi.includes('memory_find'));
  assert.ok(!nomi.includes('memory_list') && !nomi.includes('memory_search'), 'the old names are no longer offered');
  const p = ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === 'memory_find').function.parameters;
  assert.deepEqual(p.required ?? [], []);
  assert.deepEqual(p.properties.kind.enum, ['preference', 'project_fact', 'procedure', 'policy_note']);
  for (const k of Object.keys(PARAMETRI_ELENCO)) assert.deepEqual(p.properties[k], PARAMETRI_ELENCO[k]);
  // al contrario: nessuna descrizione di una scrittura nomina più i nomi vecchi
  for (const nome of ['memory_update', 'memory_delete']) {
    const json = JSON.stringify(ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === nome));
    assert.ok(json.includes('memory_find') && !/memory_(list|search)/u.test(json), nome);
  }
});

test('C5-MEM-02: without query it lists with the full text, most recent first, as memory_list did', () => {
  const tutte = trovaMemorie(MEMORIE, {});
  assert.equal(tutte.split('\n')[0], 'Memory: showing 3 of 3, most recently updated first.');
  assert.deepEqual(ids(tutte), ['m1', 'm3', 'm2']);
  assert.equal(tutte.split('\n')[1], '- Lingua: Rispondi sempre in italiano — id m1');
  const lunga = memoria(9, 'Lunga', 'x'.repeat(600), 'preference', 1);
  assert.match(trovaMemorie([lunga], {}), new RegExp(`: ${'x'.repeat(500)}… — id m9$`), 'the text up to 500 characters');
  // al contrario: vuota lo dice, e dice come salvare
  assert.equal(trovaMemorie([], {}), 'Nothing is remembered yet. memory_write saves something when the person asks you to remember it.');
});

test('C5-MEM-03: with query it searches by words; kind filters first', () => {
  const r = trovaMemorie(MEMORIE, { query: 'server porta' });
  assert.equal(r.split('\n')[0], 'Memory: 1 of 3 match «server», «porta», showing 1, best first.');
  assert.deepEqual(ids(r), ['m2']);
  assert.deepEqual(ids(trovaMemorie(MEMORIE, { kind: 'policy_note' })), ['m3']);
  assert.equal(trovaMemorie(MEMORIE, { kind: 'procedure' }), 'No procedure is remembered.');
  // al contrario: la ricerca fra le preferenze non trova la porta, e dice quante ce ne sono col filtro
  assert.equal(trovaMemorie(MEMORIE, { query: 'server', kind: 'preference' }),
    'No memory contains «server». There is 1 memory (kind=preference) in all: memory_find without query lists it, or search with other words.');
});

test('C5-MEM-04: an unknown kind does not filter, and says the valid ones; «rule» means policy_note', () => {
  const ignoto = trovaMemorie(MEMORIE, { kind: 'segreti' });
  assert.deepEqual(ids(ignoto), ['m1', 'm3', 'm2']);
  assert.match(ignoto, /\nkind "segreti" is unknown and was ignored\. Valid: preference, project_fact, procedure, policy_note\.$/);
  assert.deepEqual(ids(trovaMemorie(MEMORIE, { kind: 'rule' })), ['m3']);
});

test('C5-MEM-05: concise is title + text + id; detailed adds the kind and when; the cursor carries the kind', () => {
  assert.equal(trovaMemorie(MEMORIE, { response_format: 'detailed' }).split('\n')[1],
    '- Lingua: Rispondi sempre in italiano · preference · updated 2026-10-09 10:00 — id m1');
  // review C5 passo 6 (bugfixer): una memoria vecchia senza tipo non si spaccia per «preference», che il filtro non le darebbe
  const senzaTipo = { ...memoria(8, 'Vecchia', 'senza tipo', undefined, 2) };
  assert.match(trovaMemorie([senzaTipo], { response_format: 'detailed' }), / · kind unknown · updated /);
  assert.equal(trovaMemorie([senzaTipo], { kind: 'preference' }), 'No preference is remembered.');
  const molte = Array.from({ length: 5 }, (_, i) => memoria(10 + i, `Fatto ${i}`, `testo ${i}`, 'project_fact', 1 + i));
  const ultima = trovaMemorie(molte, { limit: 2 }).split('\n').at(-1);
  const cursore = ultima.split('cursor=')[1];
  assert.deepEqual(ids(trovaMemorie(molte, { limit: 2, cursor: cursore })), ['m12', 'm11']);
  // al contrario: lo stesso cursore con un kind diverso è un altro elenco
  assert.match(trovaMemorie(molte, { limit: 2, cursor: cursore, kind: 'project_fact' }), /filters changed since this cursor was issued/);
});

test('C5-MEM-06: the memories in the prompt point to memory_find, and the old names say the new one', () => {
  const blocco = bloccoDelleMemorie(MEMORIE);
  assert.match(blocco, /memory_find shows them all or finds them by words/u);
  assert.ok(!/memory_(list|search)/u.test(blocco), 'no old name left in the prompt');
  assert.equal(fraseAttrezzoRinominato('memory_list'), 'memory_list was replaced by memory_find. Call memory_find with arguments like {"limit": 20}. Nothing was done.');
  assert.match(fraseAttrezzoRinominato('memory_search'), /^memory_search was replaced by memory_find\./);
});
