/*
 * Stage 6c (owner 02/10: «selezione della CLI», copy on release, double-click a word; registro 12). As the approved mockup's
 * `selectedText` and `dblclick` (MOCKUP-FASE-UI-2026-10-01.html:799, 1119): the selection is read from the text of the last
 * frame, the first row from where the drag began, the rows between whole, the last row up to where it ended, trailing spaces
 * dropped; a double click takes the run of non-blank characters under the pointer. Cells, not characters: a wide character
 * takes two cells. The highlight is drawn over the row as painted (its colours kept around it), inverse inside the range,
 * put back after any colour change inside it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {highlightRow,selectedText,wordAt} from '../../src/tui/selection.ts';

const ESC='\u001b';
const lines=['  You asked for the retry budget.   ','TALOS','The budget is 3 attempts per request.','漢字 wide cells'];

test('the text between two cells, rows between whole, trailing spaces dropped, in either drag direction',()=>{
  assert.equal(selectedText(lines,{row:0,col:6},{row:2,col:5}),'asked for the retry budget.\nTALOS\nThe bu');
  assert.equal(selectedText(lines,{row:2,col:5},{row:0,col:6}),'asked for the retry budget.\nTALOS\nThe bu','dragged upwards');
  assert.equal(selectedText(lines,{row:2,col:4},{row:2,col:9}),'budget');
  assert.equal(selectedText(lines,{row:3,col:0},{row:3,col:3}),'漢字','a wide character is two cells');
  assert.equal(selectedText(lines,{row:3,col:1},{row:3,col:2}),'漢字','a cell inside a wide character takes the character');
  assert.equal(selectedText(lines,{row:9,col:0},{row:9,col:4}),'','outside the frame: nothing');
});

test('a double click takes the word under the pointer',()=>{
  assert.deepEqual(wordAt(lines[2]!,6),{start:4,end:9,text:'budget'});
  assert.deepEqual(wordAt(lines[2]!,3),null,'a blank cell is no word');
  assert.deepEqual(wordAt(lines[3]!,1),{start:0,end:3,text:'漢字'});
});

test('the highlight keeps the row\'s colours around it and stays inverse across a colour change inside it',()=>{
  const row=`${ESC}[31mred${ESC}[39m plain ${ESC}[1mbold${ESC}[22m`;
  const shown=highlightRow(row,2,7);
  assert.equal(shown,`${ESC}[31mre${ESC}[7md${ESC}[39m${ESC}[7m plai${ESC}[27mn ${ESC}[1mbold${ESC}[22m`);
  assert.equal(highlightRow('abc',5,9),'abc','a range past the row changes nothing');
  assert.equal(highlightRow('abcdef',1,2),`a${ESC}[7mbc${ESC}[27mdef`);
});
