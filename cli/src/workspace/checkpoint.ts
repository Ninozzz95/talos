import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {chmod,copyFile,lstat,mkdir,open,readFile,readdir,readlink,rename,rm,stat} from 'node:fs/promises';
import {realpathTolerant as realpath} from '../security/real-path.ts';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {resolveWorkspaceIdentity,type WorkspaceIdentity} from '../security/workspace-identity.ts';
import {RUNTIME_STATE_PREFIX} from '../security/project-resource-inventory.ts';
import {safeGitArgs} from './safe-git.ts';

export type CheckpointLimits={maxEntries:number;maxStoredBytes:number;maxStoredFileBytes:number};
export const CHECKPOINT_LIMITS:CheckpointLimits={maxEntries:50_000,maxStoredBytes:256*1024*1024,maxStoredFileBytes:64*1024*1024};
export type SnapshotFile={kind:'file';source:'git'|'blob';ref:string;size:number;mode:number;executable:boolean;gitPath?:string};
/* `directory`: on Windows a link to a folder must be recreated as a junction (or a directory link), not a file link. */
export type SnapshotSymlink={kind:'symlink';target:string;directory?:boolean};
export type SnapshotEntry=SnapshotFile|SnapshotSymlink;
export type GitSnapshot={root:string;head:string|null;indexHash:string|null;worktreeSemanticsHash:string};
export type NestedRepositoryCoverage={path:string;kind:'submodule'|'repository';covered:boolean;reason?:'too-large'|'too-deep'|'unsupported-entry'};
export type WorkspaceSnapshot={
  capturedAt:string;
  workspace:{canonicalRoot:string;identityHash:string;gitRoot:string|null};
  entries:Record<string,SnapshotEntry>;
  git:GitSnapshot|null;
  coverage:{tracked:boolean;untrackedNonIgnored:boolean;ignoredUntracked:boolean;gitMetadataRestored:boolean;nested?:NestedRepositoryCoverage[]};
  exclusions:string[];
  /* D1: the entries left out of this snapshot, and whether that list was cut at SKIPPED_LIST_MAX */
  skipped?:SkippedEntry[];skippedOverflow?:boolean;
  /* D1: the one sentence that says what /undo does not cover, for the person (the same as the last exclusion) */
  skippedSummary?:string;
};
export type WorkspaceWriteEvidence={path:string;existedBefore:boolean;beforeHash:string|null;afterHash:string|null};

/*
 * P18 (owner 2026-09-26: "TALOS più veloce di tutti"; the slow checkpoint to fix before the next release). Measured on the
 * hermetic bench (cli/scripts/bench-harness.ts): a `talos -p` turn in a plain folder of 6,000 small files took 39 s, and
 * 2.6 s in a git repository of the same size (Pi 1.25 s, Codex 0.5 s), because every turn captured the whole workspace
 * twice and, file by file, read it, hashed it, rewrote its blob (on Windows a rename REPLACES an existing blob) and made
 * it durable with two fsyncs (≈3.3 ms a file, 19.7 s for 6,000). The coverage stays the same (the whole workspace, what a
 * shell changed included) and so does durability (every new blob synced before the record is written); what changes:
 *   - a stat index per workspace, like git's index (OpenCode `snapshot/index.ts:149` and Hermes
 *     `tools/checkpoint_manager.py:565` get it through `git add` into a shadow repository): a file whose size, mtime and
 *     ctime are those of the last capture reuses that blob without being read. Git's "racily clean" rule: a file changed
 *     within RACY_MARGIN_MS of the capture that saw it is read again. A restore still checks each blob's sha256;
 *   - a blob already stored is not written again;
 *   - new blobs are written, then synced 16 at a time, with one directory sync;
 *   - a regular file's containment is checked through its folder's realpath, once per folder (a symlink keeps its own).
 */
export type StatRow={size:number;mtimeMs:number;ctimeMs:number;ref:string;verifiedAtMs:number};
export type StatCache={previous:ReadonlyMap<string,StatRow>;next:Map<string,StatRow>};
const RACY_MARGIN_MS=2_000,BLOB_SYNC_BATCH=16,CAPTURE_CONCURRENCY=32;
/* Runs `fn` over `items` with at most `limit` in flight and returns the results in the items' order. */
async function inOrder<T,R>(items:readonly T[],limit:number,fn:(item:T)=>Promise<R>):Promise<R[]>{
  const out:R[]=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i]!);}}));
  return out;
}
type CaptureInput={projectRoot:string;blobRoot:string;limits?:CheckpointLimits;statCache?:StatCache};
type CaptureBudget={entries:number;storedBytes:number;limits:CheckpointLimits;startedAtMs:number;blobs:Set<string>;pending:string[];dirs:Map<string,string>;cache:StatCache|null;skipped:SkippedEntry[];overflow:boolean};

