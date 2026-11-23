import type {PermissionDenial} from '../../headless/denials.ts';
import type {BackgroundStop} from '../../runtime/types.ts';
import type {TalosErrorEnvelope} from '../../errors.ts';
import type {RequestTooLarge} from '../../runtime/request-too-large.ts';
import type {ContextFull} from '../../runtime/context-full.ts';

export type TalosProtocolVersion='v1'|'v2';
export type TalosV2Durability='durable'|'transient';
export type TalosV2Cursor={sessionId:string;sequence:number};

export type TalosV2ToolReceipt={
  status:string|null;
  allowed:boolean|null;
  via:string|null;
  reason:string|null;
  risk:string|null;
  details?:Record<string,unknown>;
};

export type TalosV2EnforcementEvidence={
  exitCode:number|null;
  requested:string|null;
  applied:string|null;
  sandbox:string|null;
  backend:string|null;
  appContainer:boolean|null;
  filesystem:string|null;
  network:string|null;
  processTree:string|null;
  sandboxSpecVersion:string|null;
  processTreeEvidence?:unknown;
  details?:Record<string,unknown>;
};

export type TalosV2ToolResult={
  toolCallId:string;
  status:'completed'|'failed'|'cancelled'|'unknown'|'interrupted';
  content:string;
  receipt:TalosV2ToolReceipt;
  enforcement:TalosV2EnforcementEvidence|null;
  details?:Record<string,unknown>;
  /** Owner 13/10/2026 (additive): this call did not run because it was an identical copy of the one before it, which the kernel
   *  discarded (kernel `causa: 'copia'`). Only ever `true`, and only on a `cancelled` result. */
  duplicate?:true;
  /** R5a lane R (additive, Q-R5-10): the command's full output was kept in a private file; the model's copy was cut. */
  outputSaved?:{path:string|null;keptChars:number;totalChars:number};
  /** R5a lane R (additive, Q-R5-11): the result the model read was cut at the kernel's tool-result limit. */
  readCut?:{shownLines:number;totalLines:number|null;limitChars:number;shownChars:number;totalChars:number};
};

/** Q-R2-4 / gate E11: the envelope also carries the three parts of the error as fields — what happened, what to do,
 * where to look — from lane E's `describeError`; `code` and the rest of the canonical envelope are unchanged. */
export type TalosV2ErrorEnvelope=TalosErrorEnvelope&{what:string;todo:string|null;where:string|null};
/** `message` is the English headline (what); `raw` is the original, redacted message when it differs (owner 2026-09-24). */
export type TalosV2Error={message:string;raw?:string;envelope:TalosV2ErrorEnvelope;
  /** R5a lane R (additive, Q-R5-6): the provider's HTTP status and requested wait, when the run observed them. */
  status?:number;retryAfterMs?:number;
  /** 0.6.6 (additive): a ChatGPT plan's usage limit ended the run; when the plan's window comes back (epoch ms), if the service said. */
  resetsAt?:number;
  /** 0.6.13 (additive, `code: REQUEST_TOO_LARGE`): the newest request alone does not fit the model and the run stopped before any
   *  paid call. In tokens: the request, the frame around it (system and tools), the model's window; `source` says who counted
   *  (`estimate`: TALOS, `provider`: the provider's own count). `--attach-if-too-large` sends it as an attachment instead. */
  requestTooLarge?:RequestTooLarge;
  /** 0.6.13 Z piece C (additive): the conversation does not fit the model. `step` is the shortening step reached, `target` the size
   *  in tokens TALOS shrank toward, `numbers` the provider's own count when its refusal said it, `exhausted` when the retries ran out. */
  contextFull?:ContextFull;
  /** 0.6.13 (additive): the kernel's class of a provider failure, in English (`context`, `credit`, `rate-limited`…). */
  providerClass?:string};

