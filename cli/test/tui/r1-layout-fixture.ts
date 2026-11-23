/**
 * R1 lane L: mounts the REAL TuiApp through the REAL Ink 7.1.1 into a fake TTY whose bytes feed an `@xterm/headless`
 * emulator, so a test reads the screen a person would see (gate E11/E13) without a pty or a child process. The root
 * frame is built exactly as `run.ts` builds it (`terminalFrameProps` around the app), the runtime is a fake whose
 * session sink lets a test push canonical v2 events (streaming, approval, a resumed history), and nothing touches the
 * real profile: APPDATA/LOCALAPPDATA point at a temp folder for the whole file.
 */
import {EventEmitter} from 'node:events';
import {bootPlan} from '../../src/tui/launch-state.ts';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {resolveCliPaths} from '../../src/paths.ts';

const require=createRequire(import.meta.url);
const {Terminal}=require('@xterm/headless') as typeof import('@xterm/headless');
const realSetTimeout=globalThis.setTimeout;
export const sleep=(ms:number)=>new Promise(resolve=>realSetTimeout(resolve,ms));
export const ESC='\u001B';
export const KEY={enter:'\r',esc:ESC,up:`${ESC}[A`,pageUp:`${ESC}[5~`,pageDown:`${ESC}[6~`,ctrlHome:`${ESC}[1;5H`,ctrlEnd:`${ESC}[1;5F`,ctrlL:'\x0c',altP:`${ESC}p`,space:' '};

export type Screen={lines:string[];text:string;rows:number;cols:number;wrapped?:number};

/* Hermetic environment for the whole test file: secret-named variables, Ink's own switches and the real profile roots
   never reach the app. Returns the restore function for `after`. */
/* P17 (owner decisions 2026-09-26): a first launch with something missing opens the guided setup. These fixtures mount the
   app for other purposes, so their profile has launched before — recorded with another version, which keeps the full boot
   (`launch-state.ts`: an update is a full boot too). `firstLaunch:true` gives a profile that has never launched. */
export function hermeticProfile({firstLaunch=false}:{firstLaunch?:boolean}={}){
  const saved={...process.env};
  for(const name of Object.keys(process.env))if(/api[-_]?key|authorization|password|secret|token|credential/iu.test(name)||name==='DEV'||name==='INK_SCREEN_READER'||name==='CI'||name==='CONTINUOUS_INTEGRATION')delete process.env[name];
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'talos-r1-layout-'));
  process.env.APPDATA=path.join(root,'appdata');process.env.LOCALAPPDATA=path.join(root,'localappdata');
  const paths=resolveCliPaths({APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,XDG_CONFIG_HOME:path.join(root,'config'),XDG_STATE_HOME:path.join(root,'state'),XDG_CACHE_HOME:path.join(root,'cache')},process.platform,root);
  if(!firstLaunch)bootPlan({dataRoot:paths.dataRoot,version:'0.0.0-fixture'});
  return{root,paths,restore(){for(const name of Object.keys(process.env))if(!(name in saved))delete process.env[name];Object.assign(process.env,saved);
    /* 14/10/2026 (flaky «/conf + ig + Enter» under load: EPERM on this rm, 1 to 4 runs in 16 in parallel). The app was just
       unmounted and its own prompt-history write (appendFile, then a read of the file) can still be in flight: Windows refuses
       to delete a file this process still has open, and a SYNCHRONOUS retry blocks the event loop that would close it (measured:
       10 retries over 5.5 s still failed; an 800 ms async pause before the unmount never did). So: delete now, and when the
       delete is refused, delete again asynchronously once the in-flight I/O has closed. The runner removes its private temp anyway. */
    try{fs.rmSync(root,{recursive:true,force:true});}
    catch(error:any){if(!['EPERM','EBUSY','ENOTEMPTY'].includes(error?.code))throw error;void fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}).catch(()=>{});}
  }};
}

let eventSeq=0;
export function v2(sessionId:string,type:string,data:Record<string,unknown>){return{schema:'talos.cli.event.v2',version:2,sessionId,eventId:`r1-${++eventSeq}`,type,data};}

export type MountedApp={
  screen:()=>Promise<Screen>;
  press:(bytes:string)=>void;
  emit:(type:string,data:Record<string,unknown>)=>void;
  waitFor:(label:string,check:(s:Screen)=>boolean,timeout?:number)=>Promise<Screen>;
  resize:(cols:number,rows:number)=>Promise<void>;
  settle:()=>Promise<Screen>;
  bytes:()=>number;
  exits:()=>unknown[];
  wheel:(delta:-1|1)=>void;
  unmount:()=>void;
};

