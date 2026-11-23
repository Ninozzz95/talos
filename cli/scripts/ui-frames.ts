/*
 * UI Phase 0 (owner 2026-09-27: "ricerca miglioramenti ui"; plan docs/talos-cli/2026-09-27-ui-improvements-research-and-plan.md):
 * LOOK before changing. Frames of TALOS and of Pi, Codex and OpenCode on the same scenarios, in the synthetic terminal
 * of the acceptance layer (node-pty + @xterm/headless; no real window, no keys to the desktop), hermetic: private
 * profiles, a local fake model, the refusing sink.
 *
 * Each frame is saved as text (what a person reads) and with a COLOUR AUDIT, cell by cell: the contrast of every
 * character against the background it really gets, with Windows Terminal's Campbell palette; cells that leave the
 * background to the terminal are also scored against a LIGHT terminal (the CLI has no light theme by the owner's
 * decision, so a person with a light terminal gets whatever TALOS does not paint).
 *
 * Usage: node scripts/ui-frames.ts [--agents talos,pi,codex,opencode] [--sizes 60x24,100x30,120x36] --out <dir>
 */
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startFakeProvider,type FakeProvider} from '../test/acceptance/fake-provider.ts';
import {answerApproval,toComposer,turn} from '../test/acceptance/harness.ts';
import {approvalVisible,composerReady,idleFooter} from '../test/acceptance/checks.ts';
import {createProfile} from '../test/acceptance/profile.ts';
import {sinkEnv,startRefusingSink} from '../test/acceptance/sink.ts';
import {TerminalSession} from '../test/acceptance/terminal.ts';
import {startBenchFake} from './bench-fake.ts';
import {agent,makeWorkspace,type AgentName} from './bench-agents.ts';

const args=process.argv.slice(2);
const opt=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const agents=(opt('--agents')??'talos,pi,codex,opencode').split(',') as AgentName[];
const sizes=(opt('--sizes')??'60x24,100x30,120x36').split(',').map(s=>{const [c,r]=s.split('x').map(Number);return{cols:c!,rows:r!};});
const OUT=opt('--out');if(!OUT)throw new Error('--out <dir> is required');
mkdirSync(OUT,{recursive:true});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

/* ---------- colour audit ---------- */
const CAMPBELL=['#0C0C0C','#C50F1F','#13A10E','#C19C00','#0037DA','#881798','#3A96DD','#CCCCCC','#767676','#E74856','#16C60C','#F9F1A5','#3B78FF','#B4009E','#61D6D6','#F2F2F2'];
const DARK={fg:'#CCCCCC',bg:'#0C0C0C'},LIGHT={fg:'#000000',bg:'#FFFFFF'};
function palette256(i:number):string{
  if(i<16)return CAMPBELL[i]!;
  if(i>=232){const v=8+(i-232)*10;return rgbHex(v,v,v);}
  const n=i-16,steps=[0,95,135,175,215,255];return rgbHex(steps[Math.floor(n/36)]!,steps[Math.floor(n/6)%6]!,steps[n%6]!);
}
const rgbHex=(r:number,g:number,b:number)=>`#${[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase()}`;
function luminance(hex:string){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]!+0.7152*c[1]!+0.0722*c[2]!;}
const contrast=(a:string,b:string)=>{const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return(x!+0.05)/(y!+0.05);};
type CellColor={hex:string|null};
function colorOf(cell:any,kind:'fg'|'bg'):CellColor{
  const isDefault=kind==='fg'?cell.isFgDefault():cell.isBgDefault();if(isDefault)return{hex:null};
  const value=kind==='fg'?cell.getFgColor():cell.getBgColor();
  const rgb=kind==='fg'?cell.isFgRGB():cell.isBgRGB();
  return{hex:rgb?rgbHex((value>>16)&255,(value>>8)&255,value&255):palette256(value)};
}
type Finding={text:string;fg:string;bg:string;ratio:number;where:'painted'|'terminal-dark'|'terminal-light';count:number};
function audit(t:TerminalSession){
  const term=(t as any).term;const b=term.buffer.active;const cell=b.getNullCell();
  let chars=0,onTerminalBg=0;const worst=new Map<string,Finding>();
  const note=(f:Omit<Finding,'count'>)=>{const key=`${f.where}|${f.fg}|${f.bg}`;const prior=worst.get(key);if(prior){prior.count++;if(prior.text.length<24)prior.text+=f.text;}else worst.set(key,{...f,count:1});};
  for(let y=0;y<term.rows;y++){
    const line=b.getLine(b.viewportY+y);if(!line)continue;
    let run='';
    for(let x=0;x<term.cols;x++){
      line.getCell(x,cell);const ch=cell.getChars();if(!ch||ch===' ')continue;chars++;
      let fg=colorOf(cell,'fg').hex,bg=colorOf(cell,'bg').hex;
      if(cell.isInverse()){[fg,bg]=[bg,fg];}
      const dim=cell.isDim();
      if(bg===null){
        onTerminalBg++;
        const dark=contrast(fg??DARK.fg,DARK.bg),light=contrast(fg??LIGHT.fg,LIGHT.bg);
        if(dark<(dim?3:4.5))note({text:ch,fg:fg??'default',bg:'terminal',ratio:+dark.toFixed(2),where:'terminal-dark'});
        if(light<(dim?3:4.5))note({text:ch,fg:fg??'default',bg:'terminal',ratio:+light.toFixed(2),where:'terminal-light'});
      }else{
        const ratio=contrast(fg??DARK.fg,bg);
        if(ratio<(dim?3:4.5))note({text:ch,fg:fg??'default',bg,ratio:+ratio.toFixed(2),where:'painted'});
      }
      run+=ch;
    }
  }
  return{chars,onTerminalBg,lowContrast:[...worst.values()].sort((a,b)=>a.ratio-b.ratio)};
}

