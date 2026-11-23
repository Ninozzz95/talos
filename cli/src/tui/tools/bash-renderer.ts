import type {ToolKindRenderer} from './registry.ts';import {boundedLines,detailWidth,formatDuration,moreLines,outputTail,outputText,parseArgs,sanitizeDisplayText,withoutKernelExitLine} from './shared.ts';import {truncateDisplay} from '../text-width.ts';import {t} from '../../i18n/index.ts';
/* R2 lane T: the kernel's `shell` sends `comando` and the model's own `descrizione` ("shown to the person watching",
   talosHarness.mjs:1702-1720), which leads the detail; `prova` sends no argument at all.
   R3 (Q-R3-10): the output is a TAIL — the last 5 lines (errors are at the end), 40 in the expanded view — with the lines
   above it counted. While the command runs, the live tail ends with `+N lines · T s`; a sandboxed command streams
   nothing today (brokered-executor.ts:343-352), so its row says `running T s` and the output arrives at the end.
   The kernel's `exit N [sandbox: …]` first line is hidden (shared.ts, gate E3); a person's `!` command is labelled `!`. */
const TAIL=5,TAIL_EXPANDED=40;
export const renderBash:ToolKindRenderer=(row,context)=>{
  const a=parseArgs(row);const command=String(a.comando??a.command??a.cmd??a.raw??'').trim();
  const description=typeof a.descrizione==='string'?a.descrizione.trim():typeof a.description==='string'?a.description.trim():'';
  const detail=description?boundedLines(description,context.width,context.expanded?4:1):[];
  const live=row.status==='queued'||row.status==='running'||row.status==='streaming';
  let liveTail=false;
  if(row.status!=='denied'){
    const tail=outputTail(live?row.liveOutput:withoutKernelExitLine(outputText(row)),context.expanded?TAIL_EXPANDED:TAIL);
    /* UI Phase 0 D14: the count of the lines above the tail stands above it; a kept output (R5a S6) only bounds it. */
    const kept=Boolean((row as {savedOutput?:unknown}).savedOutput);
    if(tail.hidden>0)detail.push(moreLines(tail.hidden,tail.atLeast||kept));
    detail.push(...tail.lines.map(line=>truncateDisplay(sanitizeDisplayText(line),detailWidth(context.width))||' '));
    const summary:string[]=[];
    if(live&&tail.lines.length){
      liveTail=true;
      const elapsed=row.startedAt===null?0:Math.max(0,context.now-row.startedAt);
      if(elapsed>=1000)summary.push(formatDuration(elapsed));
    }
    if(summary.length)detail.push(summary.join(' · '));
  }
  return{...(row.origin==='person'?{label:t('tool.person.label')}:{}),target:command,result:[],detail,command:true,showsOutput:true,liveTail};
};
