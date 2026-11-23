/*
 * C4R — session list metadata-only. The list/search entries may serve from a derived, rebuildable
 * index (metadata only: id, title, timestamps, project, model); the journals are replayed only by
 * the slow path (and by show/resume/export, which keep the full payload). The index is a VIEW: it
 * is written from the slow path's own rows and every entry is anchored to a journal stat
 * (size, mtimeMs), so the journal stays the single source of truth.
 */
import assert from 'node:assert/strict';import test from 'node:test';import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';import {existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
import {runSessionCommand} from '../../src/commands/session-cli.ts';
import {probeSessionListIndex,commitSessionListIndex,sessionListIndexFile,SESSION_LIST_INDEX_SCHEMA} from '../../src/sessions/list-index.ts';
import {createSessionMetadataStore,sessionMetadataRoot} from '../../src/sessions/metadata-store.ts';

const REPO_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','..','..');
const sessionStore=await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','session-store.mjs')).href);

const T0=Date.parse('2026-10-01T10:00:00.000Z');
function headerRecord(sessionId:string,startedAt:string){return{tipo:'intestazione',schema:2,sessionId,taskId:null,cartella:'/tmp/project',task:null,comandoProva:null,forkDa:null,avviataAlle:startedAt,modello:'openrouter:vendor/live-model-a',modelloPlanner:null,reasoning:null,mobile:false,permessi:'Workspace write',modalitaOperativa:'normale',doveGiranoIComandi:null,comandiNellaConversazione:false,fallbackProviders:[],permessiPerAttrezzo:null,padreId:null,profonditaDelega:0,provider:'cloud',runtimeId:null,modelId:'openrouter:vendor/live-model-a',fallbackConsent:false,cartellaGiaScelta:false};}

async function writeJournal(sessionsRoot:string,sessionId:string,startedAt:string,events=2){
  sessionStore.registraRigaSync({cartellaStore:sessionsRoot,sessionId,record:headerRecord(sessionId,startedAt)});
  sessionStore.registraRigaSync({cartellaStore:sessionsRoot,sessionId,record:{tipo:'checkpoint',versioneGiro:1,fase:'ripresa',storia:[{role:'user',content:`task ${sessionId}`}],recordCompattazione:null}});
  for(let seq=1;seq<=events;seq+=1)sessionStore.registraRigaSync({cartellaStore:sessionsRoot,sessionId,record:{type:'TEXT_MESSAGE_CONTENT',delta:`chunk ${seq} of ${sessionId}`,_sequenza:seq}});
}

function fakeRegistry(rows:any[],sessionsRoot:string){return{
  ripristina:async()=>({}),
  /* Anchored to the journals, like the real restore: a journal that is gone is not a session. */
  elenca:()=>rows.filter((row:any)=>existsSync(join(sessionsRoot,`${row.sessionId}.jsonl`))),
  esporta:(id:string)=>rows.some((row:any)=>row.sessionId===id)?{schema:'talos.harness-ui.session-export.v1',sessionId:id,eventi:[{type:'A'},{type:'B'},{type:'C'}]}:null,
};}

function ctx(root:string,rows:any[],options:{refuseRuntime?:boolean}={}){
  const calls:{createRuntimeContext:number}={createRuntimeContext:0};
  const out:string[]=[];
  const build=()=>{calls.createRuntimeContext+=1;if(options.refuseRuntime)throw new Error('RUNTIME_MUST_NOT_BE_BUILT');return{registry:fakeRegistry(rows,join(root,'sessions')),runtime:{resume:async(id:string)=>id}};};
  const x={calls,out,ctx:{
    invocation:{outputFormat:'json'} as any,
    io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:root,
    paths:{dataRoot:join(root,'data'),sessionsRoot:join(root,'sessions')} as any,
    repoRoot:REPO_ROOT,
    createRuntimeContext:build,
  } as any};
  return x;
}
async function fixture(sessions:number){
  const root=await mkdtemp(join(tmpdir(),'talos-c4r-'));
  const sessionsRoot=join(root,'sessions');
  const rows:any[]=[];
  for(let i=0;i<sessions;i+=1){
    const id=`sess-${i}-${randomUUID().slice(0,8)}`;
    await writeJournal(sessionsRoot,id,new Date(T0+i*60_000).toISOString());
    rows.push({sessionId:id,avviataAlle:new Date(T0+i*60_000).toISOString(),conclusa:true,modello:'openrouter:vendor/live-model-a',progetto:'/tmp/project'});
  }
  await mkdir(join(root,'data'),{recursive:true});
  return{root,sessionsRoot,rows};
}

