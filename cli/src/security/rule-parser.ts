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
 return commands.every(single=>singleCommandReadOnly(single));
}
// B1 slice 11. Windows resolves a command name without case, so `TYPE` and `type` are the same
// program. Recognizing only the lowercase spelling let the shift key defeat the whole boundary:
// measured on this host, `Bash(*)` plus `TYPE <private key>` was allowed and the shell really read
// the key. The verb is folded only where the platform folds it, and only to RECOGNIZE a read-only
// command. ⛔ Rule matching is deliberately NOT folded — a rule names the text a person wrote, and
// making that comparison case-blind would change what every existing rule means.
function readOnlyVerb(token:string):string{return path.sep==='\\'?token.toLowerCase():token;}
function singleCommandReadOnly(command:string,quoteChecked=true):boolean{
 if(quoteChecked&&cmdSplitsDifferently(command))return false;// row 216: cmd would hand the program other words than these
 const tokens=tokenizeCommand(command);if(!tokens.length)return false;
 const verb=readOnlyVerb(tokens[0]!);
 if(verb==='rg')return !rgRuns(tokens.slice(1));
 if(READ_ONLY_COMMANDS.has(verb))return true;
 if(verb==='findstr')return findstrReadsOnly(tokens.slice(1));
 if(verb==='git')return gitReadsOnly(tokens.slice(1));
 if(verb==='sed'&&sedPrintsLines(tokens.slice(1)))return true;
 return false;
}
/* F-P-002 (stress test 08/10/2026): `git -C repo status` asked, because the subcommand was read as the second token. git's
   global options before it are skipped when they only choose WHERE git reads (`-C <dir>`, whose folder the path boundary
   then judges) or how it prints (`--no-optional-locks`, `--no-pager`); any other one (`-c` sets config, `--git-dir`,
   `--work-tree`, `--exec-path`…) is not read-only.
   And the forms of a read-only subcommand that write or run a program were read-only too — found curing it, present in
   0.5.0: `--output=<file>` (diff, log, show write the file), `-O`/`--open-files-in-pager` (grep runs the program it names),
   `--ext-diff` (runs the configured diff program). They are not read-only any more. */
const GIT_GLOBAL_READ=new Set(['--no-optional-locks','--no-pager','-P']);
/* 0.7.0, the git cure: git takes a long option by any unambiguous prefix (gitcli), and short ones grouped or with the value attached
   (`-nO<prog>`). A long name that is a prefix of one of these, even of one letter and even if git would find it ambiguous, writes or
   runs; so does an `O` in a short group before the first letter that takes the rest of the group as its value (`-eO`: the pattern O).
   A separate word after such a letter (`-e -O`) is still read as an option: it asks, never the other way. */
const GIT_WRITES_OR_RUNS_LONG=['output','open-files-in-pager','ext-diff','exec','textconv','show-signature'];
const GIT_SHORT_TAKES_VALUE:Readonly<Record<string,string>>={grep:'efABCm',log:'nSGLUMCBl',show:'nSGLUMCBl',diff:'nSGLUMCBl',status:'u','ls-files':'xX'};
const longOptionPrefixOf=(arg:string,longs:readonly string[])=>{const name=arg.slice(2).split('=')[0]!;return arg.startsWith('--')&&name!==''&&longs.some(long=>long.startsWith(name));};
/* round 2 (judge v2509): rg runs the program that --pre names (on the files --pre-glob picks) and the one --hostname-bin names: the
   shared kernel's list (pavimento-comandi.mjs). A prefix of them counts as for git. */
const RG_RUNS_LONG=['pre','pre-glob','hostname-bin'];
const rgRuns=(args:readonly string[])=>args.some(arg=>longOptionPrefixOf(arg,RG_RUNS_LONG));
function gitOptionWritesOrRuns(sub:string,arg:string):boolean{
 if(arg.includes('%G'))return true;// piece 4: a template that checks a signature runs gpg (pretty-formats, %G?, %GS…)
 if(arg==='--text')return false;// round 2 (judge v2509): git takes an exact option name before a prefix; --text (-a) only reads
 if(arg.startsWith('--'))return longOptionPrefixOf(arg,GIT_WRITES_OR_RUNS_LONG);
 if(!arg.startsWith('-'))return false;
 const takesValue=GIT_SHORT_TAKES_VALUE[sub]??'';
 for(const letter of arg.slice(1)){if(letter==='O')return true;if(takesValue.includes(letter))return false;}
 return false;
}
/* where git's subcommand stands after the global options that only choose where git reads or how it prints; -1 when cut short */
function gitSubcommandAt(args:readonly string[]):number{
 let at=0;
 for(;at<args.length;at+=1){
  const arg=args[at]!;
  if(arg==='-C'){if(at+1>=args.length)return -1;at+=1;continue;}
  if(GIT_GLOBAL_READ.has(arg))continue;
  break;
 }
 return at;
}
function gitReadsOnly(args:readonly string[]):boolean{
 const at=gitSubcommandAt(args);
 /* any other option where the subcommand should be is not a read-only subcommand */
 const sub=at<0?undefined:args[at];
 if(!sub||!READ_ONLY_GIT.has(sub))return false;
 return args.slice(at+1).every(arg=>!gitOptionWritesOrRuns(sub,arg));
}
/* the git cure, piece 3, and row 216: a read-only command made to write, run or read elsewhere — a git subcommand by one of its options,
   any read-only command by a single quote cmd reads otherwise — is not covered by a verb-only rule */
