/**
 * s05 — a streaming answer, a follow-up queued while busy, Esc, HTTP 429 and HTTP 500 (review §B s05; D-05, D-06, D-08).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertEnglishOnly,idleFooter} from './checks.ts';
import {stage,toComposer,turn} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const FOLLOW_UP='and a follow up while busy';
const s=stage({name:'s05',files:{'README.md':'# demo\n','src/index.js':"console.log(1)\n"}});
let t:TerminalSession;let streaming:Screen;let afterInterrupt:Screen;let after429:Screen;let during500:Screen;let end500:Screen;

test('s05 · a slow answer streams on screen',async()=>{
  t=s.launch([],{cols:100,rows:30});
  await toComposer(t);
  await t.submit('SLOW tell me a story');
  streaming=await t.waitForText('can be observed while it is still arriving. This answer streams',{timeout:20_000});
  assert.ok(!idleFooter(streaming),'the session is busy while the answer streams');
});

test('s05 · R3: D-08 while the answer text streams the status does not say "thinking"',()=>{
  assert.doesNotMatch(streaming.text,/^ \S Thinking\b/mu,'D-08: the status says "thinking" while the answer is being written');
});

test('s05 · a follow-up typed while busy is queued and shown',async()=>{
  await t.submit(FOLLOW_UP);
  /* FE-048 (owner 01/11, «Fascia sopra il prompt»): the queued message waits in the band; the strip keeps the count */
  const queued=await t.waitFor('the queued follow-up',x=>/1 queued · goes in/u.test(x.text)&&x.lines.some(line=>line.includes(`› ${FOLLOW_UP}`)),{timeout:10_000});
  assert.match(queued.text,/queue 1/u);
  assert.doesNotMatch(queued.text,/queue · 1 pending/u,'no queue line under the composer');
});

test('s05 · Esc interrupts the answer; the queued follow-up comes back to the composer and goes when sent',async()=>{
  /* F-Q1 (owner 03/10, «Tornano nel composer», like Claude Code and Pi): after a stop nothing goes out by itself */
  t.press('esc');
  await t.waitFor('the follow-up back in the composer',x=>idleFooter(x)&&!/1 queued ·/u.test(x.text)&&x.lines.some(line=>line.includes(FOLLOW_UP)),{timeout:30_000});
  assert.equal(s.fake.chatRequests().filter(r=>r.lastUser===FOLLOW_UP).length,0,'not sent after the stop');
  t.press('enter');
  afterInterrupt=await t.waitFor('the follow-up answered',x=>x.lines.some(line=>line.trim()===`› ${FOLLOW_UP}`)&&/^ {2}OK$/mu.test(x.text)&&idleFooter(x),{timeout:30_000});
  assert.equal(s.fake.chatRequests().filter(r=>r.lastUser===FOLLOW_UP).length,1);
});

test('s05 · R3: D-08 an interrupt by the person is not recorded as a failure',()=>{
  const rows=afterInterrupt.lines.filter(line=>/interrott|interrupt/iu.test(line));
  assert.ok(rows.length>0,'the interrupted run is marked on screen');
  assert.equal(rows.filter(line=>/failed/iu.test(line)).length,0,`D-08: the interrupted run is shown as failed: ${rows.join(' / ')}`);
});

test('s05 · D-05 the interrupt notice is in English',()=>{
  assertEnglishOnly(afterInterrupt.text);
});

/* the approved mockup's prompt row: ` › <prompt>` on the band */
const promptRow=(lines:readonly string[],prompt:string)=>lines.map(line=>line.trim()).lastIndexOf(`› ${prompt}`);

test('s05 · HTTP 429 ends the turn as failed after TALOS retried',async()=>{
  after429=await turn(t,s.fake,'ERR429 please');
  assert.ok(s.fake.chatRequests().filter(r=>r.lastUser==='ERR429 please').length>=2,'TALOS retried the rate-limited request');
  assert.match(after429.text,/^ ✗ Failed after \d/mu);/* UI Phase 0: the status row says it; no main roster row at idle */
});

test('s05 · D-06 the rate-limit error says what to do',()=>{
  const tail=after429.lines.slice(promptRow(after429.lines,'ERR429 please')).join('\n');
  assert.match(tail,/retry|try again|wait|\b7 ?s\b/iu,`D-06: the 429 failure gives no next step:\n${tail}`);
});

test('s05 · HTTP 500 ends the turn as failed',async()=>{
  const before=s.fake.chatRequests().length;
  await t.submit('ERR500 please');
  during500=await t.waitFor('the ERR500 turn is running',x=>promptRow(x.lines,'ERR500 please')>=0&&!idleFooter(x)&&s.fake.chatRequests().length>before,{timeout:20_000});
  const end=end500=await t.waitFor('the ERR500 turn ended',x=>promptRow(x.lines,'ERR500 please')>=0&&idleFooter(x),{timeout:60_000});
  assert.match(end.text,/^ ✗ Failed after \d/mu);
});

/* R3 Q-R3-9 (owner 2026-09-24): the `Run · …` row is gone, so it can no longer be drawn above its message; the failed turn
   leaves one notice, below the message it belongs to. */
test('s05 · R3: D-08 no run row, and the failure notice comes after the message it belongs to',()=>{
  assert.ok(!during500.lines.some(line=>/^Run · /u.test(line)),`D-08: a "Run · …" row is still drawn:\n${during500.text}`);
  const prompt=promptRow(end500.lines,'ERR500 please');
  const notice=end500.lines.findLastIndex(line=>/\b500\b|server error|provider/iu.test(line));
  assert.ok(prompt>=0&&notice>prompt,`D-08: the failure notice (row ${notice+1}) is not below the message it belongs to (row ${prompt+1}):\n${end500.text}`);
});