function rowsOf(out:string[]){return JSON.parse(out.at(-1)!);}

test('first session list takes the slow path and commits a metadata index',async()=>{const f=await fixture(2);try{
  const x=ctx(f.root,f.rows);
  await runSessionCommand(x.ctx,['list']);
  assert.equal(x.calls.createRuntimeContext,1,'the first list builds the runtime (slow path)');
  const view=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT});
  assert.equal(view.state,'fresh','the index committed by the first list is fresh');
  if(view.state==='fresh')assert.equal(view.rows.length,2);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('a fresh index serves session list without building the runtime and never reads a journal',async()=>{const f=await fixture(2);try{
  const first=ctx(f.root,f.rows);
  await runSessionCommand(first.ctx,['list']);
  const second=ctx(f.root,f.rows,{refuseRuntime:true});
  await runSessionCommand(second.ctx,['list']);
  assert.equal(second.calls.createRuntimeContext,0,'a fresh index must not build the runtime: the journals are read only behind it');
  assert.deepEqual(rowsOf(second.out),rowsOf(first.out),'the fast list returns the same rows');
}finally{await rm(f.root,{recursive:true,force:true});}});

test('the fast list still merges the live session metadata (name, tags, pinned)',async()=>{const f=await fixture(2);try{
  const first=ctx(f.root,f.rows);
  await runSessionCommand(first.ctx,['list']);
  const store=createSessionMetadataStore({rootDir:sessionMetadataRoot(join(f.root,'data'))});
  await store.setName(f.rows[0]!.sessionId,'my conversation');
  await store.addTag(f.rows[0]!.sessionId,'bench');
  await store.setPinned(f.rows[0]!.sessionId,true);
  const second=ctx(f.root,f.rows,{refuseRuntime:true});
  await runSessionCommand(second.ctx,['list']);
  const rows=rowsOf(second.out) as any[];
  const named=rows.find((row:any)=>row.sessionId===f.rows[0]!.sessionId)!;
  assert.equal(named.name,'my conversation');
  assert.deepEqual(named.tags,['bench']);
  assert.equal(named.pinned,true);
  const other=rows.find((row:any)=>row.sessionId===f.rows[1]!.sessionId)!;
  assert.equal(other.name,null);assert.deepEqual(other.tags,[]);assert.equal(other.pinned,false);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('a changed journal makes the next list slow again and the index is refreshed',async()=>{const f=await fixture(2);try{
  const first=ctx(f.root,f.rows);
  await runSessionCommand(first.ctx,['list']);
  sessionStore.registraRigaSync({cartellaStore:f.sessionsRoot,sessionId:f.rows[1]!.sessionId,record:{type:'TEXT_MESSAGE_CONTENT',delta:'a new event',_sequenza:99}});
  const second=ctx(f.root,f.rows);
  await runSessionCommand(second.ctx,['list']);
  assert.equal(second.calls.createRuntimeContext,1,'a changed journal must be replayed, not served stale');
  const third=ctx(f.root,f.rows,{refuseRuntime:true});
  await runSessionCommand(third.ctx,['list']);
  assert.equal(third.calls.createRuntimeContext,0,'the refreshed index serves the next list');
  assert.deepEqual(rowsOf(third.out),rowsOf(second.out));
}finally{await rm(f.root,{recursive:true,force:true});}});

test('a deleted journal leaves no ghost row and the index follows',async()=>{const f=await fixture(2);try{
  const first=ctx(f.root,f.rows);
  await runSessionCommand(first.ctx,['list']);
  await rm(join(f.sessionsRoot,`${f.rows[1]!.sessionId}.jsonl`));
  const second=ctx(f.root,f.rows);
  await runSessionCommand(second.ctx,['list']);
  assert.equal(second.calls.createRuntimeContext,1);
  assert.deepEqual((rowsOf(second.out) as any[]).map((row:any)=>row.sessionId),[f.rows[0]!.sessionId]);
  const third=ctx(f.root,f.rows,{refuseRuntime:true});
  await runSessionCommand(third.ctx,['list']);
  assert.equal(third.calls.createRuntimeContext,0);
  assert.deepEqual((rowsOf(third.out) as any[]).map((row:any)=>row.sessionId),[f.rows[0]!.sessionId]);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('a corrupt index file falls back to the slow path and is rewritten',async()=>{const f=await fixture(2);try{
  const first=ctx(f.root,f.rows);
  await runSessionCommand(first.ctx,['list']);
  await writeFile(sessionListIndexFile(join(f.root,'data'),f.sessionsRoot),'{not json', 'utf8');
  const second=ctx(f.root,f.rows);
  await runSessionCommand(second.ctx,['list']);
  assert.equal(second.calls.createRuntimeContext,1,'an unreadable index falls back to the slow path');
  const view=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT});
  assert.equal(view.state,'fresh','the fallback rewrote a valid index');
}finally{await rm(f.root,{recursive:true,force:true});}});

test('session search runs on the same fast path',async()=>{const f=await fixture(2);try{
  const first=ctx(f.root,f.rows);
  await runSessionCommand(first.ctx,['search',f.rows[1]!.sessionId.slice(0,12)]);
  assert.equal(first.calls.createRuntimeContext,1);
  const second=ctx(f.root,f.rows,{refuseRuntime:true});
  await runSessionCommand(second.ctx,['search',f.rows[1]!.sessionId.slice(0,12)]);
  assert.equal(second.calls.createRuntimeContext,0,'a fresh index serves search too');
  assert.deepEqual(rowsOf(second.out),rowsOf(first.out));
  assert.equal((rowsOf(second.out) as any[]).length,1);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('session show and session resume keep the full runtime path even with a fresh index',async()=>{const f=await fixture(2);try{
  const first=ctx(f.root,f.rows);
  await runSessionCommand(first.ctx,['list']);
  const show=ctx(f.root,f.rows);
  await runSessionCommand(show.ctx,['show',f.rows[0]!.sessionId]);
  assert.equal(show.calls.createRuntimeContext,1,'show builds the runtime: the full payload is read');
  assert.equal(rowsOf(show.out).eventCount,3,'the whole payload is still there');
  const resume=ctx(f.root,f.rows);
  await runSessionCommand(resume.ctx,['resume',f.rows[0]!.sessionId,'continue']);
  assert.equal(resume.calls.createRuntimeContext,1,'resume builds the runtime');
  assert.equal(rowsOf(resume.out).sessionId,f.rows[0]!.sessionId);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('the probe reads metadata only: index file and stats, never journal content',async()=>{const f=await fixture(3);try{
  // Make the journals visibly heavy: the probe must not care.
  for(const row of f.rows)await writeJournal(f.sessionsRoot,row.sessionId,new Date(T0).toISOString(),4000);
  const counters={bytesRead:0,statCalls:0};
  const fsp=await import('node:fs/promises');
  const deps={
    statFn:(p:string)=>{counters.statCalls+=1;return fsp.stat(p);},
    readFileFn:async(p:string,e?:any)=>{const body=await fsp.readFile(p,e);counters.bytesRead+=Buffer.byteLength(String(body),'utf8');return body;},
  };
  let journalBytes=0;for(const row of f.rows)journalBytes+=(await stat(join(f.sessionsRoot,`${row.sessionId}.jsonl`))).size;
  const firstView=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,deps});
  assert.equal(firstView.state,'stale','without a committed index the probe is stale');
  await commitSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,stamp:(firstView as any).stamp,rows:f.rows.map((row:any)=>({id:row.sessionId,sessionId:row.sessionId,startedAt:row.avviataAlle}))});
  const before=counters.bytesRead;
  const second=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,deps});
  assert.equal(second.state,'fresh');
  assert.equal((second as any).rows.length,3);
  assert.ok(counters.bytesRead-before<journalBytes/10,`the probe read ${counters.bytesRead-before} bytes, the journals are ${journalBytes}: no journal content may be read`);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('index entries are anchored to journals: a row without a journal is never persisted',async()=>{const f=await fixture(2);try{
  const counters={bytesRead:0};
  const fsp=await import('node:fs/promises');
  const deps={readFileFn:async(p:string,e?:any)=>{const body=await fsp.readFile(p,e);counters.bytesRead+=Buffer.byteLength(String(body),'utf8');return body;}};
  const view=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,deps});
  const phantom={...f.rows[0]!,sessionId:'phantom-session',id:'phantom-session'};
  await commitSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,stamp:(view as any).stamp,rows:[...f.rows,phantom]});
  const stored=JSON.parse(await readFile(sessionListIndexFile(join(f.root,'data'),f.sessionsRoot),'utf8'));
  assert.equal(stored.schema,SESSION_LIST_INDEX_SCHEMA);
  assert.equal(stored.entries['phantom-session'],undefined,'an unanchored row must not enter the index');
  const fresh=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,deps});
  assert.equal(fresh.state,'fresh');
  assert.equal(((fresh as any).rows as any[]).some((row:any)=>row.sessionId==='phantom-session'),false);
}finally{await rm(f.root,{recursive:true,force:true});}});

test('a quarantined journal is never served from the index',async()=>{const f=await fixture(2);try{
  const fsp=await import('node:fs/promises');
  const first=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT});
  assert.equal(first.state,'stale');
  await commitSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,stamp:(first as any).stamp,rows:f.rows});
  await writeFile(join(f.sessionsRoot,`.${f.rows[1]!.sessionId}.${randomUUID()}.quarantena`),'','utf8');
  const second=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT});
  assert.equal(second.state,'stale','the quarantine changes the live set of the store');
  await commitSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,stamp:(second as any).stamp,rows:f.rows});
  const third=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT});
  assert.equal(third.state,'fresh');
  assert.deepEqual(((third as any).rows as any[]).map((row:any)=>row.sessionId),[f.rows[0]!.sessionId],'the quarantined journal has no entry, exactly as the restore has always skipped it');
}finally{await rm(f.root,{recursive:true,force:true});}});

