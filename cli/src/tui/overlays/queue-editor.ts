import {t,tn} from '../../i18n/index.ts';
import type {TuiQueueEntry} from '../session-controller.ts';
import {queuedActionPreview} from '../shell-model.ts';
import {centerTones,listOverlay,type OverlayContent} from './scroll-window.ts';

export type QueueEditorView={entries:readonly TuiQueueEntry[];selected:number;paused:boolean;editing:boolean;draft:string};
export function queueEditorSelected(entries:readonly TuiQueueEntry[],selected:number):TuiQueueEntry|null{
  if(entries.length===0)return null;
  return entries[Math.max(0,Math.min(entries.length-1,Math.trunc(selected)||0))]??null;
}
export function queueEditorLines({entries,selected,paused,editing,draft}:QueueEditorView):string[]{
  const active=queueEditorSelected(entries,selected),index=active?entries.findIndex(row=>row.id===active.id):-1;
  const lines=[t(paused?'screen.queueEditor.restored':'screen.queueEditor.live'),entries.length?tn('screen.queueEditor.count',entries.length):t('screen.queue.empty')];
  for(let i=0;i<entries.length;i++){
    const row=entries[i]!,status=row.status==='uncertain'?` · ${t('screen.queueEditor.uncertain')}`:'';
    const attachments=row.attachments?.length?` · ${tn('screen.queueEditor.attachments',row.attachments.length)}`:'';
    /* R5a Q-R5-8: a queued slash command (`kind:'slash'`) is shown as the command it is, not as a follow-up message. */
    const label=row.kind==='command'?'!':row.kind==='slash'?'':t('screen.queueEditor.followUp');
    lines.push(`${i===index?'›':' '} ${i+1}. ${label}${queuedActionPreview(row.text).slice(0,180)}${attachments}${status}`);
  }
  if(editing)lines.push(t('screen.queueEditor.edit',{draft:queuedActionPreview(draft).slice(0,220)||t('screen.none')}),t('screen.queueEditor.editKeys'));
  else lines.push(t('screen.queueEditor.keys'));
  if(paused&&entries.some(row=>row.status==='uncertain'))lines.push(t('screen.queueEditor.retryWarning'));
  return lines;
}
// R1 Q-R1-3: the same lines as a capped, scrolling overlay (overlays/scroll-window.ts).
export function queueEditorOverlay(view:QueueEditorView):OverlayContent{
  const lines=queueEditorLines(view),active=queueEditorSelected(view.entries,view.selected);
  const selected=active?view.entries.findIndex(row=>row.id===active.id):0;
  return listOverlay(lines,{head:2,list:view.entries.length,selected,foot:lines.length-2-view.entries.length,tones:centerTones});
}
