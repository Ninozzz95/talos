import {t} from '../../i18n/index.ts';
import type {AgentRosterRow} from '../agent-roster.ts';
import {agentRosterLine,shellSafeText} from '../components/terminal-shell.ts';
import {truncateDisplay} from '../text-width.ts';
import {listOverlay,type OverlayContent} from './scroll-window.ts';
import {agentPreview,type LiveAgent} from '../live-agents.ts';

export type AgentTreeOverlayModel={rows:AgentRosterRow[];selected:number};
export type AgentTreeOverlayInput={width:number;nowMs:number;currentSessionId:string|null;running:boolean;viewingId?:string|null;live?:readonly LiveAgent[]};

/** ASYNC step 3: a delegated agent that can be stopped from the list: one the kernel says is still working. */
export function stoppableAgent(row:AgentRosterRow|null,live:readonly LiveAgent[]=[]):LiveAgent|null{
  if(!row||row.role!=='subagent'||row.interrupted||row.endedAt!==null)return null;
  const agent=live.find(item=>item.childId===row.id);
  return agent&&!agent.ended?agent:null;
}

export function createAgentTreeOverlayModel(rows:readonly AgentRosterRow[],selectedId?:string|null):AgentTreeOverlayModel{
  const copied=rows.map(row=>({...row,usage:row.usage?{...row.usage}:null,delegationEvidence:row.delegationEvidence?{...row.delegationEvidence}:null}));
  const index=selectedId?copied.findIndex(row=>row.id===selectedId):-1;
  return{rows:copied,selected:index>=0?index:0};
}

/*
 * ASYNC step 8 (seen on the built CLI, s39): the list opened on the main agent, so the working agent's steps and «x stop»
 * showed only after ↓. It opens on the first working delegated agent the list shows (Codex `/subagents` shows the
 * running ones); with none working, on the session in use as before.
 */
export function agentListSelection(rows:readonly AgentRosterRow[],live:readonly LiveAgent[],focusId:string|null):string|null{
  const shown=new Set(rows.filter(row=>row.role==='subagent').map(row=>row.id));
  return live.find(agent=>!agent.ended&&shown.has(agent.childId))?.childId??focusId;
}

export function moveAgentTreeSelection(model:AgentTreeOverlayModel,delta:number):AgentTreeOverlayModel{
  if(model.rows.length===0)return{...model,selected:0};
  const next=Math.max(0,Math.min(model.rows.length-1,model.selected+Math.trunc(delta)));
  return next===model.selected?model:{...model,selected:next};
}

export function selectedAgentRow(model:AgentTreeOverlayModel):AgentRosterRow|null{
  return model.rows[model.selected]??null;
}

export function agentTreeOverlayLines(model:AgentTreeOverlayModel,input:AgentTreeOverlayInput):string[]{
  const width=Math.max(1,Math.floor(input.width));
  const fit=(value:string)=>truncateDisplay(shellSafeText(value),width);
  const lines=[fit(t('screen.agents.title'))];
  model.rows.forEach((row,index)=>{
    const display={...row,focused:index===model.selected};
    lines.push(agentRosterLine({row:display,width,nowMs:input.nowMs,marker:index===model.selected?'›':' '}));
  });
  const selected=selectedAgentRow(model);
  if(!selected)return[...lines,fit(t('screen.agents.empty'))];
  /* ASYNC step 3: the selected delegated agent's last three steps, Codex /subagents (`agent_status_feed.rs`), indented. */
  const live=input.live??[];
  const announced=selected.role==='subagent'?live.find(item=>item.childId===selected.id)??null:null;
  if(announced){
    const indent=(value:string)=>width>8?`    ${truncateDisplay(shellSafeText(value),width-4)}`:fit(value);
    const preview=agentPreview(announced);
    if(preview.length)lines.push(...preview.map(indent));
    else if(!announced.ended)lines.push(indent(t('screen.agents.noActivity')));
  }
  /* P13: Enter watches the selected agent live; on the session in use it goes back to it (Claude Code's "Enter to view",
     not offered on the agent already watched). ASYNC step 3: x stops a working delegated agent (Claude Code's agent panel
     «x to stop», not offered on the main agent, which Esc stops). */
  const stoppable=stoppableAgent(selected,live)!==null;
  const detail=selected.id===input.viewingId
    ?t(stoppable?'screen.agents.watchingStopHint':'screen.agents.watchingHint')
    :selected.id===input.currentSessionId
      ?(input.viewingId?t('screen.agents.backHint'):input.running?t('screen.agents.steerHint'):t('screen.agents.inspectOnly'))
      :t(stoppable?'screen.agents.watchStopHint':'screen.agents.watchHint');
  lines.push(fit(detail));
  return lines;
}
// R1 Q-R1-3: the same lines as a capped, scrolling overlay (overlays/scroll-window.ts).
export function agentTreeOverlay(model:AgentTreeOverlayModel,input:AgentTreeOverlayInput):OverlayContent{
  return listOverlay(agentTreeOverlayLines(model,input),{head:1,list:model.rows.length,selected:model.selected,foot:1,tones:(line,index)=>index===0?'accent':/COLLISION/u.test(line)?'strong':'dim'});
}
