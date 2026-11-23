import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sensitivityOfClass} from './from-approval.ts';
import {createPermissionEngine,type ApprovalDecision,type AutoClassifier} from './permission-engine.ts';
import {formatPermissionSimulation,simulatePermission,type PermissionSimulation} from './permission-explanation.ts';
import type {PermissionAction,PermissionEffect,PermissionMode,PermissionSensitivity,RuleSetInput} from './types.ts';

/*
 * F-P-001 (stress test 0.5.2, owner 09/10/2026 «Simulazione permessi = realtà»). The dry-run read the rules alone: it said
 * `deny` for a command that acceptEdits ran, and `allow` for reading `.env`, which a session asks about in every mode. It now
 * answers what a session would do: the same engine and mode a run uses (`talos --permission-mode <mode>`, otherwise the
 * configured mode), with the action marked the way the kernel marks it when it asks (path-policy.mjs `motivoDaChiedere`:
 * a secret file, the keychain, a path outside the project), once with a person to ask and once in `-p`, where nobody is.
 * The rules' own verdict and the decisive segment stay, under `rules` and `explanation`.
 * Sources (09/10/2026): Claude Code permission-modes docs (the mode applies after deny/ask/allow rules; protected paths keep
 * asking); Codex `codex execpolicy check` (evaluates a command against the policy that runs it); OpenCode permissions docs
 * (allow/ask/deny resolved per tool input, the same resolution the agent uses).
 */
export type DryRunOutcome={effect:PermissionEffect;reason:string;code?:string};
export type ModeAwareSimulation=PermissionSimulation&{
  mode:PermissionMode;rules:PermissionEffect;sensitive:PermissionSensitivity|null;secretCheck:'done'|'unavailable';
  inSession:DryRunOutcome;print:DryRunOutcome;
};
export type SecretClassifier=(action:PermissionAction)=>Promise<PermissionSensitivity|null>;

const SOURCE_REASON:Readonly<Record<string,string>>=Object.freeze({
  acceptEdits:'accept edits lets it go',bypassPermissions:'Full access lets it go',session:'allowed for this session',auto:'the automatic classifier lets it go',
  rule:'allowed without asking: a read inside the project or a read-only command',
});
const SENSITIVE_LABEL:Readonly<Record<PermissionSensitivity,string>>=Object.freeze({
  secret:'a file that may contain keys or passwords',keychain:'the system keychain',outside:'a path outside the project',
  'outside-hidden':'a hidden folder outside the project',network:'a network path',
});

function outcomeOf(decision:ApprovalDecision):DryRunOutcome{
  if(decision.kind==='allow')return{effect:'allow',reason:SOURCE_REASON[decision.source]??`allowed by the rule ${decision.source}`};
  if(decision.kind==='ask')return{effect:'ask',reason:decision.reason};
  return{effect:'deny',reason:decision.message,code:decision.code};
}

/** The kernel's own check of a path or a command, from the kernel module the session runs (bundled builds ship it by name). */
export function kernelSecretClassifier(repoRoot:string,projectRoot:string):SecretClassifier{
  let loading:Promise<any>|null=null;
  return async action=>{
    const policy=await (loading??=import(pathToFileURL(join(repoRoot,'harness-ui','src','path-policy.mjs')).href));
    const target=action.resource?resolve(projectRoot,action.resource):undefined;
    let found:any=null;
    if(action.tool==='Bash'&&action.command)found=policy.motivoDaChiedere({tipo:'shell',comando:action.command,cartella:projectRoot});
    else if(action.tool==='Read'&&target)found=policy.motivoDaChiedere({tipo:'leggi',percorso:target,cartella:projectRoot});
    else if((action.tool==='Write'||action.tool==='Edit')&&target)found=policy.nominaUnSegreto(target,{cartella:projectRoot});
    return found?sensitivityOfClass(typeof found.classe==='string'?found.classe:undefined):null;
  };
}

