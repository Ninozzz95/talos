import fs from 'node:fs';import {homedir} from 'node:os';import {isAbsolute,join,relative,resolve,sep} from 'node:path';import type {CliPaths} from '../paths.ts';import {projectId,resolveCliPaths} from '../paths.ts';import {readConfigScope,writeConfigScope} from '../config/load.ts';import type {PermissionRules} from '../config/types.ts';import {patternNamesOnlyAVerb,ruleMatchesAction,type InvalidRule} from './evaluate.ts';import {parseRule,ruleProblem} from './rule-parser.ts';import {segmentShellCommand} from './shell-segmentation.ts';import type {PermissionAction,PermissionEffect} from './types.ts';
function normalizeResource(resource:string,root:string){const abs=isAbsolute(resource)?resolve(resource):resolve(root,resource);const rel=relative(resolve(root),abs);if(rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel))throw new Error('PATH_NOT_ALLOWED');return rel.split(sep).join('/');}
function spelledRule(a:PermissionAction,root:string):string{if(a.tool==='Bash')return `Bash(${a.command??''})`;if(['Read','Write','Edit'].includes(a.tool))return `${a.tool}(${normalizeResource(a.resource??'',root)})`;if(a.tool==='Mcp')return `Mcp(${a.serverId??''}:${a.operation??'*'})`;if(a.tool==='TalosService')return `TalosService(${a.resource??''}:${a.operation??'*'})`;return `${a.tool}(${a.operation??a.resource??'*'})`;}
/*
 * B1 slice 21 — A RULE IS WRITTEN ONLY IF IT CAN BE READ BACK AND DECIDES THE REQUEST IT WAS WRITTEN FOR.
 *
 * Recorded at e5d197e7 and re-measured at 805c89a0: "allow always" on `ls<LF>rm -rf /` wrote `Bash(ls<LF>rm -rf /)`, which the
 * parser cannot read, and the next start threw; on `git status && npm test; npm publish` it wrote the
 * whole command, which matches none of the segments the engine judges one at a time.
 *
 * ⛔ A compound command is not remembered at all. Measured in the two competitors before deciding:
 * - Claude Code 2.1.274 (claude.exe) offers one rule per subcommand that still asks, capped at five, each
 *   the exact subcommand or a prefix ending in ` *` (`git status *`), and labels the row "don't ask again
 *   for A and B commands" from exactly the rules it writes: shown, but a prefix is broader than the ask.
 * - Hermes Agent (0.20.0 and main f5d19261) persists the dangerous-pattern CATEGORY ("recursive
 *   delete"), and its command-text allowlist refuses any command with a shell operator; when "always"
 *   cannot be honoured it answers "session" instead.
 * A rule per segment here would allow `rm -rf build` inside any other command, and the approval dialog
 * previews exactly one rule, so it could not show what was written. Declining is the only form that
 * neither widens nor hides, and the engine then answers for this session only, as Hermes does.
 */
