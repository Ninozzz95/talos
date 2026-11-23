/**
 * s12 — below the 40×12 minimum TALOS shows one line and nothing else; at 40×12 and above it degrades (Q-R1-8, gate E13).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TOO_SMALL_NOTICE,composerReady,idleFooter,tooSmallOnly} from './checks.ts';
import {stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s12',files:{'README.md':'# demo\n'}});
let t:TerminalSession;
const size=(x:Screen)=>`${x.cols}×${x.rows}`;

test('s12 · TALOS starts at 100×30',async()=>{
  t=s.launch([],{cols:100,rows:30});
  await toComposer(t);
});

for(const [cols,rows] of [[39,12],[40,11],[30,8]] as const){
  test(`s12 · R1-MIN at ${cols}×${rows} the screen shows only "${TOO_SMALL_NOTICE}"`,async()=>{
    t.resize(cols,rows);
    await t.waitFor(`R1-MIN: at ${cols}×${rows} the screen is exactly "${TOO_SMALL_NOTICE}"`,x=>x.cols===cols&&x.rows===rows&&tooSmallOnly(x),{timeout:5_000});
  });
}

/* Passes today (measured 2026-09-24): a guard that the notice starts strictly BELOW the minimum. */
test('s12 · at exactly 40×12 the full interface stays, with the composer',async()=>{
  t.resize(40,12);
  const at=await t.waitFor('R1-MIN: the frame at 40×12 shows the composer',x=>x.cols===40&&x.rows===12&&composerReady(x),{timeout:5_000});
  assert.ok(!at.text.includes('Terminal too small'),`R1-MIN: at ${size(at)} (the minimum itself) the too-small notice is shown:\n${at.text}`);
});

test('s12 · back at 100×30 the idle composer and footer return',async()=>{
  t.resize(100,30);
  await t.waitFor('the frame at 100×30 is back',x=>x.cols===100&&composerReady(x)&&idleFooter(x),{timeout:10_000});
  assert.equal(t.exit,null,`TALOS exited while it was small (code ${t.exit?.code})`);
});
