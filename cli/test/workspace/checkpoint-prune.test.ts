import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,readFile,utimes,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {autoPruneIfNeeded,pruneCheckpoints,pruneReportLine} from '../../src/workspace/checkpoint-prune.ts';

function ref(i:number){return `${String(i).padStart(3,'0')}${'a'.repeat(61)}`;}
function entry(r:string){return{kind:'file',source:'blob',ref:r,size:10,mode:438,executable:false};}
function record(id:string,createdAt:string,state:string,refs:{pre?:string[];post?:string[]}){
  const snapshot=(path:(string),rows:string[])=>({capturedAt:createdAt,workspace:{canonicalRoot:'C:\\w',identityHash:'w',gitRoot:null},entries:Object.fromEntries(rows.map(r=>[`${path}-${r.slice(0,4)}`,entry(r)]))});
  return{schema:'talos.cli.checkpoint.v1',id,operation:'start',sessionId:null,commandId:null,state,createdAt,finalizedAt:null,workspaceIdentityHash:'w',canonicalRoot:'C:\\w',
    pre:snapshot('f',refs.pre??[]),post:refs.post?snapshot('g',refs.post):null,writeEvidence:[],reversible:true,nonReversibleReason:null,finalizationError:null,transitions:[]};
}
async function fakeStore(root:string,records:{name:string;json:unknown}[],blobs:{ref:string;bytes:number}[],options?:{statRows?:unknown[][];transactionId?:string}){
  const rootDir=join(root,'checkpoints');
  const recordsDir=join(rootDir,'workspaces','w1','records');
  await mkdir(recordsDir,{recursive:true});
  await mkdir(join(rootDir,'blobs'),{recursive:true});
  for(const row of records)await writeFile(join(recordsDir,row.name),`${JSON.stringify(row.json)}\n`,'utf8');
  for(const blob of blobs)await writeFile(join(rootDir,'blobs',blob.ref),'x'.repeat(blob.bytes),'utf8');
  if(options?.statRows)await writeFile(join(rootDir,'workspaces','w1','stat-index.json'),`${JSON.stringify({schema:'talos.cli.checkpoint-stat-index.v1',rows:options.statRows})}\n`,'utf8');
  if(options?.transactionId)await writeFile(join(rootDir,'workspaces','w1','restore-transaction.json'),`${JSON.stringify({schema:'talos.cli.checkpoint-restore.v1',checkpointId:options.transactionId,direction:'undo',expectedFinalState:'complete',paths:[],createdAt:new Date().toISOString()})}\n`,'utf8');
  return rootDir;
}
function journal(count:number,opts?:{startDay?:number;base?:number}){const startDay=opts?.startDay??1,base=opts?.base??0;return Array.from({length:count},(_,index)=>({id:`${2000+base+index}-f47ac10b-58cc-4372-a567-0e02b2c3d4${(base+index)%10}`,createdAt:`2026-01-${String(startDay+index).padStart(2,'0')}T10:00:00.000Z`,state:'complete',refs:[ref(base+index+1)]}));}
async function writeJournal(rootDir:string,rows:{id:string;createdAt:string;state:string;refs:string[]}[]){
  const recordsDir=join(rootDir,'workspaces','w1','records');
  for(const row of rows)await writeFile(join(recordsDir,`${row.id}.json`),`${JSON.stringify(record(row.id,row.createdAt,row.state,{pre:row.refs}))}\n`,'utf8');
  await Promise.all(rows.map((row,index)=>writeFile(join(rootDir,'blobs',row.refs[0]??ref(index+1)),'x'.repeat(100),'utf8')));
}
/* The blobs of a pruned record are old in real life. Written a moment ago they can look born AFTER the prune's clock: on
   Windows a file's time is often ahead of Date.now() (measured on this PC, 1,369 writes in 1,500, up to 1.5 ms; on the
   public runner the clock is coarser), and `minAgeMs: 0` still keeps a blob whose age is below zero. That stopped
   two public runs in a row at the dry-run test (blobsDeleted 0 and 1 of 2, runs 45399037302 and 45407986939). A test
   that expects orphans collected therefore ages them first, as the grace-window test below already does: by one minute,
   far past any clock step and still inside the default one-hour grace, so these tests keep proving `minAgeMs: 0` is honored. */
async function ageBlobs(rootDir:string){
  const when=new Date(Date.now()-60*1000);
  for(const name of await readdir(join(rootDir,'blobs')))await utimes(join(rootDir,'blobs',name),when,when);
}

test('F-023: prune keeps the newest records and garbage-collects the blobs only they pinned',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-prune-'));
  const rows=journal(5);
  const rootDir=await fakeStore(root,[],rows.map((row,index)=>({ref:ref(index+1),bytes:100})));
  await writeJournal(rootDir,rows);
  await ageBlobs(rootDir);
  const report=await pruneCheckpoints({rootDir,keep:3,minAgeMs:0});
  assert.deepEqual(report.recordsDeleted.map(name=>name.split('/')[1]).sort(),[`${rows[0].id}.json`,`${rows[1].id}.json`]);
  assert.equal(report.recordsKept,3);
  assert.equal(report.blobsDeleted,2);
  assert.equal(report.bytesReclaimed,200);
  const blobs=await readdir(join(rootDir,'blobs'));
  assert.deepEqual(blobs.sort(),[ref(3),ref(4),ref(5)]);
});

