/*
 * 0.6.15, review block 3 of the Desktop (26/10/2026, REVISIONE-BLOCCO-3-CLI-0615): the r3-sp mount (injected clock, approvals
 * answered and recorded) plus the window's remote bridge (the TuiApp `remote` prop) as a fake with the snapshot of tui-remote.ts.
 * Ported from the reviewer's own fixture; imports made relative.
 */
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {PassThrough} from 'node:stream';

const require=createRequire(import.meta.url);
const {Terminal}=require('@xterm/headless') as typeof import('@xterm/headless');
const realSetTimeout=globalThis.setTimeout;
export const sleep=(ms:number)=>new Promise(resolve=>realSetTimeout(resolve,ms));
export const ESC='\u001B';
export type Screen={lines:string[];text:string};
let eventSeq=0;
function v2(sessionId:string,type:string,data:Record<string,unknown>){return{schema:'talos.cli.event.v2',version:2,sessionId,eventId:`rev3-${++eventSeq}`,type,data};}

export type Consent={richiestaId:string;device:string;folder:string;expiresAt:number};
export function fakeRemote(){
  let snapshot:any={state:'host',phones:[{id:'p1',name:'Pad di Nino'}],elsewhere:null,consents:[] as Consent[],error:null};
  const listeners=new Set<()=>void>();const answers:Array<[string,boolean]>=[];
  let fail:null|((id:string)=>Error|null)=null;
  return{
    answers,
    failWith(fn:(id:string)=>Error|null){fail=fn;},
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    getSnapshot:()=>snapshot,
    set(consents:Consent[]){snapshot={...snapshot,consents};for(const listener of listeners)listener();},
    async decideConsent(id:string,allow:boolean){answers.push([id,allow]);const e=fail?.(id);if(e)throw e;},
  };
}

/* Desktop review block 11 (E-R1): `runtimeExtra`/`catalogExtra` hold a request of this window in flight; `readinessModels` is the model
   the next send really checks */
export async function mountApp({cols,rows,root,paths,clock,remote,permissionMode='default',runtimeExtra={},catalogExtra={}}:{cols:number;rows:number;root:string;paths:any;clock:()=>number;remote:any;permissionMode?:string;runtimeExtra?:any;catalogExtra?:any}){
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const {createTuiAppComponent}=await import('../../src/tui/app.ts');
  const shell:any=await import('../../src/tui/components/terminal-shell.ts');
  const term=new Terminal({cols,rows,allowProposedApi:true,scrollback:0,convertEol:true});
  let pending=Promise.resolve();
  const stdout:any=Object.assign(new EventEmitter(),{columns:cols,rows,isTTY:true,write(chunk:unknown){const text=String(chunk);pending=pending.then(()=>new Promise<void>(resolve=>term.write(text,resolve)));return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  const sinks=new Map<string,(event:any)=>void>();
  const prompts:string[]=[];const answers:Array<{requestId:string;approved:boolean}>=[];let cancelled=0;const modes:string[]=[];const readinessModels:string[]=[];
  const runtime:any={
    restore:async()=>({}),listSessions:async()=>[{sessionId:'s1'}],
    subscribe(id:string,sink:(event:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},
    answerApproval:async(_id:string,requestId:string,approved:boolean)=>{answers.push({requestId,approved});},
    cancel:async()=>{cancelled++;for(const sink of sinks.values())sink(v2('s1','run.failed',{runId:'r1',error:{message:'stopped',envelope:{code:'fermato'}}}));},
    close:async()=>{},shell:async()=>{},
    setPermissionMode:async(_id:string,mode:string)=>{modes.push(String(mode));},
    ...runtimeExtra,
    start:async(input:any)=>{prompts.push(String(input?.prompt??''));return's1';},
    resume:async(_id:string,text:string)=>{prompts.push(text);return's1';},
    fork:async()=>{throw new Error('no fork in this test');},
  };
  const catalog:any={listModels:async()=>[],listProviders:async()=>[],chosenProvider:()=>'openai',readiness:async(model:string)=>{readinessModels.push(model);return{ready:true};},...catalogExtra};
  const TuiApp=createTuiAppComponent(React,Ink,{interactive:true,color:false,motion:false,unicode:true});
  const session={mode:'mono',alternateScreen:true,paintBackground:false,fallbackReason:null};
  const Root=()=>{
    const frame=shell.terminalFrameProps({session,rows,columns:cols});
    return React.createElement(Ink.Box,frame,React.createElement(TuiApp,{runtime,catalog,invocation:{model:'openai:gpt-5-mini',permissionMode,resume:'s1'},projectRoot:root,paths,permissionRules:{allow:[],ask:[],deny:[]},terminalSize:{rows,columns:cols},clock,remote}));
  };
  const app=Ink.render(React.createElement(Root),{stdout,stdin,stderr:stdout,exitOnCtrlC:false,patchConsole:false,interactive:true,isScreenReaderEnabled:false,alternateScreen:true});
  const screen=async():Promise<Screen>=>{
    await pending;await pending;
    const buffer=term.buffer.active;const lines:string[]=[];
    for(let y=0;y<term.rows;y++)lines.push(buffer.getLine(buffer.viewportY+y)?.translateToString(true,0,term.cols)??'');
    return{lines,text:lines.join('\n')};
  };
  const mounted={
    screen,
    press(bytes:string){stdin.write(bytes);},
    emit(type:string,data:Record<string,unknown>){for(const sink of sinks.values())sink(v2('s1',type,data));},
    async waitFor(label:string,check:(s:Screen)=>boolean,timeout=8_000){
      const until=Date.now()+timeout;let last=await screen();
      while(Date.now()<until){last=await screen();if(check(last))return last;await sleep(25);}
      throw new Error(`timed out waiting for ${label}:\n${last.text}`);
    },
    async type(text:string){for(const ch of text){stdin.write(ch);await sleep(4);}},
    prompts,answers,modes,readinessModels,cancels:()=>cancelled,
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
