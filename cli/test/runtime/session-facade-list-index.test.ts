/*
 * LONG-CHAT tappa B2: the list the picker and `--resume last` use is served from the C4R index by entry. A fresh row costs nothing; only the stale or new
 * journals are restored (their families, through the kernel option of tappa B1); the sessions already in memory answer with their live row; the merged list is
 * written back to the index. Anything that goes wrong with the index falls back to the old way - restore everything - so a list never fails because of it.
 * Without an index source the facade behaves exactly as before.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

const PREPARE='{"soloSessioni":[]}'; /* the facade's first kernel call is always the empty selection */
const summary=(id:string,startedAt:string,extra:Record<string,unknown>={})=>({id,sessionId:id,name:`idx-${id}`,project:null,path:null,model:'m',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt,updatedAt:startedAt,endedAt:null,outcome:'completed',interrupted:false,usage:null,approvalWait:null,collisions:[],delegationOutcome:null,delegationEvidence:null,reasoningEffort:null,...extra});
const kernelRow=(id:string,startedAt:string,extra:Record<string,unknown>={})=>({sessionId:id,nome:`live-${id}`,avviataAlle:startedAt,conclusa:true,...extra});

function world({fresh=[] as any[],staleIds=[] as string[],archive={} as Record<string,string>,probe}:{fresh?:any[];staleIds?:string[];archive?:Record<string,string>;probe?:()=>Promise<any>}={}){
  const restores:string[]=[];const commits:any[]=[];const loaded=new Set<string>();
  const registry:any={
    async ripristina(options?:{soloSessioni?:string[]}){
      restores.push(options?JSON.stringify(options):'all');
      for(const id of options?.soloSessioni??Object.keys(archive))loaded.add(id);
      return{ripristinate:0,totali:0};
    },
    elenca(){return [...loaded].map(id=>kernelRow(id,archive[id]??'2026-10-01T00:00:00.000Z'));},
    iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true}),
  };
  const sessionList={
    probe:probe??(async()=>({rows:fresh,staleIds,stamp:{entries:{marker:{size:1,mtimeMs:1}}}})),
    commit:async(stamp:unknown,rows:unknown[])=>{commits.push({stamp,rows});return true;},
  };
  return{registry,sessionList,restores,commits,loaded};
}

test('B2 all fresh: the list is the index, nothing is restored, nothing is rewritten',async()=>{
  const w=world({fresh:[summary('a','2026-10-01T10:00:00.000Z'),summary('b','2026-10-02T10:00:00.000Z')]});
  const r=createSessionFacade(w.registry,{model:'m',sessionList:w.sessionList});
  const rows=await r.listSessions();
  assert.deepEqual(rows.map(x=>x.id),['a','b']);
  assert.equal(rows[0]!.name,'idx-a');
  assert.deepEqual(w.restores,[]);
  assert.deepEqual(w.commits,[]);
});

test('B2 only the stale journals are restored; fresh rows stay from the index, restored ones are recomputed, and the merged list is written back',async()=>{
  const w=world({fresh:[summary('a','2026-10-01T10:00:00.000Z')],staleIds:['b'],archive:{b:'2026-10-02T10:00:00.000Z'}});
  const r=createSessionFacade(w.registry,{model:'m',sessionList:w.sessionList});
  const rows=await r.listSessions();
  assert.deepEqual(w.restores,[PREPARE,'{"soloSessioni":["b"]}']);
  assert.deepEqual(rows.map(x=>[x.id,x.name]),[['a','idx-a'],['b','live-b']]);
  assert.equal(w.commits.length,1);
  assert.deepEqual(w.commits[0].stamp,{entries:{marker:{size:1,mtimeMs:1}}},'the stamp taken BEFORE the restore is the one that anchors the rows');
  assert.deepEqual(w.commits[0].rows.map((x:any)=>x.id),['a','b']);
});

