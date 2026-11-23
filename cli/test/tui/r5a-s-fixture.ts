/*
 * R5a lane S: the R1 fixture's way of mounting the REAL TuiApp through the REAL Ink into a fake TTY read back by
 * `@xterm/headless` (r1-layout-fixture.ts, lane L), with what R5a needs on top: a catalog whose model is ready (so a prompt
 * can be sent and queued), the runtime calls recorded (resume, steer, cancel, shell), and the app props R5a adds
 * (`busyInput`, `reasoning`). Nothing touches the real profile: the caller passes hermetic paths (hermeticProfile()).
 */
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {PassThrough} from 'node:stream';
import {KEY,sleep,v2,type Screen} from './r1-layout-fixture.ts';

const require=createRequire(import.meta.url);
const {Terminal}=require('@xterm/headless') as typeof import('@xterm/headless');

export type R5aApp={
  screen:()=>Promise<Screen>;press:(bytes:string)=>void;type:(text:string)=>Promise<void>;
  emit:(type:string,data:Record<string,unknown>)=>void;raw:(event:Record<string,unknown>)=>void;
  waitFor:(label:string,check:(s:Screen)=>boolean,timeout?:number)=>Promise<Screen>;settle:()=>Promise<Screen>;
  calls:string[];unmount:()=>void;
  /** R5b D4: the foreground of one cell as 0xRRGGBB, or -1 when it is not an RGB colour. */
  fg:(y:number,x:number)=>Promise<number>;
  /** R5b D3: whether one cell is drawn inverse (the highlighted choice). */
  inverse:(y:number,x:number)=>Promise<boolean>;
  /** R5b: everything the app wrote to the terminal, escape sequences included (OSC 52 never shows on screen). */
  written:()=>string;
};