function coded(code:string,message=code,details:Record<string,unknown>={}):Error{return Object.assign(new Error(message===code?code:`${code}: ${message}`),{code,details});}
function sha256(data:string|Buffer){return createHash('sha256').update(data).digest('hex');}
function slash(value:string){return value.split(path.sep).join('/');}
function safeRelative(value:string):string{
  const normalized=value.replace(/\\/gu,'/');
  if(!normalized||normalized.startsWith('/')||normalized.split('/').some(part=>!part||part==='.'||part==='..'))throw coded('CHECKPOINT_PATH_INVALID');
  return normalized;
}
function absoluteFromRelative(root:string,relative:string){return path.resolve(root,...safeRelative(relative).split('/'));}
function inside(root:string,candidate:string){const relative=path.relative(root,candidate);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));}
/*
 * R0 (2026-09-23). A file is made durable through a WRITABLE handle: FlushFileBuffers needs GENERIC_WRITE, so on Windows
 * `open(path,'r')` + `sync()` is EPERM and every checkpoint undo/redo failed (exit 70) before restoring anything. POSIX
 * accepts fsync on a read-only descriptor, which keeps a file already chmod-ed read-only syncable there. A file fsync
 * error is never swallowed (gate E8/E9); only the directory step below is tolerated on win32.
 */
export async function durableFile(pathname:string){
  let handle;
  try{handle=await open(pathname,'r+');}
  catch(error:any){if(process.platform==='win32'||(error?.code!=='EACCES'&&error?.code!=='EPERM'))throw error;handle=await open(pathname,'r');}
  try{await handle.sync();}finally{await handle.close();}
}
async function durableDir(dirname:string){try{const handle=await open(dirname,'r');try{await handle.sync();}finally{await handle.close();}}catch(error){if(process.platform!=='win32')throw error;}}
async function ensurePrivateDir(dirname:string){await mkdir(dirname,{recursive:true,mode:0o700});try{await chmod(dirname,0o700);}catch(error){if(process.platform!=='win32')throw error;}}
async function storeBlob(blobRoot:string,data:Buffer,budget:CaptureBudget):Promise<string>{
  const hash=sha256(data),target=path.join(blobRoot,hash);
  if(budget.blobs.has(hash))return hash;
  const temp=path.join(blobRoot,`.${hash}.${process.pid}.tmp`);
  try{const handle=await open(temp,'wx',0o600);try{await handle.writeFile(data);}finally{await handle.close();}await rename(temp,target).catch(async(error:any)=>{if(error?.code==='EEXIST'){await rm(temp,{force:true});return;}throw error;});}catch(error:any){if(error?.code!=='EEXIST')throw error;}
  budget.blobs.add(hash);budget.pending.push(target);
  return hash;
}
/* Every blob written by this capture is durable before the capture returns (and so before its record is written); a sync
   error is never swallowed (gate E8/E9). */
async function syncNewBlobs(blobRoot:string,budget:CaptureBudget){
  if(budget.pending.length===0)return;
  for(let i=0;i<budget.pending.length;i+=BLOB_SYNC_BATCH)await Promise.all(budget.pending.slice(i,i+BLOB_SYNC_BATCH).map(durableFile));
  budget.pending=[];await durableDir(blobRoot);
}
async function assertFileContained(workspace:WorkspaceIdentity,absolute:string,budget:CaptureBudget){
  const dir=path.dirname(absolute);let canonical=budget.dirs.get(dir);
  if(canonical===undefined){canonical=await realpath(dir);budget.dirs.set(dir,canonical);}
  if(!inside(workspace.canonicalRoot,canonical))throw coded('CHECKPOINT_PATH_ESCAPE',`Checkpoint path escapes workspace: ${absolute}`);
}
/*
 * D1 (stress test 03/10, owner «Mai bloccare, copertura dichiarata»): /undo never stops a tool. Measured in the owner's
 * session (the Downloads folder, with zip archives and installers in it): every write, command, test, delegation, note and task was refused with
 * CHECKPOINT_FILE_TOO_LARGE, after the person had approved them, and a restart did not help. Now a file over a limit is
 * left out of the snapshot and said: one bigger than maxStoredFileBytes, one that would pass maxStoredBytes, one past
 * maxEntries, one that is not a file, folder or link. The rest is captured. Codex leaves untracked files over 10 MiB out of
 * its ghost snapshot (`ghost_snapshot.ignore_large_untracked_files`, issues #7067/#7405); Claude Code's /rewind covers only
 * what its edit tools wrote. A path left out of either snapshot is never written or removed by a restore
 * (`untouchablePath`); past SKIPPED_LIST_MAX names the snapshot is marked partial and a restore touches only paths both
 * snapshots hold.
 */
