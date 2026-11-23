import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {compileRuleSet,evaluateRules,PATH_BOUNDARY_RULE,realPath} from './evaluate.ts';
/* A5h (0.7.0): an agent's card keeps its mark when it names a control file; A5i (0.6.17): a file command toward a TALOS control file
   asks in accept edits. Both by the kernel's own rule (path-policy.mjs ePercorsoDiControllo) */
import {namesControlFile} from './control-path.ts';
/* 0.6.17, the cmd cure: on Windows the command runs through cmd.exe, which reads quotes, `\"`, `, ; =` and `!VAR!` its own way */
import {cmdUnreadableFileCommand,SHELL_IS_CMD} from './cmd-reading.ts';
import {commandNamesAnotherComputer,commandNamesHomeCredential,isAnotherComputer,isHomeCredential} from './home-credentials.ts';
import {remoteToLocalLinks,type RemoteToLocalLinks} from './remote-to-local-links.ts';
import {mcpWithoutItsTool,ruleToPersist,unreadableRulesError} from './persist.ts';
import {isReadOnlyShellCommand,parseRule,tokenizeCommand} from './rule-parser.ts';
import type {CompiledRule,PermissionAction,PermissionMode,RuleSetInput} from './types.ts';
export type AutoClassifier=(input:{action:PermissionAction;projectRoot:string})=>Promise<'allow'|'deny'|'ask'>;
export type ApprovalDecision={kind:'allow';source:string}|{kind:'deny';code:string;message:string}|{kind:'ask';requestId:string;action:PermissionAction;reason:string;rule?:string};
/* C-006: `sessionId` names the session that asks; with the engine's `toolOutputRoot` it may READ `<toolOutputRoot>/<sessionId>`. */
/* A5h: `child` says the card is a child's or a delegate's (the TUI knows it from the card's origin); absent means no */
export interface PermissionEngine{decide(action:PermissionAction,context:{interactive:boolean;mode:PermissionMode;sessionId?:string;child?:boolean}):Promise<ApprovalDecision>;resolve(requestId:string,decision:'allow-once'|'allow-session'|'allow-always'|'deny-once'|'deny-always'):Promise<void>;
  /** Stage 7.21 (owner 03/10: a rule changed in /permissions is obeyed at once): the rules read again from the settings. An unreadable entry throws by name and the rules in force stay as they were. */
  replaceRules(next:RuleSetInput):void;}

const FS_EDIT_OPTIONS:Record<string,Set<string>>={
  mkdir:new Set(['-p','-v']),touch:new Set(['-a','-m','-c']),rm:new Set(['-r','-R','-f','-rf','-fr','-d']),rmdir:new Set(['-p']),cp:new Set(['-r','-R','-f','-n','-p']),mv:new Set(['-f','-n']),
};
function insideProject(root:string,candidate:string){const rel=path.relative(path.resolve(root),path.resolve(candidate));return rel===''||(!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel));}
/* A5i, 0.6.17 (19/11/2026). acceptEdits says yes alone to a filesystem command only when every operand, after what the shell would
   expand, lands inside the project and never where Write/Edit stop; in doubt it asks. Measured on 0.6.16: `~/x` was read as a folder
   INSIDE the project (the shell sends it to the home: GNU Bash manual, «Tilde Expansion»; Codex utils/absolute-path/src/lib.rs:28-36),
   `$HOME`, `%USERPROFILE%` and globs went alone, cp/mv/rm… went into `.github` where Write asks, `--target-directory=` and `-t` named
   a destination read as a file, and a line break let a SECOND command through (bash and PowerShell run it, measured with two harmless
   mkdir). Hermes tools/approval_detection.py:20 reads `~`, `$home` and `${home}` as the home the same way. */
/* LF, CR, VT, FF, NEL, LINE SEPARATOR, PARAGRAPH SEPARATOR, from their numbers: no raw line character sits in the source */
const LINE_CHARACTERS=new RegExp(`[${String.fromCharCode(0x0a,0x0d,0x0b,0x0c,0x85,0x2028,0x2029)}]`,'u');
/* tilde, variables (`$`, `%VAR%`, cmd's delayed `!VAR!`: reviewer R3, `rm -rf !USERPROFILE!/Documents/x`), substitutions (backtick,
   `$(…)`), globs and brace lists, cmd's escape caret */
