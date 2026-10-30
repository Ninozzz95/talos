/*
 * R-23 (Performance 29/10/2026; owner 29/10 sera, eccezione alla regola del 02/10 SOLO per gli a capo; OK della CLI con i suoi
 *   quattro casi a-d): `file_edit` su un file CRLF con `old_string` in LF si applica, e il file TIENE i suoi a capo, riga per riga.
 *   Ogni altra differenza resta NOT FOUND con la diagnosi di oggi; al modello nessuna riga in più.
 * Ricerca: `Downloads/handoff-talos-2026-09-27/in-corso/RICERCA-R23-R25-ONE-UP-2026-10-29.md` (Claude Code 2.1.312, opencode
 *   78359c6, Codex 96eb400, Hermes 8237c7f8, pi, crush, kilocode, gemini-cli, cline, letti nel codice).
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {applicaSostituzione, messaggioSostituzioneRifiutata, talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-r23-'));
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
const applica = (contenuto, vecchio, nuovo, opzioni) => applicaSostituzione(contenuto, vecchio, nuovo, opzioni);
const testoDopo = (contenuto, vecchio, nuovo, opzioni) => {
  const e = applica(contenuto, vecchio, nuovo, opzioni);
  assert.equal(e.ok, true, `doveva applicarsi: ${JSON.stringify(e)}`);
  return e.testo;
};

/* La sostituzione di PRIMA di R-23, copiata qui: la prova a proprietà la confronta con quella nuova dove l'esatto trova. */
function sostituzioneDiIeri(contenuto, vecchio, nuovo, {tutte = false} = {}) {
  if (vecchio === '' || vecchio === nuovo) return null;
  const pezzi = contenuto.split(vecchio);
  const occorrenze = pezzi.length - 1;
  if (occorrenze === 0 || (occorrenze > 1 && !tutte)) return null;
  return tutte ? pezzi.join(nuovo) : pezzi[0] + nuovo + pezzi.slice(1).join(vecchio);
}

