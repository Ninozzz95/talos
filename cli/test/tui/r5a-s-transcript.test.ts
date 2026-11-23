/*
 * R5a lane S — what lane R's new facts look like on the transcript. The events are built here (common brief: never rely on
 * the other lane's bodies):
 *   S3  context.compacted → a notice naming the engine, what was summarized, tokens before/after; 50 % where the window is
 *       known (Q-R5-4, E9);
 *   S6  tool.output.saved → the row says kept/total and where the full output is (Q-R5-10, E6);
 *   S7  tool.read.cut → `450 of 500 lines · cut at 8,000 characters` (Q-R5-11);
 *   S8  a collapsed reasoning block is one dim "Thought for N s · Ctrl+T shows" line (Q-R5-9);
 *   S10 a denial names what decided; "you did not approve it" only when the person was asked; no Italian (Q-R5-17).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {t} from '../../src/i18n/index.ts';
import {looksItalian} from '../../src/i18n/kernel-map.ts';
import {toolRowView,denialSentence} from '../../src/tui/components/tool-row.ts';
import {thoughtLine,visibleTranscriptItems} from '../../src/tui/components/thinking-row.ts';
import {estimateTranscriptItemRows,textRows} from '../../src/tui/components/transcript-virtualizer.ts';
import {transcriptEventAddsItem} from '../../src/tui/components/transcript.ts';
import {formatExitOutput} from '../../src/tui/exit-output.ts';
import {compactionNoticeText,createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptModel,type TranscriptToolItem} from '../../src/tui/transcript-model.ts';
import type {TuiEvent} from '../../src/tui/event-adapter.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const reduce=(events:TuiEvent[],model:TranscriptModel=createTranscriptModel())=>events.reduce(reduceTranscriptEvent,model);
const tool=(model:TranscriptModel,id='c1')=>model.items.find(item=>item.id===`tool:${id}`) as TranscriptToolItem;

test('S3 Q-R5-4/E9: a compaction is named — engine, what was summarized, tokens before and after; 50 % for the Context Engine',()=>{
  assert.equal(compactionNoticeText({engine:'context-engine',messagesSummarized:12,tokensBefore:66_000,tokensAfter:8_200}),
    'Context compacted by the Context Engine at 50% of the window: 12 earlier messages summarized · 66k → 8.2k tokens · /context');
  assert.equal(compactionNoticeText({engine:'kernel',messagesSummarized:1,tokensBefore:null,tokensAfter:null}),
    /* 0.6.13 (22/10/2026): the desktop adapter's simple compaction, no longer every 8 model calls */
    'Context compacted by the kernel (at 75% of the window, or at context.compactAtTokens when that is lower or the window is unknown; 200,000 tokens by default): 1 earlier message summarized · token counts not reported · /context');
  /* E1: an unknown count is said to be unknown, never 0 */
  const unknown=compactionNoticeText({engine:'kernel',messagesSummarized:null,tokensBefore:9800,tokensAfter:null});
  assert.match(unknown,/earlier messages summarized · 9\.8k tokens before · /u);assert.doesNotMatch(unknown,/\b0\b/u);
  const model=reduce([{type:'context.compacted',engine:'kernel',messagesSummarized:8,tokensBefore:9800,tokensAfter:2100,eventId:'e1'}]);
  assert.equal(model.items.length,1);
  assert.equal(model.items[0]!.kind,'warning');
  assert.match(transcriptItemText(model.items[0]!),/Context compacted by the kernel .*8 earlier messages summarized · 9\.8k → 2\.1k tokens/u);
  /* the notice is new content: the view follows or counts it */
  assert.equal(transcriptEventAddsItem({type:'context.compacted',engine:'kernel',messagesSummarized:null,tokensBefore:null,tokensAfter:null}),true);
  /* replayed twice (same event id), shown once */
  assert.equal(reduce([{type:'context.compacted',engine:'kernel',messagesSummarized:8,tokensBefore:9800,tokensAfter:2100,eventId:'e1'}],model).items.length,1);
});

