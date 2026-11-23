/*
 * 0.6.15 (owner 26/10/2026: «Scaricato al primo uso», «pacchetto npm a parte»): the native iroh binding remote control needs
 * (17.4 MB, win32-x64 only) is NOT in the CLI's package. The first `talos remote` downloads it from the npm registry, as its own
 * package `talos-code-remote-win32-x64`, and keeps it in the data folder. The binding is native code that runs inside TALOS, so
 * it is trusted only by the SHA-256 fixed here, in the CLI's own published code:
 * - esbuild's fallback (lib/npm/node-install.ts `downloadDirectlyFromNPM`, read 26/10/2026) fetches
 *   `registry.npmjs.org/<pkg>/-/<pkg>-<version>.tgz`, takes ONE file out of the tar with a dependency-free reader and checks a
 *   SHA-256 pinned in its package.json (`binaryIntegrityCheck`). Same shape here, plus: a size ceiling before and after gunzip,
 *   only a regular file at exactly `package/<file>` is taken, the file is checked again before every load;
 * - the desktop loads the same binding only when its SHA-256 matches (harness-ui/src/remoto/binding.mjs `trovaBindingIroh`);
 * - the binding itself is built by `iroh-binding.yml` from iroh-ffi v1.1.0 with our Cargo.lock (rustls 0.23.46) and attested.
 * The registry's own integrity field is not trusted alone: a pinned hash in the CLI is what a publisher change cannot move.
 */
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';

export const IROH_COMPONENT=Object.freeze({
  package:'talos-code-remote-win32-x64',
  version:'1.1.0',
  file:'iroh.win32-x64-msvc.node',
  sha256:'4047896d91c101633e06795ea764ad31114252e58152f4a19f62400efc6adda1',
  bytes:17_411_072,
});
/*
 * Where the pinned binding was built: the attested run of the monorepo's iroh-binding.yml (harness-ui/native/iroh-binding.json
 * at r4 849c4fb17). Only scripts/stage-remote-component.mjs reads it, to make the npm package from that run and nothing else;
 * GitHub keeps the run's artifact until `expires`, the published package keeps it for good.
 */
export const IROH_COMPONENT_SOURCE=Object.freeze({
  repository:'Ninozzz95/talos',
  workflow:'.github/workflows/iroh-binding.yml',
  runId:39686248443,
  artifact:'iroh-win32-x64-msvc',
  sourceCommit:'2ea6f9fecbb061210a953d3909095af85668411d',
  sourceRef:'refs/heads/main',
  irohFfi:{repository:'n0-computer/iroh-ffi',tag:'v1.1.0',commit:'5e451092dba0c1a09ee83ff6e5be37b1152a5c58'},
  expires:'2027-01-19',
});
export const IROH_REGISTRY='https://registry.npmjs.org';
/* A ceiling well above the real sizes (the tarball is a few MB under the binding): a hostile answer cannot fill the disk or memory. */
export const IROH_MAX_TARBALL_BYTES=40*1024*1024;
export const IROH_MAX_UNPACKED_BYTES=64*1024*1024;

export type IrohComponentSpec={readonly package:string;readonly version:string;readonly file:string;readonly sha256:string};
export type IrohComponentFailure='REMOTE_COMPONENT_UNSUPPORTED'|'REMOTE_COMPONENT_DOWNLOAD_FAILED'|'REMOTE_COMPONENT_TOO_LARGE'|'REMOTE_COMPONENT_NOT_IN_PACKAGE'|'REMOTE_COMPONENT_HASH_MISMATCH';
function failure(code:IrohComponentFailure,detail?:Record<string,unknown>):Error{return Object.assign(new Error(code),{code,...(detail?{detail}:{})});}

/** Only win32-x64 has a binding today (the iroh-binding.yml run builds that one); elsewhere remote control says it is not available. */
export function irohComponentSupported(platform:string=process.platform,arch:string=process.arch):boolean{return platform==='win32'&&arch==='x64';}
export function irohComponentPath(dataRoot:string,spec:IrohComponentSpec=IROH_COMPONENT):string{return join(dataRoot,'remote','iroh',spec.version,spec.file);}
export function irohTarballUrl(registry:string=IROH_REGISTRY,spec:IrohComponentSpec=IROH_COMPONENT):string{
  const {package:name,version}=spec;
  return `${registry.replace(/\/+$/u,'')}/${name}/-/${name}-${version}.tgz`;
}
function sha256(bytes:Uint8Array):string{return createHash('sha256').update(bytes).digest('hex');}

/** Whether the file on disk is exactly the pinned binding. A missing or unreadable file is not. */
export function irohComponentReady(dataRoot:string,spec:IrohComponentSpec=IROH_COMPONENT):boolean{
  const file=irohComponentPath(dataRoot,spec);
  if(!existsSync(file))return false;
  try{return sha256(readFileSync(file))===spec.sha256;}catch{return false;}
}

function octal(block:Buffer,offset:number,length:number):number{
  const text=block.subarray(offset,offset+length).toString('latin1').replace(/\0.*$/su,'').trim();
  return /^[0-7]+$/u.test(text)?parseInt(text,8):Number.NaN;
}
function field(block:Buffer,offset:number,length:number):string{return block.subarray(offset,offset+length).toString('utf8').replace(/\0.*$/su,'');}

/**
 * The one file `package/<name>` of an npm tarball (ustar), or null. Only a regular file (type '0' or NUL) at exactly that
 * path counts: a link, a directory or a name with `..` never does, whatever its name says.
 */
