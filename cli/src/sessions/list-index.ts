/*
 * C4R — session list metadata-only: a derived, rebuildable index of the session store.
 *
 * What it is: a VIEW of one sessions store, keyed by journal file stats (size, mtimeMs). The rows
 * it stores are exactly the rows the slow path (`ripristina()` + `elenca()` +
 * `normalizeSessionSummaries`) computed for the same journal bytes — nothing else. The journal
 * stays the single source of truth: any journal change (append, delete, corruption repair)
 * changes its (size, mtimeMs), the view is found stale, and the next list replays and rewrites it.
 * There is no write-time coupling with the journal writer: the store is an append-only JSONL
 * queue with a per-file write queue and no cross-file transaction, so a sidecar written "in the
 * same transaction" cannot exist on this medium — the rebuildable view is the honest option here,
 * per the C4R brief ("registro separato rigenerabile, oppure vista derivata ricostruibile").
 *
 * What it reads: `elencaSessioniPersistite` (readdir + stat, quarantine/pending aware) and one
 * stat per journal, plus this index file. NO journal content is ever opened here — the payload
 * and the whole history stay behind `ripristina()`, which only `session show`/`resume`/`export`
 * (and the slow list path) reach.
 *
 * What it never does: cache the absence of a session. A journal with no entry (corrupted, empty,
 * quarantined, future schema) keeps every list on the slow path, exactly as the unindexed CLI did,
 * so recovery and repair keep their chances on every run.
 */
import {createHash} from 'node:crypto';
import {chmod,mkdir,open,readFile,rename,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {importTalosModule} from '../runtime/repo.ts';

export const SESSION_LIST_INDEX_SCHEMA='talos.cli.session-list-index.v1';
/** A view that outgrows this budget is skipped, never written: the list keeps the slow path. */
export const SESSION_LIST_INDEX_MAX_BYTES=16*1024*1024;

export type SessionListIndexDeps={
  statFn?:(path:string)=>Promise<{size:number;mtimeMs:number}>;
  readFileFn?:(path:string,encoding:'utf8')=>Promise<string>;
  /** Atomic publish of the index file; overridden by tests that need a failing disk. */
  writeAtomicFn?:(file:string,body:string)=>Promise<void>;
  /** The store's own listing (readdir + stat + quarantine rules); defaults to session-store.mjs. */
  elencaSessioniFn?:(input:{cartellaStore:string;conDiagnostica:boolean})=>Promise<{sessionIds:string[];quarantined:Array<{sessionId:string;motivo:string}>}|string[]>;
};

export type SessionListIndexStamp={entries:Record<string,{size:number;mtimeMs:number}>};

export type SessionListIndexProbe=
  |{state:'fresh';rows:any[]}
  |{state:'stale';stamp:SessionListIndexStamp};

async function elencaSessioniDefault(repoRoot:string,cartellaStore:string){
  const store=await importTalosModule(repoRoot,'session-store.mjs') as any;
  return store.elencaSessioniPersistite({cartellaStore,conDiagnostica:true});
}

function sessionIdOf(value:unknown):string|null{
  return typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)&&!value.includes('..')?value:null;
}

/** One stat per journal + the store listing: the whole freshness decision, no journal content. */
type StampDeps=SessionListIndexDeps&{statFn:(path:string)=>Promise<{size:number;mtimeMs:number}>};
async function statStore(repoRoot:string,sessionsRoot:string,deps:StampDeps,{strict=false}:{strict?:boolean}={}){
  const listed:unknown=deps.elencaSessioniFn
    ?await deps.elencaSessioniFn({cartellaStore:sessionsRoot,conDiagnostica:true})
    :await elencaSessioniDefault(repoRoot,sessionsRoot);
  const rawIds:Array<unknown>=Array.isArray(listed)?listed:(listed as {sessionIds:unknown}).sessionIds as Array<unknown>;
  const ids=rawIds.map(sessionIdOf).filter((id):id is string=>id!==null);
  /* B2 (by entry): a journal whose name TALOS does not produce is not guessed at - the caller restores everything, as it always did. */
  if(strict&&ids.length!==rawIds.length)throw new Error('SESSION_LIST_INDEX_UNKNOWN_ID');
  const entries:SessionListIndexStamp['entries']={};
  for(const id of ids){
    // A stat that fails bubbles up: the probe answers stale, never a half-known freshness.
    // (By entry, a journal that vanished between the listing and the stat is simply not there any more.)
    let info:{size:number;mtimeMs:number};
    try{info=await deps.statFn(join(sessionsRoot,`${id}.jsonl`));}
    catch(error){if(strict&&(error as NodeJS.ErrnoException)?.code==='ENOENT')continue;throw error;}
    entries[id]={size:info.size,mtimeMs:info.mtimeMs};
  }
  return entries;
}