/* ---------- frames ---------- */
const index:{agent:string;size:string;label:string;file:string;ok:boolean;lowContrast:number;onTerminalBgPct:number}[]=[];
async function snap(t:TerminalSession,agentName:string,size:{cols:number;rows:number},label:string,ok=true){
  await t.settled();
  const a=audit(t);const s=t.screen();
  const file=`${agentName}-${size.cols}x${size.rows}-${label}${ok?'':'-FAILED'}.txt`;
  const lines=[
    t.dump(`${agentName} ${label}`),
    '',
    `colour audit: ${a.chars} characters, ${a.onTerminalBg} (${a.chars?Math.round(100*a.onTerminalBg/a.chars):0}%) on the terminal's own background`,
    ...a.lowContrast.slice(0,20).map(f=>`  ${f.where.padEnd(15)} ratio ${String(f.ratio).padEnd(5)} fg ${f.fg} bg ${f.bg} ×${f.count}  "${f.text.slice(0,24)}"`),
  ];
  writeFileSync(join(OUT!,file),lines.join('\n')+'\n');
  index.push({agent:agentName,size:`${size.cols}x${size.rows}`,label,file,ok,lowContrast:a.lowContrast.reduce((n,f)=>n+f.count,0),onTerminalBgPct:a.chars?Math.round(100*a.onTerminalBg/a.chars):0});
  return s;
}
async function step(t:TerminalSession,agentName:string,size:{cols:number;rows:number},label:string,run:()=>Promise<unknown>){
  try{await run();await snap(t,agentName,size,label);}
  catch(error){await snap(t,agentName,size,label,false);writeFileSync(join(OUT!,`${agentName}-${size.cols}x${size.rows}-${label}-error.txt`),String(error instanceof Error?error.stack:error));}
}
/* Esc, then wait until the dialog is really gone (5 s): a dialog still open after that is a finding, not a timing. */
const closeDialog=async(t:TerminalSession,open:RegExp)=>{t.press('esc');await t.waitFor(`Esc closes ${open}`,x=>!open.test(x.text),{timeout:5_000});};
/* Press a key and wait until the screen changes (3 s), then let the repaint settle: `quiet()` alone returns at once
   when the terminal was already silent, which photographed the screen BEFORE the key was handled. */
async function afterKey(t:TerminalSession,key:string){
  const before=t.screen().text;t.press(key);
  try{await t.waitFor(`the screen changes after ${key}`,x=>x.text!==before,{timeout:3_000});}catch{/* unchanged: that is the finding */}
  await t.quiet(300,{timeout:5_000});
}
/* Answer an approval, then wait until that dialog is gone, so the next check never answers a dialog already closed. */
const approveOnce=async(t:TerminalSession)=>{await answerApproval(t,'1');await t.waitFor('the approval closed',x=>!approvalVisible(x),{timeout:15_000});};
/* A turn that asks for approvals: approve each one until the answer whose text matches `done` arrives. */
async function approveUntil(t:TerminalSession,done:RegExp){
  for(let i=0;i<5;i++){
    const s=await t.waitFor('an approval or the end',x=>approvalVisible(x)||(idleFooter(x)&&done.test(x.text)),{timeout:60_000});
    if(!approvalVisible(s))return;await approveOnce(t);
  }
}

