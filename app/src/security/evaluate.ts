import fs from 'node:fs';
import path from 'node:path';
import {commandOperands,expandHomePrefix,isReadOnlyShellCommand,isUnverifiableArgument,isWindowsStyleSwitch,parseRule,ruleProblem,tokenizeCommand} from './rule-parser.ts';
import {segmentShellCommand} from './shell-segmentation.ts';
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
function realPath(target:string):string{
  let current=path.resolve(target);const tail:string[]=[];
  for(let guard=0;guard<4096;guard+=1){
    try{const real=fs.realpathSync.native(current);return tail.length?path.join(real,...tail):real;}
    catch(error){const code=(error as NodeJS.ErrnoException).code;if(code!=='ENOENT'&&code!=='ENOTDIR')throw error;}
    const parent=path.dirname(current);
    if(parent===current)throw new Error('PATH_UNRESOLVABLE');
    tail.unshift(path.basename(current));current=parent;
  }
  throw new Error('PATH_UNRESOLVABLE');
}
// Fail closed, the way the shared kernel's own control-path check does: a path that cannot be
// resolved, a command that cannot be tokenized and a comparison that throws all ask, never allow.
function readOnlyCommandStaysInside(command:string,projectRoot:string):{ok:true}|{ok:false;reason:string}{
  const operands=commandOperands(command);
  if(!operands)return{ok:false,reason:'read-only shell command could not be reduced to verifiable arguments'};
  // The root is canonicalized once. Without this, a project opened through a link or under a short
  // 8.3 name is a spelling no argument can ever be under, and every in-project read prompts.
  let realRoot:string;
  try{realRoot=realPath(projectRoot);}catch{return{ok:false,reason:'project root could not be resolved'};}
  const lexicalRoot=path.resolve(projectRoot);
  const outside=(operand:string,resolved:string)=>({ok:false as const,reason:`read-only shell command would read outside the project: "${operand}" resolves to ${resolved}`});
  for(const operand of operands){
    if(isUnverifiableArgument(operand))return{ok:false,reason:`read-only shell command has an argument that cannot be statically verified: ${operand}`};
    const lexical=path.resolve(projectRoot,expandHomePrefix(operand));
    // An argument already outside the project lexically is answered without touching the
    // filesystem. Only a path that looks inside needs the real one, because a link is the only way
    // it can still escape — and this is what keeps an unreachable network path from stalling the
    // decision for 21 seconds per operand while the OS waits on a host that will never answer.
    if(!inside(lexicalRoot,lexical)&&!inside(realRoot,lexical)){
      if(isWindowsStyleSwitch(operand)&&!existsQuietly(lexical))continue;
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
function hardPathDeny(action:PermissionAction,projectRoot:string):PermissionDecision|null{if(!['Read','Write','Edit'].includes(action.tool)||!action.resource)return null;const candidate=path.isAbsolute(action.resource)?path.resolve(action.resource):path.resolve(projectRoot,action.resource);if(!inside(projectRoot,candidate)&&action.tool!=='Read')return{effect:'deny',reason:'write path is outside the authorized project'};return null;}
// An allow rule that names only a verb is downgraded to `ask` when the command reads outside the
// project. It is NOT a denial: the person can still say yes in the moment. A rule that names the
// path is obeyed, which is the whole distinction — "I meant this file" against "I meant this
// command". Only `allow` is narrowed here; `deny` and `ask` rules pass through untouched.
function verbOnlyAllowDowngrade(rule:CompiledRule,action:PermissionAction,projectRoot:string):PermissionDecision|null{
  if(rule.tool!=='Bash'||action.tool!=='Bash')return null;
  if(!patternNamesOnlyAVerb(rule.pattern))return null;
  if(!isReadOnlyShellCommand(action.command??''))return null;
  const boundary=readOnlyCommandStaysInside(action.command??'',projectRoot);
  if(boundary.ok)return null;
  return{effect:'ask',rule:rule.raw,reason:`allow rule ${rule.raw} names a command and not a path, and ${boundary.reason}`};
}
function evaluateSingle(rules:CompiledRules,action:PermissionAction,projectRoot:string):PermissionDecision{
  const hard=hardPathDeny(action,projectRoot);if(hard)return hard;
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
  if(downgraded)return downgraded;if(action.tool==='Read'&&action.resource){const candidate=path.isAbsolute(action.resource)?path.resolve(action.resource):path.resolve(projectRoot,action.resource);if(inside(projectRoot,candidate))return{effect:'allow',reason:'read-only action inside project'};}if(action.tool==='Bash'&&isReadOnlyShellCommand(action.command??'')){const boundary=readOnlyCommandStaysInside(action.command??'',projectRoot);if(boundary.ok)return{effect:'allow',reason:'documented read-only shell command'};return{effect:'ask',rule:PATH_BOUNDARY_RULE,reason:boundary.reason};}return{effect:'ask',reason:'no rule matched'};}
export function evaluateRules(rules:CompiledRules,action:PermissionAction,{projectRoot}:{projectRoot:string}):PermissionDecision{
  if(action.tool!=='Bash')return evaluateSingle(rules,action,projectRoot);
  let segments;
  try{segments=segmentShellCommand(action.command??'');}catch{return{effect:'deny',reason:'unsupported shell composition'};}
  const decisions=segments.map(segment=>evaluateSingle(rules,{...action,command:segment.command},projectRoot));
  for(const effect of ['deny','ask','allow'] as const){
    const index=decisions.findIndex(decision=>decision.effect===effect);
    if(index>=0){const decision=decisions[index]!;return{...decision,reason:segments.length>1?`segment ${index+1}: ${decision.reason}`:decision.reason};}
  }
  return{effect:'deny',reason:'unsupported shell composition'};
}
