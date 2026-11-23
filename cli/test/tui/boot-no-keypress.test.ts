import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import test,{after} from 'node:test';
import {TALOS_BOOT_DURATION_MS} from '../../src/tui/boot/cinematic.ts';
import {STATIC_BOOT_MS} from '../../src/tui/boot/boot-sequence.ts';
import {resolveCliPaths} from '../../src/paths.ts';

// ---------------------------------------------------------------------------------------------------
// B1 slice 20: THE BOOT LOGO DOES NOT WAIT FOR A KEY. Every scenario mounts the real TuiApp through the
// real Ink (throttled, as `run.ts` renders it; `interactive` and the screen reader are pinned to what Ink
// detects in a real terminal outside CI) into a fake TTY, never writes one byte to stdin, and judges the
// boot by the frames Ink actually writes to stdout. Timing questions use real timers.
//
// Measured on the owner's host before the cure: Node fires `setTimeout(cb, n)` on its monotonic loop
// clock, and seen through `Date.now()` the callback ran after n-1 ms in 25-30 of 400 timers. The boot's
// single completion timer then found the reveal unfinished, `completeBoot` returned the same state, nothing
// re-armed, and the logo stayed until a key: 1 hang in 8 real boots, then 1 in 12 traced boots — the only
// one of the 12 whose timer fired early (7,115 ms armed, 7,114 by Date.now()). `EARLY_MS` below makes
// that early firing deterministic and larger than scheduling noise, so the red does not depend on luck;
// the last group keeps Node's timers untouched.
// ---------------------------------------------------------------------------------------------------
const MARGIN_MS=1500;// the stated margin: a hang never ends, a loaded test process can be late
const EARLY_MS=40;
const AFTER_END_MS=TALOS_BOOT_DURATION_MS+1300;
const realSetTimeout=globalThis.setTimeout;
const CHR=(code:number)=>String.fromCharCode(code);
const ANSI=new RegExp(`${CHR(0x1b)}\\[[0-9;?]*[ -/]*[@-~]|${CHR(0x1b)}\\][^${CHR(7)}]*${CHR(7)}`,'gu');
const sleep=(ms:number)=>new Promise(resolve=>realSetTimeout(resolve,ms));

// Hermetic: no secret-named variable reaches the app, Ink's own switches (devtools, screen reader) are off,
// and the profile roots are temporary. Everything is put back when the file ends.
const savedEnvironment={...process.env};
for(const name of Object.keys(process.env))if(/api[-_]?key|authorization|password|secret|token|credential/iu.test(name)||name==='DEV'||name==='INK_SCREEN_READER')delete process.env[name];
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'talos-boot-no-key-'));
process.env.APPDATA=path.join(profile,'appdata');process.env.LOCALAPPDATA=path.join(profile,'localappdata');
after(()=>{
  for(const name of Object.keys(process.env))if(!(name in savedEnvironment))delete process.env[name];
  Object.assign(process.env,savedEnvironment);
  fs.rmSync(profile,{recursive:true,force:true});
});

type FrameKind='logo'|'starting'|'main'|'other';
type Frame={at:number;kind:FrameKind;waitingNote:boolean};
type Init=number|'microtask'|'never';
type Boot={frames:Frame[];appRenders:number[];bootRenders:number[];stdinWrites:number};

function kindOf(chunk:string):FrameKind|null{
  const text=chunk.replace(ANSI,'');
  if(!text.trim())return null;
  /* UI Phase 0 (owner 27/09): no main roster row at idle any more; the main screen is the one with the composer. */
  if(/│ ›/u.test(text))return'main';
  if(text.includes('AUTONOMOUS TERMINAL'))return'logo';
  if(/^starting$/mu.test(text))return'starting';
  return'other';
}
function frameTimeline(frames:readonly Frame[]){
  const spans:{kind:FrameKind;from:number;to:number;count:number}[]=[];
  for(const frame of frames){const last=spans.at(-1);if(last?.kind===frame.kind){last.to=frame.at;last.count++;}else spans.push({kind:frame.kind,from:frame.at,to:frame.at,count:1});}
  return spans.map(span=>`${span.kind}×${span.count} ${span.from}${span.to===span.from?'':`–${span.to}`} ms`).join(' → ')||'no frame';
}