const SHELL_EXPANSION=/[~$%`*?[\]{}^!]/u;
/* R5 (reviewer of A5i, 19/11/2026; already so in 0.6.16): `rm -rf lnk/../victim` was resolved on paper (`victim`, inside), while the
   shell walks INTO `lnk` and climbs from where it lands (POSIX.1 «Pathname Resolution»: `..` is the parent of the directory reached).
   Walked one name at a time here, a `..` climbs from the REAL folder reached so far. Windows collapses `..` before it looks (so this
   asks a little more there than it must, never less). Throws when a name cannot be resolved: the caller asks. */
function walkedPath(root:string,operand:string):string{
  const absolute=path.isAbsolute(operand);let current=absolute?path.resolve(path.parse(operand).root):root;
  const names=(absolute?operand.slice(path.parse(operand).root.length):operand).split(path.sep==='\\'?/[\\/]/u:/\//u);
  for(const name of names){
    if(name===''||name==='.')continue;
    current=name==='..'?path.dirname(realPath(current)):path.join(current,name);
  }
  return current;
}
/* the recognizer drops a backslash inside quotes, cmd keeps it and sh reads it its own way: such a path is not read as the shell does */
function backslashInQuotes(command:string):boolean{let quote:string|null=null;for(const c of command){if(quote){if(c===quote)quote=null;else if(c==='\\')return true;}else if(c==='"'||c==="'")quote=c;}return false;}
/* Write/Edit's protected folders, with the capitals and the trailing dots or spaces Windows ignores */
function protectedFirstSegment(rel:string):boolean{return PROTECTED_PROJECT_ROOTS.has((rel.split(path.sep)[0]??'').replace(/[. ]+$/u,'').toLowerCase());}
/* the verb and the operands of a file command, or null when an option is not one of the known safe ones; GNU tools read an option
   after an operand too (`cp a b -t dir`): only `--` ends the options */
function fileCommandOperands(command:string):{head:string;operands:string[]}|null{
  const tokens=tokenizeCommand(command);if(tokens.length<2)return null;const head=tokens[0]!;const allowed=FS_EDIT_OPTIONS[head];if(!allowed)return null;
  const operands:string[]=[];let options=true;
  for(const token of tokens.slice(1)){if(options&&token==='--'){options=false;continue;}if(options&&token.startsWith('-')){if(!allowed.has(token))return null;continue;}operands.push(token);}
  if((head==='cp'||head==='mv')?operands.length<2:operands.length<1)return null;
  return{head,operands};
}
/* A5i point (1), commands only (owner 19/11/2026 «Solo la protezione»): the paths a file command WRITES or deletes. `cp` writes its last
   operand, and when that is a folder (more than one source, a trailing slash, or a folder on disk) each source's name inside it; it
   only READS its sources, so `cp CLAUDE.md backup.md` is not a write to a control file. mv, rm, rmdir, mkdir and touch touch every
   operand, sources included. null when the command cannot be read: the caller asks. */
function writtenPaths(command:string,projectRoot:string):string[]|null{
  const parsed=fileCommandOperands(command);if(!parsed)return null;const {head,operands}=parsed;
  if(head!=='cp'&&head!=='mv')return operands;
  const destination=operands.at(-1)!;const sources=operands.slice(0,-1);
  /* small round (giudice, «preparation»): a source ending in `.` or `..` (`cp -r tmp/a/. docs`) brings a folder's CONTENT, names
     TALOS does not see from the command: ask */
  if(sources.some(source=>['.','..'].includes(path.basename(source))))return null;
  let folder=sources.length>1||/[\\/]$/u.test(destination);
  if(!folder){try{folder=fs.statSync(path.resolve(projectRoot,destination)).isDirectory();}catch(error){const code=(error as NodeJS.ErrnoException).code;if(code!=='ENOENT'&&code!=='ENOTDIR')return null;}}
  const inside=folder?sources.map(source=>path.join(destination,path.basename(source))):[];
  /* mv into a folder is judged like cp: a folder prepared elsewhere lands there under its own name (`mv tmp/skills
     .claude/worktrees/w1`, where `skills` is a control folder only at a copy's root); mv also touches every source */
  return head==='mv'?[...operands,...inside]:[destination,...inside];
}
/** True when a file command writes or deletes a TALOS control file by the kernel's rule (control-path.ts), or when that cannot be told
 *  (the rule not loaded, a command that cannot be read): in accept edits such a command asks. `check` is for the tests (null = not loaded). */
export function acceptEditsWritesControlFile(command:string,projectRoot:string,check?:Parameters<typeof namesControlFile>[2]):boolean{
  const paths=writtenPaths(command,projectRoot);if(!paths)return true;
  return paths.some(target=>namesControlFile({tool:'Write',resource:target},projectRoot,check));
}
export function acceptEditsFilesystemCommand(command:string,projectRoot:string,isCmd:boolean=SHELL_IS_CMD):boolean{
  if(typeof command!=='string'||LINE_CHARACTERS.test(command)||SHELL_EXPANSION.test(command))return false;
  /* 0.6.17, R1, R1b, R2 and (a) (reviewer of A5i; giudice 19/11/2026; already so in 0.6.16): cmd.exe splits `mkdir 'x&mkdir y&'` into
     two commands, `rmdir 'a .git /s /q '` into a removal of `.git`, `mkdir x,..\escaped` into a folder outside, and reads `\"` as a real
     quote. Such a command is never read by itself here (cmd-reading.ts, the one place that knows the shell is cmd) */
  if(cmdUnreadableFileCommand(command,isCmd))return false;
  /* outside Windows a backslash is the shell's escape (`.gi\thub` is `.github`); on Windows it is the separator, unless quoted */
  if(command.includes('\\')&&(path.sep!=='\\'||backslashInQuotes(command)))return false;
  const parsed=fileCommandOperands(command);if(!parsed)return false;const {operands}=parsed;
  const root=path.resolve(projectRoot);let realRoot:string;try{realRoot=realPath(root);}catch{return false;}
  for(const operand of operands){
    /* `C:x` is read on that drive's current folder, which TALOS does not know */
    if(/^[A-Za-z]:(?![\\/])/u.test(operand))return false;
    const abs=path.isAbsolute(operand)?path.resolve(operand):path.resolve(root,operand);
    if(!insideProject(root,abs)||abs===root||protectedFirstSegment(path.relative(root,abs)))return false;
    /* through a link, as Write is judged (evaluate.ts hardPathDeny): the real path must be inside and unprotected too; R5: the real
       path of what the shell walks, `..` climbing from the folder a link leads to */
    let real:string;try{real=realPath(walkedPath(root,operand));}catch{return false;}
    if(!insideProject(realRoot,real)||real===realRoot||protectedFirstSegment(path.relative(realRoot,real)))return false;
  }
  return true;
}

