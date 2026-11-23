/*
 * P12 (owner, 2026-09-25, CTX_HISTORY_DIVERGED on resume). Measured on a copy of the owner's session and archive: the
 * Context Engine archived an assistant message with a tool call and no result (the turn stopped there), the session's
 * history dropped that unanswered call, and from then on every turn was refused. Here, with the REAL desktop context
 * service and SQLite store in a temporary folder (the ones the CLI composes, talos-composition.ts): the kernel's capture
 * sequence of an interrupted tool turn reproduces the refusal with the service's own hooks, and does not with the CLI's
 * `withArchivableCapture`. Plus the prefix rule on its own.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {archivableHistory,withArchivableCapture} from '../../src/runtime/context-archive.ts';
import {configureModelProfiles,resetModelProfiles} from '../../src/runtime/model-profile.ts';

const ROOT=new URL('../../../',import.meta.url);
const mod=(path:string)=>import(new URL(path,ROOT).href);
const sys={role:'system',content:'rules'},u1={role:'user',content:'read the file'},u2={role:'user',content:'go on'};
const call=(ids:string[])=>({role:'assistant',content:null,tool_calls:ids.map(id=>({id,type:'function',function:{name:'read',arguments:'{}'}}))});
const result=(id:string)=>({role:'tool',tool_call_id:id,content:'ok'});

test('P12: the archivable history stops before an unanswered tool exchange, and keeps a complete one',()=>{
  assert.deepEqual(archivableHistory([sys,u1,call(['a'])]),[sys,u1],'an unanswered call waits');
  assert.deepEqual(archivableHistory([sys,u1,call(['a','b']),result('a')]),[sys,u1],'a partly answered call and its partial result wait');
  const whole=[sys,u1,call(['a','b']),result('a'),result('b')];
  assert.deepEqual(archivableHistory(whole),whole,'a complete exchange is archived');
  assert.deepEqual(archivableHistory([...whole,{role:'assistant',content:'done'}]),[...whole,{role:'assistant',content:'done'}]);
  assert.deepEqual(archivableHistory([sys,u1]),[sys,u1],'no tool call, nothing held back');
  assert.deepEqual(archivableHistory([sys,u1,call(['a']),result('a'),u2,call(['c'])]),[sys,u1,call(['a']),result('a'),u2],'only the last exchange decides');
});

test('P12: capture and prepare retry a stale revision for a while, and give up on anything else at once',async()=>{
  const stale=()=>Object.assign(new Error('Context changed; reread the current revision'),{code:'CTX_STALE_REVISION'});
  let captures=0,prepares=0,others=0,always=0;
  const hooks:any=withArchivableCapture({
    capture:()=>{captures++;if(captures===1)throw stale();return 'archived';},
    prepare:()=>{prepares++;if(prepares<3)throw stale();return {messages:[]};},
  });
  assert.equal(await hooks.capture({messages:[sys,u1]}),'archived');assert.equal(captures,2);
  assert.deepEqual(await hooks.prepare({messages:[sys,u1]}),{messages:[]});assert.equal(prepares,3);
  const failing:any=withArchivableCapture({capture:()=>{others++;throw Object.assign(new Error('x'),{code:'CTX_HISTORY_DIVERGED'});}});
  await assert.rejects(()=>failing.capture({messages:[sys]}),(e:any)=>e?.code==='CTX_HISTORY_DIVERGED');assert.equal(others,1,'another error is not retried');
  /* The patience is time, not a number of attempts (Hermes, hermes_state.py:469-471): a revision still moving when it runs
     out is a real conflict, and its error goes on. */
  const patience=400,started=Date.now();
  const stuck:any=withArchivableCapture({capture:()=>{always++;throw stale();}},{stalePatienceMs:patience});
  await assert.rejects(()=>stuck.capture({messages:[sys]}),(e:any)=>e?.code==='CTX_STALE_REVISION');
  const elapsed=Date.now()-started;
  assert.ok(elapsed>=patience-5,`it waited the whole patience (${elapsed} ms)`);
  assert.ok(always>=3,`it kept retrying within it (${always} attempts)`);
  assert.ok(elapsed<patience+1_000,`and then gave up (${elapsed} ms)`);
});


