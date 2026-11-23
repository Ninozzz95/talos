/*
 * Gate red of 07/10 (full CLI gate on 18bea9bfe; s31 and s33 of the acceptance suite, reproduced alone 12 of 14 times): the composer
 * is the first frame since P-A («compositore subito»), and it was painted ~5 ms BEFORE TALOS asked the terminal for focus reports
 * (`?1004h`) and took the reports out of stdin. A focus-out sent in that window never reached the app (ConPTY drops a report the
 * client has not asked for), so the notification setting looked broken: timeline of every silent run, composer frame at t, `?1004h`
 * at t+5 ms, report sent at t+4 ms; in the one good run the report came 177 ms after `?1004h`. Before P-A the 600 ms boot covered it.
 * Competitors set the input modes first and draw second: Codex `tui/src/tui.rs` `set_modes()` (paste, raw mode, focus) before the
 * first draw; Pi `packages/tui/src/terminal.ts` `start()` (raw mode, bracketed paste, then the input callback) before the first render.
 * What this pins: when Ink draws its first frame, (1) the terminal has been asked for focus reports, (2) the focus and mouse reports
 * are already taken out of stdin (a report read at that moment never reaches Ink), (3) both filters still sit in the order the
 * REV-ESC-PTY analysis assumed (mouse first, focus outside it), and (4) both are given back at the end.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {FOCUS_OFF,FOCUS_ON} from '../../src/tui/notifications.ts';
import {MOUSE_OFF,MOUSE_ON} from '../../src/tui/mouse.ts';
import {runInkTui} from '../../src/tui/run.ts';

const E='\u001b';
function harness({mouse,stdoutIsTTY=true}:{mouse?:boolean;stdoutIsTTY?:boolean}={}){
  let exit!:()=>void;const exited=new Promise<void>(resolve=>{exit=resolve;});
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get(),useState:(v:any)=>[v,()=>{}],useEffect:()=>{}};
  const written:string[]=[];
  const stdout:any={isTTY:stdoutIsTTY,columns:100,rows:30,on(){},off(){},write(chunk:any){written.push(String(chunk));return true;}};
  const chunks:string[]=[];
  const originalRead=function(){return chunks.shift()??null;};
  const stdin:any={isTTY:true,read:originalRead,emit(){return true;}};
  const atFirstFrame:{focusAsked:boolean;mouseAsked:boolean;patched:boolean;focusReportRead:unknown;wheelReportRead:unknown;splitRead:unknown[]}[]=[];
  const Ink={Box:'Box',render(){
    const focusAsked=written.some(w=>w.includes(FOCUS_ON));const mouseAsked=written.some(w=>w.includes(MOUSE_ON));
    const patched=stdin.read!==originalRead;
    chunks.push(`${E}[O`);const focusReportRead=stdin.read();
    chunks.push(`${E}[<64;10;5M`);const wheelReportRead=stdin.read();
    /* a focus report split after its first byte, as a pty can deliver it, between two letters */
    chunks.push('a');chunks.push(E);chunks.push('[Ob');const splitRead=[stdin.read(),stdin.read(),stdin.read()];
    atFirstFrame.push({focusAsked,mouseAsked,patched,focusReportRead,wheelReportRead,splitRead});
    stdout.write('frame');return{waitUntilExit:()=>exited,unmount(){exit();}};
  }};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin,stdout,env:{TERM:'xterm-256color',COLORTERM:'truecolor'},installRowWriter:async()=>true};
  const run=()=>runInkTui({invocation:{color:true},uiTheme:'mono',...(mouse===undefined?{}:{mouse})} as any,io as any);
  return{run,exit:()=>exit(),written,stdin,originalRead,atFirstFrame};
}

test('R4-G focus reports are asked for, and taken out of stdin, before Ink draws its first frame',async()=>{
  const h=harness();const running=h.run();
  await new Promise(resolve=>setTimeout(resolve,30));
  const first=h.atFirstFrame[0];
  assert.ok(first,'Ink drew a frame');
  assert.equal(first.focusAsked,true,'?1004h was written before the first frame');
  assert.equal(first.patched,true,'stdin.read was already filtered when the first frame was drawn');
  assert.equal(first.focusReportRead,'','a focus report read at that moment does not reach Ink');
  assert.equal(first.mouseAsked,false,'the mouse reports are NOT asked for yet: that waits for the row writer and the handlers behind the filter');
  h.exit();await running;
  assert.ok(h.written.join('').includes(MOUSE_ON),'and they are asked for once the row writer is in');
});

test('R4-G the mouse reports are taken out before the first frame too, and a split focus report between two letters leaves only the letters',async()=>{
  const h=harness();const running=h.run();
  await new Promise(resolve=>setTimeout(resolve,30));
  const first=h.atFirstFrame[0]!;
  assert.equal(first.wheelReportRead,'','a wheel report never reaches Ink');
  /* 'a', then the lone ESC (never held: it passes), then '[Ob' - the rebuilt focus marker is taken out and the 'b' survives */
  const text=first.splitRead.map(part=>part===null||part===undefined?'':String(part)).join('');
  assert.ok(!text.includes('[O'),`no part of the focus report is typed: ${JSON.stringify(first.splitRead)}`);
  assert.ok(text.includes('a')&&text.includes('b'),`the letters survive: ${JSON.stringify(first.splitRead)}`);
  h.exit();await running;
});

test('R4-G with the mouse switched off by the setting only the focus reports are filtered',async()=>{
  const h=harness({mouse:false});const running=h.run();
  await new Promise(resolve=>setTimeout(resolve,30));
  const first=h.atFirstFrame[0]!;
  assert.equal(first.focusReportRead,'');
  assert.equal(first.wheelReportRead,`${E}[<64;10;5M`,'no mouse filter when the mouse is off: the terminal selects as before');
  h.exit();await running;
});

test('R4-G both filters and both modes are given back when the TUI ends',async()=>{
  const exitListeners=process.listenerCount('exit');
  const h=harness();const running=h.run();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(process.listenerCount('exit')>exitListeners,'while it runs, the process-exit switch-offs are registered');
  h.exit();await running;
  assert.equal(process.listenerCount('exit'),exitListeners,'and all of them are removed again');
  assert.equal(h.stdin.read,h.originalRead,'stdin.read is the original again');
  const all=h.written.join('');
  assert.ok(all.includes(FOCUS_OFF),'focus reports switched off');
  assert.ok(all.includes(MOUSE_OFF),'mouse reports switched off');
});

test('R4-G a session that is not a terminal (plain, append-only) touches neither stdin nor the focus mode',async()=>{
  const h=harness({stdoutIsTTY:false});const running=h.run();
  await new Promise(resolve=>setTimeout(resolve,30));
  const first=h.atFirstFrame[0]!;
  assert.equal(first.focusAsked,false,'no ?1004h on a stream that is not a terminal');
  assert.equal(first.patched,false,'stdin.read is left alone');
  assert.equal(first.focusReportRead,`${E}[O`,'nothing is filtered');
  h.exit();await running;
  assert.ok(!h.written.join('').includes(FOCUS_OFF),'and nothing is switched off at the end');
});
