import {readFile,readdir,rename,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';

/* F-023 (audit 0.1.22, 2026-10-05) — the checkpoint store grows unbounded: nothing ever prunes a record, so every
   snapshot a record pins keeps its blobs alive for ever (measured live: 22 records pinned all 2,894 blobs, 0 orphans,
   287 MiB and rising; the 256 MiB `maxStoredBytes` is a per-capture budget, not a store cap).
   The retention rule: per workspace keep the newest `keep` records — an `open` record (a run that never finalized) and
   the record a pending restore transaction names are always kept. Records older than `olderThanDays` are dropped even
   when inside the newest window (never the protected ones). Then the blob store is garbage-collected: a blob is
   deleted only when no kept record and no kept stat-index row still names it. The stat index is pruned with the same
   rule (it is a cache: unreadable means empty, every file is read again), so a dead ref never survives there.
   Safety against a concurrent capture (blob written, record not yet): a blob younger than `minAgeMs` is never
   collected, and only 64-hex names are ever considered blobs. */

const BLOB_REF=/^[0-9a-f]{64}$/iu;
const DEFAULT_KEEP=20;
const DEFAULT_MIN_AGE_MS=60*60*1000;
const STAT_INDEX_SCHEMA='talos.cli.checkpoint-stat-index.v1';

export type PruneOptions={rootDir:string;keep?:number;olderThanDays?:number|null;dryRun?:boolean;minAgeMs?:number;now?:Date};
export type PruneReport={
  dryRun:boolean;
  keep:number;
  olderThanDays:number|null;
  recordsTotal:number;
  recordsKept:number;
  recordsDeleted:string[];
  recordsUnparsable:number;
  blobsTotal:number;
  blobsDeleted:number;
  bytesReclaimed:number;
  statIndexesRewritten:string[];
  statRowsRemoved:number;
};

function refsOfSnapshotEntries(record:unknown):Set<string>{
  const out=new Set<string>();
  for(const snap of [(record as any)?.pre,(record as any)?.post]){
    const entries=snap?.entries;
    if(!entries||typeof entries!=='object')continue;
    for(const key of Object.keys(entries)){
      const ref=(entries as any)[key]?.ref;
      if(typeof ref==='string'&&BLOB_REF.test(ref))out.add(ref.toLowerCase());
    }
  }
  return out;
}

async function readJsonIfExists(pathname:string):Promise<unknown|null>{
  try{return JSON.parse(await readFile(pathname,'utf8'));}catch{return null;}
}

async function listWorkspaces(workspacesDir:string):Promise<string[]>{
  try{return (await readdir(workspacesDir,{withFileTypes:true})).filter(row=>row.isDirectory()).map(row=>row.name);}
  catch(error:any){if(error?.code==='ENOENT')return[];throw error;}
}

export async function pruneCheckpoints(options:PruneOptions):Promise<PruneReport>{
  const rootDir=path.resolve(options.rootDir);
  const keep=Math.max(1,Math.trunc(options.keep??DEFAULT_KEEP));
  const olderThanDays=options.olderThanDays??null;
  const dryRun=options.dryRun??false;
  const minAgeMs=Math.max(0,options.minAgeMs??DEFAULT_MIN_AGE_MS);
  const cutoffMs=olderThanDays==null?null:(options.now??new Date()).getTime()-olderThanDays*24*60*60*1000;
  const report:PruneReport={dryRun,keep,olderThanDays,recordsTotal:0,recordsKept:0,recordsDeleted:[],recordsUnparsable:0,blobsTotal:0,blobsDeleted:0,bytesReclaimed:0,statIndexesRewritten:[],statRowsRemoved:0};
  const workspacesDir=path.join(rootDir,'workspaces'),blobsDir=path.join(rootDir,'blobs');
  const keptRefs=new Set<string>();
  for(const workspace of await listWorkspaces(workspacesDir)){
    const workspaceDir=path.join(workspacesDir,workspace),recordsDir=path.join(workspaceDir,'records');
    let names:string[]=[];
    try{names=(await readdir(recordsDir)).filter(name=>name.endsWith('.json'));}
    catch(error:any){if(error?.code!=='ENOENT')throw error;continue;}
    report.recordsTotal+=names.length;
    const parsed:{name:string;createdAt:string|null;state:string|null;refs:Set<string>}[]=[];
    for(const name of names){
      let value:unknown;
      try{value=JSON.parse(await readFile(path.join(recordsDir,name),'utf8'));}
      catch{report.recordsUnparsable+=1;continue;} /* torn or foreign: left alone, never deleted by prune */
      parsed.push({name,createdAt:typeof (value as any)?.createdAt==='string'?(value as any).createdAt:null,state:typeof (value as any)?.state==='string'?(value as any).state:null,refs:refsOfSnapshotEntries(value)});
    }
    const transaction=await readJsonIfExists(path.join(workspaceDir,'restore-transaction.json'));
    const protectedNames=new Set<string>();
    const txId=(transaction as any)?.checkpointId;
    if(typeof txId==='string'&&txId)protectedNames.add(`${txId}.json`);
    parsed.sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??'')||b.name.localeCompare(a.name));
    const keepNames=new Set<string>();
    parsed.forEach((row,index)=>{if(index<keep)keepNames.add(row.name);});
    for(const row of parsed)if(row.state==='open')keepNames.add(row.name);
    for(const name of protectedNames)if(parsed.some(row=>row.name===name))keepNames.add(name);
    if(cutoffMs!=null){
      for(const row of parsed){
        if(!keepNames.has(row.name)||row.state==='open'||protectedNames.has(row.name)||row.createdAt==null)continue;
        if(Date.parse(row.createdAt)<cutoffMs)keepNames.delete(row.name);
      }
    }
    for(const row of parsed){
      if(!keepNames.has(row.name))continue;
      report.recordsKept+=1;
      for(const ref of row.refs)keptRefs.add(ref);
    }
    for(const row of parsed){
      if(keepNames.has(row.name))continue;
      report.recordsDeleted.push(`${workspace}/${row.name}`);
      if(!dryRun)await rm(path.join(recordsDir,row.name),{force:true});
    }
    const indexPath=path.join(workspaceDir,'stat-index.json');
    let index:unknown;
    try{index=JSON.parse(await readFile(indexPath,'utf8'));}
    catch{continue;} /* missing or torn: capture already treats it as empty */
    const rows=(index as any)?.rows;
    if(!Array.isArray(rows))continue;
    /* A row survives when its ref is not a store blob we manage (git objects and other formats) or is still named by a
       kept record; rows for collected blobs are dropped so the next capture re-reads those files. */
    const keptRows=rows.filter((row:unknown)=>{const ref=(row as any)?.[4];return typeof ref!=='string'||!BLOB_REF.test(ref)||keptRefs.has(ref.toLowerCase());});
    const removed=rows.length-keptRows.length;
    if(removed<=0)continue;
    report.statRowsRemoved+=removed;
    report.statIndexesRewritten.push(path.relative(rootDir,indexPath));
    if(!dryRun){
      const temp=`${indexPath}.${process.pid}.prune.tmp`;
      await writeFile(temp,`${JSON.stringify({schema:(index as any)?.schema??STAT_INDEX_SCHEMA,rows:keptRows})}\n`,'utf8');
      await rename(temp,indexPath);
    }
  }
  let blobNames:string[]=[];
  try{blobNames=await readdir(blobsDir);}
  catch(error:any){if(error?.code!=='ENOENT')throw error;}
  const nowMs=(options.now??new Date()).getTime();
  for(const name of blobNames){
    if(!BLOB_REF.test(name))continue; /* only content-addressed blobs are ours to collect */
    report.blobsTotal+=1;
    if(keptRefs.has(name.toLowerCase()))continue;
    const full=path.join(blobsDir,name);
    let size=0,birthMs=0;
    try{const info=await stat(full);size=info.size;birthMs=info.mtimeMs;}
    catch{continue;} /* raced with another collector: not ours this round */
    if(nowMs-birthMs<minAgeMs)continue; /* grace: a capture may be mid-write with this blob */
    report.blobsDeleted+=1;
    report.bytesReclaimed+=size;
    if(!dryRun)await rm(full,{force:true});
  }
  return report;
}

