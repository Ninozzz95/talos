/*
 * 0.6.13, D5 of the compaction inventory (owner 21/10/2026): /compact said «Context is already compact.» for ANY `compattato:false`,
 * so a summary that failed read as a success. «Already compact» is said ONLY when there was nothing to compact: the Context Engine's
 * CTX_NOTHING_TO_COMPACT (context-engine/src/engine.mjs) or the kernel's `motivo:'niente-da-compattare'` (talosHarness.mjs
 * `compattaConversazione`). Every other `false` is a failure, said plainly with its reason and its code, and nothing replaced
 * (opencode says a compaction that did not happen as an error on the session, `packages/core/src/session/compaction.ts:638-646`;
 * pi says «Compaction failed: …», `modes/interactive/interactive-mode.ts:3700-3737`). The registry's kernel path still returns
 * `{ok:true, compattato:false, fase:'riassunto'}` with no reason (session-registry.mjs, end of `compatta`): it is a failure whose
 * reason is unknown, and it is never «already compact».
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {compactNothingToDo,compactResultView,runControllerSlashAction} from '../../src/tui/app.ts';
import {describeError} from '../../src/i18n/error-view.ts';

const run=(result:unknown)=>runControllerSlashAction('compact',{compact:async()=>result} as any);

test('nothing to compact is the only "already compact"',async()=>{
  assert.equal(await run({ok:true,compattato:false,jobId:'j1',error:{code:'CTX_NOTHING_TO_COMPACT',message:'nothing'}}),'Context is already compact.');
  assert.equal(await run({ok:true,compattato:false,motivo:'niente-da-compattare'}),'Context is already compact.');
  assert.equal(compactResultView({compattato:false,motivo:'niente-da-compattare'}).kind,'already');
});

test('a Context Engine job that did not commit is a failure with its code, not "already compact"',async()=>{
  const text=await run({ok:true,compattato:false,jobId:'j1',error:{code:'CTX_EMPTY_SUMMARY',message:'empty'}});
  assert.notEqual(text,'Context is already compact.');
  assert.match(text!,/CTX_EMPTY_SUMMARY/u);
  assert.match(text!,/empty summary/u,'the code\'s own English sentence');
  const view=compactResultView({ok:true,compattato:false,jobId:'j1',error:{code:'CTX_EMPTY_SUMMARY',message:'empty'}});
  assert.equal(view.kind,'failed');
  if(view.kind==='failed'){assert.equal(view.code,'CTX_EMPTY_SUMMARY');assert.ok(view.headline.length>0);}
});

test('a Context Engine job that failed without an error object is still a failure',async()=>{
  const text=await run({ok:true,compattato:false,jobId:'j1'});
  assert.notEqual(text,'Context is already compact.');
  assert.match(text!,/did not compact/u);
  assert.match(text!,/COMPACTION_FAILED/u);
});

test('the kernel\'s reasons are said plainly, with the code when there is one',async()=>{
  const cases:Array<[Record<string,unknown>,RegExp]>=[
    [{motivo:'troncato'},/cut off/u],
    [{motivo:'vuoto'},/empty summary/u],
    [{motivo:'errore',codice:'PROVIDER_TIMEOUT'},/PROVIDER_TIMEOUT/u],
    [{motivo:'errore'},/summary request failed/u],
    /* release review S4-1 of 0.6.13: the kernel's other reasons, each with its own code and words, never «did not say why» */
    [{motivo:'attrezzo'},/tool call instead of a summary/u],
    [{motivo:'rifiuto'},/refused to write the summary/u],
    [{motivo:'esaurito'},/three times in a row/u],
    [{motivo:'non-salvata'},/could not be saved/u],
    /* r4, cure of review 3 S2-2: over the threshold with nothing reducible, and a summary that would not reduce */
    /* review 5 S4 of 0.6.13: what is kept word for word includes the latest requests (a long paste there), and that passes */
    [{motivo:'al-minimo'},/your latest requests and the latest exchanges\), already shortened as far as it goes[\s\S]*compacted again once a few newer requests/u],
    [{motivo:'inefficace'},/summary was written, but it would have made the conversation longer/u],
    /* r4, cure of review 6 S3-1: an older part too small for a summary to pay off is said as that, never «already compact» */
    [{motivo:'poco-utile'},/a summary would save little now, because the older part is too small to make it noticeably shorter\. Nothing was replaced\.[\s\S]*pays off after a few more exchanges/u],
  ];
  for(const [extra,said] of cases){
    const text=await run({ok:true,compattato:false,fase:'riassunto',...extra});
    assert.notEqual(text,'Context is already compact.',String(extra.motivo));
    assert.match(text!,said,String(extra.motivo));
    assert.match(text!,/nothing was replaced|original history/iu,String(extra.motivo));
    /* review 4 S3-1 of 0.6.13: the registry answers «inefficace» only after the summary was written (session-registry.mjs:12043),
       so the screen never says nothing was sent, and says «nothing was replaced» once */
    if(extra.motivo==='inefficace')assert.doesNotMatch(text!,/nothing was sent/iu,String(extra.motivo));
    assert.ok((text!.match(/nothing was replaced/giu)??[]).length<=1,`${String(extra.motivo)}: ${text}`);
  }
});