export type SkippedEntry={path:string;reason:'too-large'|'over-budget'|'too-many'|'special';size?:number};
export const SKIPPED_LIST_MAX=10_000;
function skip(budget:CaptureBudget,relative:string,reason:SkippedEntry['reason'],size?:number):null{
  if(budget.skipped.length<SKIPPED_LIST_MAX)budget.skipped.push({path:relative,reason,...(size!==undefined?{size}:{})});else budget.overflow=true;
  return null;
}
function fileOverBudget(budget:CaptureBudget,size:number):SkippedEntry['reason']|null{
  if(size>budget.limits.maxStoredFileBytes)return'too-large';
  if(budget.storedBytes+size>budget.limits.maxStoredBytes)return'over-budget';
  budget.storedBytes+=size;return null;
}
function entryAllowed(budget:CaptureBudget):boolean{if(budget.entries>=budget.limits.maxEntries)return false;budget.entries+=1;return true;}
const MB=(bytes:number)=>`${(bytes/1024/1024).toFixed(1)} MB`;
function skippedExclusions(budget:CaptureBudget):string[]{
  if(!budget.skipped.length&&!budget.overflow)return[];
  const why=(row:SkippedEntry)=>row.reason==='too-large'?`${MB(row.size??0)}, over the ${MB(budget.limits.maxStoredFileBytes)} limit for one file`
    :row.reason==='over-budget'?`${MB(row.size??0)}, past the ${MB(budget.limits.maxStoredBytes)} limit for one snapshot`
    :row.reason==='too-many'?`past the ${budget.limits.maxEntries} entries of one snapshot`:'not a file, folder or link';
  const shown=budget.skipped.slice(0,5).map(row=>`${row.path} (${why(row)})`).join('; ');
  const more=budget.skipped.length-5+(budget.overflow?1:0);
  return[`${budget.skipped.length}${budget.overflow?'+':''} workspace entries are outside rollback coverage: ${shown}${more>0?`; and ${budget.overflow?'more':`${more} more`}`:''}.`];
}
/** A path /undo must not write or remove: left out of either snapshot, or absent from one of two partial snapshots. */
export function untouchablePath(left:WorkspaceSnapshot,right:WorkspaceSnapshot):(relative:string)=>boolean{
  const out=new Set([...(left.skipped??[]),...(right.skipped??[])].map(row=>row.path));
  const partial=Boolean(left.skippedOverflow||right.skippedOverflow);
  return relative=>out.has(relative)||(partial&&(!left.entries[relative]||!right.entries[relative]));
}
/* Git sicuro: a folder that cannot say which commands it brings is read as a folder with no repository (nothing of it runs) */
async function checkedGitArgs(cwd:string):Promise<readonly string[]>{
  const safe=await safeGitArgs(cwd);if(safe===null)throw coded('CHECKPOINT_GIT_READ_FAILED','Git could not read this folder\'s configuration.');
  return safe;
}
async function gitBytes(cwd:string,args:string[],maxBytes=64*1024*1024,allowedExitCodes:readonly number[]=[0],stdin?:Buffer):Promise<Buffer>{
  const safe=await checkedGitArgs(cwd);
  return new Promise((resolve,reject)=>{
    const child=spawn('git',[...safe,'-c','core.quotepath=false',...args],{cwd,stdio:[stdin?'pipe':'ignore','pipe','pipe'],windowsHide:true});
    const out:Buffer[]=[];const err:Buffer[]=[];let total=0;const stdout=child.stdout,stderr=child.stderr;
    if(!stdout||!stderr){reject(coded('CHECKPOINT_GIT_PIPE_UNAVAILABLE'));return;}
    stdout.on('data',(chunk:Buffer)=>{total+=chunk.length;if(total>maxBytes){child.kill();reject(coded('CHECKPOINT_GIT_OUTPUT_TOO_LARGE'));return;}out.push(chunk);});
    stderr.on('data',(chunk:Buffer)=>err.push(chunk));
    child.on('error',reject);if(stdin){child.stdin?.end(stdin);}
    child.on('close',code=>{if(code!==null&&allowedExitCodes.includes(code))resolve(Buffer.concat(out));else reject(coded('CHECKPOINT_GIT_READ_FAILED',Buffer.concat(err).toString('utf8').trim()||`git exited ${code}`));});
  });
}
async function gitText(cwd:string,args:string[],maxBytes=64*1024*1024){return (await gitBytes(cwd,args,maxBytes)).toString('utf8');}
function nulList(buffer:Buffer){return buffer.toString('utf8').split('\0').filter(Boolean);}
async function gitHead(gitRoot:string):Promise<string|null>{try{return (await gitText(gitRoot,['rev-parse','--verify','HEAD'],1024)).trim()||null;}catch{return null;}}
async function gitIndexHash(gitRoot:string):Promise<string|null>{
  let raw:string;try{raw=(await gitText(gitRoot,['rev-parse','--git-path','index'],16*1024)).trim();}catch{return null;}
  if(!raw)return null;const indexPath=path.isAbsolute(raw)?raw:path.resolve(gitRoot,raw);
  try{return sha256(await readFile(indexPath));}catch(error:any){if(error?.code==='ENOENT')return null;throw error;}
}
async function assertExistingPathContained(workspace:WorkspaceIdentity,absolute:string){
  const canonical=await realpath(absolute);
  if(!inside(workspace.canonicalRoot,canonical))throw coded('CHECKPOINT_PATH_ESCAPE',`Checkpoint path escapes workspace: ${absolute}`);
}
/*
 * C-007 (benchmark ticket, owner 01/10 «link salvati come link»). A link is kept as a LINK: its text, never followed, nothing
 * read outside the project. A venv's `bin/python -> /usr/bin/python3` or a dangling `libpcre.so` failed the whole capture
 * (CHECKPOINT_SYMLINK_ESCAPE) and with it a finished run. Restoring puts the same link back (restore.ts), which is what git
 * does for Codex's ghost commits and OpenCode's snapshots (`core.symlinks=true`); the link existed before, so recreating it
 * opens nothing new, and restore replaces a link without following it. On Windows only, the target's kind is read (a folder
 * link must come back as a junction); a dangling link is a file link.
 */
