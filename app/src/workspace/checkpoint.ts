import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {chmod,copyFile,lstat,mkdir,open,readFile,readdir,readlink,realpath,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {resolveWorkspaceIdentity,type WorkspaceIdentity} from '../security/workspace-identity.ts';

export type CheckpointLimits={maxEntries:number;maxStoredBytes:number;maxStoredFileBytes:number};
export const CHECKPOINT_LIMITS:CheckpointLimits={maxEntries:50_000,maxStoredBytes:256*1024*1024,maxStoredFileBytes:64*1024*1024};
export type SnapshotFile={kind:'file';source:'git'|'blob';ref:string;size:number;mode:number;executable:boolean;gitPath?:string};
export type SnapshotSymlink={kind:'symlink';target:string};
export type SnapshotEntry=SnapshotFile|SnapshotSymlink;
export type GitSnapshot={root:string;head:string|null;indexHash:string|null;worktreeSemanticsHash:string};
export type WorkspaceSnapshot={
  capturedAt:string;
  workspace:{canonicalRoot:string;identityHash:string;gitRoot:string|null};
  entries:Record<string,SnapshotEntry>;
  git:GitSnapshot|null;
  coverage:{tracked:boolean;untrackedNonIgnored:boolean;ignoredUntracked:boolean;gitMetadataRestored:boolean};
  exclusions:string[];
};
export type WorkspaceWriteEvidence={path:string;existedBefore:boolean;beforeHash:string|null;afterHash:string|null};

type CaptureInput={projectRoot:string;blobRoot:string;limits?:CheckpointLimits};
type CaptureBudget={entries:number;storedBytes:number;limits:CheckpointLimits};

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
async function durableFile(pathname:string){const handle=await open(pathname,'r');try{await handle.sync();}finally{await handle.close();}}
async function durableDir(dirname:string){try{const handle=await open(dirname,'r');try{await handle.sync();}finally{await handle.close();}}catch(error){if(process.platform!=='win32')throw error;}}
async function ensurePrivateDir(dirname:string){await mkdir(dirname,{recursive:true,mode:0o700});try{await chmod(dirname,0o700);}catch(error){if(process.platform!=='win32')throw error;}}
async function storeBlob(blobRoot:string,data:Buffer):Promise<string>{
  const hash=sha256(data),target=path.join(blobRoot,hash);await ensurePrivateDir(blobRoot);
  const temp=path.join(blobRoot,`.${hash}.${process.pid}.tmp`);
  try{const handle=await open(temp,'wx',0o600);try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}await rename(temp,target).catch(async(error:any)=>{if(error?.code==='EEXIST'){await rm(temp,{force:true});return;}throw error;});await durableDir(blobRoot);}catch(error:any){if(error?.code!=='EEXIST')throw error;}
  return hash;
}
function consumeFileBudget(budget:CaptureBudget,size:number){
  if(size>budget.limits.maxStoredFileBytes)throw coded('CHECKPOINT_FILE_TOO_LARGE');
  if(budget.storedBytes+size>budget.limits.maxStoredBytes)throw coded('CHECKPOINT_SNAPSHOT_TOO_LARGE');
  budget.storedBytes+=size;
}
function consumeEntry(budget:CaptureBudget){budget.entries+=1;if(budget.entries>budget.limits.maxEntries)throw coded('CHECKPOINT_TOO_MANY_ENTRIES');}
async function gitBytes(cwd:string,args:string[],maxBytes=64*1024*1024,allowedExitCodes:readonly number[]=[0],stdin?:Buffer):Promise<Buffer>{
  return new Promise((resolve,reject)=>{
    const child=spawn('git',['-c','core.quotepath=false',...args],{cwd,stdio:[stdin?'pipe':'ignore','pipe','pipe'],windowsHide:true});
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
async function captureActualFile(workspace:WorkspaceIdentity,absolute:string,relative:string,blobRoot:string,budget:CaptureBudget,indexExecutable=false):Promise<SnapshotEntry|null>{
  let stat;try{stat=await lstat(absolute);}catch(error:any){if(error?.code==='ENOENT')return null;throw error;}
  consumeEntry(budget);
  if(stat.isSymbolicLink()){
    let canonical:string;try{canonical=await realpath(absolute);}catch{throw coded('CHECKPOINT_SYMLINK_ESCAPE',`Checkpoint symlink cannot be resolved safely: ${relative}`);}
    if(!inside(workspace.canonicalRoot,canonical))throw coded('CHECKPOINT_SYMLINK_ESCAPE',`Checkpoint symlink escapes workspace: ${relative}`);
    return{kind:'symlink',target:await readlink(absolute)};
  }
  if(!stat.isFile())throw coded('CHECKPOINT_SPECIAL_FILE_UNSUPPORTED',`Unsupported workspace entry: ${relative}`);
  await assertExistingPathContained(workspace,absolute);
  consumeFileBudget(budget,stat.size);
  const data=await readFile(absolute);const ref=await storeBlob(blobRoot,data);
  const executable=process.platform==='win32'?indexExecutable:Boolean(stat.mode&0o111);return{kind:'file',source:'blob',ref,size:stat.size,mode:stat.mode&0o777,executable};
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
  for(const row of trackedRows){
    const tab=row.indexOf('\t');if(tab<0)throw coded('CHECKPOINT_GIT_INDEX_INVALID');const meta=row.slice(0,tab).split(' ');const gitPath=row.slice(tab+1);
    if(meta.length<3||meta[2]!=='0')throw coded('CHECKPOINT_GIT_UNMERGED','Unmerged Git index state is not checkpointable safely.');
    const mode=meta[0]!,oid=meta[1]!; if(seen.has(gitPath))throw coded('CHECKPOINT_GIT_UNMERGED');seen.add(gitPath);
    if(mode==='160000')throw coded('CHECKPOINT_GITLINK_UNSUPPORTED',`Gitlink/submodule is outside checkpoint coverage: ${gitPath}`);
    const relGit=prefix?(gitPath===prefix?'':gitPath.startsWith(`${prefix}/`)?gitPath.slice(prefix.length+1):null):gitPath;if(!relGit)continue;
    const relative=safeRelative(relGit);const absolute=absoluteFromRelative(workspace.canonicalRoot,relative);
    let stat;try{stat=await lstat(absolute);}catch(error:any){if(error?.code==='ENOENT')continue;throw error;}
    const mustCapture=dirty.has(gitPath)||stat.isSymbolicLink()||!stat.isFile();
    if(mustCapture){const actual=await captureActualFile(workspace,absolute,relative,blobRoot,budget,mode==='100755');if(actual)entries[relative]=actual;continue;}
    consumeEntry(budget);await assertExistingPathContained(workspace,absolute);
    entries[relative]={kind:'file',source:'git',ref:oid,size:stat.size,mode:stat.mode&0o777,executable:mode==='100755',gitPath};
  }
  for(const gitPath of nulList(untrackedRaw)){
    const relGit=prefix?(gitPath.startsWith(`${prefix}/`)?gitPath.slice(prefix.length+1):null):gitPath;if(!relGit)continue;
    const relative=safeRelative(relGit);if(entries[relative])continue;
    const actual=await captureActualFile(workspace,absoluteFromRelative(workspace.canonicalRoot,relative),relative,blobRoot,budget);if(actual)entries[relative]=actual;
  }
  return{capturedAt:new Date().toISOString(),workspace:{canonicalRoot:workspace.canonicalRoot,identityHash:workspace.identityHash,gitRoot},entries,git:{root:gitRoot,head,indexHash,worktreeSemanticsHash},coverage:{tracked:true,untrackedNonIgnored:true,ignoredUntracked:false,gitMetadataRestored:false},exclusions:['Untracked files ignored by Git are outside rollback coverage.','Empty-directory existence is outside rollback coverage.','Git refs, index and object database are observed for conflict evidence but are not restored.']};
}
async function captureNonGit(workspace:WorkspaceIdentity,blobRoot:string,budget:CaptureBudget):Promise<WorkspaceSnapshot>{
  const entries:Record<string,SnapshotEntry>={};
  async function preflight(dirname:string,relativeDir:string){
    const rows=await readdir(dirname,{withFileTypes:true});rows.sort((a,b)=>a.name.localeCompare(b.name));
    for(const row of rows){const relative=safeRelative(relativeDir?`${relativeDir}/${row.name}`:row.name);const absolute=path.join(dirname,row.name);
      if(row.isDirectory()){await assertExistingPathContained(workspace,absolute);await preflight(absolute,relative);continue;}
      let stat;try{stat=await lstat(absolute);}catch(error:any){if(error?.code==='ENOENT')continue;throw error;}
      consumeEntry(budget);
      if(stat.isSymbolicLink()){
        let canonical:string;try{canonical=await realpath(absolute);}catch{throw coded('CHECKPOINT_SYMLINK_ESCAPE',`Checkpoint symlink cannot be resolved safely: ${relative}`);}
        if(!inside(workspace.canonicalRoot,canonical))throw coded('CHECKPOINT_SYMLINK_ESCAPE',`Checkpoint symlink escapes workspace: ${relative}`);
        continue;
      }
      if(!stat.isFile())throw coded('CHECKPOINT_SPECIAL_FILE_UNSUPPORTED',`Unsupported workspace entry: ${relative}`);
      await assertExistingPathContained(workspace,absolute);consumeFileBudget(budget,stat.size);
    }
  }
  await preflight(workspace.canonicalRoot,'');
  budget.entries=0;budget.storedBytes=0;
  async function walk(dirname:string,relativeDir:string){
    const rows=await readdir(dirname,{withFileTypes:true});rows.sort((a,b)=>a.name.localeCompare(b.name));
    for(const row of rows){const relative=safeRelative(relativeDir?`${relativeDir}/${row.name}`:row.name);const absolute=path.join(dirname,row.name);
      if(row.isDirectory()){await assertExistingPathContained(workspace,absolute);await walk(absolute,relative);continue;}
      const actual=await captureActualFile(workspace,absolute,relative,blobRoot,budget);if(actual)entries[relative]=actual;
    }
  }
  await walk(workspace.canonicalRoot,'');
  return{capturedAt:new Date().toISOString(),workspace:{canonicalRoot:workspace.canonicalRoot,identityHash:workspace.identityHash,gitRoot:null},entries,git:null,coverage:{tracked:false,untrackedNonIgnored:true,ignoredUntracked:true,gitMetadataRestored:false},exclusions:['Filesystem metadata other than file content, executable bit and symlink target is outside rollback coverage.','Empty-directory existence is outside rollback coverage.']};
}
export async function captureWorkspaceSnapshot({projectRoot,blobRoot,limits=CHECKPOINT_LIMITS}:CaptureInput):Promise<WorkspaceSnapshot>{
  const workspace=await resolveWorkspaceIdentity({projectRoot});await ensurePrivateDir(blobRoot);const canonicalBlobRoot=await realpath(blobRoot);if(inside(workspace.canonicalRoot,canonicalBlobRoot))throw coded('CHECKPOINT_STORE_INSIDE_WORKSPACE');const budget:CaptureBudget={entries:0,storedBytes:0,limits};
  return workspace.gitRoot?captureGit(workspace,canonicalBlobRoot,budget):captureNonGit(workspace,canonicalBlobRoot,budget);
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
  await new Promise<void>((resolve,reject)=>{
    const child=spawn('git',['-c','core.quotepath=false','cat-file','--filters',`--path=${entry.gitPath}`,entry.ref],{cwd:snapshot.git!.root,stdio:['ignore','pipe','pipe'],windowsHide:true});
    const stream=createWriteStream(destination,{mode:entry.mode});const errors:Buffer[]=[];let childDone=false,streamDone=false,failed=false;const finish=()=>{if(!failed&&childDone&&streamDone)resolve();};child.stderr.on('data',(chunk:Buffer)=>errors.push(chunk));child.on('error',error=>{failed=true;reject(error);});stream.on('error',error=>{failed=true;reject(error);});stream.on('close',()=>{streamDone=true;finish();});child.stdout.pipe(stream);
    child.on('close',code=>{if(code!==0){failed=true;reject(coded('CHECKPOINT_GIT_OBJECT_UNAVAILABLE',Buffer.concat(errors).toString('utf8').trim()));return;}childDone=true;finish();});
  });
  await durableFile(destination);if(process.platform!=='win32')await chmod(destination,entry.mode);
}