test('R23-CRLF-APPLICA (era H05-MAI-APPLICATA): file CRLF, old_string LF ⇒ modificato, ogni riga col suo CRLF', async (t) => {
  const c = cartella(t);
  writeFileSync(join(c, 'f.txt'), 'uno\r\ndue\r\n');
  const esito = await giro(c, [chiama('e', 'file_edit', {percorso: 'f.txt', old_string: 'uno\ndue', new_string: 'tre\nquattro'})]);
  assert.match(esito('e'), /^edited: f\.txt \(1 occurrence replaced; /u);
  assert.equal(readFileSync(join(c, 'f.txt'), 'utf8'), 'tre\r\nquattro\r\n');
});

test('R23-H05-CRLF (riscritta): niente più «send it with \\r\\n», la modifica si applica con le righe giuste', () => {
  const contenuto = 'riga uno\r\nfunction f() {\r\n  return 1\r\n}\r\n';
  const e = applica(contenuto, 'function f() {\n  return 1\n}', 'function f() {\n  return 2\n}');
  assert.equal(e.ok, true);
  assert.deepEqual(e.righe, [2]);
  assert.equal(e.testo, 'riga uno\r\nfunction f() {\r\n  return 2\r\n}\r\n');
});

test('R23-LF-CON-OLD-CRLF (CLI a): old_string con \\r\\n su un file LF combacia, e il file resta LF', () => {
  assert.equal(testoDopo('a\nb\nc\n', 'a\r\nb', 'x\r\ny'), 'x\ny\nc\n');
});

test('R23-MISTO (CLI b): file misto, ogni riga sostituita tiene il SUO a capo', () => {
  assert.equal(testoDopo('a\r\nb\nc\r\n', 'a\nb\nc', 'a\nB\nc'), 'a\r\nB\nc\r\n');
  assert.equal(testoDopo('a\nb\r\nc\n', 'a\r\nb\r\nc', 'A\r\nB\r\nC'), 'A\nB\r\nC\n');
});

test('R23-NUOVE-RIGHE (CLI b): una riga aggiunta prende l\'a capo della riga che segue; in testa al file, il prevalente', () => {
  // dopo una riga LF in un file misto: LF; dopo una riga CRLF: CRLF
  assert.equal(testoDopo('x\r\na\nb\r\n', 'a\nb', 'a\nnuova\nb'), 'x\r\na\nnuova\nb\r\n');
  assert.equal(testoDopo('x\na\r\nb\n', 'a\nb', 'a\nnuova\nb'), 'x\na\r\nnuova\r\nb\n');
  // in testa al file, nessuna riga prima: il prevalente del file (qui CRLF, 2 contro 1)
  assert.equal(testoDopo('a\r\nb\r\nc\n', 'a', 'prima\na'), 'prima\r\na\r\nb\r\nc\n');
});

test('R23-MISTO-OLTRE-4K: il prevalente è del file INTERO, non dei primi 4096 caratteri', () => {
  const testa = 'riga lf\n'.repeat(600); // 4800 caratteri, tutti LF: i primi 4096 dicono «LF»
  const coda = 'riga crlf\r\n'.repeat(700); // ma il file intero è CRLF, 700 contro 600
  const contenuto = 'solo' + testa + coda;
  // la riga aggiunta in testa al file non ha una riga prima: prende il prevalente del file INTERO
  assert.equal(testoDopo(contenuto, 'solo', 'prima\nsolo').slice(0, 11), 'prima\r\nsolo');
});

test('R23-ULTIMA-SENZA-ACAPO: un file che finisce senza a capo resta così', () => {
  assert.equal(testoDopo('a\r\nb', 'a\nb', 'a\nB'), 'a\r\nB');
  assert.equal(testoDopo('a\r\nb', 'b', 'b\nc'), 'a\r\nb\r\nc');
});

test('R23-CR-ISOLATO: un \\r isolato resta, e non vale mai come a capo', () => {
  assert.equal(testoDopo('a\rb\r\nc\r\n', 'a\rb\nc', 'a\rB\nc'), 'a\rB\r\nc\r\n');
  const e = applica('a\rb\r\n', 'a\nb', 'x\ny');
  assert.equal(e.ok, false);
  assert.equal(e.motivo, 'assente', 'un \\n di old_string non corrisponde a un \\r isolato');
});

test('R23-BOM: il BOM UTF-8 resta, e la prima riga si modifica', () => {
  assert.equal(testoDopo('﻿prima\r\nseconda\r\n', '﻿prima\nseconda', '﻿PRIMA\nseconda'), '﻿PRIMA\r\nseconda\r\n');
  assert.equal(testoDopo('﻿prima\r\nseconda\r\n', 'prima\nseconda', 'PRIMA\nseconda'), '﻿PRIMA\r\nseconda\r\n');
});

test('R23-AMBIGUA-DOPO: due copie CRLF e old LF ⇒ AMBIGUOUS con le due righe; con replace_all tutte, ognuna coi suoi a capo', () => {
  const contenuto = 'x\r\na\r\nb\r\ny\r\na\r\nb\r\n';
  const e = applica(contenuto, 'a\nb', 'A\nB');
  assert.equal(e.ok, false);
  assert.equal(e.motivo, 'ambigua');
  assert.deepEqual(e.righe, [2, 5]);
  assert.match(messaggioSostituzioneRifiutata('f.txt', e), /^AMBIGUOUS\. Nothing was changed: `old_string` appears 2 times in f\.txt \(lines 2, 5\)/u);
  assert.equal(testoDopo(contenuto, 'a\nb', 'A\nB', {tutte: true}), 'x\r\nA\r\nB\r\ny\r\nA\r\nB\r\n');
  // due copie con a capo diversi fra loro, nessuna esatta: ognuna tiene i suoi
  const misto = 'a\r\nb\nc\n--\na\nb\r\nc\n';
  assert.equal(applica(misto, 'a\nb\nc', 'A\nB\nC').motivo, 'ambigua');
  assert.equal(testoDopo(misto, 'a\nb\nc', 'A\nB\nC', {tutte: true}), 'A\r\nB\nC\n--\nA\nB\r\nC\n');
  // ⛔ prima l'esatto: una copia LF che combacia esatta vince sulla gemella CRLF (byte di ieri)
  assert.equal(testoDopo('a\r\nb\r\n--\na\nb\n', 'a\nb', 'A\nB'), 'a\r\nb\r\n--\nA\nB\n');
});

test('R23-ESATTO-PRIMA: dove l\'esatto trova, il risultato è byte per byte quello di ieri (file LF, e file CRLF con testi CRLF)', () => {
  let seme = 12345; // mulberry32: i bit bassi di un LCG modulo 2^31 hanno periodi corti, e i contenuti uscivano periodici
  const caso = (n) => {
    seme = (seme + 0x6D2B79F5) | 0;
    let x = Math.imul(seme ^ (seme >>> 15), 1 | seme);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) % n;
  };
  const testoCasuale = (pezzi, lunghezza) => Array.from({length: lunghezza}, () => pezzi[caso(pezzi.length)]).join('');
  let confrontati = 0;
  // file LF con testi LF · file CRLF con testi CRLF · file MISTI con un new_string senza a capo (D1 non ha niente da adattare)
  for (const [pezzi, pezziNuovi] of [[['a', 'b', 'c', '\n', ' ']], [['a', 'b', '\r\n', ' ']], [['a', 'b', '\n', '\r\n'], ['a', 'b', 'c', ' ']]]) {
    for (let i = 0; i < 4000; i++) {
      const contenuto = testoCasuale(pezzi, 5 + caso(25));
      if (pezzi.includes('\r\n') && !contenuto.includes('\r\n')) continue;
      const inizio = caso(contenuto.length), lung = 1 + caso(6);
      let vecchio = contenuto.slice(inizio, inizio + lung);
      if (vecchio.startsWith('\n') || vecchio.endsWith('\r')) continue; // un pezzo esatto a metà di \r\n: casi di ieri, provati sotto
      const nuovo = testoCasuale(pezziNuovi ?? pezzi, caso(8));
      for (const tutte of [false, true]) {
        const ieri = sostituzioneDiIeri(contenuto, vecchio, nuovo, {tutte});
        if (ieri === null || ieri === contenuto) continue;
        const oggi = applica(contenuto, vecchio, nuovo, {tutte});
        assert.equal(oggi.ok, true, JSON.stringify({contenuto, vecchio, nuovo, tutte}));
        assert.equal(oggi.testo, ieri, JSON.stringify({contenuto, vecchio, nuovo, tutte}));
        confrontati += 1;
      }
    }
  }
  assert.ok(confrontati > 2000, `confronti fatti: ${confrontati}`);
});

