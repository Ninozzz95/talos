import type {
  CliSessionCollision,
  CliSessionDelegationEvidence,
  CliSessionDelegationOutcome,
  CliSessionOutcome,
  CliSessionSummary,
  CliSessionUsage,
} from './types.ts';

export type CliAgentTreeNode={
  id:string;
  parentId:string|null;
  nativeDepth:number;
  name:string|null;
  task:string|null;
  model:string|null;
  outcome:CliSessionOutcome;
  interrupted:boolean;
  startedAt:string|null;
  updatedAt:string|null;
  endedAt:string|null;
  usage:CliSessionUsage|null;
  collisions:CliSessionCollision[];
  delegationOutcome:CliSessionDelegationOutcome|null;
  delegationEvidence:CliSessionDelegationEvidence|null;
  children:CliAgentTreeNode[];
};

export type CliAgentTree={focusId:string;root:CliAgentTreeNode};

export class CliAgentTreeError extends Error{
  code:'AGENT_TREE_INVALID'='AGENT_TREE_INVALID';
  constructor(message='Agent tree input is invalid.'){super(message);this.name='CliAgentTreeError';}
}

function copyUsage(value:CliSessionUsage|null):CliSessionUsage|null{return value?{...value}:null;}
function copyCollisions(value:readonly CliSessionCollision[]):CliSessionCollision[]{return value.map(row=>({...row}));}
function copyEvidence(value:CliSessionDelegationEvidence|null):CliSessionDelegationEvidence|null{return value?{...value}:null;}

function nodeOf(row:CliSessionSummary,children:CliAgentTreeNode[]):CliAgentTreeNode{
  return{
    id:row.id,
    parentId:row.parentId,
    nativeDepth:row.depth,
    name:row.name,
    task:row.delegatedTask,
    model:row.model,
    outcome:row.outcome,
    interrupted:row.interrupted,
    startedAt:row.startedAt,
    updatedAt:row.updatedAt,
    endedAt:row.endedAt,
    usage:copyUsage(row.usage),
    collisions:copyCollisions(row.collisions),
    delegationOutcome:row.delegationOutcome,
    delegationEvidence:copyEvidence(row.delegationEvidence),
    children,
  };
}

export function buildAgentTree(rows:readonly CliSessionSummary[],focusId:string):CliAgentTree|null{
  const byId=new Map<string,CliSessionSummary>();
  for(const row of rows){
    if(typeof row.id!=='string'||!row.id)throw new CliAgentTreeError('Agent tree contains an empty session id.');
    if(byId.has(row.id))throw new CliAgentTreeError('Agent tree contains duplicate session ids.');
    byId.set(row.id,row);
  }

  const focus=byId.get(focusId);
  if(!focus)return null;

  const validParent=new Map<string,string>();
  const childIds=new Map<string,string[]>();
  for(const row of rows){
    if(!row.parentId)continue;
    const parent=byId.get(row.parentId);
    if(!parent||row.depth!==parent.depth+1)continue;
    validParent.set(row.id,parent.id);
    const siblings=childIds.get(parent.id);
    if(siblings)siblings.push(row.id);else childIds.set(parent.id,[row.id]);
  }

  let root=focus;
  const climbSeen=new Set<string>();
  while(validParent.has(root.id)){
    if(climbSeen.has(root.id))throw new CliAgentTreeError('Agent tree contains a delegation cycle.');
    climbSeen.add(root.id);
    const parent=byId.get(validParent.get(root.id)!);
    if(!parent)break;
    root=parent;
  }

  const build=(id:string):CliAgentTreeNode=>{
    const row=byId.get(id);
    if(!row)throw new CliAgentTreeError('Agent tree references a missing session.');
    const children=(childIds.get(id)??[]).map(build);
    return nodeOf(row,children);
  };

  return{focusId:focus.id,root:build(root.id)};
}
