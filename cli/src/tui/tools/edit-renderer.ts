import type {ToolKindRenderer} from './registry.ts';import {parseArgs} from './shared.ts';import {changeDiff,changeSummaryOf,diffDetail,fragmentDiff,resultOfChange} from './change.ts';import {t} from '../../i18n/index.ts';
/* R2 lane T: the kernel's `file_edit` sends `percorso`, `old_string`, `new_string` (talosHarness.mjs:2786-2806).
   R3 (Q-R3-4, gate E10): `+a −r` from the ONE line diff (line-diff.ts, jsdiff) — of the whole file when the kernel reported
   the change (`file.changed`), of the two fragments before that. The multiset count that stood here is gone: it saw a
   moved line as no change and an edit of one of two identical lines as nothing (gate §3.1). */
export const renderEdit:ToolKindRenderer=(row,context)=>{
  const a=parseArgs(row);const path=String(a.percorso??a.path??a.file??'').trim();
  const oldText=String(a.oldText??a.old_string??a.before??''),newText=String(a.newText??a.new_string??a.after??'');
  const summary=changeSummaryOf(row);
  const fragment=summary&&summary.added!==null?null:fragmentDiff(oldText,newText,path);
  const result=fragment?[t('tool.result.changes',{added:fragment.added,removed:fragment.removed})]:resultOfChange(summary!);
  const detail=!context.expanded?[]:diffDetail(row.change?changeDiff(row.change):fragment??fragmentDiff(oldText,newText,path),context.width);
  return{target:path,result,detail};
};