export function readOnlyCommandSpoiled(command:string):boolean{
 if(cmdSplitsDifferently(command)&&singleCommandReadOnly(command,false))return true;
 const tokens=tokenizeCommand(command);const verb=tokens.length?readOnlyVerb(tokens[0]!):'';
 if(verb==='rg')return rgRuns(tokens.slice(1));// round 2: so is rg by an option that runs a program
 if(verb!=='git')return false;
 const args=tokens.slice(1);const at=gitSubcommandAt(args);
 return at>=0&&READ_ONLY_GIT.has(args[at]!)&&!gitReadsOnly(args);
}
/* judge v2493 and row 216: on Windows cmd and the programs it starts take a single quote as a plain character, so the words split
   elsewhere than here wherever a blank stands between single quotes (or after an unclosed one): such a line of a read-only command is
   not read-only. Without a blank inside them (`--grep='fix'`) the words are the same; the program only sees the quotes.
   Round 2 (judge v2509): cmd also removes a `^` outside double quotes, single ones included, and the evaluator keeps it: such a
   line is not read-only either (`"^fix"` stays free). */
const cmdSplitsDifferently=(command:string)=>{if(!WINDOWS_PATHS)return false;let single=false,double=false;for(const c of command){if(c==='"')double=!double;else if(c==='^'&&!double)return true;if(c==="'")single=!single;else if(single&&/\s/u.test(c))return true;}return single;};
/* 0.7.0 block 1, item 7: `git log --format="%h%x09%s"` asked: `%h%` read as a Windows variable, the template as a path (evaluate.ts,
   readOnlyCommandStaysInside). The template of `--format=`/`--pretty=` is printed by git, never opened: it is no path operand — only
   in a read-only `git log`/`git show` whose every option before `--` is one of the plain ones below (a `-o`, `--output`, `-c`… keeps
   the old judgement), and only a template without `$`, a backtick or a control character. A `%NAME%` cmd would expand still asks,
   judged apart (cmd-reading.ts, evaluate.ts:174). */
const GIT_PRETTY=/^--(?:format|pretty)=/u;
const GIT_LOG_PLAIN_OPTION=/^(?:--(?:format|pretty)=.*|--(?:oneline|no-merges|merges|reverse|all|first-parent|graph|decorate|no-decorate|abbrev-commit|no-patch|stat|name-only|name-status|no-color)|--date=[a-z-]+|-s|-n?\d+)$/u;
export function gitPrettyFormatValues(command:string):string[]{
 /* judge v2493: on Windows cmd and git.exe read a single quote as a plain character, so what looks like one template is more words */
 const tokens=tokenizeForBoundary(command);if(!tokens?.length||readOnlyVerb(tokens[0]!.value)!=='git'||(WINDOWS_PATHS&&command.includes("'")))return [];
 const args=tokens.slice(1).map(token=>token.value);const at=gitSubcommandAt(args);
 if(at<0||(args[at]!=='log'&&args[at]!=='show'))return [];
 const rest=args.slice(at+1);const end=rest.indexOf('--');const options=(end<0?rest:rest.slice(0,end)).filter(arg=>arg.startsWith('-'));
 if(!options.every(arg=>GIT_LOG_PLAIN_OPTION.test(arg)))return [];
 return options.filter(arg=>GIT_PRETTY.test(arg)).map(arg=>arg.slice(arg.indexOf('=')+1)).filter(value=>!/[$`\p{Cc}]|%G/u.test(value));
}
/* 0.7.0, the git cure, piece 2: in these subcommands a word `<rev>:<path>` reads a file of the repository's history, and its path counts
   from the repository's root (or the current folder, with ./ or ../), not the project's: evaluate.ts judges these words apart. */
/* …and so does a pathspec with magic (`:/`, `:(top)`), before or after `--`, in every subcommand below */
const GIT_REVISION_PATH=new Set(['show','grep','diff','ls-tree','log','ls-files','status']);
export function gitRevisionPaths(command:string):string[]{
 const tokens=tokenizeForBoundary(command);if(!tokens?.length||readOnlyVerb(tokens[0]!.value)!=='git')return [];
 const args=tokens.slice(1).map(token=>token.value);const at=gitSubcommandAt(args);
 if(at<0||!GIT_REVISION_PATH.has(args[at]!)||args.includes('--no-index'))return [];// --no-index compares files: no <rev>:<path>
 return args.slice(at+1).filter(arg=>!arg.startsWith('-')&&arg.includes(':')&&!/^[A-Za-z]:[\\/]/u.test(arg));
}
/* F-P-001: `findstr` only prints the lines that match. Its `/F:` (the files to search), `/G:` (the strings) and `/D:` (the
   folders) name paths inside a switch, which the boundary reads as a switch: with one of them it is not read-only. */
function findstrReadsOnly(args:readonly string[]):boolean{
 return args.every(arg=>!/^\/[fgd]:/iu.test(arg));
}
// C-006 (benchmark case 008: `cat <saved output> | sed -n '1,200p'`). Only the form that prints lines: `sed -n N[,M]p [file…]`,
// as Codex reads it (shell-command/src/parse_command.rs:1567-1630, `sed_read_path`). Any other script or flag can write
// (`-i`, the `w` command) and stays outside the read-only list.
function sedPrintsLines(args:readonly string[]):boolean{
 const [flag,script,...files]=args;
 return flag==='-n'&&script!==undefined&&/^\d+(?:,\d+)?p$/u.test(script)&&files.every(file=>!file.startsWith('-'));
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
