/**
 * FE-048, the frames of C8, C9 and C10 for the Frontend, from the BUILT CLI in true colours: Capability before and after a turn, Automations
 * empty, with one, its Calendar and paused, Forge and Research empty, the Doctor's loading page and its report, Settings › Config without
 * the two dead fields, and Themes. Devices is not shot here: opening it hosts remote control for real. The frames go to TALOS_FRAMES_HTML.
 */
import {writeFileSync} from 'node:fs';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s93',files:{'README.md':'# demo\n'},extraEnv:{...sinkEnv(sink),COLORTERM:'truecolor'}});
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
const flat=(text:string)=>text.replace(/[ │]*\n[ │]*/gu,' ');
const close=async(t:TerminalSession,title:RegExp)=>{t.press('esc');await t.waitFor('closed',x=>!title.test(x.text),{timeout:5_000});};
const CAP=/── Capability /u,AUTO=/── Automations /u,FORGE=/── Forge /u,RESEARCH=/── Research /u,DOCTOR=/── Doctor /u;

test('s93 · the frames of C8, C9 and C10',async()=>{
  const t=s.launch([],{cols:COLS,rows:ROWS});await toComposer(t);
  try{
    await t.submit('/capability');await t.waitFor('Capability, empty',x=>CAP.test(x.text)&&/No request sent yet/u.test(x.text),{timeout:15_000});await still(t);
    shot(t,'C8 Capability: before the first turn');await close(t,CAP);
    await t.submit('A first turn, so that a request is sent');await t.waitFor('the answer',x=>/✓ Done in/u.test(x.text),{timeout:30_000});
    await t.submit('/capability');await t.waitFor('Capability, tools',x=>CAP.test(x.text)&&/tools offered in the last request/u.test(x.text),{timeout:15_000});await still(t);
    shot(t,'C8 Capability: Tools of the last request');
    t.press('tab');t.press('tab');await still(t);shot(t,'C8 Capability: Connectors, none configured');await close(t,CAP);
    /* the Context Manager's new tab (Frontend 01/11: «voglio vederla prima che si chiuda») */
    await t.submit('/context');await t.waitFor('Context',x=>/── Context Manager/u.test(x.text),{timeout:15_000});
    for(let i=0;i<5;i+=1)t.press('tab');
    await t.waitFor('Request sent',x=>/messages · \d+ tools/u.test(x.text),{timeout:5_000});await still(t);shot(t,'C4 Context Manager: Request sent');
    t.press('esc');await t.waitFor('closed',x=>!/── Context Manager/u.test(x.text),{timeout:5_000});

    await t.submit('/automations');await t.waitFor('Automations, empty',x=>AUTO.test(x.text)&&/No automations yet/u.test(flat(x.text)),{timeout:15_000});await still(t);
    shot(t,'C9 Automations: empty');
    t.send('n');await t.waitFor('what',x=>/What should it do\?/u.test(x.text),{timeout:5_000});await still(t);shot(t,'C9 Automations: new, what');
    await t.type('Check the README for typos');t.press('enter');await t.waitFor('when',x=>/When\? \(/u.test(x.text),{timeout:5_000});await still(t);shot(t,'C9 Automations: new, when');
    t.resize(80,30);await still(t);shot(t,'C9 Automations: new, when, at 80 columns');t.resize(COLS,ROWS);await still(t);
    await t.type('every 2h');t.press('enter');await t.waitFor('the row',x=>/\[x\] Check the README/u.test(x.text),{timeout:15_000});await still(t);
    shot(t,'C9 Automations: List with one');
    t.press('tab');await t.waitFor('Calendar',x=>/an hour per cell/u.test(x.text),{timeout:5_000});await still(t);shot(t,'C9 Automations: Calendar');
    t.press('tab');t.send(' ');await t.waitFor('paused',x=>/\[ \] Check the README/u.test(x.text),{timeout:15_000});await still(t);shot(t,'C9 Automations: paused, the toast');
    t.send('r');await t.waitFor('no host',x=>/Nothing runs the automations now/u.test(flat(x.text)),{timeout:15_000});await still(t);shot(t,'C9 Automations: r with no process running them');
    if(AUTO.test(t.screen().text))await close(t,AUTO);

    await t.submit('/forge');await t.waitFor('Forge',x=>FORGE.test(x.text),{timeout:15_000});await still(t);shot(t,'C9 Forge: empty');await close(t,FORGE);
    await t.submit('/research');await t.waitFor('Research',x=>RESEARCH.test(x.text),{timeout:15_000});await still(t);shot(t,'C9 Research: empty');await close(t,RESEARCH);

    await t.submit('/doctor');
    await t.waitFor('Doctor loading',x=>/Checking/u.test(x.text)||DOCTOR.test(x.text),{timeout:30_000});
    if(!DOCTOR.test(t.screen().text))shot(t,'C9 Doctor: the loading page');
    await t.waitFor('Doctor',x=>DOCTOR.test(x.text)&&/checks pass/u.test(x.text),{timeout:60_000});await still(t);shot(t,'C9 Doctor: the report');await close(t,DOCTOR);

    await t.submit('/config');await t.waitFor('Config',x=>/Mouse/u.test(x.text)&&/Start view/u.test(x.text),{timeout:15_000});await still(t);shot(t,'C10 Settings: Config, only fields that act');
    t.press('esc');await t.waitFor('closed',x=>!/Start view/u.test(x.text),{timeout:5_000});
    await t.submit('/theme');await t.waitFor('Themes',x=>/Forge +in use/u.test(x.text),{timeout:15_000});await still(t);shot(t,'C10 Themes');t.press('esc');await still(t);

    await t.submit('/exit');await t.waitForExit(15_000);
  }finally{
    await t.close();
    /* what was shot is written even when a step fails, so the frame that failed can be read */
    if(process.env.TALOS_FRAMES_HTML)writeFileSync(process.env.TALOS_FRAMES_HTML,`<!doctype html><meta charset=utf-8><style>body{background:#111;color:#ddd;font:14px Consolas,monospace}pre{line-height:1.0;font-family:Consolas,monospace}</style>${frames.join('')}`);
  }
});

/* in after, never at the end of the test: a failed step must not leave the sink holding the process open */
test.after(async()=>{await sink.close();});
