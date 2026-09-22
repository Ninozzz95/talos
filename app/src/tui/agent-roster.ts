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
    task:node.task,
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
