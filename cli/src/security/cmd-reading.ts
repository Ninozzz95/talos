/*
 * CLI 0.6.17, the «cmd» cure (reviewer of A5i, R1-R4; giudice 19/11/2026). On Windows every command the CLI lets run reaches
 * `cmd /d /s /c "<command>"`: runtime/brokered-executor.ts:361-362 (ComSpec, else cmd.exe), security/mxc-execution-backend.ts:156-162,
 * and the kernel's spawn(…,{shell:true}) (harness-ui/src/kernel/lanciatore-windows.mjs:10-11; kernel/dove-sei.mjs tells the model
 * «The shell is cmd.exe»). cmd reads a line differently from TALOS's recognizer (shell-segmentation.ts, rule-parser.ts):
 * only double quotes quote, a backslash escapes nothing (so `\"` OPENS or CLOSES a quote), `^` is its escape, `%NAME%` (and `!NAME!`
 * with delayed expansion) expand even inside double quotes, and its built-in commands split their arguments on `, ; =` as on spaces.
 * Measured by the reviewer (19/11, mkdir only, fake profile): `mkdir 'x&mkdir second'` runs the second command, `mkdir a,b` makes two
 * folders, `mkdir x,..\escaped-comma` makes one outside the project. A command cmd would read differently is not «readable»: it never
 * goes by itself in accept edits and no allow rule or default allowance covers it (permission-engine.ts, evaluate.ts). It was already
 * so in 0.6.16. This is the ONE place that says the shell is cmd: a `wsl bash -c '…'` line passes through cmd first, and a ComSpec that
 * is not cmd is judged as cmd too (fail closed). Codex codex-rs/shell-command/src/command_safety/windows_dangerous_commands.rs:190-194
 * splits cmd operators even inside a token («CMD escaping is weird by nature»); Claude Code CHANGELOG.md:7166 prompts when Windows
 * splits arguments differently.
 * Fourth round (bugfixer of 0.6.17, owner 19/11 «Sì, li curiamo», giudice v2309): G1, `, ; =` and the single quote count only in
 * the PIECE of the line that a built-in heads, cut where cmd cuts it; G2, `%NAME%` counts only when NAME can hold a value.
 */
export const SHELL_IS_CMD=process.platform==='win32';
/* cmd's built-in commands: they split their arguments on `,` `;` `=` too, and a single quote is just a character for them. Third
   round (reviewer's recheck of c5ea0ee9a): `dir` (a read-only built-in, so the default allowance answered `dir x,..\..\outside`)
   and `mklink`. */
const CMD_BUILTINS=new Set(['md','mkdir','rd','rmdir','del','erase','copy','move','ren','rename','type','dir','mklink']);
/* G1: heads that run ANOTHER command of the same piece (`if exist x mkdir a,b`, `call mkdir a,b`, `cmd /c …`, `start …`, `for … do`):
   the whole line is read as a built-in's, never narrower than cmd */
const RUNS_ANOTHER=new Set(['if','for','call','cmd','start']);
/* G2 (e), giudice: heads after which cmd reads the percents AGAIN (`set X=… & call prog %X%`, a nested cmd) or sets them: there every
   `%NAME%` counts, as before the fourth round */
