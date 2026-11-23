/*
 * Stage 6c (owner 02/10; the approved mockup's mousedown/mousemove/mouseup/dblclick/keydown, MOCKUP-FASE-UI-2026-10-01.html:
 * 1063, 1116-1119). A press starts a selection where it lands; a drag draws it (only on the rows it covers, through the row
 * writer); the release copies it and says so («Copied 3 lines»); a double click copies the word under the pointer; any key
 * takes the selection away; Ctrl+C with a selection copies it (the VS Code terminal sends Ctrl+C to TALOS: its own copy only
 * works on its own selection). A press without a drag selects nothing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPointerSelection} from '../../src/tui/pointer-selection.ts';
import type {Selection} from '../../src/tui/selection.ts';

function harness(lines:string[]){
  const drawn:Array<Selection|null>=[];const copies:string[]=[];const told:Array<{kind:string;count?:number;word?:string}>=[];let clock=0;
  const p=createPointerSelection({writer:{select:s=>drawn.push(s),lines:()=>lines},now:()=>clock,
    copy:async text=>{copies.push(text);return{ok:true,where:'windows'};},onCopied:info=>told.push(info)});
  return{p,drawn,copies,told,tick:(ms:number)=>{clock+=ms;}};
}
const ev=(kind:'press'|'drag'|'release',col:number,row:number,extra={})=>({kind,button:0,col,row,shift:false,alt:false,ctrl:false,...extra});

test('press, drag, release: the selection is drawn as it moves and copied on release',async()=>{
  const h=harness(['alpha beta','gamma delta','epsilon']);
  h.p.pointer(ev('press',6,0));
  assert.deepEqual(h.drawn,[null],'a press clears what was selected');
  h.p.pointer(ev('drag',4,1));
  assert.deepEqual(h.drawn.at(-1),{a:{row:0,col:6},b:{row:1,col:4}});
  await h.p.pointer(ev('release',4,1));
  assert.deepEqual(h.copies,['beta\ngamma']);
  assert.deepEqual(h.told,[{kind:'lines',count:2,where:'windows'}]);
  assert.equal(h.p.text(),'beta\ngamma','the selection stays until a key');
  h.p.key();
  assert.equal(h.drawn.at(-1),null);assert.equal(h.p.text(),null);
});

test('a press and release in place selects nothing; a double click copies the word',async()=>{
  const h=harness(['retry budget is 3']);
  h.p.pointer(ev('press',8,0));await h.p.pointer(ev('release',8,0));
  assert.deepEqual(h.copies,[],'a plain click copies nothing');
  h.tick(200);
  h.p.pointer(ev('press',8,0));await h.p.pointer(ev('release',8,0));
  assert.deepEqual(h.copies,['budget']);
  assert.deepEqual(h.told.at(-1),{kind:'word',word:'budget',where:'windows'});
  assert.deepEqual(h.drawn.at(-1),{a:{row:0,col:6},b:{row:0,col:11}});
  h.tick(1_000);
  h.p.pointer(ev('press',8,0));await h.p.pointer(ev('release',8,0));
  assert.equal(h.copies.length,1,'a click a second later is not a double click');
});

test('only the left button selects; Ctrl+C copies an existing selection again',async()=>{
  const h=harness(['one two']);
  h.p.pointer({...ev('press',0,0),button:2});h.p.pointer({...ev('drag',3,0),button:2});
  assert.equal(h.p.text(),null);
  h.p.pointer(ev('press',0,0));h.p.pointer(ev('drag',2,0));await h.p.pointer(ev('release',2,0));
  assert.equal(await h.p.copyAgain(),true);
  assert.deepEqual(h.copies,['one','one']);
  h.p.key();
  assert.equal(await h.p.copyAgain(),false,'nothing selected: Ctrl+C is not a copy');
});

/* Stage 6c, «tutto cliccabile» (owner 02/10, «Al rilascio»: WCAG 2.5.2 Pointer Cancellation, the systems' buttons, OpenCode
   #24986): a target runs when the press and the release land on it with no drag between; dragging away cancels it and
   selects instead, so a drag that starts on an answer never sends it. Elsewhere the press selects as before. */
function targets(lines:string[]){
  const runs:string[]=[];const drawn:Array<Selection|null>=[];const copies:string[]=[];let clock=0;
  const p=createPointerSelection({writer:{select:s=>drawn.push(s),lines:()=>lines},now:()=>clock,copy:async text=>{copies.push(text);return{ok:true,where:'windows'};},onCopied:()=>{},
    target:cell=>cell.row===0&&cell.col<6?'send':cell.row===1&&cell.col<4?'skip':null,run:action=>runs.push(action)});
  return{p,runs,drawn,copies,tick:(ms:number)=>{clock+=ms;}};
}

test('a target runs on the release over it, not on the press',async()=>{
  const h=targets(['[Send] some text','Skip it']);
  h.p.pointer(ev('press',2,0));
  assert.deepEqual(h.runs,[],'nothing runs while the button is down');
  await h.p.pointer(ev('release',3,0));
  assert.deepEqual(h.runs,['send']);
  assert.deepEqual(h.drawn,[],'a click on a target draws no selection');
  assert.deepEqual(h.copies,[]);
  h.tick(100);
  h.p.pointer(ev('press',2,0));await h.p.pointer(ev('release',2,0));
  assert.deepEqual(h.runs,['send','send'],'two quick clicks on a target run it twice, never copy a word');
  assert.deepEqual(h.copies,[]);
});

test('dragging away from a target cancels it and selects; a release on another target runs nothing',async()=>{
  const h=targets(['[Send] some text','Skip it']);
  h.p.pointer(ev('press',2,0));h.p.pointer(ev('drag',10,0));await h.p.pointer(ev('release',10,0));
  assert.deepEqual(h.runs,[],'the drag cancelled the click');
  assert.deepEqual(h.copies,['end] some'],'and selected from the cell it started on');
  h.p.pointer(ev('press',2,0));await h.p.pointer(ev('release',1,1));
  assert.deepEqual(h.runs,[],'pressed on «send», released on «skip»');
  h.p.pointer(ev('press',7,0));h.p.pointer(ev('drag',10,0));await h.p.pointer(ev('release',10,0));
  assert.deepEqual(h.copies.at(-1),'some','a press elsewhere still selects');
});

test('a release lost outside the window leaves no target behind: the next double click copies its word',async()=>{
  const h=targets(['[Send] some text','Skip it']);
  h.p.pointer(ev('press',2,0));
  h.tick(1_000);
  h.p.pointer(ev('press',8,0));await h.p.pointer(ev('release',8,0));
  h.tick(100);
  h.p.pointer(ev('press',8,0));await h.p.pointer(ev('release',8,0));
  assert.deepEqual(h.copies,['some']);
  assert.deepEqual(h.runs,[]);
});
