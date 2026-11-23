/*
 * P18 phase 1 (owner 2026-09-26). `withArchivableCapture` no longer sends the service a prefix it has already archived:
 * each capture cost a full reread of the archive and a sha256 of every message. The service must still see every
 * change, and the archive must end up the same.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {withArchivableCapture} from '../../src/runtime/context-archive.ts';

const ROOT=new URL('../../../',import.meta.url);
const mod=(path:string)=>import(new URL(path,ROOT).href);
const sys={role:'system',content:'rules'};
const call=(ids:string[])=>({role:'assistant',content:null,tool_calls:ids.map(id=>({id,type:'function',function:{name:'leggi',arguments:'{}'}}))});
const result=(id:string)=>({role:'tool',tool_call_id:id,content:`out ${id}`});

/* The kernel's capture points for one turn with six tools (talosHarness.mjs: start, before-request, response, one per
   result, before-request, response, finished). */
async function toolTurn(hooks:any,history:any[],turn:number){
  history.push({role:'user',content:`go ${turn}`});
  await hooks.capture({messages:history,reason:'start'});
  await hooks.capture({messages:history,reason:'before-request'});
  const ids=[1,2,3,4,5,6].map(i=>`t${turn}_${i}`);
  history.push(call(ids));
  await hooks.capture({messages:history,reason:'response'});
  for(const id of ids){history.push(result(id));await hooks.capture({messages:history,reason:'tool-result'});}
  await hooks.capture({messages:history,reason:'before-request'});
  history.push({role:'assistant',content:`done ${turn}`});
  await hooks.capture({messages:history,reason:'response'});
  await hooks.capture({messages:history,reason:'finished'});
}

test('P18: a turn of six tools reaches the service three times instead of eleven, each time with a longer prefix',async()=>{
  const seen:number[]=[];
  const hooks:any=withArchivableCapture({capture:({messages}:{messages:unknown[]})=>{seen.push(messages.length);return 'ok';}});
  const history:any[]=[sys];
  await toolTurn(hooks,history,1);
  assert.deepEqual(seen,[2,9,10],'the new user message, the whole tool exchange, the final answer');
  /* a replaced message (same length) still goes through: the service is the one that says diverged */
  history[history.length-1]={role:'assistant',content:'rewritten'};
  await hooks.capture({messages:history,reason:'finished'});
  assert.deepEqual(seen,[2,9,10,10]);
  /* a shorter history (a compaction that rebuilt it) goes through too */
  await hooks.capture({messages:history.slice(0,5),reason:'start'});
  assert.equal(seen.at(-1),2,'sent: its archivable prefix (before the unanswered exchange) is not the one archived');
});

test('P18: a capture that failed is sent again next time',async()=>{
  let calls=0;
  const hooks:any=withArchivableCapture({capture:()=>{calls++;if(calls===1)throw Object.assign(new Error('x'),{code:'CTX_HISTORY_DIVERGED'});return 'ok';}});
  const history=[sys,{role:'user',content:'go'}];
  await assert.rejects(()=>hooks.capture({messages:history}),{code:'CTX_HISTORY_DIVERGED'});
  await hooks.capture({messages:history});
  assert.equal(calls,2,'a failed capture does not count as archived');
});

async function realService(){
  const dir=mkdtempSync(join(tmpdir(),'p18-capture-'));
  const [{createContextEngine},{createSqliteContextStore},{createDesktopContextService}]=await Promise.all([
    mod('context-engine/src/engine.mjs'),mod('context-engine/src/node/sqlite-store.mjs'),mod('harness-ui/src/context-desktop-service.mjs'),
  ]);
  const store=createSqliteContextStore({databasePath:join(dir,'context.sqlite')});
  const profile={provider:'ollama',model:'fake',windowTokens:65_536,responseReserve:4_096};
  const engine=createContextEngine({store,model:{resolveModel:()=>profile,summarize:async()=>{throw new Error('no summary in this test');}},tokenCounter:{countPreparedContext:async()=>({inputTokens:10,method:'heuristic'})}});
  const service=createDesktopContextService({engine,store,readSession:async()=>({sessionId:'s1'}),isSessionEnabled:async()=>true,resolveSessionModel:async()=>profile});
  return{service,store,close:async()=>{try{await store.close?.();}catch{}rmSync(dir,{recursive:true,force:true});}};
}

test('P18: on the real service the archive after three tool turns is the whole history, message by message',async()=>{
  const {service,store,close}=await realService();
  try{
    const hooks:any=withArchivableCapture(await service.createKernelHooks({sessionId:'s1',runId:'r1'}));
    const history:any[]=[sys];
    for(const turn of [1,2,3])await toolTurn(hooks,history,turn);
    const records:any[]=await store.readOriginals({sessionId:'s1',afterSequence:0,limit:1000});
    assert.equal(records.length,history.length,'every message archived once');
    assert.deepEqual(records.map(r=>r.message),history);
  }finally{await close();}
});
