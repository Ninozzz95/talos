/*
 * Gate red of 13/10/2026 (full CLI gate on d28458ca2, acceptance s48 «Approve and start»: `the mode changed: timed out after 5000 ms`
 * at the FIRST Shift+Tab after launch; screen = the welcome frame, frames=2, and the eight rows «/resume /fork /rename /export /undo
 * /history /clear /compact» above the composer). Those eight rows are what a plain TAB does on an empty composer (app.ts, action
 * `palette`): the app received Tab, not Shift+Tab.
 *
 * Cause, measured the same day (was RED on 13/10/2026, cured after 0.6.1):
 *  · The composer is the first frame since P-A, and Ink turns the terminal's raw mode on in an effect of `useInput`, AFTER that frame.
 *  · On Windows a key that reaches the console before raw mode is on is kept as a key event and handed over later as its character:
 *    Shift+Tab (`ESC [ Z`) comes out as `\t`, the Shift is lost. A bare Node child under ConPTY, Shift+Tab written the moment its frame
 *    arrives: raw mode set 0 ms or 30 ms after the frame -> `09` 10 times of 10 each; raw mode set before the frame -> `1b5b5a` 10 of 10.
 *  · On the built CLI (d28458ca2), Shift+Tab written at the first paint: Tab (the eight rows, the same screen as the gate's) 1 time in 6
 *    on a quiet machine; under load the window between the frame and the effect grows, which is why only the full gate saw it.
 * So the screen said «Shift+Tab permission mode» and was not yet able to read it. It is the same class as R4-G (07/10, the focus
 * reports): the input modes come BEFORE the first frame, as Codex's `set_modes()` (raw mode, then the first draw) and Pi's `start()`.
 *
 * What this pins: when Ink draws its first frame, the terminal is already in raw mode; a session that is not a terminal is left
 * alone; and if the TUI ends without Ink having given raw mode back, run.ts gives it back.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {runInkTui} from '../../src/tui/run.ts';

function harness({stdoutIsTTY=true,inkRestoresRawMode=true,rawModeThrows=false,failsAt=null}:{stdoutIsTTY?:boolean;inkRestoresRawMode?:boolean;rawModeThrows?:boolean;/* review of 0.6.2: what comes between the early raw mode and the wait for the end, and may throw */failsAt?:'render'|'row-writer'|'ink-instance'|null}={}){
  let exit!:()=>void;const exited=new Promise<void>(resolve=>{exit=resolve;});
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get(),useState:(v:any)=>[v,()=>{}],useEffect:()=>{}};
  const stdout:any={isTTY:stdoutIsTTY,columns:100,rows:30,on(){},off(){},write(){return true;}};
  const rawCalls:boolean[]=[];let refused=false;
  /* `on`: only where the input-paint hook is the thing that fails (run.ts asks for Ink's instance only on a stdin that has listeners) */
  const stdin:any={isTTY:true,isRaw:false,read(){return null;},emit(){return true;},...(failsAt==='ink-instance'?{on(){return stdin;},off(){return stdin;},removeListener(){return stdin;}}:{}),setRawMode(on:boolean){if(rawModeThrows&&rawCalls.length===0&&!refused){refused=true;throw new Error('EPERM');}rawCalls.push(on);stdin.isRaw=on;return stdin;}};
  const rawAtFirstFrame:boolean[]=[];
  const Ink={Box:'Box',render(){
    rawAtFirstFrame.push(stdin.isRaw);
    if(failsAt==='render')throw new Error('INK_RENDER_FAILED');
    /* Ink's own switch, in an effect after the frame; and its switch-off when it unmounts */
    stdin.setRawMode(true);
    return{waitUntilExit:()=>exited.then(()=>{if(inkRestoresRawMode)stdin.setRawMode(false);}),unmount(){exit();}};
  }};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin,stdout,env:{TERM:'xterm-256color',COLORTERM:'truecolor'},installRowWriter:async()=>{if(failsAt==='row-writer')throw new Error('ROW_WRITER_FAILED');return true;},inkInstance:async()=>{if(failsAt==='ink-instance')throw new Error('INK_INSTANCE_FAILED');return null;}};
  const run=()=>runInkTui({invocation:{color:true},uiTheme:'mono'} as any,io as any);
  return{run,exit:()=>exit(),stdin,rawCalls,rawAtFirstFrame};
}

