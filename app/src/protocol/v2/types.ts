import type {TalosErrorEnvelope} from '../../errors.ts';

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
  status:'completed'|'failed'|'cancelled'|'unknown';
  content:string;
  receipt:TalosV2ToolReceipt;
  enforcement:TalosV2EnforcementEvidence|null;
  details?:Record<string,unknown>;
};

export type TalosV2Error={message:string;envelope:TalosErrorEnvelope};

export type TalosV2EventType=
  |'run.started'
  |'message.started'|'message.delta'|'message.completed'
  |'reasoning.started'|'reasoning.delta'|'reasoning.completed'
  |'tool.started'|'tool.args'|'tool.output'|'tool.completed'
  |'file.changed'
  |'approval.required'|'approval.resolved'
  |'usage.updated'|'warning'
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
};
