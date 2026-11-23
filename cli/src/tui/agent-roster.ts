import type {CliAgentTree,CliAgentTreeNode} from '../runtime/agent-tree.ts';
import type {
  CliSessionDelegationEvidence,
  CliSessionDelegationOutcome,
  CliSessionOutcome,
  CliSessionUsage,
} from '../runtime/types.ts';

export type AgentRosterRow={
  id:string;
  parentId:string|null;
  level:number;
  nativeDepth:number;
  role:'main'|'subagent';
  focused:boolean;
  name:string|null;
  task:string|null;
  model:string|null;
  outcome:CliSessionOutcome;
  interrupted:boolean;
  startedAt:string|null;
  updatedAt:string|null;
  endedAt:string|null;
  usage:CliSessionUsage|null;
  collisionCount:number;
  hasCollision:boolean;
  delegationOutcome:CliSessionDelegationOutcome|null;
  delegationEvidence:CliSessionDelegationEvidence|null;
};

function rowOf(node:CliAgentTreeNode,level:number,focusId:string):AgentRosterRow{
  const collisionCount=node.collisions.length;
  return{
    id:node.id,
    parentId:node.parentId,
    level,
    nativeDepth:node.nativeDepth,
    role:node.nativeDepth===0&&node.parentId===null?'main':'subagent',
    focused:node.id===focusId,
    name:node.name,
    /* 0.6.8 (owner 16/10/2026 L3-17, «un nome solo ovunque»): a sub-agent is called by its name, «-N» among sisters with the same
       task; the main conversation keeps its task line */
    task:node.parentId!==null&&node.name?node.name:node.task,
    model:node.model,
    outcome:node.outcome,
    interrupted:node.interrupted,
    startedAt:node.startedAt,
    updatedAt:node.updatedAt,
    endedAt:node.endedAt,
    usage:node.usage?{...node.usage}:null,
    collisionCount,
    hasCollision:collisionCount>0,
    delegationOutcome:node.delegationOutcome,
    delegationEvidence:node.delegationEvidence?{...node.delegationEvidence}:null,
  };
}

/*
 * ASYNC step 3: what `/agents stop|show <target>` names. A number is the agent's place among the delegated agents in the
 * list (1 = the first), an id is matched by its start (at least four characters: the start line shows eight), `all` is
 * every delegated agent. The main agent is never a target: Esc stops it.
 */
export type AgentTargets={rows:AgentRosterRow[]}|{error:'missing'|'unknown'|'ambiguous'};
export function resolveAgentTargets(rows:readonly AgentRosterRow[],target:string|undefined):AgentTargets{
  const value=String(target??'').trim();
  if(!value)return{error:'missing'};
  const agents=rows.filter(row=>row.role==='subagent');
  if(value.toLowerCase()==='all')return{rows:agents};
  if(/^\d+$/u.test(value)){const row=agents[Number(value)-1];return row?{rows:[row]}:{error:'unknown'};}
  if(value.length<4)return{error:'unknown'};
  const found=agents.filter(row=>row.id.toLowerCase().startsWith(value.toLowerCase()));
  return found.length===1?{rows:found}:found.length>1?{error:'ambiguous'}:{error:'unknown'};
}

export function agentRosterRows(tree:CliAgentTree|null):AgentRosterRow[]{
  if(!tree)return[];
  const rows:AgentRosterRow[]=[];
  const visit=(node:CliAgentTreeNode,level:number)=>{
    rows.push(rowOf(node,level,tree.focusId));
    for(const child of node.children)visit(child,level+1);
  };
  visit(tree.root,0);
  return rows;
}