const ALWAYS_ANSWERS='"allow always" answers for this session only';
export function permissionActionToRule(a:PermissionAction,root:string):string{
  if(a.tool==='Bash'){
    let segments;
    try{segments=segmentShellCommand(a.command??'');}catch{throw new Error(`RULE_COMMAND_UNSUPPORTED: this command cannot be split into the segments the engine judges, so no rule is written for it; ${ALWAYS_ANSWERS}`);}
    if(segments.length>1)throw new Error(`RULE_COMPOUND_COMMAND: a command of ${segments.length} segments is not remembered, because a rule for the whole command matches none of its segments and a rule for each segment would allow it inside any other command; ${ALWAYS_ANSWERS}`);
  }
  const rule=spelledRule(a,root);
  let compiled;
  try{compiled=parseRule(rule,'allow');}catch{throw new Error(`RULE_UNREADABLE: the rule for this request ${ruleProblem(rule)??'cannot be parsed'}, so it could not be read back and is not written; ${ALWAYS_ANSWERS}`);}
  // A verb-only pattern (`cat:*`, `*`) is slice 11's case and keeps slice 11's answer: an allow is refused as
  // RULE_NOT_NARROWED by the writer, and a deny that covers the verb is the safe direction and is written.
  if(!(a.tool==='Bash'&&patternNamesOnlyAVerb(compiled.pattern))&&!ruleMatchesAction(compiled,a,root))throw new Error(`RULE_MATCHES_NOTHING: the rule for this request would not match the request itself, so it is not written; ${ALWAYS_ANSWERS}`);
  return rule;
}
// B1 slice 11. Gemini CLI refuses to *construct* a persistent allow rule for its shell, read, write
// and search tools unless the rule carries an argument-narrowing pattern — a property of the
// writing interface, so it binds a hand-written administrator rule too and not only the
// "don't ask again" button. Measured on this host before the change: this path could produce
// `Bash(*)`, `Bash(**)` and `Bash(cat:*)`, because the rule is the command text and a command whose
// own text is `*` or ends in `:*` becomes exactly the blanket form. A deny that covers everything
// is the safe direction and is still written; only an `allow` that narrows nothing is refused.
function bashRuleNarrowsNothing(rule:string):boolean{const m=/^Bash\((.*)\)$/u.exec(rule);if(!m)return false;const pattern=m[1]!;return pattern===''||pattern==='*'||pattern==='**'||/:\*$/u.test(pattern);}
// B1 slice 21. The rule "always" would write, or the refusal that writes nothing. One function, so the engine answers
// exactly the refusals the writer makes: before this slice an allow that narrows nothing threw out of the
// engine's resolve, and the runtime's approval was never answered.
export function ruleToPersist(effect:Extract<PermissionEffect,'allow'|'deny'>,action:PermissionAction,root:string):string{
  const rule=permissionActionToRule(action,root);if(effect==='allow'&&bashRuleNarrowsNothing(rule))throw new Error(`RULE_NOT_NARROWED:${rule}`);return rule;
}
// ⛔ B1 slice 21. Only the list being changed is written. Measured at 805c89a0: this function wrote all
// three lists into the project-user file, and a list in a later configuration file REPLACES the list of
// an earlier one, so one "allow always" on `npm test` wrote `deny: []` and switched off the deny rules of
// the project's own `.talos-cli/config.json` (`curl evil.example` went from deny to ask).
export async function persistPermissionRule({paths,projectRoot,effect,action}:{paths:CliPaths;projectRoot:string;effect:Extract<PermissionEffect,'allow'|'deny'>;action:PermissionAction}){
  const rule=ruleToPersist(effect,action,projectRoot);
  const current=await readConfigScope({paths,projectRoot,scope:'project-user'});const list=current.permissions?.[effect]??[];
  if(!Array.isArray(list))throw new Error(`RULE_STORE_INVALID: "permissions.${effect}" in the project-user configuration is not a list`);
  // The file keeps whatever other lists it already had; a partial `permissions` object is what the loader
  // merges over the lower scopes, so the type's three required lists do not describe a patch.
  await writeConfigScope({paths,projectRoot,scope:'project-user',patch:{permissions:{[effect]:[...new Set([...list,rule])]} as unknown as PermissionRules}});
}

/*
 * B1 slice 21 — A RULE THAT CANNOT BE READ STOPS THE START, BY NAME.
 *
 * Measured at 805c89a0, starting the interactive CLI with that rule on disk: Ink printed
 * `ERROR PERMISSION_RULE_INVALID:Bash(ls` with the rule's own line break splitting the line, then a
 * stack through parseRule, compileRules, createPermissionEngine and the React reconciler — and nothing
 * said which file held the rule or what to do about it.
 * ⛔ Skipping the rule is not the cure: a skipped deny rule silently allows what it denied (Claude Code
 * 2.1.274 does skip an invalid rule with a warning, deny rules included). The engine refuses to exist.
 */
