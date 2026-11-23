import {mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import path from 'node:path';

/*
 * Stress test 0.5.4, F-E-001, second half (owner 11/10/2026, through the desktop session: «SÌ, iniettare la correzione nei comandi
 * isolati (NODE_OPTIONS --require), dichiarata a schermo»). Inside the MXC sandbox the NATIVE realpath answers EPERM for every
 * path, so the person's own Node programs run by the shell tool (vite, eslint, a test runner…) fail where they would work on the
 * host. TALOS's own code falls back in real-path.ts; the person's programs get the same fallback from this preload, which a
 * sandboxed command receives as `NODE_OPTIONS=--require "<file>"`. Only a refused answer (EPERM/EACCES) is replaced, by the
 * JavaScript walk that still follows every link; any other error stays. Precedent: the stress tester's instrument
 * (audit 0.5.4 harness/shim-realpath.cjs), on both entry points.
 */
export const SANDBOX_REALPATH_PRELOAD=`'use strict';
// TALOS: inside the TALOS sandbox Windows refuses the native realpath (EPERM); fall back to the JavaScript walk.
const fs=require('node:fs');const fsp=require('node:fs/promises');
const refused=e=>e&&(e.code==='EPERM'||e.code==='EACCES');
function patchAsync(o){if(!o||typeof o.realpath!=='function'||o.__talosRealpath)return;const native=o.realpath.bind(o);
  const realpath=async function realpath(p,opts){try{return await native(p,opts);}catch(e){if(!refused(e))throw e;return fs.realpathSync(p,opts);}};
  try{Object.defineProperty(o,'realpath',{value:realpath,configurable:true,writable:true});o.__talosRealpath=true;}catch{}}
function patchNative(){const native=fs.realpathSync.native;if(typeof native!=='function'||native.__talosRealpath)return;
  const wrapped=function native2(p,opts){try{return native(p,opts);}catch(e){if(!refused(e))throw e;return fs.realpathSync(p,opts);}};wrapped.__talosRealpath=true;
  try{fs.realpathSync.native=wrapped;}catch{}}
patchAsync(fs.promises);patchAsync(fsp);patchNative();
try{require('node:module').syncBuiltinESMExports();}catch{}
`;
const FILE='talos-sandbox-realpath.cjs';
/** Where the preload lives (what `talos doctor` declares); nothing is written. */
export function sandboxRealpathPreloadPath(cacheRoot:string):string{return path.join(cacheRoot,'sandbox',FILE);}

/** The preload written once under the cache (rewritten only when its bytes differ); null when it cannot be written. */
export function ensureSandboxRealpathPreload(cacheRoot:string):string|null{
  const dir=path.join(cacheRoot,'sandbox');const file=path.join(dir,FILE);
  try{if(readFileSync(file,'utf8')===SANDBOX_REALPATH_PRELOAD)return file;}catch{/* not there yet */}
  try{
    mkdirSync(dir,{recursive:true});
    const temp=`${file}.${process.pid}.tmp`;writeFileSync(temp,SANDBOX_REALPATH_PRELOAD,'utf8');renameSync(temp,file);
    return file;
  }catch{return null;}
}

/**
 * The NODE_OPTIONS value a sandboxed command receives. Quoted (a path with spaces), and with FORWARD slashes: inside double quotes
 * Node's NODE_OPTIONS parser takes a backslash as an escape — measured in the real sandbox on 11/10/2026, `--require "C:\Users\…"`
 * reached the loader as `C:Usersperson…` and every Node program exited 1 with "Cannot find module". Windows takes `/` in paths.
 */
export function sandboxNodeOptions(preload:string):string{return `--require "${preload.replaceAll('\\','/')}"`;}
