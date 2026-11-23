/* Startup stage 1 (owner 02/10): the TUI is on screen while the kernel loads. A kernel that fails to load ends the TUI, and
   runInkTui rejects with the kernel's own error, so main reports it exactly as when it failed before the screen. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {runInkTui} from '../../src/tui/run.ts';

function harness(){
  let unmounted=0;let exit!:()=>void;const exited=new Promise<void>(resolve=>{exit=resolve;});
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get()};
  const Ink={Box:'Box',render(){return{waitUntilExit:()=>exited,unmount(){unmounted++;exit();}};}};
  const stdout={isTTY:false,columns:100,rows:30,on(){},off(){},write(){return true;}};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin:{isTTY:false},stdout,env:{},installRowWriter:async()=>true};
  return{io,unmounted:()=>unmounted,exit};
}
const props={invocation:{color:true},uiTheme:'mono'} as any;

test('a startup that fails ends the TUI and runInkTui rejects with that error',async()=>{
  const h=harness();const failure=Object.assign(new Error('The TALOS runtime could not be found'),{code:'TALOS_RUNTIME_UNAVAILABLE'});
  await assert.rejects(runInkTui({...props,startup:Promise.reject(failure)},h.io as any),failure);
  assert.equal(h.unmounted(),1);
});

test('a startup that succeeds leaves the TUI running until it exits normally',async()=>{
  const h=harness();
  const running=runInkTui({...props,startup:Promise.resolve({reasoningEffort:null,notices:[]})},h.io as any);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(h.unmounted(),0);
  h.exit();await running;
});