test('R23-SOLO-A-CAPO: old e new diversi solo per gli a capo ⇒ i byte di new così come sono; risultato identico ⇒ NO CHANGE', () => {
  assert.equal(testoDopo('a\r\nb\r\n', 'a\r\nb', 'a\nb'), 'a\nb\r\n', 'conversione voluta: passa');
  const e = applica('a\r\nb\r\n', 'a\nb', 'a\r\nb');
  assert.equal(e.ok, false);
  assert.equal(e.motivo, 'nessun-cambio');
  assert.match(messaggioSostituzioneRifiutata('f.txt', e), /^NO CHANGE\. Nothing was changed: with this edit f\.txt would stay exactly as it is\./u);
});

test('R23-NEW-SEGUE-IL-FILE (D1): file LF, old LF esatto, new con CRLF ⇒ il file resta tutto LF; e il contrario', () => {
  assert.equal(testoDopo('uno\ndue\ntre\n', 'due', 'due\r\nmezzo'), 'uno\ndue\nmezzo\ntre\n');
  assert.equal(testoDopo('uno\r\ndue\r\ntre\r\n', 'due', 'due\nmezzo'), 'uno\r\ndue\r\nmezzo\r\ntre\r\n');
});

test('R23-ALTRE-DIFFERENZE-RESTANO: CRLF più uno spazio in più ⇒ NOT FOUND con la diagnosi degli spazi, file intatto', () => {
  const contenuto = 'x\r\na = 1\r\nb\r\n';
  const e = applica(contenuto, 'a = 1 \nb', 'a = 2\nb');
  assert.equal(e.ok, false);
  assert.equal(e.motivo, 'assente');
  const messaggio = messaggioSostituzioneRifiutata('f.txt', e, {contenuto, vecchio: 'a = 1 \nb', nuovo: 'a = 2\nb'});
  assert.match(messaggio, /^NOT FOUND\./u);
  assert.match(messaggio, /differs only in whitespace/u);
  assert.doesNotMatch(messaggio, /CRLF|\\r\\n/u, 'nessuna parola sugli a capo');
  // e le virgolette restano rifiutate
  assert.equal(applica('s = “ciao”\r\nt\r\n', 's = "ciao"\nt', 's = "x"\nt').ok, false);
});

