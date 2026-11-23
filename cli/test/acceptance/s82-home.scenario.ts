/**
 * FE-048, owner 01/11: on the BUILT CLI the first screen is the Home with the prompt under it, typing goes straight to the prompt, and the
 * first message takes the Home away. With TALOS_FRAMES_HTML set, the frames the Frontend asked for are written there in true colours:
 * 60×24, 80×24, 100×30, 120×40, empty and full, and New session with its three tabs. Loading needs a slow list: test/tui/home.test.ts holds it.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s82',files:{'README.md':'# demo\n'},extraEnv:{...sinkEnv(sink),COLORTERM:'truecolor'}});
const hex=(value:number)=>`#${value.toString(16).padStart(6,'0')}`;

function frameHtml(t:TerminalSession,label:string,cols:number,rows:number):string{
  const buffer=(t as any).term.buffer.active;const out:string[]=[];
  for(let row=0;row<rows;row+=1){
    let html='',open='';
    for(let col=0;col<cols;col+=1){
      const cell=buffer.getLine(row).getCell(col);if(!cell||cell.getWidth()===0)continue;
      const fg=cell.isFgRGB()?hex(cell.getFgColor()):'#c9d1d9',bg=cell.isBgRGB()?hex(cell.getBgColor()):'#080b11';
      const style=`color:${fg};background:${bg}${cell.isBold()?';font-weight:700':''}`;
      if(style!==open){if(open)html+='</span>';html+=`<span style="${style}">`;open=style;}
      const ch=cell.getChars()||' ';html+=ch==='<'?'&lt;':ch==='&'?'&amp;':ch;
    }
    out.push(`${html}</span>`);
  }
  return `<h2>${label}</h2><pre>${out.join('\n')}</pre>`;
}
const frames:string[]=[];
const SIZES=[[60,24],[80,24],[100,30],[120,40]] as const;

test('s82 · an empty first launch: the Home, the prompt under it, and the first letter goes to the prompt',async()=>{
  for(const [cols,rows] of SIZES){
    const t=s.launch([],{cols,rows});await toComposer(t);
    const home=await t.waitFor('the Home',x=>/Pick up your work/u.test(x.text)&&/Open a project or a conversation/u.test(x.text),{timeout:10_000});
    assert.doesNotMatch(home.text,/Welcome to TALOS/u);
    assert.match(home.text,/Ask TALOS/u,'the prompt is there');
    frames.push(frameHtml(t,`${cols}×${rows}, empty list`,cols,rows));
    await t.close();
  }
});

test('s82 · with a conversation behind it the list is full, a message takes the Home away, and New session has its tabs',async()=>{
  const first=s.launch([],{cols:120,rows:40});await toComposer(first);
  await first.submit('The first conversation of this project');
  await first.waitFor('the answer',x=>/✓ Done in/u.test(x.text),{timeout:30_000});
  await first.waitFor('no Home in a conversation',x=>!/Pick up your work/u.test(x.text));
  await first.close();
  for(const [cols,rows] of SIZES){
    const t=s.launch([],{cols,rows});await toComposer(t);
    await t.waitFor('the list',x=>/Pick up your work/u.test(x.text)&&/The first/u.test(x.text),{timeout:10_000});
    frames.push(frameHtml(t,`${cols}×${rows}, list with a session`,cols,rows));
    if(cols===120){
      for(const [command,word,label] of [['/new','Where we work','New session: where'],['/shelf','disk: conversation','New session: the shelf']] as const){
        await t.submit(command);await t.waitFor(label,x=>new RegExp(word,'u').test(x.text)&&/New session/u.test(x.text),{timeout:10_000});
        await t.settled();await new Promise(done=>setTimeout(done,400));await t.settled();
        frames.push(frameHtml(t,label,cols,rows));
        t.press('esc');await t.waitFor(`back from ${command}`,x=>/Pick up your work/u.test(x.text)&&!/── New session/u.test(x.text));await t.settled();
      }
      await t.submit('/new');await t.waitFor('the page',x=>/Where we work/u.test(x.text));
      t.press('tab');await t.waitFor('how',x=>/Workspace access/u.test(x.text));
      frames.push(frameHtml(t,'New session: how',cols,rows));
      t.press('esc');
      await t.waitFor('back from how',x=>/Pick up your work/u.test(x.text)&&!/── New session/u.test(x.text));await t.settled();
      t.send('\u001bh');const page=await t.waitFor('the Home as a page',x=>/── Home/u.test(x.text)&&/Start a job/u.test(x.text));
      /* judge v2244: the groups are headings as in the mockup (bozzetto-cli-retro/index.html:959-961), no row of filters */
      assert.ok(page.lines.some(line=>line.trim()==='Start a job')&&page.lines.some(line=>line.trim()==='Pick up your work'),page.text);
      assert.doesNotMatch(page.text,/\bAll\s+Start a job/u);
      frames.push(frameHtml(t,'Alt+H: the Home as a page',cols,rows));
      t.press('esc');
    }
    await t.close();
  }
});

test.after(async()=>{
  if(process.env.TALOS_FRAMES_HTML)writeFileSync(process.env.TALOS_FRAMES_HTML,`<!doctype html><meta charset=utf-8><style>body{background:#111;color:#ddd;font:14px Consolas,monospace}pre{line-height:1.0;font-family:Consolas,monospace}</style>${frames.join('')}`);
  await sink.close();
});
