import type {PermissionMode} from '../args.ts';
import type {ReasoningEffort} from '../config/types.ts';
import type {CliAttachment} from './attachments.ts';
/** `attachIfTooLarge` (0.6.13): a request too large for the model is sent as an attachment (kernel run option `allegaSeTroppoGrande`). */
export type StartInput={projectRoot:string;prompt:string;model:string;permissionMode:PermissionMode;reasoningEffort?:ReasoningEffort;attachments?:readonly CliAttachment[];operationId?:string;attachIfTooLarge?:boolean};
export type CliSteerResult={redirectId:string};
/* F-Q1 (owner 03/10, «Come Claude Code, completo»): the kernel's own queue for a running session (CUSTOM talos.coda). A person's
   message has no origin; a sub-agent's result (`delegation`) and a parent↔child dialogue message wait in the same queue, and so
   do a background command's exit (`background`, the kernel's `sfondo`) and a workflow run's result (`workflow`). */
export type CliKernelQueueOrigin='person'|'delegation'|'dialogue'|'background'|'workflow';
/** C12d: one command of the process ledger, in the CLI's words. */
export type CliProcessRow={sessionId:string;sessionTitle:string|null;toolCallId:string;command:string|null;description:string|null;origin:string|null;startedAt:string|null;durationMs:number|null;runningForMs:number|null;
  outcome:string;exitCode:number|null;background:boolean;outputFile:string|null};
export type CliKernelQueueItem={id:string;text:string;images:number;origin:CliKernelQueueOrigin;childId?:string};
export type CliKernelQueue={items:CliKernelQueueItem[];paused:boolean};
/* the kernel's `provaModello`: whether the model answered one token, how soon, and the refusal's code and reason (its words) */
export type CliModelCheck={answers:boolean;firstTokenMs:number|null;ms:number|null;code?:string;reason?:string};
export type CliSessionOutcome='running'|'completed'|'failed'|'stopped'|'interrupted'|'unknown';
export type CliSessionUsage={promptTokens:number|null;completionTokens:number|null;cachedTokens:number|null;turns:number|null;executions:number|null};
export type CliSessionApprovalWait={pending:true;requestId:string|null;waitingMs:number|null};
export type CliSessionCollision={path:string;beforeSessionId:string|null;afterSessionId:string|null};
export type CliSessionDelegationOutcome='completed'|'failed'|'refused'|'unknown';
export type CliSessionDelegationEvidence={writes:number|null;artifacts:number|null;toolCalls:number|null;toolCallsOk:number|null;toolCallsFailed:number|null;verifiable:boolean|null};
export type CliContextMeasurement={inputTokens:number;windowTokens:number;responseReserve:number;percentOfWindow:number;method:'runtime'|'provider'|'heuristic';exact:boolean;measuredAt:string|null;revision:number|null;stale:boolean;estimatedMarginTokens:number|null};
export type CliContextBudget={windowTokens:number;responseReserve:number;safetyMarginTokens:number;inputLimitTokens:number;triggerTokens:number;estimatedMarginTokens:number|null;provenance:string};
export type CliCompactionRecovery={code:string;attempts:number;failedAt:string;retryAfter:string;actions:['wait','/compact'];manualCost:{usd:null;provenance:'unknown'}};
export type CliContextStatus={
 schema:'talos.cli.context-status.v1';sessionId:string;available:boolean;reason:string|null;
 measurement:CliContextMeasurement|null;budget:CliContextBudget|null;
 autoCompaction:{enabled:boolean;triggerRatio:number;triggerPercent:number;targetRatio:number|null;provenance:string};
 cache:{promptTokens:number|null;cachedTokens:number|null;percent:number|null;provenance:string};
 cost:{usd:number|null;provenance:string};
 sources:{activeVersionId:string|null;activeSourceCount:number|null;summaryCitationCount:number|null;provenance:string};
 compactionRecovery?:CliCompactionRecovery;
 /** Owner 13/10/2026: what the LAST request was sent without, by the engine's rules and with no model call (r4 C1, level 1): old
  *  tool outputs cleared, long recent ones shortened. Absent when nothing was, or when this kernel does not say. */
 lightened?:{cleared:number;shortened:number};
 /** Stage 7.11 (desktop `contestoPerParti`, asked 03/10): the window's parts in tokens, when the kernel gives them; `exact:false` when they are its estimate. */
 parts?:{system:number;tools:number;mcp:number;memory:number;messages:number;exact:boolean};
 /** 14/10/2026 (owner: /context with the last request's breakdown): when the parts come from the last request sent to the model
  *  (the kernel's `leggiUltimaRichiesta`, in memory only): when it was sent, how many messages and tools it carried. */
 lastRequest?:{at:string|null;messages:number;tools:number};
 /** F-001: where the response reserve comes from (the person's setting, the model's maximum, that maximum capped, or the
  *  default). Additive; absent when the composition could not name it. */
 reserve?:CliResponseReserve;
};
export type CliResponseReserve={kind:'setting'|'model'|'capped'|'default';reserveTokens:number;modelMaxOutputTokens:number|null};
export type CliSessionSummary={
 id:string;sessionId:string;name:string|null;project:string|null;path:string|null;model:string|null;
 parentId:string|null;depth:number;delegatedTask:string|null;forkedFrom:string|null;
 startedAt:string|null;updatedAt:string|null;endedAt:string|null;outcome:CliSessionOutcome;interrupted:boolean;
 usage:CliSessionUsage|null;approvalWait:CliSessionApprovalWait|null;collisions:CliSessionCollision[];
 delegationOutcome:CliSessionDelegationOutcome|null;delegationEvidence:CliSessionDelegationEvidence|null;
 /** F-Q3 (03/10): the session's own reasoning effort as the kernel keeps it; null = the model default */
 reasoningEffort:ReasoningEffort|null;
 /** C6: the fields of the PC's state: someone waits for the person, the conversation is still open, how many of its descendants work */
 waiting:boolean;open:boolean;agentsWorking:number;
};
/** Long-chat tappa B1: which sessions a restore must bring back. Their families (parent, children, grandchildren) come together. */
export type RuntimeRestoreSelection={sessionIds:readonly string[]};
export type RuntimeListOptions={scope?:'all'|'loaded'};
export type CliRuntimeSupervisorEvidence={
 operation:'restore'|'start'|'replay';
 attempt:number;
 outcome:'retrying'|'succeeded'|'failed'|'recovered';
 code:string|null;
 retryable:boolean;
 fallback:'runtime-restart'|null;
 sessionId:string|null;
 operationId:string|null;
 details:Record<string,unknown>;
 ts:string;
};
export type RuntimeModelCheckpoints={projectRoot:string;rootDir:string;canDefer?():Promise<boolean>;settle(sessionId:string):Promise<void>};
/** Stage 3 (owner 01-02/10): what the person did with the model's questions, as the kernel contract takes it. */
export type QuestionResponse=
 | {status:'answered';answers:Record<string,string|string[]>;skipped?:string[];notes?:Record<string,string>}
 | {status:'skipped'|'cancelled'|'expired'};
