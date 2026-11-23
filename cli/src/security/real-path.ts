import fs from 'node:fs';
import path from 'node:path';

/*
 * Stress test 0.5.4, F-E-001 (S2). Inside the shipped sandbox (microsoft-mxc-0.8.0) the NATIVE realpath fails with EPERM for every path
 * (fs.promises.realpath and fs.realpathSync.native: libuv asks Windows for the final path name, and the container is refused), while
 * stat, lstat, readlink, open and the JavaScript realpathSync all work. TALOS run as a child of its own shell then exited 70 on
 * `provider list` and refused every Write ("write path could not be resolved").
 *
 * The fallback is the JavaScript realpath, which walks the path with lstat/readlink and so still follows every link. It does not
 * expand Windows 8.3 short names nor the `\\?\` prefix (evaluate.ts, measured 2026-09-16), so it is used only when the native answer
 * was refused, and a result that still carries a short-name segment is refused too: the original error stands, and the callers keep
 * failing closed exactly as before. Precedents: the shared kernel's `realpathTollerante` (pavimento-comandi.mjs) and the stress tester's
 * own instrument fix (audit 0.5.4, harness/shim-realpath.cjs: async realpath falls back to the sync one on EPERM/EACCES).
 */
const REFUSED=new Set(['EPERM','EACCES']);
const SHORT_NAME=/(?:^|[\\/])[^\\/]*~\d[^\\/]*(?=[\\/]|$)/u;
function refused(error:unknown):boolean{return REFUSED.has(String((error as NodeJS.ErrnoException|null)?.code));}
/*
 * Stress test 0.5.5, F-E-001 (S1): a folder reached by its 8.3 short name (C:\Users\me\DOWNLO~1\…) inside the sandbox kept that name,
 * because the native realpath that expands it is refused there; the kernel's workspace watcher then handed libuv a short-name folder,
 * and libuv aborts the whole process on the first event (src/win/fs-event.c:72, `!_wcsnicmp(filename, dir, dirlen)`, libuv #5010):
 * exit 0xC0000409 with the written file still empty. Measured on 12/10/2026 in the real sandbox; the long path works.
 * The long name is found without the native call: stat works in the sandbox, so a short segment is matched to the entry of its parent
 * folder that is the SAME file (device and file index). Exactly one match, or the name is not proven and null comes back.
 * Precedents: Cline (agenda-task-manager.ts, resolveWatchRoot: fs.watch only on the resolved form, otherwise no watcher), t3code
 * (testing/longTempDir.ts: TEMP moved to its long form), the shared kernel's workspace-watcher.mjs (formaLunga, libuv #5010).
 */
const SHORT_SEGMENT=/~\d/u;
function sameFile(a:fs.BigIntStats,b:fs.BigIntStats):boolean{return a.ino!==0n&&a.ino===b.ino&&a.dev===b.dev;}
/** The long form of every 8.3 segment of an absolute Windows path, by file identity; the path itself when it has none; null when one cannot be proven. */
export function expandShortNames(target:string):string|null{
  if(!SHORT_NAME.test(target))return target;
  const {root}=path.win32.parse(target);
  let current=root;
  for(const segment of target.slice(root.length).split(/[\\/]+/u).filter(Boolean)){
    const next=path.win32.join(current,segment);
    if(!SHORT_SEGMENT.test(segment)){current=next;continue;}
    let names:string[];let wanted:fs.BigIntStats;
    /* lstat, never stat: a link to the folder (`Programmi` → `Program Files`, measured) is the same file once followed, and two matches prove nothing */
    try{names=fs.readdirSync(current);wanted=fs.lstatSync(next,{bigint:true});}catch{return null;}
    /* an entry that really is called `notes~1` is its own long name */
    if(names.includes(segment)){current=next;continue;}
    const matches=names.filter(name=>{try{return sameFile(fs.lstatSync(path.win32.join(current,name),{bigint:true}),wanted);}catch{return false;}});
    if(matches.length!==1)return null;
    current=path.win32.join(current,matches[0]!);
  }
  return current;
}
/** On Windows, a path with its 8.3 segments expanded; anything that cannot be proven, and every other platform, keeps the path as given. */
export function longPathForm(target:string,platform:NodeJS.Platform=process.platform):string{
  if(platform!=='win32'||!SHORT_NAME.test(target))return target;
  return expandShortNames(target)??target;
}

/* The walk's own failure is the true answer (ENOENT for a path that does not exist yet, which callers resolve through its parent);
   only a short name that cannot be expanded brings back the refusal. */
function fallback(target:string,original:unknown):string{
  const real=fs.realpathSync(target);
  if(!SHORT_NAME.test(real))return real;
  const long=process.platform==='win32'?expandShortNames(real):null;
  if(long===null)throw original;
  return long;
}

/** `fs.promises.realpath`, or the JavaScript walk when the native answer is refused by a sandbox. */
export async function realpathTolerant(target:string):Promise<string>{
  try{return await fs.promises.realpath(target);}
  catch(error){if(!refused(error))throw error;return fallback(target,error);}
}

/** `fs.realpathSync.native`, or the JavaScript walk when the native answer is refused by a sandbox. */
export function realpathNativeTolerant(target:string):string{
  try{return fs.realpathSync.native(target);}
  catch(error){if(!refused(error))throw error;return fallback(target,error);}
}