export type TalosV2EventType=
  |'run.started'
  |'message.started'|'message.delta'|'message.completed'
  |'reasoning.started'|'reasoning.delta'|'reasoning.completed'|'reasoning.pulse'
  |'tool.started'|'tool.args'|'tool.output'|'tool.completed'
  |'file.changed'
  |'approval.required'|'approval.resolved'
  /* Stage 3 (owner 01-02/10, additive): the model asks the person (kernel UserQuestionRequested) and how the question closed
     (UserQuestionResolved: answered, skipped, cancelled, expired, unanswerable) — every question has its close. */
  |'question.required'|'question.resolved'
  /* Stage 3 (owner 02/10, additive): the model proposes a plan (kernel CUSTOM talos.plan, status proposed) and how it closed
     (approved with a decision, changes requested, cancelled) — every plan has its close. */
  |'plan.required'|'plan.resolved'
  /* Stage 3, pezzo 13c (additive): the kernel changed the session's mode by itself (model-requested plan mode, an approved plan). */
  |'session.mode.changed'
  /* Owner 27/10/2026 (additive): the session's whole settings changed (from this computer or a paired device), with a version
     that only grows — kernel CUSTOM talos.impostazioni-sessione with `istantanea` */
  |'session.settings.changed'
  /* Stage 3 (owner 02/10, additive): a parent↔child question and its close (kernel CUSTOM talos.agent-dialogue v1). */
  |'agent.dialogue'
  /* F-Q1 (owner 03/10, additive): the kernel's queue for a running session changed (CUSTOM talos.coda), and one queued item
     entered the conversation (QueuedMessageDelivered). A person's text is shown; a sub-agent's result only as its parsed fields. */
  |'queue.changed'|'queue.delivered'
  /* Stage 3 (owner 02/10, additive): an MCP server asks the person (form or url) and how it closed (kernel McpElicitation*). */
  |'elicitation.required'|'elicitation.resolved'
  |'usage.updated'|'warning'
  /* R5a lane R (additive, Q-R5-4/Q-R5-6): a provider retry wait; a compaction by either engine. */
  |'provider.attempt'|'context.compacted'
  /* R5b (R5a open 2, additive): a Context Engine summary was requested (billed); acceptance is `context.compacted`. */
  |'context.summary.requested'
  /* Desktop CE fix 5f78b1316 (aligned 2026-09-25, additive): automatic compaction paused after a refused summary. */
  |'context.compaction.paused'
  /* 0.6.13 (kernel a2739656d, additive, transient): a compaction named in this turn was annulled because the turn failed; `{at, reason}` */
  |'context.compaction.undone'
  /* 0.6.13 (contract with the Desktop 22/10/2026, additive, durable): the person's request that did not fit the model was kept
     as NOT SENT (kernel CUSTOM `talos.richiesta-non-inviata {at, indice}`); `{index, at?}`, `index` its position in the kernel's
     raw history. The run's own end is `run.failed` with `REQUEST_TOO_LARGE`. A replay draws that request as not sent. */
  |'request.not_sent'
  /* ASYNC (owner 01/10, additive): a delegated agent was created, changed what it does, or ended (kernel `talos.agenti`). */
  |'agent.changed'
  |'session.snapshot'
  |'run.completed'|'run.failed'|'run.cancelled';

export type TalosV2Event={
  schema:'talos.cli.event.v2';
  version:2;
  sessionId:string;
  eventId:string;
  cursor:TalosV2Cursor|null;
  ts:string;
  durability:TalosV2Durability;
  type:TalosV2EventType;
  data:Record<string,unknown>;
};

export type TalosV2RunResult={
  schema:'talos.cli.result.v2';
  version:2;
  ok:boolean;
  sessionId:string|null;
  cursor:TalosV2Cursor|null;
  outcome:'completed'|'failed'|'cancelled';
  result?:{text:string;changedFiles:string[];usage:unknown};
  error?:TalosV2Error;
  warnings:string[];
  toolResults:TalosV2ToolResult[];
  /** C-005 (additive): every tool call denied in this run and answered to the model; present only when there was one. */
  permissionDenials?:PermissionDenial[];
  /** F-ENG-2 (additive): the background commands the end of this run stopped; present only when there was one. */
  backgroundStopped?:BackgroundStop[];
};
