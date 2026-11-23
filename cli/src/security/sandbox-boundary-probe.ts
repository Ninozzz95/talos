import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {connect} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {isolationCheckAborted,type SandboxedSpawn} from './process-tree-probe.ts';

/*
 * F-021 (second CLI stress test, 03/10/2026; owner: «Banner solo misurato»). The line on every command said «isolation verified:
 * AppContainer on, filesystem bfs, network deny…» and the AppContainer part was a constant (`mxc-execution-backend.ts`), never
 * measured. Measured on this host with the real SDK: the command runs at LOW integrity (S-1-16-4096) with NO AppContainer SID
 * (S-1-15-2-…) — an MXC base container, which Codex's own MXC crate says «never invokes MXC's AppContainer dispatcher»
 * (`codex-rs/mxc-sandbox/README.md`, clone c73775f, 02/10/2026). So the boundary is measured here, inside the same containment
 * the commands get, and the line says only what this measured:
 *   - the token: an AppContainer SID or not, and the integrity level (Microsoft well-known SIDs S-1-15-2-…, S-1-16-…);
 *   - a write to a folder the command was NOT granted: blocked or allowed;
 *   - the network: only when the host itself reaches it (otherwise «blocked» would be the network's fault, not the sandbox's).
 * Reads are not confined on purpose (the volume root is granted read-only, upstream microsoft/mxc#1109): the line says so.
 */
export type SandboxIntegrity='untrusted'|'low'|'medium'|'high'|'system';
export type SandboxBoundaryEvidence={
  appContainer:boolean|null;
  integrity:SandboxIntegrity|null;
  writesOutside:'blocked'|'allowed'|'not measured';
  network:'blocked'|'open'|'not measured';
};
export const BOUNDARY_NOT_MEASURED:SandboxBoundaryEvidence=Object.freeze({appContainer:null,integrity:null,writesOutside:'not measured',network:'not measured'});

const INTEGRITY:ReadonlyArray<[string,SandboxIntegrity]>=[['S-1-16-0','untrusted'],['S-1-16-4096','low'],['S-1-16-8192','medium'],['S-1-16-8448','medium'],['S-1-16-12288','high'],['S-1-16-16384','system']];
/** One row of `whoami /fo csv`: quoted fields, quotes doubled inside a field (the kernel's elevazione.mjs `campiCsv`, 1abc52393). */
function csvFields(row:string):string[]{
  const fields:string[]=[];const re=/"((?:[^"]|"")*)"(?:,|$)/gu;
  for(let m=re.exec(row);m!==null;m=re.exec(row))fields.push(m[1]!.replace(/""/gu,'"'));
  return fields;
}
/**
 * `whoami /groups /fo csv`: the AppContainer SID and the mandatory label, read from the SIDs (the names are localised).
 * Block 8 C-R3 (the Desktop's review, mirrored from the kernel's 1abc52393): only the SID column (the third) of each row counts, never
 * the first `"S-1-16-…"` anywhere in the text — a group NAME holding `"S-1-16-12288"` (quotes doubled by the CSV) made a Medium token
 * read as High. The same for the AppContainer SID.
 */
export function readTokenGroups(csv:string):{appContainer:boolean|null;integrity:SandboxIntegrity|null}{
  const sids=String(csv??'').replace(/^﻿/u,'').split(/\r?\n/u).map(row=>csvFields(row.trim())[2]).filter((sid):sid is string=>typeof sid==='string'&&/^S-1-[\d-]+$/u.test(sid));
  if(!sids.length)return{appContainer:null,integrity:null};
  const label=sids.find(sid=>/^S-1-16-\d+$/u.test(sid))??null;
  return{appContainer:sids.some(sid=>/^S-1-15-2-[\d-]+$/u.test(sid)),integrity:INTEGRITY.find(([sid])=>sid===label)?.[1]??null};
}

