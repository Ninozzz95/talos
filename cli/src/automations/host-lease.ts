/*
 * 0.6.6 (the 0.6.6 review's F1): ONE process hosts a profile's automations. Two hosts on one store (`serve` started by Windows
 * and a `run` by hand, or two `serve`) each saw the other's run as a run their registry did not know: the kernel's scheduler
 * closed it as failed and started a second one. Hermes keeps overlapping processes to one tick with a file lock
 * (`cron/.tick.lock`, `cron/scheduler.py`) and claims a job before firing it; Codex automations and Claude Code routines have a
 * single scheduler by construction (the app, the cloud). Here the host holds a lease file:
 * - `automation-host.json` = {pid, token, role, startedAt, beatAt}, created exclusively (`wx`), its beat rewritten every
 *   HOST_BEAT_MS; it is free when the file is absent, its process is gone, or its beat is older than HOST_STALE_MS (a process
 *   frozen that long, or a reused number) — the stale rule of proper-lockfile (mkdir + mtime), with the process checked too;
 * - a stale lease is moved aside before it is taken, and taken only if what was moved is the stale one;
 * - another process does not host: it writes a request (`requests/<id>.json`: run an automation, stop its run) and the host
 *   answers in `requests/<id>.result.json`.
 */
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const HOST_LEASE_FILE='automation-host.json';
export const HOST_BEAT_MS=15_000;
export const HOST_STALE_MS=120_000;
/** A live holder whose beat looks old (a sleep, a clock jump) is stale only after a reader saw that same beat this long. */
export const HOST_STALE_CONFIRM_MS=2*HOST_BEAT_MS;
export const RESULT_KEEP_MS=10*60_000;
export type HostRole='serve'|'run';
/* 0.6.15: remote control elects its host window with the same lease (src/remote/tui-remote.ts): its own file, and a `label` the
   other windows show («via the window “site”»). T4: `kind` says who holds it — a window, or `talos remote` in a terminal (the
   windows then say «pairing in another terminal», owner 26/10/2026) */
export type HostLeaseKind='window'|'command';
/* owner 27/10/2026: `elevated` — the holder runs as administrator (src/remote/elevation.ts); a normal process cannot reach its channel */
export type HostLease={pid:number;token:string;role:HostRole;startedAt:string;beatAt:string;label?:string;kind?:HostLeaseKind;elevated?:boolean};
export type HostRequest={requestId:string;op:'run'|'stop';id:string;at:string};

/** A process number is alive when signal 0 reaches it, or when it exists but belongs to someone else (EPERM). */
export function processAlive(pid:number):boolean{
  if(!Number.isInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException)?.code==='EPERM';}
}
function readJson(file:string):any{try{return JSON.parse(readFileSync(file,'utf8'));}catch{return null;}}
function writeAtomic(file:string,value:unknown){
  const temporary=`${file}.${randomUUID()}.tmp`;writeFileSync(temporary,JSON.stringify(value),'utf8');
  try{renameSync(temporary,file);}catch(error){rmSync(temporary,{force:true});throw error;}
}

