import type {AutoClassifier} from './permission-engine.ts';import {tokenizeCommand} from './rule-parser.ts';
const SAFE_EXACT=[['git','status'],['git','diff'],['git','log'],['npm','test'],['npm','run','test'],['npm','run','lint'],['npm','run','typecheck'],['npx','tsc','--noEmit'],['rg'],['grep'],['ls'],['dir']];
/**
 * Whether the shell commands of this session run inside a VERIFIED sandbox. Only `{verified:true}` counts; anything
 * else — `false`, a truthy non-object, a thrown error, no source at all — is "not verified".
 */
export type ShellIsolationSource=()=>Promise<{verified:boolean;reason?:string}>|{verified:boolean;reason?:string};
/*
 * ⭐⭐⭐ R0 lane S — owner decision 2 (2026-09-23): TALOS `auto` on a host whose shell isolation is not verified ASKS
 * the person for every command; the classifier never auto-allows one. It is Codex's rule ("If the command is flagged
 * as dangerous or we have no sandbox protection, we should never allow it to run without approval",
 * codex-rs/core/src/exec_policy.rs, 2026-09-01), chosen over Claude Code's "the classifier evaluates the underlying
 * command" (gate §0.3 D1): SAFE_EXACT includes `npm test` and `npm run *`, which run the project's own code.
 * ⛔ Edits and reads keep the mode's semantics (amendment 3, Claude Code rule D2): only Bash changes.
 * ⛔ Explicit allow rules and session grants are the person's own answer and are decided BEFORE the classifier
 *   (permission-engine.ts); this rule does not touch them.
 * ⛔ Fail-safe by construction: with no isolation source the classifier asks. Whoever builds it must pass the
 *   session's real isolation state for SAFE_EXACT to be auto-allowed on a verified host.
 */
async function shellIsVerified(source:ShellIsolationSource|undefined):Promise<boolean>{
  if(!source)return false;
  try{const state=await source();return typeof state==='object'&&state!==null&&state.verified===true;}catch{return false;}
}
export function createLocalAutoClassifier(options:{shellIsolation?:ShellIsolationSource}={}):AutoClassifier{return async({action})=>{if(action.tool==='Read')return'allow';if(action.tool==='Edit'||action.tool==='Write')return'allow';if(action.tool==='Bash'){const t=tokenizeCommand(action.command??'');if(!t.length)return'ask';for(const p of SAFE_EXACT){if(p.every((v,i)=>t[i]===v))return await shellIsVerified(options.shellIsolation)?'allow':'ask';}return'ask';}if(action.tool==='TalosService'&&/^(?:list|read|search|status)$/iu.test(action.operation??''))return'allow';return'ask';};}
