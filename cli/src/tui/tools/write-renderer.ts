import type {ToolKindRenderer} from './registry.ts';import {argumentLine,lineCount,parseArgs} from './shared.ts';import {changeDiff,changeSummaryOf,diffDetail,resultOfChange} from './change.ts';import {t,tn} from '../../i18n/index.ts';
/* R2 lane T: the kernel's `scrivi` sends `percorso`, `contenuto` and an optional `mode:"append"` (talosHarness.mjs:1653-1668).
   R3 (Q-R3-4, gate E10): the row states the change the kernel reported (`file.changed`: `new file · N lines`, or `+a −r`
   when it replaced a file); before that is known, the size of what was sent. The full diff is the expanded view (Ctrl+O). */
export const renderWrite:ToolKindRenderer=(row,context)=>{
  const a=parseArgs(row);const path=String(a.percorso??a.path??a.file??a.filename??'').trim();const content=String(a.contenuto??a.content??a.text??'');
  const summary=changeSummaryOf(row);
  const result=summary?resultOfChange(summary):[tn('tool.result.lines',lineCount(content)),...(a.mode==='append'?[t('tool.result.appended')]:[])];
  const detail=!context.expanded?[]:row.change?diffDetail(changeDiff(row.change),context.width):[argumentLine('contenuto',content)];
  return{target:path,result,detail};
};