const BIG=Array.from({length:500},(_,i)=>`big file line ${i+1}`).join('\n');
test('S6 Q-R5-10/E6: a cut command output says how much the row holds and where the whole output is, in both views',()=>{
  const model=reduce([
    {type:'tool.started',toolCallId:'c1',toolName:'shell'},
    {type:'tool.args',toolCallId:'c1',delta:JSON.stringify({comando:'cmd /c type big.txt'})},
    {type:'tool.output.saved',toolCallId:'c1',path:'C:\\data\\outputs\\s1\\c1.txt',keptChars:4000,totalChars:12_345},
    {type:'tool.completed',toolCallId:'c1',content:BIG.slice(-4000)},
    {type:'tool.facts',toolCallId:'c1',facts:{exitCode:0,durationMs:100,isolation:'sandbox'}},
  ]);
  const item=tool(model);
  assert.deepEqual(item.savedOutput,{path:'C:\\data\\outputs\\s1\\c1.txt',keptChars:4000,totalChars:12_345});
  for(const expanded of [false,true]){
    const view=toolRowView(item,120,expanded);
    /* UI Phase 0 D13: the path has a line of its own under the fact */
    assert.deepEqual(view.detailLines.slice(0,2),['kept 4,000 of 12,345 characters · full output:','C:\\data\\outputs\\s1\\c1.txt']);
    /* the height estimate counts the same lines (R3 gate E1) */
    assert.equal(estimateTranscriptItemRows(item,120,{expandedTools:expanded}),textRows(view.line,120)+view.detailLines.reduce((sum,line)=>sum+textRows(line,120),0));
  }
  /* the facts may arrive before the row (they wait, never a phantom row) */
  const early=reduce([{type:'tool.output.saved',toolCallId:'c2',path:'p.txt',keptChars:1,totalChars:2},{type:'tool.started',toolCallId:'c2',toolName:'shell'}]);
  assert.equal(early.items.length,1);assert.deepEqual(tool(early,'c2').savedOutput,{path:'p.txt',keptChars:1,totalChars:2});
  /* a malformed event is dropped, not drawn as zeros */
  assert.equal(tool(reduce([{type:'tool.started',toolCallId:'c3',toolName:'shell'},{type:'tool.output.saved',toolCallId:'c3',path:'',keptChars:-1,totalChars:NaN} as any]),'c3').savedOutput,undefined);
});

test('S7 Q-R5-11: a cut read says `450 of 500 lines · cut at 8,000 characters`, fitted to the row at 60 and 120 columns',()=>{
  const shown=BIG.slice(0,8000);
  const model=reduce([
    {type:'tool.started',toolCallId:'r1',toolName:'leggi'},
    {type:'tool.args',toolCallId:'r1',delta:JSON.stringify({percorso:'big.txt'})},
    {type:'tool.completed',toolCallId:'r1',content:shown},
    {type:'tool.read.cut',toolCallId:'r1',shownLines:450,totalLines:500,limitChars:8000},
  ]);
  const item=tool(model,'r1');
  assert.equal(toolRowView(item,120,false).line,'Read file big.txt · 450 of 500 lines · cut at 8,000 characters');
  /* 60 columns and a long path: the path keeps a readable width and the cut moves under the row */
  const narrow=toolRowView({...item,argsText:JSON.stringify({percorso:'a/very/deep/folder/structure/with/a/long/name/big.txt'})},60,false);
  assert.ok(displayWidth(narrow.line)<=60,narrow.line);assert.match(narrow.line,/^Read file a\/very.*….*big\.txt · 450 of 500 lines$/u,narrow.line);
  assert.equal(narrow.detailLines[0],'cut at 8,000 characters');
  /* the whole form is 62 columns: at 60 even a short path keeps its name and the cut is the first detail line */
  assert.equal(toolRowView(item,60,false).line,'Read file big.txt · 450 of 500 lines');
  assert.equal(toolRowView(item,60,false).detailLines[0],'cut at 8,000 characters');
  assert.equal(toolRowView(item,62,false).line,'Read file big.txt · 450 of 500 lines · cut at 8,000 characters');
  assert.equal(toolRowView({...item,readCut:{shownLines:450,totalLines:null,limitChars:8000}},120,false).line,'Read file big.txt · 450 lines · cut at 8,000 characters');
  /* without the cut the row is as R3 left it (451 = 450 whole lines + the partial one the cut made) */
  assert.equal(toolRowView({...item,readCut:null},120,false).line,'Read file big.txt · 451 lines');
  /* search/copy and the exit transcript read the same row */
  assert.match(transcriptItemText(item),/^Read file big\.txt · 450 of 500 lines · cut at 8,000 characters/u);
  const exit=formatExitOutput({sessionId:'s1',items:[{kind:'message',id:'m',role:'user',text:'read it',streaming:false},item]});
  assert.match(exit,/Read file big\.txt · 450 of 500 lines · cut at 8,000 characters/u);
});