async function realService(){
  const dir=mkdtempSync(join(tmpdir(),'p12-context-'));
  const [{createContextEngine},{createSqliteContextStore},{createDesktopContextService}]=await Promise.all([
    mod('context-engine/src/engine.mjs'),mod('context-engine/src/node/sqlite-store.mjs'),mod('harness-ui/src/context-desktop-service.mjs'),
  ]);
  const store=createSqliteContextStore({databasePath:join(dir,'context.sqlite')});
  const profile={provider:'ollama',model:'fake',windowTokens:65_536,responseReserve:4_096};
  const engine=createContextEngine({store,model:{resolveModel:()=>profile,summarize:async()=>{throw new Error('no summary in this test');}},tokenCounter:{countPreparedContext:async()=>({inputTokens:10,method:'heuristic'})}});
  const service=createDesktopContextService({engine,store,readSession:async()=>({sessionId:'s1'}),isSessionEnabled:async()=>true,resolveSessionModel:async()=>profile});
  return{service,close:async()=>{try{await store.close?.();}catch{}rmSync(dir,{recursive:true,force:true});}};
}
/* The kernel's capture points in an interrupted tool turn (talosHarness.mjs): 'start', 'response' (the model asked for a
   tool, not run yet), the turn stops; the next turn starts from the session's history, which drops the unanswered call. */
async function interruptedThenNext(hooks:any){
  await hooks.capture({messages:[sys,u1],reason:'start'});
  await hooks.capture({messages:[sys,u1,call(['t1'])],reason:'response'});
  await hooks.capture({messages:[sys,u1,u2],reason:'start'});
}

test('P12: the service\'s own hooks archive the unanswered call, and the next turn is refused (the owner\'s session)',async()=>{
  const {service,close}=await realService();
  try{
    const hooks=await service.createKernelHooks({sessionId:'s1',runId:'r1'});
    await assert.rejects(()=>interruptedThenNext(hooks),(error:any)=>error?.code==='CTX_HISTORY_DIVERGED');
  }finally{await close();}
});

test('P12: through the CLI bridge the unanswered call is not archived, and the next turn goes on',async()=>{
  const {service,close}=await realService();
  try{
    const hooks=withArchivableCapture(await service.createKernelHooks({sessionId:'s1',runId:'r1'}));
    await interruptedThenNext(hooks);
    /* and a tool turn that completes is archived whole, the prefix still holding */
    await hooks.capture({messages:[sys,u1,u2,call(['t2'])],reason:'response'});
    await hooks.capture({messages:[sys,u1,u2,call(['t2']),result('t2')],reason:'tool-result'});
    await hooks.capture({messages:[sys,u1,u2,call(['t2']),result('t2'),{role:'assistant',content:'done'}],reason:'finished'});
  }finally{await close();}
});

/* The wiring, by behaviour and not by reading the source (Hermes AGENTS.md, "Never read source code in tests", read
   2026-09-26): the hooks the CLI's own context bridge hands the kernel survive the owner's sequence. A Z.ai model the
   registry documents (1M window) turns the Context Engine on with no network. */
test('P12: the hooks the CLI context bridge hands the kernel survive an interrupted tool turn',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'p12-bridge-'));let bridge:any=null;
  try{
    const [{createCliContextBridge},{REGISTRO_FORNITORI:registry}]=await Promise.all([import('../../src/runtime/talos-composition.ts'),mod('harness-ui/src/provider-registry.mjs')]);
    resetModelProfiles();
    configureModelProfiles({registry,rowsFor:(provider:string)=>({runtime:[],registry:[...(registry[provider]?.modelliNoti??[]),...(registry[provider]?.modelliDiRiserva??[])]})});
    const session={sessionId:'s1',provider:'zai',modello:'zai/glm-5.3-flash'};
    bridge=createCliContextBridge({
      repoRoot:fileURLToPath(ROOT),paths:{dataRoot:dir} as any,
      registry:{leggiSessioneContesto:()=>session,pubblicaEventoContesto:()=>{}},
      providerRegistry:{},providerStore:{},ownerRuntime:{},chatImageStore:null,
      separaFonteModello:()=>({fonte:'zai',modelloRemoto:'glm-5.3-flash'}),
    });
    const hooks=await bridge.hooks({sessionId:'s1',runId:'r1'});
    assert.equal(typeof hooks?.capture,'function','the Context Engine is on for this session');
    await interruptedThenNext(hooks);
  }finally{await bridge?.close();resetModelProfiles();rmSync(dir,{recursive:true,force:true,maxRetries:5});}
});
