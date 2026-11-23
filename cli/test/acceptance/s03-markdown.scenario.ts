/**
 * s03 — a Markdown answer: what renders, what disappears (review §B s03; D-04, D-13).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stage,toComposer,turn} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const PROMPT='MD please summarize this project';
const s=stage({name:'s03',files:{'README.md':'# demo\n','src/index.js':"console.log('hi')\n"}});
let t:TerminalSession;let answer:Screen;

test('s03 · a Markdown answer renders its heading, list and table',async()=>{
  t=s.launch([],{cols:100,rows:30});
  await toComposer(t);
  answer=await turn(t,s.fake,PROMPT);
  assert.match(answer.text,/Summary of the project/u);
  assert.match(answer.text,/• README\.md — the project description/u);
  assert.match(answer.text,/│ src\/index\.js │\s+1 │ entry\s+│/u);/* UI Phase 0 D10: boxed on a Unicode terminal */
});

test('s03 · D-04 the person\'s own message stays visible (or is announced) after the answer',()=>{
  assert.ok(answer.text.includes(PROMPT)||/earlier message|messages? above/iu.test(answer.text),'D-04: the prompt the person sent is neither on screen nor announced');
});

test('s03 · R3: D-13 the table separator does not leak the alignment colon',()=>{
  /* UI Phase 0 D10: the boxed table's separator is ├──┼──┤ */
  const separators=answer.lines.filter(line=>/^├[─┼:]+┤$/u.test(line.trim())/* the answer is drawn under a two-cell indent */);
  assert.ok(separators.length>0,'the table has a separator row');
  assert.equal(separators.filter(line=>line.includes(':')).length,0,`D-13: the Markdown alignment colon is printed: ${separators.join(' / ')}`);
});
