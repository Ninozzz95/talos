import type {BusyKind} from './components/status-indicator.ts';
import {t} from '../i18n/index.ts';
import {clockTime} from '../i18n/clock-time.ts';
import {toolDisplay} from './tool-display.ts';
import {workingAgents,type LiveAgent} from './live-agents.ts';

/*
 * R3 lane SP — gate E7, owner decision Q-R3-7: ONE status derivation for the status row and the main roster row.
 * Words: starting (sent, not yet started) · thinking (reasoning, or before the first token) · writing (answer text
 * streaming) · running <tool> (a tool executing or streaming its output) · waiting for you (the approval dialog is open);
 * after the turn: done / interrupted / failed, with the turn's time frozen.
 * Before R3 only idle / tool / thinking existed, so streaming text, an open approval and a command streaming its output
 * all said "thinking" (review D-08; gate §0.1).
 * `starting` is a display word for the gap between the send and `run.started`; it never gates the dispatch (the
 * 2026-09-22 direct-dispatch requirement forbade a blocking pre-start phase, and `preparing` stays ignored).
 */
export type TurnOutcome='done'|'interrupted'|'failed';
/* `background`: delegated agents working while the main agent works itself (ASYNC step 3). */
export type LiveActivity={kind:BusyKind;startedAt:number|null;tool?:string;agents?:number;background?:number;frozenMs?:number|null};
/* R5a S4 (Q-R5-6): the attempt being waited on (state.ts TuiRetry). */
export type RetryView={attempt:number;maxAttempts:number;status:number|null;retryAfterMs:number|null;waitMs:number|null;at:number;planLimit?:true;resumesAt?:number|null};
export type LiveActivityInput={
  running:boolean;reasoning:unknown;tools:readonly {status:string;name?:string}[];
  streamingAssistant?:{text:string}|null;waitingForPerson?:boolean;sentAt?:number|null;
  lastTurn?:{outcome:TurnOutcome;durationMs:number|null}|null;
  retry?:RetryView|null;
  /* ASYNC step 3: this session's delegated agents (state.ts `agents`). */
  agents?:readonly LiveAgent[];
};
/*
 * P14 (owner, 2026-09-25, "lo spinner thinking rimane in conteggio quando gli agenti vengono dispacciati"): a tool row is
 * born `queued` (state.ts `tool.started`) and becomes `running` only after an approval, `streaming` only when it prints.
 * A tool that runs silently without asking — the delegation, which waits for its sub-agents, a long read, a web fetch —
 * stayed `queued`, was not counted as active, and the line said "thinking" with its clock running. `queued` is active
 * now; and while delegations are running the line says how many agents are working.
 */
const ACTIVE_TOOL=new Set(['queued','running','streaming']);
const DELEGATION_TOOLS=new Set(['delega_sottotask']);

/*
 * ASYNC step 3 (owner 01/10): a delegated agent outlives its parent's turn. With the main agent idle the line says how many
 * work, counted from the first one's start; while the main agent works its own word stays and the children are added
 * («thinking · 2 agents in background»), as Claude Code's footer keeps «N local agents» beside the spinner.
 */
