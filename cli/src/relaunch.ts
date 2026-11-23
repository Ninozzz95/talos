/*
 * FE-048, Nuova sessione: another folder. In the CLI the folder enters trust, plugins, MCP, hooks, checkpoints and settings once, at the
 * start, so TALOS leaves in order and starts again there, in the same terminal (FORMA-AVVIO-HOME-E-CARICAMENTI, risks from Desktop, words
 * from Frontend). It runs after `main` returned: the screen is closed, the end-of-session hooks ran, the terminal is as it was. Every check
 * of a normal start runs again, trust first. The child gets none of this command line and the environment of the first start.
 */
import {spawnSync} from 'node:child_process';
import {statSync} from 'node:fs';
import {basename} from 'node:path';
import {LAUNCH_ENV} from './launch-env.ts';
import {t} from './i18n/index.ts';

let wanted:string|null=null;
export const requestRelaunch=(folder:string|null)=>{wanted=folder;};
export const relaunchWanted=()=>wanted;
export const RELAUNCHED_ENV='TALOS_RELAUNCHED';

type Spawned={status:number|null;error?:Error};
export type RelaunchDeps={spawn?:(command:string,args:readonly string[],options:any)=>Spawned;write?:(text:string)=>void;node?:string;script?:string;flags?:readonly string[];env?:Record<string,string|undefined>;isFolder?:(path:string)=>boolean;
  /* the keyboard belongs to the child: no reading here, and Ctrl+C does not end the one who waits */quiet?:()=>void};
const folderExists=(path:string)=>{try{return statSync(path).isDirectory();}catch{return false;}};
function quietParent(){
  /* measured in ConPTY: a paused stream still holds a read on the console, and the child's first keys went there. Closed, it holds none */
  try{(process.stdin as any).setRawMode?.(false);process.stdin.pause();process.stdin.destroy();}catch{/* no terminal */}
  for(const signal of ['SIGINT','SIGBREAK'] as const)process.on(signal,()=>{});
}

/** Waits for the TALOS of the other folder and gives back its exit code. When it cannot start, it says why and how to try again. */
export function relaunch(folder:string,{spawn=spawnSync as any,write=text=>process.stderr.write(text),node=process.execPath,script=process.argv[1]!,flags=process.execArgv,env=LAUNCH_ENV,isFolder=folderExists,quiet=quietParent}:RelaunchDeps={}):number{
  const failed=(why:string)=>{write(`${t('screen.relaunch.failed',{folder,why})}\n${t('screen.relaunch.retry',{folder})}\n`);return 1;};
  if(!isFolder(folder))return failed(t('screen.relaunch.noFolder'));
  write(`⠙ ${t('screen.relaunch.opening',{name:basename(folder)})}\n`);
  quiet();
  const out=spawn(node,[...flags,script],{cwd:folder,stdio:'inherit',env:{...env,[RELAUNCHED_ENV]:'1'}});
  return out.error?failed(out.error.message):out.status??1;
}
