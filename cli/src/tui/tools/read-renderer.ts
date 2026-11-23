import type {ToolKindRenderer} from './registry.ts';import {lineCount,parseArgs} from './shared.ts';import {t,tn} from '../../i18n/index.ts';
/* R2 lane T: the kernel's `leggi` sends `percorso` (talosHarness.mjs:1601-1608); the English spellings stay accepted.
   R3 (Q-R3-1): the row says what was read — `N lines` of the content returned, or the range the call asked for. */
export const renderRead:ToolKindRenderer=row=>{
  const a=parseArgs(row);const path=String(a.percorso??a.path??a.file??a.filename??a.raw??'').trim();
  const offset=Number.isFinite(a.offset)?Number(a.offset):Number.isFinite(a.start)?Number(a.start):1;
  const limit=Number.isFinite(a.limit)?Number(a.limit):Number.isFinite(a.lines)?Number(a.lines):null;
  const count=tn('tool.result.lines',lineCount(row.finalOutput));
  const result=limit!==null?[t('tool.read.lines',{from:offset,to:offset+Math.max(0,limit-1)})]:offset>1?[t('tool.read.from',{from:offset}),count]:[count];
  return{target:path,result,detail:[]};
};
