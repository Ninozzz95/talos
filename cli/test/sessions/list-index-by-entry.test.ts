/*
 * LONG-CHAT tappa B2 (owner 07/10/2026 night: «File indice accanto al journal», which turned out to exist already - C4R, list-index.ts - but all-or-nothing: ONE
 * journal changed made the whole view stale, so after any chat the next list restored the whole archive). The index is now also read BY ENTRY: a row is fresh
 * while its own journal's (size, mtimeMs) is what produced it; the stale ones (changed, new) are listed so the caller restores only those families.
 * Codex answers the same question with a state database and anchored pages (rollout/src/state_db.rs list_threads_db), OpenCode with an indexed query
 * and a limit (session.ts listGlobal); neither lists by replaying every session. Git's index (stat cache per entry) is the classic shape of the validity rule.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {appendFile,mkdir,mkdtemp,rename,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {commitSessionListIndex,probeSessionListIndexByEntry,sessionListIndexFile} from '../../src/sessions/list-index.ts';

const REPO_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','..','..');
const sessionStore=await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','session-store.mjs')).href);

const header=(sessionId:string)=>({tipo:'intestazione',schema:2,sessionId,taskId:null,cartella:'/tmp/project',task:null,avviataAlle:'2026-10-01T10:00:00.000Z'});
function journal(sessionsRoot:string,sessionId:string,events=2){
  sessionStore.registraRigaSync({cartellaStore:sessionsRoot,sessionId,record:header(sessionId)});
  for(let seq=1;seq<=events;seq+=1)sessionStore.registraRigaSync({cartellaStore:sessionsRoot,sessionId,record:{type:'TEXT_MESSAGE_CONTENT',delta:`chunk ${seq}`,_sequenza:seq}});
}
/* start times in the REVERSE order of the names, so that a list in listing order is visibly not a list in start order */
const STARTED:Record<string,string>={a1:'2026-10-03T10:00:00.000Z',b2:'2026-10-02T10:00:00.000Z',c3:'2026-10-01T10:00:00.000Z',d4:'2026-10-04T10:00:00.000Z'};
const row=(id:string)=>({id,sessionId:id,startedAt:STARTED[id]??'2026-10-01T10:00:00.000Z',name:`n-${id}`});
async function fixture(ids:string[]){
  const root=await mkdtemp(join(tmpdir(),'talos-b2-'));
  const sessionsRoot=join(root,'sessions');const dataRoot=join(root,'data');
  await mkdir(sessionsRoot,{recursive:true});await mkdir(dataRoot,{recursive:true});
  for(const id of ids)journal(sessionsRoot,id);
  return{root,sessionsRoot,dataRoot,args:{dataRoot,sessionsRoot,repoRoot:REPO_ROOT}};
}
async function warm(f:Awaited<ReturnType<typeof fixture>>,ids:string[]){
  const first=await probeSessionListIndexByEntry(f.args);
  assert.ok(await commitSessionListIndex({...f.args,stamp:first.stamp,rows:ids.map(row)}));
}