/*
 * Stress test 0.5.5, F-P-004 (S1): in bypassPermissions `type .\.e*v` read `.env` and `type keys\id_*` read a private key. The kernel's
 * glob step (harness-ui/src/path-policy.mjs `paroleDellaShell`, :435-441) always takes `\` as bash's escape and drops it, so
 * `keys\id_*` became `keysid_*` and matched nothing — but the CLI runs commands through cmd.exe (brokered-executor.ts), where `\`
 * separates the path. Measured: `keys/id_*` and `./.e*v` are caught, the backslash spellings are not. Until the kernel reads both
 * (handed to the desktop), the CLI asks the kernel again with the cmd reading (`\` as `/`) for a shell command that carries a
 * backslash and a wildcard, and keeps the stricter answer. A check that throws is a secret: a gate that cannot decide refuses.
 */
export function backslashGlobSecretCheck(classify:SecretClassifier):(action:PermissionAction)=>Promise<PermissionSensitivity|null>{
  return async action=>{
    if(action.tool!=='Bash'||!action.command||!/\\/u.test(action.command)||!/[*?[{]/u.test(action.command))return null;
    try{return await classify({...action,command:action.command.replaceAll('\\','/')});}catch{return'secret';}
  };
}

/*
 * F-P-001, second pass (stress test of 0.5.3, S2): in `auto` the dry-run said "ask" where `-p` ran mkdir, `npm test`, a read outside
 * and a write inside, because the session's engine has the automatic classifier (main.ts `createLocalAutoClassifier`) and this one
 * did not. The caller passes the same classifier the session would get; without one the answer stays "ask", said as such.
 */
export async function simulatePermissionInMode({rules,action,projectRoot,mode,classifySecret,classifier}:{rules:RuleSetInput;action:PermissionAction;projectRoot:string;mode:PermissionMode;classifySecret?:SecretClassifier;classifier?:AutoClassifier}):Promise<ModeAwareSimulation>{
  const base=simulatePermission({rules,action,projectRoot});
  let sensitive:PermissionSensitivity|null=null,secretCheck:'done'|'unavailable'='unavailable';
  if(classifySecret){try{sensitive=await classifySecret(action);secretCheck='done';}catch{secretCheck='unavailable';}}
  const marked:PermissionAction=sensitive?{...action,sensitive}:action;
  const engine=createPermissionEngine({projectRoot,rules,...(classifier?{classifier}:{})});
  const judge=async(interactive:boolean):Promise<DryRunOutcome>=>{
    try{return outcomeOf(await engine.decide(marked,{interactive,mode}));}
    catch(error){if(error instanceof Error&&error.message==='PERMISSION_AUTO_UNAVAILABLE')return{effect:'ask',reason:'the automatic classifier decides when it runs; what it would ask is refused in -p'};throw error;}
  };
  const inSession=await judge(true),print=await judge(false);
  return{...base,effect:inSession.effect,requiresApproval:inSession.effect==='ask',rules:base.effect,mode,sensitive,secretCheck,inSession,print};
}

export function formatModeAwareSimulation(simulation:ModeAwareSimulation):string{
  const [,...ruleLines]=formatPermissionSimulation(simulation).split('\n');
  const lines=[
    `Permission dry-run: ${simulation.effect}`,
    `Mode: ${simulation.mode} · in a session: ${simulation.inSession.effect} (${simulation.inSession.reason}) · with -p: ${simulation.print.effect} (${simulation.print.reason})`,
  ];
  if(simulation.sensitive)lines.push(`Marked by TALOS: ${SENSITIVE_LABEL[simulation.sensitive]}`);
  if(simulation.secretCheck==='unavailable')lines.push('Secret check unavailable: the kernel module could not be read, so a secret file is not recognised here');
  lines.push(`Rules alone: ${simulation.rules}`);
  return[...lines,...ruleLines].join('\n');
}
