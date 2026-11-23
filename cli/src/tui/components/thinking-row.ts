import {t} from '../../i18n/index.ts';
import type {TranscriptItem,TranscriptReasoningItem} from '../transcript-model.ts';

export function thinkingRowText(text:string,visible:boolean){return visible&&text?text:null;}

/*
 * R5a S8 (owner decision Q-R5-9; gate §4, finding 9): reasoning is collapsed by default, and a collapsed block leaves ONE
 * dim line, "Thought for 2.8 s · Ctrl+T shows" (Claude Code `thought for Ns`, bytes 2.1.281, 2026-09-23; Pi keeps the
 * choice, `docs/settings.md:17`, 2026-09-22). While the block streams nothing is added: the status row already says
 * "thinking". A block with no live timing (a replayed session) says "Thought" without a number (E1).
 */
/*
 * UI Phase 1 (owner 27/09, "one-line preview"; supersedes "while the block streams nothing is added"): while the model
 * thinks, the collapsed block is ONE dim line with the last sentence so far, 160 characters at most — Hermes's default
 * `truncated` mode (THINKING_COT_MAX=160, measured 24/09). A sentence longer than that keeps its END: that is what the model
 * is thinking now. Line breaks and runs of spaces fold, so the preview is always one line.
 */
export const THINKING_PREVIEW_MAX=160;
export function thinkingPreview(text:string):string{
  const folded=String(text).replace(/\s+/gu,' ').trim();
  if(!folded)return'';
  const sentences=folded.split(/(?<=[.!?])\s+/u).filter(Boolean);
  const last=[...(sentences[sentences.length-1]??folded)];
  return last.length>THINKING_PREVIEW_MAX?'…'+last.slice(last.length-(THINKING_PREVIEW_MAX-1)).join(''):last.join('');
}
/*
 * The approved mockup, literally (07/10, `buildItemRows` kind 'thought'; owner 08/10 «Tutta la conversazione»): the block is
 * `  ▸ Thought for 4s  click to read` — the glyph faint, the words dim italic, the hint faint — and `  ▸ Thinking…` while it
 * streams; the sentence the model is on moved to the indicator above the composer (Codex `chatwidget/streaming.rs`: the header
 * is the reasoning summary's last line). The duration is the mockup's `clock`: `4s`, `1m 05s`. Opened, `▾` and the text under
 * `    │ `. The words are what this returns; the glyph and the hint are thoughtGlyph/thoughtHint.
 */
export function thoughtClock(ms:number):string{const s=Math.floor(Math.max(0,ms)/1000);return s<60?`${s}s`:`${Math.floor(s/60)}m ${String(s%60).padStart(2,'0')}s`;}
export function thoughtLine(item:Pick<TranscriptReasoningItem,'startedAt'|'endedAt'>&Partial<Pick<TranscriptReasoningItem,'text'|'streaming'>>):string{
  if(item.streaming)return t('screen.thought.starting');
  const {startedAt,endedAt}=item;
  if(typeof startedAt!=='number'||typeof endedAt!=='number'||endedAt<startedAt)return t('screen.thought.noDuration');
  return t('screen.thought.duration',{duration:thoughtClock(endedAt-startedAt)});
}
export function thoughtGlyph(open:boolean):string{return open?'▾ ':'▸ ';}
/** After a finished, closed block, faint: what a click does. */
export function thoughtHint(item:Partial<Pick<TranscriptReasoningItem,'streaming'>>,open:boolean):string{return open||item.streaming?'':t('screen.thought.hint');}
/** The live sentence (kept for the indicator and the expanded view): the last sentence so far, 160 characters at most. */
export function thoughtLivePreview(item:Partial<Pick<TranscriptReasoningItem,'text'|'streaming'>>):string{return item.streaming?thinkingPreview(item.text??''):'';}
/** What the transcript draws: no `run` rows (Q-R3-9); with reasoning collapsed, a streaming block is its one-line
 *  preview (UI Phase 1) — unless motion is reduced (`livePreview:false`): then only once it has ended, as before. */
export function visibleTranscriptItems(items:readonly TranscriptItem[],reasoningVisible:boolean,{livePreview=true,hidden=false}:{livePreview?:boolean;/* stage 7.11: «Thinking hidden» */hidden?:boolean}={}):TranscriptItem[]{
  return items.filter(item=>item.kind!=='run'&&!(hidden&&item.kind==='reasoning')&&(reasoningVisible||livePreview||item.kind!=='reasoning'||!item.streaming));
}