export function createHostLease(input:{dir:string;role:HostRole;pid?:number;now?:()=>number;monotonic?:()=>number;isAlive?:(pid:number)=>boolean;fileName?:string;label?:string;kind?:HostLeaseKind;elevated?:()=>boolean}){
  const file=join(input.dir,input.fileName??HOST_LEASE_FILE);const requests=join(input.dir,'requests');
  const now=input.now??Date.now;const isAlive=input.isAlive??processAlive;const pid=input.pid??process.pid;
  let mine:HostLease|null=null;
  const iso=()=>new Date(now()).toISOString();
  const monotonic=input.monotonic??(()=>performance.now());
  /* the beats this reader found already old, with when (its own clock) it first saw each one */
  const suspects=new Map<string,{beatAt:string;since:number}>();
  /** The lease as it is on the disk, when someone holds it: null when the file is absent or its holder is gone. */
  function holder():HostLease|null{
    const lease=readJson(file);
    if(lease&&typeof lease.token==='string'){
      if(!isAlive(Number(lease.pid))){suspects.delete(lease.token);return null;}
      const beat=Date.parse(String(lease.beatAt));
      if(Number.isFinite(beat)&&now()-beat<HOST_STALE_MS){suspects.delete(lease.token);return lease as HostLease;}
      /* the review's N1: after a sleep or a clock jump EVERY beat looks old, a live host's too — its process is alive, so it is
         stale only when this reader has seen that same beat unchanged for HOST_STALE_CONFIRM_MS of its own time */
      const seen=suspects.get(lease.token);
      if(!seen||seen.beatAt!==lease.beatAt){suspects.set(lease.token,{beatAt:String(lease.beatAt),since:monotonic()});return lease as HostLease;}
      return monotonic()-seen.since>=HOST_STALE_CONFIRM_MS?null:lease as HostLease;
    }
    /* unreadable: written this instant by an exclusive create, or broken — held until it is as old as a stale beat */
    try{return now()-statSync(file).mtimeMs<HOST_STALE_MS?{pid:0,token:'',role:'serve',startedAt:'',beatAt:''}:null;}catch{return null;}
  }
  function tryAcquire():{ok:true}|{ok:false;holder:HostLease}{
    mkdirSync(input.dir,{recursive:true});
    for(let attempt=0;attempt<3;attempt++){
      const lease:HostLease={pid,token:randomUUID(),role:input.role,startedAt:iso(),beatAt:iso(),...(input.label?{label:input.label}:{}),...(input.kind?{kind:input.kind}:{}),...(input.elevated?.()?{elevated:true}:{})};
      try{writeFileSync(file,JSON.stringify(lease),{encoding:'utf8',flag:'wx'});mine=lease;return{ok:true};}
      catch(error){if((error as NodeJS.ErrnoException)?.code!=='EEXIST')throw error;}
      const held=holder();if(held)return{ok:false,holder:held};
      const stale=readJson(file);const aside=`${file}.stale-${randomUUID()}`;
      try{renameSync(file,aside);}catch{continue;}
      const moved=readJson(aside);
      if((moved?.token??null)!==(stale?.token??null)){try{renameSync(aside,file);}catch{/* the newer lease is already back */}continue;}
      rmSync(aside,{force:true});
    }
    const held=holder();return{ok:false,holder:held??{pid:0,token:'',role:'serve',startedAt:'',beatAt:''}};
  }
  /**
   * Whether the lease on the disk is still this process's. The fourth review's N-A: a read that FAILS (a scanner holding the file,
   * a rename in flight) is not a loss — only a file that is gone, or that names another token, is.
   */
  function owns():boolean{
    if(!mine)return false;
    let text:string;
    try{text=readFileSync(file,'utf8');}catch(error){return (error as NodeJS.ErrnoException)?.code!=='ENOENT';}
    /* this process's beats are atomic (a rename), so text that does not parse is another process's exclusive create in the middle
       of taking the lease over: not ours (fifth review) */
    let token:unknown;try{token=JSON.parse(text)?.token;}catch{return false;}
    return token===mine.token;
  }
  /** Rewrites the beat; false when the lease is no longer this process's (taken after a freeze longer than HOST_STALE_MS). */
  function beat():boolean{
    if(!mine)return false;
    if(!owns()){mine=null;return false;}
    /* on Windows a rename over the file another process is reading fails (EPERM): the beat before stays, the next one rewrites it */
    const next={...mine,beatAt:iso()};try{writeAtomic(file,next);mine=next;}catch{/* kept: still this process's lease */}
    return true;
  }
  function release(){
    if(!mine)return;
    if(readJson(file)?.token===mine.token)rmSync(file,{force:true});
    mine=null;
  }
  /* the requests of the processes that do not host */
  function send(op:'run'|'stop',id:string):string{
    mkdirSync(requests,{recursive:true});const requestId=randomUUID();
    writeAtomic(join(requests,`${requestId}.json`),{requestId,op,id,at:iso()} satisfies HostRequest);return requestId;
  }
  /** Withdraws a request nobody took: true when it was still there. */
  function withdraw(requestId:string):boolean{
    const path=join(requests,`${requestId}.json`);
    try{renameSync(path,`${path}.withdrawn`);rmSync(`${path}.withdrawn`,{force:true});return true;}catch{return false;}
  }
  /** The host takes the requests waiting (each one taken once: moved before it is read). */
  function take():HostRequest[]{
    let names:string[];try{names=readdirSync(requests);}catch{return[];}
    const out:HostRequest[]=[];
    /* answers nobody came for (an asker that died) are removed once they are RESULT_KEEP_MS old */
    for(const name of names.filter(n=>n.endsWith('.result.json'))){try{const path=join(requests,name);if(now()-statSync(path).mtimeMs>RESULT_KEEP_MS)rmSync(path,{force:true});}catch{/* taken meanwhile */}}
    for(const name of names.filter(n=>/^[0-9a-f-]{36}\.json$/u.test(n)).sort()){
      const path=join(requests,name);const taken=`${path}.taken`;
      try{renameSync(path,taken);}catch{continue;}
      const request=readJson(taken);rmSync(taken,{force:true});
      if(request&&(request.op==='run'||request.op==='stop')&&typeof request.id==='string')out.push({...request,requestId:name.slice(0,-5)});
    }
    return out;
  }
  function answer(requestId:string,result:unknown){mkdirSync(requests,{recursive:true});writeAtomic(join(requests,`${requestId}.result.json`),result);}
  /** The host's answer to a request, read once (the file is removed). */
  function result(requestId:string):any{
    const path=join(requests,`${requestId}.result.json`);const value=readJson(path);
    if(value!==null)rmSync(path,{force:true});return value;
  }
  /* T4: this process's lease token — a proxy names the token it read, and the host serves only while it still owns that lease
     (a fencing token: a host frozen past HOST_STALE_MS and taken over refuses instead of acting as a second coordinator) */
  return{file,holder,tryAcquire,beat,owns,release,send,withdraw,take,answer,result,held:()=>mine!==null,token:()=>mine?.token??null};
}
export type HostLeaseHandle=ReturnType<typeof createHostLease>;