/* R5a coordinator: `modelRow` adds catalog facts to the model (e.g. the effort levels it declares, for /effort). */
export async function mountR5a({cols,rows,root,paths,history=[],props={},runtimeExtra={},model='ollama:qwen3-coder-test',modelRow={},liveModelRow=null,themeStore,capabilities={interactive:true,color:false,motion:false,unicode:true}}:{themeStore?:unknown;/* stage 7.5: runtime methods a test adds or replaces (listSessions, export, deleteSession…) */runtimeExtra?:Record<string,unknown>;capabilities?:Record<string,boolean>;cols:number;rows:number;root:string;paths:any;history?:Array<{type:string;data:Record<string,unknown>}>;props?:Record<string,unknown>;model?:string;modelRow?:Record<string,unknown>;liveModelRow?:Record<string,unknown>|null}):Promise<R5aApp>{
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const {createTuiAppComponent}=await import('../../src/tui/app.ts');
  const shell:any=await import('../../src/tui/components/terminal-shell.ts');
  const term=new Terminal({cols,rows,allowProposedApi:true,scrollback:0,convertEol:true});
  let pending=Promise.resolve();const raw:string[]=[];
  const stdout:any=Object.assign(new EventEmitter(),{columns:cols,rows,isTTY:true,write(chunk:unknown){const text=String(chunk);raw.push(text);pending=pending.then(()=>new Promise<void>(resolve=>term.write(text,resolve)));return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  const sinks=new Map<string,(event:any)=>void>();const calls:string[]=[];
  const runtime:any={
    setPermissionMode:async()=>{},
    restore:async()=>({restored:0,total:0}),listSessions:async()=>[{sessionId:'s1'}],
    subscribe(id:string,sink:(event:any)=>void){sinks.set(id,sink);for(const row of history)sink(v2(id,row.type,row.data));return()=>sinks.delete(id);},
    answerApproval:async()=>{},close:async()=>{},compact:async()=>({compattato:true}),export:()=>null,
    cancel:async(id:string)=>{calls.push(`cancel ${id}`);},shell:async(_id:string,command:string)=>{calls.push(`shell ${command}`);},
    start:async()=>{calls.push('start');return 's1';},resume:async(id:string,prompt?:string)=>{calls.push(`resume ${prompt}`);return id;},fork:async()=>'s2',
    steer:async(_id:string,prompt:string)=>{calls.push(`steer ${prompt}`);return{redirectId:'rd1'};},
    setReasoningEffort:async(_id:string,effort:string)=>{calls.push(`effort ${effort}`);},setDefaultReasoningEffort:(effort:string|null)=>{calls.push(`default-effort ${effort}`);},
    ...runtimeExtra,
  };
  const provider=model.slice(0,model.indexOf(':'));
  const row={id:model,name:model,provider,reasoning:false,...modelRow};
  const catalog:any={listModels:async()=>[row],listProviders:async()=>[{id:provider,label:provider,configured:true,requiresKey:false}],chosenProvider:async()=>provider,readiness:async()=>({ready:true}),
    /* R5a: the provider's live list (what /model reads), which may know more than the rows TALOS loads at startup. */
    providerModels:async()=>{calls.push('live-list');return{provider,label:provider,rows:[{...row,...(liveModelRow??{})}],verified:true,notice:''};},selectModel:async(id:string,scope:string)=>{calls.push(`select ${id} ${scope}`);}};
  /* R5b D4: a test may hand the app the live theme store (as run.ts does) to watch /theme preview and keep a theme. */
  const TuiApp=(createTuiAppComponent as any)(React,Ink,capabilities,undefined,themeStore);
  const session={mode:'mono',alternateScreen:true,paintBackground:false,fallbackReason:null};
  const Root=()=>React.createElement(Ink.Box,shell.terminalFrameProps({session,rows,columns:cols}),React.createElement(TuiApp,{runtime,catalog,invocation:{model,permissionMode:'default',resume:'s1'},projectRoot:root,paths,permissionRules:{allow:[],ask:[],deny:[]},terminalSize:{rows,columns:cols},...props}));
  const app=Ink.render(React.createElement(Root),{stdout,stdin,stderr:stdout,exitOnCtrlC:false,patchConsole:false,interactive:true,isScreenReaderEnabled:false,alternateScreen:true});
  const screen=async():Promise<Screen>=>{
    await pending;await pending;
    const buffer=term.buffer.active;const lines:string[]=[];let wrapped=0;
    for(let y=0;y<term.rows;y++){const line=buffer.getLine(buffer.viewportY+y);if(line?.isWrapped)wrapped++;lines.push(line?.translateToString(true,0,term.cols)??'');}
    return{lines,text:lines.join('\n'),rows:term.rows,cols:term.cols,wrapped};
  };
  const mounted:R5aApp={
    screen,calls,
    written(){return raw.join('');},
    async inverse(y,x){await pending;return Boolean(term.buffer.active.getLine(term.buffer.active.viewportY+y)?.getCell(x)?.isInverse());},
    async fg(y,x){await pending;const cell=term.buffer.active.getLine(term.buffer.active.viewportY+y)?.getCell(x);return cell&&cell.isFgRGB()?cell.getFgColor():-1;},
    press(bytes){stdin.write(bytes);},
    async type(text){for(const ch of text){stdin.write(ch);await sleep(8);}},
    emit(type,data){for(const sink of sinks.values())sink(v2('s1',type,data));},
    raw(event){for(const sink of sinks.values())sink(event);},
    async waitFor(label,check,timeout=10_000){const until=Date.now()+timeout;let last=await screen();while(Date.now()<until){last=await screen();if(check(last))return last;await sleep(25);}throw new Error(`timed out waiting for ${label}:\n${last.text}`);},
    async settle(){let last=(await screen()).text;for(let i=0;i<40;i++){await sleep(30);const next=(await screen()).text;if(next===last)return screen();last=next;}return screen();},
    unmount(){app.unmount();},
  };
  const first=await mounted.waitFor('first paint',s=>s.text.trim()!=='',15_000);
  const hasComposer=(s:Screen)=>s.lines.some(line=>/^╭─/u.test(line));
  if(!hasComposer(first)){await sleep(50);if(!hasComposer(await screen()))mounted.press(KEY.space);}
  await mounted.waitFor('the main screen',s=>s.lines.some(line=>/^╭─/u.test(line))&&/ · shift\+tab/u.test(s.text),15_000);await sleep(150);
  for(let i=0;i<2;i++){mounted.press('\x7f');await sleep(40);}
  return mounted;
}
