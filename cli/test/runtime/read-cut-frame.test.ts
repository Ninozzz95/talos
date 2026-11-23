/*
 * Kernel merge (F-027): a cut `leggi` result keeps the data boundary's opening line at the start of the head and its closing line at
 * the end of the tail (talosHarness.mjs: `conConfine`, then `uscitaUtile(esito, 8_000, 0.5)`). `parseToolResultCut` states the lines the
 * model saw OF THE FILE: those two lines, and the paged read's own header, are not file lines. The characters stay as received.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {parseToolResultCut} from '../../src/runtime/output-store.ts';

const MARKER='\n\n… [TALOS cut 500 characters from the middle of this output] …\n\n';
const OPEN='<<<TALOS_DATA id=0123456789ab from="leggi big.txt">>>\n';
const CLOSE='\n<<<END_TALOS_DATA id=0123456789ab>>>';
const HEADER='[TALOS read lines 1-2000 of 3000 in "big.txt"; the next page starts at line 2001]\n';

test('a cut inside the boundary counts the file\'s lines only',()=>{
  const framed=`${OPEN}l1\nl2\nl3${MARKER}l8\nl9\nl10\n${CLOSE}`;
  const cut=parseToolResultCut(framed)!;
  assert.equal(cut.shownLines,6,'3 lines in the head, 3 in the tail; the two frame lines are not counted');
  assert.equal(cut.totalLines,null);
  assert.equal(parseToolResultCut(`l1\nl2\nl3${MARKER}l8\nl9\nl10\n`)!.shownLines,6,'without a boundary the count is the same');
});

test('a paged read counts neither its header nor the frame',()=>{
  const framed=`${HEADER}${OPEN}l1\nl2\nl3${MARKER}l8\nl9\nl10\n${CLOSE}`;
  const cut=parseToolResultCut(framed)!;
  assert.equal(cut.shownLines,6);
  assert.equal(cut.totalLines,3000);
});

test('the characters are those the model received, frame included; the removed ones come from the marker',()=>{
  const framed=`${OPEN}l1\nl2\nl3${MARKER}l8\nl9\nl10\n${CLOSE}`;
  const cut=parseToolResultCut(framed)!;
  const kept=framed.length-MARKER.length;
  assert.deepEqual([cut.limitChars,cut.shownChars,cut.totalChars],[kept,kept,kept+500]);
});

test('only the closing line at the very end is the frame\'s; one in the middle of the tail is a line of the file',()=>{
  const cut=parseToolResultCut(`${OPEN}l1\nl2${MARKER}l8\n<<<END_TALOS_DATA id=0123456789ab>>>\nl9\n${CLOSE}`)!;
  assert.equal(cut.shownLines,5,'2 in the head; l8, the look-alike line and l9 in the tail');
});

test('text that merely looks like a frame in the middle of a file is not stripped',()=>{
  const cut=parseToolResultCut(`l1\n<<<TALOS_DATA id=0123456789ab from="x">>>\nl3${MARKER}l8\nl9\n`)!;
  assert.equal(cut.shownLines,5,'the frame-looking line is not at the very start of the head, so it is a line of the file');
});
