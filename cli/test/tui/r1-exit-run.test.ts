/* R1 lane X (E10, Q-R1-4): run.ts writes the exit output only after Ink has left the alternate screen. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {runInkTui} from '../../src/tui/run.ts';
import type {TuiExitSnapshot} from '../../src/tui/exit-output.ts';

type Log=Array<string>;
const conversation:TuiExitSnapshot={sessionId:'s-42',items:[
  {kind:'message',id:'u',role:'user',text:'hello',streaming:false},
  {kind:'message',id:'a',role:'assistant',text:'OK',streaming:false},
]};

/** A fake Ink whose waitUntilExit mirrors ink.js 7.1.1 `unmount()`: React cleanup (where lane L calls onExit) runs
 *  first (ink.js:585-596), then `exitAlternativeScreen` is written (ink.js:548-552), then the exit promise resolves
 *  behind a write barrier (ink.js:572-583). */
function harness({snapshot,stdoutIsTTY=true,callOnExit=true,fail=false}:{snapshot:TuiExitSnapshot|null;stdoutIsTTY?:boolean;callOnExit?:boolean;fail?:boolean}){
  const log:Log=[];let renderOptions:any=null;
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get()};
  const Ink={Box:'Box',render(element:any,options:any){
    renderOptions=options;log.push(`render alt=${options.alternateScreen}`);
    const frame=element.type();const app=frame.children[0];
    return{waitUntilExit:async()=>{
      await new Promise(resolve=>setImmediate(resolve));
      if(fail)throw new Error('INK_TEST_FAILURE');
      if(callOnExit)app.props.onExit(snapshot);
      if(options.alternateScreen)log.push('leave-alt');
      await new Promise(resolve=>setImmediate(resolve));
      log.push('exit-resolved');
    }};
  }};
  const stdout={isTTY:stdoutIsTTY,columns:100,rows:30,on(){},off(){},write(chunk:string){log.push(`write ${JSON.stringify(chunk)}`);return true;}};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin:{isTTY:true},stdout,env:{} as Record<string,string|undefined>};
  return{log,io,options:()=>renderOptions};
}
const props=(extra:Record<string,unknown>={})=>({invocation:{color:true},...extra}) as any;

test('R1 X the transcript and resume line are written after the alternate screen is left, once',async()=>{
  const h=harness({snapshot:conversation});
  await runInkTui(props({uiTheme:'mono'}),h.io as any);
  assert.deepEqual(h.log,['render alt=true','leave-alt','exit-resolved',`write ${JSON.stringify('You\nhello\n\nTALOS\nOK\n\nTo resume this session: talos --resume s-42\n')}`]);
});

test('R1 X the setting reduces the output to the resume line',async()=>{
  const h=harness({snapshot:conversation});
  await runInkTui(props({uiTheme:'mono',exitOutput:'resume'}),h.io as any);
  assert.deepEqual(h.log.slice(-1),[`write ${JSON.stringify('To resume this session: talos --resume s-42\n')}`]);
});

test('R1 X nothing is written for an empty session, or when the app never reported one',async()=>{
  for(const h of [harness({snapshot:{sessionId:'s-42',items:[]}}),harness({snapshot:conversation,callOnExit:false})]){
    await runInkTui(props({uiTheme:'mono'}),h.io as any);
    assert.deepEqual(h.log,['render alt=true','leave-alt','exit-resolved']);
  }
});

test('R1 X no resume line without an id; colour follows the session capabilities',async()=>{
  const h=harness({snapshot:{...conversation,sessionId:null}});
  await runInkTui(props(),h.io as any);
  const written=h.log.at(-1)!;
  assert.match(written,/\\u001b\[1mYou\\u001b\[22m/u);
  assert.doesNotMatch(written,/resume/u);
});

test('R1 X plain mode stays append-only and prints nothing extra (E14)',async()=>{
  const h=harness({snapshot:conversation,stdoutIsTTY:false});
  await runInkTui(props(),h.io as any);
  assert.equal(h.options().alternateScreen,false);
  assert.deepEqual(h.log,['render alt=false','exit-resolved']);
});

test('P4-EXIT focus and progress reset before alternate/raw exit, read restored even on error',async()=>{
  for(const fail of [false,true]){
    const h=harness({snapshot:conversation,fail});const read=()=>null;(h.io.stdin as any).read=read;
    if(fail)await assert.rejects(()=>runInkTui(props({notifications:'off'}),h.io as any),/INK_TEST_FAILURE/u);
    else await runInkTui(props({notifications:'off'}),h.io as any);
    assert.equal((h.io.stdin as any).read,read);
    const enabled=h.log.findIndex(s=>s.includes('1004h'));
    const disabled=h.log.findIndex(s=>s.includes('1004l'));
    /* R4-G (07/10): the focus reports are asked for BEFORE Ink's first frame, so the write is the first log entry (index 0);
       what this test pins is that it happened (not -1) and that the switch-off comes after it. Where it sits against the first
       frame is pinned by r4-g-input-modes-before-first-frame.test.ts. */
    assert.ok(enabled>=0&&disabled>enabled);
    assert.ok(h.log[disabled]!.includes('9;4;0;0'));
    if(!fail)assert.ok(disabled<h.log.indexOf('leave-alt'));
    assert.equal(h.log.filter(s=>s.includes('1004l')).length,1);
  }
});
