import {homedir} from 'node:os';
import path from 'node:path';
import type {CompiledRule,PermissionAction,PermissionEffect} from './types.ts';
import {segmentShellCommand} from './shell-segmentation.ts';
const TOOLS=new Set<PermissionAction['tool']>(['Read','Write','Edit','Bash','WebFetch','Mcp','Hook','Plugin','TalosService']);
const RULE_SHAPE=/^([A-Za-z]+)\((.*)\)$/u;
// B1 slice 21. Why a stored rule cannot be read, in words a person can act on, or null when it can.
// It accepts exactly what parseRule accepts: the explanation is chosen only AFTER the shape has
// failed, so a rule that parses today (a trailing line break is trimmed) keeps parsing.
// `.` in the shape does not match a line break (LF, CR, U+2028, U+2029), which is how "allow always"
// on a command with a line break used to write a rule that stopped the next start.
const LINE_BREAK=/[\x0a\x0d\p{Zl}\p{Zp}]/u;
export function ruleProblem(raw:unknown):string|null{
 if(typeof raw!=='string')return 'is not text';
 const m=RULE_SHAPE.exec(raw.trim());
 if(!m)return LINE_BREAK.test(raw.trim())?'contains a line break, and a rule is read on one line':'is not of the form Tool(pattern)';
 if(!TOOLS.has(m[1] as PermissionAction['tool']))return `names "${m[1]}", which is not one of the tools ${[...TOOLS].join(', ')}`;
 return null;
}
export function parseRule(raw:string,effect:PermissionEffect):CompiledRule{const m=ruleProblem(raw)===null?RULE_SHAPE.exec(raw.trim()):null;if(!m)throw new Error(`PERMISSION_RULE_INVALID:${raw}`);return{raw,effect,tool:m[1] as PermissionAction['tool'],pattern:m[2]!};}
export function tokenizeCommand(command:string):string[]{if(typeof command!=='string'||!command.trim()||command.includes('\0'))return[];const out:string[]=[];let token='',quote:string|null=null,escape=false;for(const c of command.trim()){if(escape){token+=c;escape=false;continue;}if(c==='\\'&&quote){escape=true;continue;}if(c==='"'||c==="'"){if(quote===c)quote=null;else if(!quote)quote=c;else token+=c;continue;}if(!quote&&/[&|;<>()]/u.test(c))return[];if(!quote&&/\s/u.test(c)){if(token){out.push(token);token='';}continue;}token+=c;}if(quote)return[];if(token)out.push(token);return out;}

const READ_ONLY_COMMANDS=new Set(['ls','dir','cat','type','head','tail','grep','rg','wc','diff','stat','du','pwd']);
const READ_ONLY_GIT=new Set(['status','diff','log','show','grep','rev-parse','ls-files','ls-tree']);
export function isReadOnlyShellCommand(command:string):boolean{
 let commands:string[];try{commands=segmentShellCommand(command).map(segment=>segment.command);}catch{return false;}
 return commands.every(singleCommandReadOnly);
}
// B1 slice 11. Windows resolves a command name without case, so `TYPE` and `type` are the same
// program. Recognizing only the lowercase spelling let the shift key defeat the whole boundary:
// measured on this host, `Bash(*)` plus `TYPE <private key>` was allowed and the shell really read
// the key. The verb is folded only where the platform folds it, and only to RECOGNIZE a read-only
// command. ⛔ Rule matching is deliberately NOT folded — a rule names the text a person wrote, and
// making that comparison case-blind would change what every existing rule means.
function readOnlyVerb(token:string):string{return path.sep==='\\'?token.toLowerCase():token;}
function singleCommandReadOnly(command:string):boolean{
 const tokens=tokenizeCommand(command);if(!tokens.length)return false;
 const [head,sub]=tokens;
 const verb=readOnlyVerb(head!);
 if(READ_ONLY_COMMANDS.has(verb))return true;
 if(verb==='git'&&sub&&READ_ONLY_GIT.has(sub))return true;
 return false;
}