test('the terminal is in raw mode when Ink draws its first frame (a Shift+Tab pressed on the first frame is not read as Tab)',async()=>{
  const h=harness();const running=h.run();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(h.rawAtFirstFrame,[true],'raw mode was on before the first frame');
  h.exit();await running;
  assert.equal(h.stdin.isRaw,false,'and it is off again when the TUI has ended');
});

test('raw mode is given back even when Ink did not do it',async()=>{
  const h=harness({inkRestoresRawMode:false});const running=h.run();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(h.stdin.isRaw,true);
  h.exit();await running;
  assert.equal(h.stdin.isRaw,false,'run.ts switched it off at the end');
});

test('a session that is not a terminal (plain, append-only) never touches raw mode before the frame',async()=>{
  const h=harness({stdoutIsTTY:false});const running=h.run();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(h.rawAtFirstFrame,[false],'run.ts left raw mode alone');
  h.exit();await running;
});

test('a terminal that refuses raw mode before the frame still gets its screen',async()=>{
  const h=harness({rawModeThrows:true});const running=h.run();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(h.rawAtFirstFrame,[false],'Ink.render was reached: the refusal did not stop the TUI');
  h.exit();await running;
});

/* Review of 0.6.2 (13/10/2026): the early raw mode was set OUTSIDE the `try/finally` that gives it back, so a throw between it and
   the wait for the end (Ink's render, the row writer, the input-paint hook) left the person's terminal in raw mode: no echo, no
   line editing, Ctrl+C not a signal — after an error message they then could not answer. Every way out gives it back. */
for(const failsAt of ['render','row-writer','ink-instance'] as const)test(`raw mode is given back when the start fails at ${failsAt}`,async()=>{
  const h=harness({failsAt,inkRestoresRawMode:false});
  await assert.rejects(h.run(),/INK_RENDER_FAILED|ROW_WRITER_FAILED|INK_INSTANCE_FAILED/u);
  assert.deepEqual(h.rawAtFirstFrame,[true],'raw mode was on when the start failed');
  assert.equal(h.stdin.isRaw,false,'and the terminal got it back');
});

/* Second review of 0.6.2 (13/10/2026, N2): on that failure path the screen was taken down (`unmount()`) and the error left at once.
   Ink leaves the alternate screen as it unmounts and says when it has (`waitUntilExit`, ink.js 7.1.1:548-583): the error, which
   `main` prints the moment it gets it, was written INSIDE the alternate screen and vanished with it. The leave is awaited — for a
   bounded time, so a screen that never finishes leaving cannot keep the error from being said. */
function leavingHarness({leaveMs,neverLeaves=false}:{leaveMs:number;neverLeaves?:boolean}){
  const order:string[]=[];
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get(),useState:(v:any)=>[v,()=>{}],useEffect:()=>{}};
  const stdout:any={isTTY:true,columns:100,rows:30,on(){},off(){},write(){return true;}};
  const stdin:any={isTTY:true,isRaw:false,read(){return null;},emit(){return true;},setRawMode(on:boolean){stdin.isRaw=on;return stdin;}};
  let left!:()=>void;const hasLeft=new Promise<void>(resolve=>{left=resolve;});
  const Ink={Box:'Box',render(){return{
    /* Ink writes `exitAlternativeScreen` and only then resolves */
    waitUntilExit:()=>hasLeft,
    unmount(){order.push('unmount');if(!neverLeaves)setTimeout(()=>{order.push('left the alternate screen');left();},leaveMs);},
  };}};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin,stdout,env:{TERM:'xterm-256color',COLORTERM:'truecolor'},installRowWriter:async()=>{throw new Error('ROW_WRITER_FAILED');},inkInstance:async()=>null};
  const run=()=>runInkTui({invocation:{color:true},uiTheme:'mono'} as any,io as any).then(()=>{order.push('resolved');},()=>{order.push('the error reaches main');});
  return{run,order};
}

test('N2: when the start fails after the screen was drawn, the error leaves only after Ink has left the alternate screen',async()=>{
  const h=leavingHarness({leaveMs:60});
  await h.run();
  assert.deepEqual(h.order,['unmount','left the alternate screen','the error reaches main'],'the error was handed to main while the alternate screen was still up');
});

test('N2: a screen that never finishes leaving does not keep the error from being said',{timeout:30_000},async()=>{
  const h=leavingHarness({leaveMs:0,neverLeaves:true});
  const started=Date.now();
  await h.run();
  assert.deepEqual(h.order,['unmount','the error reaches main']);
  assert.ok(Date.now()-started<5_000,`the wait for the screen to leave is bounded (${Date.now()-started} ms)`);
});
