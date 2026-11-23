/**
 * Stage 6c (owner 01/10 «tutto cliccabile», decisions 02/10; the approved mockup's `click(verb:arg)`), on the BUILT CLI
 * through ConPTY: a click on a clickable segment (press and release on it, owner 02/10) runs its verb — the pill opens the agents panel (`agents`), a row of the agents card the
 * page on that agent (`agentpage:id`), a tab filters (`atab:n`), a choice answers the agent's question (`areply:n`). The targets
 * come from where the rows were laid out (Ink's measureElement), as the press reports them (SGR, 1-based).
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {MODE_ROW,approvalVisible,composerReady,idleFooter,modeOf} from './checks.ts';
import {APPROVAL_ANSWER_DELAY_MS,exitTalos,stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s48',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const ESC='\u001b';
let t:TerminalSession;
const onPage=(x:Screen)=>/^ Agents · this session/mu.test(x.text);
function click(text:string,offset=1){
  const lines=t.screen().lines;const row=lines.findIndex(line=>line.includes(text));
  assert.ok(row>=0,`"${text}" is not on screen:\n${t.screen().text}`);
  const col=lines[row]!.indexOf(text)+offset;
  t.send(`${ESC}[<0;${col+1};${row+1}M${ESC}[<0;${col+1};${row+1}m`);
}
const childRequests=(keyword:string)=>s.fake.chatRequests().filter((r:any)=>String(r.lastUser??'').includes(`${keyword} child work`));

test('s48 · the pill opens the panel, a row of the agents card the page on that agent, a tab filters',async()=>{
  t=s.launch([],{cols:120,rows:36});
  try{
  await toComposer(t);
  await t.submit('DELEGATE:LONG one sub-task');
  /* The click lands where the screen showed the pill: wait for the turn to end first, or the frame that ends it (the agents
     roster under the shortcut row) moves the pill between the screen read and the press (probe 02/10: read at row 33,
     laid out at 31 by then). */
  await t.waitFor('the pill',x=>/← 1 agent /u.test(x.text)&&/✓ Done in/u.test(x.text),{timeout:30_000});
  click('← 1 agent');
  await t.waitFor('the panel',x=>/▾ Agents\s/u.test(x.text)&&/LONG child work/u.test(x.text),{timeout:5_000});
  click('LONG child work',2);
  await t.waitFor('the page on the agent',x=>onPage(x)&&/LONG child work/u.test(x.text),{timeout:5_000});
  /* The screen's rows lose their trailing spaces: the last tab is found by its text alone. */
  click('Finished 0');
  await t.waitFor('the Finished tab',x=>onPage(x)&&/No agents here\./u.test(x.text),{timeout:5_000});
  click('All 1');
  await t.waitFor('the All tab',x=>onPage(x)&&!/No agents here\./u.test(x.text),{timeout:5_000});
  t.press('ctrl+a');
  await t.waitFor('closed',x=>!onPage(x),{timeout:5_000});
  }finally{await t.close();}
});

