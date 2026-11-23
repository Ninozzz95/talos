/**
 * Stage 6c (owner 02/10: «mouse acceso, selezione della CLI»; the approved mockup's mousedown/mousemove/mouseup/dblclick/
 * keydown), on the BUILT CLI through ConPTY. The terminal's SGR mouse reports are sent as a person's pointer would send them.
 * The copy goes into the test profile's own file (TALOS_CLIPBOARD_FILE): the real clipboard is never touched.
 *   - a drag paints the cells inverse and, on release, copies them and says so («Copied 1 line · Windows clipboard»);
 *   - a key takes the selection away and still reaches the composer;
 *   - a double click copies the word under the pointer («Copied "Hello"»);
 *   - Ctrl+C with a selection copies it again, interrupts nothing, and the selection goes (the next Ctrl+C is the usual one).
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {clearComposer,exitTalos,stage,toComposer,turn} from './harness.ts';
import type {TerminalSession} from './terminal.ts';

const s=stage({name:'s47',files:{'README.md':'# demo\n'}});
let t:TerminalSession;
const ESC='\u001b';
const clipboard=()=>{try{return readFileSync(join(s.profile.home,'clipboard.txt'),'utf8');}catch{return null;}};
/* 0-based cell → the SGR report a terminal sends (1-based) */
const press=(col:number,row:number)=>t.send(`${ESC}[<0;${col+1};${row+1}M`);
const drag=(col:number,row:number)=>t.send(`${ESC}[<32;${col+1};${row+1}M`);
const release=(col:number,row:number)=>t.send(`${ESC}[<0;${col+1};${row+1}m`);
const inverse=(col:number,row:number)=>Boolean((t as any).term.buffer.active.getLine(row)?.getCell(col)?.isInverse());
function find(text:string){const lines=t.screen().lines;const row=lines.findIndex(line=>line.includes(text));assert.ok(row>=0,`"${text}" is not on screen:\n${t.screen().text}`);return{row,col:lines[row]!.indexOf(text)};}

test('s47 · a drag selects, paints and copies; a key clears it and still types',async()=>{
  t=s.launch([],{cols:100,rows:30});await toComposer(t);
  await turn(t,s.fake,'Hello selection world.');
  const at=find('Hello selection world.');
  const from=at.col+6,to=at.col+21;
  press(from,at.row);drag(from+4,at.row);drag(to,at.row);release(to,at.row);
  await t.waitFor('the toast says it copied',x=>/Copied 1 line · Windows clipboard/u.test(x.text),{timeout:5_000});
  assert.equal(clipboard(),'selection world.');
  assert.ok(inverse(from,at.row)&&inverse(to,at.row),'the selected cells are painted inverse');
  assert.ok(!inverse(from-2,at.row)&&!inverse(to+1,at.row),'the cells around stay as they were');
  t.send('z');
  await t.waitFor('the key reached the composer',x=>x.lines.some(line=>/│ ›\s*z/u.test(line)),{timeout:5_000});
  assert.ok(!inverse(from,at.row),'a key takes the selection away');
  await clearComposer(t);
});

test('s47 · a double click copies the word under the pointer',async()=>{
  const at=find('Hello selection world.');
  press(at.col+2,at.row);release(at.col+2,at.row);press(at.col+2,at.row);release(at.col+2,at.row);
  await t.waitFor('the toast names the word',x=>/Copied "Hello"/u.test(x.text),{timeout:5_000});
  assert.equal(clipboard(),'Hello');
});

test('s47 · Ctrl+C with a selection copies it again and interrupts nothing',async()=>{
  const at=find('Hello selection world.');
  press(at.col,at.row);drag(at.col+4,at.row);release(at.col+4,at.row);
  await t.waitFor('copied',()=>clipboard()==='Hello',{timeout:5_000});
  writeFileSync(join(s.profile.home,'clipboard.txt'),'emptied');
  t.press('ctrl+c');
  await t.waitFor('copied again',()=>clipboard()==='Hello',{timeout:5_000});
  /* then the selection goes (as Windows Terminal and VS Code do), so the next Ctrl+C means what it always means */
  await t.waitFor('the selection is gone',()=>!inverse(at.col,at.row),{timeout:5_000});
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.doesNotMatch(t.screen().text,/Ctrl\+C again|press Ctrl\+C|to exit/iu,'Ctrl+C with a selection must not start the exit');
  assert.equal(t.exit,null,'TALOS is still running');
  assert.ok(await exitTalos(t));
});