test('S10 Q-R5-17: a denial names what decided; "you did not approve it" only for the person; no Italian on either view',()=>{
  assert.equal(denialSentence({by:'rule',rule:'Bash(rm:*)',scope:'project'}),'Not run: denied by rule Bash(rm:*) (project).');
  assert.equal(denialSentence({by:'rule',rule:'Bash(rm:*)'}),'Not run: denied by rule Bash(rm:*).');
  assert.equal(denialSentence({by:'policy',reason:'unsupported shell composition'}),'Not run: denied by policy: unsupported shell composition.');
  assert.equal(denialSentence({by:'policy',reason:"l'owner non ha approvato questa azione"}),'Not run: denied by policy.');
  assert.equal(denialSentence({by:'mode',reason:'plan mode permits only read-only operations'}),'Not run: denied by the permission mode: plan mode permits only read-only operations.');
  assert.equal(denialSentence({by:'person'}),t('error.refused.notApproved'));
  /* gate finding 15, reproduced: the policy denied a command, the kernel recorded the person's "no" in Italian */
  const outcome={toolCallId:'d1',status:'failed' as const,content:'REFUSED. l\'owner non ha approvato',receiptStatus:'denied',exitCode:null,enforcement:null,allowed:false,permissionVia:'livello-su-richiesta',permissionReason:"l'owner non ha approvato questa azione",risk:null};
  const events:TuiEvent[]=[
    {type:'tool.started',toolCallId:'d1',toolName:'shell'},
    {type:'tool.args',toolCallId:'d1',delta:JSON.stringify({comando:'cmd /c for /L %i in (1,1,400) do @echo line %i'})},
    {type:'tool.completed',toolCallId:'d1',content:outcome.content,outcome},
  ];
  const policy=tool(reduce([...events,{type:'tool.facts',toolCallId:'d1',facts:{denial:{by:'policy',reason:'unsupported shell composition'}}}]),'d1');
  for(const expanded of [false,true]){
    const view=toolRowView(policy,120,expanded);
    assert.match(view.line,/ · denied$/u);
    assert.equal(view.detailLines[0],'Not run: denied by policy: unsupported shell composition.');
    const text=[view.line,...view.detailLines].join('\n');
    assert.doesNotMatch(text,/did not approve/u);
    assert.equal(looksItalian(text),false,text);assert.doesNotMatch(text,/livello|owner non/u,text);
  }
  /* before lane R names the decider: nobody asked the person, so the row does not say they refused */
  const unnamed=toolRowView(tool(reduce(events),'d1'),120,true);
  assert.equal(unnamed.detailLines[0],t('error.refused.generic'));
  assert.doesNotMatch([unnamed.line,...unnamed.detailLines].join('\n'),/did not approve|livello|owner non/u);
  /* the person WAS asked and said no: then, and only then, "you did not approve it" */
  const asked=reduce([
    {type:'tool.started',toolCallId:'p1',toolName:'scrivi'},
    {type:'tool.args',toolCallId:'p1',delta:JSON.stringify({percorso:'notes.txt'})},
    {type:'approval.required',requestId:'q1',payload:{tipo:'scrivi'},toolCallId:'p1'},
    {type:'approval.resolved',requestId:'q1',approved:false},
  ]);
  assert.equal(tool(asked,'p1').askedPerson,true);
  assert.equal(toolRowView(tool(asked,'p1'),120,false).detailLines[0],t('error.refused.notApproved'));
});

test('S8 Q-R5-9: a collapsed reasoning block is one dim line with its live duration; replayed or open blocks say no number',()=>{
  const realNow=Date.now;let clock=1_000_000;Date.now=()=>clock;
  try{
    let model=reduce([{type:'run.started',sessionId:'s1',runId:'r1'},{type:'reasoning.started',messageId:'m1'},{type:'reasoning.delta',messageId:'m1',delta:'hmm'}]);
    clock+=2800;model=reduce([{type:'reasoning.end',messageId:'m1'}],model);
    const block=model.items.find(item=>item.kind==='reasoning')!;
    assert.equal(block.kind==='reasoning'&&thoughtLine(block),'Thought for 2s'/* the mockup's clock */);
    /* the estimate is that one line when collapsed, the box when shown */
    assert.equal(estimateTranscriptItemRows(block,60,{reasoningVisible:false}),1);
    assert.equal(estimateTranscriptItemRows(block,60,{reasoningVisible:true}),2)/* the mockup's open block: its row, then the text under `    │ ` */;
    /* an ended block is drawn while collapsed (its one line), not hidden with no trace (gate finding 9) */
    assert.equal(visibleTranscriptItems(model.items,false).some(item=>item.kind==='reasoning'),true);
    /* UI Phase 1 (owner 27/09): a block still streaming is its one-line live preview while collapsed; with reduced
       motion it is not drawn (the status row says "thinking"); shown, it is */
    const open=reduce([{type:'run.started',sessionId:'s1',runId:'r2'},{type:'reasoning.started',messageId:'m2'}]);
    assert.equal(visibleTranscriptItems(open.items,false).some(item=>item.kind==='reasoning'),true);
    assert.equal(visibleTranscriptItems(open.items,false,{livePreview:false}).some(item=>item.kind==='reasoning'),false);
    assert.equal(visibleTranscriptItems(open.items,true).some(item=>item.kind==='reasoning'),true);
    /* a turn that ends without a reasoning end closes the block with its time */
    clock+=1000;const closed=reduce([{type:'run.completed',runId:'r2'}],open);
    const ended=closed.items.find(item=>item.kind==='reasoning');
    assert.equal(ended?.kind==='reasoning'&&ended.streaming,false);
    assert.equal(ended?.kind==='reasoning'&&thoughtLine(ended),'Thought for 1s');
    /* a replayed block has no live duration (R3 SP: a replay's clock is not a duration) */
    const replay=reduce([{type:'run.started',sessionId:'s1',runId:'h1',history:true},{type:'reasoning.started',messageId:'m3'},{type:'reasoning.end',messageId:'m3'},{type:'run.completed',runId:'h1'}]);
    const old=replay.items.find(item=>item.kind==='reasoning');
    assert.equal(old?.kind==='reasoning'&&thoughtLine(old),'Thought');
  }finally{Date.now=realNow;}
});
