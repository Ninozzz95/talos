import {t,tn} from '../../i18n/index.ts';
import {rendererKindFor} from '../tool-display.ts';
import type {TranscriptItem,TranscriptToolItem} from '../transcript-model.ts';
import {toolRowView} from './tool-row.ts';
import {displayWidth,truncateDisplay} from '../text-width.ts';
import {maskToolArguments} from '../tools/argument-masks.ts';

/*
 * The approved mockup, literally (owner 01/10 «rispettato alla lettera»; 08/10/2026 «la parità col mockup non è stata raggiunta: i blocchi di
 * ragionamento e tool call non sono così» → «Tutta la conversazione»). Its golden frames at 120x40 (MOCKUP-FASE-UI-2026-10-07-badge.html, step 02,
 * 11, 14) draw a turn's calls as GROUPS, one line each, a green bullet, the summary, and the key that opens them, faint:
 *   `  ● Read 2 files, searched 1 pattern · ctrl+o`      (reads, searches and lists: the exploration group)
 *   `  ● edited 1 file, ran 1 command · ctrl+o`          (edits, writes and commands: the work group)
 *   `  ● ran 1 command · ctrl+o`                          (one call is a group too)
 *   `  ⠸ Searched "retry" in src/ · ctrl+o`               (while a call works: the spinner and that call)
 * Claude Code folds calls the same way («Read 2 files, searched 1 pattern (ctrl+o to expand)», 2.1.283); Codex names an exploration once («• Explored»).
 * A call that failed, waits for the person or was denied keeps its own row: what needs the person is never folded away. The group exists only in
 * the list the transcript DRAWS; search, copy and the exit transcript keep the rows.
 */
export type ToolGroupKind='explore'|'work';
export type TranscriptToolGroupItem={kind:'toolGroup';id:string;tools:TranscriptToolItem[];group?:ToolGroupKind};
export type TranscriptDisplayItem=TranscriptItem|TranscriptToolGroupItem;

const EXPLORING=new Set(['read','search','list']);
const CHANGING=new Set(['edit','write','bash']);
const WORKING=new Set(['queued','running','streaming']);
function groupOf(item:TranscriptItem):ToolGroupKind|null{
  if(item.kind!=='tool'||!(item.status==='completed'||WORKING.has(item.status)))return null;
  /* a command that ended with a non-zero code failed for the person too: it keeps its row */
  if(item.status==='completed'&&typeof item.outcome?.exitCode==='number'&&item.outcome.exitCode!==0)return null;
  const kind=rendererKindFor(item.name);
  return EXPLORING.has(kind)?'explore':CHANGING.has(kind)?'work':null;
}

/** Runs of calls of one group become one item, whose id is its first call's (stable as the run grows). */
export function groupExploration(items:readonly TranscriptItem[]):TranscriptDisplayItem[]{
  const out:TranscriptDisplayItem[]=[];let run:TranscriptToolItem[]=[];let kind:ToolGroupKind|null=null;
  const flush=()=>{if(run.length&&kind)out.push({kind:'toolGroup',id:`group:${run[0]!.id}`,tools:run,group:kind});run=[];kind=null;};
  for(const item of items){
    const group=groupOf(item);
    if(group){if(kind&&group!==kind)flush();kind=group;run.push(item as TranscriptToolItem);continue;}
    flush();out.push(item);
  }
  flush();return out;
}

export function toolGroupWorking(group:TranscriptToolGroupItem):boolean{return group.tools.some(tool=>WORKING.has(tool.status));}
const argument=(tool:TranscriptToolItem,...keys:string[])=>{
  let args:unknown=null;try{args=JSON.parse(tool.argsText||'null');}catch{args=null;}
  if(!args||typeof args!=='object')return '';
  args=maskToolArguments(args);// round 7 of twin 0.2.2: the group line shows what the card would show
  for(const key of keys){const value=(args as Record<string,unknown>)[key];if(typeof value==='string'&&value.trim())return value.trim().split(/\r?\n/u)[0]!;}
  return '';
};
/** While a call works the line names it, as the mockup's call labels do (`Read src/auth/login.ts`, `Searched "retry" in src/`). */
export function toolGroupCallLabel(tool:TranscriptToolItem):string{
  const kind=rendererKindFor(tool.name);
  if(kind==='search'){const text=argument(tool,'testo','text','query','pattern','nome','name'),inside=argument(tool,'dentro','path','percorso');return t('tool.group.now.search',{text})+(inside?t('tool.group.now.inside',{inside}):'');}
  if(kind==='read')return t('tool.group.now.read',{path:argument(tool,'percorso','path','file','file_path')});
  if(kind==='list')return t('tool.group.now.list',{path:argument(tool,'percorso','path','dir')||'.'});
  if(kind==='bash')return t('tool.group.now.command',{command:argument(tool,'comando','command','cmd')});
  return t('tool.group.now.edit',{path:argument(tool,'percorso','path','file','file_path')});
}
/** The one line, without the glyph: the mockup's summary (`summary(calls)`: reads, searches, lists, edits, commands, in that
    order, its own words and case), or the call that works. */
export function toolGroupLine(group:TranscriptToolGroupItem):string{
  const current=group.tools.find(tool=>WORKING.has(tool.status));
  if(current)return toolGroupCallLabel(current);
  const count=(...kinds:string[])=>group.tools.filter(tool=>kinds.includes(rendererKindFor(tool.name))).length;
  const reads=count('read'),searches=count('search'),lists=count('list'),edits=count('edit','write'),runs=count('bash');
  return [reads?tn('tool.group.read',reads):'',searches?tn('tool.group.searched',searches):'',lists?tn('tool.group.listed',lists):'',
    edits?tn('tool.group.edited',edits):'',runs?tn('tool.group.ran',runs):''].filter(Boolean).join(', ');
}
/** What stands after the line, faint: the key that opens the calls. */
export function toolGroupHint():string{return t('tool.group.hint');}

/* Stage 6c «tutto cliccabile» (owner 01/10; mockup `toggle:id` and its open tools item: the calls under the title, `├` and a
   last `└`; Claude Code fullscreen: a click expands a collapsed tool result, a second click collapses it). One row per call,
   its title and status as its own row would say them, cut to the width. Ctrl+O still shows every call of every group. */
export function toolGroupOpenRows(group:TranscriptToolGroupItem,width:number,now?:number):string[]{
  return group.tools.map((tool,index)=>{
    const lead=`    ${index===group.tools.length-1?'└':'├'} `;
    const view=toolRowView(tool,Math.max(1,width-displayWidth(lead)),false,now);
    return truncateDisplay(`${lead}${view.title} · ${view.statusLabel}`,Math.max(1,width));
  });
}
/** The items a click has opened: one toggles, the others stay as they are. */
export function toggleOpenItem(open:ReadonlySet<string>,id:string):ReadonlySet<string>{
  const next=new Set(open);if(next.has(id))next.delete(id);else next.add(id);return next;
}