export async function mountApp({cols,rows,root,paths,history=[] as Array<{type:string;data:Record<string,unknown>}>,onPermissionMode=async()=>{},onFork,onExport,startup,catalog:catalogOverride,configuredModel,invocation:invocationOverride,restoreDelayMs=0,immediate=false,initialPrompt,onRestore,onListSessions,providerCheckingShownMs,remote,startView,mouseSelection,projectUntrusted}:{/* form B, No (a) */projectUntrusted?:boolean;/* FE-048: the pointer's handler, to ask what a cell answers */mouseSelection?:any;/* FE-048: `ui.startView` */startView?:string;/* 0.6.15: the window's remote bridge (tui-remote.ts) */remote?:any;/* review of 0.6.2: how long the status row may say «checking…» for one check (the app's own 4 s when not given) */providerCheckingShownMs?:number;/* B1: what the app asks its runtime to restore, and to list */onRestore?:(selection:unknown)=>void;onListSessions?:(options:unknown)=>void;/* stage 7.6: what runtime.export gives (the /fork and /resume sheets read a session's events) */onExport?:(id:string)=>unknown;startup?:Promise<unknown>;/* P-A: a start other than the default resume of s1, and a runtime that takes time to restore (the boot is on screen meanwhile) */invocation?:Record<string,unknown>;restoreDelayMs?:number;/* P-A: return right after the render, the boot not skipped and the main screen not awaited, to watch the first frames */immediate?:boolean;/* P-A: a prompt given on the command line */initialPrompt?:string;catalog?:any;configuredModel?:string|null;cols:number;rows:number;root:string;paths:any;history?:Array<{type:string;data:Record<string,unknown>}>;onPermissionMode?:()=>Promise<void>;onFork?:()=>Promise<string>}):Promise<MountedApp>{
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const {createTuiAppComponent}=await import('../../src/tui/app.ts');
  const shell:any=await import('../../src/tui/components/terminal-shell.ts');
  const term=new Terminal({cols,rows,allowProposedApi:true,scrollback:0,convertEol:true});
  let pending=Promise.resolve();let written=0;
  const stdout:any=Object.assign(new EventEmitter(),{columns:cols,rows,isTTY:true,write(chunk:unknown){const text=String(chunk);written+=Buffer.byteLength(text);pending=pending.then(()=>new Promise<void>(resolve=>term.write(text,resolve)));return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  const sinks=new Map<string,(event:any)=>void>();const exits:unknown[]=[];
  /* F-023: the wheel injector — the app registers its listener on this fake mouseWheel prop, `mounted.wheel` fires it. */
  let wheelListener:((delta:-1|1)=>void)|null=null;
  const wheel={subscribe(listener:(delta:-1|1)=>void){wheelListener=listener;return()=>{wheelListener=null;};}};
  const noRun=async()=>{throw new Error('no run in this test');};
  const runtime:any={setPermissionMode:onPermissionMode,restore:async(selection?:unknown)=>{onRestore?.(selection);if(restoreDelayMs>0)await sleep(restoreDelayMs);return {};},listSessions:async(options?:unknown)=>{onListSessions?.(options);return [{sessionId:'s1'}];},subscribe(id:string,sink:(event:any)=>void){sinks.set(id,sink);for(const row of history)sink(v2(id,row.type,row.data));return()=>sinks.delete(id);},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},shell:async()=>{},start:noRun,resume:noRun,fork:onFork??noRun,...(onExport?{export:onExport}:{})};
  const catalog:any=catalogOverride??{listModels:async()=>[],listProviders:async()=>[],chosenProvider:()=>null,readiness:async()=>({ready:false,code:'NO_PROVIDER',message:'Choose a provider.'})};
  const TuiApp=createTuiAppComponent(React,Ink,{interactive:true,color:false,motion:false,unicode:true});
  const session={mode:'mono',alternateScreen:true,paintBackground:false,fallbackReason:null};
  let sizeRef={rows,columns:cols};const listeners=new Set<()=>void>();
  const Root=()=>{
    const size=React.useSyncExternalStore((l:()=>void)=>{listeners.add(l);return()=>listeners.delete(l);},()=>sizeRef,()=>sizeRef);
    const frame=shell.terminalFrameProps({session,rows:size.rows,columns:size.columns});
    return React.createElement(Ink.Box,frame,React.createElement(TuiApp,{...(projectUntrusted?{projectUntrusted:true}:{}),...(startup?{startup}:{}),...(startView?{startView}:{}),...(mouseSelection?{mouseSelection}:{}),...(configuredModel!==undefined?{configuredModel}:{}),...(initialPrompt!==undefined?{initialPrompt}:{}),...(providerCheckingShownMs!==undefined?{providerCheckingShownMs}:{}),...(remote?{remote}:{}),runtime,catalog,invocation:invocationOverride??{model:'openai:gpt-5-mini',permissionMode:'default',resume:'s1'},projectRoot:root,paths,permissionRules:{allow:[],ask:[],deny:[]},terminalSize:{rows:size.rows,columns:size.columns},onExit:(snapshot:unknown)=>exits.push(snapshot),...(wheel?{mouseWheel:wheel}: {})}));
  };
  const app=Ink.render(React.createElement(Root),{stdout,stdin,stderr:stdout,exitOnCtrlC:false,patchConsole:false,interactive:true,isScreenReaderEnabled:false,alternateScreen:true});
  const screen=async():Promise<Screen>=>{
    await pending;await pending;
    const buffer=term.buffer.active;const lines:string[]=[];
    /* Only the visible columns: after a width shrink the emulator keeps cells past the new edge that a real terminal
       drops. `wrapped` counts rows the terminal had to wrap, i.e. a line wider than the screen. */
    let wrapped=0;
    for(let y=0;y<term.rows;y++){const line=buffer.getLine(buffer.viewportY+y);if(line?.isWrapped)wrapped++;lines.push(line?.translateToString(true,0,term.cols)??'');}
    return{lines,text:lines.join('\n'),rows:term.rows,cols:term.cols,wrapped};
  };
  const mounted:MountedApp={
    screen,
    press(bytes){stdin.write(bytes);},
    emit(type,data){for(const sink of sinks.values())sink(v2('s1',type,data));},
    async waitFor(label,check,timeout=10_000){
      const until=Date.now()+timeout;let last=await screen();
      while(Date.now()<until){last=await screen();if(check(last))return last;await sleep(25);}
      throw new Error(`timed out waiting for ${label}:\n${last.text}`);
    },
    async resize(nextCols,nextRows){
      stdout.columns=nextCols;stdout.rows=nextRows;term.resize(nextCols,nextRows);sizeRef={rows:nextRows,columns:nextCols};
      stdout.emit('resize');for(const listener of [...listeners])listener();
      await sleep(80);
    },
    async settle(){let last=(await screen()).text;for(let i=0;i<40;i++){await sleep(30);const next=(await screen()).text;if(next===last)return screen();last=next;}return screen();},
    bytes:()=>written,
    exits:()=>exits,
    wheel(delta:-1|1){if(!wheelListener)throw new Error('the app did not subscribe to the wheel');wheelListener(delta);},
    unmount(){app.unmount();},
  };
  /* The boot animation: one key skips it, as a person (and the acceptance harness) does. */
  if(immediate)return mounted;
  const first=await mounted.waitFor('first paint',s=>s.text.trim()!=='',15_000);
  /* Only while no main frame is up: after it the key would land in the composer. */
  const hasComposer=(s:Screen)=>s.lines.some(line=>/^╭─/u.test(line));
  if(!hasComposer(first)){await sleep(50);if(!hasComposer(await screen()))mounted.press(KEY.space);}
  /* stage 7.10d: a first launch with nothing set up opens the setup sheet in the composer's place (owner 03/10) */
  await mounted.waitFor('the main screen',s=>s.lines.some(line=>/╭─/u.test(line)||/^ ?› /u.test(line)||/^── .* ✕$/u.test(line)),15_000);await sleep(150);
  /* A skip key that raced the end of the boot lands in the composer as a space: take it back out. */
  for(let i=0;i<2;i++){mounted.press('\x7f');await sleep(40);}
  return mounted;
}

/* Copied from cli/test/acceptance/checks.ts (brokenBorders, lane I owns that file): rows that mix a box border with
   other content are the visible trace of a frame that overwrote itself (review D-02). */
export function brokenBorders(lines:readonly string[]):string[]{
  return lines.map(line=>line.trim()/* a box drawn under an indent (the answer's tables, two cells in) is still a box */).filter(line=>
    (/^[┌└╭╰]/u.test(line)&&!/^[┌└╭╰][─━═][^]*[┐┘╮╯]$/u.test(line))||
    (/[┐┘╮╯]$/u.test(line)&&!/^[┌└╭╰]/u.test(line)));
}
export const composerRow=(s:Screen)=>s.lines.findIndex(line=>/^│ ›/u.test(line));
/* UI Phase 0 (owner 27/09, "like Claude Code"): no main roster row without a working subagent; idle = the composer is on
   screen and the status row shows no activity (the same rule as test/acceptance/checks.ts `idleFooter`). */
/* Stage 4: the status row is the mockup's activity line; a turn at work ends it with «· esc to stop» (checks.ts). */
const BUSY_STATUS=/^ \S .*(?:· esc to stop|· alt\+a to watch)|^ \S Waiting for your answer · |No data from the model for /mu;
export const idleRoster=(s:Screen)=>composerRow(s)>=0&&!BUSY_STATUS.test(s.text)&&!s.text.includes('Esc/Ctrl+C interrupt');
