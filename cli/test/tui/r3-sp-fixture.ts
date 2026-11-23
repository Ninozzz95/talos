/**
 * R3 lane SP: the R1 lane L mount (r1-layout-fixture.ts, copied, not imported, so that fixture stays lane L's) with what
 * the R3 approval and key tests need: an injected clock (the approval grace period), a provider that is ready (a prompt
 * really reaches the runtime), and the runtime's side of the conversation recorded (prompts sent, approvals answered,
 * interrupts). The REAL TuiApp through the REAL Ink 7.1.1 into a fake TTY read by `@xterm/headless`; no pty, no child
 * process, no real profile (APPDATA/LOCALAPPDATA in a temp folder, see hermeticProfile in the R1 fixture).
 */
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {PassThrough} from 'node:stream';

const require=createRequire(import.meta.url);
const {Terminal}=require('@xterm/headless') as typeof import('@xterm/headless');
const realSetTimeout=globalThis.setTimeout;
export const sleep=(ms:number)=>new Promise(resolve=>realSetTimeout(resolve,ms));
export type Screen={lines:string[];text:string};

let eventSeq=0;
export function v2(sessionId:string,type:string,data:Record<string,unknown>){return{schema:'talos.cli.event.v2',version:2,sessionId,eventId:`r3sp-${++eventSeq}`,type,data};}

export type R3Mounted={
  screen:()=>Promise<Screen>;
  press:(bytes:string)=>void;
  emit:(type:string,data:Record<string,unknown>)=>void;
  waitFor:(label:string,check:(s:Screen)=>boolean,timeout?:number)=>Promise<Screen>;
  prompts:string[];
  answers:Array<{requestId:string;approved:boolean}>;
  cancels:()=>number;
  unmount:()=>void;
};

export async function mountR3App({cols,rows,root,paths,clock,shellIsolation,permissionMode='default',sessions}:{cols:number;rows:number;root:string;paths:any;clock?:()=>number;shellIsolation?:()=>Promise<{verified:boolean;aborted?:boolean}>;permissionMode?:string;sessions?:()=>any[]}):Promise<R3Mounted>{
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const {createTuiAppComponent}=await import('../../src/tui/app.ts');
  const shell:any=await import('../../src/tui/components/terminal-shell.ts');
  const term=new Terminal({cols,rows,allowProposedApi:true,scrollback:0,convertEol:true});
  let pending=Promise.resolve();
  const stdout:any=Object.assign(new EventEmitter(),{columns:cols,rows,isTTY:true,write(chunk:unknown){const text=String(chunk);pending=pending.then(()=>new Promise<void>(resolve=>term.write(text,resolve)));return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  const sinks=new Map<string,(event:any)=>void>();
  const prompts:string[]=[];const answers:Array<{requestId:string;approved:boolean}>=[];let cancelled=0;
  const runtime:any={
    restore:async()=>({}),listSessions:async()=>sessions?sessions():[{sessionId:'s1'}],
    subscribe(id:string,sink:(event:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},
    answerApproval:async(_id:string,requestId:string,approved:boolean)=>{answers.push({requestId,approved});},
    cancel:async()=>{cancelled++;for(const sink of sinks.values())sink(v2('s1','run.failed',{runId:'r1',error:{message:'stopped',envelope:{code:'fermato'}}}));},
    close:async()=>{},shell:async()=>{},
    start:async(input:any)=>{prompts.push(String(input?.prompt??''));return's1';},
    resume:async(_id:string,text:string)=>{prompts.push(text);return's1';},
    fork:async()=>{throw new Error('no fork in this test');},
  };
  const catalog:any={listModels:async()=>[],listProviders:async()=>[],chosenProvider:()=>'openai',readiness:async()=>({ready:true})};
  const TuiApp=createTuiAppComponent(React,Ink,{interactive:true,color:false,motion:false,unicode:true});
  const session={mode:'mono',alternateScreen:true,paintBackground:false,fallbackReason:null};
  const Root=()=>{
    const frame=shell.terminalFrameProps({session,rows,columns:cols});
    return React.createElement(Ink.Box,frame,React.createElement(TuiApp,{runtime,catalog,invocation:{model:'openai:gpt-5-mini',permissionMode,resume:'s1'},projectRoot:root,paths,permissionRules:{allow:[],ask:[],deny:[]},terminalSize:{rows,columns:cols},...(clock?{clock}:{}),...(shellIsolation?{shellIsolation}:{})}));
  };
  const app=Ink.render(React.createElement(Root),{stdout,stdin,stderr:stdout,exitOnCtrlC:false,patchConsole:false,interactive:true,isScreenReaderEnabled:false,alternateScreen:true});
  const screen=async():Promise<Screen>=>{
    await pending;await pending;
    const buffer=term.buffer.active;const lines:string[]=[];
    for(let y=0;y<term.rows;y++)lines.push(buffer.getLine(buffer.viewportY+y)?.translateToString(true,0,term.cols)??'');
    return{lines,text:lines.join('\n')};
  };
  const mounted:R3Mounted={
    screen,
    press(bytes){stdin.write(bytes);},
    emit(type,data){for(const sink of sinks.values())sink(v2('s1',type,data));},
    async waitFor(label,check,timeout=10_000){
      const until=Date.now()+timeout;let last=await screen();
      while(Date.now()<until){last=await screen();if(check(last))return last;await sleep(25);}
      throw new Error(`timed out waiting for ${label}:\n${last.text}`);
    },
    prompts,answers,cancels:()=>cancelled,
    unmount(){app.unmount();},
  };
  const first=await mounted.waitFor('first paint',s=>s.text.trim()!=='',15_000);
  const hasComposer=(s:Screen)=>s.lines.some(line=>/^╭─/u.test(line));
  if(!hasComposer(first)){await sleep(50);if(!hasComposer(await screen()))mounted.press(' ');}
  await mounted.waitFor('the main screen',s=>/[•›●] main · /u.test(s.text)||hasComposer(s),15_000);await sleep(150);
  for(let i=0;i<2;i++){mounted.press('\x7f');await sleep(40);}
  return mounted;
}
export const composerLine=(s:Screen)=>s.lines.find(line=>/^│ ›/u.test(line))??'';