test('B2 a session already in memory answers with its live row, not with the one in the index',async()=>{
  const w=world({fresh:[summary('a','2026-10-01T10:00:00.000Z',{name:'old name'})],archive:{a:'2026-10-01T10:00:00.000Z'}});
  const r=createSessionFacade(w.registry,{model:'m',sessionList:w.sessionList});
  await r.resume('a','go').catch(()=>{});            // loads the family of a
  const rows=await r.listSessions();
  assert.equal(rows.find(x=>x.id==='a')!.name,'live-a');
});

test('B2 the list restores nothing a second time: stale ones loaded by the first list are in memory for the second',async()=>{
  const w=world({fresh:[],staleIds:['b'],archive:{b:'2026-10-02T10:00:00.000Z'}});
  const r=createSessionFacade(w.registry,{model:'m',sessionList:w.sessionList});
  await r.listSessions();await r.listSessions();
  assert.deepEqual(w.restores,[PREPARE,'{"soloSessioni":["b"]}'],'the probe still calls b stale (a static fake), but b is in memory: it is not asked of the kernel again');
});

test('B2 a failing index probe falls back to restoring everything, and the list still works',async()=>{
  const w=world({archive:{a:'2026-10-01T10:00:00.000Z',b:'2026-10-02T10:00:00.000Z'},probe:async()=>{throw new Error('SESSION_LIST_INDEX_UNKNOWN_ID');}});
  const r=createSessionFacade(w.registry,{model:'m',sessionList:w.sessionList});
  const rows=await r.listSessions();
  assert.deepEqual(w.restores,[PREPARE,'all']);
  assert.deepEqual(rows.map(x=>x.id),['a','b']);
  assert.deepEqual(w.commits,[],'a fallback does not write the index: nothing anchors its rows');
});

test('B2 a failing write-back does not fail the list',async()=>{
  const w=world({fresh:[],staleIds:['b'],archive:{b:'2026-10-02T10:00:00.000Z'}});
  w.sessionList.commit=async()=>{throw new Error('disk full');};
  const r=createSessionFacade(w.registry,{model:'m',sessionList:w.sessionList});
  assert.deepEqual((await r.listSessions()).map(x=>x.id),['b']);
});

test('B2 without an index source, or after a full restore, the list is the live one and the index is not asked',async()=>{
  const w=world({fresh:[summary('a','2026-10-01T10:00:00.000Z')],archive:{a:'2026-10-01T10:00:00.000Z'}});
  let probes=0;const original=w.sessionList.probe;w.sessionList.probe=async()=>{probes+=1;return original() as any;};
  const plain=createSessionFacade(w.registry,{model:'m'});
  assert.deepEqual((await plain.listSessions()).map(x=>x.id),['a']);
  assert.deepEqual(w.restores,[PREPARE,'all']);
  const w2=world({fresh:[],archive:{a:'2026-10-01T10:00:00.000Z'}});
  let probes2=0;const original2=w2.sessionList.probe;w2.sessionList.probe=async()=>{probes2+=1;return original2() as any;};
  const full=createSessionFacade(w2.registry,{model:'m',sessionList:w2.sessionList});
  await full.restore();await full.listSessions();
  assert.equal(probes2,0,'after a full restore the live list is complete: no probe, no write-back');
  assert.equal(probes,0);
});

test('B2 the loaded scope never touches the index',async()=>{
  const w=world({fresh:[summary('a','2026-10-01T10:00:00.000Z')]});
  let probes=0;const original=w.sessionList.probe;w.sessionList.probe=async()=>{probes+=1;return original() as any;};
  const r=createSessionFacade(w.registry,{model:'m',sessionList:w.sessionList});
  await r.listSessions({scope:'loaded'});
  assert.equal(probes,0);assert.deepEqual(w.restores,[]);
});

test('B2 the merged list is in start order, whichever rows came from the index and whichever were just restored',async()=>{
  const w=world({fresh:[summary('a','2026-10-02T10:00:00.000Z')],staleIds:['c'],archive:{c:'2026-10-01T10:00:00.000Z'}});
  const r=createSessionFacade(w.registry,{model:'m',sessionList:w.sessionList});
  assert.deepEqual((await r.listSessions()).map(x=>x.id),['c','a']);
  assert.deepEqual(w.commits[0].rows.map((x:any)=>x.id),['c','a'],'and the index is written in the same order');
});