test('the registry\'s kernel failure without a reason is a failure, never "already compact"',async()=>{
  const text=await run({ok:true,compattato:false,fase:'riassunto'});
  assert.notEqual(text,'Context is already compact.');
  assert.match(text!,/did not compact/u);
  assert.match(text!,/nothing was replaced/iu);
  assert.doesNotMatch(text!,/riassunto|compattat|motivo/iu,'no kernel word on the screen');
});

test('the Context Engine that refuses a job with nothing to compact (a thrown CTX_NOTHING_TO_COMPACT) is "already compact"',async()=>{
  const refusal=Object.assign(new Error('nothing'),{name:'ContextEngineError',code:'CTX_NOTHING_TO_COMPACT'});
  assert.equal(await runControllerSlashAction('compact',{compact:async()=>{throw refusal;}}),'Context is already compact.');
  assert.equal(compactNothingToDo(refusal),true);
  assert.equal(compactNothingToDo({code:'CTX_PENDING_TOOLS'}),false);
  await assert.rejects(runControllerSlashAction('compact',{compact:async()=>{throw Object.assign(new Error('x'),{code:'SESSION_NOT_READY'});}}),/x/u,'any other refusal is still an error');
});

test('a compaction that happened still says so',async()=>{
  assert.equal(await run({ok:true,compattato:true}),'Context compacted.');
  assert.equal(compactResultView({ok:true,compattato:true}).kind,'done');
  assert.equal(compactResultView(undefined).kind,'done','an old runtime that returns nothing keeps today\'s line');
});

/* The /compact sheet in the real app (app.ts, the `compact` branch): the failed sheet and its line, not «Already compact». */
const env=hermeticProfile();after(()=>env.restore());
let n=0;const project=()=>{const root=join(env.root,`compact-d5-${++n}`);mkdirSync(root,{recursive:true});return root;};
const eventi=[{type:'RunStarted',runId:'r1',input:{prompt:'first'}},{type:'TextMessageStart',messageId:'a',role:'assistant'},{type:'TextMessageContent',messageId:'a',delta:'ok'},{type:'TextMessageEnd',messageId:'a'}];

test('the sheet: a kernel compaction that did not happen is the failed sheet; nothing to compact is "Already compact"',async()=>{
  let answer:unknown={ok:true,compattato:false,fase:'riassunto'};let thrown=false;
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,runtimeExtra:{export:(id:string)=>({sessionId:id,eventi}),compact:async()=>{if(thrown)throw Object.assign(new Error('nothing'),{code:'CTX_NOTHING_TO_COMPACT'});return answer;}}});
  try{
    await app.type('/compact');app.press('\r');
    const s=await app.waitFor('the failure',x=>/✗ Writing the summary/u.test(x.text)&&/did not compact the conversation/u.test(x.text));
    assert.match(s.text,/· Replacing the history/u,'nothing was replaced');
    assert.doesNotMatch(s.text,/Already compact|already compact/u);
    app.press('\x1b');await app.waitFor('closed',x=>!/── Compact/u.test(x.text));
    answer={ok:true,compattato:false,jobId:'j2',error:{code:'CTX_NOTHING_TO_COMPACT',message:'nothing'}};
    await app.type('/compact');app.press('\r');
    await app.waitFor('already compact',x=>/Already compact/u.test(x.text));
    app.press('\x1b');await app.waitFor('closed again',x=>!/── Compact/u.test(x.text));
    /* the Context Engine refuses the job (thrown CTX_NOTHING_TO_COMPACT): the same "already", never "/compact failed" */
    thrown=true;
    await app.type('/compact');app.press('\r');
    const s3=await app.waitFor('already compact, from a refusal',x=>/Already compact/u.test(x.text)&&(x.text.match(/Context is already compact\./gu)??[]).length>=2);
    assert.equal((s3.text.match(/\/compact failed/gu)??[]).length,1,'only the first, kernel failure says "failed"');
    assert.doesNotMatch(s3.text,/There is nothing to compact yet/u,'not the refusal as an error line');
  }finally{app.unmount();}
});