test('s48 · a click on a choice answers the agent that asks',async()=>{
  t=s.launch([],{cols:120,rows:36});
  try{
  await toComposer(t);
  await t.submit('DELEGATE:ASKONE one sub-task');
  await t.waitFor('needs you',x=>/needs you/u.test(x.text),{timeout:30_000});
  t.press('ctrl+a');await t.waitFor('panel',x=>/▾ Agents\s/u.test(x.text),{timeout:5_000});
  t.press('ctrl+a');await t.waitFor('page',x=>onPage(x)&&/ 2\. Stripe test sandbox/u.test(x.text),{timeout:5_000});
  /* Owner 02/10 «Al rilascio»: a drag that starts on the choice selects and copies it, and does not answer (OpenCode #24986). */
  {const lines=t.screen().lines;const row=lines.findIndex(line=>line.includes('Stripe test sandbox'));const col=lines[row]!.indexOf('Stripe test sandbox');
   t.send(`${ESC}[<0;${col+1};${row+1}M${ESC}[<32;${col+7};${row+1}M${ESC}[<0;${col+7};${row+1}m`);}
  await t.waitFor('copied, not sent',x=>/Copied/u.test(x.text),{timeout:5_000});
  assert.doesNotMatch(t.screen().text,/Answer sent to the agent/u);
  click('Stripe test sandbox');
  await t.waitFor('sent',x=>/Answer sent to the agent/u.test(x.text),{timeout:10_000});
  await t.waitFor('the child got the choice',()=>childRequests('ASKONE').some((r:any)=>(r.toolTexts??[]).some((x:any)=>/answered/u.test(x.text)&&/Stripe test sandbox/u.test(x.text))),{timeout:20_000});
  /* The agent's report starts a turn of its own: Ctrl+C during it stops the turn instead of arming the exit. The page covers
     the conversation, so it is closed first (page → panel → closed). */
  t.press('esc');await t.waitFor('page closed',x=>!onPage(x),{timeout:5_000});
  t.press('esc');
  await t.waitFor('the report answered',x=>/Done: the agent reported back\./u.test(x.text)&&/✓ Done in/u.test(x.text),{timeout:20_000});
  /* Probe 02/10: a Ctrl+C at the very frame of «✓ Done» still found the turn closing and stopped it, so the exit was not
     armed; once the screen is still, Ctrl+C Ctrl+C exits (also with the panel open, answered by click or by key). */
  await t.quiet(500);
  assert.ok(await exitTalos(t));
  }finally{if(!t.exit)await t.close();}
});

/* Stage 6c, the cards (mockup `click`: opt, qtab, send; papprove): the same steps as their keys, once the 300 ms grace is
   over (s40/s41). Fake provider scripts ASKME and PLANME. */
const GRACE_MS=450;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const idle=(x:Screen)=>MODE_ROW.test(x.text)&&!/esc to stop/u.test(x.text);

test('s48 · the question card answered with the mouse alone',async()=>{
  t=s.launch([],{cols:120,rows:40});
  try{
  await toComposer(t);
  await t.submit('ASKME how should the test wait');
  await t.waitFor('the card',x=>x.text.includes('TALOS asks · 1 of 3'),{timeout:30_000});
  await pause(GRACE_MS);
  click('Shorten the retry');
  await t.waitFor('the second question',x=>x.text.includes('Which checks should TALOS run after the fix?'),{timeout:5_000});
  click('All auth unit tests');
  await t.waitFor('toggled',x=>x.text.includes('2. [x] All auth unit tests'),{timeout:5_000});
  click('Commit');
  await t.waitFor('the third question by its tab',x=>x.text.includes('Commit the change when the checks pass?'),{timeout:5_000});
  click('Commit locally');
  await t.waitFor('the review',x=>x.text.includes('Ready to send your answers?'),{timeout:5_000});
  click('Send answers');
  /* idle too: closed while the turn was still being written, the next launch opened on «The last TALOS closed in the middle
     of …» and its first Shift+Tab raced that recovery (gate 705956ee3, 1 run in 3 alone). */
  const done=await t.waitFor('the turn ended with the answers',x=>x.text.includes('Done: answered.')&&!x.text.includes('TALOS asks')&&idle(x),{timeout:30_000});
  assert.ok(done.text.includes('Fix  Shorten the retry'),done.text);
  const told=s.fake.chatRequests().at(-1)?.toolTexts?.map((x:any)=>x.text).join('\n')??'';
  assert.match(told,/Shorten the retry/u);assert.match(told,/Commit locally/u);
  }finally{await t.close();}
});

