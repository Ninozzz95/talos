/*
 * Owner 13/10/2026 («Dire in /context cosa è stato alleggerito»): since r4 (C1, level 1) the Context Engine clears old tool
 * outputs with no model call before it ever writes a summary, so the space used drops and nothing said why. `/context` now says
 * how many outputs the last request was sent without, and that the full ones are kept.
 *
 * What the others do, read in the clones: Hermes only logs it ("Pre-compression: pruned %d old tool result(s)",
 * agent/context_compressor.py:5672-5673, clone of 07/10/2026) and leaves "[Old tool output cleared to save context space]" in
 * the history (:856); OpenCode marks each pruned part with the time it was compacted (packages/opencode/src/session/
 * compaction.ts:300-312, clone of 24/09/2026); Pi has no such step. The kernel's own sources are in
 * context-engine/src/tool-output-clearing.mjs (CliffCompaction, Anthropic `clear_tool_uses`, Hermes).
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {buildContextStatus} from '../../src/runtime/context-status.ts';
import {contextInspectorLines} from '../../src/tui/overlays/context-inspector.ts';
import {composeWithFake,runTurn,startScriptedProvider,type ChatRequest} from './r5a-r-fixture.ts';

test.after(()=>resetModelProfiles());
const FILE=(k:number)=>Array.from({length:60},(_,i)=>`light file ${k} line ${String(i+1).padStart(3,'0')} ${'x'.repeat(24)}`).join('\n')+'\n';
const read=(k:number)=>({kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:`c${k}.txt`}]});
const READS=40;

/*
 * Review of 13/10/2026 (bugfixer), finding 3: the last request of this turn is answered 429 once and sent again. The kernel's own
 * record of the last request gives the engine's counts to the FIRST attempt only (session-registry.mjs `registraUltimaRichiesta`
 * consumes them once), so read from there the line vanished after a retry although the body that was answered was the lightened
 * one. The CLI keeps what the engine prepared (talos-composition.ts), and that does not depend on how many times it was sent.
 */
test('/context says how many old tool outputs the last request was sent without, measured through the real engine — also when that request had to be sent twice',{timeout:300_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  for(let k=1;k<=READS;k++)writeFileSync(path.join(h.project,`c${k}.txt`),FILE(k));
  writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:1,models:{'deepseek:deepseek-flash':{contextWindow:65_536}}}));
  let asked=0;let refused=0;
  const fake=await startScriptedProvider({goodKey:key,respond:(request:ChatRequest)=>!(request as any).tools?.length?{kind:'text' as const,text:'{}'}:asked<READS?read(++asked)
    :refused++===0?{kind:'fail' as const,status:429,headers:{'retry-after':'1'}}:{kind:'text' as const,text:'Done: read the files.'}});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId,raw}=await runTurn(context,h,'read the forty files',{timeoutMs:240_000});
    assert.equal(raw.some((e:any)=>e?.type==='RunError'),false,JSON.stringify(raw.filter((e:any)=>e?.type==='RunError')));
    assert.equal(refused,2,`the last request was refused once and sent again: ${refused}`);
    assert.match(JSON.stringify(raw),/Done: read the files\./u);
    const status=await context.runtime.contextStatus(sessionId);
    assert.ok(status.lightened,'the status carries what the last request was sent without');
    assert.ok(status.lightened.cleared>0,JSON.stringify(status.lightened));
    const lines=contextInspectorLines(status,{width:200});
    const line=lines.find(text=>/^Lightened/u.test(text));
    assert.ok(line,`no line in /context: ${lines.join(' | ')}`);
    assert.match(line!,new RegExp(`${status.lightened.cleared} old tool outputs? cleared`,'u'));
    assert.match(line!,/at no cost/u);assert.match(line!,/nothing is lost: the full outputs are still saved/u);
    /* the record is the CLI's own and leaves with the conversation */
    assert.deepEqual(context.registry.contestoAlleggerito(sessionId),status.lightened);
    await context.runtime.deleteSession(sessionId);
    assert.equal(context.registry.contestoAlleggerito(sessionId),null,'a deleted conversation leaves no count behind');
  }finally{await context.runtime.close?.();await fake.close();}
}));

test('/context: the lightened line, its plurals, and nothing when nothing was cleared',()=>{
  const snapshot={revision:2,settings:{auto:true,triggerRatio:0.5},measurement:{revision:2,measuredAt:'2026-10-13T10:00:00.000Z',tokens:{inputTokens:20_000,windowTokens:65_536,responseReserve:8_000,method:'provider',exact:false,requestHash:'h'}}};
  const lineOf=(lightened:unknown)=>contextInspectorLines(buildContextStatus({sessionId:'s',snapshot,sessionUsage:null,lightened}),{width:200}).find(text=>/^Lightened/u.test(text))??null;
  assert.equal(lineOf(null),null);
  assert.equal(lineOf(undefined),null);
  assert.equal(lineOf({cleared:0,shortened:0}),null,'nothing cleared, nothing said');
  assert.equal(lineOf({cleared:1,shortened:0}),'Lightened · 1 old tool output cleared in the last request, at no cost · nothing is lost: the full outputs are still saved');
  assert.equal(lineOf({cleared:16,shortened:2}),'Lightened · 16 old tool outputs cleared and 2 long recent ones shortened in the last request, at no cost · nothing is lost: the full outputs are still saved');
  assert.equal(lineOf({cleared:0,shortened:1}),'Lightened · 1 long recent tool output shortened in the last request, at no cost · nothing is lost: the full outputs are still saved');
  assert.equal(lineOf({cleared:-3,shortened:'x'}),null,'a count that is not a count is not said');
  assert.equal(lineOf({cleared:-3,shortened:5}),null,'nor a negative one');assert.equal(lineOf({cleared:4,shortened:-1}),null);
});
