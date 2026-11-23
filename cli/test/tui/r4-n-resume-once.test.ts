/*
 * R4 lane N — with Enter running the highlighted command (Q-R4-5), a second Enter can reach the resume picker while the
 * first confirmation is still attaching the session (measured in the acceptance run: s09's harness presses Enter again
 * after `/resume`, the session was attached twice and its cut-off run stayed "writing", review D-08). A second Enter while
 * a resume or fork is being confirmed must do nothing: the session is attached once.
 * Mount: the REAL TuiApp through the REAL Ink 7.1.1 into `@xterm/headless`, as r1-layout-fixture.ts does, with a runtime
 * that counts how often each session is attached. No pty, no network, a temp profile.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {PassThrough} from 'node:stream';
import {after,before,test} from 'node:test';
import {hermeticProfile,sleep,v2} from './r1-layout-fixture.ts';

const require=createRequire(import.meta.url);
const {Terminal}=require('@xterm/headless') as typeof import('@xterm/headless');
let env:ReturnType<typeof hermeticProfile>;
before(()=>{env=hermeticProfile();});
after(()=>env.restore());

test('R4-N two quick Enter presses in the resume picker attach the session once',async()=>{
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const {createTuiAppComponent}=await import('../../src/tui/app.ts');
  const shell:any=await import('../../src/tui/components/terminal-shell.ts');
  const cols=100,rows=30;
  const term=new Terminal({cols,rows,allowProposedApi:true,scrollback:0,convertEol:true});
  let pending=Promise.resolve();
  const stdout:any=Object.assign(new EventEmitter(),{columns:cols,rows,isTTY:true,write(chunk:unknown){const text=String(chunk);pending=pending.then(()=>new Promise<void>(resolve=>term.write(text,resolve)));return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  const attached:string[]=[];
  const noRun=async()=>{throw new Error('no run in this test');};
  /* A slow session list makes the confirmation take time, as a real one does. */
  const runtime:any={setPermissionMode:async()=>{},restore:async()=>({}),listSessions:async()=>{await sleep(120);return[{sessionId:'s-old',id:'s-old',name:'an older session',outcome:'completed',updatedAt:'2026-09-24T10:00:00.000Z'}];},subscribe(id:string,sink:(event:any)=>void){attached.push(id);
    /* The session's last run was cut off mid-answer: started, streaming, never ended (s09). */
    for(const [type,data] of [['run.started',{runId:'r-cut'}],['message.started',{messageId:'a1',role:'assistant'}],['message.delta',{messageId:'a1',delta:'This answer was cut off'}]] as const)sink(v2(id,type,data as any));
    return()=>{};},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},shell:async()=>{},start:noRun,resume:noRun,fork:noRun};
  const catalog:any={listModels:async()=>[],listProviders:async()=>[],chosenProvider:()=>null,readiness:async()=>({ready:false,code:'NO_PROVIDER',message:'Choose a provider.'})};
  const TuiApp=createTuiAppComponent(React,Ink,{interactive:true,color:false,motion:false,unicode:true});
  const session={mode:'mono',alternateScreen:true,paintBackground:false,fallbackReason:null};
  const Root=()=>React.createElement(Ink.Box,shell.terminalFrameProps({session,rows,columns:cols}),React.createElement(TuiApp,{runtime,catalog,invocation:{model:'openai:gpt-5-mini',permissionMode:'default'},projectRoot:env.root,paths:env.paths,permissionRules:{allow:[],ask:[],deny:[]},terminalSize:{rows,columns:cols}}));
  const app=Ink.render(React.createElement(Root),{stdout,stdin,stderr:stdout,exitOnCtrlC:false,patchConsole:false,interactive:true,isScreenReaderEnabled:false,alternateScreen:true});
  const screen=async()=>{await pending;await pending;const buffer=term.buffer.active;const lines:string[]=[];for(let y=0;y<term.rows;y++)lines.push(buffer.getLine(buffer.viewportY+y)?.translateToString(true,0,term.cols)??'');return lines.join('\n');};
  const waitFor=async(label:string,check:(text:string)=>boolean,timeout=10_000)=>{const until=Date.now()+timeout;let last=await screen();while(Date.now()<until){last=await screen();if(check(last))return last;await sleep(25);}throw new Error(`timed out waiting for ${label}:\n${last}`);};
  try{
    await waitFor('first paint',text=>text.trim()!=='',15_000);
    stdin.write(' ');
    await waitFor('the composer',text=>/^│ ›/mu.test(text),15_000);/* UI Phase 0: no main roster row at idle */await sleep(150);
    for(let i=0;i<2;i++){stdin.write('\x7f');await sleep(40);}
    for(const ch of '/resume'){stdin.write(ch);await sleep(8);}
    await waitFor('the menu',text=>/› \/resume/u.test(text));
    stdin.write('\r');
    /* stage 7.5: /resume is the mockup's sheet («── Resume a conversation»); Enter on a row resumes it */
    await waitFor('the resume sheet with its session',text=>text.includes('Resume a conversation')&&text.includes('an older session'));
    stdin.write('\r');await sleep(30);stdin.write('\r');
    await waitFor('the sheet closed',text=>!text.includes('Resume a conversation'));
    await sleep(400);
    assert.deepEqual(attached,['s-old'],`the session was attached ${attached.length} times`);
    /* UI Phase 0 (owner 27/09): the idle mark is the composer with no busy status row, the main roster row is gone at idle */
    await waitFor('the cut-off run is not shown as running (D-08)',text=>/^│ ›/mu.test(text)&&!/^ \S .*· esc to stop/mu.test(text)&&!/Writing the answer/u.test(text),5_000);
  }finally{app.unmount();}
});