const READS_PERCENTS_AGAIN=new Set(['set','setlocal','call','cmd','start','for','if']);
const CMD_OPERATORS=/[&|<>]/u;
const BUILTIN_SEPARATORS=/[,;=]/u;
/* what the recognizer (shell-segmentation.ts:79) takes as escaped after a backslash outside quotes */
const RECOGNIZER_ESCAPABLE=/[&|;<>()`'"\\$]/u;
/* !NAME! when delayed expansion is on in the registry (`/d` does not turn it off): unchanged by G2 */
const DELAYED_VARIABLE=/![^!\s:]+(?::[^!\r\n]*)?!/u;
/* the reading before G2, kept where cmd reads the percents again (READS_PERCENTS_AGAIN): `%ProgramFiles(x86)%`, `%PATH:~0,5%`,
   `%h%n`; a lone `50%` and `"%h %s"` stay readable */
const ANY_PERCENT_NAME=/%[^%\s:]+(?::[^%\r\n]*)?%/u;
/* G2: what cmd expands without the environment holding it. `set /?` (Microsoft's text inside cmd): CD, DATE, TIME, RANDOM, ERRORLEVEL,
   CMDEXTVERSION, CMDCMDLINE and HIGHESTNUMANODENUMBER «can be expanded but do not show up in the list»; (f) giudice: `__CD__` and
   `__APPDIR__`, undocumented, count too */
const DYNAMIC_VARIABLES=new Set(['cd','date','time','random','errorlevel','cmdextversion','cmdcmdline','highestnumanodenumber','__cd__','__appdir__']);
/* what the executor ADDS to the child's environment: runtime/brokered-executor.ts:366 (NODE_OPTIONS for a sandboxed command) and
   :319-321 (Git sicuro's GIT_CONFIG_COUNT / GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n, harness-ui/src/kernel/git-sicuro.mjs:114-117).
   The container's allowlist (mxc-execution-backend.ts:70-76) takes its names from this process's environment, read below. */
const EXECUTOR_ADDS=/^(?:node_options|git_config_count|git_config_key_\d+|git_config_value_\d+)$/u;

type Head={kind:'empty'}|{kind:'unreadable'}|{kind:'name';name:string};
/* the command name cmd reads at the start of a piece: behind blanks and `@`, cut where cmd cuts a name. A head cmd could read as
   something else (a leading `,` `;` `=` `(`, a `^`, `%` or `!` inside, an unclosed quote) is «unreadable» */
function headOf(piece:string):Head{
  const text=piece.replace(/^[\s@]+/u,'');
  if(text==='')return{kind:'empty'};
  if(/^[,;=(]/u.test(text))return{kind:'unreadable'};
  /* closing (reviewer's recheck of 24247353e): a piece that starts with a redirection (`2>&1 mkdir …`, `>&2 …`, `2>/dev/null …`,
     `<&3 …`): cmd runs the command after it, the recognizer drops the redirection (shell-segmentation.ts:19,90-99) */
  if(/^\d*[<>]/u.test(text))return{kind:'unreadable'};
  let name:string;
  if(text.startsWith('"')){const close=text.indexOf('"',1);if(close<0)return{kind:'unreadable'};name=text.slice(1,close);}
  else name=text.split(/[\s,;=()"'/+]/u)[0]??'';
  if(/[\^%!]/u.test(name))return{kind:'unreadable'};
  return{kind:'name',name:name.toLowerCase().replace(/\.exe$/u,'')};
}
type Pieces={pieceAt:(index:number)=>number;builtin:Set<number>;wholeLine:boolean;rereadsPercents:boolean;texts:string[]};
/* G1: the pieces of the line as cmd cuts them: at `&`, `&&`, `|`, `||`, LF and CR, outside double quotes and not after `^` (cmd's
   escape outside quotes). Single quotes are nothing to cmd. Shared with the recognizer: `^&` and `&` between double quotes cut for
   neither (shell-segmentation.ts:80); `\&` cuts for cmd, and the line already asks for that live operator. */
function cmdPieces(command:string):Pieces{
  const owner=new Array<number>(command.length).fill(0);const texts:string[]=[];
  let inDouble=false,start=0,piece=0;
  for(let index=0;index<command.length;index+=1){
    const current=command[index]!;owner[index]=piece;
    if(!inDouble&&current==='^'&&index+1<command.length){owner[index+1]=piece;index+=1;continue;}
    if(current==='"'){inDouble=!inDouble;continue;}
    if(inDouble)continue;
    /* closing: the `&` of a descriptor redirection (`2>&1`, `>&2`, `2>&-`, `<&3`) is no command separator for cmd */
    if(current==='&'&&(command[index-1]==='>'||command[index-1]==='<'))continue;
    if(current==='&'||current==='|'||current==='\r'||current==='\n'){texts.push(command.slice(start,index));start=index+1;piece+=1;}
  }
  texts.push(command.slice(start));
  const builtin=new Set<number>();let wholeLine=false,rereadsPercents=false;
  texts.forEach((text,index)=>{
    const head=headOf(text);
    if(head.kind==='empty')return;
    if(head.kind==='unreadable'){wholeLine=true;rereadsPercents=true;return;}
    if(CMD_BUILTINS.has(head.name))builtin.add(index);
    if(RUNS_ANOTHER.has(head.name))wholeLine=true;
    if(READS_PERCENTS_AGAIN.has(head.name))rereadsPercents=true;
  });
  return{pieceAt:index=>owner[index]??piece,builtin,wholeLine,rereadsPercents,texts};
}
/* G2: does a `%…%` of the line expand? Every stretch between two CONSECUTIVE percents, overlapping: measured 19/11 (echo only, fake
   environment, `cmd /d /s /c`): `echo [%h%x09%s]` printed `[%h%x09%s]` (an undefined name stays text) and `echo [%h%TALOS_PROVA_G2%s]`
   printed `[%hVALOREs]` (after an undefined `%h%` cmd reads on from the second percent). The name is what stands before `:`
   (`%PATH:~0,5%`); a name beginning with `=` (`%=C:%`, `%=ExitCode%`, giudice (f)) or empty counts as defined. Names only, compared
   without capitals (learn.microsoft.com, cmd: «Variable names aren't case-sensitive»); no value is ever read. */
function percentExpands(command:string,names:ReadonlySet<string>):boolean{
  const at:number[]=[];for(let index=0;index<command.length;index+=1)if(command[index]==='%')at.push(index);
  for(let pair=0;pair+1<at.length;pair+=1){
    const stretch=command.slice(at[pair]!+1,at[pair+1]!);
    const name=(stretch.split(':')[0]??'').toLowerCase();
    if(name===''||name.startsWith('=')||DYNAMIC_VARIABLES.has(name)||EXECUTOR_ADDS.test(name)||names.has(name))return true;
  }
  return false;
}
/* the names of this process's environment, lower-cased: names only, never a value; the child gets these or fewer */
function environmentNames():Set<string>{return new Set(Object.keys(process.env).map(name=>name.toLowerCase()));}
/** True when cmd would read `command` differently from TALOS's recognizer, so no allow rule and no default allowance may cover it.
 *  `envNames` is for the tests (the names of the child's environment); by default this process's names. */
export function cmdReadsDifferently(command:string,isCmd:boolean=SHELL_IS_CMD,envNames?:Iterable<string>):boolean{
  if(!isCmd)return false;
  if(typeof command!=='string')return true;
  if(DELAYED_VARIABLE.test(command))return true;
  /* (a) giudice: a backslash before a double quote is an escaped quote for the recognizer and a real quote for cmd, for EVERY
     command, not only file commands */
  if(command.includes('\\"'))return true;
  const pieces=cmdPieces(command);
  /* G2: where cmd reads the percents again, every %NAME% counts as before; elsewhere only a name that can hold a value */
  if(pieces.rereadsPercents?ANY_PERCENT_NAME.test(command):percentExpands(command,envNames?new Set([...envNames].map(name=>name.toLowerCase())):environmentNames()))return true;
  const inBuiltinPiece=(index:number)=>pieces.wholeLine||pieces.builtin.has(pieces.pieceAt(index));
  /* G1: a single quote counts in a built-in's piece (or anywhere, when the whole line is read as a built-in's) */
  if(pieces.wholeLine?command.includes("'"):[...pieces.builtin].some(index=>pieces.texts[index]!.includes("'")))return true;
  /* The recognizer's quote, walked as shell-segmentation.ts walks it. With `\"` gone and a `"` inside single quotes refused below,
     cmd's own double quote is exactly the recognizer's double quote, so «inside cmd quotes» is quote==='"'. */
  let quote:null|'"'|"'"=null;
  for(let index=0;index<command.length;index+=1){
    const current=command[index]!;
    const next=command[index+1];
    if(current==='\\'&&next!==undefined&&(quote!==null||RECOGNIZER_ESCAPABLE.test(next))){
      /* escaped for the recognizer, plain for cmd: an operator here is live for cmd unless cmd is inside its double quotes */
      if(quote!=='"'&&CMD_OPERATORS.test(next))return true;
      if(quote!=='"'&&inBuiltinPiece(index+1)&&BUILTIN_SEPARATORS.test(next))return true;
      index+=1;continue;
    }
    /* `^` outside quotes escapes the next character for both readers (shell-segmentation.ts:80) */
    if(current==='^'&&quote===null&&next!==undefined){index+=1;continue;}
    if(quote==="'"){
      if(current==="'"){quote=null;continue;}
      /* inside single quotes for the recognizer, unquoted for cmd */
      if(current==='"'||CMD_OPERATORS.test(current))return true;
      if(inBuiltinPiece(index)&&BUILTIN_SEPARATORS.test(current))return true;
      continue;
    }
    if(quote==='"'){if(current==='"')quote=null;continue;}
    if(current==='"'||current==="'"){quote=current;continue;}
    if(inBuiltinPiece(index)&&BUILTIN_SEPARATORS.test(current))return true;
  }
  return false;
}
/** Stricter, for accept edits' file commands: also any single quote and any `!` (cmd splits `mkdir 'my folder'` in two). */
export function cmdUnreadableFileCommand(command:string,isCmd:boolean=SHELL_IS_CMD):boolean{
  if(!isCmd)return false;
  return typeof command!=='string'||cmdReadsDifferently(command,true)||command.includes("'")||command.includes('!');
}
