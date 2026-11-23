import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {findTalosRepoRoot} from '../runtime/repo.ts';
import {tokenizeCommand} from './rule-parser.ts';
import type {PermissionAction} from './types.ts';

/*
 * A5h (owner 19/11/2026, giudice v2266, stake 4): whether a card names a TALOS control file by its path, read with the kernel's
 * OWN rule (harness-ui/src/path-policy.mjs `ePercorsoDiControllo`: hooks, MCP, instructions, memory, `.talos/`, the computer use
 * settings, on the real path), loaded once from the kernel the session runs, as tui/tools/argument-masks.ts loads its masks. Used
 * only to keep a mark, never to lift one: without the kernel's function, or with a path or a command it cannot read, the answer is
 * «yes, it may» (fail closed: in doubt the mark stays). A shell command is read word by word, its redirects and `--x=value` split.
 * CLI 0.6.17 (A5i, 19/11/2026) took this file from the 0.7.0 line byte for byte, for accept edits only (a file command toward a
 * control file asks instead of going by itself); in 0.7.0 the same rule serves both accept edits and an agent's card.
 */
type ControlCheck=(root:string,target:string)=>boolean;
let kernelCheck:ControlCheck|null=null;
try{const module=await import(pathToFileURL(join(findTalosRepoRoot(),'harness-ui','src','path-policy.mjs')).href) as {ePercorsoDiControllo?:ControlCheck};kernelCheck=typeof module.ePercorsoDiControllo==='function'?module.ePercorsoDiControllo:null;}catch{kernelCheck=null;}

/* a word TALOS cannot turn into one path: a variable, a substitution, a home, a glob */
const UNREADABLE=/[$`%~*?[\]{}]/u;
/* Cure round 1 (giudice, G1 of the reviewer of A5f + A5h): if the CLI cannot say where a command writes, the mark stays. A backslash
   anywhere is not read (an escape for one shell, a separator inside quotes for PowerShell, cmd and POSIX single quotes: `tokenizeCommand`
   reads '.talos\hooks.json' as `.taloshooks.json`), and an option glued to its value (`-Path:.talos/…`, `-o.claude/…`) is read as a
   path too, after the colon and after its letter. */
function commandTargets(command:string):string[]|null{
  if(command.includes('\\'))return null;
  const words=tokenizeCommand(command);if(!words.length)return null;
  const out:string[]=[];
  for(const word of words){
    if(UNREADABLE.test(word))return null;
    for(const piece of word.split(/[<>|;&()=,]+/u)){
      if(!piece)continue;
      if(!piece.startsWith('-')){out.push(piece);continue;}
      const bare=piece.replace(/^-+/u,'');const colon=bare.indexOf(':');
      out.push(bare,bare.slice(1),...(colon>=0?[bare.slice(colon+1)]:[]));
    }
  }
  return out.filter(Boolean);
}
/* Each word is read as the file it names, as a folder something is copied or moved INTO (`cp x .talos`, `cp -r cfg skills`: the kernel's
   rule looks only at the folders above the last piece), and without the dots and spaces Windows drops at the end (`AGENTS.md.`). */
function readings(target:string):string[]{
  const trimmed=target.replace(/[. ]+$/u,'');
  return [target,`${target.replace(/[\\/]+$/u,'')}/x`,...(trimmed&&trimmed!==target?[trimmed]:[])];
}
/** True when the card may touch a control file: its path, the file the kernel named, or any word of its command. */
export function namesControlFile(action:PermissionAction,projectRoot:string,check:ControlCheck|null=kernelCheck):boolean{
  if(!check)return true;
  const targets=[action.resource,action.sensitivePath].filter((value):value is string=>typeof value==='string'&&value.length>0);
  if(typeof action.command==='string'){const words=commandTargets(action.command);if(!words)return true;targets.push(...words);}
  try{return targets.some(target=>readings(target).some(reading=>check(projectRoot,reading)===true));}catch{return true;}
}
/** Whether the kernel's rule was found; for the tests and the diagnostics. */
export function controlPathCheckLoaded():boolean{return kernelCheck!==null;}
