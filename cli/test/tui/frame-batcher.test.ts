/*
 * Stage 5, cure 2 (measured in registro 12): Ink 7.1.1 writes a frame as three writes — DEC 2026 begin, the frame, DEC 2026
 * end (`ink.js:221-232`) — and ConPTY, given the begin alone, waits ~8 ms for the rest: a key took 10.2 ms to show instead
 * of 3.2 ms with the same bytes in one write. The batcher turns a synchronized frame into one write; nothing else changes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {batchSynchronizedFrames,BSU,ESU} from '../../src/tui/frame-batcher.ts';
import {runInkTui} from '../../src/tui/run.ts';

function stream(){const writes:string[]=[];const s={write(chunk:any,cb?:()=>void){writes.push(String(chunk));cb?.();return true;}};return{s,writes};}

test('a synchronized frame becomes one write, in order',()=>{
  const {s,writes}=stream();batchSynchronizedFrames(s);
  s.write(BSU);s.write('\u001b[36;1Hrow');s.write('\u001b[H');s.write(ESU);
  assert.deepEqual(writes,[`${BSU}\u001b[36;1Hrow\u001b[H${ESU}`]);
});

test('other writes pass as they are; a write with a callback is not held',()=>{
  const {s,writes}=stream();batchSynchronizedFrames(s);
  s.write('plain');let called=false;s.write('with callback',()=>{called=true;});
  assert.deepEqual(writes,['plain','with callback']);assert.equal(called,true);
  s.write(BSU);s.write('a');s.write('b',()=>{});
  assert.deepEqual(writes.slice(2),[`${BSU}a${ESU}`,'b'],'a callback write flushes what is held first, closed');
});

test('a begin without its end is never held past the current turn of the event loop',async()=>{
  const {s,writes}=stream();batchSynchronizedFrames(s);
  s.write(BSU);s.write('half a frame');
  assert.deepEqual(writes,[]);
  await Promise.resolve();
  assert.deepEqual(writes,[`${BSU}half a frame${ESU}`],'flushed, and closed (review 1)');
});

test('restoring puts the original write back and flushes',()=>{
  const {s,writes}=stream();const original=s.write;const restore=batchSynchronizedFrames(s);
  s.write(BSU);s.write('x');restore();
  assert.equal(s.write,original);assert.deepEqual(writes,[`${BSU}x${ESU}`]);
});

test('the TUI batches its stdout while it is up, and gives it back at the end',async()=>{
  let exit!:()=>void;const exited=new Promise<void>(resolve=>{exit=resolve;});
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get(),useState:(v:any)=>[v,()=>{}],useEffect:()=>{}};
  const written:string[]=[];
  const stdout:any={isTTY:true,columns:100,rows:30,on(){},off(){},write(chunk:string){written.push(String(chunk));return true;}};
  const original=stdout.write;
  let during:string[]=[];
  const Ink={Box:'Box',render(){stdout.write(BSU);stdout.write('frame');stdout.write(ESU);during=[...written];return{waitUntilExit:()=>exited,unmount(){exit();}};}};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin:{isTTY:true},stdout,env:{TERM:'xterm-256color',COLORTERM:'truecolor'},installRowWriter:async()=>true};
  const running=runInkTui({invocation:{color:true},uiTheme:'mono'} as any,io as any);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(during.includes(`${BSU}frame${ESU}`),`one write for the frame: ${JSON.stringify(during)}`);
  exit();await running;
  assert.equal(stdout.write,original,'stdout is given back');
});
