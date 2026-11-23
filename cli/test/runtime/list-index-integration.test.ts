/*
 * LONG-CHAT tappa B2, end to end with the REAL kernel registry and the REAL index on disk (no fake of either): the first list builds the index, the second
 * (a new process, as far as the registry knows) opens no journal at all and returns the same rows, one chat later only that session is read again, and the
 * rows served from the index are the rows the slow path computes (the index is a view, never a second truth).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {appendFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {commitSessionListIndex,probeSessionListIndexByEntry} from '../../src/sessions/list-index.ts';

const REPO_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','..','..');
const kernel=(name:string)=>import(pathToFileURL(join(REPO_ROOT,'harness-ui','src',name)).href);
const {createSessionRegistry}=await kernel('session-registry.mjs');
const {leggiRegistroAStream}=await kernel('session-store.mjs');

const PARENT='11111111-aaaa-4aaa-8aaa-111111111111';
const CHILD='22222222-bbbb-4bbb-8bbb-222222222222';
const LONE='33333333-cccc-4ccc-8ccc-333333333333';
const OTHER='44444444-dddd-4ddd-8ddd-444444444444';

async function journal(store:string,sessionId:string,{padreId=null,started,name}:{padreId?:string|null;started:string;name:string}){
  const lines=[
    {tipo:'intestazione',schema:1,sessionId,taskId:padreId?`delega:${padreId}`:'libero:b2',cartella:store,task:{consegna:name,consegnaCorta:name},comandoProva:null,forkDa:null,avviataAlle:started,modello:'z-ai/glm-5.3-flash',modelloPlanner:null,reasoning:'medium',mobile:false,permessi:'Full access',permessiPerAttrezzo:null,padreId,profonditaDelega:padreId?1:0,provider:'cloud',runtimeId:null,modelId:'z-ai/glm-5.3-flash',fallbackConsent:false,cartellaGiaScelta:true},
    {type:'RunStarted',threadId:sessionId,runId:'r1',_sequenza:1},
    {type:'RunFinished',threadId:sessionId,runId:'r1',result:{detto:'fatto'},_sequenza:2},
  ];
  await writeFile(join(store,`${sessionId}.jsonl`),lines.map(l=>`${JSON.stringify(l)}\n`).join(''),'utf8');
}
async function world(){
  const root=await mkdtemp(join(tmpdir(),'talos-b2-int-'));
  const store=join(root,'sessions');const dataRoot=join(root,'data');
  await mkdir(store,{recursive:true});await mkdir(dataRoot,{recursive:true});
  await journal(store,PARENT,{started:'2026-10-01T09:00:00.000Z',name:'Parent work'});
  await journal(store,CHILD,{padreId:PARENT,started:'2026-10-01T09:01:00.000Z',name:'Child work'});
  await journal(store,LONE,{started:'2026-10-02T09:00:00.000Z',name:'Lone task'});
  await journal(store,OTHER,{started:'2026-10-03T09:00:00.000Z',name:'Other task'});
  /* a "process": a registry with a spy on the journals it reads, and a facade with the index source */
  const process_=()=>{
    const reads:string[]=[];
    const registry=createSessionRegistry({cartellaStore:store,avviaSessioneFn:async()=>({ok:true}),guardaWorkspaceFn:()=>()=>{},modello:'z-ai/glm-5.3-flash',chiave:'k',clock:()=>new Date('2026-10-07T12:00:00.000Z'),
      leggiRegistroAStreamFn:(args:any)=>{reads.push(args.sessionId);return leggiRegistroAStream(args);}});
    const sessionList={probe:()=>probeSessionListIndexByEntry({dataRoot,sessionsRoot:store,repoRoot:REPO_ROOT}),commit:(stamp:unknown,rows:unknown[])=>commitSessionListIndex({dataRoot,sessionsRoot:store,repoRoot:REPO_ROOT,stamp:stamp as any,rows})};
    const runtime=createSessionFacade(registry as any,{model:'m',sessionList:sessionList as any});
    return{reads,registry,runtime};
  };
  return{root,store,dataRoot,process_};
}

test('B2 e2e: the first list builds the index; the next list opens no journal and returns the same rows; one chat later only that family is read again',async()=>{
  const w=await world();
  try{
    const first=w.process_();
    const rows1=await first.runtime.listSessions();
    assert.deepEqual([...first.reads].sort(),[PARENT,CHILD,LONE,OTHER].sort(),'nothing indexed yet: every family is restored');
    assert.equal(rows1.length,4);

    const second=w.process_();
    const rows2=await second.runtime.listSessions();
    assert.deepEqual(second.reads,[],'a fresh index: not one journal is opened');
    assert.deepEqual(rows2,rows1,'and the rows are the ones the slow path computed');

    await appendFile(join(w.store,`${LONE}.jsonl`),`${JSON.stringify({type:'RunStarted',threadId:LONE,runId:'r2',_sequenza:3})}\n${JSON.stringify({type:'RunFinished',threadId:LONE,runId:'r2',result:{detto:'ancora'},_sequenza:4})}\n`);
    const third=w.process_();
    const rows3=await third.runtime.listSessions();
    assert.deepEqual(third.reads,[LONE],'one chat later: only that session is read again, not the archive');
    assert.equal(rows3.length,4);

    const fourth=w.process_();
    assert.deepEqual(await fourth.runtime.listSessions(),rows3);
    assert.deepEqual(fourth.reads,[],'the write-back after the partial list made the index fresh again');
  }finally{await rm(w.root,{recursive:true,force:true});}
});

test('B2 e2e: the rows served from the index equal the rows of a full restore (the index is a view, not a second truth)',async()=>{
  const w=await world();
  try{
    await w.process_().runtime.listSessions();                    // builds the index
    const indexed=await w.process_().runtime.listSessions();      // served from it
    const plain=w.process_();
    const slow=await createSessionFacade(plain.registry as any,{model:'m'}).listSessions(); // no index source: restore everything
    assert.deepEqual(indexed,slow);
  }finally{await rm(w.root,{recursive:true,force:true});}
});

test('B2 e2e: resuming a session found by the index restores its family only (the child comes with its parent), not the archive',async()=>{
  const w=await world();
  try{
    await w.process_().runtime.listSessions();
    const p=w.process_();
    await p.runtime.listSessions();
    assert.deepEqual(p.reads,[]);
    await p.runtime.restore({sessionIds:[CHILD]});
    assert.deepEqual([...p.reads].sort(),[PARENT,CHILD].sort(),'the child brings its parent; LONE and OTHER stay closed');
  }finally{await rm(w.root,{recursive:true,force:true});}
});