export class PermissionRulesUnreadableError extends Error{
  readonly code='PERMISSION_RULE_INVALID';
  constructor(message:string){
    super(message);this.name='PermissionRulesUnreadableError';
    // A configuration error is described completely by its message. Its frames point at this constructor,
    // not at anything a person can fix, and the interactive screen prints every frame it is given.
    this.stack=`${this.name}: ${message}`;
  }
}
// Highest precedence first: the loader overlays user, then project, then project-user, and a list in a
// later file replaces the list of an earlier one. So the first file that defines the list is the file the
// engine's list came from. The layout mirrors `files()` in config/load.ts; a test writes through the real
// writer into each scope and asserts this names that exact file, so a drift turns red.
function permissionConfigFiles(projectRoot:string):string[]{
  let paths:CliPaths|null=null;try{paths=resolveCliPaths(process.env,process.platform,homedir());}catch{paths=null;}
  return[...(paths?[join(paths.projectOverridesRoot,projectId(projectRoot),'config.json')]:[]),join(projectRoot,'.talos-cli','config.json'),...(paths?[join(paths.configRoot,'config.json')]:[])];
}
// `undefined` when the file is absent, unreadable or has no `permissions`; `null` when `permissions` is there
// but is not an object of lists, which replaces every lower file's lists at once.
function storedPermissions(file:string):Record<string,unknown>|null|undefined{
  let value:any;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{return undefined;}
  if(!value||typeof value!=='object'||!Object.hasOwn(value,'permissions'))return undefined;
  const permissions=value.permissions;return permissions&&typeof permissions==='object'&&!Array.isArray(permissions)?permissions:null;
}
function locate(projectRoot:string,invalid:InvalidRule):{file:string;whole?:true}|{searched:string[]}{
  const files=permissionConfigFiles(projectRoot);
  for(const file of files){
    const permissions=storedPermissions(file);
    if(permissions===null)return invalid.index===null?{file,whole:true}:{searched:files};
    if(!permissions||!Object.hasOwn(permissions,invalid.effect))continue;
    const list=permissions[invalid.effect];
    const found=invalid.index===null?JSON.stringify(list)===JSON.stringify(invalid.value):Array.isArray(list)&&JSON.stringify(list[invalid.index])===JSON.stringify(invalid.value);
    return found?{file}:{searched:files};
  }
  return{searched:files};
}
// JSON spells the rule the way it appears in the file (a line break as the two characters `\n`), and
// what JSON leaves raw — DEL, C1, line and paragraph separators, bidi controls, invisible characters —
// becomes a visible `\uXXXX`, so nothing in the message can move a terminal's cursor or hide text.
const BACKSLASH=String.fromCharCode(92);
const TERMINAL_UNSAFE=/[\x00-\x1f\x7f-\x9f\p{Zl}\p{Zp}\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(text:string):string{return text.replace(TERMINAL_UNSAFE,character=>{const code=character.codePointAt(0)!;return code>0xffff?`${BACKSLASH}u{${code.toString(16)}}`:`${BACKSLASH}u${code.toString(16).padStart(4,'0')}`;});}
function spelled(value:unknown):string{return JSON.stringify(value)??String(value);}
export function unreadableRulesError(projectRoot:string,invalid:readonly InvalidRule[]):PermissionRulesUnreadableError{
  const first=invalid[0]!;const where=locate(projectRoot,first);const found='file' in where;const whole=found&&where.whole===true;
  const list=whole?'"permissions"':`"permissions.${first.effect}"`;const problem=whole?'is not an object holding the allow, ask and deny lists':first.problem;
  const subject=first.index===null?list:`the ${first.effect} rule ${spelled(first.value)} in ${list}`;
  const place=found?` of ${where.file}`:'';
  const origin=found?'':` It is not in ${where.searched.join(', ')}: these rules were handed to the engine directly.`;
  const fix=!found?'Remove it where these rules come from, then start TALOS again.':whole?`Make ${list} in that file an object such as {"allow":[],"ask":[],"deny":[]}, then start TALOS again.`:first.index===null?`Make ${list} in that file a list of rules, for example [], then start TALOS again.`:`Delete that entry from ${list} in that file, then start TALOS again.`;
  const more=invalid.length>1?` ${invalid.length-1} more permission ${invalid.length===2?'entry is':'entries are'} unreadable too.`:'';
  return new PermissionRulesUnreadableError(inert(`Permission rules cannot be loaded: ${subject}${place} ${problem}.${origin} No rule is skipped, because a skipped deny rule would allow what it denies. ${fix}${more}`));
}
