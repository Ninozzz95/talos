/*
 * Stage 5 (key echo ≤16 ms; research and measures in registro 12): Ink 7.1.1 throttles frames to `maxFps`, default 30
 * (`ink.js:194-213`, leading+trailing over 34 ms), so a key arriving right after another frame waited for the window's end.
 * Measured on the synthetic terminal, p95 key→screen while an answer streams: 48 ms at 30, 29 ms at 60, 20 ms at 120.
 * Codex caps at 120 frames a second too (PR #39057). Events are already coalesced at 16 ms by the render coordinator, so
 * the higher cap mostly lets input through.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {runInkTui,TUI_MAX_FPS} from '../../src/tui/run.ts';

test('the TUI asks Ink for 120 frames a second, not its default 30',async()=>{
  let exit!:()=>void;const exited=new Promise<void>(resolve=>{exit=resolve;});
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get(),useState:(v:any)=>[v,()=>{}],useEffect:()=>{}};
  let options:any=null;
  const Ink={Box:'Box',render(_element:any,opts:any){options=opts;return{waitUntilExit:()=>exited,unmount(){exit();}};}};
  const stdout={isTTY:true,columns:100,rows:30,on(){},off(){},write(){return true;}};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin:{isTTY:true},stdout,env:{TERM:'xterm-256color',COLORTERM:'truecolor'},installRowWriter:async()=>true};
  const running=runInkTui({invocation:{color:true},uiTheme:'mono'} as any,io as any);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(TUI_MAX_FPS,120);
  assert.equal(options?.maxFps,TUI_MAX_FPS);
  exit();await running;
});