// A 100×40 fake TTY: stdout keeps the time and kind of every frame Ink writes, stdin counts writes (there are none).
function fakeTerminal(){
  const frames:Frame[]=[];let stdinWrites=0;
  const t0=performance.now();const now=()=>Math.round(performance.now()-t0);
  const stdout:any=Object.assign(new EventEmitter(),{columns:100,rows:40,isTTY:true,write(chunk:unknown){const text=String(chunk);const kind=kindOf(text);if(kind)frames.push({at:now(),kind,waitingNote:text.includes('runtime synchronization…')});return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  const write=stdin.write.bind(stdin);stdin.write=(...args:any[])=>{stdinWrites++;return write(...args);};
  return{frames,now,stdinWrites:()=>stdinWrites,options:{stdout,stdin,stderr:stdout,exitOnCtrlC:false,patchConsole:false,interactive:true,isScreenReaderEnabled:false}};
}

async function bootWithoutKeys({init,motion,color,observeMs}:{init:Init;motion:boolean;color:boolean;observeMs:number}):Promise<Boot>{
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const {createTuiAppComponent}=await import('../../src/tui/app.ts');
  const appRenders:number[]=[];const bootRenders:number[]=[];
  const {frames,now,stdinWrites,options}=fakeTerminal();
  // A fake runtime: `initialize` waits on `restore` only when resuming, so a timed or endless start resumes.
  const noRun=async()=>{throw new Error('no run in this test');};
  const runtime:any={restore:()=>init==='never'?new Promise(()=>{}):new Promise(resolve=>realSetTimeout(()=>resolve({}),typeof init==='number'?init:0)),listSessions:async()=>[],subscribe:()=>()=>{},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},shell:async()=>{},start:noRun,resume:noRun,fork:noRun};
  // Renders are counted where TuiApp builds its root and where BootSequence writes its status label, so an idle
  // render loop is visible without reading React state.
  const CountingReact={...React,createElement(type:any,props:any,...children:any[]){if(typeof props?.key==='string'&&/^(boot|main)-/u.test(props.key))appRenders.push(now());if(type===Ink.Text&&props?.dimColor===true&&children.length===1&&BOOT_LABEL.test(String(children[0])))bootRenders.push(now());return(React.createElement as any)(type,props,...children);}};
  const TuiApp=createTuiAppComponent(CountingReact,Ink,{interactive:true,color,motion:motion&&color,unicode:true});
  /* R4 Q-R4-4: the full boot plays only on a first launch, recorded under the data root. Every mount here is a first launch,
     so each gets its own data root (a shared one made every mount after the first a short boot). */
  const launch=fs.mkdtempSync(path.join(profile,'launch-'));
  const paths=resolveCliPaths({APPDATA:path.join(launch,'appdata'),LOCALAPPDATA:path.join(launch,'localappdata'),XDG_CONFIG_HOME:path.join(launch,'config'),XDG_STATE_HOME:path.join(launch,'state'),XDG_CACHE_HOME:path.join(launch,'cache')},process.platform,profile);
  const invocation:any={model:'openai:gpt-5-mini',permissionMode:'default',...(init==='microtask'?{}:{resume:'boot-session'})};
  const app=Ink.render(React.createElement(TuiApp,{runtime,catalog:{listModels:async()=>[]},invocation,projectRoot:profile,paths,permissionRules:{allow:[],ask:[],deny:[]}}),options);
  try{await sleep(observeMs);}finally{app.unmount();}
  return{frames,appRenders,bootRenders,stdinWrites:stdinWrites()};
}

function assertReachesMain(t:any,boot:Boot,{opening,notBefore,deadline}:{opening:FrameKind;notBefore:number;deadline:number}){
  const timeline=frameTimeline(boot.frames);t.diagnostic(timeline);
  assert.equal(boot.stdinWrites,0,'no input was ever written');
  assert.equal(boot.frames[0]?.kind,opening,`the boot screen is drawn first: ${timeline}`);
  const main=boot.frames.find(frame=>frame.kind==='main');
  assert.ok(main,`the main screen is written with no key pressed: ${timeline}`);
  assert.ok(main.at<=deadline,`the main screen arrives by ${deadline} ms, not at ${main.at} ms: ${timeline}`);
  assert.ok(main.at>=notBefore,`the boot is not cut short (main at ${main.at} ms, before ${notBefore} ms): ${timeline}`);
  assert.equal(boot.frames.at(-1)?.kind,'main',`the main screen stays: ${timeline}`);
}
const rendersBetween=(renders:readonly number[],from:number,to:number)=>renders.filter(at=>at>from&&at<to).length;
// The status line under the logo: a stage name, or the waiting and failure notes. The project root never matches.
const BOOT_LABEL=/^(?:[A-Z]+(?: [A-Z]+)*|runtime synchronization…|startup failed|Press any key to skip)$/u;
const DEADLINE_MS=TALOS_BOOT_DURATION_MS+MARGIN_MS;
const NOT_BEFORE_MS=TALOS_BOOT_DURATION_MS-5;// Date.now() and performance.now() round differently
// R4 Q-R4-4 (v): with no motion or no colour the full boot is the still frame for at most STATIC_BOOT_MS, so main comes when the
// runtime is ready (1500 ms here), never before the still frame's second.
const STATIC_INIT_MS=1500;const STATIC_NOT_BEFORE_MS=Math.max(STATIC_BOOT_MS,STATIC_INIT_MS)-5;const STATIC_DEADLINE_MS=Math.max(STATIC_BOOT_MS,STATIC_INIT_MS)+MARGIN_MS;

const logoThenMain=(init:Init,motion:boolean)=>async(s:any)=>{
  const [notBefore,deadline]=motion?[NOT_BEFORE_MS,DEADLINE_MS]:[STATIC_NOT_BEFORE_MS,STATIC_DEADLINE_MS];
  assertReachesMain(s,await bootWithoutKeys({init,motion,color:true,observeMs:deadline}),{opening:'logo',notBefore,deadline});
};
// The runtime is ready only after the animation: main when it is, and no render loop in between.
const waitingThenMain=async(s:any)=>{
  const boot=await bootWithoutKeys({init:AFTER_END_MS,motion:true,color:true,observeMs:AFTER_END_MS+MARGIN_MS});
  assertReachesMain(s,boot,{opening:'logo',notBefore:AFTER_END_MS-5,deadline:AFTER_END_MS+MARGIN_MS});
  const app=rendersBetween(boot.appRenders,TALOS_BOOT_DURATION_MS+300,AFTER_END_MS-100),logo=rendersBetween(boot.bootRenders,TALOS_BOOT_DURATION_MS+300,AFTER_END_MS-100);
  s.diagnostic(`renders while waiting for the runtime: TuiApp ${app}, BootSequence ${logo}`);
  assert.ok(app<=3,`waiting ${AFTER_END_MS-TALOS_BOOT_DURATION_MS-400} ms for the runtime renders TuiApp ${app} times`);
  assert.ok(logo<=3,`waiting ${AFTER_END_MS-TALOS_BOOT_DURATION_MS-400} ms for the runtime redraws the finished logo ${logo} times`);
};
// The runtime never becomes ready: the boot screen stays (there is nothing else to show), without a render loop.
const waitingForever=async(s:any)=>{
  const boot=await bootWithoutKeys({init:'never',motion:true,color:true,observeMs:DEADLINE_MS});
  const timeline=frameTimeline(boot.frames);s.diagnostic(timeline);
  assert.equal(boot.stdinWrites,0,'no input was ever written');
  assert.ok(boot.frames.length>0&&boot.frames.every(frame=>frame.kind==='logo'),`only the boot screen is written: ${timeline}`);
  assert.equal(boot.frames.at(-1)?.waitingNote,true,'past the reveal the boot says it is waiting for the runtime');
  const app=rendersBetween(boot.appRenders,TALOS_BOOT_DURATION_MS+300,DEADLINE_MS),logo=rendersBetween(boot.bootRenders,TALOS_BOOT_DURATION_MS+300,DEADLINE_MS);
  s.diagnostic(`renders while waiting forever: TuiApp ${app}, BootSequence ${logo}`);
  assert.ok(app<=3,`waiting ${MARGIN_MS-300} ms forever renders TuiApp ${app} times`);
  assert.ok(logo<=3,`waiting ${MARGIN_MS-300} ms forever redraws the finished logo ${logo} times`);
};

test('no key, the boot timer firing early by the clock the boot reads: every boot still leaves by itself',{concurrency:true},async t=>{
  globalThis.setTimeout=Object.assign((callback:any,delay?:number,...args:any[])=>realSetTimeout(callback,typeof delay==='number'&&delay>=1000?delay-EARLY_MS:delay,...args),realSetTimeout) as typeof setTimeout;
  try{
    await Promise.all([
      t.test('initialize resolves on a timer before the animation ends: logo, then main within the boot duration plus the margin',logoThenMain(1500,true)),
      t.test('initialize resolves in a microtask, as a bare `talos` does: logo, then main',logoThenMain('microtask',true)),
      t.test('motion off: the still logo, then main',logoThenMain(STATIC_INIT_MS,false)),
      t.test('initialize resolves after the animation ends: main when the runtime is ready',waitingThenMain),
      t.test('initialize never resolves: the logo stays',waitingForever),
      t.test('colour off, runtime ready after the animation ends: "starting", then main',async(s:any)=>{
        assertReachesMain(s,await bootWithoutKeys({init:AFTER_END_MS,motion:false,color:false,observeMs:AFTER_END_MS+MARGIN_MS}),{opening:'starting',notBefore:AFTER_END_MS-5,deadline:AFTER_END_MS+MARGIN_MS});
      }),
      t.test('BootSequence without the logo draws "starting" and still ends the boot, once, when the reveal is over',async(s:any)=>{
        const React=(await import('react')).default;const Ink:any=await import('ink');
        const {createBootSequenceComponent,createBootState}=await import('../../src/tui/boot/boot-sequence.ts');
        const BootSequence=createBootSequenceComponent(React,Ink);
        const {frames,now,stdinWrites,options}=fakeTerminal();const completions:number[]=[];
        const app=Ink.render(React.createElement(BootSequence,{state:createBootState(Date.now()),logo:false,motion:false,unicode:true,width:100,onComplete:()=>completions.push(now())}),options);
        try{await sleep(STATIC_BOOT_MS+MARGIN_MS);}finally{app.unmount();}
        s.diagnostic(`${frameTimeline(frames)} · onComplete at ${completions.join(', ')||'never'} ms`);
        assert.equal(stdinWrites(),0,'no input was ever written');
        assert.ok(frames.length>0&&frames.every(frame=>frame.kind==='starting'),frameTimeline(frames));
        assert.equal(completions.length,1,'the end of the boot is signalled exactly once');
        assert.ok(completions[0]!>=STATIC_BOOT_MS-5&&completions[0]!<=STATIC_BOOT_MS+MARGIN_MS,`signalled at ${completions[0]} ms`);
      }),
      t.test('colour off, runtime ready before the animation ends: "starting", then main',async(s:any)=>{
        assertReachesMain(s,await bootWithoutKeys({init:STATIC_INIT_MS,motion:false,color:false,observeMs:STATIC_DEADLINE_MS}),{opening:'starting',notBefore:STATIC_NOT_BEFORE_MS,deadline:STATIC_DEADLINE_MS});
      }),
    ]);
  }finally{globalThis.setTimeout=realSetTimeout;}
});

test('no key, Node timers untouched: the boot leaves by itself and waits for the runtime without a render loop',{concurrency:true},async t=>{
  await Promise.all([
    t.test('a bare `talos`: logo, then main',logoThenMain('microtask',true)),
    t.test('initialize resolves after the animation ends: main when the runtime is ready',waitingThenMain),
    t.test('initialize never resolves: the logo stays',waitingForever),
  ]);
});

// The boot screen can leave before the reveal ends (a key, the TUI exiting). The completion timer still pending then
// must go with it: otherwise it calls `onComplete` for a boot that is gone and keeps the process alive until it fires.
// Judged by effect with real timers: a control left mounted proves the same pending timer does fire.
test('no key, the boot leaves before the reveal ends: its pending completion timer never fires afterwards',async t=>{
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const {createBootSequenceComponent,createBootState}=await import('../../src/tui/boot/boot-sequence.ts');
  const BootSequence=createBootSequenceComponent(React,Ink);
  const LEFT_MS=400;
  const state=createBootState(Date.now()-(STATIC_BOOT_MS-LEFT_MS));// motion off below: the still frame's reveal
  const mount=()=>{
    const terminal=fakeTerminal();const calls:number[]=[];
    const props={state,logo:false,motion:false,unicode:true,width:100,onComplete:()=>calls.push(terminal.now())};
    return{terminal,calls,props,app:Ink.render(React.createElement(BootSequence,props),terminal.options)};
  };
  const kept=mount(),unmounted=mount(),skipped=mount();
  try{
    await sleep(50);
    assert.deepEqual([kept.calls.length,unmounted.calls.length,skipped.calls.length],[0,0,0],'the completion timer is pending when the boot leaves');
    unmounted.app.unmount();
    skipped.app.rerender(React.createElement(BootSequence,{...skipped.props,state:{...state,skipped:true}}));
    await sleep(LEFT_MS+600);
    t.diagnostic(`onComplete calls after ${LEFT_MS+650} ms — left mounted: ${kept.calls.join(', ')||'none'} · unmounted at 50 ms: ${unmounted.calls.join(', ')||'none'} · skipped at 50 ms: ${skipped.calls.join(', ')||'none'}`);
    assert.equal(kept.calls.length,1,'control: left mounted, the pending timer fires once');
    assert.deepEqual(unmounted.calls,[],'after unmount no timer calls onComplete');
    assert.deepEqual(skipped.calls,[],'after a skip no timer calls onComplete');
    assert.equal(kept.terminal.stdinWrites()+unmounted.terminal.stdinWrites()+skipped.terminal.stdinWrites(),0,'no input was ever written');
  }finally{for(const boot of [kept,unmounted,skipped])boot.app.unmount();}
});
