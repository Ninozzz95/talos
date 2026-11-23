/**
 * s52 — P-A (owner 07/10 sera, «Compositore subito»; the approved mockup's instant start): a launch that has nothing to
 * load opens on the composer — no logo held for 600 ms, no skip hint, no boot counter at any frame. The first launch of a
 * profile still plays the full boot (skippable), and a start that DOES have something to load (a resume) shows its loading
 * state, then the composer. Measured 07/10: the held logo was 600 of the 845 ms a warm start took to reach the composer.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {composerReady,idleFooter} from './checks.ts';
import {exitTalos,stage,turn} from './harness.ts';
import type {TerminalSession} from './terminal.ts';

const s=stage({name:'s52',files:{'README.md':'# demo\n'}});
let t:TerminalSession;
const BOOT_MARKS=/BOOT\s+\d+%|Press any key to skip|runtime synchronization|SIGNAL ACQUISITION/u;
const LOGO_BLOCK='████';
/* the composer is the boxed prompt row `│ ›` (or a bare `>` row without borders), as checks.ts composerReady reads it */
const hasComposerRow=(text:string)=>/^(?:│ ›|\s*>(?:\s|$))/mu.test(text);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

/** Sample the screen every 10 ms from the spawn until the composer is ready; return every distinct non-blank frame. */
async function framesUntilComposer(session:TerminalSession,timeoutMs=30_000){
  const frames:string[]=[];const start=performance.now();let readyAt=-1;
  while(performance.now()-start<timeoutMs){
    await sleep(10);
    const screen=session.screen();
    if(screen.text.trim()!==''&&frames.at(-1)!==screen.text)frames.push(screen.text);
    if(composerReady(screen)&&idleFooter(screen)){readyAt=performance.now()-start;break;}
  }
  return{frames,readyAt};
}

test('s52 · the first launch of a profile still plays the full boot, and a key skips it',async()=>{
  t=s.launch([],{cols:100,rows:30});
  const first=await t.waitFor('first paint',x=>x.text.trim()!=='',{timeout:30_000});
  assert.match(first.text,/BOOT\s+\d+%|SIGNAL ACQUISITION|Press any key to skip/u,'the first launch of a profile must keep its boot');
  t.press('space');
  await t.waitFor('the composer is ready',x=>composerReady(x)&&idleFooter(x),{timeout:30_000});
  await exitTalos(t);
});

test('s52 · P-A a plain warm start: the first frame already has the composer, and no frame shows the boot',async()=>{
  t=s.launch([],{cols:100,rows:30});
  const {frames,readyAt}=await framesUntilComposer(t);
  assert.ok(readyAt>=0,'the composer never became ready');
  assert.ok(frames.length>0,'no frame was painted');
  assert.ok(composerReady(t.screen()),'the composer is on screen');
  for(const frame of frames){
    assert.doesNotMatch(frame,BOOT_MARKS,`a boot frame was painted before the composer:\n${frame}`);
    assert.ok(!frame.includes(LOGO_BLOCK),`the logo was painted before the composer:\n${frame}`);
  }
  assert.ok(hasComposerRow(frames[0]!),`the first painted frame is not the composer:\n${frames[0]}`);
  await turn(t,s.fake,'hello warm start');
  await exitTalos(t);
});

test('s52 · P-A a start with a session to load shows the loading state and then the composer',async()=>{
  const listed=await s.profile.talos(['session','list','--json']);
  const id=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u.exec(listed.stdout)?.[0];
  assert.ok(id,`no session to resume:\n${listed.stdout}`);
  t=s.launch(['--resume',id!],{cols:100,rows:30});
  const {readyAt}=await framesUntilComposer(t);
  assert.ok(readyAt>=0,'the resumed session never reached the composer');
  await t.waitFor('the resumed conversation is on screen',x=>x.text.includes('hello warm start'),{timeout:10_000});
  await exitTalos(t);
});