export function fileFromTar(tar:Buffer,name:string):Buffer|null{
  const wanted=`package/${name}`;
  for(let at=0;at+512<=tar.length;){
    const header=tar.subarray(at,at+512);
    if(header.every(byte=>byte===0))return null;
    const size=octal(header,124,12);
    if(!Number.isFinite(size)||size<0)return null;
    const prefix=field(header,345,155);
    const path=prefix?`${prefix}/${field(header,0,100)}`:field(header,0,100);
    const type=header[156];
    const start=at+512;
    if(path===wanted&&(type===0x30||type===0)){
      if(start+size>tar.length)return null;
      return Buffer.from(tar.subarray(start,start+size));
    }
    at=start+Math.ceil(size/512)*512;
  }
  return null;
}

/** The binding from a downloaded tarball, checked: the right size class, the one file, the pinned hash. */
export function irohComponentFromTarball(tgz:Buffer,spec:IrohComponentSpec=IROH_COMPONENT):Buffer{
  if(tgz.length>IROH_MAX_TARBALL_BYTES)throw failure('REMOTE_COMPONENT_TOO_LARGE',{bytes:tgz.length});
  let tar:Buffer;
  try{tar=gunzipSync(tgz,{maxOutputLength:IROH_MAX_UNPACKED_BYTES});}
  catch(error){throw (error as NodeJS.ErrnoException)?.code==='ERR_BUFFER_TOO_LARGE'?failure('REMOTE_COMPONENT_TOO_LARGE'):failure('REMOTE_COMPONENT_DOWNLOAD_FAILED',{reason:'not a gzip archive'});}
  const file=fileFromTar(tar,spec.file);
  if(!file)throw failure('REMOTE_COMPONENT_NOT_IN_PACKAGE');
  const found=sha256(file);
  if(found!==spec.sha256)throw failure('REMOTE_COMPONENT_HASH_MISMATCH',{expected:spec.sha256,found});
  return file;
}

export type FetchLike=(url:string,init?:{signal?:AbortSignal})=>Promise<{ok:boolean;status:number;arrayBuffer():Promise<ArrayBuffer>;headers?:{get(name:string):string|null}}>;

/**
 * Makes sure the binding is in the data folder, downloading it the first time. Returns its path. Never in a test profile's
 * real data folder by accident: the caller passes the profile's own `dataRoot`. The file is written next to its final name
 * and renamed, so a half-written file never has the final name.
 */
export async function ensureIrohComponent(input:{dataRoot:string;fetch?:FetchLike;registry?:string;signal?:AbortSignal;platform?:string;arch?:string;spec?:IrohComponentSpec}):Promise<string>{
  const spec=input.spec??IROH_COMPONENT;
  if(!irohComponentSupported(input.platform,input.arch))throw failure('REMOTE_COMPONENT_UNSUPPORTED',{platform:input.platform??process.platform,arch:input.arch??process.arch});
  const target=irohComponentPath(input.dataRoot,spec);
  if(irohComponentReady(input.dataRoot,spec))return target;
  const get=input.fetch??(globalThis.fetch as unknown as FetchLike);
  const url=irohTarballUrl(input.registry,spec);
  let response;
  try{response=await get(url,input.signal?{signal:input.signal}:{});}
  catch(error){throw failure('REMOTE_COMPONENT_DOWNLOAD_FAILED',{url,reason:String((error as Error)?.message??error).slice(0,200)});}
  if(!response.ok)throw failure('REMOTE_COMPONENT_DOWNLOAD_FAILED',{url,status:response.status});
  const declared=Number(response.headers?.get('content-length')??Number.NaN);
  if(Number.isFinite(declared)&&declared>IROH_MAX_TARBALL_BYTES)throw failure('REMOTE_COMPONENT_TOO_LARGE',{bytes:declared});
  const binding=irohComponentFromTarball(Buffer.from(await response.arrayBuffer()),spec);
  const dir=join(input.dataRoot,'remote','iroh',spec.version);
  mkdirSync(dir,{recursive:true});
  const temporary=join(dir,`.${spec.file}.${randomUUID()}.tmp`);
  try{writeFileSync(temporary,binding);renameSync(temporary,target);}
  catch(error){rmSync(temporary,{force:true});throw error;}
  return target;
}

/**
 * Loads the binding, checking its hash again right before (a file swapped after the download is never loaded). Null when it is
 * absent or not the pinned one: remote control then says it is not available.
 */
/*
 * T4 research §5.10 (measured 26/10/2026): the kernel's `stato()` asks for the binding each time, and hashing the 17.4 MB file took a
 * median 12 ms — about 48 ms a second of blocked screen while pairing polls four times a second, in the window that hosts. A binding
 * loaded once stays loaded (Node's module cache returns that same module whatever the disk says later), so the hash proves nothing
 * after the first load: the verified binding is kept per loader and file, and the file is hashed again only until it loads.
 */
const loadedBindings=new WeakMap<(file:string)=>unknown,Map<string,unknown>>();
const defaultLoad=createRequire(import.meta.url);
export function loadIrohComponent(dataRoot:string,load:(file:string)=>unknown=defaultLoad,spec:IrohComponentSpec=IROH_COMPONENT):unknown{
  const file=irohComponentPath(dataRoot,spec);
  let byFile=loadedBindings.get(load);
  const known=byFile?.get(`${file}\u0000${spec.sha256}`);
  if(known!==undefined)return known;
  if(!irohComponentReady(dataRoot,spec))return null;
  const binding=load(file);
  if(binding!==null&&binding!==undefined){
    if(!byFile){byFile=new Map();loadedBindings.set(load,byFile);}
    byFile.set(`${file}\u0000${spec.sha256}`,binding);
  }
  return binding;
}