test('a failing index write never fails the list',async()=>{const f=await fixture(2);try{
  const counters={bytesRead:0};
  const fsp=await import('node:fs/promises');
  const deps={readFileFn:async(p:string,e?:any)=>{const body=await fsp.readFile(p,e);counters.bytesRead+=Buffer.byteLength(String(body),'utf8');return body;},writeAtomicFn:async()=>{throw new Error('disk full');}};
  const view=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,deps});
  const committed=await commitSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,stamp:(view as any).stamp,rows:f.rows,deps});
  assert.equal(committed,false,'a failed write is reported, never thrown');
  const x=ctx(f.root,f.rows);
  await runSessionCommand(x.ctx,['list']);
  assert.equal(x.calls.createRuntimeContext,1);
  assert.equal((rowsOf(x.out) as any[]).length,2);
}finally{await rm(f.root,{recursive:true,force:true});}});

/* Review A9: the warm search must behave exactly like the cold one for person-set fields. */
test('search matches person-set names and tags identically on the cold and the warm list',async()=>{const f=await fixture(2);try{
  const store=createSessionMetadataStore({rootDir:sessionMetadataRoot(join(f.root,'data'))});
  await store.setName(f.rows[0]!.sessionId,'quarterly report');
  await store.addTag(f.rows[1]!.sessionId,'finance');
  // COLD: no index yet — the slow path builds the runtime, then merges, then filters.
  const cold=ctx(f.root,f.rows);
  await runSessionCommand(cold.ctx,['search','quarterly']);
  assert.equal(cold.calls.createRuntimeContext,1,'the first search builds the runtime');
  assert.equal((rowsOf(cold.out) as any[]).length,1,'the person-set name matches on the cold list');
  // WARM: fresh index, no runtime — same query, same single result.
  const warm=ctx(f.root,f.rows,{refuseRuntime:true});
  await runSessionCommand(warm.ctx,['search','quarterly']);
  assert.equal(warm.calls.createRuntimeContext,0,'the fresh index serves the search');
  assert.deepEqual(rowsOf(warm.out),rowsOf(cold.out),'warm and cold must return the same rows for a name query');
  // Same parity for a tag, from a cold store again (index removed to force the slow path).
  await rm(sessionListIndexFile(join(f.root,'data'),f.sessionsRoot),{force:true});
  const coldTag=ctx(f.root,f.rows);
  await runSessionCommand(coldTag.ctx,['search','finance']);
  assert.equal(coldTag.calls.createRuntimeContext,1);
  assert.equal((rowsOf(coldTag.out) as any[]).length,1,'the person-set tag matches on the cold list');
  const warmTag=ctx(f.root,f.rows,{refuseRuntime:true});
  await runSessionCommand(warmTag.ctx,['search','finance']);
  assert.equal(warmTag.calls.createRuntimeContext,0);
  assert.deepEqual(rowsOf(warmTag.out),rowsOf(coldTag.out),'warm and cold must return the same rows for a tag query');
}finally{await rm(f.root,{recursive:true,force:true});}});

