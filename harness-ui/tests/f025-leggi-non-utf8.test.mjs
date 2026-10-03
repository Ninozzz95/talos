/*
 * F-025 / C-04 (audit dell'harness e red-team degli attrezzi, ZIP dell'owner del 02/10/2026): `leggi` metteva «�» al posto dei
 *   byte non UTF-8 SENZA DIRLO — un file Windows-1252 con le virgolette curve (`0x92 0x93 0x94`) tornava `abc���def`, e
 *   `file_edit` sullo stesso file rifiutava indicando il byte. Due attrezzi, due criteri opposti.
 * Owner 02/10/2026 sera, «Voglio il +1», poi «Sì, questo +1»: il testo resta leggibile, l'intestazione dice quanti byte sono
 *   persi, il primo (byte, valore, riga), la codifica probabile e la mossa dopo; i file UTF-16 col BOM si leggono come testo.
 * Come fanno gli altri (letti il 02/10/2026): Hermes testo solo se UTF-8 valido, altrimenti binario
 *   (`tools/file_operations.py:409-414`); Claude Code 2.1.287 UTF-16LE col BOM, altrimenti UTF-8 con sostituzione silenziosa;
 *   opencode sostituzione silenziosa (`packages/opencode/src/tool/read.ts:147`). Nessuno dice dove sta la perdita.
 * Ledger: AVM-harness-desktop/.claude/LEDGER-ZIP-OWNER-2026-10-02.md, sezione «+1».
 */
