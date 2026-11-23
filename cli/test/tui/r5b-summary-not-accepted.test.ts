/*
 * R5a open item 2 (the screen line, assigned to R5b; done 2026-09-25): a Context Engine summary that is requested but never
 * accepted was silent, and the engine asked again at every step of the turn (5 extra requests in one s22 turn, each billed;
 * the fix of the cause is the desktop lane's, ticket docs/talos-cli/2026-09-25-ticket-desktop-ce-summary-retries.md). The
 * CLI now counts the summary requests of a turn; a turn that requested summaries and committed none ends with one dim
 * line saying how many were requested and that each is billed. A turn whose compaction was accepted says nothing new.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';

const run=(events:any[])=>events.reduce((model,event)=>reduceTranscriptEvent(model,event),createTranscriptModel());
const warnings=(model:any)=>model.items.filter((item:any)=>item.kind==='warning').map((item:any)=>item.text);

test('R5b: summaries requested and none accepted leave one line with the count, once per turn',()=>{
  const model=run([
    {type:'run.started',runId:'r1',prompt:'read the files'},
    {type:'context.summary.requested'},{type:'context.summary.requested'},{type:'context.summary.requested'},
    {type:'run.completed',runId:'r1'},
  ]);
  const lines=warnings(model).filter((text:string)=>/summary/u.test(text));
  assert.equal(lines.length,1,warnings(model).join('\n'));
  assert.match(lines[0],/requested 3 times this turn and none was accepted/u);
  assert.match(lines[0],/each request is billed/u);
});

test('R5b: an accepted compaction in the turn says nothing more; a single request is worded in the singular',()=>{
  const accepted=run([
    {type:'run.started',runId:'r1',prompt:'x'},
    {type:'context.summary.requested'},
    {type:'context.compacted',engine:'context-engine',messagesSummarized:null,tokensBefore:null,tokensAfter:null},
    {type:'run.completed',runId:'r1'},
  ]);
  assert.equal(warnings(accepted).filter((text:string)=>/context summary was requested/u.test(text)).length,0,'an accepted compaction leaves no "not accepted" line');
  const one=run([{type:'run.started',runId:'r2',prompt:'y'},{type:'context.summary.requested'},{type:'run.failed',runId:'r2',message:'x',error:{code:'CTX_CONTEXT_OVERFLOW',message:'x'}}]);
  assert.ok(warnings(one).some((text:string)=>/requested once this turn and it was not accepted/u.test(text)),warnings(one).join('\n'));
});