/* Review A2: the commit anchors rows to the stamp taken BEFORE they were computed. An append that
   happens between probe and commit makes the freshly written index stale again — it must never be
   served as fresh. This kills an implementation that re-stats the journals at commit time. */
test('the commit anchors rows to the stamp: an append between probe and commit is born stale',async()=>{const f=await fixture(2);try{
  const before=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT});
  assert.equal(before.state,'stale');
  // The slow path starts computing rows AFTER this stamp — meanwhile the journal grows.
  sessionStore.registraRigaSync({cartellaStore:f.sessionsRoot,sessionId:f.rows[1]!.sessionId,record:{type:'TEXT_MESSAGE_CONTENT',delta:'written after the stamp',_sequenza:50}});
  const committed=await commitSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,stamp:(before as any).stamp,rows:f.rows});
  assert.equal(committed,true,'the append does not block the commit itself');
  const after=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT});
  assert.equal(after.state,'stale','an index anchored to a pre-append stamp must not serve as fresh');
}finally{await rm(f.root,{recursive:true,force:true});}});

/* Review A2/V10: every mutation in the other tests is an append, which also changes the size — so
   an implementation matching ONLY the size would pass the whole suite. A same-length rewrite leaves
   the size untouched: only the mtimeMs arm of the stamp can detect it. */
test('a same-size journal rewrite is caught by the mtimeMs arm of the stamp',async()=>{const f=await fixture(1);try{
  const view=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT});
  assert.equal(view.state,'stale');
  await commitSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT,stamp:(view as any).stamp,rows:f.rows});
  const journal=join(f.sessionsRoot,`${f.rows[0]!.sessionId}.jsonl`);
  const body=await readFile(journal,'utf8');
  const reversed=f.rows[0]!.sessionId.split('').reverse().join('');
  const flipped=body.replace(`task ${f.rows[0]!.sessionId}`,`task ${reversed}`);
  assert.notEqual(flipped,body,'the rewrite must actually change the content');
  assert.equal(Buffer.byteLength(flipped,'utf8'),Buffer.byteLength(body,'utf8'),'the rewrite keeps the size identical on purpose');
  await writeFile(journal,flipped,'utf8');
  const after=await probeSessionListIndex({dataRoot:join(f.root,'data'),sessionsRoot:f.sessionsRoot,repoRoot:REPO_ROOT});
  assert.equal(after.state,'stale','same size, different mtime: the index must not serve as fresh');
}finally{await rm(f.root,{recursive:true,force:true});}});
