/*
 * OEM36 tappa 2 (ledger Codex `LEDGER-OEM36-2026-09-30.md`; owner 30/09 sera): l'ANTEPRIMA di un comando si decodifica
 * con StringDecoder, che trasforma in «\uFFFD» i byte non UTF-8 senza dirlo. Ora un validatore UTF-8 rigoroso in parallelo, per
 * flusso, dichiara in TESTA che l'anteprima non è fedele e come recuperare i byte veri, senza rieseguire il comando.
 * ⛔ Non si cerca il carattere «\uFFFD» nel testo: può essere testo legittimo (OEM36-LITERAL-REPLACEMENT).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {captureProcessOutput, formatCapturedOutput} from '../src/kernel/process-output-capture.mjs';

async function cattura(pezzi) {
  const child = {stdout: new PassThrough(), stderr: new PassThrough()};
  const ricevuti = [];
  const run = captureProcessOutput(child, {onBytes: async ({stream, bytes}) => { ricevuti.push([stream, Buffer.from(bytes)]); }});
  for (const [stream, bytes] of pezzi) child[stream].write(bytes);
  child.stdout.end(); child.stderr.end();
  const esito = await run.settled;
  return {esito, ricevuti};
}
const CP850 = Buffer.from('4574853a20706997208a2099', 'hex'); // «Età: più è Ö» scritto da .NET in cp850

test('OEM36-PREVIEW-STDOUT: a non-UTF-8 stdout is declared at the head; raw bytes and state are unchanged', async () => {
  const {esito, ricevuti} = await cattura([['stdout', CP850]]);
  assert.deepEqual(esito.metadata.previewEncoding, {stdout: 'invalid-utf8', stderr: 'utf-8'});
  assert.equal(esito.metadata.state, 'delivered');
  assert.deepEqual(Buffer.concat(ricevuti.map(([, b]) => b)), CP850, 'the sink receives the original bytes');
  const testo = formatCapturedOutput(esito.combined.text, esito.metadata);
  assert.match(testo, /^\[TALOS output preview is not faithful: stdout is not valid UTF-8/);
  assert.match(testo, /process_output/); assert.match(testo, /only if the program is known/);
  assert.doesNotMatch(testo, /rerun the command|run it again/i);
});

test('OEM36-PREVIEW-STDERR: the two streams are judged separately', async () => {
  const {esito} = await cattura([['stdout', Buffer.from('tutto bene\n')], ['stderr', CP850]]);
  assert.deepEqual(esito.metadata.previewEncoding, {stdout: 'utf-8', stderr: 'invalid-utf8'});
  assert.match(formatCapturedOutput(esito.combined.text, esito.metadata), /^\[TALOS output preview is not faithful: stderr is not valid UTF-8/);
});

test('OEM36-PREVIEW-EOF: a character cut by the end of the stream is invalid, not silently dropped', async () => {
  const {esito} = await cattura([['stdout', Buffer.from([0x61, 0xe2, 0x82])]]);
  assert.equal(esito.metadata.previewEncoding.stdout, 'invalid-utf8');
});

test('OEM36-SPLIT: valid UTF-8 split across writes gives no false warning', async () => {
  const euro = Buffer.from('€🦋 ok\n');
  const {esito} = await cattura([...euro].map((b) => ['stdout', Buffer.from([b])]));
  assert.deepEqual(esito.metadata.previewEncoding, {stdout: 'utf-8', stderr: 'utf-8'});
  assert.doesNotMatch(formatCapturedOutput(esito.combined.text, esito.metadata), /not faithful/);
});

test('OEM36-LITERAL-REPLACEMENT: a real U+FFFD written as valid UTF-8 is text, not a warning', async () => {
  const {esito} = await cattura([['stdout', Buffer.from('carattere \uFFFD legittimo\n')]]);
  assert.equal(esito.metadata.previewEncoding.stdout, 'utf-8');
  assert.equal(formatCapturedOutput(esito.combined.text, esito.metadata), 'carattere \uFFFD legittimo\n');
});

test('OEM36-INTERLEAVED: a character split across writes stays valid even when the other stream writes in between', async () => {
  const euro = Buffer.from('€');
  const {esito} = await cattura([['stdout', euro.subarray(0, 1)], ['stderr', Buffer.from('x')], ['stdout', euro.subarray(1)], ['stderr', Buffer.from('ü')]]);
  assert.deepEqual(esito.metadata.previewEncoding, {stdout: 'utf-8', stderr: 'utf-8'}, 'each stream has its own validator state');
});