function freshFor(stamp:SessionListIndexStamp,stored:any){
  if(!stored||stored.schema!==SESSION_LIST_INDEX_SCHEMA)return false;
  const rows=stored.entries;
  if(!rows||typeof rows!=='object'||Array.isArray(rows))return false;
  const stampIds=Object.keys(stamp.entries);
  if(stampIds.length!==Object.keys(rows).length)return false;
  for(const [id,entry] of Object.entries(stamp.entries)){
    const row=rows[id];
    if(!row||typeof row!=='object')return false;
    if(row.size!==entry.size||row.mtimeMs!==entry.mtimeMs)return false;
    if(!row.row||typeof row.row!=='object')return false;
  }
  return true;
}

function indexFileFor(dataRoot:string,sessionsRoot:string){
  if(typeof dataRoot!=='string'||!dataRoot.trim())throw new Error('SESSION_LIST_INDEX_INVALID_ROOT');
  if(typeof sessionsRoot!=='string'||!sessionsRoot.trim())throw new Error('SESSION_LIST_INDEX_INVALID_ROOT');
  const key=createHash('sha256').update(resolve(sessionsRoot)).digest('hex').slice(0,32);
  return join(dataRoot,'session-list-index',`${key}.json`);
}

export function sessionListIndexFile(dataRoot:string,sessionsRoot:string){return indexFileFor(dataRoot,sessionsRoot);}

/** Reads the index and the store's file stats. Never throws: any doubt answers `stale`. */
export async function probeSessionListIndex({dataRoot,sessionsRoot,repoRoot,deps={}}:{dataRoot:string;sessionsRoot:string;repoRoot:string;deps?:SessionListIndexDeps}):Promise<SessionListIndexProbe>{
  const fsp=await import('node:fs/promises');
  const statFn=deps.statFn??((path:string)=>fsp.stat(path) as Promise<{size:number;mtimeMs:number}>);
  const readFileFn=deps.readFileFn??((path:string)=>readFile(path,'utf8'));
  try{
    const entries=await statStore(repoRoot,sessionsRoot,{statFn});
    const stamp:SessionListIndexStamp={entries};
    let stored:any=null;
    try{stored=JSON.parse(await readFileFn(indexFileFor(dataRoot,sessionsRoot),'utf8'));}catch{stored=null;}
    if(freshFor(stamp,stored)){
      const rows=(Object.values(stored.entries) as Array<{row:any}>).map((entry)=>entry.row);
      return{state:'fresh',rows:sortRows(rows)};
    }
    return{state:'stale',stamp};
  }catch(error){
    /* Review V8: a sick store used to degrade to stale in total silence, so the acceleration
       vanished forever without a trace. ENOENT stays quiet (first run; a journal gone between
       listing and stat); every other cause gets one stderr diagnostic line. */
    if((error as NodeJS.ErrnoException)?.code!=='ENOENT'){
      try{process.stderr.write(`[session-list-index] probe degraded to stale: ${(error as Error)?.message??String(error)}\n`);}catch{/* diagnostics never break the list */}
    }
    return{state:'stale',stamp:{entries:{}}};
  }
}

/** The summaries sort: ascending by startedAt, nulls first — the slow path's own order. */
export function sortSessionRows(rows:any[]){return sortRows(rows);}
function sortRows(rows:any[]){
  return [...rows].sort((a,b)=>{
    const x=typeof a?.startedAt==='string'?a.startedAt:null;
    const y=typeof b?.startedAt==='string'?b.startedAt:null;
    if(x===y)return 0;
    if(x===null)return-1;
    if(y===null)return 1;
    return x.localeCompare(y);
  });
}

async function writeAtomic(file:string,body:string){
  const dir=join(file,'..');
  await mkdir(dir,{recursive:true,mode:0o700});
  const temp=join(dir,`.${createHash('sha1').update(file).digest('hex').slice(0,12)}.${process.pid}.tmp`);
  // No fsync on purpose: this file is a rebuildable cache of journal stats, not person data —
  // a crash at worst loses the view, and the next list replays and rewrites it (stale by stamp).
  const handle=await open(temp,'w',0o600);
  try{await handle.writeFile(body,'utf8');}finally{await handle.close();}
  try{await rename(temp,file);}catch(error){await rm(temp,{force:true}).catch(()=>{});throw error;}
  try{await chmod(file,0o600);}catch{/* best effort on platforms without POSIX modes */}
}

