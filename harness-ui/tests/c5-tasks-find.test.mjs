/*
 * C5 (owner 10/10/2026, «parametrizzare E accorpare», «Testo a righe») — `tasks_find`: `tasks_list` + `tasks_search` in un
 *   attrezzo, sopra la stessa lettura comune delle note (`trovaInSezione`). Ogni prova ha il suo verso contrario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { trovaAttivita } from '../src/letture-delle-sezioni.mjs';
import { ATTREZZI_ESTESI_OPENAI, PARAMETRI_ELENCO, fraseAttrezzoRinominato, migraPermessiPerAttrezzo } from '../src/kernel/talosHarness.mjs';

const attivita = (i, titolo, stato, giorno, extra = {}) => ({ id: `t${i}`, titolo, stato, priorita: 'normal', descrizione: null,
  aggiornataAlle: `2026-10-${String(giorno).padStart(2, '0')}T10:00:00.000Z`, ...extra });
const ATTIVITA = [
  attivita(1, 'Rilasciare la 0.1.26', 'todo', 9, { priorita: 'high', descrizione: 'dopo la C5' }),
  attivita(2, 'Comprare il caffè', 'done', 3),
  attivita(3, 'Scrivere il post', 'doing', 5, { descrizione: 'solo desktop, senza changelog' }),
];
const ids = (testo) => testo.split('\n').filter((r) => r.startsWith('- ')).map((r) => r.split(' — id ')[1]);

test('C5-TASK-01: one tool, no overlap: query optional, status with todo/doing, the common parameters', () => {
  const nomi = ATTREZZI_ESTESI_OPENAI.map((a) => a.function.name);
  assert.ok(nomi.includes('tasks_find'));
  assert.ok(!nomi.includes('tasks_list') && !nomi.includes('tasks_search'), 'the old names are no longer offered');
  const p = ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === 'tasks_find').function.parameters;
  assert.deepEqual(p.required ?? [], []);
  assert.deepEqual(p.properties.status.enum, ['all', 'open', 'todo', 'doing', 'done']);
  for (const k of Object.keys(PARAMETRI_ELENCO)) assert.deepEqual(p.properties[k], PARAMETRI_ELENCO[k]);
});

test('C5-TASK-02: without query it lists, most recent first; open = todo and doing', () => {
  const tutte = trovaAttivita(ATTIVITA, {});
  assert.equal(tutte.split('\n')[0], 'Tasks: showing 3 of 3, most recently updated first.');
  assert.deepEqual(ids(tutte), ['t1', 't3', 't2']);
  const aperte = trovaAttivita(ATTIVITA, { status: 'open' });
  assert.equal(aperte.split('\n')[0], 'Tasks: showing 2 of 2 (status=open), most recently updated first.');
  assert.deepEqual(ids(aperte), ['t1', 't3']);
  // al contrario: done prende solo le finite, doing solo quelle iniziate
  assert.deepEqual(ids(trovaAttivita(ATTIVITA, { status: 'done' })), ['t2']);
  assert.deepEqual(ids(trovaAttivita(ATTIVITA, { status: 'doing' })), ['t3']);
  assert.equal(trovaAttivita(ATTIVITA.filter((a) => a.stato === 'done'), { status: 'open' }), 'There are no open tasks.');
});

test('C5-TASK-03: with query it searches title and detail, and the status filter still applies', () => {
  const r = trovaAttivita(ATTIVITA, { query: 'desktop post' });
  assert.equal(r.split('\n')[0], 'Tasks: 1 of 3 match «desktop», «post», showing 1, best first.');
  assert.deepEqual(ids(r), ['t3']);
  // al contrario: la stessa ricerca fra le finite non trova, e dice quante ce ne sono con quel filtro
  assert.equal(trovaAttivita(ATTIVITA, { query: 'post', status: 'done' }),
    'No task contains «post». There is 1 task (status=done) in all: tasks_find without query lists it, or search with other words.');
});

test('C5-TASK-04: an unknown status does not empty the list silently; the §6 words are synonyms', () => {
  const ignoto = trovaAttivita(ATTIVITA, { status: 'urgentissime' });
  assert.deepEqual(ids(ignoto), ['t1', 't3', 't2'], 'an unknown value does not filter');
  assert.match(ignoto, /\nstatus "urgentissime" is unknown and was ignored\. Valid: all, open, todo, doing, done\.$/);
  assert.deepEqual(ids(trovaAttivita(ATTIVITA, { status: 'completed' })), ['t2']);
  assert.deepEqual(ids(trovaAttivita(ATTIVITA, { status: 'In Progress' })), ['t3']);
});

test('C5-TASK-05: limit + cursor page through, and a cursor is refused when the status changes', () => {
  const molte = Array.from({ length: 6 }, (_, i) => attivita(10 + i, `Attività ${i}`, i % 2 ? 'done' : 'todo', 1 + i));
  const prima = trovaAttivita(molte, { limit: 2 });
  const ultima = prima.split('\n').at(-1);
  assert.match(ultima, /^4 more\. Narrow with query=…, or continue with cursor=\S+$/);
  const cursore = ultima.split('cursor=')[1];
  assert.deepEqual(ids(trovaAttivita(molte, { limit: 2, cursor: cursore })), ['t13', 't12']);
  assert.match(trovaAttivita(molte, { limit: 2, cursor: cursore, status: 'done' }), /filters changed since this cursor was issued/);
  // al contrario: l'ultima pagina non ha la riga «more»
  const fine = trovaAttivita(molte, { limit: 6 });
  assert.equal(fine.split('\n').length, 7);
});

test('C5-TASK-06: concise is status + title + id (priority only when not normal); detailed adds priority and when', () => {
  const breve = trovaAttivita(ATTIVITA, {}).split('\n');
  assert.equal(breve[1], '- [todo] Rilasciare la 0.1.26 (high): dopo la C5 — id t1');
  assert.equal(breve[3], '- [done] Comprare il caffè — id t2');
  const lungo = trovaAttivita(ATTIVITA, { response_format: 'detailed' }).split('\n');
  assert.equal(lungo[3], '- [done] Comprare il caffè (normal) · updated 2026-10-03 10:00 — id t2');
});

test('C5-TASK-07: the old names say the new one and how to call it; saved permissions keep the strictest choice', () => {
  assert.equal(fraseAttrezzoRinominato('tasks_list'), 'tasks_list was replaced by tasks_find. Call tasks_find with arguments like {"status": "open"}. Nothing was done.');
  assert.equal(fraseAttrezzoRinominato('tasks_search'), 'tasks_search was replaced by tasks_find. Call tasks_find with arguments like {"query": "words to find"}. Nothing was done.');
  assert.deepEqual(migraPermessiPerAttrezzo({ tasks_list: 'sempre', tasks_search: 'nega', tasks_create: 'chiedi' }),
    { tasks_create: 'chiedi', tasks_find: 'nega' });
  // al contrario: una scelta già sul nome nuovo vince la migrazione
  assert.deepEqual(migraPermessiPerAttrezzo({ tasks_list: 'nega', tasks_find: 'sempre' }), { tasks_find: 'sempre' });
});
