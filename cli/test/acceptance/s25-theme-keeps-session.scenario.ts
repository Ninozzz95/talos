/**
 * P11 (owner, 2026-09-25, "quando cambio tema crasha il processo"). The owner's development log: `/theme`, then about a
 * second later `controller.close` and a fresh state (no session, empty queue), three times. Cause: the root frame
 * (run.ts `Root` → terminalFrameProps) passes `backgroundColor` only when the theme has a background; `mono` has none,
 * and Ink's Box wraps its children in a background Provider only when it has a colour. Crossing mono changed the
 * tree's shape, React remounted the whole app, and its unmount closed the session controller: the conversation was
 * gone. The R5b acceptance (s23/s24) never crossed mono and never looked at the session.
 * Here, on the BUILT CLI behind the refusing sink: /theme across mono and back, after a turn and during a slow turn,
 * keeps ONE session (counted with `talos session list` at the end) and the conversation on screen.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {composerReady,idleFooter} from './checks.ts';
import {exitTalos,stage,toComposer,turn} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const HOME='\u001b[H',END='\u001b[F';
const sink=await startRefusingSink();
const s=stage({name:'s25',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
let t:TerminalSession;
const frames:Record<string,Screen>={};

async function themeAcrossMono(){
  /* stage 7.18: the /theme page (the mockup's) lists the ten themes; Mono stays /theme mono */
  await t.submit('/theme');
  await t.waitFor('the theme page',x=>/██ \S+ +in use/u.test(x.text),{timeout:15_000});
  t.send(END);await sleep(500);   // telemetry
  t.send(HOME);await sleep(500);  // forge
  t.press('enter');await sleep(800);
  await t.submit('/theme mono');await sleep(800);   // mono: no background
  await t.submit('/theme calm');await sleep(800);   // calm: a background again
}

test('s25 · after a turn, /theme across mono and back keeps the conversation',async()=>{
  t=s.launch([],{cols:100,rows:32});await toComposer(t);
  await turn(t,s.fake,'remember the word PELICAN');
  await themeAcrossMono();
  frames.afterSet=t.screen();
  assert.match(frames.afterSet.text,/remember the word PELICAN/u,`the conversation left the screen after /theme:\n${frames.afterSet.text}`);
  await turn(t,s.fake,'second message after theme');
});

test('s25 · /theme across mono while a slow turn streams: the turn ends in the same conversation',async()=>{
  await t.submit('SLOW tell me a long story');
  await t.waitFor('the slow turn is running',x=>!idleFooter(x),{timeout:15_000});
  await themeAcrossMono();
  t.press('esc');
  frames.afterRun=await t.waitFor('the slow turn ended',x=>idleFooter(x)&&composerReady(x),{timeout:60_000});
  assert.match(frames.afterRun.text,/second message after theme/u,`the conversation left the screen during a turn:\n${frames.afterRun.text}`);
});

test('s25 · one session only: changing theme never started a new conversation',async()=>{
  await exitTalos(t);
  const listed=await s.profile.talos(['--json','session','list']);
  assert.equal(listed.status,0,listed.stderr);
  const parsed=JSON.parse(listed.stdout);
  const rows=Array.isArray(parsed)?parsed:(parsed.sessions??parsed.items??parsed.rows??[]);
  assert.equal(rows.length,1,`sessions after the theme changes: ${rows.length}\n${listed.stdout.slice(0,600)}`);
});

test.after(async()=>{await sink.close();});
