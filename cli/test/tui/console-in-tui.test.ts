/*
 * Owner decision 02/10 («Nel registro + avviso discreto», registro 12), through runInkTui: on an interactive screen the
 * console belongs to the TUI. Ink's own console patch is off, a console.warn while the TUI is up goes to logs/console.log
 * (the file `talos logs` reads) and not to the terminal, the app receives the count for its status row, and the console is
 * put back the moment the TUI ends. In plain mode nothing is captured (there is no frame to protect).
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {runInkTui} from '../../src/tui/run.ts';

function harness({interactive}:{interactive:boolean}){
  let exit!:()=>void;const exited=new Promise<void>(resolve=>{exit=resolve;});
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get(),useState:(v:any)=>[v,()=>{}],useEffect:()=>{}};
  let options:any=null;let root:any=null;
  const Ink={Box:'Box',render(element:any,opts:any){options=opts;root=element;return{waitUntilExit:()=>exited,unmount(){exit();}};}};
  const written:string[]=[];
  const stdout={isTTY:interactive,columns:100,rows:30,on(){},off(){},write(chunk:string){written.push(String(chunk));return true;}};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin:{isTTY:interactive},stdout,env:{TERM:'xterm-256color',COLORTERM:'truecolor'},installRowWriter:async()=>true};
  return{io,exit,options:()=>options,root:()=>root,written};
}

test('interactive: Ink does not patch the console; a warning goes to logs/console.log, is counted, and the console comes back',async t=>{
  const logs=mkdtempSync(join(tmpdir(),'talos-console-tui-'));t.after(()=>rmSync(logs,{recursive:true,force:true}));
  const before=console.warn;
  const h=harness({interactive:true});
  const running=runInkTui({invocation:{color:true},uiTheme:'mono',paths:{logsRoot:logs}} as any,h.io as any);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(h.options()?.patchConsole,false,'Ink would clear the frame and write the line over it');
  assert.notEqual(console.warn,before,'captured while the TUI is up');
  console.warn('[session-store] risposta non salvata');
  const app=h.root().type().children?.[0]??h.root().type();
  const store=(app.props??{}).consoleWarnings;
  assert.equal(store?.getSnapshot(),1,'the app receives the count for its status row');
  assert.match(readFileSync(join(logs,'console.log'),'utf8'),/WARN  \[session-store\] risposta non salvata/u);
  assert.equal(h.written.some(chunk=>chunk.includes('risposta non salvata')),false,'never on the terminal');
  h.exit();await running;
  assert.equal(console.warn,before,'put back when the TUI ends');
});

test('plain mode: nothing captured, Ink keeps its defaults',async t=>{
  const logs=mkdtempSync(join(tmpdir(),'talos-console-tui-'));t.after(()=>rmSync(logs,{recursive:true,force:true}));
  const before=console.warn;
  const h=harness({interactive:false});
  const running=runInkTui({invocation:{color:true},uiTheme:'mono',paths:{logsRoot:logs}} as any,h.io as any);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(h.options()?.patchConsole,undefined);
  assert.equal(console.warn,before);
  h.exit();await running;
});