test('s48 · «Approve and start» on the plan card approves it',async()=>{
  t=s.launch([],{cols:120,rows:40});
  try{
  await toComposer(t);
  for(let i=0;i<6&&!/^ plan mode\b/mu.test(t.screen().text);i++){const before=modeOf(t.screen());t.press('shift+tab');await t.waitFor('the mode changed',x=>modeOf(x)!==before,{timeout:5_000});}
  await t.submit('PLANME move image export to a worker thread');
  await t.waitFor('the plan card',x=>x.text.includes('Plan mode · TALOS proposes'),{timeout:30_000});
  await pause(GRACE_MS);
  click('Approve and start');
  /* The fake model's last words depend on whether the continuation still offers present_plan, which races the mode switch
     (probe 02/10: «Done: no plan tool.» after a click, «Done: planned.» in s41): the approval is read from the screen. */
  const done=await t.waitFor('approved',x=>/^ {2}Done: /mu.test(x.text)&&!x.text.includes('Plan mode · TALOS proposes')&&idle(x)&&!/^ plan mode\b/mu.test(x.text),{timeout:30_000});
  assert.ok(done.text.includes('▣ Plan proposed · 4 steps'),done.text);
  assert.doesNotMatch(done.text,/^ plan mode\b/mu,'the approval leaves plan mode');
  }finally{await t.close();}
});

/* Stage 6c, the approval (mockup `aopt:i`; Claude Code: a click on an option of a permission prompt chooses it). Fake
   provider script TOOLS (s07): a shell command, then a write. */
test('s48 · a click on «Allow once» runs the command; a click on «Deny» refuses the write',async()=>{
  t=s.launch([],{cols:110,rows:36});
  try{
  await toComposer(t);
  await t.submit('TOOLS inspect the repo and write notes');
  await t.waitFor('the shell approval',x=>approvalVisible(x)&&x.text.includes('cmd /c dir /b'),{timeout:30_000});
  await pause(APPROVAL_ANSWER_DELAY_MS);
  click('Allow once');
  const next=await t.waitFor('the shell ran: the write is asked about or the turn ends',x=>(approvalVisible(x)&&x.text.includes('notes.txt')&&!x.text.includes('Shell · cmd /c dir /b'))||idleFooter(x),{timeout:30_000});
  assert.ok(s.fake.chatRequests().filter((r:any)=>r.lastUser?.startsWith('TOOLS')).length>=2,'the model heard back from the approved command');
  if(approvalVisible(next)){
    await pause(APPROVAL_ANSWER_DELAY_MS);
    click('Deny');
    await t.waitFor('the turn ended',x=>idleFooter(x),{timeout:30_000});
    assert.equal(existsSync(join(s.profile.project,'notes.txt')),false,'the denied write did not happen');
  }
  }finally{await t.close();}
});

/* Stage 6c, the row above the view (mockup `jumpprompt`; Claude Code fullscreen: a click on it jumps to that prompt). A long
   answer in a short terminal pushes the prompt above the view; a click on «You: …» brings it back into view. */
test('s48 · a click on «You: …» above the view brings the prompt back',async()=>{
  t=s.launch([],{cols:100,rows:16});
  try{
  await toComposer(t);
  await t.submit('MD summarize the readme');
  await t.waitFor('the prompt is named above the view',x=>/You: MD summarize the readme/u.test(x.text)&&idle(x),{timeout:30_000});
  click('You: MD summarize',6);
  /* g-q23: the prompt comes back into view and is selected; the row above may still name it when its header is the first row
     shown (an off-by-one of the R1 announcement, left to stage 8 — registro 12), so only the prompt itself is asserted. */
  await t.waitFor('the prompt in view',x=>x.lines.some(line=>line.trim()==='› MD summarize the readme'),{timeout:5_000});
  }finally{await t.close();}
});

/* Stage 6c, the transcript (mockup `toggle:id`; Claude Code fullscreen: a click expands a collapsed result, a second click
   collapses it). A group of exploring calls opens on its line and lists its calls; a thought opens on its row and closes on
   its title. Fake provider scripts SEARCH (a search and a list) and MD (reasoning, then markdown). */
