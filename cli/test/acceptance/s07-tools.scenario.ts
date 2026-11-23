/**
 * s07 — a three-tool turn: read, shell (approval), write (review §B s07; D-01, D-05, D-07, D-08, E-07).
 */
import assert from 'node:assert/strict';
import {existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {approvalVisible,assertEnglishOnly,idleFooter} from './checks.ts';
import {answerApproval,stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

/* The marker file exists only so that the shell command's own output can be recognised on screen: nothing else prints it. */
const MARKER='dir-marker-7f3a.txt';
const s=stage({name:'s07',files:{'README.md':'# demo\n','src/index.js':"console.log(1)\n",[MARKER]:'marker\n'}});
let t:TerminalSession;let approval:Screen;let end:Screen;let fullEnd:Screen;let wroteBeforeAsking=false;

test('s07 · the shell command asks for approval (the read ran without asking)',async()=>{
  t=s.launch([],{cols:110,rows:36});
  await toComposer(t);
  await t.submit('TOOLS inspect the repo and write notes');
  approval=await t.waitFor('the approval question for the shell command',x=>approvalVisible(x)&&x.text.includes('cmd /c dir /b'),{timeout:30_000});
  assert.equal(existsSync(join(s.profile.project,'notes.txt')),false);
});

test('s07 · R3: D-08 while TALOS waits for the person the status says so, not "thinking"',()=>{
  assert.doesNotMatch(approval.text,/^ \S Thinking\b/mu,'D-08: the status says "thinking" while TALOS waits for the person');
});

test('s07 · D-07 tool rows show no raw JSON arguments',()=>{
  assert.doesNotMatch(approval.text,/args \{"/u,'D-07: a tool row prints its raw JSON arguments');
});

test('s07 · approving once lets the turn finish',async()=>{
  const notes=join(s.profile.project,'notes.txt');
  await answerApproval(t,'1');
  /* After the shell answer, the next thing is either a question about the write or the write itself. */
  const next=await t.waitFor('the write is asked about, happens, or the turn ends',x=>(approvalVisible(x)&&x.text.includes('notes.txt')&&!x.text.includes('Shell · cmd /c dir /b') /* R2 Q-R2-3: the shell tool is shown as Shell */)||existsSync(notes)||idleFooter(x),{timeout:30_000});
  wroteBeforeAsking=existsSync(notes)&&!(approvalVisible(next)&&next.text.includes('notes.txt'));
  if(approvalVisible(t.screen())&&t.screen().text.includes('notes.txt'))await answerApproval(t,'1');
  end=await t.waitFor('the turn ended',x=>idleFooter(x)&&/Done: used 3 tools/u.test(x.text),{timeout:30_000});
  /* the approved mockup folds the finished calls into groups; the full transcript (Ctrl+O) shows the command's output */
  t.press('ctrl+o');
  const full=await t.waitFor('the full transcript',x=>/^ Transcript · /mu.test(x.text),{timeout:10_000});
  t.press('ctrl+o');
  await t.waitFor('back to the prompt',x=>!/^ Transcript · /mu.test(x.text)&&idleFooter(x),{timeout:10_000});
  fullEnd=full;
  if(process.env.TALOS_S07_FULL)writeFileSync(process.env.TALOS_S07_FULL,full.text);
  assert.equal(s.fake.chatRequests().filter(r=>r.lastUser?.startsWith('TOOLS')).length,4,'three tool calls and a final answer');
});

test('s07 · E-07 the default mode asks before the model writes a file',()=>{
  assert.equal(wroteBeforeAsking,false,'E-07: notes.txt was written in the default mode without asking the person');
});

/* D-01 was a declared red owned by R0-S; lane S made commands run (MXC or declared host), so it is a plain test now. */
test('s07 · D-01 the approved shell command runs and its output is shown',()=>{
  assert.ok(fullEnd.text.includes(MARKER)&&!fullEnd.text.includes('SANDBOX_REQUIRED_UNAVAILABLE'),`D-01: the approved command did not run:\n${end.lines.filter(l=>/shell|error|SANDBOX/u.test(l)).join('\n')}`);
});

test('s07 · D-05 tool names and arguments are in English',()=>{
  assertEnglishOnly(end.text);
});