test('R23-PARTE-A-FINE-RIGA (CLI c): un pezzo che finisce esattamente a fine riga prende tutto il \\r\\n, mai mezzo', () => {
  assert.equal(testoDopo('a\r\nb\r\nc', 'a\nb\n', 'x\ny\n'), 'x\r\ny\r\nc');
  assert.equal(testoDopo('a\r\nb\r\nc', 'b\n', 'B\n'), 'a\r\nB\r\nc');
  assert.equal(testoDopo('a\r\nb\r\nc', '\nb\nc', '\nB\nc'), 'a\r\nB\r\nc', 'un pezzo che comincia con l\'a capo prende anche il suo \\r');
  const dopo = testoDopo('a\r\nb\r\nc', 'b\n', 'B');
  assert.equal(dopo, 'a\r\nBc', 'l\'a capo tolto se ne va intero');
  assert.doesNotMatch(dopo, /\r(?!\n)/u, 'nessun \\r rimasto da solo');
});

test('R23-PERMESSO-SOLO-RIGHE-TOCCATE: il testo proposto differisce dal file solo nelle righe del pezzo', () => {
  const righe = Array.from({length: 200}, (_, i) => `riga ${i}`);
  const contenuto = righe.join('\r\n') + '\r\n';
  const dopo = testoDopo(contenuto, 'riga 100\nriga 101', 'riga CENTO\nriga 101');
  const a = contenuto.split('\n'), b = dopo.split('\n');
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((r, i) => (r === b[i] ? null : i)).filter((i) => i !== null), [100]);
});

test('R23-NESSUNA-RIGA-IN-PIU: l\'esito di una modifica passata per la vista ha la forma di una esatta, senza parole sugli a capo', async (t) => {
  const c = cartella(t);
  writeFileSync(join(c, 'crlf.txt'), 'alfa\r\nbeta\r\n');
  writeFileSync(join(c, 'lf.txt'), 'alfa\nbeta\n');
  const esito = await giro(c, [
    chiama('v', 'file_edit', {percorso: 'crlf.txt', old_string: 'alfa\nbeta', new_string: 'ALFA\nbeta'}),
    chiama('x', 'file_edit', {percorso: 'lf.txt', old_string: 'alfa\nbeta', new_string: 'ALFA\nbeta'}),
  ]);
  const forma = (s) => s.replace(/\b(crlf|lf)\.txt\b/u, 'F').replace(/\d+ bytes/u, 'N bytes');
  assert.equal(forma(esito('v')), forma(esito('x')));
  assert.doesNotMatch(esito('v'), /CRLF|LF|line ending|\\r/u);
  assert.equal(readFileSync(join(c, 'crlf.txt'), 'utf8'), 'ALFA\r\nbeta\r\n');
});

test('R23-GIT-DIFF (CLI d): dopo la modifica git diff mostra SOLO la riga cambiata, nessun cambio d\'a capo sul file intero', async (t) => {
  const c = cartella(t);
  const git = (...a) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {cwd: c, encoding: 'utf8'});
  try { git('init', '-q'); } catch { t.skip('git non disponibile'); return; }
  const righe = Array.from({length: 50}, (_, i) => `const v${i} = ${i}`);
  writeFileSync(join(c, 'm.js'), righe.join('\r\n') + '\r\n');
  git('add', 'm.js');
  git('commit', '-q', '-m', 'base');
  const esito = await giro(c, [chiama('e', 'file_edit', {percorso: 'm.js', old_string: 'const v20 = 20\nconst v21 = 21', new_string: 'const v20 = 2000\nconst v21 = 21'})]);
  assert.match(esito('e'), /^edited: /u);
  assert.equal(git('diff', '--numstat').trim(), '1\t1\tm.js');
  const byte = readFileSync(join(c, 'm.js'));
  assert.equal(byte.toString('latin1').split('\r\n').length, 51, 'ancora 50 righe CRLF');
  assert.equal(byte.toString('latin1').replace(/\r\n/gu, '').includes('\n'), false, 'nessun LF da solo');
});
