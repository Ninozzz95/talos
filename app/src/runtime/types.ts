import type {PermissionMode} from '../args.ts';
import type {ReasoningEffort} from '../config/types.ts';
import type {CliAttachment} from './attachments.ts';
export type StartInput={projectRoot:string;prompt:string;model:string;permissionMode:PermissionMode;reasoningEffort?:ReasoningEffort;attachments?:readonly CliAttachment[];operationId?:string};
export type CliSteerResult={redirectId:string};
export type CliSessionOutcome='running'|'completed'|'failed'|'stopped'|'interrupted'|'unknown';
export type CliSessionUsage={promptTokens:number|null;completionTokens:number|null;cachedTokens:number|null;turns:number|null;executions:number|null};
export type CliSessionApprovalWait={pending:true;requestId:string|null;waitingMs:number|null};
export type CliSessionCollision={path:string;beforeSessionId:string|null;afterSessionId:string|null};
export type CliSessionDelegationOutcome='completed'|'failed'|'refused'|'unknown';
export type CliSessionDelegationEvidence={writes:number|null;artifacts:number|null;toolCalls:number|null;toolCallsOk:number|null;toolCallsFailed:number|null;verifiable:boolean|null};
export type CliContextMeasurement={inputTokens:number;windowTokens:number;responseReserve:number;percentOfWindow:number;method:'runtime'|'provider'|'heuristic';exact:boolean;measuredAt:string|null;revision:number|null;stale:boolean;estimatedMarginTokens:number|null};
export type CliContextBudget={windowTokens:number;responseReserve:number;safetyMarginTokens:number;inputLimitTokens:number;triggerTokens:number;estimatedMarginTokens:number|null;provenance:string};
export type CliContextStatus={
 schema:'talos.cli.context-status.v1';sessionId:string;available:boolean;reason:string|null;
 measurement:CliContextMeasurement|null;budget:CliContextBudget|null;
 autoCompaction:{enabled:boolean;triggerRatio:number;triggerPercent:number;targetRatio:number|null;provenance:string};
 cache:{promptTokens:number|null;cachedTokens:number|null;percent:number|null;provenance:string};
 cost:{usd:number|null;provenance:string};
 sources:{activeVersionId:string|null;activeSourceCount:number|null;summaryCitationCount:number|null;provenance:string};
};
export type CliSessionSummary={
 id:string;sessionId:string;name:string|null;project:string|null;path:string|null;model:string|null;
 parentId:string|null;depth:number;delegatedTask:string|null;forkedFrom:string|null;
 startedAt:string|null;updatedAt:string|null;endedAt:string|null;outcome:CliSessionOutcome;interrupted:boolean;
 usage:CliSessionUsage|null;approvalWait:CliSessionApprovalWait|null;collisions:CliSessionCollision[];
 delegationOutcome:CliSessionDelegationOutcome|null;delegationEvidence:CliSessionDelegationEvidence|null;
};
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
export interface CliRuntime{restore():Promise<{restored:number;total:number}>;start(input:StartInput):Promise<string>;setDefaultReasoningEffort(effort:ReasoningEffort|null):void;setReasoningEffort(sessionId:string,effort:ReasoningEffort):Promise<void>;resume(sessionId:string,prompt?:string,attachments?:readonly CliAttachment[]):Promise<string>;fork(sessionId:string,prompt?:string,attachments?:readonly CliAttachment[]):Promise<string>;steer(sessionId:string,prompt:string,attachments?:readonly CliAttachment[]):Promise<CliSteerResult>;compact(sessionId:string):Promise<any>;contextStatus?(sessionId:string):Promise<CliContextStatus>;listSessions():Promise<CliSessionSummary[]>;subscribe(sessionId:string,sink:(event:unknown)=>void,from?:number):()=>void;answerApproval(sessionId:string,requestId:string,approved:boolean):Promise<void>;cancel(sessionId:string):Promise<void>;shell(sessionId:string,command:string):Promise<void>;export(sessionId:string):unknown;supervisorEvidence?():readonly CliRuntimeSupervisorEvidence[];close():Promise<void>;}
export class CliRuntimeError extends Error{code:string;details:Record<string,unknown>;constructor(code:string,message=code,details:Record<string,unknown>={}){super(message);this.name='CliRuntimeError';this.code=code;this.details=details;}}
