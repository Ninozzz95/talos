/* UI phase stage 2, cure 2c: run.ts puts the TALOS row writer under Ink on the alternate screen of an interactive session,
   and leaves Ink's own full rewrite with TALOS_TUI_FULL_REPAINT=1 or without the alternate screen. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {runInkTui} from '../../src/tui/run.ts';

function harness(env:Record<string,string|undefined>,isTTY=true){
  const calls:unknown[]=[];
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get()};
  const Ink={Box:'Box',render(){return{waitUntilExit:async()=>{}};}};
  const stdout={isTTY,columns:100,rows:30,on(){},off(){},write(){return true;}};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin:{isTTY},stdout,env,installRowWriter:async(target:unknown)=>{calls.push(target);return true;}};
  return{io,calls,stdout};
}
const props={invocation:{color:true},uiTheme:'mono'} as any;

test('the row writer draws the alternate screen of an interactive session',async()=>{
  const h=harness({});
  await runInkTui(props,h.io as any);
  assert.deepEqual(h.calls,[h.stdout]);
});

test('TALOS_TUI_FULL_REPAINT=1 keeps Ink\'s own writer; any other value does not',async()=>{
  const off=harness({TALOS_TUI_FULL_REPAINT:'1'});await runInkTui(props,off.io as any);assert.deepEqual(off.calls,[]);
  const on=harness({TALOS_TUI_FULL_REPAINT:'0'});await runInkTui(props,on.io as any);assert.equal(on.calls.length,1);
});

test('no alternate screen (not a terminal): Ink\'s own writer',async()=>{
  const h=harness({},false);
  await runInkTui(props,h.io as any);
  assert.deepEqual(h.calls,[]);
});
