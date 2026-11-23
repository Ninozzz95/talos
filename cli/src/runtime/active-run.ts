import {readFileSync} from 'node:fs';
import {mkdir,readdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {CliPaths} from '../paths.ts';

type ActiveRunInfo={projectRoot?:string;sessionId?:string};
type ActiveRunRecord=ActiveRunInfo&{pid:number;startedAt:string;startTicks?:number};

function dir(paths:CliPaths){return join(paths.dataRoot,'active-runs');}
function marker(paths:CliPaths,pid=process.pid){return join(dir(paths),`${pid}.json`);}

/* R6 (reserve, owner 05/10): on POSIX a ZOMBIE answers kill(pid,0) like a live process — the kernel keeps the defunct
   entry until the parent reaps it (kill(2) NOTES; codex says the same at pid.rs:601, cline treats Z/X/x as missing).
   The /proc/<pid>/stat state field tells them apart: Z (zombie) and X/x (dead) mean gone. A /proc that cannot be read
   (hardened mounts, hidepid) stays conservative: alive — nothing is ever swept on doubt. Windows has no zombies (its
   own risk, a pid reused while a handle is open, is the 30-day ratchet below); startTicks closes reuse on Linux. */
export const POSIX_DEAD_STATES:ReadonlySet<string>=new Set(['Z','X','x']);
type ProcSnapshot={state:string;startTicks:number|null};
export function parseProcStat(stat:string):ProcSnapshot|null{
  const close=stat.lastIndexOf(')');if(close<0)return null; /* the comm may contain spaces and parentheses: fields resume after the LAST ')' (codex pid_identity.rs:222) */
  const fields=stat.slice(close+1).trim().split(/\s+/u);
  const ticks=Number(fields[19]); /* starttime is field 22; after state (field 3) it is the 20th entry */
  return{state:String(fields[0]??''),startTicks:Number.isFinite(ticks)&&ticks>0?ticks:null};
}
function readProcStat(pid:number):ProcSnapshot|null{
  if(process.platform==='win32')return null; /* no /proc on Windows: the ratchet is the guard there */
  try{return parseProcStat(readFileSync(join('/proc',String(pid),'stat'),'utf8'));}catch{return null;} /* uninspectable: conservatively alive (hermes_state_holders.py:477) */
}
function alive(pid:number,startTicks?:number,read:typeof readProcStat=readProcStat){try{process.kill(pid,0);}catch(error:any){return error?.code==='EPERM';} /* EPERM: it runs, someone else owns it */
  const snap=read(pid);if(!snap)return true; /* cannot look: conservative */
  if(POSIX_DEAD_STATES.has(snap.state))return false; /* zombie or dead: kill(pid,0) lied */
  if(startTicks!==undefined&&snap.startTicks!==null&&snap.startTicks!==startTicks)return false; /* same pid, different start time: the pid was reused */
  return true;}

/* F-022/RIF-1 (owner 05/10): a marker that names a dead process is a false "active run" for whoever asks. On Windows a PID
   becomes reusable only once the last handle to the process object closes (Raymond Chen, MS DevBlogs 2011), so kill(,0)
   alone cannot tell a reused PID: a marker older than MAX_MARKER_AGE_MS is stale even if its pid answers. */
export const MAX_MARKER_AGE_MS=30*24*60*60*1000;
export const SIGNAL_NUMBERS:Record<string,number>={SIGINT:2,SIGHUP:1,SIGTERM:15,SIGBREAK:21}; /* D-3.5 (review 2): SIGINT mapped, so releaseOnSignals(['SIGINT']) exits 130, not the 129 fallback */
/* A marker is born when writeFile() creates the file and its content lands an instant later: a concurrent sweep reading
   it inside that gap sees an unparsable file. Unparsable files younger than this grace window are spared and still count
   as active (review F-022 blocker 2); older junk is swept without mercy. */
const UNPARSABLE_GRACE_MS=10_000;

type SweepDeps={isProcessAlive?:(pid:number,startTicks?:number)=>boolean;now?:()=>number;stat?:(file:string)=>Promise<{mtimeMs:number}>;rm?:(file:string)=>Promise<void>;readProcStat?:(pid:number)=>ProcSnapshot|null};
type Survivor={pid:number;projectRoot:unknown};

/* D-3.2 (review 2): deciding that a marker is stale and unlinking it are two steps, and in between the OS can reuse the
   pid — the new owner rewrites the marker, and a naive rm would delete the live run's protection. So the file is stat-ed
   again right before the unlink: an mtime that moved since our snapshot means someone rewrote it, and it is left alone.
   D-3.7: the removal counts only when this sweep truly unlinked, so cli.active_run.reconciled cannot over-count a file
   another sweep already took or one it could not remove (D-3.1). */
async function sweepRemove(file:string,readMtimeMs:number|null,deps:SweepDeps):Promise<boolean>{
  const remove=deps.rm??((file:string)=>rm(file,{force:true}));
  try{if(readMtimeMs===null)return false; /* no snapshot to compare: leave it to the next sweep */
    const current=await (deps.stat??stat)(file);if(current.mtimeMs!==readMtimeMs)return false;
    await remove(file);return true;}
  catch{return false;} /* already gone (another sweep) or unremovable (D-3.1): not an error, not counted */
}

/* R3 (reserve, owner 05/10): the scan is a pure predicate over the folder — it decides which markers are stale and
   returns them as candidates, but never writes: a question must not modify the workspace behind the caller's back
   (CQS; hermes keeps the same split — isStaleSingletonLockOwner vs removeStaleSingletonLock — and pi-mono cleans only
   in listen()). The only writer is the sweep below, which owns the D-3.2 re-stat and the D-3.7 honest counting. */
async function scanMarkers(paths:CliPaths,deps:SweepDeps):Promise<{survivors:Survivor[];stale:{file:string;mtimeMs:number|null}[]}|null>{let names:string[];
  try{names=await readdir(dir(paths));}catch(error:any){if(error?.code==='ENOENT')return null;throw error;}
  const survivors:Survivor[]=[];const stale:{file:string;mtimeMs:number|null}[]=[];
  const isAlive=deps.isProcessAlive??((pid:number,startTicks?:number)=>alive(pid,startTicks,deps.readProcStat));
  for(const name of names){if(!/^\d+\.json$/u.test(name))continue;const file=join(dir(paths),name);
    /* one mtime snapshot serves both clocks below and the D-3.2 guard */
    const readStat=await (async()=>{try{return await (deps.stat??stat)(file);}catch{return null;}})();
    const now=(deps.now??Date.now)();
    let pid=0;let root:unknown=null;let fresh=true;let startTicks:number|undefined=undefined;
    try{const data=JSON.parse(await readFile(file,'utf8'));pid=Number(data?.pid);root=data?.projectRoot;
      const raw=data?.startTicks;if(typeof raw==='number'&&Number.isFinite(raw)&&raw>0)startTicks=raw;
      const startedAt=Date.parse(String(data?.startedAt??''));
      if(Number.isFinite(startedAt))fresh=!(now-startedAt>MAX_MARKER_AGE_MS);
      else fresh=!(readStat&&now-readStat.mtimeMs>MAX_MARKER_AGE_MS);} /* no mtime either: conservative, counts as fresh */
    catch{if(!readStat)continue; /* vanished before we could look: nothing of ours to remove, not counted (D-3.7) */
      if(now-readStat.mtimeMs<UNPARSABLE_GRACE_MS){survivors.push({pid:0,projectRoot:null});continue;} /* pid 0: unknown yet, counts as active */
      stale.push({file,mtimeMs:readStat.mtimeMs});continue;}
    if(!Number.isSafeInteger(pid)||pid<=0||!fresh||!isAlive(pid,startTicks)){stale.push({file,mtimeMs:readStat?readStat.mtimeMs:null});continue;}
    survivors.push({pid,projectRoot:root});
  }
  return{survivors,stale};
}

async function sweepMarkers(paths:CliPaths,deps:SweepDeps){const scanned=await scanMarkers(paths,deps);if(!scanned)return null;
  let removed=0;
  for(const row of scanned.stale)if(await sweepRemove(row.file,row.mtimeMs,deps))removed+=1; /* D-3.1 (review 2): an unremovable stale marker must not break update/checkpoint — the guards live in sweepRemove */
  return{survivors:scanned.survivors,removed};
}

/* F-022 D1: the boot-time reconciliation — trusts nothing on disk: removes every marker that is dead, over age, or
   unparsable past its write grace; an unparsable marker INSIDE the grace window is a live run caught mid-write, so it is
   spared and still counts as active (review 2 D-3.3: the comment now says what the code does). main.ts calls it before
   registering its own marker. */
export async function reconcileActiveRuns(paths:CliPaths,deps:SweepDeps={}){const swept=await sweepMarkers(paths,deps);return swept?.removed??0;}

/* F-022 D2: a window close (SIGHUP on Windows) or a SIGTERM/SIGBREAK must not leave the marker behind: release first,
   then exit 128+signal (POSIX convention, Node's own default for SIGTERM/SIGINT). Injectable for tests. */
/* The signals that can end the console: SIGBREAK exists on Windows only (Ctrl+Break / console close); on POSIX SIGHUP is
   the console hangup and SIGTERM the polite kill. The list follows the platform so the install is honest everywhere. */
export function signalsForPlatform(platform:string=process.platform):readonly string[]{
  return platform==='win32'?['SIGHUP','SIGTERM','SIGBREAK']:['SIGHUP','SIGTERM'];
}

/* D-3.4 (review 2): the exit waits for the release, but a hung rm (slow drvfs/NFS, antivirus lock) must not make the CLI
   unkillable with TERM: the wait is bounded by SIGNAL_RELEASE_TIMEOUT_MS, and a SECOND signal while a release is still
   pending exits at once (it fires the idempotent release again, without waiting for it). The exit code is emitted once. */
export const SIGNAL_RELEASE_TIMEOUT_MS=5_000;
export function releaseOnSignals(signals:readonly string[],io:{release:()=>Promise<void>|void;exit?:(code:number)=>void;install?:(signal:string,handler:()=>void)=>()=>void;releaseTimeoutMs?:number}):()=>void{
  const exit=io.exit??((code:number)=>process.exit(code));
  const install=io.install??((signal:string,handler:()=>void)=>{process.on(signal,handler);return()=>{process.off(signal,handler);};});
  const uninstalls:(()=>void)[]=[];
  const timeoutMs=io.releaseTimeoutMs??SIGNAL_RELEASE_TIMEOUT_MS;
  let pending=false;let gone=false;
  const leave=(code:number)=>{if(gone)return;gone=true;exit(code);};
  const boundedWait=()=>new Promise<void>((resolve)=>{const timer=setTimeout(resolve,timeoutMs);if(typeof timer.unref==='function')timer.unref();});
  try{for(const signal of signals){uninstalls.push(install(signal,()=>{
    if(gone)return; /* already leaving: there is no second exit */
    if(pending){void Promise.resolve().then(()=>io.release()).catch(()=>{});leave(128+(SIGNAL_NUMBERS[signal]??1));return;} /* must not queue behind a hung release */
    pending=true;
    void (async()=>{try{await Promise.race([Promise.resolve().then(()=>io.release()).catch(()=>{}),boundedWait()]);}finally{leave(128+(SIGNAL_NUMBERS[signal]??1));}})();
  }));}}
  catch(error){for(const off of uninstalls)off();throw error;} /* an install that fails mid-way leaves no handler behind */
  return()=>{for(const off of uninstalls)off();};
}

export async function registerActiveRun(paths:CliPaths,info:ActiveRunInfo={}){
  const root=dir(paths);await mkdir(root,{recursive:true,mode:0o700});
  const file=marker(paths);const record:ActiveRunRecord={pid:process.pid,startedAt:new Date().toISOString(),...info};
  const own=readProcStat(process.pid);if(own?.startTicks)record.startTicks=own.startTicks; /* R6: our own start_ticks (field 22 of /proc/self/stat) — a sweep that later sees the same pid with a different start time knows the pid was reused (codex pid_identity.rs) */
  await writeFile(file,`${JSON.stringify(record)}\n`,{encoding:'utf8',mode:0o600});
  let released=false;
  return async()=>{if(released)return;released=true;await rm(file,{force:true});};
}

/* R5b D3: `exceptPid` leaves out a process (the TUI asking about the others: main.ts registers it for its whole life) and
   `projectRoot` counts only the runs of that project; a marker that does not name its project still counts. */
function sameRoot(a:string,b:string){const x=resolve(a),y=resolve(b);return process.platform==='win32'?x.toLowerCase()===y.toLowerCase():x===y;}
export async function hasActiveRuns(paths:CliPaths,deps:{isProcessAlive?:(pid:number,startTicks?:number)=>boolean;exceptPid?:number;projectRoot?:string;now?:()=>number;stat?:(file:string)=>Promise<{mtimeMs:number}>;readProcStat?:(pid:number)=>ProcSnapshot|null}={}){
  const scanned=await scanMarkers(paths,deps);if(!scanned)return false; /* R3: a pure question — it reads the folder and writes nothing */
  let any=false;
  for(const row of scanned.survivors){
    if(deps.exceptPid===row.pid)continue;
    if(deps.projectRoot&&typeof row.projectRoot==='string'&&row.projectRoot&&!sameRoot(String(row.projectRoot),deps.projectRoot))continue;
    any=true;
  }
  return any;
}