const PROTECTED_PROJECT_ROOTS=new Set(['.git','.talos-cli','.github','.vscode','.idea','.husky']);
function protectedProjectMutation(action:PermissionAction,root:string):boolean{
  if(!['Write','Edit'].includes(action.tool)||!action.resource)return false;
  const abs=path.isAbsolute(action.resource)?path.resolve(action.resource):path.resolve(root,action.resource);if(!insideProject(root,abs))return false;
  const first=path.relative(path.resolve(root),abs).split(path.sep)[0]??'';return PROTECTED_PROJECT_ROOTS.has(first);
}
/* A5h cure round 1: a session grant is the action without the card's «at most this session» */
function grantKey(action:PermissionAction):string{const {sessionOnly:_once,...rest}=action;return JSON.stringify(rest);}
/* The same session-id shape output-store.ts accepts for a folder name: one plain segment, never a path. */
const OWN_SESSION=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
function outsideWrite(action:PermissionAction,root:string){if(!['Write','Edit'].includes(action.tool)||!action.resource)return false;const rel=path.relative(path.resolve(root),path.resolve(root,action.resource));return rel==='..'||rel.startsWith(`..${path.sep}`)||path.isAbsolute(rel);}
/** The kernel's questions that only a person answers (see `decide`). */
export const PERSON_ONLY_OPERATIONS:ReadonlySet<string>=new Set(['provider_exclude','provider_allow','giri-in-tondo','chatgpt_account','research_start']);
/** Decision 158 (owner 04/11/2026): of those, Full access answers all but the deep research, which spends money. */
const FREE_IN_FULL_ACCESS:ReadonlySet<string>=new Set(['provider_exclude','provider_allow','giri-in-tondo','chatgpt_account']);
/* what each of them says: [refused with nobody to ask, why it is asked] */
const PERSON_ONLY_WORDS:Readonly<Record<string,readonly [string,string]>>=Object.freeze({
  'giri-in-tondo':['nobody can be asked whether to go on in this mode','the model keeps repeating the same call with the same result'],
  research_start:["a deep research starts only with the person's yes on its card, and nobody is asked in this mode",'it starts a deep research'],
  chatgpt_account:['only the person signs out of ChatGPT, and nobody is asked in this mode','it signs you out of ChatGPT and ends that sign-in at OpenAI'],
  'chiamata-dal-testo':["a tool call the model wrote as text runs only with the person's yes, and nobody is asked in this mode",'the model wrote this tool call as text'],
  /* Riga 91, cure 2: the kernel's «only once» card, made in Read only (Hermes tools/approval.py:813, a card reduced to once/deny that persists nothing) */
  'solo-una-volta':["in Read only a tool that runs outside TALOS runs only with the person's yes, once, and nobody is asked in this mode",'the session is in Read only: this tool runs outside TALOS and is allowed only once'],
});
/* Decision 373 (owner 07/11/2026): the card of a TALOS control file, [refused with nobody to ask, why it is asked]. The words are the
   kernel's refusal for the shell (session-registry.mjs `cancelloShellDelComputerUse`) and the desktop's card for a write
   (frontend i18n `app.approval.wantsWriteControlFile`). */
const CONTROL_FILE_WORDS:Readonly<Record<'shell'|'write',readonly [string,string]>>=Object.freeze({
  shell:['This command names a TALOS computer use settings file (.computer-use-impostazione.json or .computer-use-luoghi.json): only the person can allow it, and nobody is asked in this mode.','This command names a TALOS computer use settings file (.computer-use-impostazione.json or .computer-use-luoghi.json): only the person can allow it, once.'],
  write:['It wants to write a TALOS control file: an agent rule (hook, MCP, instructions, memory), not a project file. Only the person can allow it, and nobody is asked in this mode.','It wants to write a TALOS control file: an agent rule (hook, MCP, instructions, memory), not a project file. Only the person can allow it, once.'],
});
/* the kinds of tools that run outside the kernel (kernel P018 `TIPI_ATTREZZO_DI_FUORI`, persist.ts OUTSIDE_TOOL_KINDS) */
const OUTSIDE_TOOL_KINDS:ReadonlySet<string>=new Set(['mcp_tool','plugin_tool','forge_tool']);
const PROVIDER_WORDS:readonly [string,string]=["a change of the excluded providers needs the person's yes, and nobody is asked in this mode",'it changes which providers OpenRouter may use, for every session'];
/* F-P-004 (stress test 0.5.5): a second secret check the CLI runs when the kernel marked nothing (permission-dry-run.ts backslashGlobSecretCheck). */
export type SecretRecheck=(action:PermissionAction)=>Promise<PermissionAction['sensitive']|null>;
/** Owner's decision 173 (04/11/2026): after a No to «Do you trust this folder?» Full access works there as Normal («Ask before
 *  edits»); every other mode keeps its own. Codex core/src/config/mod.rs:3708-3716: an untrusted project defaults to asking. */
