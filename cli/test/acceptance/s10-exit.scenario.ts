/**
 * s10 — Ctrl+C at idle and what stays in the terminal after exit (review §B s10; D-12).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stage,toComposer,turn} from './harness.ts';
import type {TerminalSession} from './terminal.ts';

const s=stage({name:'s10',files:{'README.md':'# demo\n'}});
let t:TerminalSession;

test('s10 · a turn answers through the fake provider',async()=>{
  t=s.launch([],{cols:100,rows:30});
  await toComposer(t);
  const screen=await turn(t,s.fake,'hello');
  assert.match(screen.text,/^ {2}OK$/mu);
});

test('s10 · D-12 one Ctrl+C at idle does not exit (the keymap says Ctrl+C Ctrl+C)',async()=>{
  t.press('ctrl+c');
  const exited=await t.waitForExit(1_500);
  assert.equal(exited,false,`D-12: a single Ctrl+C at idle closed TALOS after ${t.exit?.at} ms`);
});

test('s10 · Ctrl+C twice exits with code 0',async()=>{
  if(!t.exit)t.press('ctrl+c');
  assert.equal(await t.waitForExit(10_000),true,`TALOS is still running after two Ctrl+C\n${t.dump('exit')}`);
  assert.equal(t.exit?.code,0);
});

test('s10 · D-12 after exit the terminal keeps the conversation or a resume line',async()=>{
  await t.settled();
  const left=`${t.scrollback()}\n${t.screen().text}`;
  assert.match(left,/resume|hello/iu,'D-12: nothing is left in the terminal after exit (no transcript, no resume line)');
});
