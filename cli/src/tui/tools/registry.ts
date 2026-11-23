import type {FileChange,ToolDecision,ToolFacts,ToolOrigin} from '../tool-facts.ts';
import type {ToolOutcomeEvidence} from '../../events/bridge.ts';
import {rendererKindFor,type ToolRendererKind} from '../tool-display.ts';
import {composeToolRow} from './row-format.ts';
import {renderRead} from './read-renderer.ts';import {renderWrite} from './write-renderer.ts';import {renderEdit} from './edit-renderer.ts';import {renderBash} from './bash-renderer.ts';import {renderSearch} from './search-renderer.ts';import {renderList} from './list-renderer.ts';import {renderGeneric} from './generic-renderer.ts';

/* R3 (gate E9, Q-R3-8): `denied` (a refusal) and `interrupted` (cut by the person's stop) are states of their own, never
   `failed`. The words on screen come from the dictionary (tools.ts `tool.state.*`), never from this enum (gate E2). */
export type ToolRowStatus='queued'|'approval'|'running'|'streaming'|'completed'|'failed'|'cancelled'|'unknown'|'denied'|'interrupted';
/** A file change reduced once (transcript-model.ts): what the row states when the texts are too large to keep. */
export type ChangeSummary={newFile:boolean;lines:number;added:number|null;removed:number|null};
export type ToolRowModel={id:string;name:string;status:ToolRowStatus;argsText:string;liveOutput:string;finalOutput:string;startedAt:number|null;endedAt:number|null;outcome?:ToolOutcomeEvidence|null;origin?:ToolOrigin;decision?:ToolDecision|null;facts?:ToolFacts;change?:FileChange|null;changeSummary?:ChangeSummary|null};
/** What a state is drawn as (a theme colour for app.ts); the word is always in the row, for monochrome. */
export type ToolRowTone='running'|'waiting'|'done'|'failed'|'denied'|'interrupted'|'unknown';
/*
 * R3 gate E1: the ONE row every surface prints. `line` is the header row, fitted to the width by the Q-R3-1 drop order,
 * and it is exactly `title + ' · ' + statusLabel` — the concatenation app.ts draws — so the screen, the height estimate
 * (transcript-virtualizer.ts), the search/copy text (transcript-model.ts) and the exit transcript (exit-output.ts) agree.
 * `title` is the label and the target; `statusLabel` the facts after it (never empty); `detailLines` the dim lines under it.
 */
export type ToolRenderResult={title:string;detailLines:string[];statusLabel:string;line:string;tone:ToolRowTone;label:string;target:string;facts:string[]};
export type ToolRenderContext={width:number;expanded:boolean;now:number};
/** What one kind of tool contributes to its row: the target, the result facts of a finished call and its detail lines. */
export type ToolKindView={label?:string;target:string;result:string[];detail:string[];command?:boolean;showsOutput?:boolean;liveTail?:boolean};
export type ToolKindRenderer=(row:ToolRowModel,context:ToolRenderContext)=>ToolKindView;
export type ToolRenderer=(row:ToolRowModel,width:number,expanded:boolean,now?:number)=>ToolRenderResult;
export type ToolRendererEntry={kind:ToolRendererKind;render:ToolRenderer};
/* R2 lane T (gate E3): the renderer is chosen through the ONE tool table, by kernel name (tool-display.ts). Before R2 this
   map was keyed `Read`/`Write`/`Bash`…, which no kernel tool is called, so every row fell to the generic renderer and
   printed its raw JSON arguments (review D-07). */
const RENDERERS:Record<ToolRendererKind,ToolKindRenderer>={read:renderRead,write:renderWrite,edit:renderEdit,bash:renderBash,search:renderSearch,list:renderList,generic:renderGeneric};

/** The row of one tool call at `width` columns; `expanded` is the Ctrl+O view; `now` drives a running row's elapsed time. */
export function renderTool(row:ToolRowModel,width:number,expanded:boolean,now:number=Date.now()):ToolRenderResult{
  const context:ToolRenderContext={width:Number.isFinite(width)?Math.max(1,Math.floor(width)):Number.POSITIVE_INFINITY,expanded,now};
  return composeToolRow(row,RENDERERS[rendererKindFor(row.name)](row,context),context);
}
export function rendererForTool(name:string):ToolRendererEntry{return{kind:rendererKindFor(name),render:renderTool};}
export{renderRead,renderWrite,renderEdit,renderBash,renderSearch,renderList,renderGeneric};
