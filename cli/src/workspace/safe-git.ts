/*
 * Git without the commands of the repository's own configuration (PROPOSTA-GIT-SICURO-2026-10-31, Desktop rev. 4, OK of the CLI). A
 * folder copied by hand brings its `.git/config`, and `core.fsmonitor`, `filter.<n>.clean` or a hook in `.git/hooks` run by themselves
 * on a plain `git status`. Every Git that TALOS starts on its own takes these arguments; what the person types does not pass here.
 * One source for the keys: the kernel's git-sicuro.mjs, here reached as the CLI reaches every kernel module.
 */
import {existsSync} from 'node:fs';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';
import {isReadOnlyShellCommand,tokenizeCommand} from '../security/rule-parser.ts';
import {segmentShellCommand} from '../security/shell-segmentation.ts';

type SafeGitKernel={
  argomentiGitSicuri(cartella:string):Promise<string[]|null>;
  chiaviEseguibiliLocali(cartella:string):Promise<string[]|null>;
  aggiunteConChiaviSpente(envBase:Record<string,string|undefined>,chiavi:readonly string[]):Record<string,string>;
  cartellaGitDelComando(argomenti:readonly string[],cwd:string):string;
  ARGOMENTI_DIFF_SICURI:readonly string[];
};
let kernel:Promise<SafeGitKernel>|null=null;
const loaded=()=>(kernel??=importTalosModule(findTalosRepoRoot(process.cwd()),'kernel/git-sicuro.mjs') as Promise<SafeGitKernel>);

/* A capture starts about ten Git in a row in one folder: they share one reading. The kernel keeps no cache because nothing tells it
   when the files change; this one lasts less than the capture and is never kept across a turn. */
const SHARED_MS=1000;
const shared=new Map<string,{at:number;args:Promise<readonly string[]|null>}>();

/** The `-c` pairs to put before the subcommand, or null when Git could not say what the folder holds: the caller then skips the read. */
export function safeGitArgs(cwd:string,now:()=>number=Date.now):Promise<readonly string[]|null>{
  const seen=shared.get(cwd);
  if(seen&&now()-seen.at<SHARED_MS)return seen.args;
  const args=loaded().then(module=>module.argomentiGitSicuri(cwd));
  shared.set(cwd,{at:now(),args});
  return args;
}
/** The switches `diff`, `show` and `log` take so that no configured program runs on the files. */
export async function safeGitDiffArgs():Promise<readonly string[]>{return(await loaded()).ARGOMENTI_DIFF_SICURI;}

/**
 * The environment for a read-only Git the MODEL asked for: its text is never rewritten with `-c` (a hostile filter name would be an
 * injection), so the cure goes in the environment (FORMA-AGGIUNTE-AMBIENTE). `{}` when the command is not a read-only Git, `null` when
 * Git could not say what a folder brings: then the command does not run.
 */
export async function safeGitEnvironment(command:string,cwd:string,env:Record<string,string|undefined>=process.env):Promise<Record<string,string>|null>{
  if(!isReadOnlyShellCommand(command))return{};
  let tokens:string[][];try{tokens=segmentShellCommand(command).map(segment=>tokenizeCommand(segment.command));}catch{return{};}
  const gits=tokens.filter(row=>row[0]?.toLowerCase()==='git');
  if(!gits.length)return{};
  /* no folder, no command: the shell cannot start there, so nothing can read a configuration, and the error it gives is the true one */
  if(!existsSync(cwd))return{};
  const module=await loaded();
  const keys=new Set<string>();
  for(const folder of new Set(gits.map(row=>module.cartellaGitDelComando(row.slice(1),cwd)))){
    const found=await module.chiaviEseguibiliLocali(folder);
    if(found===null)return null;
    for(const key of found)keys.add(key);
  }
  return module.aggiunteConChiaviSpente(env,[...keys]);
}