/* 0.6.13, round 2: the three codes a compaction can end with now have words of their own, not a family's guess. */
test('a refusal for an open tool call, a paid summary that came back unusable and a full window are said for what they are',async()=>{
  const pending=Object.assign(new Error('Attendere i risultati degli strumenti.'),{name:'ContextEngineError',code:'CTX_PENDING_TOOLS'});
  await assert.rejects(runControllerSlashAction('compact',{compact:async()=>{throw pending;}}),(error:any)=>error.code==='CTX_PENDING_TOOLS');
  const said=(code:string)=>describeError({code}).what;
  assert.match(said('CTX_PENDING_TOOLS'),/tool call .*no result yet/u);
  assert.doesNotMatch(said('CTX_PENDING_TOOLS'),/extension/iu,'not the extension family');
  assert.match(said('COMPACTION_NO_SUMMARY'),/did not compact the conversation.*cut short or empty.*billed/u);
  assert.match(said('NATIVE_CONTEXT_WINDOW_EXCEEDED'),/larger than the model’s context window/u);
  assert.doesNotMatch(describeError({code:'NATIVE_CONTEXT_WINDOW_EXCEEDED'}).todo??'',/\/compact/u,'it can come from the compaction itself: no loop back to /compact');
});

/* 0.6.13, contract with the Desktop (r4 e4823614d, d17df5813): /compact's `nonEntra:{finestra,pavimento}` is said after what /compact
   did, compacted or not, with both numbers and /model; without both numbers nothing is invented. The real kernel answers it at a
   declared 8k window after a model switch: `{compattato:false, motivo:'al-minimo', nonEntra:{finestra:8192, pavimento:9152}}`. */
test('a window too small for TALOS is said after any /compact answer, with both numbers',async()=>{
  const nonEntra={finestra:8192,pavimento:9152};
  const window=/This model’s window \(8,192 tokens\) is too small for TALOS’s tools and the part it always keeps \(about 9,152 tokens\)[\s\S]*\(\/model\)/u;
  const failed=await run({ok:true,compattato:false,fase:'riassunto',motivo:'al-minimo',nonEntra});
  assert.match(failed!,/already shortened as far as it goes/u,'what /compact did comes first');
  assert.match(failed!,window);
  assert.ok(failed!.indexOf('already shortened')<failed!.indexOf('This model’s window'),'the note comes after');
  const done=await run({ok:true,compattato:true,tokenPrima:10314,tokenDopo:8970,nonEntra});
  assert.match(done!,/^Context compacted\.\n/u);assert.match(done!,window);
  const already=await run({ok:true,compattato:false,motivo:'niente-da-compattare',nonEntra});
  assert.match(already!,/^Context is already compact\.\n/u);assert.match(already!,window);
});

test('without both numbers of nonEntra nothing more is said',async()=>{
  for(const nonEntra of [undefined,null,{},{finestra:8192},{pavimento:9152},{finestra:'8192',pavimento:9152},{finestra:8192,pavimento:-1},{finestra:0,pavimento:9152},{finestra:8192.5,pavimento:9152}]){
    assert.equal(await run({ok:true,compattato:true,nonEntra}),'Context compacted.',JSON.stringify(nonEntra));
    assert.equal(await run({ok:true,compattato:false,motivo:'niente-da-compattare',nonEntra}),'Context is already compact.',JSON.stringify(nonEntra));
  }
});
