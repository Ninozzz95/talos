/*
 * H-05 (red-team degli attrezzi, ZIP dell'owner del 02/10/2026): «REFUSED» si usava anche per un semplice `old_string` che non
 *   combacia, la stessa parola di «resolves outside the workspace». Chi impara a ignorare REFUSED perché «è solo un mismatch»
 *   smette di vedere i rifiuti che contano — l'audit l'ha fatto lui stesso, scambiando un trucco di testo per una protezione.
 * Owner, 02/10/2026 sera, «Voglio il +1», poi «Sì, questo +1»: REFUSED solo per sicurezza e permessi; NOT FOUND, AMBIGUOUS,
 *   NO CHANGE, INVALID per il resto. Per NOT FOUND di `file_edit`: «già applicata» come Hermes, la parte più vicina con le righe e
 *   il MOTIVO della differenza; mai applicata una corrispondenza approssimata.
 * Come fanno gli altri (letti nel codice il 02/10/2026):
 *   Hermes — «Could not find match for old_string» + «Did you mean one of these sections?» (tools/fuzzy_match.py:599-649),
 *     «già applicata» (:307-312), e prima prova strategie approssimate e le APPLICA;
 *   Claude Code 2.1.287 — «String to replace not found in file.» + una nota sugli escape \uXXXX, errorCode 8;
 *   opencode — «Could not find oldString in the file. It must match exactly…» (packages/opencode/src/tool/edit.ts:723-727).
 *   ⇒ Nessuno dice PERCHÉ non combacia quando la differenza è di a capo, virgolette o rientri: è il +1.
 * Lessico concordato con la CLI il 03/10 (ledger, sezione «H-05 — il lessico degli esiti»).
 */
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {applicaSostituzione, messaggioSostituzioneRifiutata, talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-h05-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const chiama = (id, nome, argomenti) => ({id, type: 'function', function: {name: nome, arguments: JSON.stringify(argomenti)}});
async function giro(c, chiamate) {
  let n = 0;
  const r = await talosLavora({
    cartella: c, task: {consegna: 'modifica'}, modello: 'x', chiave: 'y', livelloAccesso: 'accesso-pieno',
    chiediApprovazioneFn: async () => true,
    fetchDiRete: async () => ({ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{message: n++ === 0 ? {role: 'assistant', content: null, tool_calls: chiamate} : {role: 'assistant', content: 'fatto'}}],
      usage: {prompt_tokens: 10, completion_tokens: 5},
    })}),
  });
  return (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '';
}
// la stessa chiamata che fa `file_edit` dopo aver letto il file
const esitoDi = (contenuto, vecchio, nuovo, opzioni = {}) =>
  messaggioSostituzioneRifiutata('src/a.mjs', applicaSostituzione(contenuto, vecchio, nuovo, opzioni), {contenuto, vecchio, nuovo});

test('H05-LESSICO: ogni esito di file_edit ha la sua parola, e nessuno dice REFUSED', () => {
  assert.match(esitoDi('a b c', 'x', 'y'), /^NOT FOUND\. Nothing was changed: `old_string` does not appear in src\/a\.mjs, not even once\./u);
  assert.match(esitoDi('a a', 'a', 'b'), /^AMBIGUOUS\. Nothing was changed: `old_string` appears 2 times in src\/a\.mjs/u);
  assert.match(esitoDi('a', 'a', 'a'), /^NO CHANGE\. Nothing was changed: `old_string` and `new_string` are identical/u);
  assert.match(esitoDi('a', '', 'b'), /^INVALID\. Nothing was changed: `old_string` is empty/u);
  for (const e of [esitoDi('a b c', 'x', 'y'), esitoDi('a a', 'a', 'b'), esitoDi('a', 'a', 'a'), esitoDi('a', '', 'b')]) assert.doesNotMatch(e, /REFUSED/u);
});

test('H05-GIA-APPLICATA: new_string c\'è e old_string no — NO CHANGE, non NOT FOUND (come Hermes)', () => {
  const contenuto = 'export const iva = 0.22\nexport const sconto = 0.1\n';
  const e = esitoDi(contenuto, 'export const iva = 0.21', 'export const iva = 0.22');
  assert.match(e, /^NO CHANGE\. The edit looks already applied: `new_string` is already in src\/a\.mjs \(line 1\) and `old_string` is not\. Nothing was written; do not send this edit again\./u);
});

test('H05-GIA-APPLICATA-CONTRARIO: un new_string corto (sotto 8 caratteri) non basta per dire «già applicata»', () => {
  assert.match(esitoDi('x = 1\n', 'x = 2', 'x = 1'), /^NOT FOUND\./u);
});

test('H05-CRLF: il file ha \\r\\n e old_string \\n — si dice, con le righe dove il testo c\'è', () => {
  const contenuto = 'riga uno\r\nfunction f() {\r\n  return 1\r\n}\r\n';
  const e = esitoDi(contenuto, 'function f() {\n  return 1\n}', 'function f() {\n  return 2\n}');
  assert.match(e, /^NOT FOUND\./u);
  assert.match(e, /The text IS in the file at lines 2-4, but the file uses CRLF line endings \(\\r\\n\) and `old_string` uses LF \(\\n\)/u);
});

