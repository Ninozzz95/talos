/**
 * s14 — what stays in the terminal after exit (Q-R1-4, gate E10): TALOS leaves the alternate screen, reprints the
 * transcript into the scrollback, then prints `talos --resume <id>`, and that command reopens the same conversation.
 * The resume line is printed only for a non-empty session. The terminal buffer is read after the pty has exited.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertExitTranscript,resumeLineIn} from './checks.ts';
import {exitTalos,stage,toComposer,turn} from './harness.ts';
import type {TerminalSession} from './terminal.ts';

const PROMPT='hello exit transcript';
const s=stage({name:'s14',files:{'README.md':'# demo\n'}});
let t:TerminalSession;let resumeId:string|null=null;let footerId:string|null=null;

test('s14 · an empty session exits without a resume line',async()=>{
  t=s.launch([],{cols:100,rows:30});
  await toComposer(t);
  assert.equal(await exitTalos(t),true,`TALOS is still running\n${t.dump('exit')}`);
  assert.equal(resumeLineIn(t.normalLines()),undefined,'an empty session printed a resume line (Q-R1-4: only for a non-empty session)');
});

test('s14 · a turn answers, then TALOS exits with code 0',async()=>{
  t=s.launch([],{cols:100,rows:30});
  await toComposer(t);
  const screen=await turn(t,s.fake,PROMPT);
  assert.match(screen.text,/^ {2}OK$/mu);
  footerId=screen.text.match(/\bsession ([0-9a-f]{8}-[0-9a-f-]{27})\b/u)?.[1]??null;
  assert.equal(await exitTalos(t),true,`TALOS is still running\n${t.dump('exit')}`);
  assert.equal(t.exit?.code,0);
});

test('s14 · R1-EXIT after exit the scrollback holds the transcript, then "talos --resume <id>"',()=>{
  resumeId=assertExitTranscript(t.normalLines(),{prompt:PROMPT,answer:/^\s*OK\s*$/u});
  if(footerId)assert.equal(resumeId,footerId,`R1-EXIT: the resume line names ${resumeId}, but the session on screen was ${footerId}`);
});

test('s14 · R1-EXIT the printed "talos --resume <id>" reopens that conversation',async()=>{
  assert.ok(resumeId,'R1-EXIT: no resume id was printed at exit, so there is nothing to reopen');
  t=s.launch(['--resume',resumeId],{cols:100,rows:30});
  await t.waitFor(`R1-EXIT: "talos --resume ${resumeId}" shows the earlier answer`,x=>/^ {2}OK$/mu.test(x.text)&&!/BOOT\s+\d+%/u.test(x.text),{timeout:30_000});
  await exitTalos(t);
});
