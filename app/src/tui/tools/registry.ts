import type {ToolOutcomeEvidence} from '../../events/bridge.ts';
import {truncateDisplay} from '../text-width.ts';
import {renderRead} from './read-renderer.ts';import {renderWrite} from './write-renderer.ts';import {renderEdit} from './edit-renderer.ts';import {renderBash} from './bash-renderer.ts';import {renderSearch} from './search-renderer.ts';import {renderGeneric} from './generic-renderer.ts';

export type ToolRowStatus='queued'|'approval'|'running'|'streaming'|'completed'|'failed'|'cancelled'|'unknown';
export type ToolRowModel={id:string;name:string;status:ToolRowStatus;argsText:string;liveOutput:string;finalOutput:string;startedAt:number|null;endedAt:number|null;outcome?:ToolOutcomeEvidence|null};
export type ToolRenderResult={title:string;detailLines:string[];statusLabel:string};
export type ToolRenderer=(row:ToolRowModel,width:number,expanded:boolean)=>ToolRenderResult;
export type ToolRendererEntry={kind:'read'|'write'|'edit'|'bash'|'search'|'generic';render:ToolRenderer};
const entries:Record<string,ToolRendererEntry>={Read:{kind:'read',render:renderRead},Write:{kind:'write',render:renderWrite},Edit:{kind:'edit',render:renderEdit},Bash:{kind:'bash',render:renderBash},Search:{kind:'search',render:renderSearch},Grep:{kind:'search',render:renderSearch},Find:{kind:'search',render:renderSearch}};

function evidenceLines(outcome:ToolOutcomeEvidence,width:number):string[]{
  const rows:string[]=[];
  if(outcome.receiptStatus)rows.push(`receipt ${outcome.receiptStatus}`);
  if(outcome.exitCode!==null)rows.push(`exit ${outcome.exitCode}`);
  if(outcome.enforcement!==null)rows.push(`enforcement ${outcome.enforcement}`);
  if(outcome.allowed!==null||outcome.permissionVia!==null){
    const decision=outcome.allowed===true?'allowed':outcome.allowed===false?'denied':'not reported';
    rows.push(`permission ${decision}${outcome.permissionVia?` via ${outcome.permissionVia}`:''}`);
  }
  if(outcome.permissionReason)rows.push(`permission reason ${outcome.permissionReason}`);
  if(outcome.risk)rows.push(`risk ${outcome.risk}`);
  const cap=Math.max(16,Math.min(240,width-4));
  return rows.map(row=>truncateDisplay(row,cap));
}

export function rendererForTool(name:string):ToolRendererEntry{return entries[name]??{kind:'generic',render:renderGeneric};}
export function renderTool(row:ToolRowModel,width:number,expanded:boolean):ToolRenderResult{
  const rendered=rendererForTool(row.name).render(row,width,expanded);
  if(!expanded||!row.outcome)return rendered;
  return{...rendered,detailLines:[...rendered.detailLines,...evidenceLines(row.outcome,width)]};
}
export{renderRead,renderWrite,renderEdit,renderBash,renderSearch,renderGeneric};
