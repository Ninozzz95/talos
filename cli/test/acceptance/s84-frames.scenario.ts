/**
 * FE-048, review of the Frontend (01/11): the frames still unseen, from the BUILT CLI in true colours: the ✕ of both columns, Help as a page, the
 * long commands as pages, the queue's band; and the pointer on a row of the Home and on its `alt+h`: it lights that piece and nothing beside it.
 * The frames go to TALOS_FRAMES_HTML.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s84',files:{'README.md':'# demo\n'},extraEnv:{...sinkEnv(sink),COLORTERM:'truecolor'}});
const COLS=120,ROWS=30;
const hex=(value:number)=>`#${value.toString(16).padStart(6,'0')}`;
const frames:string[]=[];
const cellOf=(t:TerminalSession,row:number,col:number)=>(t as any).term.buffer.active.getLine(row).getCell(col);
const bg=(t:TerminalSession,row:number,col:number)=>{const cell=cellOf(t,row,col);return cell.isBgRGB()?cell.getBgColor():null;};
function shot(t:TerminalSession,label:string){
  const out:string[]=[];
  for(let row=0;row<ROWS;row+=1){
    let html='',open='';
    for(let col=0;col<COLS;col+=1){
      const cell=cellOf(t,row,col);if(!cell||cell.getWidth()===0)continue;
      const fg=cell.isFgRGB()?hex(cell.getFgColor()):'#c9d1d9',back=cell.isBgRGB()?hex(cell.getBgColor()):'#080b11';
      const style=`color:${fg};background:${back}${cell.isBold()?';font-weight:700':''}`;
      if(style!==open){if(open)html+='</span>';html+=`<span style="${style}">`;open=style;}
      const ch=cell.getChars()||' ';html+=ch==='<'?'&lt;':ch==='&'?'&amp;':ch;
    }
    out.push(`${html}</span>`);
  }
  frames.push(`<h2>${label}</h2><pre>${out.join('\n')}</pre>`);
}
const still=async(t:TerminalSession)=>{await t.settled();await new Promise(done=>setTimeout(done,350));await t.settled();};
const moveTo=(t:TerminalSession,row:number,col:number)=>t.send(`\u001b[<35;${col+1};${row+1}M`);
async function page(t:TerminalSession,command:string,title:RegExp,label:string){
  await t.submit(command);await t.waitFor(label,x=>title.test(x.text),{timeout:15_000});await still(t);shot(t,label);
  t.press('esc');await t.waitFor(`back from ${command}`,x=>!title.test(x.text));await still(t);
}
async function passOver(t:TerminalSession,text:string,label:string){
  const lines=t.screen().lines,row=lines.findIndex(line=>line.includes(text));assert.ok(row>=0,`${text} is not on screen`);
  const col=lines[row]!.indexOf(text)+1,beside=lines[row]!.length+2,before=bg(t,row,col),far=bg(t,row,Math.min(COLS-2,beside));
  moveTo(t,row,col);
  const until=Date.now()+5_000;
  while(Date.now()<until&&bg(t,row,col)===before){await new Promise(done=>setTimeout(done,40));await t.settled();}
  assert.notEqual(bg(t,row,col),before,`${label}: the piece under the pointer did not change`);
  assert.equal(Boolean(cellOf(t,row,col).isInverse()),false,'a hover is not a selection');
  assert.equal(bg(t,row,Math.min(COLS-2,beside)),far,`${label}: the cells past it stay`);
  shot(t,label);
  moveTo(t,ROWS-1,COLS-2);await new Promise(done=>setTimeout(done,150));await t.settled();
}

test('s84 · the frames still unseen, and the pointer on one piece',async()=>{
  const first=s.launch([],{cols:COLS,rows:ROWS});await toComposer(first);
  await first.submit('The first conversation of this project');
  await first.waitFor('the answer',x=>/✓ Done in/u.test(x.text),{timeout:30_000});
  await first.close();
  const t=s.launch([],{cols:COLS,rows:ROWS});await toComposer(t);
  try{
    await t.waitFor('the list',x=>/The first conversation/u.test(x.text),{timeout:10_000});await still(t);
    shot(t,'Home at 120×30, the window of Windows Terminal');
    await passOver(t,'The first conversation','the pointer on a row of the Home');
    await passOver(t,'alt+h','the pointer on alt+h');
    /* at 120 columns one column fits, the last asked */
    await t.submit('/full');await t.waitFor('the bar',x=>/New session/u.test(x.text),{timeout:10_000});await still(t);
    shot(t,'the bar, with its ✕');
    await t.submit('/panel');await t.waitFor('the panel',x=>/Session details/u.test(x.text),{timeout:10_000});await still(t);
    shot(t,'the panel, with its ✕');
    await t.submit('/essential');await t.waitFor('no column',x=>!/Session details/u.test(x.text),{timeout:10_000});await still(t);
    await page(t,'/help',/── Help TALOS/u,'Help as a page');
    await page(t,'/model',/── Model/u,'/model as a page');
    await page(t,'/permissions',/── Permissions/u,'/permissions as a page');
    await page(t,'/resume',/── Resume a conversation/u,'/resume as a page');
    await page(t,'/tasks',/── Tasks/u,'/tasks as a page');
    await t.submit('DELEGATE:LONG one sub-task');await t.waitFor('working',x=>/esc to stop|Type to queue/u.test(x.text),{timeout:15_000});
    await t.submit('A message that waits its turn');
    await t.waitFor('the band',x=>/1 queued/u.test(x.text),{timeout:10_000});await still(t);
    shot(t,'the queue, a band above the prompt');
  }finally{await t.close();}
});

test.after(async()=>{
  if(process.env.TALOS_FRAMES_HTML)writeFileSync(process.env.TALOS_FRAMES_HTML,`<!doctype html><meta charset=utf-8><style>body{background:#111;color:#ddd;font:14px Consolas,monospace}pre{line-height:1.0;font-family:Consolas,monospace}</style>${frames.join('')}`);
  await sink.close();
});
