/*
 * R5b (owner answer 2026-09-25: "I tuoi messaggi passati"): /history lists the messages the person sent in this project,
 * this session's and the kept ones of earlier sessions (prompt-history-store.ts, secrets already masked), newest first.
 * Typing filters them; Enter puts the chosen one back in the composer, collapsed pastes included, to edit or send again.
 * It is Ctrl+R's list, made visible. Nothing is sent by choosing.
 */
import {t} from '../../i18n/index.ts';
import {draftDisplayText,type EditorDraft} from '../editor.ts';
import {truncateDisplay} from '../text-width.ts';
import type {OverlayContent,OverlayLine} from './scroll-window.ts';

export type HistoryPicker={query:string;selected:number};

/** One line per message: a collapsed paste as the composer shows it, line breaks as ⏎. */
export function historyRowText(draft:EditorDraft):string{
  /* UI Phase 1: the one placeholder (editor.ts pasteLabel) */
  return draftDisplayText(draft).replace(/\r?\n/gu,' ⏎ ').replace(/\s{2,}/gu,' ').trim();
}
/** Messages only: a slash command (/history itself, /status…) stays in ↑ and Ctrl+R but is not "your message". */
export function filterHistory(rows:readonly EditorDraft[],query:string):EditorDraft[]{
  const q=query.trim().toLowerCase();const messages=rows.filter(row=>!row.text.trimStart().startsWith('/'));
  return q?messages.filter(row=>row.text.toLowerCase().includes(q)):messages;
}

export function historyPickerOverlay({rows,picker,width}:{rows:readonly EditorDraft[];picker:HistoryPicker;width:number}):OverlayContent{
  const shown=filterHistory(rows,picker.query);const room=Math.max(8,width-6);
  const head:OverlayLine[]=[{text:t('screen.history.title',{count:shown.length}),tone:'title'},{text:t('screen.history.search',{query:picker.query}),tone:'dim'}];
  const foot:OverlayLine[]=[{text:t('screen.history.keys'),tone:'dim'}];
  if(!shown.length)return{head,sections:[{lines:[{text:picker.query.trim()?t('screen.history.noMatch',{query:picker.query}):t('screen.history.empty'),tone:'dim'}]}],foot};
  const selected=Math.max(0,Math.min(shown.length-1,picker.selected));
  return{head,sections:[{lines:shown.map((row,index)=>({text:(index===selected?'› ':'  ')+truncateDisplay(historyRowText(row),room),tone:index===selected?'selected':'plain'})),selected}],foot};
}