test('B2 without an index every journal is stale, none is fresh, and the stamp names them all',async()=>{
  const f=await fixture(['a1','b2','c3']);
  try{
    const probe=await probeSessionListIndexByEntry(f.args);
    assert.deepEqual(probe.rows,[]);
    assert.deepEqual([...probe.staleIds].sort(),['a1','b2','c3']);
    assert.deepEqual(Object.keys(probe.stamp.entries).sort(),['a1','b2','c3']);
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test('B2 after a commit nothing is stale and the rows come from the index',async()=>{
  const f=await fixture(['a1','b2','c3']);
  try{
    await warm(f,['a1','b2','c3']);
    const probe=await probeSessionListIndexByEntry(f.args);
    assert.deepEqual(probe.staleIds,[]);
    assert.deepEqual(probe.rows.map((r:any)=>r.id),['c3','b2','a1'],'in start order, like the slow path');
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test('B2 ONE changed journal makes only its own row stale (the old all-or-nothing view made all three stale)',async()=>{
  const f=await fixture(['a1','b2','c3']);
  try{
    await warm(f,['a1','b2','c3']);
    await appendFile(join(f.sessionsRoot,'b2.jsonl'),`${JSON.stringify({type:'TEXT_MESSAGE_CONTENT',delta:'more',_sequenza:99})}\n`);
    const probe=await probeSessionListIndexByEntry(f.args);
    assert.deepEqual(probe.staleIds,['b2']);
    assert.deepEqual(probe.rows.map((r:any)=>r.id).sort(),['a1','c3']);
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test('B2 a new journal is stale; a deleted one leaves no row and no ghost',async()=>{
  const f=await fixture(['a1','b2','c3']);
  try{
    await warm(f,['a1','b2','c3']);
    journal(f.sessionsRoot,'d4');
    await rm(join(f.sessionsRoot,'a1.jsonl'));
    const probe=await probeSessionListIndexByEntry(f.args);
    assert.deepEqual(probe.staleIds,['d4']);
    assert.deepEqual(probe.rows.map((r:any)=>r.id).sort(),['b2','c3']);
    assert.deepEqual(Object.keys(probe.stamp.entries).sort(),['b2','c3','d4']);
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test('B2 an unreadable index file is everything stale, never an error',async()=>{
  const f=await fixture(['a1','b2']);
  try{
    await warm(f,['a1','b2']);
    await writeFile(sessionListIndexFile(f.dataRoot,f.sessionsRoot),'{ not json');
    const probe=await probeSessionListIndexByEntry(f.args);
    assert.deepEqual(probe.rows,[]);
    assert.deepEqual([...probe.staleIds].sort(),['a1','b2']);
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test('B2 an index of another schema, or of another store, is not trusted',async()=>{
  const f=await fixture(['a1']);
  try{
    await warm(f,['a1']);
    const file=sessionListIndexFile(f.dataRoot,f.sessionsRoot);
    const stored=JSON.parse(await (await import('node:fs/promises')).readFile(file,'utf8'));
    await writeFile(file,JSON.stringify({...stored,schema:'talos.cli.session-list-index.v0'}));
    assert.deepEqual((await probeSessionListIndexByEntry(f.args)).staleIds,['a1']);
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test('B2 a store with a file name TALOS does not produce is not guessed at: the probe refuses, and the caller restores everything as before',async()=>{
  const f=await fixture(['a1']);
  try{
    await writeFile(join(f.sessionsRoot,'not a valid id!.jsonl'),`${JSON.stringify(header('x'))}\n`);
    await assert.rejects(()=>probeSessionListIndexByEntry(f.args),/SESSION_LIST_INDEX_UNKNOWN_ID/u);
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test('B2 a store that does not exist yet is an empty listing',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-b2-empty-'));
  try{
    const probe=await probeSessionListIndexByEntry({dataRoot:join(root,'data'),sessionsRoot:join(root,'sessions'),repoRoot:REPO_ROOT});
    assert.deepEqual(probe.rows,[]);assert.deepEqual(probe.staleIds,[]);assert.deepEqual(probe.stamp.entries,{});
  }finally{await rm(root,{recursive:true,force:true});}
});

test('B2 a committed row whose journal was replaced by another file of the same name (new size) is stale',async()=>{
  const f=await fixture(['a1','b2']);
  try{
    await warm(f,['a1','b2']);
    const target=join(f.sessionsRoot,'a1.jsonl');
    await rename(target,`${target}.old`);
    journal(f.sessionsRoot,'a1',7);
    const probe=await probeSessionListIndexByEntry(f.args);
    assert.deepEqual(probe.staleIds,['a1']);
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test('B2 an index entry without its row is stale, never a fresh row that is missing',async()=>{
  const f=await fixture(['a1','b2']);
  try{
    await warm(f,['a1','b2']);
    const file=sessionListIndexFile(f.dataRoot,f.sessionsRoot);
    const {readFile}=await import('node:fs/promises');
    const stored=JSON.parse(await readFile(file,'utf8'));
    delete stored.entries.a1.row;
    await writeFile(file,JSON.stringify(stored));
    const probe=await probeSessionListIndexByEntry(f.args);
    assert.deepEqual(probe.staleIds,['a1']);
    assert.deepEqual(probe.rows.map((r:any)=>r.id),['b2']);
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test('B2 a journal that vanishes between the listing and its stat is simply not there; any other stat error is not swallowed',async()=>{
  const f=await fixture(['a1','b2']);
  try{
    const real=(await import('node:fs/promises')).stat;
    const gone=async(path:string)=>{if(path.endsWith('b2.jsonl'))throw Object.assign(new Error('gone'),{code:'ENOENT'});return real(path) as any;};
    const probe=await probeSessionListIndexByEntry({...f.args,deps:{statFn:gone}});
    assert.deepEqual(probe.staleIds,['a1']);
    assert.deepEqual(Object.keys(probe.stamp.entries),['a1']);
    const broken=async(path:string)=>{if(path.endsWith('b2.jsonl'))throw Object.assign(new Error('denied'),{code:'EACCES'});return real(path) as any;};
    await assert.rejects(()=>probeSessionListIndexByEntry({...f.args,deps:{statFn:broken}}),/denied/u);
  }finally{await rm(f.root,{recursive:true,force:true});}
});

test('B2 a row is fresh only while BOTH the size and the modification time are the ones that produced it',async()=>{
  const f=await fixture(['a1','b2']);
  try{
    await warm(f,['a1','b2']);
    const file=sessionListIndexFile(f.dataRoot,f.sessionsRoot);
    const {readFile}=await import('node:fs/promises');
    const original=await readFile(file,'utf8');
    const changed=(edit:(stored:any)=>void)=>{const stored=JSON.parse(original);edit(stored);return writeFile(file,JSON.stringify(stored));};
    await changed(stored=>{stored.entries.a1.size+=1;});
    assert.deepEqual((await probeSessionListIndexByEntry(f.args)).staleIds,['a1'],'same time, other size');
    await changed(stored=>{stored.entries.b2.mtimeMs+=1;});
    assert.deepEqual((await probeSessionListIndexByEntry(f.args)).staleIds,['b2'],'same size, other time');
  }finally{await rm(f.root,{recursive:true,force:true});}
});