/**
 * Persists the slow path's rows, anchored to the stamp taken BEFORE they were computed. A journal
 * that changes after the stamp is born stale again: the view can serve old rows only while the
 * journals are byte-identical to what produced them. Unanchored rows (no journal) are dropped:
 * every entry must point at a real journal stat. Returns false when nothing was written; never throws.
 */
export async function commitSessionListIndex({dataRoot,sessionsRoot,repoRoot,stamp,rows,deps={}}:{dataRoot:string;sessionsRoot:string;repoRoot:string;stamp:SessionListIndexStamp;rows:any[];deps?:SessionListIndexDeps}):Promise<boolean>{
  try{
    if(!stamp||typeof stamp!=='object'||!stamp.entries)return false;
    const byId=new Map(rows.map((row)=>[typeof row?.sessionId==='string'?row.sessionId:'',row]));
    const entries:Record<string,{size:number;mtimeMs:number;row:any}>={};
    for(const [id,stat] of Object.entries(stamp.entries)){
      const row=byId.get(id);
      if(!row)continue; // the slow path did not restore this journal: no entry, next list stays slow
      entries[id]={...stat,row};
    }
    const body=`${JSON.stringify({schema:SESSION_LIST_INDEX_SCHEMA,sessionsRoot:resolve(sessionsRoot),stamp,entries})}\n`;
    if(Buffer.byteLength(body,'utf8')>SESSION_LIST_INDEX_MAX_BYTES)return false;
    const write=deps.writeAtomicFn??writeAtomic;
    await write(indexFileFor(dataRoot,sessionsRoot),body);
    return true;
  }catch{
    return false;
  }
}

/**
 * Long-chat tappa B2 (owner 07/10/2026 night): the index read BY ENTRY. `probeSessionListIndex` is all-or-nothing - one changed journal makes the whole view
 * stale, so after any chat the next list replayed the whole archive. Here a row is fresh while ITS OWN journal's (size, mtimeMs) is the one that produced it;
 * the others (changed, new, or never indexed) are `staleIds`, for the caller to restore (their families) and recompute. `stamp` is the one to hand back to
 * `commitSessionListIndex`: taken before anything is restored, so a journal that changes afterwards is born stale. Any doubt about the index file (missing,
 * unreadable, another schema) is everything stale, never an error; a doubt about the STORE (a file name TALOS does not produce, an unreadable directory)
 * throws, and the caller falls back to restoring everything. Git's index (a stat cache per entry), Codex (state_db.rs list_threads_db, anchored pages) and
 * OpenCode (session.ts listGlobal, indexed query with a limit) do not list by replaying every session either.
 */
export type SessionListEntryProbe={rows:any[];staleIds:string[];stamp:SessionListIndexStamp};
export async function probeSessionListIndexByEntry({dataRoot,sessionsRoot,repoRoot,deps={}}:{dataRoot:string;sessionsRoot:string;repoRoot:string;deps?:SessionListIndexDeps}):Promise<SessionListEntryProbe>{
  const fsp=await import('node:fs/promises');
  const statFn=deps.statFn??((path:string)=>fsp.stat(path) as Promise<{size:number;mtimeMs:number}>);
  const readFileFn=deps.readFileFn??((path:string)=>readFile(path,'utf8'));
  const entries=await statStore(repoRoot,sessionsRoot,{...deps,statFn},{strict:true});
  const stamp:SessionListIndexStamp={entries};
  let stored:any=null;
  try{stored=JSON.parse(await readFileFn(indexFileFor(dataRoot,sessionsRoot),'utf8'));}catch{stored=null;}
  const rows:any[]=[];const staleIds:string[]=[];
  const trusted=stored&&stored.schema===SESSION_LIST_INDEX_SCHEMA&&stored.entries&&typeof stored.entries==='object'&&!Array.isArray(stored.entries);
  for(const [id,stat] of Object.entries(entries)){
    const entry=trusted?stored.entries[id]:null;
    if(entry&&typeof entry==='object'&&entry.size===stat.size&&entry.mtimeMs===stat.mtimeMs&&entry.row&&typeof entry.row==='object')rows.push(entry.row);
    else staleIds.push(id);
  }
  return{rows:sortRows(rows),staleIds,stamp};
}
