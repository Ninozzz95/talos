import fs from 'node:fs';
import path from 'node:path';
import {commandOperands,expandHomePrefix,gitPrettyFormatValues,gitRevisionPaths,isReadOnlyShellCommand,readOnlyCommandSpoiled,isUnverifiableArgument,isWindowsStyleSwitch,parseRule,ruleProblem,tokenizeCommand} from './rule-parser.ts';
import {segmentShellCommand} from './shell-segmentation.ts';
import {cmdReadsDifferently,SHELL_IS_CMD} from './cmd-reading.ts';
import {realpathNativeTolerant} from './real-path.ts';
import type {CompiledRule,PermissionAction,PermissionDecision,PermissionEffect,RuleSetInput} from './types.ts';
export type CompiledRules={deny:CompiledRule[];ask:CompiledRule[];allow:CompiledRule[]};
// B1 slice 21. `index` is null when the list itself is not a list. `value` is exactly what was found.
export type InvalidRule={effect:PermissionEffect;index:number|null;value:unknown;problem:string};
// Every rule that can be read is compiled and every one that cannot is reported, in deny, ask, allow
// order. ⛔ Nothing here decides to go on without a rule: that decision belongs to the caller, and the
// engine's is to refuse — a skipped deny rule would silently allow what it denied.
export function compileRuleSet(input:RuleSetInput):{rules:CompiledRules;invalid:InvalidRule[]}{
  const rules:CompiledRules={deny:[],ask:[],allow:[]};const invalid:InvalidRule[]=[];
  const source=(input??{}) as Partial<Record<PermissionEffect,unknown>>;
  for(const effect of ['deny','ask','allow'] as const){
    const list=source[effect];
    if(!Array.isArray(list)){invalid.push({effect,index:null,value:list,problem:'is not a list of rules'});continue;}
    list.forEach((value:unknown,index:number)=>{const problem=ruleProblem(value);if(problem!==null)invalid.push({effect,index,value,problem});else rules[effect].push(parseRule(value as string,effect));});
  }
  return{rules,invalid};
}
export function compileRules(input:RuleSetInput):CompiledRules{const {rules,invalid}=compileRuleSet(input);const first=invalid[0];if(first)throw new Error(`PERMISSION_RULE_INVALID:${String(first.value)}`);return rules;}
function inside(root:string,candidate:string){const rel=path.relative(path.resolve(root),path.resolve(candidate));return rel===''||(!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel));}
function wildcard(text:string,pattern:string){if(pattern==='*'||pattern==='**')return true;const escaped=pattern.replace(/[.+^${}()|[\]\\]/gu,'\\$&').replace(/\*\*/gu,'.*').replace(/\*/gu,'[^\\s]*');return new RegExp(`^${escaped}$`,'u').test(text);}
// B1 slice 11. In a Bash pattern the verb is separated from its wildcard by a trailing `:*`, and
// only by that. The previous form split on the FIRST colon, which a Windows absolute path supplies
// itself: `Bash(cat C:\…\id_ed25519)` became the verb `cat C` plus the leftover `\…\id_ed25519`,
// so a rule naming an exact path matched nothing — measured on this host, in the allow direction
// AND in the deny direction — while `Bash(cat:*)` still read as "any argument". Anchoring the
// separator at the end also stops a colon inside a command from being eaten: `Bash(npm run
// test:unit)` now means that script, where before it meant the bare `npm run test`.
const BASH_VERB_WILDCARD=/:\*$/u;
// A pattern that names a command and not a path. These are the rules that must not be able to lift
// the location boundary: the person said which command, never which file.
export function patternNamesOnlyAVerb(pattern:string):boolean{return pattern==='*'||pattern==='**'||BASH_VERB_WILDCARD.test(pattern);}
function matches(rule:CompiledRule,action:PermissionAction,projectRoot:string):boolean{
  if(rule.tool!==action.tool)return false;const p=rule.pattern;
  if(action.tool==='Bash'){const tokens=tokenizeCommand(action.command??'');if(!tokens.length)return false;if(p==='*')return true;const head=BASH_VERB_WILDCARD.test(p)?p.slice(0,-2):p;const expected=tokenizeCommand(head);if(expected.length===0)return false;if(expected.some((v,i)=>tokens[i]!==v))return false;if(BASH_VERB_WILDCARD.test(p))return true;return expected.length===tokens.length;}
  if(['Read','Write','Edit'].includes(action.tool)){if(!action.resource)return false;const candidate=path.isAbsolute(action.resource)?path.resolve(action.resource):path.resolve(projectRoot,action.resource);if(!inside(projectRoot,candidate)&&p.startsWith('.'))return false;if(p==='*')return true;if(p==='./**')return inside(projectRoot,candidate);const rel=path.relative(projectRoot,candidate).split(path.sep).join('/');return wildcard(rel,p.replace(/^\.\//u,''));}
  if(action.tool==='Mcp'){const target=`${action.serverId??''}:${action.operation??''}`;return wildcard(target,p);}
  if(action.tool==='TalosService'){return wildcard(action.operation??'',p)||wildcard(`${action.resource??''}:${action.operation??''}`,p);}
  return wildcard(action.operation??action.resource??'',p);
}
// B1 slice 21. The writing path asks this before persisting a rule: a rule that does not match the very
// request it was written for would be stored and do nothing, which is how a compound command's
// `Bash(<whole command>)` never took effect.
export function ruleMatchesAction(rule:CompiledRule,action:PermissionAction,projectRoot:string):boolean{return matches(rule,action,projectRoot);}
// B1 slice 10. The read-only shell allowance is location-bounded: it survives only while every
// path-shaped argument of the segment resolves inside the project. This removes a silent
// auto-approval. It is not containment and it is not credential protection — it constrains the
// invocations TALOS's own tools produce, not a subprocess that opens files by itself, a path
// computed at runtime, or an interpreter handed code on its command line.
export const PATH_BOUNDARY_RULE='built-in:path-outside-project';
// Resolve the real path, expanding links, Windows 8.3 short names and the `\\?\` prefix. The
// JavaScript realpath expands neither (measured 2026-09-16: realpathSync('C:\\PROGRA~1') returns it
// unchanged and throws EISDIR on a `\\?\` path, while realpathSync.native returns 'C:\Program
// Files'). A path that does not exist yet is resolved through its longest existing ancestor, so a
// link in the middle of it is still followed, and anything that cannot be resolved at all throws.
export function realPath(target:string):string{
  let current=path.resolve(target);const tail:string[]=[];
  for(let guard=0;guard<4096;guard+=1){
    /* F-E-001: inside the sandbox the native answer is refused (EPERM); real-path.ts falls back to the JavaScript walk, never past a short name */
    try{const real=realpathNativeTolerant(current);return tail.length?path.join(real,...tail):real;}
    catch(error){const code=(error as NodeJS.ErrnoException).code;if(code!=='ENOENT'&&code!=='ENOTDIR')throw error;}
    const parent=path.dirname(current);
    if(parent===current)throw new Error('PATH_UNRESOLVABLE');
    tail.unshift(path.basename(current));current=parent;
  }
  throw new Error('PATH_UNRESOLVABLE');
}
// Fail closed, the way the shared kernel's own control-path check does: a path that cannot be
// resolved, a command that cannot be tokenized and a comparison that throws all ask, never allow.
/* C-006: a folder the asking session may READ outside the project — its own saved tool outputs (output-store.ts). Judged on the
   real path like the project, so a link inside it cannot lead elsewhere. */
function insideReadable(readableRoots:readonly string[],candidate:string):boolean{
  for(const root of readableRoots){
    if(!inside(path.resolve(root),candidate))continue;
    try{if(inside(realPath(root),realPath(candidate)))return true;}catch{/* unresolvable: not readable */}
  }
  return false;
}
function readOnlyCommandStaysInside(command:string,projectRoot:string,readableRoots:readonly string[]=[]):{ok:true}|{ok:false;reason:string}{
  const operands=commandOperands(command);
  if(!operands)return{ok:false,reason:'read-only shell command could not be reduced to verifiable arguments'};
  // The root is canonicalized once. Without this, a project opened through a link or under a short
  // 8.3 name is a spelling no argument can ever be under, and every in-project read prompts.
  let realRoot:string;
  try{realRoot=realPath(projectRoot);}catch{return{ok:false,reason:'project root could not be resolved'};}
  const lexicalRoot=path.resolve(projectRoot);
  const outside=(operand:string,resolved:string)=>({ok:false as const,reason:`read-only shell command would read outside the project: "${operand}" resolves to ${resolved}`});
  /* item 7 (0.7.0): a git log/show template is printed, not opened; each is left out once, so the same text as a path is still judged */
  const templates=gitPrettyFormatValues(command);
  /* the git cure, piece 2: `<rev>:<path>` is inside only when the project is the repository's root and the path neither starts at a
     root nor climbs; otherwise it asks */
  const revisions=gitRevisionPaths(command);const repositoryRoot=revisions.length>0&&existsQuietly(path.join(projectRoot,'.git'));
  for(const operand of operands){
    const template=templates.indexOf(operand);if(template>=0){templates.splice(template,1);continue;}
    if(isUnverifiableArgument(operand))return{ok:false,reason:`read-only shell command has an argument that cannot be statically verified: ${operand}`};
    const revision=revisions.indexOf(operand);
    if(revision>=0){
      revisions.splice(revision,1);const inRepository=operand.slice(operand.indexOf(':')+1);
      /* judge v2495: `./` counts from the current folder, the project's, so it stays inside wherever the repository's root is */
      if((!repositoryRoot&&!inRepository.startsWith('./'))||/^[\\/]/u.test(inRepository)||inRepository.includes('..'))return{ok:false,reason:`read-only shell command names a path that cannot be resolved: ${operand}`};
      /* round 2 (judge v2509): the same word is judged as a path below too, since Windows can open it as one (a network path, a
         stream of a file outside); `HEAD:a.txt` resolves inside the project and costs nothing */
    }
    const lexical=path.resolve(projectRoot,expandHomePrefix(operand));
    // An argument already outside the project lexically is answered without touching the
    // filesystem. Only a path that looks inside needs the real one, because a link is the only way
    // it can still escape — and this is what keeps an unreachable network path from stalling the
    // decision for 21 seconds per operand while the OS waits on a host that will never answer.
    if(!inside(lexicalRoot,lexical)&&!inside(realRoot,lexical)){
      if(isWindowsStyleSwitch(operand)&&!existsQuietly(lexical))continue;
      if(insideReadable(readableRoots,lexical))continue;
      return outside(operand,lexical);
    }
    try{
      const real=realPath(lexical);
      if(!inside(realRoot,real))return outside(operand,real);
    }catch{return{ok:false,reason:`read-only shell command names a path that cannot be resolved: ${operand}`};}
  }
  return{ok:true};
}
// A Windows switch is only treated as a switch while it names nothing. `dir /s` must not prompt and
// must not be described as a path; `dir /Users` names a real directory and is judged as one.
function existsQuietly(target:string):boolean{try{return fs.existsSync(target);}catch{return true;}}
/* Security (owner 01/10: block): a write is judged on its REAL path too. The lexical check alone let `link/x.txt` through
   when `link` is a junction or symlink to a folder outside — "inside", so accept-edits or an allow rule on the project wrote
   outside without asking. Like Claude Code (permissions › Symlinks: the requested and the resolved path) and the desktop
   kernel (F4-03), and CWE-59 (resolve before comparing). A write path that cannot be resolved is treated as outside. */
function hardPathDeny(action:PermissionAction,projectRoot:string):PermissionDecision|null{
  if(!['Write','Edit'].includes(action.tool)||!action.resource)return null;
  const candidate=path.isAbsolute(action.resource)?path.resolve(action.resource):path.resolve(projectRoot,action.resource);
  if(!inside(projectRoot,candidate))return{effect:'deny',reason:'write path is outside the authorized project'};
  let real:string,realRoot:string;
  try{realRoot=realPath(projectRoot);real=realPath(candidate);}
  catch{return{effect:'deny',reason:'write path could not be resolved, so it is treated as outside the authorized project'};}
  if(!inside(realRoot,real))return{effect:'deny',reason:'write path is outside the authorized project (it goes through a link)'};
  return null;
}
// An allow rule that names only a verb is downgraded to `ask` when the command reads outside the
// project. It is NOT a denial: the person can still say yes in the moment. A rule that names the
// path is obeyed, which is the whole distinction — "I meant this file" against "I meant this
// command". Only `allow` is narrowed here; `deny` and `ask` rules pass through untouched.
function verbOnlyAllowDowngrade(rule:CompiledRule,action:PermissionAction,projectRoot:string):PermissionDecision|null{
  if(rule.tool!=='Bash'||action.tool!=='Bash')return null;
  if(!patternNamesOnlyAVerb(rule.pattern))return null;
  /* the git cure, piece 3: `Bash(git log:*)` means «read the history»; a form that one of its options makes write or run asks */
  if(!isReadOnlyShellCommand(action.command??''))return readOnlyCommandSpoiled(action.command??'')?{effect:'ask',rule:rule.raw,reason:`allow rule ${rule.raw} names a command and not a path, and read-only shell command could not be reduced to verifiable arguments`}:null;
  const boundary=readOnlyCommandStaysInside(action.command??'',projectRoot);
  if(boundary.ok)return null;
  return{effect:'ask',rule:rule.raw,reason:`allow rule ${rule.raw} names a command and not a path, and ${boundary.reason}`};
}
/* Decision 157 (owner 04/11/2026): in Full access a write outside the project is not refused by the boundary; the person's own deny
   and ask rules still speak, and with none it is an `ask` the mode answers (permission-engine.ts). */
function evaluateSingle(rules:CompiledRules,action:PermissionAction,projectRoot:string,readableRoots:readonly string[]=[],fullAccess=false):PermissionDecision{
  const hard=hardPathDeny(action,projectRoot);if(hard&&!fullAccess)return hard;
  if(hard){for(const effect of ['deny','ask'] as const)for(const r of rules[effect])if(matches(r,action,projectRoot))return{effect,rule:r.raw,reason:`matched ${effect} rule`};return{effect:'ask',rule:PATH_BOUNDARY_RULE,reason:hard.reason};}
  for(const effect of ['deny','ask'] as const)for(const r of rules[effect])if(matches(r,action,projectRoot))return{effect,rule:r.raw,reason:`matched ${effect} rule`};
  // ⛔ A downgrade is not a final answer. The natural shape of a configuration is a permissive base
  // plus specific grants appended after it, so the rule that names the path is usually the LAST one
  // — and if the first verb-only match ended the search, the very rule this slice tells a person to
  // add would do nothing. The search continues; a rule that names the path still wins, and the
  // first downgrade only speaks when no such rule exists. deny and ask keep first-match-wins.
  let downgraded:PermissionDecision|null=null;
  for(const r of rules.allow){
    if(!matches(r,action,projectRoot))continue;
    const downgrade=verbOnlyAllowDowngrade(r,action,projectRoot);
    if(!downgrade)return{effect:'allow',rule:r.raw,reason:'matched allow rule'};
    downgraded??=downgrade;
  }
  if(downgraded)return downgraded;if(action.tool==='Read'&&action.resource){const candidate=path.isAbsolute(action.resource)?path.resolve(action.resource):path.resolve(projectRoot,action.resource);if(inside(projectRoot,candidate))return{effect:'allow',reason:'read-only action inside project'};if(insideReadable(readableRoots,candidate))return{effect:'allow',reason:"read of this session's saved tool output"};}if(action.tool==='Bash'&&isReadOnlyShellCommand(action.command??'')){const boundary=readOnlyCommandStaysInside(action.command??'',projectRoot,readableRoots);if(boundary.ok)return{effect:'allow',reason:'documented read-only shell command'};return{effect:'ask',rule:PATH_BOUNDARY_RULE,reason:boundary.reason};}return{effect:'ask',reason:'no rule matched'};}
export function evaluateRules(rules:CompiledRules,action:PermissionAction,{projectRoot,readableRoots=[],fullAccess=false,shellIsCmd=SHELL_IS_CMD}:{projectRoot:string;readableRoots?:readonly string[];fullAccess?:boolean;shellIsCmd?:boolean}):PermissionDecision{
  if(action.tool!=='Bash')return evaluateSingle(rules,action,projectRoot,readableRoots,fullAccess);
  let segments;
  /* Finding 15: a command TALOS cannot split is refused by the policy. C-005: when no Bash deny rule exists (nothing could hide
     behind the composition) the refusal is marked, and bypassPermissions alone may lift it (permission-engine.ts). */
  try{segments=segmentShellCommand(action.command??'');}catch{return rules.deny.some(rule=>rule.tool==='Bash')?{effect:'deny',reason:'unsupported shell composition'}:{effect:'deny',reason:'unsupported shell composition',composition:'unsupported'};}
  const decisions=segments.map(segment=>evaluateSingle(rules,{...action,command:segment.command},projectRoot,readableRoots));
  /* 0.6.17, R4 (reviewer of A5i, 19/11/2026; it was already so in 0.6.16): on Windows the command runs through cmd.exe, which can read
     it as other commands than the segments judged here (cmd-reading.ts): `Bash(mkdir:*)` allowed `mkdir 'x&mkdir y&'`, a second
     mkdir for cmd. No allow rule and no default allowance covers such a command: it asks, WITHOUT a rule, so Full access still runs
     it (permission-engine.ts, as for every rule-less ask) and accept edits judges it on its own (it refuses it there too). A deny or an
     ask of a segment still wins first. Codex windows_dangerous_commands.rs:190-194 splits cmd operators even inside a token. */
  const readsDifferently=cmdReadsDifferently(action.command??'',shellIsCmd);
  for(const effect of ['deny','ask','allow'] as const){
    if(effect==='allow'&&readsDifferently&&decisions.some(decision=>decision.effect==='allow'))return{effect:'ask',reason:'cmd.exe, the shell on Windows, would read this command differently from how TALOS checked it'};
    const index=decisions.findIndex(decision=>decision.effect===effect);
    if(index>=0){const decision=decisions[index]!;return{...decision,reason:segments.length>1?`segment ${index+1}: ${decision.reason}`:decision.reason};}
  }
  return{effect:'deny',reason:'unsupported shell composition'};
}
