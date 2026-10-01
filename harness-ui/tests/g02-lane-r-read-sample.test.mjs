/*
 * G02-10d (CLI port review, 01/10/2026): the binary sample survives SHORT READS.
 *   `leggi` reads lines (owner decision D1, 30/09) and judges «binary» on the first 8000 bytes, like git. The line reader
 *   (`leggiRighe`) looked at its FIRST `read` only: `fs.read` may return fewer bytes than asked (Node docs, fs.read:
 *   «bytesRead» can be less than `length`; a network share or a FUSE mount does it), so a NUL at byte 7999 behind a
 *   127-byte first read was not seen, the file was read to the end (27.999 bytes instead of 8000) and treated as text.
 *   The byte reader already completes its sample (`campioneBinarioDelFile`); the line reader now does the same.
 *   Found by the CLI's independent review (cli/test/runtime/review-read-bounds.test.ts, REV-READ-CLI-SHORT), which the
 *   pre-D1 kernel passed.
 */
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {BYTE_CAMPIONE_BINARIO, esitoDellaLettura, leggiTestoLimitato} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function fixture(t, contenuto) {
  const root = mkdtempSync(join(tmpdir(), 'talos-leggi-campione-'));
  t.after(() => rimuoviCartellaDiProva(root));
  writeFileSync(join(root, 'file.txt'), contenuto);
  return root;
}
/* An `open` whose handle returns at most `massimo` bytes per read, and counts them. */
function aperturaCorta(massimo) {
  const conto = {byte: 0, chiusure: 0};
  const apriFn = async (percorso, flags) => {
    const h = await open(percorso, flags);
    return {
      stat: () => h.stat(),
      close: async () => { conto.chiusure++; await h.close(); },
      read: async (b, o, n, p) => { const r = await h.read(b, o, Math.min(n, massimo), p); conto.byte += r.bytesRead; return r; },
    };
  };
  return {apriFn, conto};
}

test('G02-10d: a NUL at the end of the sample is found behind short reads, and only the sample is read', async t => {
  const root = fixture(t, Buffer.concat([Buffer.alloc(BYTE_CAMPIONE_BINARIO - 1, 65), Buffer.alloc(20_000)]));
  const {apriFn, conto} = aperturaCorta(127);
  const letta = await leggiTestoLimitato(root, 'file.txt', {apriFn});
  assert.equal(letta.binario, true, 'binary, as with full reads');
  assert.equal(letta.testo, null);
  assert.equal(conto.byte, BYTE_CAMPIONE_BINARIO, 'the sample, not the whole file');
  assert.equal(conto.chiusure, 1);
  assert.match(esitoDellaLettura(letta, 'file.txt'), /is a binary file/u);
});

test('G02-10d: short reads of a text file still return every line, each byte read once', async t => {
  const testo = 'é🌍漢字 riga\n'.repeat(1700);
  const root = fixture(t, testo);
  const {apriFn, conto} = aperturaCorta(127);
  const letta = await leggiTestoLimitato(root, 'file.txt', {apriFn});
  assert.equal(letta.binario, false);
  assert.equal(letta.testo, testo, 'no character split at a read boundary');
  assert.equal(conto.byte, Buffer.byteLength(testo), 'the completed sample is not read twice');
  assert.equal(conto.chiusure, 1);
});

test('G02-10d: a file shorter than the sample ends the sample at EOF', async t => {
  const root = fixture(t, 'ciao\n');
  const {apriFn, conto} = aperturaCorta(2);
  const letta = await leggiTestoLimitato(root, 'file.txt', {apriFn});
  assert.equal(letta.testo, 'ciao\n');
  assert.equal(conto.byte, 5);
});
