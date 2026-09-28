/*
 * letture-delle-sezioni.test.mjs — decisione owner 27/09 (`decisioni-owner-capacita-sezioni-27-09`, punto 2): elenca · cerca
 *   per parole · leggi intero per Memoria, Note, Attività e Ricerca approfondita. Le forme delle voci sono quelle pubbliche dei
 *   negozi (`formaPubblicaNota`, `formaPubblicaAttivita`, `formaPubblicaMemoria`, `voceEsposta` delle ricerche).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { cercaAttivita, cercaNote, cercaRicerche, elencoMemorie, leggiNotaIntera } from '../src/letture-delle-sezioni.mjs';

const MEMORIE = [
  { id: 'm1', titolo: 'Preferenze risposta', contenuto: 'Risposte brevi, in italiano' },
  { id: 'm2', titolo: 'Progetto', contenuto: 'x'.repeat(700) },
];
const NOTE = [
  { id: 'n1', titolo: 'Lista della spesa', contenuto: 'Pane, latte, caffè', aggiornataAlle: '2026-09-27T09:00:00.000Z', formato: 'markdown' },
  { id: 'n2', titolo: 'Idee per TALOS', contenuto: 'Una board delle attività e la ricerca nelle conversazioni', aggiornataAlle: '2026-09-26T09:00:00.000Z' },
];
const ATTIVITA = [
  { id: 't1', titolo: 'Rilasciare la 0.1.16', descrizione: 'dopo F7', stato: 'open', priorita: 'high' },
  { id: 't2', titolo: 'Comprare il caffè', descrizione: null, stato: 'done', priorita: 'normal' },
];
const RICERCHE = [
  { id: 'r1', titolo: 'Motori locali per LLM', domanda: 'Quali motori locali battono llama.cpp?', stato: 'done', avviataAlle: '2026-09-20T10:00:00.000Z' },
];

test('SEZIONI-01 — memory_list: tutte, con il testo fino a 500 caratteri; vuota lo dice', () => {
  const out = elencoMemorie(MEMORIE);
  assert.match(out, /^Memory: showing 2 of 2, most recently updated first\.\n- Preferenze risposta: Risposte brevi, in italiano — id m1\n/u);
  assert.match(out, /- Progetto: x{500}… — id m2$/u);
  assert.match(elencoMemorie(MEMORIE, { limit: 1 }), /1 more: raise limit/u);
  assert.match(elencoMemorie([]), /^Nothing is remembered yet\./u);
});

test('SEZIONI-02 — notes_search per parole (accenti compresi), «*» = tutte; senza risultati dice quante e come vederle', () => {
  assert.match(cercaNote(NOTE, { query: 'attivita board' }), /^Notes: 1 of 2 match «attivita», «board», showing 1, best first\.\n- Idee per TALOS: /u);
  assert.match(cercaNote(NOTE, { query: '*' }), /^Notes: showing 2 of 2, most recently updated first\./u);
  assert.equal(cercaNote(NOTE, { query: 'zanzibar' }), 'No note contains «zanzibar». There are 2 notes in all: notes_list shows them, or search with other words.');
  assert.equal(cercaNote([], { query: 'x' }), 'There are no notes.');
});

test('SEZIONI-03 — notes_read: intera; oltre il tetto a pezzi con «from»; un id sbagliato si dice', () => {
  const corta = leggiNotaIntera(NOTE[0]);
  assert.equal(corta, 'Note «Lista della spesa» — id n1 · updated 2026-09-27 09:00 · 18 characters · markdown.\nPane, latte, caffè');
  const lunga = { id: 'n3', titolo: 'Lunga', contenuto: 'a'.repeat(30_000) };
  const p1 = leggiNotaIntera(lunga);
  assert.match(p1, /\[Characters 1-12000 of 30000\. Continue with from=12001\.\]$/u);
  const p3 = leggiNotaIntera(lunga, { from: 24_001 });
  assert.match(p3, /\[Characters 24001-30000 of 30000: the end of the note\.\]$/u);
  assert.equal(p3.split('\n')[1].length, 6_000);
  assert.match(leggiNotaIntera(null, { id: 'nx' }), /^notes_read: no note with id «nx»/u);
});

test('SEZIONI-04 — tasks_search e research_search per parole, col filtro di stato delle attività', () => {
  assert.match(cercaAttivita(ATTIVITA, { query: 'rilasciare' }), /- \[ \] Rilasciare la 0\.1\.16 \(high\): dopo F7 — id t1/u);
  assert.match(cercaAttivita(ATTIVITA, { query: 'caffe', status: 'open' }), /^No task contains «caffe»\. There is 1 task in all: tasks_list shows it/u);
  assert.match(cercaAttivita(ATTIVITA, { query: '*', status: 'done' }), /- \[x\] Comprare il caffè — id t2/u);
  assert.match(cercaRicerche(RICERCHE, { query: 'llama' }), /- Motori locali per LLM — done — 2026-09-20 — id r1/u, 'trovata dalla domanda');
});
