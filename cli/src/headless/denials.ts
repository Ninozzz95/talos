import type {PermissionAction} from '../security/types.ts';
/*
 * Ticket C-005/C-006 (owner 01/10: «in headless un tool negato torna al modello come errore del tool»). A denied approval in
 * `talos -p` no longer ends the run: the kernel is answered "no" with a reason the model can act on, the turn goes on, and
 * the denial is kept for the result (`permissionDenials`) and announced in the stream (warning TOOL_PERMISSION_DENIED).
 * Precedents: Codex turns every rejection into `FunctionCallError::RespondToModel` (core/src/tools/events.rs:449-472);
 * Claude Code's print mode answers the model and lists `permission_denials` in its result; OpenCode answers a rule denial to
 * the model (`PermissionDeniedError`). Nothing denied is run: the answer is still "no".
 */
export type PermissionDenial={requestId:string;tool:PermissionAction['tool'];command?:string;resource?:string;code:string;message:string};
export const TOOL_PERMISSION_DENIED='TOOL_PERMISSION_DENIED';

export function permissionDenial(requestId:string,action:PermissionAction,decision:{code:string;message:string}):PermissionDenial{
  return{requestId,tool:action.tool,...(action.command!==undefined?{command:action.command}:{}),...(action.resource!==undefined?{resource:action.resource}:{}),code:decision.code,message:decision.message};
}

function subject(denial:PermissionDenial){
  if(denial.command!==undefined)return`the command \`${denial.command}\``;
  if(denial.resource!==undefined)return`${denial.tool} on ${denial.resource}`;
  return`this ${denial.tool} call`;
}

/** What the model reads as the tool's error: what was refused, why, and what to do instead. English, like every tool text. */
export function denialReasonForModel(denial:PermissionDenial):string{
  return`TALOS did not run ${subject(denial)}: ${denial.message} (${denial.code}). This run is non-interactive, so nobody can approve it. Do not repeat the same call; find another way, or finish and say what could not be done.`;
}

/** The stream's notice for a person or a program reading the run. */
export function denialNotice(denial:PermissionDenial):string{
  return`Permission denied: ${subject(denial)} (${denial.code}: ${denial.message}). The model was told and the run goes on.`;
}