test('s48 · a click opens a group of calls and a thought, and a second click closes them',async()=>{
  t=s.launch([],{cols:110,rows:40});
  try{
  await toComposer(t);
  await t.submit('SEARCH the code');
  await t.waitFor('the group',x=>/● searched 1 pattern, listed 1 folder · ctrl\+o/u.test(x.text)&&x.text.includes('Done: searched.')&&idle(x),{timeout:30_000});
  click('searched 1 pattern',3);
  await t.waitFor('the calls under it',x=>/^ {4}├ /mu.test(x.text)&&/^ {4}└ /mu.test(x.text),{timeout:5_000});
  click('searched 1 pattern',3);
  await t.waitFor('closed again',x=>!/^ {4}└ /mu.test(x.text)&&/● searched 1 pattern, listed 1 folder · ctrl\+o/u.test(x.text),{timeout:5_000});
  await t.submit('MD summarize the readme');
  await t.waitFor('the thought row',x=>/Thought for/u.test(x.text)&&idle(x),{timeout:30_000});
  click('Thought for',2);
  await t.waitFor('the reasoning open',x=>/Looking at the files\. Composing a summary\./u.test(x.text),{timeout:5_000});
  click('Thought for',2);
  await t.waitFor('the reasoning closed',x=>!/Looking at the files\. Composing a summary\./u.test(x.text)&&/Thought for/u.test(x.text),{timeout:5_000});
  }finally{await t.close();}
});

/* Stage 6c, the menus (mockup `slash:/name`, `exit:i`; Claude Code: a click on a `/` suggestion accepts it, a click on an
   option chooses it). */
test('s48 · a click on /theme in the `/` list opens it; a click on «Stay» keeps TALOS open with its agent',async()=>{
  t=s.launch([],{cols:110,rows:36});
  try{
  await toComposer(t);
  t.send('/the');
  await t.waitFor('the `/` list',x=>x.text.includes('/theme · '),{timeout:5_000});
  click('/theme · ',2);
  /* stage 7.18: /theme is the mockup's page; closed means the page left and the composer is back */
  await t.waitFor('the theme page',x=>/^ Theme · ↑\/↓ preview live/mu.test(x.text),{timeout:5_000});
  t.press('esc');
  await t.waitFor('closed',x=>!/preview live/u.test(x.text)&&composerReady(x),{timeout:5_000});
  await t.submit('DELEGATE:LONG one sub-task');
  await t.waitFor('working',x=>/← 1 agent /u.test(x.text)&&/✓ Done in/u.test(x.text),{timeout:30_000});
  /* the question about working agents comes with /exit (s39); Ctrl+C Ctrl+C is the forced exit */
  await t.submit('/exit');
  await t.waitFor('the exit prompt',x=>x.text.includes('1 agent is still working')&&x.text.includes('Stay'),{timeout:5_000});
  click('Stay');
  await t.waitFor('stayed',x=>!x.text.includes('1 agent is still working')&&/← 1 agent/u.test(x.text),{timeout:5_000});
  assert.equal(t.exit,null,'TALOS is still open');
  }finally{await t.close();}
});

/* Stage 6c: the `@` list (Claude Code: a click on a suggestion accepts it) and the way back from an agent's view (mockup
   `unwatch`). */
test('s48 · a click on a path of the `@` list inserts it; a click on the way back leaves the agent view',async()=>{
  t=s.launch([],{cols:110,rows:36});
  try{
  await toComposer(t);
  t.send('look at @READ');
  await t.waitFor('the `@` list',x=>x.lines.some(line=>/› @README\.md/u.test(line)),{timeout:10_000});
  click('README.md',2);
  await t.waitFor('inserted',x=>/look at @?README\.md /u.test(x.text)&&!x.lines.some(line=>/› @README\.md/u.test(line)),{timeout:5_000});
  t.press('ctrl+u');
  await t.submit('DELEGATE:LONG one sub-task');
  await t.waitFor('working',x=>/← 1 agent /u.test(x.text)&&/✓ Done in/u.test(x.text),{timeout:30_000});
  t.press('ctrl+a');await t.waitFor('panel',x=>/▾ Agents\s/u.test(x.text),{timeout:5_000});
  t.press('ctrl+a');await t.waitFor('page',x=>onPage(x),{timeout:5_000});
  t.press('enter');
  await t.waitFor('the agent view',x=>/◂ Watching agent: LONG child work/u.test(x.text),{timeout:10_000});
  click('← back',2);
  await t.waitFor('back to main',x=>!/◂ (?:Watching agent|Agent finished): /u.test(x.text),{timeout:5_000});
  }finally{await t.close();}
});

test.after(async()=>{await sink.close();});