async function captureLink(absolute:string):Promise<SnapshotSymlink>{
  const target=await readlink(absolute);
  if(process.platform!=='win32')return{kind:'symlink',target};
  let directory=false;try{directory=(await stat(absolute)).isDirectory();}catch{/* dangling: a file link */}
  return{kind:'symlink',target,...(directory?{directory:true}:{})};
}
async function captureActualFile(workspace:WorkspaceIdentity,absolute:string,relative:string,blobRoot:string,budget:CaptureBudget,indexExecutable=false):Promise<SnapshotEntry|null>{
  /* 0.6.6 (LinkedIn capture of 0.6.5: «Checkpoint · 1 file: .talos/processi-sfondo/call_bg_1.log (added)»): the logs the kernel
     writes for background commands are TALOS's runtime state, not the person's work. In neither snapshot, a checkpoint does not
     list them and /undo never removes the log of a command that may still be running (restore.ts touches only snapshot paths). */
  if(relative.startsWith(RUNTIME_STATE_PREFIX))return null;
  let stat;try{stat=await lstat(absolute);}catch(error:any){if(error?.code==='ENOENT')return null;throw error;}
  if(!entryAllowed(budget))return skip(budget,relative,'too-many');
  if(stat.isSymbolicLink())return captureLink(absolute);
  if(!stat.isFile())return skip(budget,relative,'special');
  await assertFileContained(workspace,absolute,budget);
  const over=fileOverBudget(budget,stat.size);if(over)return skip(budget,relative,over,stat.size);
  const seen=budget.cache?.previous.get(relative);
  const unchanged=Boolean(seen&&seen.size===stat.size&&seen.mtimeMs===stat.mtimeMs&&seen.ctimeMs===stat.ctimeMs
    &&stat.mtimeMs<seen.verifiedAtMs-RACY_MARGIN_MS&&stat.ctimeMs<seen.verifiedAtMs-RACY_MARGIN_MS&&budget.blobs.has(seen.ref));
  const ref=unchanged?seen!.ref:await storeBlob(blobRoot,await readFile(absolute),budget);
  budget.cache?.next.set(relative,{size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs,ref,verifiedAtMs:budget.startedAtMs});
  const executable=process.platform==='win32'?indexExecutable:Boolean(stat.mode&0o111);return{kind:'file',source:'blob',ref,size:stat.size,mode:stat.mode&0o777,executable};
}
/*
 * R2 (incident CLI-INC-GITLINK-20260929, owner decision 2026-09-30 «Copertura completa»). A submodule (a gitlink, mode 160000,
 * gitsubmodules(7)) or an untracked repository inside the workspace (`ls-files --others` prints it as `dir/`, and git does not
 * look inside it) used to throw here, and the runtime then refused every mutating tool until restart. Their files are now
 * captured as file bytes (`source:'blob'`, the superproject's object database does not hold them), listed by the nested
 * repository's own index and ignore rules, so /undo restores them; their Git history (commits, index, refs) is not restored and
 * is declared. Codex (`git-utils/src/baseline.rs`) covers them by walking the disk; Hermes, OpenCode and Cline keep only the
 * gitlink, and nobody blocks. One that does not fit the limits left after the workspace itself is left out on its own and
 * declared: the top-level limits stay fail-closed. A link is kept as a link (C-007, `captureLink`).
 */
