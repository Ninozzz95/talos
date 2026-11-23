/**
 * FE-052: on the BUILT CLI through ConPTY, /shelf draws the scene the owner chose: half-block pixels in true colour, the disk of the conversation
 * with its name in plain cells, a soft background under the pointer on that disk only, and Esc back to the chat.
 * With TALOS_FRAMES_HTML set, the frames are written there with their true colours.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s81',files:{'README.md':'# demo\n'},extraEnv:{...sinkEnv(sink),COLORTERM:'truecolor'}});
const ESC='\u001b';
const COLS=130,ROWS=36;
let t:TerminalSession;
const buffer=()=>(t as any).term.buffer.active;
const cellAt=(row:number,col:number)=>buffer().getLine(row).getCell(col);
const hex=(value:number)=>`#${value.toString(16).padStart(6,'0')}`;
const moveTo=(row:number,col:number)=>t.send(`${ESC}[<35;${col+1};${row+1}M`);
const look=(row:number,col:number)=>{const cell=cellAt(row,col);return`${cell.isFgRGB()?cell.getFgColor():'-'}/${cell.isBgRGB()?cell.getBgColor():'-'}`;};

function frameHtml(label:string):string{
  const rows:string[]=[];
  for(let row=0;row<ROWS;row+=1){
    let html='',open='';
    for(let col=0;col<COLS;col+=1){
      const cell=cellAt(row,col);if(!cell||cell.getWidth()===0)continue;
      const fg=cell.isFgRGB()?hex(cell.getFgColor()):'#c9d1d9',bg=cell.isBgRGB()?hex(cell.getBgColor()):'#080b11';
      const style=`color:${fg};background:${bg}${cell.isBold()?';font-weight:700':''}`;
      if(style!==open){if(open)html+='</span>';html+=`<span style="${style}">`;open=style;}
      const ch=cell.getChars()||' ';html+=ch==='<'?'&lt;':ch==='&'?'&amp;':ch;
    }
    rows.push(`${html}</span>`);
  }
  return `<h2>${label}</h2><pre>${rows.join('\n')}</pre>`;
}

const frames:string[]=[];
const writeFrames=()=>{if(process.env.TALOS_FRAMES_HTML)writeFileSync(process.env.TALOS_FRAMES_HTML,`<!doctype html><meta charset=utf-8><style>body{background:#111;color:#ddd;font:14px Consolas,monospace}pre{line-height:1.0;font-family:Consolas,monospace}</style>${frames.join('')}`);};

test('s81 · /shelf is the scene, the pointer lights one disk, Esc goes back',async()=>{
  t=s.launch([],{cols:COLS,rows:ROWS});await toComposer(t);
  await t.submit('DELEGATE:LONG one sub-task');
  await t.waitFor('the turn done',x=>/✓ Done in/u.test(x.text),{timeout:30_000});
  await t.submit('/shelf');
  const page=await t.waitFor('the scene',x=>/Shelf/u.test(x.text)&&/DELEGATE/u.test(x.text)&&/▀/u.test(x.text),{timeout:15_000});
  frames.push(frameHtml('the shelf'));
  const row=page.lines.findIndex(line=>line.includes('DELEGATE')),col=page.lines[row]!.indexOf('DELEGATE')+2;
  assert.ok(row>=0);
  const before=look(row,col),wall=look(1,COLS-3);
  moveTo(row,col);
  const until=Date.now()+5_000;
  while(Date.now()<until&&look(row,col)===before){await new Promise(done=>setTimeout(done,40));await t.settled();}
  if(look(row,col)===before)console.error(JSON.stringify({row,col,before,line:page.lines[row]}));
  assert.notEqual(look(row,col),before,'the disk under the pointer did not change');
  assert.equal(Boolean(cellAt(row,col).isInverse()),false,'a hover is not a selection');
  assert.equal(look(1,COLS-3),wall,'the wall stays as it is');
  frames.push(frameHtml('the pointer on the disk'));
  moveTo(ROWS-1,COLS-2);
  await new Promise(done=>setTimeout(done,150));await t.settled();
  t.send('e');
  await t.waitFor('the list form',x=>/› /u.test(x.text)&&!/▀/u.test(x.text));
  frames.push(frameHtml('the list, on the e key'));
  t.send(ESC);
  await t.waitFor('back to the chat',x=>!/Shelf/u.test(x.text));
  writeFrames();
  await t.close();
});

test.after(async()=>{writeFrames();await t?.close?.();await sink.close();});
