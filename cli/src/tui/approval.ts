import type {PermissionAction,PermissionMode} from '../security/types.ts';import type {PermissionEngine} from '../security/permission-engine.ts';
import type {ToolDecision} from './tool-facts.ts';
/* A5j: `deny-tool` is «No to this tool until your next message»: the engine hears a deny once, the kernel a no with the tool's scope */
/* Row 126, road A: `allow-calls` is «Allow all the same calls of this answer»: the engine hears an allow once, the kernel a yes with
   `{ambito:'risposta'}` (session-registry.mjs:17129), only on a card the kernel grouped (`sameCalls`) */
export type UserApprovalChoice='allow-once'|'allow-session'|'allow-always'|'deny-once'|'deny-always'|'deny-tool'|'allow-calls';
export type ApprovalRequestResult=
 | {pending:false;allowed:true;source:string}
 | {pending:false;allowed:false;code:string;message:string}
 | {pending:true;allowed:false;action:PermissionAction;reason:string;rule?:string};
/* R5a (Q-R5-17, gate finding 15): `beforeDeny` hears the engine's own refusal before the kernel is answered, so whoever shows
   the row can say who refused before the kernel's receipt of the "no" arrives. */
/* The notifications' contract (talos.notifica, MOTIVI_APPROVAZIONE_RISOLTA): a yes nobody gave by hand says who gave it, so it is never
   told as the person's act. Only on a yes: on a no the kernel hands this field to the model as the reason. */
export type ApprovalMotive={motivo:'regola'|'modalita'|'classificatore'};
/** The owner, 02/11: the person's own words for the research card's question. */
export type ApprovalAnswerExtra={domandaModificata:string}|{ambito:'volta'}|{ambito:'strumento'}|{ambito:'risposta'};
export function automaticApproval(source:string):ApprovalMotive{
  if(source==='auto')return{motivo:'classificatore'};
  return{motivo:source==='acceptEdits'||source==='bypassPermissions'?'modalita':'regola'};
}
/* Stage 7.21 (owner 03/10, /permissions «Recent»): `onDecided` hears each request the engine blocked and each answer the person gave. */
export function createApprovalCoordinator({engine,answer,interactive,mode,beforeDeny,onDecided}:{engine:PermissionEngine;answer:(sessionId:string,requestId:string,approved:boolean,motive?:ApprovalMotive|ApprovalAnswerExtra)=>Promise<void>;interactive:boolean;mode:PermissionMode|(()=>PermissionMode);beforeDeny?:(talosRequestId:string,decision:{code:string;message:string})=>void;onDecided?:(decision:{action:PermissionAction;choice:UserApprovalChoice|'blocked';code?:string})=>void}){const pending=new Map<string,{engineId:string;sessionId:string;action:PermissionAction}>();const decided=(decision:Parameters<NonNullable<typeof onDecided>>[0])=>{try{onDecided?.(decision);}catch{/* a listener never changes the answer */}};return{async request(sessionId:string,talosRequestId:string,action:PermissionAction,/* A5h: a child's or delegate's card */options?:{child?:boolean}):Promise<ApprovalRequestResult>{const currentMode=typeof mode==='function'?mode():mode;const d=await engine.decide(action,{interactive,mode:currentMode,sessionId,...(options?.child===true?{child:true}:{})});if(d.kind==='allow'){await answer(sessionId,talosRequestId,true,automaticApproval(d.source));return{pending:false,allowed:true,source:d.source};}if(d.kind==='deny'){try{beforeDeny?.(talosRequestId,{code:d.code,message:d.message});}catch{/* a listener never changes the answer */}decided({action,choice:'blocked',code:d.code});await answer(sessionId,talosRequestId,false);return{pending:false,allowed:false,code:d.code,message:d.message};}pending.set(talosRequestId,{engineId:d.requestId,sessionId,action:d.action});return{pending:true,allowed:false,action:d.action,reason:d.reason,...(d.rule?{rule:d.rule}:{})};},async resolve(talosRequestId:string,choice:UserApprovalChoice,extra?:ApprovalAnswerExtra){const p=pending.get(talosRequestId);if(!p)throw new Error('APPROVAL_NOT_PENDING');
  /* A5j, the judge's first post: the tool's scope with a yes is «yes for this tool» for the whole session (session-registry.mjs:17107,
     :17129), so it is never taken from a caller; it is written below, only with a no, only on an outside tool's card */
  if(extra&&'ambito' in extra&&(extra.ambito==='strumento'||extra.ambito==='risposta'))throw new Error('APPROVAL_SCOPE_NOT_ALLOWED');
  pending.delete(talosRequestId);const engineChoice=choice==='deny-tool'?'deny-once':choice==='allow-calls'?'allow-once':choice;await engine.resolve(p.engineId,engineChoice);decided({action:p.action,choice:engineChoice});/* decision 41: «Allow once» on the root card is a yes the kernel does not remember */if(!extra&&p.action.wslRoot&&choice==='allow-once')extra={ambito:'volta'};
  /* A5j: a refused scope (QUERY_INVALID) sends a plain no at once, so the no is never lost */
  if(choice==='deny-tool'&&p.action.noToThisTool===true){try{await answer(p.sessionId,talosRequestId,false,{ambito:'strumento'});return;}catch(error){if((error as {code?:unknown})?.code!=='QUERY_INVALID')throw error;}}
  /* row 126: «for all» only where the kernel grouped; a refused scope sends a plain yes for this call, never more */
  if(choice==='allow-calls'&&(p.action.sameCalls??0)>1){try{await answer(p.sessionId,talosRequestId,true,{ambito:'risposta'});return;}catch(error){if((error as {code?:unknown})?.code!=='QUERY_INVALID')throw error;}}
  if(extra&&choice.startsWith('allow-'))await answer(p.sessionId,talosRequestId,true,extra);else await answer(p.sessionId,talosRequestId,choice.startsWith('allow-'));}};}
/*
 * R3 gate E4, owner decision Q-R3-3: why a tool was allowed to run. The engine's allow `source` (permission-engine.ts:38-42)
 * names it: a session grant, an allow rule (its text), accept-edits, bypassPermissions (Full access), the auto classifier.
 * `rule` without a text is the built-in allowance for reads inside the project and documented read-only commands: no
 * approval was involved, so nothing is said. The person's answer names the rest; a denied tool did not run.
 */
export function decisionFromSource(source:string):ToolDecision|null{
  if(source==='session')return{kind:'session'};
  if(source==='acceptEdits')return{kind:'accept-edits'};
  if(source==='bypassPermissions')return{kind:'full-access'};
  if(source==='auto')return{kind:'auto'};
  if(source==='rule'||!source)return null;
  return{kind:'rule',rule:source};
}
export function decisionFromChoice(choice:UserApprovalChoice):ToolDecision|null{
  return choice==='allow-once'||choice==='allow-calls'?{kind:'once'}:choice==='allow-session'?{kind:'session'}:choice==='allow-always'?{kind:'always'}:null;
}