import assert from 'node:assert/strict';
import {mkdtempSync, truncateSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {MAX_BYTE_DOCUMENTO} from '../src/kernel/estrai-documento.mjs';
import {esitoDellaLettura, leggiTestoLimitato, scansioneUtf8, talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function fixture(t, contenuto, nome = 'file.txt') {
  const root = mkdtempSync(join(tmpdir(), 'talos-f025-'));
  t.after(() => rimuoviCartellaDiProva(root));
  writeFileSync(join(root, nome), contenuto);
  return root;
}
const leggi = async (root, argomenti = {}, nome = 'file.txt') => esitoDellaLettura(await leggiTestoLimitato(root, nome, argomenti), nome);
const parti = (esito) => { const m = /^(\[TALOS [^\n]*\])\n([\s\S]*)$/u.exec(esito); return m ? {testa: m[1], corpo: m[2]} : {testa: null, corpo: esito}; };
const b = (...pezzi) => Buffer.concat(pezzi.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));

test('F025-CP1252: il caso dell\'audit — tre virgolette curve Windows-1252 si dichiarano, il testo resta leggibile', async (t) => {
  const root = fixture(t, b('abc', [0x92, 0x93, 0x94], 'def\n'));
  const letta = await leggiTestoLimitato(root, 'file.txt');
  assert.deepEqual(letta.nonUtf8, {byte: 3, sequenze: 3, primoByte: 3, valore: 0x92, riga: 1, multibyteValidi: 0});
  const {testa, corpo} = parti(esitoDellaLettura(letta, 'file.txt'));
  assert.equal(corpo, 'abc���def\n', 'il testo resta leggibile, come prima');
  assert.match(testa ?? '', /3 bytes in these lines are NOT valid UTF-8 \(first: byte 3 = 0x92, line 1\)/u);
  assert.match(testa, /each invalid sequence is shown as "�"/u);
  assert.match(testa, /single-byte encoding such as Windows-1252/u);
  assert.match(testa, /leggi format:"hex" offset=3/u);
  assert.match(testa, /file_edit refuses this file until it is valid UTF-8/u);
});

test('F025-FF-FE: il caso del ciclo 4 — `prima\\xff\\xfe-fine`: due byte, il primo al 5', async (t) => {
  const root = fixture(t, b('prima', [0xff, 0xfe], '-fine\n'));
  const {testa, corpo} = parti(await leggi(root));
  assert.equal(corpo, 'prima��-fine\n');
  assert.match(testa ?? '', /2 bytes in these lines are NOT valid UTF-8 \(first: byte 5 = 0xff, line 1\)/u);
});

test('F025-RIGA-E-BYTE-ASSOLUTI: il primo guasto alla riga 3 porta il byte del FILE, non della riga', async (t) => {
  const root = fixture(t, b('uno\n', 'due\n', 'tr', [0xe8], ' tre\n'));
  const letta = await leggiTestoLimitato(root, 'file.txt');
  assert.equal(letta.nonUtf8.primoByte, 10);
  assert.equal(letta.nonUtf8.riga, 3);
  assert.equal(letta.nonUtf8.valore, 0xe8);
});

test('F025-CONTRARIO-UTF8-VALIDO: un file UTF-8 valido, anche con un U+FFFD VERO dentro, esce identico e senza intestazione', async (t) => {
  const testo = 'città è già lì � vero\n😀 astrale\n';
  const root = fixture(t, testo);
  const letta = await leggiTestoLimitato(root, 'file.txt');
  assert.equal(letta.nonUtf8, null);
  assert.equal(esitoDellaLettura(letta, 'file.txt'), testo, 'byte per byte come prima della cura');
});

test('F025-UTF8-ROTTO: byte rotti in mezzo a UTF-8 valido non si attribuiscono a Windows-1252', async (t) => {
  const root = fixture(t, b('città ', [0xe2, 0x82], ' fine\n'));
  const {testa} = parti(await leggi(root));
  assert.match(testa ?? '', /2 bytes in these lines are NOT valid UTF-8 \(first: byte 7 = 0xe2, line 1\)/u);
  assert.match(testa, /mixes valid UTF-8 with other bytes/u);
  assert.doesNotMatch(testa, /Windows-1252/u);
});

test('F025-SOLO-LA-PAGINA: i byte rotti in righe NON mostrate non si contano', async (t) => {
  const root = fixture(t, b('pulita\n', 'rotta ', [0x92], '\n'));
  const letta = await leggiTestoLimitato(root, 'file.txt', {offset: 1, limit: 1});
  assert.equal(letta.nonUtf8, null, 'la riga 2 non è nella pagina');
  const seconda = await leggiTestoLimitato(root, 'file.txt', {offset: 2, limit: 1});
  assert.equal(seconda.nonUtf8.primoByte, 13);
  assert.equal(seconda.nonUtf8.riga, 2);
});

test('F025-RIGA-LUNGA: in una riga accorciata contano solo i byte MOSTRATI', async (t) => {
  // 1.990 caratteri, un byte rotto (mostrato), poi oltre i 2.000 caratteri un altro byte rotto (NON mostrato)
  const root = fixture(t, b('a'.repeat(1990), [0x92], 'b'.repeat(100), [0x93], 'c'.repeat(10), '\n'));
  const letta = await leggiTestoLimitato(root, 'file.txt');
  assert.equal(letta.accorciate, 1);
  assert.equal(letta.nonUtf8.byte, 1, 'il secondo byte rotto sta oltre il taglio');
  assert.equal(letta.nonUtf8.primoByte, 1990);
});

test('F025-WHATWG: la scansione conta esattamente le «�» del decodificatore standard (10.000 buffer casuali)', () => {
  let seme = 0x2545f491;
  const casuale = () => { seme ^= seme << 13; seme ^= seme >>> 17; seme ^= seme << 5; return (seme >>> 0) / 0x100000000; };
  // byte scelti apposta vicino ai confini di UTF-8: iniziali, continuazioni, E0/ED/F0/F4, oltre F4
  const scelti = [0x41, 0x0a, 0x7f, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0, 0xc1, 0xc2, 0xdf, 0xe0, 0xe1, 0xed, 0xee, 0xef, 0xf0, 0xf1, 0xf4, 0xf5, 0xff];
  for (let n = 0; n < 10_000; n++) {
    const lunghezza = 1 + Math.floor(casuale() * 12);
    const dati = Buffer.from(Array.from({length: lunghezza}, () => scelti[Math.floor(casuale() * scelti.length)]));
    if (dati.includes(Buffer.from([0xef, 0xbf, 0xbd]))) continue;
    const attese = [...new TextDecoder('utf-8', {ignoreBOM: true}).decode(dati)].filter((c) => c === '�').length;
    assert.equal(scansioneUtf8(dati).sequenze, attese, `buffer ${dati.toString('hex')}`);
  }
});

test('F025-UTF16LE-BOM: un file UTF-16LE col BOM si legge come TESTO, e si dice da cosa è stato decodificato', async (t) => {
  const root = fixture(t, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ciao\nmondo è qui\n', 'utf16le')]));
  const {testa, corpo} = parti(await leggi(root));
  assert.equal(corpo, 'ciao\nmondo è qui\n');
  assert.match(testa ?? '', /decoded "file\.txt" from UTF-16LE \(byte order mark FF FE\), 36 bytes on disk/u);
  assert.match(testa, /line numbers, offset and byteOffset refer to this decoded text/u);
  assert.match(testa, /leggi format:"hex"/u);
});

test('F025-UTF16BE-BOM: anche big-endian (Claude Code legge solo LE)', async (t) => {
  const testo = Buffer.from('riga uno\nriga due\n', 'utf16le').swap16();
  const root = fixture(t, Buffer.concat([Buffer.from([0xfe, 0xff]), testo]));
  const {testa, corpo} = parti(await leggi(root));
  assert.equal(corpo, 'riga uno\nriga due\n');
  assert.match(testa ?? '', /from UTF-16BE \(byte order mark FE FF\)/u);
});

test('F025-UTF16-PAGINE: offset e limit valgono sul testo decodificato', async (t) => {
  const testo = Array.from({length: 30}, (_, i) => `riga ${i + 1}`).join('\n') + '\n';
  const root = fixture(t, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(testo, 'utf16le')]));
  // due intestazioni, come un documento estratto (F-001): da cosa è decodificato, poi la pagina
  const esito = await leggi(root, {offset: 10, limit: 2});
  assert.match(esito, /^\[TALOS decoded "file\.txt" from UTF-16LE/u);
  assert.match(esito, /\n\[TALOS read lines 10-11 of 30 in "file\.txt"; continue with leggi offset=12/u);
  assert.ok(esito.endsWith(']\nriga 10\nriga 11\n'), esito);
});

test('F025-UTF16-SENZA-NUL: solo ideogrammi, nessun byte zero — il BOM basta, non si legge come UTF-8 rotto', async (t) => {
  const root = fixture(t, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中文字', 'utf16le')]));
  assert.ok(!Buffer.from('中文字', 'utf16le').includes(0), 'premessa: nessun NUL nel file');
  const {testa, corpo} = parti(await leggi(root));
  assert.equal(corpo, '中文字');
  assert.match(testa ?? '', /from UTF-16LE/u);
});

test('F025-UTF16-BYTEOFFSET: dentro una riga lunga si prosegue sul testo decodificato, anche oltre la lunghezza del file grezzo', async (t) => {
  // 2.500 ideogrammi: 5.002 byte sul disco, 7.500 di testo UTF-8 decodificato; la riga si taglia a 2.000 caratteri (6.000 byte)
  const root = fixture(t, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中'.repeat(2500), 'utf16le')]));
  const prima = await leggi(root);
  assert.match(prima, /continue inside it with leggi byteOffset=6000\]/u);
  const seguito = await leggi(root, {byteOffset: 6000});
  assert.match(seguito, /^\[TALOS decoded "file\.txt" from UTF-16LE/u);
  assert.ok(seguito.endsWith(']\n' + '中'.repeat(500)), seguito.slice(0, 400));
  // e dentro i limiti del file grezzo: 3.000 ideogrammi = 6.002 byte sul disco, il seguito comincia al byte 6.000 del testo
  const dentro = fixture(t, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中'.repeat(3000), 'utf16le')]));
  const seguitoDentro = await leggi(dentro, {byteOffset: 6000});
  assert.match(seguitoDentro, /^\[TALOS decoded "file\.txt" from UTF-16LE/u);
  assert.ok(seguitoDentro.endsWith(']\n' + '中'.repeat(1000)), seguitoDentro.slice(0, 400));
});

test('F025-UTF16-HEX: format:"hex" resta sui byte VERI del file', async (t) => {
  const root = fixture(t, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ab', 'utf16le')]));
  const {corpo} = parti(await leggi(root, {format: 'hex'}));
  assert.equal(corpo, 'fffe61006200');
});

test('F025-CONTRARIO-UTF32: FF FE 00 00 è UTF-32LE, non UTF-16: resta un binario', async (t) => {
  const root = fixture(t, Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x61, 0x00, 0x00, 0x00]));
  const esito = await leggi(root);
  assert.match(esito, /^"file\.txt" is a binary file/u);
  assert.doesNotMatch(esito, /decoded/u, 'non si è nemmeno provato a decodificarlo come UTF-16');
});

test('F025-UTF16-SURROGATO: unità UTF-16 rotte si dichiarano in testa, il resto si legge', async (t) => {
  // «a», un surrogato alto da solo (D800) seguito da «b»: non è UTF-16 valido
  const root = fixture(t, Buffer.from([0xff, 0xfe, 0x61, 0x00, 0x00, 0xd8, 0x62, 0x00, 0x0a, 0x00]));
  const esito = await leggi(root);
  assert.match(esito, /\n\[1 character\(s\) are not valid UTF-16LE and are shown as "�"\.\]\n/u);
  assert.ok(esito.endsWith('\na�b\n'), esito);
});

test('F025-UTF16-TROPPO-GRANDE: oltre il tetto dei documenti si dice perché, e sotto resta la lettura di sempre', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-f025-'));
  t.after(() => rimuoviCartellaDiProva(root));
  const percorso = join(root, 'enorme.txt');
  writeFileSync(percorso, Buffer.from([0xff, 0xfe, 0x61, 0x00]));
  truncateSync(percorso, MAX_BYTE_DOCUMENTO + 2); // file sparso: zeri, nessun byte scritto davvero
  const esito = await leggi(root, {}, 'enorme.txt');
  assert.match(esito, /^\[TALOS could not decode "enorme\.txt" as UTF-16LE: the file is too large to convert \(\d+ bytes; the limit is \d+\)\. Below is what a plain read gives\.\]\n/u);
  assert.match(esito, /\n"enorme\.txt" is a binary file/u);
});

test('F025-CONTRARIO-UTF16-SENZA-BOM: senza BOM non si indovina, resta un binario come prima', async (t) => {
  const root = fixture(t, Buffer.from('ciao mondo', 'utf16le'));
  assert.match(await leggi(root), /is a binary file/u);
});

test('F025-KERNEL: dal giro vero, il modello riceve l\'intestazione che dichiara la perdita', async (t) => {
  const root = fixture(t, b('prezzo ', [0x80], ' 10\n'), 'listino.txt');
  const chiamate = [];
  const fetchDiRete = async (url, opzioni) => {
    chiamate.push(JSON.parse(opzioni.body));
    const risposta = chiamate.length === 1
      ? {role: 'assistant', content: null, tool_calls: [{id: 'call_1', function: {name: 'leggi', arguments: JSON.stringify({percorso: 'listino.txt'})}}]}
      : {role: 'assistant', content: 'fatto', tool_calls: []};
    return {ok: true, status: 200, json: async () => ({choices: [{message: risposta}], usage: {prompt_tokens: 10, completion_tokens: 5}}), text: async () => ''};
  };
  await talosLavora({cartella: root, task: {consegna: 'leggi listino.txt'}, modello: 'x', chiave: 'y', fetchDiRete});
  const esito = chiamate[1].messages.find((m) => m.role === 'tool').content;
  assert.match(esito, /1 bytes? in these lines (?:is|are) NOT valid UTF-8 \(first: byte 7 = 0x80, line 1\)/u);
  assert.match(esito, /prezzo � 10/u);
});