test('H05-VIRGOLETTE: curve nel file, dritte in old_string — si dice', () => {
  const contenuto = 'const saluto = “ciao”\nconst altro = ’x’\n';
  const e = esitoDi(contenuto, 'const saluto = "ciao"', 'const saluto = "salve"');
  assert.match(e, /The text IS in the file at line 1, but it differs only in quote characters/u);
});

test('H05-ESCAPE: old_string porta \\u2019 dove il file ha il carattere — si dice', () => {
  const contenuto = 'const a = \'l’altro\'\n';
  const e = esitoDi(contenuto, 'const a = \'l\\u2019altro\'', 'const a = \'il resto\'');
  assert.match(e, /The text IS in the file at line 1, but `old_string` has \\uXXXX escapes where the file has the characters themselves/u);
});

test('H05-RIENTRI: tab nel file, spazi in old_string — righe, e la differenza mostrata (→ tab, · spazio)', () => {
  const contenuto = 'function g() {\n\tconst a = 1\n\treturn a\n}\n';
  const e = esitoDi(contenuto, '    const a = 1\n    return a', '    const a = 2\n    return a');
  assert.match(e, /The text IS in the file at lines 2-3, but it differs only in whitespace \(indentation, tabs or spaces, spaces at line ends\)/u);
  assert.match(e, /file has: +→const a = 1/u);
  assert.match(e, /you sent: +····const a = 1/u);
});

test('H05-SPAZI-IN-CODA: spazi in fondo alla riga — si vedono anche quelli (Hermes mostra solo quelli in testa)', () => {
  const e = esitoDi('x\na = 1  \nb\n', 'a = 1\nb', 'a = 2\nb');
  assert.match(e, /The text IS in the file at lines 2-3, but it differs only in whitespace/u);
  assert.match(e, /file has: a = 1··\n/u);
  assert.match(e, /you sent: a = 1\n/u);
});

test('H05-VICINA: quando non c\'è a meno di una differenza nota, le righe più vicine numerate', () => {
  const contenuto = 'import x from "y"\n\nexport function prezzoFinale(netto) {\n  return netto * 1.22\n}\n';
  const e = esitoDi(contenuto, 'export function prezzoFinal(netto, iva) {', 'export function prezzoFinale(netto, iva = 0.22) {');
  assert.match(e, /^NOT FOUND\./u);
  assert.match(e, /Closest text in the file:\n/u);
  assert.match(e, /\n +3│ export function prezzoFinale\(netto\) \{/u);
  assert.match(e, /Copy the exact text from `leggi` and send the edit again\./u);
});

test('H05-NIENTE-DI-VICINO: un testo che non somiglia a niente non inventa righe vicine', () => {
  const e = esitoDi('alpha\nbeta\n', 'zzzzqqqq', 'y');
  assert.match(e, /^NOT FOUND\./u);
  assert.doesNotMatch(e, /Closest text|IS in the file/u);
});

test('H05-MAI-APPLICATA: anche quando la differenza è solo di a capo, il file NON cambia (owner: niente approssimati)', async (t) => {
  const c = cartella(t);
  const prima = 'uno\r\ndue\r\n';
  writeFileSync(join(c, 'f.txt'), prima);
  const esito = await giro(c, [chiama('e', 'file_edit', {percorso: 'f.txt', old_string: 'uno\ndue', new_string: 'tre'})]);
  assert.match(esito('e'), /^NOT FOUND\./u);
  assert.equal(readFileSync(join(c, 'f.txt'), 'utf8'), prima);
});

test('H05-SICUREZZA-RESTA-REFUSED: il permesso negato e il file binario restano REFUSED', async (t) => {
  const c = cartella(t);
  writeFileSync(join(c, 'b.raw'), Buffer.from([0x41, 0x00, 0x42]));
  const esito = await giro(c, [chiama('b', 'file_edit', {percorso: 'b.raw', old_string: 'A', new_string: 'C'})]);
  assert.match(esito('b'), /^REFUSED\. Nothing was changed: b\.raw is a binary file/u);
});

test('H05-CERCA: gli argomenti sbagliati sono INVALID, ciò che non c\'è è NOT FOUND', async (t) => {
  const c = cartella(t);
  writeFileSync(join(c, 'a.txt'), 'ciao');
  const esito = await giro(c, [
    chiama('o', 'cerca', {testo: 'ciao', offset: -1}),
    chiama('d', 'cerca', {testo: 'ciao', dentro: 'non-esiste'}),
    chiama('k', 'cerca', {continua: 'ricerca-che-non-c-e'}),
  ]);
  assert.match(esito('o'), /^INVALID\. "offset" must be a non-negative safe integer/u);
  assert.match(esito('d'), /^NOT FOUND\. "non-esiste" is not a folder of this workspace\./u);
  assert.match(esito('k'), /^NOT FOUND\. /u);
});
