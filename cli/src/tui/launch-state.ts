/*
 * R4 CONTRACT (owner: lane F; stub written by the coordinator so both lanes compile). Owner decision Q-R4-4: the full boot
 * plays only on the first launch and after an update (a new version or build commit); every other launch gets the short
 * boot (the final frame, at most 600 ms). The launch state lives under the data root, never the config root (gate E5), so
 * a test profile starts empty and its first launch is a full boot. Lane N only CALLS bootPlan (app.ts) and passes `mode`
 * to BootSequence; lane F owns the body (reading and recording the launch) and may not change the signature.
 *
 * R4 lane F (the body):
 * - The record is `<dataRoot>/launch-state.json`, schema `talos.cli.launch-state.v1`: the version and build seen by the last
 *   launch, when TALOS first ran and when it last ran. Nothing else is kept (no path, no project, no person's data).
 * - It fails TOWARD the full boot: a record that is missing, unreadable or of another shape is a first launch, and a record
 *   that cannot be written (read-only profile, a file where the folder should be) never throws — that launch just plays the
 *   full boot again, which is the harmless side.
 * - A build that cannot be read (`build` null or absent) is not an update: development builds report no build, and a
 *   missing value must not replay the full boot at every start. A different non-empty build is an update.
 * - Written through a temporary file and a rename, so a crash or a second TALOS starting at the same moment leaves either
 *   the old record or the new one, never half of one (the pattern of `security/project-trust.ts` atomicWriteText).
 * - Synchronous on purpose: lane N calls it once while the first frame is prepared, and the file is a few hundred bytes.
 */
import {mkdirSync,readFileSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export type BootMode='full'|'short';
export type BootPlan={mode:BootMode;firstLaunch:boolean};

const SCHEMA='talos.cli.launch-state.v1';
type LaunchRecord={schema:typeof SCHEMA;version:string;build:string|null;firstLaunchAt:string;lastLaunchAt:string};

export function launchStatePath(dataRoot:string):string{return join(dataRoot,'launch-state.json');}

function readRecord(file:string):LaunchRecord|null{
  try{
    const value=JSON.parse(readFileSync(file,'utf8'));
    if(!value||value.schema!==SCHEMA||typeof value.version!=='string'||(value.build!==null&&typeof value.build!=='string')
      ||typeof value.firstLaunchAt!=='string'||typeof value.lastLaunchAt!=='string')return null;
    return value as LaunchRecord;
  }catch{return null;}
}

function writeRecord(dataRoot:string,record:LaunchRecord):void{
  const file=launchStatePath(dataRoot);const temporary=`${file}.tmp-${process.pid}-${Date.now()}`;
  try{
    mkdirSync(dataRoot,{recursive:true});
    writeFileSync(temporary,`${JSON.stringify(record,null,2)}\n`,{encoding:'utf8',mode:0o600});
    renameSync(temporary,file);
  }catch{
    try{rmSync(temporary,{force:true});}catch{/* the temporary file was never created */}
  }
}

/** P17: whether this profile has never launched the interface, read without recording a launch (the trust question asks). */
export function isFirstLaunch(dataRoot:string):boolean{
  try{return readRecord(launchStatePath(dataRoot))===null;}catch{return false;}
}

export function bootPlan(input:{dataRoot:string;version:string;build?:string|null;now?:number}):BootPlan{
  const previous=readRecord(launchStatePath(input.dataRoot));
  const build=typeof input.build==='string'&&input.build!==''?input.build:null;
  const firstLaunch=previous===null;
  const updated=!firstLaunch&&(previous.version!==input.version||(build!==null&&previous.build!==null&&previous.build!==build));
  const at=new Date(input.now??Date.now()).toISOString();
  writeRecord(input.dataRoot,{schema:SCHEMA,version:input.version,build:build??previous?.build??null,firstLaunchAt:previous?.firstLaunchAt??at,lastLaunchAt:at});
  return{mode:firstLaunch||updated?'full':'short',firstLaunch};
}

/*
 * R4 Q-R4-4 (i)(a): the build commit, so that "after an update" also means a new commit of a development checkout (whose
 * version is always 1.0.0). It is the commit git records for the checkout the running CLI comes from, read the way git
 * stores it — HEAD, a branch ref or packed-refs, and for a linked worktree its `.git` file and `commondir` — without spawning
 * git. An installed copy has no checkout: null, and the version alone decides (a release has its own version). Read once
 * per process; a checkout that cannot be read is null, never an error (the boot falls back to the version).
 */
const SHA=/^[0-9a-f]{40}$/u;
function readText(file:string):string|null{try{return readFileSync(file,'utf8');}catch{return null;}}
function gitDirFrom(start:string):string|null{
  let cursor=resolve(start);
  for(let depth=0;depth<12;depth++){
    const dotGit=join(cursor,'.git');
    try{
      const info=statSync(dotGit);
      if(info.isDirectory())return dotGit;
      if(info.isFile()){const match=/^gitdir:\s*(.+?)\s*$/mu.exec(readText(dotGit)??'');if(!match)return null;return isAbsolute(match[1]!)?match[1]!:resolve(cursor,match[1]!);}
    }catch{/* no .git here: go up */}
    const parent=dirname(cursor);if(parent===cursor)return null;cursor=parent;
  }
  return null;
}
function refCommit(gitDir:string,commonDir:string,ref:string):string|null{
  if(!/^refs\/[\w./-]+$/u.test(ref)||ref.includes('..'))return null;
  for(const dir of [gitDir,commonDir]){const loose=readText(join(dir,...ref.split('/')))?.trim();if(loose&&SHA.test(loose))return loose;}
  for(const line of (readText(join(commonDir,'packed-refs'))??'').split(/\r?\n/u)){const [sha,name]=line.trim().split(' ');if(name===ref&&sha&&SHA.test(sha))return sha;}
  return null;
}
export function buildIdFrom(start:string):string|null{
  const gitDir=gitDirFrom(start);if(!gitDir)return null;
  const common=readText(join(gitDir,'commondir'))?.trim();const commonDir=common?resolve(gitDir,common):gitDir;
  const head=readText(join(gitDir,'HEAD'))?.trim()??'';
  if(SHA.test(head))return head;
  const match=/^ref:\s*(\S+)$/u.exec(head);
  return match?refCommit(gitDir,commonDir,match[1]!):null;
}
/** The branch checked out in the repository holding `start` (the header and the footer, mockup ` · main`); null when HEAD
    is detached or there is no repository. Read from the files, no process: it runs on a render. */
export function branchFrom(start:string):string|null{
  try{
    const gitDir=gitDirFrom(start);if(!gitDir)return null;
    const match=/^ref:\s*refs\/heads\/(\S+)$/u.exec(readText(join(gitDir,'HEAD'))?.trim()??'');
    return match?match[1]!:null;
  }catch{return null;}
}
let cachedBuildId:string|null|undefined;
/** The running CLI's build commit (or that of the checkout holding `start`); null for an installed copy. */
export function currentBuildId(start?:string):string|null{
  if(start!==undefined)return buildIdFrom(start);
  if(cachedBuildId===undefined){try{cachedBuildId=buildIdFrom(dirname(fileURLToPath(import.meta.url)));}catch{cachedBuildId=null;}}
  return cachedBuildId;
}
