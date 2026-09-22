import type {AgentRosterRow} from '../agent-roster.ts';
import {agentRosterLine,shellSafeText} from '../components/terminal-shell.ts';
import {truncateDisplay} from '../text-width.ts';

export type AgentTreeOverlayModel={rows:AgentRosterRow[];selected:number};

export function createAgentTreeOverlayModel(rows:readonly AgentRosterRow[],selectedId?:string|null):AgentTreeOverlayModel{
  const copied=rows.map(row=>({...row,usage:row.usage?{...row.usage}:null,delegationEvidence:row.delegationEvidence?{...row.delegationEvidence}:null}));
  const index=selectedId?copied.findIndex(row=>row.id===selectedId):-1;
  return{rows:copied,selected:index>=0?index:0};
}

export function moveAgentTreeSelection(model:AgentTreeOverlayModel,delta:number):AgentTreeOverlayModel{
  if(model.rows.length===0)return{...model,selected:0};
  const next=Math.max(0,Math.min(model.rows.length-1,model.selected+Math.trunc(delta)));
  return next===model.selected?model:{...model,selected:next};
}

export function selectedAgentRow(model:AgentTreeOverlayModel):AgentRosterRow|null{
  return model.rows[model.selected]??null;
}

export function agentTreeOverlayLines(
  model:AgentTreeOverlayModel,
  input:{width:number;nowMs:number;currentSessionId:string|null;running:boolean},
):string[]{
  const width=Math.max(1,Math.floor(input.width));
  const fit=(value:string)=>truncateDisplay(shellSafeText(value),width);
  const lines=[fit('Agents · native delegation tree')];
  model.rows.forEach((row,index)=>{
    const display={...row,focused:index===model.selected};
    lines.push(agentRosterLine({row:display,width,nowMs:input.nowMs,marker:index===model.selected?'›':' '}));
  });
  const selected=selectedAgentRow(model);
  if(!selected)return[...lines,fit('No native agent rows. · Esc close')];
  const detail=selected.id===input.currentSessionId&&input.running
    ?'Alt+S steer active session from composer · Esc close'
    :'inspection only · steering unavailable for selected session · Esc close';
  lines.push(fit(detail));
  return lines;
}