const NESTED_MAX_DEPTH=8;
type NestedJob={relative:string;kind:'submodule'|'repository';depth:number};
type NestedListing={files:{relative:string;executable:boolean}[];children:NestedJob[]};
async function ownRepositoryRoot(absolute:string):Promise<boolean>{
  let top:string;try{top=(await gitText(absolute,['rev-parse','--show-toplevel'],16*1024)).trim();}catch{return false;}
  if(!top)return false;try{return path.relative(await realpath(top),await realpath(absolute))==='';}catch{return false;}
}
async function listNested(job:NestedJob,absolute:string):Promise<NestedListing>{
  const files=new Map<string,boolean>(),children:NestedJob[]=[];const child=(relative:string,kind:NestedJob['kind'])=>children.push({relative:`${job.relative}/${relative}`,kind,depth:job.depth+1});
  if(await ownRepositoryRoot(absolute)){
    const [trackedRaw,othersRaw]=await Promise.all([gitBytes(absolute,['ls-files','-s','-z']),gitBytes(absolute,['ls-files','--others','--exclude-standard','-z'])]);
    for(const row of nulList(trackedRaw)){const tab=row.indexOf('\t');if(tab<0)throw coded('CHECKPOINT_GIT_INDEX_INVALID');const mode=row.slice(0,tab).split(' ')[0],gitPath=safeRelative(row.slice(tab+1));
      if(mode==='160000')child(gitPath,'submodule');else files.set(gitPath,(files.get(gitPath)??false)||mode==='100755');}
    for(const raw of nulList(othersRaw)){if(raw.endsWith('/'))child(safeRelative(raw.slice(0,-1)),'repository');else if(!files.has(raw))files.set(safeRelative(raw),false);}
  }else{
    /* Not a repository of its own (an uninitialized submodule's folder): every file in it, `.git` left out. */
    async function walk(dirname:string,relativeDir:string){
      for(const row of await readdir(dirname,{withFileTypes:true})){if(row.name==='.git')continue;const relative=relativeDir?`${relativeDir}/${row.name}`:row.name;
        if(row.isDirectory())await walk(path.join(dirname,row.name),relative);else files.set(safeRelative(relative),false);}
    }
    await walk(absolute,'');
  }
  return{files:[...files].map(([relative,executable])=>({relative,executable})).sort((a,b)=>a.relative.localeCompare(b.relative)),children:children.sort((a,b)=>a.relative.localeCompare(b.relative))};
}
async function captureNested(workspace:WorkspaceIdentity,blobRoot:string,budget:CaptureBudget,jobs:readonly NestedJob[],entries:Record<string,SnapshotEntry>,rows:NestedRepositoryCoverage[]){
  for(const job of [...jobs].sort((a,b)=>a.relative.localeCompare(b.relative))){
    const absolute=absoluteFromRelative(workspace.canonicalRoot,job.relative);
    let stat;try{stat=await lstat(absolute);}catch(error:any){if(error?.code==='ENOENT'){rows.push({path:job.relative,kind:job.kind,covered:true});continue;}throw error;}
    if(!stat.isDirectory()){const entry=await captureActualFile(workspace,absolute,job.relative,blobRoot,budget);if(entry)entries[job.relative]=entry;rows.push({path:job.relative,kind:job.kind,covered:true});continue;}
    await assertExistingPathContained(workspace,absolute);
    if(job.depth>NESTED_MAX_DEPTH){rows.push({path:job.relative,kind:job.kind,covered:false,reason:'too-deep'});continue;}
    const listing=await listNested(job,absolute);
    /* Preflight against what the workspace left of the limits: nothing of this repository is stored unless all of it fits. */
    let count=0,bytes=0,reason:NestedRepositoryCoverage['reason']|null=null;
    for(const file of listing.files){
      let row;try{row=await lstat(path.join(absolute,...file.relative.split('/')));}catch(error:any){if(error?.code==='ENOENT')continue;throw error;}
      count+=1;if(row.isSymbolicLink())continue;if(!row.isFile()){reason='unsupported-entry';break;}
      if(row.size>budget.limits.maxStoredFileBytes){reason='too-large';break;}bytes+=row.size;
    }
    if(!reason&&(budget.entries+count>budget.limits.maxEntries||budget.storedBytes+bytes>budget.limits.maxStoredBytes))reason='too-large';
    if(reason){rows.push({path:job.relative,kind:job.kind,covered:false,reason});continue;}
    const captured=await inOrder(listing.files,CAPTURE_CONCURRENCY,file=>captureActualFile(workspace,path.join(absolute,...file.relative.split('/')),`${job.relative}/${file.relative}`,blobRoot,budget,file.executable));
    listing.files.forEach((file,i)=>{const entry=captured[i];if(entry)entries[`${job.relative}/${file.relative}`]=entry;});
    rows.push({path:job.relative,kind:job.kind,covered:true});
    await captureNested(workspace,blobRoot,budget,listing.children,entries,rows);
  }
}
const NESTED_REASON_TEXT={'too-large':'it does not fit the checkpoint limits','too-deep':`it is more than ${NESTED_MAX_DEPTH} nested repositories deep`,'unsupported-entry':'it holds an entry that is not a file, folder or symlink'};
function nestedExclusions(rows:readonly NestedRepositoryCoverage[]):string[]{
  return rows.map(row=>{const noun=row.kind==='submodule'?'submodule':'nested repository';
    return row.covered?`Git history of ${noun} ${row.path} (commits, index, refs) is outside rollback coverage; its files are covered.`:`${noun[0]!.toUpperCase()}${noun.slice(1)} ${row.path} is outside rollback coverage: ${NESTED_REASON_TEXT[row.reason!]}.`;});
}
async function captureGit(workspace:WorkspaceIdentity,blobRoot:string,budget:CaptureBudget):Promise<WorkspaceSnapshot>{
  const gitRoot=workspace.gitRoot!;const prefix=slash(path.relative(gitRoot,workspace.canonicalRoot));const scope=prefix?['--',prefix]:[];
  const [trackedRaw,dirtyRaw,untrackedRaw,flagsRaw,head,indexHash,conversionConfig]=await Promise.all([
    gitBytes(gitRoot,['ls-files','-s','-z',...scope]),
    gitBytes(gitRoot,['diff','--name-only','-z',...scope]),
    gitBytes(gitRoot,['ls-files','--others','--exclude-standard','-z',...scope]),
    gitBytes(gitRoot,['ls-files','-v','-z',...scope]),gitHead(gitRoot),gitIndexHash(gitRoot),
    gitBytes(gitRoot,['config','--null','--get-regexp','^(core\\.autocrlf|core\\.eol|filter\\.)'],64*1024*1024,[0,1]),
  ]);
  const trackedRows=nulList(trackedRaw);const trackedPaths=trackedRows.map(row=>{const tab=row.indexOf('\t');if(tab<0)throw coded('CHECKPOINT_GIT_INDEX_INVALID');return row.slice(tab+1);});
  const attributeInput=Buffer.from(trackedPaths.map(value=>`${value}\0`).join(''),'utf8');
  const attributeState=await gitBytes(gitRoot,['check-attr','-a','-z','--stdin'],64*1024*1024,[0],attributeInput);
  const worktreeSemanticsHash=sha256(Buffer.concat([conversionConfig,Buffer.from([0]),attributeState]));
  const dirty=new Set(nulList(dirtyRaw));
  for(const row of nulList(flagsRaw)){const space=row.indexOf(' ');if(space<=0)continue;const flag=row.slice(0,space),name=row.slice(space+1);if(flag!==flag.toUpperCase()||flag==='S')dirty.add(name);}
  const entries:Record<string,SnapshotEntry>={};
  const seen=new Set<string>();
  /* The index is validated first, in order (unmerged, duplicate: the first bad row decides), then the files are looked at
     CAPTURE_CONCURRENCY at a time and their entries stored in index order. A gitlink (R2) becomes a nested job. */
  const jobs:{relative:string;absolute:string;mode:string;oid:string;gitPath:string}[]=[];const nestedJobs:NestedJob[]=[];
  for(const row of trackedRows){
    const tab=row.indexOf('\t');if(tab<0)throw coded('CHECKPOINT_GIT_INDEX_INVALID');const meta=row.slice(0,tab).split(' ');const gitPath=row.slice(tab+1);
    if(meta.length<3||meta[2]!=='0')throw coded('CHECKPOINT_GIT_UNMERGED','Unmerged Git index state is not checkpointable safely.');
    const mode=meta[0]!,oid=meta[1]!; if(seen.has(gitPath))throw coded('CHECKPOINT_GIT_UNMERGED');seen.add(gitPath);
    const relGit=prefix?(gitPath===prefix?'':gitPath.startsWith(`${prefix}/`)?gitPath.slice(prefix.length+1):null):gitPath;if(!relGit)continue;
    const relative=safeRelative(relGit);
    if(mode==='160000'){nestedJobs.push({relative,kind:'submodule',depth:1});continue;}
    jobs.push({relative,absolute:absoluteFromRelative(workspace.canonicalRoot,relative),mode,oid,gitPath});
  }
  const tracked=await inOrder(jobs,CAPTURE_CONCURRENCY,async({relative,absolute,mode,oid,gitPath}):Promise<SnapshotEntry|null>=>{
    let stat;try{stat=await lstat(absolute);}catch(error:any){if(error?.code==='ENOENT')return null;throw error;}
    const mustCapture=dirty.has(gitPath)||stat.isSymbolicLink()||!stat.isFile();
    if(mustCapture)return captureActualFile(workspace,absolute,relative,blobRoot,budget,mode==='100755');
    if(!entryAllowed(budget))return skip(budget,relative,'too-many');await assertFileContained(workspace,absolute,budget);
    return{kind:'file',source:'git',ref:oid,size:stat.size,mode:stat.mode&0o777,executable:mode==='100755',gitPath};
  });
  jobs.forEach((job,i)=>{const entry=tracked[i];if(entry)entries[job.relative]=entry;});
  const untrackedRelGit=nulList(untrackedRaw).map(gitPath=>prefix?(gitPath.startsWith(`${prefix}/`)?gitPath.slice(prefix.length+1):null):gitPath).filter((relGit):relGit is string=>Boolean(relGit));
  /* R2: git lists an untracked repository as `dir/` and does not look inside it. */
  for(const relGit of untrackedRelGit)if(relGit.endsWith('/'))nestedJobs.push({relative:safeRelative(relGit.slice(0,-1)),kind:'repository',depth:1});
  const untracked=[...new Set(untrackedRelGit.filter(relGit=>!relGit.endsWith('/')).map(safeRelative))].filter(relative=>!entries[relative]);
  const captured=await inOrder(untracked,CAPTURE_CONCURRENCY,relative=>captureActualFile(workspace,absoluteFromRelative(workspace.canonicalRoot,relative),relative,blobRoot,budget));
  untracked.forEach((relative,i)=>{const entry=captured[i];if(entry)entries[relative]=entry;});
  const nested:NestedRepositoryCoverage[]=[];await captureNested(workspace,blobRoot,budget,nestedJobs,entries,nested);
  return{capturedAt:new Date().toISOString(),workspace:{canonicalRoot:workspace.canonicalRoot,identityHash:workspace.identityHash,gitRoot},entries,git:{root:gitRoot,head,indexHash,worktreeSemanticsHash},coverage:{tracked:true,untrackedNonIgnored:true,ignoredUntracked:false,gitMetadataRestored:false,...(nested.length?{nested}:{})},exclusions:['Untracked files ignored by Git are outside rollback coverage.','Empty-directory existence is outside rollback coverage.','Git refs, index and object database are observed for conflict evidence but are not restored.',...nestedExclusions(nested)]};
}
async function captureNonGit(workspace:WorkspaceIdentity,blobRoot:string,budget:CaptureBudget):Promise<WorkspaceSnapshot>{
  const entries:Record<string,SnapshotEntry>={};
  /* D1: no preflight that refuses the whole capture; each file over a limit is left out and said (`skip`). */
  async function walk(dirname:string,relativeDir:string){
    const rows=await readdir(dirname,{withFileTypes:true});rows.sort((a,b)=>a.name.localeCompare(b.name));
    const files=rows.filter(row=>!row.isDirectory()).map(row=>safeRelative(relativeDir?`${relativeDir}/${row.name}`:row.name));
    const captured=await inOrder(files,CAPTURE_CONCURRENCY,relative=>captureActualFile(workspace,path.join(dirname,path.basename(relative)),relative,blobRoot,budget));
    files.forEach((relative,i)=>{const entry=captured[i];if(entry)entries[relative]=entry;});
    for(const row of rows.filter(row=>row.isDirectory())){const absolute=path.join(dirname,row.name);await assertExistingPathContained(workspace,absolute);await walk(absolute,safeRelative(relativeDir?`${relativeDir}/${row.name}`:row.name));}
  }
  await walk(workspace.canonicalRoot,'');
  return{capturedAt:new Date().toISOString(),workspace:{canonicalRoot:workspace.canonicalRoot,identityHash:workspace.identityHash,gitRoot:null},entries,git:null,coverage:{tracked:false,untrackedNonIgnored:true,ignoredUntracked:true,gitMetadataRestored:false},exclusions:['Filesystem metadata other than file content, executable bit and symlink target is outside rollback coverage.','Empty-directory existence is outside rollback coverage.']};
}
export async function captureWorkspaceSnapshot({projectRoot,blobRoot,limits=CHECKPOINT_LIMITS,statCache}:CaptureInput):Promise<WorkspaceSnapshot>{
  const startedAtMs=Date.now();
  const workspace=await resolveWorkspaceIdentity({projectRoot});await ensurePrivateDir(blobRoot);const canonicalBlobRoot=await realpath(blobRoot);if(inside(workspace.canonicalRoot,canonicalBlobRoot))throw coded('CHECKPOINT_STORE_INSIDE_WORKSPACE');
  const budget:CaptureBudget={entries:0,storedBytes:0,limits,startedAtMs,blobs:new Set(await readdir(canonicalBlobRoot)),pending:[],dirs:new Map(),cache:statCache??null,skipped:[],overflow:false};
  const snapshot=workspace.gitRoot?await captureGit(workspace,canonicalBlobRoot,budget):await captureNonGit(workspace,canonicalBlobRoot,budget);
  await syncNewBlobs(canonicalBlobRoot,budget);
  if(budget.skipped.length||budget.overflow){snapshot.skipped=budget.skipped;if(budget.overflow)snapshot.skippedOverflow=true;const said=skippedExclusions(budget);snapshot.exclusions=[...snapshot.exclusions,...said];if(said[0])snapshot.skippedSummary=said[0];}
  return snapshot;
}
export function checkpointMutationAllowed(mode:string){return mode!=='plan';}
export function extractWorkspaceWriteEvidence(raw:unknown):WorkspaceWriteEvidence[]{
  if(!raw||typeof raw!=='object')return[];const row=raw as Record<string,unknown>;if(row.type!=='StateDelta'||!Array.isArray(row.delta))return[];const out:WorkspaceWriteEvidence[]=[];
  for(const item of row.delta as Record<string,unknown>[]){const pointer=typeof item?.path==='string'?item.path:'';if(!pointer.startsWith('/file/'))continue;let relative:string;try{relative=safeRelative(pointer.slice('/file/'.length));}catch{continue;}
    const before=item.prima===null?null:typeof item.prima==='string'?sha256(item.prima):null;const after=typeof item.value==='string'?sha256(item.value):null;
    out.push({path:relative,existedBefore:item.op==='replace',beforeHash:before,afterHash:after});
  }
  return out;
}
export function sameSnapshotEntry(left:SnapshotEntry|undefined,right:SnapshotEntry|undefined):boolean{
  if(!left||!right)return left===right;if(left.kind!==right.kind)return false;if(left.kind==='symlink'&&right.kind==='symlink')return left.target===right.target;
  if(left.kind==='file'&&right.kind==='file')return left.source===right.source&&left.ref===right.ref&&left.mode===right.mode&&left.executable===right.executable;
  return false;
}
export function sameGitSnapshot(left:GitSnapshot|null,right:GitSnapshot|null):boolean{return left===null&&right===null||Boolean(left&&right&&left.root===right.root&&left.head===right.head&&left.indexHash===right.indexHash&&left.worktreeSemanticsHash===right.worktreeSemanticsHash);}
export async function materializeSnapshotFile(snapshot:WorkspaceSnapshot,entry:SnapshotFile,blobRoot:string,destination:string):Promise<void>{
  await mkdir(path.dirname(destination),{recursive:true,mode:0o700});
  if(entry.source==='blob'){
    const source=path.join(blobRoot,entry.ref);const data=await readFile(source);if(sha256(data)!==entry.ref)throw coded('CHECKPOINT_BLOB_CORRUPT');await copyFile(source,destination);await durableFile(destination);if(process.platform!=='win32')await chmod(destination,entry.mode);return;
  }
  if(!snapshot.git||!entry.gitPath)throw coded('CHECKPOINT_GIT_REFERENCE_INVALID');
  const safe=await checkedGitArgs(snapshot.git.root);
  await new Promise<void>((resolve,reject)=>{
    const child=spawn('git',[...safe,'-c','core.quotepath=false','cat-file','--filters',`--path=${entry.gitPath}`,entry.ref],{cwd:snapshot.git!.root,stdio:['ignore','pipe','pipe'],windowsHide:true});
    const stream=createWriteStream(destination,{mode:entry.mode});const errors:Buffer[]=[];let childDone=false,streamDone=false,failed=false;const finish=()=>{if(!failed&&childDone&&streamDone)resolve();};child.stderr.on('data',(chunk:Buffer)=>errors.push(chunk));child.on('error',error=>{failed=true;reject(error);});stream.on('error',error=>{failed=true;reject(error);});stream.on('close',()=>{streamDone=true;finish();});child.stdout.pipe(stream);
    child.on('close',code=>{if(code!==0){failed=true;reject(coded('CHECKPOINT_GIT_OBJECT_UNAVAILABLE',Buffer.concat(errors).toString('utf8').trim()));return;}childDone=true;finish();});
  });
  await durableFile(destination);if(process.platform!=='win32')await chmod(destination,entry.mode);
}
