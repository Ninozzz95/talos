/*
 * ⛔⛔⛔ BC-17 — IL COMANDO DI `shell` ARRIVAVA VUOTO, E NON ERA COLPA DEL MODELLO.
 *
 * Owner 11/09/2026, con la schermata della sessione «genera un file html di 1000 righe»: nella chat
 * il modello scrive la propria diagnosi — «il tool `shell` di questo ambiente si è rotto: la stringa
 * comando arriva **vuota** a bash (`cd "…" && { ; }` → syntax error), anche su un banale `pwd`. Ho
 * provato tre volte ed è sempre la stessa cosa, quindi non è un mio errore di sintassi».
 *
 * Aveva ragione. Gli argomenti VERI della sua sessione (`8dde6bff`, ricostruiti dai `ToolCallArgs`):
 *
 *     chiamata 36  {"command": "grep -o 'id=…' _p2.html …", "descrizione": "…"}   → syntax error
 *     chiamata 47  {"command": "grep -o …",                 "description": "…"}  → syntax error
 *     (e dove funzionava: {"comando": "curl …", "descrizione": "…"})
 *
 * ⇒ Il modello a volte manda il nome del campo in INGLESE. Leggendo solo `comando` prendevamo
 *   `undefined` e lo consegnavamo a bash dentro l'involucro `cd "…" && { … }`, che con la stringa
 *   vuota diventa `{ ; }`. Lo strumento sembrava rompersi a caso, e il modello ci ha sbattuto
 *   almeno quattro volte in una sessione sola — finendo per inventarsi una strada più lunga, che è
 *   il «giro assurdo» di BC-11.
 *
 * ⛔ Non è una concessione al modello: che i nomi degli argomenti siano una classe di errore NOTA è
 *   misurato in letteratura (ToolScan, arXiv:2411.13547: «incorrect argument names» fra i modi
 *   tipici in cui una chiamata fallisce). Un harness che accetta solo il nome che ha scelto lui
 *   trasforma un errore di forma in un guasto dello strumento.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { campoConAlias, comandoDiShell } from '../src/kernel/talosHarness.mjs';

/* Gli argomenti VERI, copiati dalla sessione dell'owner: è la riproduzione, non un caso inventato. */
const DALLA_SESSIONE_ROTTA = [
  { command: "grep -o 'id=\"[A-Za-z0-9_-]*\"' _p2.html _p3.html _p4.html _p5.html | sed 's/.*id=\"//;s/\"//' | sort -u", descrizione: 'Extract all element ids' },
  { command: "grep -o \"getElementById('[a-zA-Z]*')\" _p6.html", description: 'List all element ids wired in _p6.html' },
  { command: 'sed -n \'700,740p\' _p6.html', descrizione: 'Show tail of script chunk' },
];

test('⭐⭐⭐ il comando in INGLESE arriva a destinazione: è la chiamata che finiva in «syntax error»', () => {
  for (const argomenti of DALLA_SESSIONE_ROTTA) {
    const comando = comandoDiShell(argomenti);
    assert.equal(comando, argomenti.command, '⛔ il comando si è perso di nuovo: a bash arriverebbe `{ ; }`');
    assert.notEqual(comando, '', '⛔ una stringa vuota dentro `cd "…" && { … }` è esattamente il guasto di BC-17');
  }
});

test('⛔ e il nome italiano continua a vincere quando c\'è: è il contratto dichiarato nello schema', () => {
  assert.equal(comandoDiShell({ comando: 'pwd', command: 'rm -rf /' }), 'pwd');
  assert.equal(comandoDiShell({ comando: 'ls -la' }), 'ls -la');
});

test('⛔⛔ AL CONTRARIO — senza nessun nome riconoscibile si torna la stringa vuota, non si indovina', () => {
  assert.equal(comandoDiShell({ descrizione: 'solo la descrizione' }), '');
  assert.equal(comandoDiShell({}), '');
  assert.equal(comandoDiShell(null), '');
  /*
   * ⛔ E un campo VUOTO non conta come presente: `{comando: '', command: 'pwd'}` deve dare `pwd`.
   *   È il caso che si presenta quando il modello dichiara la chiave giusta e la riempie male —
   *   senza questa regola, l'alias sarebbe inerte proprio quando serve.
   */
  assert.equal(comandoDiShell({ comando: '', command: 'pwd' }), 'pwd');
});

test('⛔ `campoConAlias` non inventa valori e rispetta l\'ordine dei nomi', () => {
  assert.equal(campoConAlias({ b: 'due' }, 'a', 'b'), 'due');
  assert.equal(campoConAlias({ a: 'uno', b: 'due' }, 'a', 'b'), 'uno');
  assert.equal(campoConAlias({ a: 0 }, 'a'), 0, 'uno zero è un valore, non un\'assenza');
  assert.equal(campoConAlias({ a: null }, 'a'), undefined);
  assert.equal(campoConAlias(undefined, 'a'), undefined);
});
