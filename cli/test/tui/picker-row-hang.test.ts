/*
 * R14 (03/11/2026, built CLI at 80×24): in the /help menu a command whose description did not fit went on at column 1, under the
 * «›» marker («│revoke one»). A picker row's continuation now starts under its text; every word is still there; a line that is not
 * a picker row wraps as before; a box too narrow for the indent keeps the plain wrap.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fitOverlay,pickerSection} from '../../src/tui/overlays/scroll-window.ts';

const DEVICES='/devices · The devices paired with this computer, their folders; pair or revoke one';
/* long enough that its continuation rows fill the box: a row re-wrapped at the full width would then overflow it */
const LONG='/plugins · '+'Install, enable, update or remove the plugins of this project and of your profile, '.repeat(2).trim();
const words=(rows:readonly {text:string}[])=>rows.map(row=>row.text).join(' ').split(/\s+/u).filter(Boolean);
const body=(fitted:ReturnType<typeof fitOverlay>)=>fitted.rows.filter(row=>row.role==='body');

test('a picker row that wraps goes on under its text, not under the marker',()=>{
  const fitted=fitOverlay({sections:[pickerSection([DEVICES,'/help · Commands and keys'],1,row=>row)]},{columns:50});
  const rows=body(fitted);
  assert.ok(rows.length>=3,'the long row wraps');
  assert.match(rows[0]!.text,/^ {2}\/devices/u);
  for(const row of rows.slice(1,-1))assert.match(row.text,/^ {2}\S/u,`continuation «${row.text}» starts under the text`);
  for(const row of rows)assert.ok(row.text.length<=48,`«${row.text}» stays inside the box (48 cells inside the border)`);
  assert.deepEqual(words(rows),words([{text:`  ${DEVICES}`},{text:'› /help · Commands and keys'}]),'no word lost');
});

test('continuation rows fill the box and never overflow it',()=>{
  const rows=body(fitOverlay({sections:[pickerSection([LONG],0,row=>row)]},{columns:50}));
  assert.ok(rows.length>=4);
  for(const row of rows)assert.ok(row.text.length<=48,`«${row.text}» (${row.text.length}) stays inside the box`);
  assert.ok(rows.slice(1,-1).some(row=>row.text.length>=44),'the rows are filled, not cut short');
  assert.deepEqual(words(rows),words([{text:`› ${LONG}`}]),'no word lost');
});

test('the selected row hangs the same way',()=>{
  const rows=body(fitOverlay({sections:[pickerSection([DEVICES],0,row=>row)]},{columns:50}));
  assert.match(rows[0]!.text,/^› \/devices/u);
  for(const row of rows.slice(1))assert.match(row.text,/^ {2}\S/u);
});

test('a line that is not a picker row wraps as before',()=>{
  const rows=body(fitOverlay({sections:[{lines:[{text:DEVICES}]}]},{columns:50}));
  assert.ok(rows.length>=2);
  assert.ok(rows.slice(1).some(row=>/^\S/u.test(row.text)),'no indent was added');
});

test('a box too narrow for the indent keeps the plain wrap',()=>{
  const rows=body(fitOverlay({sections:[pickerSection([DEVICES],0,row=>row)]},{columns:10}));
  /* at 8 cells a word longer than a row is broken inside it (wrapDisplay): the letters, not the words, are what is kept */
  assert.equal(rows.map(row=>row.text).join('').replace(/\s/gu,''),`›${DEVICES}`.replace(/\s/gu,''),'every letter is kept');
  assert.ok(rows.slice(1).some(row=>/^\S/u.test(row.text)),'no indent at this width');
});
