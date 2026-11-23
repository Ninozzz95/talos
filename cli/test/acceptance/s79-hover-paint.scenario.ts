/**
 * FE-048, review of the Frontend (01/11): on the BUILT CLI through ConPTY, the pointer passing over a voice of the bar, a row of the chat and
 * the footer gives each its own soft background and never the inverse of a selection, and only on the element under it.
 * With TALOS_FRAMES_HTML set, the three frames are written there with their true colours.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s79',files:{'README.md':'# demo\n'},extraEnv:{...sinkEnv(sink),COLORTERM:'truecolor'}});
const ESC='\u001b';
const COLS=150,ROWS=40;
let t:TerminalSession;
const buffer=()=>(t as any).term.buffer.active;
const cellAt=(row:number,col:number)=>buffer().getLine(row).getCell(col);
const bgAt=(row:number,col:number):number|null=>{const cell=cellAt(row,col);return cell.isBgRGB()?cell.getBgColor():null;};
const moveTo=(row:number,col:number)=>t.send(`${ESC}[<35;${col+1};${row+1}M`);
const hex=(value:number)=>`#${value.toString(16).padStart(6,'0')}`;

function frameHtml(label:string):string{
  const rows:string[]=[];
  for(let row=0;row<ROWS;row+=1){
    let html='',open='';
    for(let col=0;col<COLS;col+=1){
      const cell=cellAt(row,col);if(!cell||cell.getWidth()===0)continue;
      const fg=cell.isFgRGB()?hex(cell.getFgColor()):'#c9d1d9',bg=cell.isBgRGB()?hex(cell.getBgColor()):'#080b11';
      const style=`color:${cell.isInverse()?bg:fg};background:${cell.isInverse()?fg:bg}${cell.isBold()?';font-weight:700':''}`;
      if(style!==open){if(open)html+='</span>';html+=`<span style="${style}">`;open=style;}
      const ch=cell.getChars()||' ';html+=ch==='<'?'&lt;':ch==='&'?'&amp;':ch;
    }
    rows.push(`${html}</span>`);
  }
  return `<h2>${label}</h2><pre>${rows.join('\n')}</pre>`;
}

/** Passes over `text`, and proves that its cells changed, that the cell after them did not, and that nothing is inverse. */
async function passOver(text:string,label:string,frames:string[],from=0,to=COLS){
  await t.settled();
  const lines=t.screen().lines;const row=lines.findIndex(line=>line.slice(from,to).includes(text));
  assert.ok(row>=0,`"${text}" is not on screen:\n${t.screen().text}`);
  const col=from+lines[row]!.slice(from,to).indexOf(text)+1;
  const before=bgAt(row,col);
  moveTo(row,col);
  const until=Date.now()+5_000;
  while(Date.now()<until&&bgAt(row,col)===before){await new Promise(done=>setTimeout(done,40));await t.settled();}
  assert.notEqual(bgAt(row,col),before,`${label}: the cell under the pointer did not change`);
  assert.equal(Boolean(cellAt(row,col).isInverse()),false,`${label}: a hover is not a selection`);
  frames.push(frameHtml(label));
  moveTo(ROWS-3,COLS-30);
  await new Promise(done=>setTimeout(done,120));await t.settled();
}

test('s79 · a soft background under the pointer on a voice of the bar, the chat and the footer',async()=>{
  t=s.launch([],{cols:COLS,rows:ROWS});await toComposer(t);
  await t.submit('DELEGATE:LONG one sub-task');
  await t.waitFor('the agent row in the chat',x=>/← 1 agent /u.test(x.text)&&/✓ Done in/u.test(x.text),{timeout:30_000});
  await t.submit('/full');
  await t.waitFor('both columns',x=>/New session/u.test(x.text)&&/Session details/u.test(x.text),{timeout:10_000});
  const frames:string[]=[];
  await passOver('Search chats','a voice of the bar',frames);
  await passOver('Delegate subtask','a row of the chat',frames,26,COLS-42);
  await passOver('ctx ','the footer',frames);
  /* the row of the agent at work in the bar moves and counts: its id in the list and in the kernel's events are the same */
  await t.waitFor('the agent at work with its seconds',x=>/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] LONG child work +[1-9]\d*s/u.test(x.text),{timeout:10_000});
  if(process.env.TALOS_FRAMES_HTML)writeFileSync(process.env.TALOS_FRAMES_HTML,`<!doctype html><meta charset="utf-8"><title>Passaggio del mouse</title><style>body{background:#111;color:#ddd;font:14px Consolas,monospace}pre{line-height:1.2;margin:0 0 24px}</style>${frames.join('')}`);
  await t.close();
});

test.after(async()=>{await sink.close();});