/* Stage 3 (owner 02/10): the person's choice on a proposed plan, bound to the hash of the plan on screen (plan-contract.mjs). */
/* Stage 3: the person's answer to an MCP server (mcp-elicitation-contract.mjs): accept with the form's content, decline, cancel. */
export type ElicitationResponse={action:'accept';content?:Record<string,unknown>}|{action:'decline'|'cancel'};
export type PlanDecisionKind='ask-before-edits'|'accept-edits'|'clean-conversation'|'keep-planning';
export type PlanDecision={requestId:string;hash:string;decision:PlanDecisionKind;feedback?:string};
export interface CliRuntime{modelCheckpoints?:RuntimeModelCheckpoints|undefined;
  /** R2-F1 (cure 208 bis): this folder's trust as last read before a person's send — true, false (not trusted: the «No», or trust
   *  taken away), null (not asked). Synchronous, no disk (runtime/folder-trust.ts). */
  folderTrust?():boolean|null;
  /* owner 02/10 («ripresa visibile»): the turns a dead TALOS left interrupted, told once (supervisor.ts) */
  interruptedByPreviousProcess?():Promise<CliSessionSummary[]>;/** Long-chat tappa B1 (07/10): no selection = the whole archive; `{sessionIds}` = those sessions' families only (`[]` = nothing, the start-up work still done). */restore(selection?:RuntimeRestoreSelection):Promise<{restored:number;total:number;partial?:boolean}>;start(input:StartInput):Promise<string>;setDefaultReasoningEffort(effort:ReasoningEffort|null):void;setReasoningEffort(sessionId:string,effort:ReasoningEffort):Promise<void>;/** `operatingModeDeferred`: the kernel took the permission now and refused its operating mode while a turn runs; send the mode again when the turn ends. */
  /** C8: the tools the last request to the model carried; null before the first */
  requestTools?(sessionId:string):Promise<readonly unknown[]|null>;
  /** C12d: the commands the conversations of this window ran, from the kernel's process ledger (`elencaProcessi`), newest first. */
  processes?():Promise<readonly CliProcessRow[]>;
  /** C12d: stop one; the kernel's answer: `stopped`, or `not-running` when it had already finished. */
  stopProcess?(sessionId:string,toolCallId:string):Promise<'stopped'|'not-running'|'unknown'>;
  /** The Context Manager's «Request sent»: the last request as the kernel keeps it in memory (images left out, tools counted); null before the first. */
  requestSent?(sessionId:string):Promise<{at:string|null;model:string|null;messages:readonly unknown[];tools:number}|null>;
  /** C7b: memory and disk of this computer, read with no process and no engine */
  machineCapacity?():Promise<unknown>;
  /** C7a: the favourites and recents of the model picker; with an action, it is applied first */
  modelPreferences?(action?:{azione:'preferito';modello:string;attivo:boolean}|{azione:'usato';modello:string}):Promise<{preferiti:string[];recenti:string[]}|null>;
  /** C4: the context service's routes, as the PC calls them; null when this conversation has no engine */
  contextManager?(sessionId:string,request:{method:string;path?:string;body?:unknown}):Promise<unknown>;
  setPermissionMode(sessionId:string,mode:PermissionMode):Promise<{operatingModeDeferred?:boolean}|void>;/** RICERCA 5×5×5×5 cambio-modello (dossier §5.3): the /model choice on a live session persists on the kernel's sanctioned channel; absent = this runtime cannot persist it. */setSessionModel?(sessionId:string,model:string):Promise<void>;resume(sessionId:string,prompt?:string,attachments?:readonly CliAttachment[],options?:{model?:string;attachIfTooLarge?:boolean}):Promise<string>;fork(sessionId:string,prompt?:string,attachments?:readonly CliAttachment[],options?:{model?:string}):Promise<string>;steer(sessionId:string,prompt:string,attachments?:readonly CliAttachment[]):Promise<CliSteerResult>;/** F-Q1: a message for the running turn goes into the kernel queue (`accodaMessaggio`); it enters after the current step. */queueMessage?(sessionId:string,prompt:string,attachments?:readonly CliAttachment[],options?:{attachIfTooLarge?:boolean}):Promise<CliKernelQueue>;/** F-Q1: one queued message taken back (`svuotaCoda` by id); false when it was already delivered. */unqueueMessage?(sessionId:string,id:string):Promise<boolean>;compact(sessionId:string):Promise<any>;contextStatus?(sessionId:string):Promise<CliContextStatus>;/** `scope:'loaded'` answers with what is already in memory and never restores (the session just attached, its agents); the default restores the whole archive first. */listSessions(options?:RuntimeListOptions):Promise<CliSessionSummary[]>;/** Stage 7.5: the kernel's `elimina` (refuses a session still running). */deleteSession?(sessionId:string):Promise<void>;/** Stages 7.6/7.8: what this kernel can do (`capacita`); a fork just before an earlier turn (`forka` primaDelGiro). */capabilities?():{forkBeforeRun:boolean;modelCheck:boolean};/** Stage 7.10d (desktop, requested 03/10): one token from the chosen model (`provaModello`), for /setup's Check. */checkModel?(model:string):Promise<CliModelCheck>;forkBeforeRun?(sessionId:string,runId:string):Promise<{sessionId:string;message:string;attachments?:unknown[]}>;subscribe(sessionId:string,sink:(event:unknown)=>void,from?:number,options?:RuntimeSubscribeOptions):()=>void;answerApproval(sessionId:string,requestId:string,approved:boolean,reason?:string|{motivo:string}|{domandaModificata:string}|{ambito:'volta'}|{ambito:'strumento'}|{ambito:'risposta'}):Promise<void>;/** Stage 3: the person's answer to the model's questions (kernel `rispondiDomanda`, user-question-contract.mjs). */answerQuestion(sessionId:string,requestId:string,response:QuestionResponse):Promise<void>;answerPlan(sessionId:string,choice:PlanDecision):Promise<void>;answerElicitation(sessionId:string,requestId:string,response:ElicitationResponse):Promise<void>;/** `by:'system'` (05/11/2026): a stop the CLI decides on its own (timeout, engine error, end of a one-shot run), sent to the kernel as `daChi:'sistema'`; absent = the person's Stop. */cancel(sessionId:string,options?:{by?:'person'|'system'}):Promise<void>;/** F-ENG-2 (rc.1 stress smoke, 08/10/2026): stops the commands these sessions left in the background and waits a bounded time for their exit; absent = this runtime cannot. *//** FE-048: how many commands of this session run in the background */backgroundCommandCount?(sessionId:string):number|Promise<number>;stopBackgroundCommands?(sessionIds:readonly string[],options?:{waitMs?:number;pollMs?:number}):Promise<BackgroundStop[]>;shell(sessionId:string,command:string):Promise<void>;export(sessionId:string):unknown;supervisorEvidence?():readonly CliRuntimeSupervisorEvidence[];close():Promise<void>;}
/** F-ENG-2: one background command stopped at the end of a headless run; `exited` only when its exit was seen. */
export type BackgroundStop={sessionId:string;toolCallId:string;command:string|null;outputFile:string|null;exited:boolean};
/** How long the end of a headless run waits to see the stopped commands exit (a tree kill takes a few hundred ms on Windows). */
export const BACKGROUND_STOP_WAIT_MS=3_000;
export class CliRuntimeError extends Error{code:string;details:Record<string,unknown>;constructor(code:string,message=code,details:Record<string,unknown>={}){super(message);this.name='CliRuntimeError';this.code=code;this.details=details;}}

/* C2 (long chats, 08/10/2026): `resultsForScreen` is the TUI's alone. A history replay made for the screen may deliver a giant tool result as its head and its tail (replay-coalescer.ts); headless, export and the agent view never ask for it and get the whole event. */
export type RuntimeSubscribeOptions={resultsForScreen?:boolean};