/* The unattended hook (F-023: the store grew «senza che nessuno debba fare niente»): cheap record count per workspace,
   and only when a journal passes `maxRecords` does the real prune run. TALOS_CHECKPOINT_AUTO_PRUNE=0 disables it. */
export const AUTO_PRUNE_LIMITS={maxRecords:100,keep:50,minAgeMs:60*60*1000} as const;
export async function autoPruneIfNeeded({rootDir,maxRecords=AUTO_PRUNE_LIMITS.maxRecords,keep=AUTO_PRUNE_LIMITS.keep,minAgeMs=AUTO_PRUNE_LIMITS.minAgeMs}:{rootDir:string;maxRecords?:number;keep?:number;minAgeMs?:number}):Promise<PruneReport|null>{
  const workspacesDir=path.join(path.resolve(rootDir),'workspaces');
  for(const workspace of await listWorkspaces(workspacesDir)){
    let count=0;
    try{count=(await readdir(path.join(workspacesDir,workspace,'records'))).filter(name=>name.endsWith('.json')).length;}
    catch(error:any){if(error?.code!=='ENOENT')throw error;}
    if(count>maxRecords)return pruneCheckpoints({rootDir,keep,minAgeMs});
  }
  return null;
}

export function pruneReportLine(report:PruneReport):string{
  const parts=[
    `records ${report.recordsKept}/${report.recordsTotal} kept (${report.recordsDeleted.length} deleted`,
    report.recordsUnparsable?`, ${report.recordsUnparsable} unparsable left alone)`:')',
    `; blobs ${report.blobsTotal-report.blobsDeleted}/${report.blobsTotal} kept (${report.blobsDeleted} collected, ${(report.bytesReclaimed/1048576).toFixed(2)} MiB)`,
    report.statRowsRemoved?`; stat rows removed ${report.statRowsRemoved}`:'',
    report.dryRun?'. dry run: nothing written.':'.',
  ];
  return`prune: ${parts.join('')}`;
}