export function modeInUntrustedFolder(mode:PermissionMode,untrusted:boolean):PermissionMode{return untrusted&&mode==='bypassPermissions'?'default':mode;}
export function createPermissionEngine({projectRoot,rules,mode,classifier,persistRule,toolOutputRoot,secretRecheck,askEverything=false,remoteToLocalLinks:linksBack=remoteToLocalLinks,conversation}:{/** Riga 224: the conversation open now, whose «for this session» yeses count; omitted, one for the whole engine */conversation?:()=>string|null;/** Riga 202: whether Windows follows a share's links back to this computer (by default the process's reader; tests pass a fake). */remoteToLocalLinks?:()=>RemoteToLocalLinks;/** Form B, No (a): the folder is not trusted, every change and command asks. R2-F1 (cure 208 bis): a function is
  read at every decision, so trust taken away while the conversation is open counts from the next command. */askEverything?:boolean|(()=>boolean);projectRoot:string;toolOutputRoot?:string;rules:RuleSetInput;mode?:PermissionMode;classifier?:AutoClassifier;persistRule?:(effect:'allow'|'deny',action:PermissionAction)=>Promise<void>;secretRecheck?:SecretRecheck}):PermissionEngine{
  if(mode==='auto'&&!classifier)throw new Error('PERMISSION_AUTO_UNAVAILABLE');
  // B1 slice 21. ⛔ Fail closed and by name: one unreadable entry, in any list, and there is no engine.
  const {rules:compiled,invalid}=compileRuleSet(rules);if(invalid.length)throw unreadableRulesError(projectRoot,invalid);
  /* Riga 224 (owner 22/11/2026): a «yes for this session» belongs to the conversation that gave it; /clear and /resume of another one ask again */
  /* Riga 224, round 2 (judge v2579): a card waiting for an answer keeps the conversation it was asked in; its «for this session» goes there, whichever is open when it is answered */
  class WaitingCards extends Map<string,PermissionAction>{askedIn=new Map<string,string>();override set(requestId:string,action:PermissionAction){this.askedIn.set(requestId,conversation?.()??'');return super.set(requestId,action);}}
  const pending=new WaitingCards();const grantsOf=new Map<string,PermissionAction[]>();const grants=(id=conversation?.()??'')=>{let list=grantsOf.get(id);if(!list)grantsOf.set(id,list=[]);return list;};
  /* Riga 206: a shell command that spells out another computer's share, while Windows follows its links back here or TALOS cannot
     tell; the setting is read only when the command names such a share */
  const shellToAnotherComputer=(action:PermissionAction)=>action.tool==='Bash'&&commandNamesAnotherComputer(action.command)&&linksBack()!=='off';
  const untrustedNow=typeof askEverything==='function'?()=>{try{return askEverything()===true;}catch{return true;}}:()=>askEverything===true;
  return{async decide(action,context){const untrusted=untrustedNow();context={...context,mode:modeInUntrustedFolder(context.mode,untrusted)};if(secretRecheck&&!action.sensitive){const found=await secretRecheck(action);if(found)action={...action,sensitive:found};}
    /* A5h (owner 19/11/2026, «Uguale al PC, modo per modo»; giudice v2266). The CLI starts its root «On request» so the kernel asks it
       for every call, and the kernel then marks EVERY card of a child (C2-a); on the PC the root in Workspace write or Full access
       marks none. So a child's card in acceptEdits or Full access loses the mark and offers «for this session» again, as in 0.6.16,
       only when the mark is the chain's alone (`chainOnly`), the folder is trusted, and the card names no secret, no credential of
       this computer and no control file by path. Nothing passes by itself: the decision below is the same. In doubt it stays. */
    if(action.alwaysNotEnough&&action.chainOnly&&context.child===true&&(context.mode==='acceptEdits'||context.mode==='bypassPermissions')&&!untrusted&&!action.sensitive&&!action.sensitivePath&&!action.homeCredential
      &&!isHomeCredential(action.resource,{cwd:projectRoot})&&!commandNamesHomeCredential(action.command,{cwd:projectRoot})&&!namesControlFile(action,projectRoot)){const {alwaysNotEnough:_mark,chainOnly:_chain,...lifted}=action;/* cure round 1 (giudice, G3): «at most this session», never «always» */action={...lifted,sessionOnly:true};}
    if(context.mode!=='bypassPermissions'&&outsideWrite(action,projectRoot))return{kind:'deny',code:'PATH_NOT_ALLOWED',message:'Operation targets a path outside the project'};const readableRoots=toolOutputRoot&&typeof context.sessionId==='string'&&OWN_SESSION.test(context.sessionId)&&!context.sessionId.includes('..')?[path.join(toolOutputRoot,context.sessionId)]:[];let base=evaluateRules(compiled,action,{projectRoot,readableRoots,fullAccess:context.mode==='bypassPermissions'});const m=context.mode;const bypassable=action.sensitive!=='secret'&&action.sensitive!=='keychain';if(base.effect==='deny'){
      /* ALTO-CLI (Desktop's review 3, 04/11/2026): Full access lifts a command TALOS cannot split, never a critical deletion — that
         card goes on to the branch below and asks (Hermes tools/approval.py:1080-1092, `_floor_block` runs before yolo at :1170).
         Owner's decision of 05/11/2026 («Chiedi con la frase»): in every other mode too it asks with the kernel's sentence, as the
         kernel does, instead of the plain composition refusal; plan mode and a mode that never asks refuse it below. */
      if(base.composition!=='unsupported'||!bypassable)return{kind:'deny',code:'PERMISSION_DENIED',message:base.reason};
      /* Decision 373: nor a control file's card — the kernel turns a yes of the mode into a no there, so in Full access it asks below.
         Final review of riga 206 (20/11): nor a command that names another computer's share, which goes on to the shell check below
         first, and asks (or refuses with nobody in front) when Windows follows a share's links back here or TALOS cannot tell.
         In every other mode the refusal stays as it was */
      if(!action.criticalDelete){if(m==='bypassPermissions'){if(!action.controlFile&&!shellToAnotherComputer(action))return{kind:'allow',source:'bypassPermissions'};}else return{kind:'deny',code:'PERMISSION_DENIED',message:base.reason};}
    }
    /* Owner's decisions 155, 157 and 158 (04/11/2026): Full access is Claude Code's bypassPermissions («Permission modes»: only rm on
       critical paths and explicit `ask` rules prompt; Hermes tools/approval.py:1051-1072, only the floor stands before yolo). A write
       outside the project, a command as root in WSL, a network path, and the kernel's provider, round-in-circles and ChatGPT
       sign-out questions pass, on the screen and with nobody in front; an `ask` rule the person wrote still asks. A deep research
       (money), a call written as text (`semprePersona`, a defence against fake text) and this computer's credentials stay below. */
    const fullAccess=m==='bypassPermissions'&&!(base.effect==='ask'&&base.rule&&base.rule!==PATH_BOUNDARY_RULE);
    /* Riga 91 (0.6.18), cure 1: a tool that runs outside TALOS (an MCP tool, a plugin or Tool Forge tool) is refused in plan as a
       write, before any rule or session yes: measured on 0.6.17, plan taken during a turn and an automation `--mode plan` ran
       `Mcp(github:create_pr)` from its saved rule (Claude Code CHANGELOG.md:6219: plan mode blocks a write even with an allow rule) */
    if(m==='plan'&&(['Write','Edit','Hook','Plugin','Mcp'].includes(action.tool)||(action.tool==='TalosService'&&OUTSIDE_TOOL_KINDS.has(action.operation??''))||(action.tool==='Bash'&&!isReadOnlyShellCommand(action.command??''))))return{kind:'deny',code:'PLAN_MODE_READ_ONLY',message:'Plan mode permits only read-only operations'};
    /* Owner's decision 155 (04/11/2026): deleting the root of a disk, a top-level folder, the user folder, the project or one of its
       parents is the person's, every time and in every mode, Full access included (Claude Code «Permission modes»: rm on critical
       paths always prompts; Hermes tools/approval.py:1051-1072). No allow rule or session grant answers it; a deny rule above and plan
       mode still refuse; with nobody to ask it is refused. The kernel marks the card (`cancellazioneCritica`) and writes its sentence. */
    if(action.criticalDelete){
      /* Without the kernel's sentence, a whole one of ours. The kernel's cures (04/11/2026) send `percorso: null` for a command inside
         too many nested shells (`troppo-annidato`): its English words, never an empty path (Hermes tools/approval.py:563).
         0.6.16 (desktop permissions repair): `troppo-complesso`, a command too complex to read first, has its own words too (the
         description is what the person reads, Hermes tools/approval.py:593-594). */
      const {sentence,path:target,why:reason}=action.criticalDelete;
      const why=sentence||(target?`This command deletes ${target}, a critical folder.`:reason==='troppo-annidato'||reason==='tooNested'?'This command deletes something inside too many nested shells to check it first.':reason==='troppo-complesso'||reason==='tooComplex'?'This command is too complex to read before it runs, and it may delete something.':'This command deletes a critical folder.');
      if(m==='dontAsk'||!context.interactive)return{kind:'deny',code:'CRITICAL_DELETE_NEEDS_PERSON',message:`${why} Only the person can allow it, and nobody is asked in this mode.`};
      const requestId=randomUUID();pending.set(requestId,action);
      return{kind:'ask',requestId,action,reason:why};
    }
    /* Decision 373 (owner 07/11/2026, «Come Hermes»): the kernel marks a command that names a computer use settings file, and a write to a
       TALOS control file, and sends that card only when the person must answer it (outside Full access for the command, in every
       mode for the write). It turns a yes that says it came from a rule, the mode or the classifier into a no
       (`MOTIVI_DEL_SI_SENZA_PERSONA`), and it says «always» is not enough (`sempreNonBasta`). So the person answers, once, every time,
       in every mode: no allow rule, session grant or mode says yes; a deny rule above and plan mode still refuse; with nobody to ask
       it is refused saying why. Hermes tools/approval_detection.py:24-25 (the config file IS the security policy); Codex
       codex-rs/protocol/src/approvals.rs:365-376 (the client offers only the decisions the sender allows). */
    if(action.controlFile){
      const [refused,why]=CONTROL_FILE_WORDS[action.tool==='Bash'?'shell':'write'];
      if(m==='dontAsk'||!context.interactive)return{kind:'deny',code:'CONTROL_FILE_NEEDS_PERSON',message:refused};
      const requestId=randomUUID();pending.set(requestId,action);
      return{kind:'ask',requestId,action,reason:why};
    }
    /* A network path (owner 02/10 «Solo tu, sempre»; desktop 53e123cf9…8da51c958): opening it sends the Windows credentials to that
       computer, so only a person answers — no allow rule, session grant or mode (bypassPermissions included) says yes; a deny
       rule above still refuses. With nobody to ask it is refused with the reason. Claude Code 2.1.234-235 closed the same NTLM
       vector before any approval; Codex asks before network access. */
    /* Decision 41 (owner 02/11) and the CLI's finding of 03/11: as root a command can change the whole Linux system and write to the
       Windows disks, so only the person says yes; no rule, grant or mode does. A deny rule above still refuses. */
    if(action.wslRoot&&!fullAccess){
      if(m==='dontAsk'||!context.interactive)return{kind:'deny',code:'WSL_ROOT_NEEDS_PERSON',message:'the command would run as root in Linux; only the person can allow it, and nobody is asked in this mode'};
      const requestId=randomUUID();pending.set(requestId,action);
      return{kind:'ask',requestId,action,reason:'the command would run as root in Linux'};
    }
    /* Riga 202 (0.6.18, owner 20/11/2026 «chiede solo dove serve»): Full access opens another computer's share without a card only
       when Windows does not follow links from a share back to this computer (remote-to-local-links.ts); when it does, or TALOS cannot
       tell, it asks here, and with nobody in front it refuses. This computer's own share is unchanged. */
    if(action.sensitive==='network'&&(!fullAccess||(isAnotherComputer(action.network?.host)&&linksBack()!=='off'))){
      if(m==='dontAsk'||!context.interactive)return{kind:'deny',code:'NETWORK_PATH_NEEDS_PERSON',message:'Opening a network path sends your Windows credentials to that computer; only a person can allow it, and nobody is asked in this mode'};
      const requestId=randomUUID();pending.set(requestId,action);
      return{kind:'ask',requestId,action,reason:'opening a network path sends your Windows credentials to that computer'};
    }
    /* Riga 206 (0.6.18, owner 20/11/2026 «Copri anche la shell ora»): the kernel puts its network card only on the file tools; a shell
       command that spells out another computer's share gets the same card here, in Full access only (the other modes already ask
       for a command or have the classifier), and only when Windows follows a share's links back here or TALOS cannot tell. The card
       is a network card: answered once, nothing kept (resolve below). The setting is read only when a command names such a share. */
    if(fullAccess&&shellToAnotherComputer(action)){
      /* only Full access gets here: with nobody in front (`-p`) it is refused */
      if(!context.interactive)return{kind:'deny',code:'NETWORK_PATH_NEEDS_PERSON',message:'Opening a network path sends your Windows credentials to that computer; only a person can allow it, and nobody is asked in this mode'};
      const asked:PermissionAction={...action,sensitive:'network'};const requestId=randomUUID();pending.set(requestId,asked);
      return{kind:'ask',requestId,action:asked,reason:'opening a network path sends your Windows credentials to that computer'};
    }
    /* Owner 09/10/2026 («Segue il modo + si chiede»): a command that asks for the network. Full access opens it (as Codex «Full
       Access» and Claude Code's bypassPermissions); otherwise only the person says yes, once — no rule or grant does — and with
       nobody to ask it stays closed. A deny rule above still refuses the command itself. */
    if(action.tool==='Bash'&&action.networkRequested===true){
      if(m==='bypassPermissions')return{kind:'allow',source:'bypassPermissions'};
      if(m==='dontAsk'||!context.interactive)return{kind:'deny',code:'NETWORK_NEEDS_PERSON',message:'the network for a command is opened only by the person or in Full access, and nobody is asked in this mode'};
      const requestId=randomUUID();pending.set(requestId,action);
      return{kind:'ask',requestId,action,reason:'the command asks to reach the network'};
    }
    /* 0.6.1 (adversarial review of 0.6.0, F1): `chatgpt_account` asks only for its `disconnect` (the kernel shows no card for
       `status`), and signing the person out is theirs alone: in Codex and OpenCode it is a command of the person and no tool of
       the model (codex-rs/cli/src/login.rs, opencode cli/cmd/account.ts, clones of 23-24/09/2026).
       Owner 09/10/2026: a change of OpenRouter's excluded providers («Sì, con la carta») and going on after the model went round
       in circles («Avvisa, poi chiede o ferma») are the person's to answer, every time — like a network path, no rule, grant or
       mode says yes; with nobody to ask they are refused with the reason, and the kernel says it to the model. */
    /* R-34 part 2 and decision 121 (03/11/2026): the kernel's `semprePersona` is the same — the person answers, once, every time. Hermes
       tools/approval.py:2721-2724, :4028-4033 (an override of a Smart DENY offers only one-operation approval or denial); Claude Code
       docs, permissions: a tool set to `ask` prompts on every call, even in `bypassPermissions`. */
    if(action.personOnly===true||action.onlyOnce===true||(action.tool==='TalosService'&&action.operation&&PERSON_ONLY_OPERATIONS.has(action.operation)&&!(fullAccess&&FREE_IN_FULL_ACCESS.has(action.operation)))){
      const [refused,why]=PERSON_ONLY_WORDS[action.onlyOnce&&!action.personOnly?'solo-una-volta':action.operation??'']??(action.personOnly?PERSON_ONLY_WORDS['chiamata-dal-testo']!:PROVIDER_WORDS);
      if(m==='dontAsk'||!context.interactive)return{kind:'deny',code:'NEEDS_PERSON',message:refused};
      const requestId=randomUUID();pending.set(requestId,action);
      /* Owner 02/11/2026: the research card says question, depth and cost in the kernel's words */
      return{kind:'ask',requestId,action,reason:action.detail?`${why}: ${action.detail}`:why};
    }
    /* A5f (owner 19/11/2026 09:33): where the kernel says «always» is not enough (`alwaysNotEnough`), no «for this session» answers */
    /* cure round 1: the card's «at most this session» is not part of the grant, so the child's and the root's same command share it, as in 0.6.16 */
    if(!action.alwaysNotEnough&&grants().some(g=>JSON.stringify(g)===grantKey(action)))return{kind:'allow',source:'session'};
    /* Form B, No (a), Frontend's condition 1: a mode or a rule says no yes in a folder the person did not trust; only the person's
       answer does. Full access is Normal here (decision 173, at the top). Refusals were judged above; reads keep their rules. */
    if(untrusted&&['Write','Edit','Bash'].includes(action.tool)){const requestId=randomUUID();pending.set(requestId,action);return{kind:'ask',requestId,action,reason:"this folder isn't trusted"};}
    /* F-P-001 (stress-test smoke of rc.1, 08/10/2026): the built-in defaults allow a read inside the project and a read-only command there, and that
       answer used to come back before anyone looked at `sensitive` — so the kernel's question about `.env` in the project was approved without a person,
       in every mode. What the kernel marked as a secret or the keychain is approved only by a rule the person wrote or by the person; a DEFAULT, a mode
       (acceptEdits, bypassPermissions) or the auto classifier never says yes for it. */
    /* 0.6.8 (third and fifth review; owner 16/10/2026 «Chiedere sempre», «Dentro la 0.6.8»): this computer's login credentials
       (~/.ssh, ~/.npmrc, ~/.aws…, in any spelling, through a link or a hard link) are judged here, before the defaults, like a
       marked secret — and unlike a project secret, Full access does not lift them either (home-credentials.ts). */
    const homeCredential=action.homeCredential===true||['Read','Write','Edit','Bash'].includes(action.tool)&&(isHomeCredential(action.sensitivePath,{cwd:projectRoot})||isHomeCredential(action.resource,{cwd:projectRoot})||(action.tool==='Bash'&&commandNamesHomeCredential(action.command,{cwd:projectRoot})));
    const plain=bypassable&&!homeCredential;
    if(base.effect==='allow'){if(base.rule||plain)return{kind:'allow',source:base.rule??'rule'};base={effect:'ask',reason:homeCredential?'the file holds a login credential of this computer':'the operation touches a file that may contain keys or passwords'};}
    if(m==='acceptEdits'&&plain&&base.effect==='ask'&&!base.rule&&!protectedProjectMutation(action,projectRoot)&&(['Write','Edit'].includes(action.tool)||(action.tool==='Bash'&&acceptEditsFilesystemCommand(action.command??'',projectRoot)&&!acceptEditsWritesControlFile(action.command??'',projectRoot))))return{kind:'allow',source:'acceptEdits'};
    /* C-005 (owner 01/10, «bypass vero»): bypass also lifts the path boundary (a read outside the project, a hidden folder
       there), as in Claude Code and Codex. It never lifts what the kernel marked as a secret file or the system keychain, nor
       a rule the person wrote (`ask` rules keep asking). */
    /* 0.6.8 (owner 16/10/2026, «Come il Desktop: non chiede»; the desktop's rule of 12/10 «Full access non chiede mai»): Full access
       no longer keeps asking for a secret file or the keychain, to read or to write (the desktop's `segretoForzaConferma` leaves
       Full access out the same way). Every other mode still asks, and with nobody in front it is refused; a network path and the
       person-only operations above stay the person's in Full access too; the kernel refuses WRITING the login credentials of
       this computer (~/.ssh keys, .netrc, .npmrc…) before any question, and reading them asks (homeCredential above). */
    /* 0.6.8 (third review, F1; owner 16/10/2026 «Chiedere sempre»): this computer's login credentials (~/.ssh, ~/.npmrc, ~/.aws…) are
       the exception — read only when the person says yes, in Full access too, and refused with nobody in front (home-credentials.ts). */
    if(m==='bypassPermissions'&&base.effect==='ask'&&(!base.rule||base.rule===PATH_BOUNDARY_RULE)&&!homeCredential)return{kind:'allow',source:'bypassPermissions'};
    if(homeCredential&&base.effect==='ask'&&!base.rule)base={effect:'ask',reason:'the file holds a login credential of this computer'};
    if(m==='auto'&&plain&&base.effect==='ask'&&!base.rule&&!protectedProjectMutation(action,projectRoot)){if(!classifier)throw new Error('PERMISSION_AUTO_UNAVAILABLE');const c=await classifier({action,projectRoot});if(c==='allow')return{kind:'allow',source:'auto'};if(c==='deny')return{kind:'deny',code:'PERMISSION_AUTO_DENIED',message:'Automatic classifier denied operation'};base={effect:'ask',reason:'automatic classifier requested confirmation'};}
    if(m==='dontAsk'||!context.interactive)return{kind:'deny',code:'PERMISSION_REQUIRED',message:'Operation requires approval in non-interactive mode'};
    const requestId=randomUUID();pending.set(requestId,action);return{kind:'ask',requestId,action,reason:base.reason,...(base.rule?{rule:base.rule}:{})};
  },async resolve(requestId,decision){const action=pending.get(requestId);if(!action)throw new Error('APPROVAL_NOT_PENDING');const askedIn=pending.askedIn.get(requestId);pending.askedIn.delete(requestId);pending.delete(requestId);/* a network path is answered once, every time: nothing is kept */if(action.sensitive==='network')return;/* the root card: the kernel keeps the chat's yes itself */if(action.wslRoot)return;/* decision 155: a critical deletion is asked every time */if(action.criticalDelete)return;/* decision 373: so is a control file's card */if(action.controlFile)return;/* A5f: and a card where «always» is not enough keeps no grant and no rule, whatever arrives (Hermes tools/approval.py:838-840) */if(action.alwaysNotEnough)return;/* the same for what only the person answers (riga 91: and the «only once» card of Read only): no grant and no rule is kept, whatever decision arrives */if(action.personOnly===true||action.onlyOnce===true||(action.tool==='TalosService'&&action.operation&&PERSON_ONLY_OPERATIONS.has(action.operation)))return;/* riga 72: an MCP card without its tool keeps no grant and no rule for the whole server */if(mcpWithoutItsTool(action))return;/* cure round 1 (G3): a child's card offers «for this session» at most; an «always» that arrives keeps nothing */if(action.sessionOnly&&decision!=='allow-session')return;if(decision==='allow-session'){const {sessionOnly:_once,...kept}=action;grants(askedIn).push(kept);}
    if((decision==='allow-always'||decision==='deny-always')&&persistRule){
      const effect=decision==='allow-always'?'allow':'deny';
      // B1 slice 21. A rule the writing path refuses — a compound command, a line break, a rule that would
      // not match its own request, an allow that narrows nothing — is known before the key is pressed (the
      // full review previews the same refusal). Nothing is written, and the approval is still answered:
      // measured at 805c89a0, the refusal threw out of resolve and the runtime's request was never answered.
      // "Allow always" then answers for this session only, for the identical request, which is what Hermes
      // does when "always" cannot be honoured; "deny always" denies this request and asks again next time.
      let rule:CompiledRule;
      try{rule=parseRule(ruleToPersist(effect,action,projectRoot),effect);}catch{if(effect==='allow')grants(askedIn).push(action);return;}
      await persistRule(effect,action);
      // ⛔ The rule is obeyed from now on, not from the next start: before this, the engine compiled its rules
      // once and "allow always" asked again for the identical command in the same session.
      compiled[effect].push(rule);
      // ⛔ And the session's rule set shows it. The approval dialog explains each request from the rule set
      // this engine was built from (`rules`, the same object); without the rule there, measured: after
      // "allow always" on `npm test`, `npm test && npm publish` asked for segment 2 while the account
      // said segment 1, and the dialog withheld every row as a "possible race". A frozen set is left alone.
      try{const list=rules[effect];if(Array.isArray(list)&&!list.includes(rule.raw))list.push(rule.raw);}catch{}
    }
  },replaceRules(next){
    const {rules:fresh,invalid:bad}=compileRuleSet(next);if(bad.length)throw unreadableRulesError(projectRoot,bad);
    /* in place: the session's rule set is the same object the approval dialog explains requests from (see resolve) */
    for(const effect of ['deny','ask','allow'] as const){
      compiled[effect].splice(0,compiled[effect].length,...fresh[effect]);
      try{const list=rules[effect];const wanted=next[effect];if(Array.isArray(list)&&Array.isArray(wanted))list.splice(0,list.length,...wanted);}catch{}
    }
  }};
}
