/*
 * ASYNC phase, step 3 (owner 01/10: «conteggio + /agents»). The delegated agents of this session as the kernel announces
 * them (`talos.agenti` → v2 `agent.changed`, sent to the parent and every ancestor): which are working, what each did last.
 * A delegation no longer lives inside its parent's tool call, so this — not the parent's open turn — says what works.
 * Activity is a short English line per step, newest last, consecutive repeats folded and six kept, three shown: Codex
 * `/subagents` (`tui/src/app/agent_status_feed.rs`: AGENT_STATUS_PREVIEW_ITEMS 6, PREVIEW_LINES 3, «No recent activity
 * yet.»). The kernel's Italian `label` is never shown: kind, status, tool name and the count of updated files (read out of
 * the label by protocol v2, the one place the kernel gives it) are mapped here.
 */
import {t,tn} from '../i18n/index.ts';
import type {TuiEvent} from './event-adapter.ts';
import {toolDisplay} from './tool-display.ts';

export type LiveAgentOutcome='working'|'completed'|'failed'|'stopped';
/* `reported`: the main agent was woken with this agent's result (a run that starts with `delegation` naming it, step 2). */
/* Stage 6a: `prompt` (the whole task), `endedAtMs`, `tokens`, `model` and `approvalsPending`, from the kernel's snapshot. */
export type LiveAgent={childId:string;parentId:string|null;task:string|null;startedAtMs:number|null;ended:boolean;outcome:LiveAgentOutcome;activity:readonly string[];reported:boolean;
  prompt:string|null;endedAtMs:number|null;tokens:number;model:string|null;approvalsPending:number};

export const AGENT_ACTIVITY_ITEMS=6;
export const AGENT_ACTIVITY_PREVIEW=3;
/* A long session delegates many times: the oldest ENDED agents leave first; a working one is never dropped. */
const MAX_AGENTS=64;

type AgentChanged=Extract<TuiEvent,{type:'agent.changed'}>;

/** One step of a child in English, or null when the step says nothing new (an ended tool, usage, a resolved approval). */
export function agentActivityLine({kind,status,tool,count=null}:{kind:string|null;status:string|null;tool:string|null;count?:number|null}):string|null{
  if(kind==='lifecycle')return status==='started'?t('screen.agentActivity.started'):null;
  if(kind==='tool')return status==='running'?(tool?toolDisplay(tool).label:t('screen.agentActivity.tool')):null;
  if(kind==='approval')return status==='waiting'?t('screen.agentActivity.approval'):null;
  /* stage 6b: the child asked the person (kernel operation `question`, with the host's `domandeDeiFigli`) */
  if(kind==='question')return status==='waiting'?t('screen.agentActivity.question'):null;
  if(kind==='reasoning')return status==='running'?t('screen.agentActivity.thinking'):null;
  if(kind==='response')return status==='running'?t('screen.agentActivity.answering'):null;
  if(kind==='files')return count!==null&&count>0?tn('screen.agentActivity.files',count):t('screen.agentActivity.filesSome');
  return null;
}

function endLine(outcome:LiveAgentOutcome):string{
  return outcome==='completed'?t('screen.agentActivity.finished'):outcome==='stopped'?t('screen.agentActivity.stopped'):t('screen.agentActivity.notFinished');
}
function withActivity(activity:readonly string[],line:string|null):readonly string[]{
  if(line===null||activity.at(-1)===line)return activity;
  return [...activity,line].slice(-AGENT_ACTIVITY_ITEMS);
}
function startOf(value:string|null):number|null{const ms=value===null?NaN:Date.parse(value);return Number.isFinite(ms)?ms:null;}

/** Folds one `agent.changed` (or a woken run's results) into the list; the same list back when nothing changed (no repaint). */
export function reduceLiveAgents(list:readonly LiveAgent[],event:TuiEvent):readonly LiveAgent[]{
  /* ASYNC step 4: the run the kernel starts with children's results marks them answered (`/exit` → «wait» ends on it). */
  if(event.type==='run.started'){
    const named=new Set((event.delegation??[]).map(result=>result.childId));
    if(!list.some(agent=>named.has(agent.childId)&&!agent.reported))return list;
    return list.map(agent=>named.has(agent.childId)&&!agent.reported?{...agent,reported:true}:agent);
  }
  if(event.type!=='agent.changed')return list;
  const change=event as AgentChanged;
  const index=list.findIndex(agent=>agent.childId===change.childId);
  const previous=index>=0?list[index]!:null;
  if(previous?.ended)return list;
  const base:LiveAgent=previous??{childId:change.childId,parentId:change.parentId,task:change.task,startedAtMs:startOf(change.startedAt),ended:false,outcome:'working',activity:[],reported:false,
    prompt:null,endedAtMs:null,tokens:0,model:null,approvalsPending:0};
  let next:LiveAgent={...base,task:change.task??base.task,startedAtMs:base.startedAtMs??startOf(change.startedAt),
    prompt:change.prompt??base.prompt,endedAtMs:startOf(change.endedAt)??base.endedAtMs??(change.ended?Date.now():null),tokens:change.tokens??base.tokens,
    model:change.model??base.model,approvalsPending:change.approvalsPending??base.approvalsPending};
  if(change.ended){
    const outcome:LiveAgentOutcome=change.interrupted?'stopped':change.kind==='lifecycle'&&change.status==='completed'?'completed':'failed';
    next={...next,ended:true,outcome,activity:withActivity(next.activity,endLine(outcome))};
  }else next={...next,activity:withActivity(next.activity,agentActivityLine({kind:change.kind,status:change.status,tool:change.tool,count:change.count}))};
  /* the same list back when nothing the screen shows changed (no repaint); a usage update changes the tokens now (stage 6a) */
  if(previous&&next.task===previous.task&&next.startedAtMs===previous.startedAtMs&&next.ended===previous.ended&&next.activity===previous.activity
    &&next.prompt===previous.prompt&&next.endedAtMs===previous.endedAtMs&&next.tokens===previous.tokens&&next.model===previous.model&&next.approvalsPending===previous.approvalsPending)return list;
  if(index>=0){const copy=list.slice();copy[index]=next;return copy;}
  const grown=[...list,next];
  if(grown.length<=MAX_AGENTS)return grown;
  const drop=grown.findIndex(agent=>agent.ended);
  return drop<0?grown:grown.filter((_,at)=>at!==drop);
}

export function workingAgents(list:readonly LiveAgent[]):LiveAgent[]{return list.filter(agent=>!agent.ended);}
/** The last three steps, as `/agents` shows them under the selected agent. */
export function agentPreview(agent:Pick<LiveAgent,'activity'>):string[]{return agent.activity.slice(-AGENT_ACTIVITY_PREVIEW);}
