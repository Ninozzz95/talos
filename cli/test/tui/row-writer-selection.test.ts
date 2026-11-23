/*
 * Stage 6c (owner 02/10: «selezione della CLI»): the row writer, which already holds the rows of the last frame, draws the
 * selection over them (inverse, the mockup's `selbox`) and gives their text back for the copy. A drag repaints only the rows
 * the selection covers or covered — no React render; a new frame keeps the selection drawn; clearing it repaints those rows
 * as they are.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRowWriter} from '../../src/tui/row-writer.ts';

const ESC='\u001b';
function stream(){const writes:string[]=[];return{writes,s:{columns:20,rows:5,write:(chunk:string)=>{writes.push(chunk);return true;}}};}

test('the selection is drawn over the frame, only on the rows it covers, and its text is read back plain',()=>{
  const f=stream();const w=createRowWriter(f.s);
  w(`${ESC}[31mfirst row${ESC}[39m\nsecond row\nthird row`);
  assert.deepEqual(w.lines(),['first row','second row','third row'],'the plain text of the last frame');
  f.writes.length=0;
  w.select({a:{row:0,col:6},b:{row:1,col:5}});
  const out=f.writes.join('');
  assert.ok(out.includes(`${ESC}[1;1H`)&&out.includes(`${ESC}[2;1H`),'rows 1 and 2 repainted');
  assert.ok(!out.includes(`${ESC}[3;1H`),'row 3 untouched');
  assert.ok(out.includes(`${ESC}[7mrow${ESC}[39m${ESC}[7m${ESC}[27m`)||out.includes(`${ESC}[7mrow`),'the end of row 1 inverse');
  assert.ok(out.includes(`${ESC}[7msecond${ESC}[27m row`),'the start of row 2 inverse');
});

test('a new frame keeps the selection drawn; clearing it repaints those rows plain',()=>{
  const f=stream();const w=createRowWriter(f.s);
  w('alpha\nbeta\ngamma');w.select({a:{row:1,col:0},b:{row:1,col:3}});
  f.writes.length=0;
  w('alpha\nbeta\ngamma!');
  assert.ok(!f.writes.join('').includes(`${ESC}[2;1H`),'the selected row did not change: not rewritten');
  w('alpha\nBETA\ngamma!');
  assert.ok(f.writes.join('').includes(`${ESC}[7mBETA${ESC}[27m`),'a changed row under the selection is drawn selected');
  f.writes.length=0;
  w.select(null);
  const out=f.writes.join('');
  assert.ok(out.includes(`${ESC}[2;1H`)&&out.includes('BETA')&&!out.includes(`${ESC}[7m`),'cleared: the row plain again');
});