test('F-023: dry run reports exactly what would go and deletes nothing',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-prune-dry-'));
  const rows=journal(3);
  const rootDir=await fakeStore(root,[],rows.map((row,index)=>({ref:ref(index+1),bytes:50})));
  await writeJournal(rootDir,rows);
  await ageBlobs(rootDir);
  const report=await pruneCheckpoints({rootDir,keep:1,dryRun:true,minAgeMs:0});
  assert.equal(report.dryRun,true);
  assert.equal(report.recordsDeleted.length,2);
  assert.equal(report.blobsDeleted,2);
  assert.equal((await readdir(join(rootDir,'blobs'))).length,3);
  assert.equal((await readdir(join(rootDir,'workspaces','w1','records'))).length,3);
  assert.match(pruneReportLine(report),/dry run: nothing written/u);
});

test('F-023: an open record and a record named by a pending restore transaction are never dropped',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-prune-prot-'));
  const rows=[{...journal(1)[0],state:'open'},{id:'2009-f47ac10b-58cc-4372-a567-0e02b2c3d49',createdAt:'2026-01-02T10:00:00.000Z',state:'complete',refs:[ref(2)]},...journal(4,{startDay:3,base:2})];
  const rootDir=await fakeStore(root,[],[],{transactionId:rows[1].id});
  await writeJournal(rootDir,rows);
  const report=await pruneCheckpoints({rootDir,keep:2,minAgeMs:0});
  assert.deepEqual(report.recordsDeleted.map(name=>name.split('/')[1]).sort(),[`${rows[2].id}.json`,`${rows[3].id}.json`]);
  const blobs=await readdir(join(rootDir,'blobs'));
  assert.ok(blobs.includes(ref(1)),'the open record keeps its blob');
  assert.ok(blobs.includes(ref(2)),'the transaction record keeps its blob');
});

test('F-023: --days drops stale records even inside the newest window (protected ones excepted)',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-prune-days-'));
  const rows=journal(3);
  const rootDir=await fakeStore(root,[],[]);
  await writeJournal(rootDir,rows);
  const report=await pruneCheckpoints({rootDir,keep:10,olderThanDays:1,now:new Date('2026-01-03T00:00:00Z')});
  assert.deepEqual(report.recordsDeleted,[`w1/${rows[0].id}.json`]);
});

test('F-023: stat-index rows for collected blobs are dropped, live and foreign rows stay',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-prune-stat-'));
  const rows=journal(2);
  const rootDir=await fakeStore(root,[],[],{statRows:[['a.txt',1,2,3,ref(1),4],['b.txt',1,2,3,ref(2),4],['c.txt',1,2,3,'0'.repeat(40),4]]});
  await writeJournal(rootDir,[rows[0]]);
  const report=await pruneCheckpoints({rootDir,keep:5});
  assert.equal(report.statRowsRemoved,1);
  const index=JSON.parse(await readFile(join(rootDir,'workspaces','w1','stat-index.json'),'utf8'));
  assert.deepEqual(index.rows.map((row:string[])=>row[0]),['a.txt','c.txt']);
});

test('F-023: only 64-hex names are collectable and a fresh blob is safe behind the grace window',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-prune-grace-'));
  const rows=journal(2);
  const rootDir=await fakeStore(root,[],[{ref:ref(9),bytes:10},{ref:ref(8),bytes:10}]);
  await writeJournal(rootDir,rows);
  await writeFile(join(rootDir,'blobs','notes.txt'),'hello','utf8');
  await utimes(join(rootDir,'blobs',ref(9)),new Date(Date.now()-2*60*60*1000),new Date(Date.now()-2*60*60*1000));
  const report=await pruneCheckpoints({rootDir,keep:5});
  assert.equal(report.blobsDeleted,1);
  assert.equal(report.blobsTotal,4);
  const blobs=await readdir(join(rootDir,'blobs'));
  assert.ok(blobs.includes(ref(1)),'the live record keeps its blob');
  assert.ok(blobs.includes(ref(2)),'the live record keeps its blob');
  assert.ok(blobs.includes(ref(9))===false,'aged orphan collected');
  assert.ok(blobs.includes(ref(8)),'fresh orphan survives the grace window');
  assert.ok(blobs.includes('notes.txt'),'a non-blob file is never touched');
});

test('F-023: an unparsable record is left alone and counted',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-prune-torn-'));
  const rows=journal(2);
  const rootDir=await fakeStore(root,[],[]);
  await writeJournal(rootDir,rows);
  await writeFile(join(rootDir,'workspaces','w1','records','torn.json'),'{"schema":','utf8');
  const report=await pruneCheckpoints({rootDir,keep:1});
  assert.equal(report.recordsUnparsable,1);
  assert.deepEqual(await readdir(join(rootDir,'workspaces','w1','records')),['torn.json',`${rows[1].id}.json`].sort());
});

test('F-023: autoPruneIfNeeded triggers past the cap and stays silent under it',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-prune-auto-'));
  const rows=journal(3);
  const rootDir=await fakeStore(root,[],[]);
  await writeJournal(rootDir,rows);
  assert.equal(await autoPruneIfNeeded({rootDir,maxRecords:10}),null);
  const report=await autoPruneIfNeeded({rootDir,maxRecords:2,keep:1});
  assert.equal(report?.recordsDeleted.length,2);
  assert.equal((await readdir(join(rootDir,'workspaces','w1','records'))).length,1);
});