// B1 slice 10. A token whose value cannot be decided by reading it. An unexpanded shell variable
// (`$HOME`, `${HOME}`), a command substitution, a Windows environment reference (`%USERPROFILE%`)
// and a `~user` form all resolve to something this process cannot compute; a drive-relative path
// (`C:foo`) means "the current directory of drive C:", which is not the project root even when
// path.resolve() folds it into one. Measured 2026-09-16 on this host: path.resolve(root,'$HOME/x'),
// path.resolve(root,'%USERPROFILE%\\x') and path.resolve(root,'C:foo') all land INSIDE the project,
// so treating them as ordinary relative paths is what makes the boundary bypassable.
// A trailing `$` cannot expand in any shell, so `grep 'end$'` stays verifiable and does not prompt.
const WINDOWS_PATHS=path.sep==='\\';
export function isUnverifiableArgument(token:string):boolean{
 if(/\$[\s\S]/u.test(token)||token.includes('`'))return true;
 if(WINDOWS_PATHS&&/%[^%\s]*%/u.test(token))return true;
 if(WINDOWS_PATHS&&/^[A-Za-z]:(?![\\/])/u.test(token))return true;
 return token.startsWith('~')&&token!=='~'&&!token.startsWith('~/')&&!token.startsWith(`~${path.sep}`);
}
export function expandHomePrefix(token:string):string{
 if(token==='~')return homedir();
 if(token.startsWith('~/')||token.startsWith(`~${path.sep}`))return path.join(homedir(),token.slice(2));
 return token;
}
// On Windows a single-segment `/x` token is a switch, never a path: no Windows shell resolves
// `/s` as a file name. More than one segment (`/c/Users/x`, git-bash style) or anything with a
// separator in it is not switch-shaped and stays an operand, so POSIX is untouched.
export function isWindowsStyleSwitch(token:string):boolean{return WINDOWS_PATHS&&/^\/[A-Za-z?][-\w:,]*$/u.test(token);}

// ⛔ A tokenizer of its own, deliberately NOT tokenizeCommand. tokenizeCommand treats a backslash
// inside quotes as an escape, which on Windows eats the path separators: `type "..\segreto.txt"`
// becomes the single token `..segreto.txt`, which resolves INSIDE the project. That form is not
// exotic — quotes are what gets written whenever a path contains a space. tokenizeCommand is left
// alone because matches() compares rules with it and a rule written yesterday must keep matching.
// Here the rules are the shell's own: on Windows a backslash is a separator and never an escape;
// on POSIX it escapes outside quotes and inside double quotes, and is literal inside single quotes.
// `bare` records the characters that were outside every quote, because only those expand.
type BoundaryToken={value:string;bare:string};
function tokenizeForBoundary(command:string):BoundaryToken[]|null{
 if(typeof command!=='string'||!command.trim()||command.includes('\0'))return null;
 const chars=[...command.trim()];const out:BoundaryToken[]=[];
 let value='',bare='',started=false,quote:'"'|"'"|null=null;
 const push=()=>{if(started){out.push({value,bare});value='';bare='';started=false;}};
 for(let i=0;i<chars.length;i+=1){
  const c=chars[i]!;
  if(c==='\\'&&!WINDOWS_PATHS&&quote!=="'"&&i+1<chars.length){const next=chars[i+1]!;value+=next;if(quote===null)bare+=next;started=true;i+=1;continue;}
  if(c==='"'||c==="'"){if(quote===c)quote=null;else if(quote===null)quote=c;else value+=c;started=true;continue;}
  if(quote===null&&/[&|;<>()]/u.test(c))return null;
  if(quote===null&&/\s/u.test(c)){push();continue;}
  value+=c;if(quote===null)bare+=c;started=true;
 }
 if(quote!==null)return null;
 push();
 return out.length?out:null;
}
// Brace expansion makes one token into several, and only its unquoted part expands. A bare
// quantifier such as `a{2}` has no comma and no range, so a regular expression does not prompt.
const BRACE_LIST=/\{[^{}]*,[^{}]*\}/u;
const BRACE_RANGE=/\{[^{}]*\.\.[^{}]*\}/u;

// The operands of one command segment: everything the verb is pointed at. Option flags are dropped,
// but their value is not, in either form a path reaches them: `--file=PATH` and the attached short
// form `-fPATH`. Nothing says where a short cluster ends, so every suffix is offered and the
// comparison decides; a suffix that is not a path resolves inside the project and costs nothing.
// Everything else is kept even when it is obviously not a path, for the same reason: a search
// pattern lands inside the project, so keeping it costs nothing and guessing would cost a hole.
export function commandOperands(command:string):string[]|null{
 const tokens=tokenizeForBoundary(command);if(!tokens)return null;
 const operands:string[]=[];
 for(const token of tokens.slice(1)){
  if(BRACE_LIST.test(token.bare)||BRACE_RANGE.test(token.bare))return null;
  const value=token.value;
  if(value==='--')continue;
  if(value.startsWith('-')){
   const eq=value.indexOf('=');
   if(eq>=0){operands.push(value.slice(eq+1));continue;}
   if(!value.startsWith('--'))for(let i=2;i<value.length;i+=1)operands.push(value.slice(i));
   continue;
  }
  operands.push(value);
 }
 return operands;
}