export function deriveLiveActivity(state:LiveActivityInput,busySince:number):LiveActivity{
  const own=deriveOwnActivity(state,busySince);
  const working=workingAgents(state.agents??[]);
  if(!working.length||own.kind==='agents'||own.kind==='starting')return own;
  if(!state.running){
    const starts=working.map(agent=>agent.startedAtMs).filter((ms):ms is number=>ms!==null);
    return{kind:'agents',startedAt:starts.length?Math.min(...starts):busySince,agents:working.length};
  }
  return{...own,background:working.length};
}
function deriveOwnActivity(state:LiveActivityInput,busySince:number):LiveActivity{
  if(!state.running){
    if(typeof state.sentAt==='number')return{kind:'starting',startedAt:state.sentAt};
    if(state.lastTurn)return{kind:state.lastTurn.outcome,startedAt:null,frozenMs:state.lastTurn.durationMs};
    return{kind:'idle',startedAt:null};
  }
  if(state.waitingForPerson===true)return{kind:'waiting',startedAt:busySince};
  /* R5a S4 (E5): a retry is its own state, never "thinking": attempt 2 and later of a request the provider refused. */
  if(isRetry(state.retry))return{kind:'retrying',startedAt:state.retry!.at};
  const delegations=state.tools.filter(row=>ACTIVE_TOOL.has(row.status)&&row.name!==undefined&&DELEGATION_TOOLS.has(row.name)).length;
  if(delegations>0)return{kind:'agents',startedAt:busySince,agents:delegations};
  const tool=activeToolRow(state.tools);
  if(tool)return tool.name?{kind:'tool',startedAt:busySince,tool:toolDisplay(tool.name).label}:{kind:'tool',startedAt:busySince};
  if(state.streamingAssistant&&state.streamingAssistant.text.length>0)return{kind:'writing',startedAt:busySince};
  return{kind:'thinking',startedAt:busySince};
}
/*
 * R5a S4 (owner decision Q-R5-6; gate E5): the retry line, `Retrying · attempt 2 of 4 · HTTP 429 · in 7s` (Pi
 * `status-indicator.ts:51-81`, 2026-09-07; OpenCode PR #47145, 2026-09-04). The countdown is shown only while the wait is
 * known and not over; with no known wait the provider's own `Retry-After` is stated as asked, never counted down; with
 * neither, no time at all. Esc interrupts it like any turn (the kernel's wait is abortable).
 */
/** The tool call the turn is in: the latest one still queued, running or streaming its output. */
export function activeToolRow<Row extends {status:string}>(tools:readonly Row[]):Row|undefined{
  for(let index=tools.length-1;index>=0;index--)if(ACTIVE_TOOL.has(tools[index]!.status))return tools[index];
  return undefined;
}
export function isRetry(retry:RetryView|null|undefined):boolean{return Boolean(retry&&retry.attempt>=2);}
export function retryCountdownEnd(retry:RetryView|null|undefined):number|null{return isRetry(retry)&&retry!.waitMs!==null?retry!.at+retry!.waitMs:null;}
export function retryLine(retry:RetryView,nowMs:number):string{
  /* 0.6.6 (owner 14/10: the plan's limit was a grey line that read like any error): the wait on a ChatGPT plan's usage limit says
     what it is and the clock time TALOS tries again (Codex «Try again at 3:05 PM»; desktop «Continuing automatically at HH:MM
     (attempt n of m)»), never a countdown of thousands of seconds; and that /model goes on now with another model. */
  if(retry.planLimit===true){
    const end=retry.resumesAt??(retry.waitMs!==null?retry.at+retry.waitMs:null);
    return[t('screen.retry.planLimit'),end!==null?t('screen.retry.planResumesAt',{time:clockTime(end,nowMs)}):t('screen.retry.planResumesLater'),t('screen.retry.attempt',{attempt:retry.attempt,max:retry.maxAttempts}),t('screen.retry.planSwitch')].join(' · ');
  }
  const parts=[t('screen.retry.title'),t('screen.retry.attempt',{attempt:retry.attempt,max:retry.maxAttempts}),retry.status===null?t('screen.retry.noResponse'):t('screen.retry.http',{status:retry.status})];
  const left=retry.waitMs===null?null:retry.at+retry.waitMs-nowMs;
  if(left!==null&&left>0)parts.push(t('screen.retry.in',{seconds:Math.ceil(left/1000)}));
  else if(retry.waitMs===null&&retry.retryAfterMs!==null)parts.push(t('screen.retry.asked',{seconds:Math.ceil(retry.retryAfterMs/1000)}));
  return parts.join(' · ');
}
/** Kinds that change while you look at them: the only ones that start the motion clock (idle writes nothing, R1 E5).
 *  `retrying` is not one of them: its countdown ticks once a second, and only while the wait lasts (app.ts). */
export function isAnimatedActivity(kind:BusyKind):boolean{
  return kind==='starting'||kind==='thinking'||kind==='writing'||kind==='tool'||kind==='agents'||kind==='waiting'||kind==='compacting'||kind==='connecting'||kind==='updating';
}
