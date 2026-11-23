/**
 * FE-048, the frames of the block for the Frontend, from the BUILT CLI in true colours: the agents page with its views, an agent stopped with `x`
 * (it says so, and it counts as Stopped, neither an error nor finished), and the CLI usage page with its three tabs, from a turn really recorded.
 * The frames go to TALOS_FRAMES_HTML.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s85',files:{'README.md':'# demo\n'},extraEnv:{...sinkEnv(sink),COLORTERM:'truecolor'}});
const COLS=120,ROWS=30;
const hex=(value:number)=>`#${value.toString(16).padStart(6,'0')}`;
const frames:string[]=[];
const cellOf=(t:TerminalSession,row:number,col:number)=>(t as any).term.buffer.active.getLine(row).getCell(col);
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
const onAgents=(x:{text:string})=>/^ Agents · this session/mu.test(x.text);

test('s85 · the agents page and the CLI usage page, in the frames of the block',async()=>{
  const t=s.launch([],{cols:COLS,rows:ROWS});await toComposer(t);
  try{
    await t.submit('A first turn, so that the record has a line');
    await t.waitFor('the answer',x=>/✓ Done in/u.test(x.text),{timeout:30_000});
    await t.submit('DELEGATE:LONG one sub-task');
    await t.waitFor('the agent works',x=>/← 1 agent /u.test(x.text),{timeout:30_000});
    /* CLI 0.6.15 kit, 4th round (16/11/2026): «LONG child work» is also in the transcript («Delegate subtask LONG child work»), so
       the wait was met before the card was drawn and the second Ctrl+A left 8 ms after the first (measured with a probe on the
       keys, 5 runs: 4 red). Sent that close, the two Ctrl+A came in ONE read and the second was dropped as a control character in
       text (keybindings.ts splitInputChunk, the same in 0.6.14: a known limit). The wait is for the card in the right panel. */
    t.press('ctrl+a');await t.waitFor('the card',x=>/▾ Agents +1 running/u.test(x.text),{timeout:10_000});
    t.press('ctrl+a');
    const list=await t.waitFor('the list',x=>onAgents(x)&&/ All 1 .* Stopped 0/u.test(x.text),{timeout:10_000});await still(t);
    assert.match(list.text,/x stop/u,'a working agent offers x');
    shot(t,'Agents: List, an agent at work');
    t.press('right');await t.waitFor('the timeline',x=>onAgents(x)&&/Delegations over time/u.test(x.text),{timeout:5_000});await still(t);
    shot(t,'Agents: Timeline');
    t.press('left');await t.waitFor('the list again',x=>onAgents(x)&&/ All 1 /u.test(x.text),{timeout:5_000});
    t.send('x');
    const stopped=await t.waitFor('stopped, and said',x=>onAgents(x)&&/Stopped: /u.test(x.text),{timeout:15_000});
    shot(t,'Agents: the toast after x');
    const counted=await t.waitFor('it counts as stopped',x=>onAgents(x)&&/Errors 0 .* Finished 0 .* Stopped 1/u.test(x.text),{timeout:15_000});await still(t);
    assert.doesNotMatch(counted.lines.at(-1)??'',/x stop/u,'an agent that ended offers no x');
    void stopped;
    shot(t,'Agents: a stopped agent, the foot without x');
    t.press('esc');await t.waitFor('closed',x=>!onAgents(x),{timeout:5_000});
    await t.waitFor('the turn ended',x=>/esc to stop/u.test(x.text)===false,{timeout:60_000});
    await t.submit('/usage');
    await t.waitFor('By day',x=>/── CLI usage/u.test(x.text)&&/Tokens per day, by model/u.test(x.text),{timeout:15_000});await still(t);
    shot(t,'CLI usage: By day');
    t.press('tab');await t.waitFor('By model',x=>/last two weeks/u.test(x.text)&&!/Tokens per day/u.test(x.text),{timeout:5_000});await still(t);
    shot(t,'CLI usage: By model');
    t.press('tab');await t.waitFor('Calendar',x=>/each square is a day/u.test(x.text),{timeout:5_000});await still(t);
    shot(t,'CLI usage: Calendar');
    t.send('s');await t.waitFor('this session',x=>/── Settings/u.test(x.text),{timeout:10_000});
  }finally{await t.close();}
});

test.after(async()=>{
  if(process.env.TALOS_FRAMES_HTML)writeFileSync(process.env.TALOS_FRAMES_HTML,`<!doctype html><meta charset=utf-8><style>body{background:#111;color:#ddd;font:14px Consolas,monospace}pre{line-height:1.0;font-family:Consolas,monospace}</style>${frames.join('')}`);
  await sink.close();
});
