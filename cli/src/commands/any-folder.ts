/*
 * Judge v1534 point 2 («one line», step 3, 11/11/2026): `talos doctor`, `talos provider …`, `talos session …` and `talos remote` read
 * or host; they do not stop on trust. In a folder nobody ever decided they run with the folder's project settings, instructions, hooks
 * and connections left out (form B, the TUI's own «No»: `projectUntrusted`), and say so in ONE line on stderr. A folder whose trust
 * was given and then changed (PROJECT_TRUST_INVALIDATED) still stops them: that is a warning, not a missing answer. Commands that run
 * the project's own code (`talos research`, the automations, the forge owner, `-p`) keep asking for trust.
 * Precedent: Claude Code's `mcp list`/`get` no longer start a repo's servers in an untrusted workspace and show them as pending
 * (CHANGELOG.md:5169); Codex can skip every project configuration layer (codex-rs/config/src/state.rs:55).
 */
import type {CommandContext} from './context.ts';
import {assessProjectTrust,projectTrustFailure} from '../security/project-trust-gate.ts';
import {t} from '../i18n/index.ts';

/** True when nobody ever decided this folder; throws when its trust was given and then changed. */
export async function folderNobodyDecided(ctx:Pick<CommandContext,'projectRoot'|'paths'>):Promise<boolean>{
  const assessment=await assessProjectTrust({projectRoot:ctx.projectRoot,trustRoot:ctx.paths.trust.projects});
  if(assessment.trusted&&(assessment.folder===undefined||assessment.folder.decided))return false;
  const failure=projectTrustFailure(assessment) as Error&{code?:string};
  if(failure.code!=='PROJECT_TRUST_REQUIRED')throw failure;
  return true;
}

/** Judge v1579 point 3: whether a command that only reads may read this folder's project settings: yes when it is trusted now (or
 *  when there is no trust store, a test's hand-built context); no when nobody decided it, and no when its trust was given and then
 *  changed. Never throws: a reader that cannot tell leaves the settings out. */
export async function projectSettingsReadable(ctx:Pick<CommandContext,'projectRoot'|'paths'>):Promise<boolean>{
  if(!ctx.paths?.trust?.projects)return true;
  try{return !(await folderNobodyDecided(ctx));}catch{return false;}
}

/** The one line a read-or-host command prints when it left the folder's project settings out. */
export function projectSettingsIgnoredLine():string{return `${t('common.trust.projectSettingsIgnored')}\n`;}

/** `ctx.createRuntimeContext(input)` for a command that reads or hosts: in a folder nobody decided, form B and one line.
 *  A context with no trust store (a test's hand-built one) is handed to its factory as it is: the factory's own gate decides. */
export async function runtimeContextInAnyFolder(ctx:CommandContext,input:Record<string,unknown>):Promise<any>{
  if(!ctx.paths?.trust?.projects||!await folderNobodyDecided(ctx))return ctx.createRuntimeContext(input);
  ctx.io.writeErr(projectSettingsIgnoredLine());
  return ctx.createRuntimeContext({...input,trustVerified:true,projectUntrusted:true});
}
