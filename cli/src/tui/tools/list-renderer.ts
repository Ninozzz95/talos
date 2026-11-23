import type {ToolKindRenderer} from './registry.ts';import {boundedLines,outputText,parseArgs} from './shared.ts';import {t,tn} from '../../i18n/index.ts';
/* R3 (Q-R3-1, gate §2.3): `List folder <path> · N entries`. The kernel's `elenca` (elencaDaCartella,
   talosHarness.mjs:3487) answers one path per line, `no files and no folders. …` for an empty folder, and a sentence for a
   folder it cannot read or a refusal; those exact shapes are pinned by r3-rd-tool-rows.test.ts, anything else gets no count. */
const EMPTY=/^no files and no folders\. /u;
/* DECLINED (03/11, decisione 44 e Tester R2-R4): the person's own no on a card; like REFUSED it is not a listing */
const NOT_COUNTED=/^(?:REFUSED|DECLINED)\. | is not a readable folder of this workspace\. /u;
/* Decision 99 (03/11, R2 of the Desktop's review): «REFUSED: …» is the kernel's brake on a paged listing (decisioneDiSfogliamento,
   talosHarness.mjs: a cursor already served, the listing finished, the two page caps). It is a step of the turn, as in Hermes, not
   a failure and not a listing: no count, and the PC's neutral words (activity.listingStopped, «listing stopped, skipped»). */
const PAGED_STOP=/^REFUSED: /u;
export const renderList:ToolKindRenderer=(row,context)=>{
  const a=parseArgs(row);const path=String(a.percorso??a.path??a.folder??a.raw??'').trim();
  const text=outputText(row).trim();
  const stopped=PAGED_STOP.test(text);
  const count=EMPTY.test(text)?0:stopped||NOT_COUNTED.test(text)?null:text.split(/\r?\n/u).filter(line=>line.trim()).length;
  return{target:path,result:stopped?[t('tool.result.listingStopped')]:count===null?[]:[tn('tool.result.entries',count)],detail:row.status==='denied'||count===0?[]:boundedLines(text,context.width,context.expanded?12:3),showsOutput:true};
};