/* ---------- TALOS: every scenario at every size ---------- */
const LONG_PASTE=Array.from({length:30},(_,i)=>`line ${i+1} of a pasted log: something happened at step ${i+1}`).join('\n');
async function talosAt(fake:FakeProvider,sink:Record<string,string>,size:{cols:number;rows:number}){
  /* first run: a new folder, no model yet — the guided setup */
  {
    const profile=createProfile({name:'ui-first',providerUrl:fake.url,extraEnv:sink,files:{'README.md':'# demo\n'}});
    const t=TerminalSession.launch(profile,[],size);
    try{await step(t,'talos',size,'01-first-run',async()=>{const first=await t.waitFor('first paint',s=>s.text.trim()!=='',{timeout:30_000});if(/BOOT\s+\d+%/u.test(first.text))t.press('space');await t.quiet(900,{timeout:15_000});});}
    finally{await t.close();profile.dispose();}
  }
  const profile=createProfile({name:'ui',providerUrl:fake.url,extraEnv:sink,files:{'README.md':'# demo\n','src/index.js':"console.log('hi')\n",'src/util.js':'export const console2=1\n'}});
  try{
    for(const a of [['model','use','ollama:qwen3-coder-test','--scope','user'],['project','trust','--include-nested']]){const r=await profile.talos(a);if(r.status!==0)throw new Error(`talos ${a.join(' ')}: ${r.stdout}${r.stderr}`);}
    const t=TerminalSession.launch(profile,[],size);
    try{
      await step(t,'talos',size,'02-idle',()=>toComposer(t));
      await step(t,'talos',size,'03-markdown-thinking',()=>turn(t,fake,'MD please summarize this project'));
      await step(t,'talos',size,'04-search',()=>turn(t,fake,'SEARCH for console'));
      await step(t,'talos',size,'05-approval',async()=>{await t.submit('TOOLS inspect the repo and write notes');await t.waitFor('approval',approvalVisible,{timeout:30_000});});
      await step(t,'talos',size,'06-tools-done',async()=>{
        await approveOnce(t);await approveUntil(t,/Done: used/u);
      });
      /* the same screen 1.5 s later: is what the first frame shows still there (a half-drawn frame vs a real defect)? */
      await step(t,'talos',size,'06b-tools-settled',()=>sleep(1500));
      await step(t,'talos',size,'07-long-output',async()=>{await t.submit('HUGE print a lot');await approveUntil(t,/Done: printed/u);});
      await step(t,'talos',size,'08-error',async()=>{await t.submit('ERR500 please');await t.waitFor('the retry is shown',x=>/Retrying/u.test(x.text),{timeout:30_000});});
      await step(t,'talos',size,'08b-error-final',async()=>{await t.waitFor('the turn failed',x=>idleFooter(x)&&!/Retrying/u.test(x.text),{timeout:90_000});});
      await step(t,'talos',size,'10-help',async()=>{await t.submit('/help');await t.waitFor('help open',x=>/── Help TALOS /u.test(x.text),{timeout:10_000});});
      await step(t,'talos',size,'10-help-after-esc',()=>closeDialog(t,/── Help TALOS /u));
      if(!composerReady(t.screen())){t.press('ctrl+c');await t.quiet(600,{timeout:5_000});}
      await step(t,'talos',size,'11-status',async()=>{await t.submit('/status');await t.waitFor('status shown',x=>/── Settings this project /u.test(x.text),{timeout:10_000});await closeDialog(t,/── Settings this project /u);});
      await step(t,'talos',size,'12-resume',async()=>{await t.submit('/resume');await t.waitFor('resume open',x=>/── Resume a conversation /u.test(x.text),{timeout:10_000});});
      await step(t,'talos',size,'12-resume-after-esc',()=>closeDialog(t,/── Resume a conversation /u));
      if(!composerReady(t.screen())){t.press('ctrl+c');await t.quiet(600,{timeout:5_000});}
      await step(t,'talos',size,'13-theme',async()=>{await t.submit('/theme');await t.waitFor('theme open',x=>/in use/u.test(x.text),{timeout:10_000});});
      await step(t,'talos',size,'13-theme-after-esc',()=>closeDialog(t,/in use/u));
      /* UI Phase 1: the one-line live preview while the model reasons (fake THINK: five pieces 400 ms apart), then its end */
      await step(t,'talos',size,'13b-thinking-live',async()=>{await t.submit('THINK about the project');await t.waitFor('the live preview',x=>/Thinking · \S/u.test(x.text),{timeout:20_000});});
      await step(t,'talos',size,'13c-thinking-done',async()=>{await t.waitFor('the thought line',x=>idleFooter(x)&&/Thought for/u.test(x.text)&&/Thought it through\./u.test(x.text),{timeout:30_000});});
      if(!composerReady(t.screen())){t.press('ctrl+c');await t.quiet(600,{timeout:5_000});}
      await step(t,'talos',size,'14-agents',async()=>{await t.submit('DELEGATE a small task');
        /* Tappa 8: the agent runs in the BACKGROUND — no panel covers the composer; while it works the footer
           counts it (`← 1 agents`) and completion lands in the transcript (step 15). */
        await t.waitFor('the agent is counted in the footer',x=>/← \d+ agents?/u.test(x.text),{timeout:30_000});});
      await step(t,'talos',size,'15-agents-done',async()=>{await t.waitFor('agents done',x=>idleFooter(x)&&/Done: the agent finished/u.test(x.text),{timeout:60_000});});
      /* last: a long paste in the composer, then what one Backspace does to it (the composer is not cleared after) */
      await step(t,'talos',size,'16-paste',async()=>{t.paste(LONG_PASTE);await t.quiet(600,{timeout:10_000});});
      await step(t,'talos',size,'16b-paste-backspace',()=>afterKey(t,'backspace'));
      /* UI Phase 1 (owner 27/09): pasting the same text again right after its placeholder expands it */
      await step(t,'talos',size,'16c-paste-again',async()=>{t.paste(LONG_PASTE);await t.waitFor('collapsed again',x=>/Pasted text #\d+/u.test(x.text),{timeout:10_000});t.paste(LONG_PASTE);await t.waitFor('expanded',x=>/line \d+ of a pasted log/u.test(x.text),{timeout:10_000});});
    }finally{await t.close();}
  }finally{profile.dispose();}
}

/* ---------- competitors: same turns, their own screen ---------- */
async function competitorAt(name:AgentName,sink:Record<string,string>,size:{cols:number;rows:number}){
  const fake=await startBenchFake();const root=mkdtempSync(join(tmpdir(),`ui-frames-${name}-`));
  try{
    const ws=join(root,'ws');makeWorkspace(ws,0);
    const a=agent(name,join(root,'home'),fake.url,sink);a.env.PWD=ws;
    const t=new TerminalSession('cmd.exe',['/d','/s','/c',a.interactive],{...size,cwd:ws,env:{...a.env,TERM:'xterm-256color',COLORTERM:'truecolor'}});
    const settle=async(ms=1200)=>{await t.quiet(ms,{timeout:30_000});};
    const send=async(text:string)=>{await t.type(text,6);await sleep(250);t.press('enter');};
    const answered=(scenario:string)=>async()=>{const from=fake.log.length;await send(`BENCH_${scenario} please`);const until=Date.now()+45_000;while(Date.now()<until){const mine=fake.log.slice(from).filter(r=>r.scenario===scenario.toLowerCase());if(mine.some(r=>r.calls===0&&r.endAt))break;await sleep(300);}await settle(1500);};
    try{
      /* Never answer a competitor's first-run prompt: on 27/09 an Enter here picked Codex's
         administrator sandbox setup. A prompt on screen is recorded and ends that agent's frames. */
      await step(t,name,size,'02-idle',()=>settle(2500));
      if(/trust|Do you trust|Continue|sandbox|Administrator/iu.test(t.screen().text)){console.error(`${name}: first-run prompt on screen, frames stop here (no key pressed)`);return;}
      await step(t,name,size,'03-markdown-thinking',answered('MD'));
      await step(t,name,size,'04-read6',answered('READ6'));
      await step(t,name,size,'04b-grep4',answered('GREP4'));
      await step(t,name,size,'05-shell1',async()=>{const from=fake.log.length;await send('BENCH_SHELL1 please');const until=Date.now()+30_000;while(Date.now()<until&&!fake.log.slice(from).some(r=>r.calls>0))await sleep(300);await settle(2000);});
      await step(t,name,size,'09-paste',async()=>{t.paste(LONG_PASTE);await settle(1000);});
    }finally{await t.close();}
  }finally{await fake.close();rmSync(root,{recursive:true,force:true,maxRetries:5});}
}

const sinkServer=await startRefusingSink();const sink=sinkEnv(sinkServer);
const talosFake=await startFakeProvider();
try{
  for(const name of agents)for(const size of sizes){
    if(name==='talos')await talosAt(talosFake,sink,size);
    else if(size.cols===100)await competitorAt(name,sink,size);
  }
}finally{
  await talosFake.close();await sinkServer.close();
  writeFileSync(join(OUT,'index.json'),JSON.stringify({sinkHits:sinkServer.hits.length,frames:index},null,1));
}
console.table(index.map(({file:_f,...r})=>r));
