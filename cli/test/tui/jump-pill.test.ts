/*
 * Tappa 8 C1, corrected by the owner (09/10/2026: «nella 0.5.0 jump to bottom è in alto a destra, deve essere in basso al
 * centro»): while scrolled up, the LAST row of the transcript window is the pill ` ↓ Jump to bottom` (plus ` · N new` when
 * unseen messages wait), CENTRED; the label itself is the click target (verb `jump`, mockup :1122: scroll=0, follow=true,
 * newAway=0 — the same thing `reduceViewport('jump-tail')` already does). The 0.5.0 drew it as the FIRST row, at the right.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {transcriptJumpPillRow} from '../../src/tui/components/transcript-virtualizer.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

test('the pill is the mockup label, centred, and its label is the target',()=>{
  const label=' ↓ Jump to bottom ';
  const row=transcriptJumpPillRow({columns:120,unseen:0,visible:true})!;
  const pad=Math.floor((120-displayWidth(label))/2);
  assert.equal(row.text,' '.repeat(pad)+label);
  assert.equal(row.targetFrom,pad);
  assert.deepEqual(transcriptJumpPillRow({columns:120,unseen:0,visible:true}),row,'the row is stable for the same input');
});

test('the unseen counter rides along as « · N new», still centred',()=>{
  const label=' ↓ Jump to bottom · 3 new ';
  const row=transcriptJumpPillRow({columns:80,unseen:3,visible:true})!;
  assert.equal(row.text,' '.repeat(Math.floor((80-displayWidth(label))/2))+label);
  assert.equal(row.targetFrom,row.text.length-displayWidth(label));
});

test('a transcript narrower than the label clamps the padding at zero (the row truncates, like the mockup)',()=>{
  const row=transcriptJumpPillRow({columns:14,unseen:0,visible:true})!;
  assert.ok(row.text.startsWith(' ↓ Jump to bottom'),`no negative padding: ${JSON.stringify(row.text)}`);
  assert.equal(row.targetFrom,0);
});
