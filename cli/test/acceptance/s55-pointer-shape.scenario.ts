/**
 * Owner 08/10/2026: «gli elementi cliccabili col puntatore dovrebbero avere cursore pointer non normal»; 09/10 «Solo dove
 * funziona (Consigliata)». On the BUILT CLI through ConPTY: in a terminal that implements OSC 22 (kitty here, by its
 * KITTY_WINDOW_ID) TALOS asks for the motion with no button held (DEC 1003) and sets the hand over a clickable row, the
 * default pointer off it; in any other terminal (Windows Terminal) it asks for neither.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
after(()=>sink.close());
const kitty=stage({name:'s55k',files:{'README.md':'# demo\n','src/index.js':'console.log(1)\n'},extraEnv:{...sinkEnv(sink),KITTY_WINDOW_ID:'1'}});
const plain=stage({name:'s55w',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const overSsh=stage({name:'s55ssh',files:{'README.md':'# demo\n'},extraEnv:{SSH_TTY:'/dev/pts/0'}});
const ESC='\u001b';
let t:TerminalSession;
const hover=(col:number,row:number)=>t.send(`${ESC}[<35;${col+1};${row+1}M`);

test('s55 · in kitty the pointer is a hand over a group of calls and the default off it',async()=>{
  t=kitty.launch(['--permission-mode','bypassPermissions'],{cols:120,rows:40});
  try{
    const ready=await toComposer(t);
    assert.ok(t.output.read().mouseEnables.some(sequence=>sequence.includes('1003')),'the motion with no button is asked for');
    void ready;
    await t.submit('MOCKUP The login e2e test is flaky. Find out why and fix it.');
    const done=await t.waitFor('the finished turn',x=>x.text.includes('nothing else changed')&&!/esc to stop/u.test(x.text),{timeout:60_000});
    const row=done.lines.findIndex(line=>line.includes('● Read 2 files'));
    assert.ok(row>=0,done.text);
    const window=t.meter();
    const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
    hover(8,row);await wait(400);
    hover(60,1);await wait(400);
    const shapes=window.stop().pointerShapes;
    assert.deepEqual(shapes,['pointer','default'],`the hand over the group, the default off it: ${JSON.stringify(shapes)}`);
  }finally{await t.close();}
});

/* owner 01/11/2026: the hover works in every terminal (tested in Windows Terminal), and only over SSH TALOS asks for no motion */
test('s55 · in another terminal TALOS asks for motion, for the hover, and sets no pointer',async()=>{
  t=plain.launch([],{cols:100,rows:30});
  try{
    await toComposer(t);
    hover(5,5);await t.settled();
    const out=t.output.read();
    assert.equal(out.mouseEnables.some(sequence=>sequence.includes('1003')),true,'motion reports asked for');
    assert.deepEqual(out.pointerShapes,[]);
  }finally{await t.close();}
});

test('s55 · over SSH TALOS asks for no motion',async()=>{
  t=overSsh.launch([],{cols:100,rows:30});
  try{
    await toComposer(t);
    hover(5,5);await t.settled();
    assert.equal(t.output.read().mouseEnables.some(sequence=>sequence.includes('1003')),false,'no motion reports over SSH');
  }finally{await t.close();}
});
