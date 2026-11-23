/*
 * 0.6.15 (owner 27/10/2026, «Ammetterla con avviso», then «Quella da amministratore»): a TALOS window running as administrator may
 * be controlled from a device, with a fixed warning; and since Windows does not let a normal process open an administrator process's
 * channel (a named pipe's default security: Everyone may only read, and an elevated token's default owner is Administrators —
 * CreateNamedPipe, Microsoft Learn), the administrator window is the bridge whenever it is open (tui-remote.ts).
 * Whether THIS process runs as administrator: on Windows the token's mandatory label, High or System (`whoami /groups`, read by its
 * SID because the names are localised — the same reader as the sandbox probe, sandbox-boundary-probe.ts). The token, not the group:
 * an administrator account in a normal window is Medium, as `@neotales/is-elevated` reads TokenElevation rather than membership, and
 * Codex (`windows_peer.rs`) and .NET (`PipeOptions.CurrentUserOnly`) judge the same thing. `whoami.exe` by its full path: the one of
 * Git for Windows earlier on the PATH answers an error. Measured 27/10/2026: 27–33 ms, asked once per process, only when remote
 * control is on. Elsewhere: root.
 */
import {execFile} from 'node:child_process';
import {win32} from 'node:path';
import {readTokenGroups} from '../security/sandbox-boundary-probe.ts';

export type ElevationDeps={
  platform?:NodeJS.Platform;
  systemRoot?:string|null;
  run?:(file:string,args:string[],env:Record<string,string>)=>Promise<string>;
  getuid?:()=>number;
};
const DEFAULT_SYSTEM_ROOT='C:\\Windows';
/* Desktop review at landing in r4 (e7b73d6d0, 27/10/2026): `whoami` gets only SystemRoot, never this process's whole environment
   (provider keys and tokens; the kernel's SPAWN-AMBIENTE-01 gate). Measured there: it answers the same with `{SystemRoot}`, ~30 ms. */
export const runFile=(file:string,args:string[],env:Record<string,string>)=>new Promise<string>((resolve,reject)=>{
  execFile(file,args,{windowsHide:true,timeout:10_000,env:{...env}},(error,stdout)=>error?reject(error):resolve(String(stdout)));
});

/** True when this process runs as administrator (Windows: High or System integrity) or as root; false when it does not or cannot tell. */
export async function detectElevation(deps:ElevationDeps={}):Promise<boolean>{
  try{
    const platform=deps.platform??process.platform;
    /* a getuid that throws is «cannot tell»: inside the try */
    if(platform!=='win32'){const getuid='getuid' in deps?deps.getuid:process.getuid?.bind(process);return getuid?.()===0;}
    /* an empty or relative SystemRoot (`Windows`, or drive-relative `C:Windows`) would make `System32\whoami.exe` relative, looked up
       in the current folder, where a planted file could answer «High»: only an absolute root, or the default one */
    const given='systemRoot' in deps?deps.systemRoot:process.env.SystemRoot;
    /* block 8 C-R2 (mirrored from the kernel's 1abc52393): win32.isAbsolute also says yes to `\Windows` (on the current folder's drive)
       and to a network root `\\server\share` — only a drive-letter root counts */
    const root=typeof given==='string'&&/^[A-Za-z]:\\/u.test(given)?given:DEFAULT_SYSTEM_ROOT;
    const {integrity}=readTokenGroups(await (deps.run??runFile)(win32.join(root,'System32','whoami.exe'),['/groups','/fo','csv','/nh'],{SystemRoot:root}));
    return integrity==='high'||integrity==='system';
  }catch{return false;}
}

let cached:Promise<boolean>|null=null;
/** This process's answer, asked once. */
export function processElevated():Promise<boolean>{return cached??=detectElevation();}