export type SandboxBoundaryProbeDeps={
  platform?:NodeJS.Platform;
  spawn:SandboxedSpawn;
  tempRoot?:string;
  comSpec?:string;
  nodeExecutable?:string;
  /** Whether the HOST reaches the network; injectable for tests. */
  hostReachesNetwork?:()=>Promise<boolean>;
  timeoutMs?:number;
  signal?:AbortSignal;
};

const NETWORK_TARGET={host:'1.1.1.1',port:443};
function reach({host,port}:{host:string;port:number},timeoutMs:number):Promise<boolean>{
  return new Promise(resolve=>{
    const socket=connect({host,port});const done=(ok:boolean)=>{socket.destroy();resolve(ok);};
    socket.setTimeout(timeoutMs,()=>done(false));socket.once('connect',()=>done(true));socket.once('error',()=>done(false));
  });
}

export function createSandboxBoundaryProbe(deps:SandboxBoundaryProbeDeps):()=>Promise<SandboxBoundaryEvidence>{
  const platform=deps.platform??process.platform;
  const tempRoot=deps.tempRoot??tmpdir();
  const comSpec=deps.comSpec??process.env.ComSpec??'cmd.exe';
  const nodeExecutable=deps.nodeExecutable??process.execPath;
  const timeoutMs=deps.timeoutMs??30_000;
  const hostReachesNetwork=deps.hostReachesNetwork??(()=>reach(NETWORK_TARGET,3_000));
  const signal=deps.signal;
  /* one command in the sandbox, the granted folder as its working directory; true when it ran and exited */
  const run=async(directory:string,executable:string,args:string[]):Promise<boolean>=>{
    if(signal?.aborted)throw isolationCheckAborted();
    let handle;
    try{handle=await deps.spawn({executable,args,cwd:directory,probeDirectory:directory});}catch{return false;}
    let timer:ReturnType<typeof setTimeout>|undefined;
    const exit=await Promise.race([handle.exited.then(()=>'exited' as const),new Promise<'timeout'>(resolve=>{timer=setTimeout(()=>resolve('timeout'),timeoutMs);})]).finally(()=>{if(timer)clearTimeout(timer);});
    if(exit==='timeout'){try{await handle.kill();}catch{}return false;}
    return true;
  };
  return async()=>{
    if(platform!=='win32')return{...BOUNDARY_NOT_MEASURED};
    const directory=await mkdtemp(path.join(tempRoot,'talos-boundary-'));
    const outside=await mkdtemp(path.join(tempRoot,'talos-boundary-outside-'));
    try{
      const evidence:SandboxBoundaryEvidence={...BOUNDARY_NOT_MEASURED};
      if(await run(directory,comSpec,['/d','/s','/c','whoami /groups /fo csv > groups.csv'])){
        const read=readTokenGroups(await readFile(path.join(directory,'groups.csv'),'utf8').catch(()=>''));
        evidence.appContainer=read.appContainer;evidence.integrity=read.integrity;
      }
      const target=path.join(outside,'written.txt');
      /* the marker proves the command ran: a write that did not happen only counts as blocked when the same command wrote inside */
      if(await run(directory,comSpec,['/d','/s','/c',`echo x> inside.txt & echo x> "${target}"`])&&existsSync(path.join(directory,'inside.txt'))){
        evidence.writesOutside=existsSync(target)?'allowed':'blocked';
      }
      if(await hostReachesNetwork()){
        const script=`const s=require('net').connect({host:'${NETWORK_TARGET.host}',port:${NETWORK_TARGET.port}});const w=t=>{require('fs').writeFileSync('net.txt',t);process.exit(0)};s.setTimeout(3000,()=>w('blocked'));s.once('connect',()=>w('open'));s.once('error',()=>w('blocked'));`;
        if(await run(directory,nodeExecutable,['-e',script])){
          const said=(await readFile(path.join(directory,'net.txt'),'utf8').catch(()=>'')).trim();
          if(said==='open'||said==='blocked')evidence.network=said;
        }
      }
      if(signal?.aborted)throw isolationCheckAborted();
      return evidence;
    }finally{
      for(const dir of [directory,outside])try{await rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100});}catch{}
    }
  };
}
