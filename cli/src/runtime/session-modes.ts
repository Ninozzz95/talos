import type {PermissionMode} from '../security/types.ts';

/*
 * The CLI's own permission mode of each session (owner 09/10/2026, «Segue il modo + si chiede»). The kernel is told only its
 * level (session-facade.ts registryPermission), where every mode but plan is "On request" (F-P-001); what a command may
 * reach on the network follows the CLI's mode: Full access opens it, the other modes keep it closed unless the person allows
 * it for one command. Set when a session starts and whenever its mode changes; read for each command of a run.
 */
const modes=new Map<string,PermissionMode>();
export function rememberSessionMode(sessionId:string,mode:PermissionMode){if(typeof sessionId==='string'&&sessionId)modes.set(sessionId,mode);}
export function sessionModeOf(sessionId:string|null|undefined):PermissionMode|null{return typeof sessionId==='string'?modes.get(sessionId)??null:null;}
/** Whether a session's commands reach the network without asking: only in Full access. */
export function networkOpenFor(sessionId:string|null|undefined):boolean{return sessionModeOf(sessionId)==='bypassPermissions';}
