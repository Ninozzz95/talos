/*
 * Stage 5, cure 3 (registro 12): a frame caused by input is painted at once. Ink throttles frames (120 a second since cure
 * 1); a key arriving right after a frame of a streaming answer waited for the window's end (p95 up to 19.6 ms). On every
 * stdin chunk TALOS asks Ink, on the next tick (after React's synchronous commit), to flush its pending throttled frame —
 * Ink's own `settleThrottle` uses the same `flush`. Nothing pending, nothing drawn.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import {throttle} from 'es-toolkit/compat';
import {installInputPaint} from '../../src/tui/input-paint.ts';

const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('the dependency: flushing a throttle runs a pending call once, and nothing when none is pending',async()=>{
  let calls=0;const throttled=throttle(()=>{calls++;},1000,{leading:true,trailing:true});
  throttled();assert.equal(calls,1,'leading');
  throttled();assert.equal(calls,1,'held for the window');
  throttled.flush();assert.equal(calls,2,'flushed at once');
  throttled.flush();assert.equal(calls,2,'nothing pending, nothing run');
  throttled.cancel();
});

test('every stdin chunk flushes Ink\'s pending frame on the next tick; removing it stops',async()=>{
  const stdin=new EventEmitter();let flushes=0;
  const ink={throttledOnRender:{flush(){flushes++;}},throttledLog:{flush(){flushes+=10;}}};
  const remove=installInputPaint({stdin,ink});
  stdin.emit('readable');
  assert.equal(flushes,0,'not inside the key handler: React has not committed yet');
  await tick();
  assert.equal(flushes,11,'the frame, then its write');
  remove();stdin.emit('readable');await tick();
  assert.equal(flushes,11);
});

test('an Ink without a throttle (debug, screen reader) is left alone',async()=>{
  const stdin=new EventEmitter();
  const remove=installInputPaint({stdin,ink:{}});
  stdin.emit('readable');await tick();
  remove();
  assert.equal(stdin.listenerCount('readable'),0);
});

test('a burst of chunks in one tick asks once',async()=>{
  const stdin=new EventEmitter();let flushes=0;
  installInputPaint({stdin,ink:{throttledOnRender:{flush(){flushes++;}}}});
  stdin.emit('readable');stdin.emit('readable');stdin.emit('readable');await tick();
  assert.equal(flushes,1);
});

test('the TUI paints input at once while it is up, and stops at the end',async()=>{
  const {runInkTui}=await import('../../src/tui/run.ts');
  let exit!:()=>void;const exited=new Promise<void>(resolve=>{exit=resolve;});
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get(),useState:(v:any)=>[v,()=>{}],useEffect:()=>{}};
  const Ink={Box:'Box',render(){return{waitUntilExit:()=>exited,unmount(){exit();}};}};
  const stdout:any={isTTY:true,columns:100,rows:30,on(){},off(){},write(){return true;}};
  const stdin:any=Object.assign(new EventEmitter(),{isTTY:true});
  let flushes=0;const ink={throttledOnRender:{flush(){flushes++;}}};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin,stdout,env:{TERM:'xterm-256color',COLORTERM:'truecolor'},installRowWriter:async()=>true,inkInstance:async()=>ink};
  const running=runInkTui({invocation:{color:true},uiTheme:'mono'} as any,io as any);
  await new Promise(resolve=>setTimeout(resolve,30));
  stdin.emit('readable');await tick();
  assert.equal(flushes,1,'input painted at once');
  exit();await running;
  assert.equal(stdin.listenerCount('readable'),0,'removed when the TUI ends');
});
