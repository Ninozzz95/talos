import type {TuiQueueEntry} from '../session-controller.ts';
import {queuedActionPreview} from '../shell-model.ts';

export type QueueEditorView={entries:readonly TuiQueueEntry[];selected:number;paused:boolean;editing:boolean;draft:string};
export function queueEditorSelected(entries:readonly TuiQueueEntry[],selected:number):TuiQueueEntry|null{
  if(entries.length===0)return null;
  return entries[Math.max(0,Math.min(entries.length-1,Math.trunc(selected)||0))]??null;
}
export function queueEditorLines({entries,selected,paused,editing,draft}:QueueEditorView):string[]{
  const active=queueEditorSelected(entries,selected),index=active?entries.findIndex(row=>row.id===active.id):-1;
  const lines=[paused?'Queue · RESTORED · paused':'Queue · live',entries.length?`${entries.length} queued item${entries.length===1?'':'s'}`:'Queue is empty.'];
  for(let i=0;i<entries.length;i++){
    const row=entries[i]!,status=row.status==='uncertain'?' · uncertain · may have been delivered':'';
    const attachments=row.attachments?.length?` · ${row.attachments.length} attachment${row.attachments.length===1?'':'s'}`:'';
    lines.push(`${i===index?'›':' '} ${i+1}. ${row.kind==='command'?'!':'follow-up · '}${queuedActionPreview(row.text).slice(0,180)}${attachments}${status}`);
  }
  if(editing)lines.push(`edit: ${queuedActionPreview(draft).slice(0,220)||'—'}`,'Enter save · Esc cancel edit');
  else lines.push('Up/Down select · Shift+Up/Down move · e edit · d delete · c clear · r resume · Esc/q close');
  if(paused&&entries.some(row=>row.status==='uncertain'))lines.push('Resume may retry an uncertain entry whose final acknowledgement was lost.');
  return lines;
}
