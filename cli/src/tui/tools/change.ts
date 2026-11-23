/*
 * R3 lane RD (Q-R3-4, gate E10): a write or edit row reads its change through the ONE line diff (line-diff.ts). A row is
 * drawn many times (every frame, every height estimate), so a file change is diffed once per change object and a pair
 * of edit fragments once per text (bounded cache); the expanded view renders the model with components/diff.ts.
 */
import {t,tn} from '../../i18n/index.ts';
import {renderDiffModel} from '../components/diff.ts';
import {lineDiff,type LineDiff} from '../line-diff.ts';
import type {FileChange} from '../tool-facts.ts';
import type {ChangeSummary,ToolRowModel} from './registry.ts';
import {lineCount} from './shared.ts';

const DIFFS=new WeakMap<FileChange,LineDiff>();
export function changeDiff(change:FileChange):LineDiff{
  let diff=DIFFS.get(change);
  if(!diff){diff=lineDiff(change.before,change.after,{path:change.path});DIFFS.set(change,diff);}
  return diff;
}
export function summarizeChange(change:FileChange):ChangeSummary{
  const diff=changeDiff(change);
  return{newFile:change.before===null,lines:lineCount(change.after),added:diff.approximate?null:diff.added,removed:diff.approximate?null:diff.removed};
}
export function changeSummaryOf(row:ToolRowModel):ChangeSummary|null{return row.changeSummary??(row.change?summarizeChange(row.change):null);}
/** The result facts of a change: `new file · N lines`, `+a −r`, or `N lines` when it was too large to compare. */
export function resultOfChange(summary:ChangeSummary):string[]{
  if(summary.newFile)return[t('tool.result.newFile'),tn('tool.result.lines',summary.lines)];
  if(summary.added===null||summary.removed===null)return[tn('tool.result.lines',summary.lines)];
  return[t('tool.result.changes',{added:summary.added,removed:summary.removed})];
}

/* Edit fragments are small; the cache keeps the last few pairs so a redraw does not diff again. */
const FRAGMENTS=new Map<string,LineDiff>();
const FRAGMENT_CACHE=64,FRAGMENT_KEY_MAX=64*1024;
/** The diff of an edit's two fragments: their line numbers are not the file's, so none is claimed (no numbers, no `@@`).
 *  A fragment is a piece of a line-ended file, so both get a final line break before diffing: `line` and `line\n` are the
 *  same line here (for a whole file jsdiff, like git, rightly tells them apart). */
const lineEnded=(text:string)=>text===''||text.endsWith('\n')?text:text+'\n';
export function fragmentDiff(oldText:string,newText:string,path:string):LineDiff{
  const key=oldText.length+newText.length<=FRAGMENT_KEY_MAX?`${path}\u0000${oldText}\u0000${newText}`:null;
  const cached=key===null?undefined:FRAGMENTS.get(key);if(cached)return cached;
  const diff=lineDiff(lineEnded(oldText),lineEnded(newText),{path});
  const model={...diff.model,files:diff.model.files.map(file=>({...file,rows:file.rows.filter(row=>row.kind!=='hunk').map(row=>({...row,oldLine:null,newLine:null}))}))};
  const result:LineDiff={...diff,model};
  if(key!==null){FRAGMENTS.set(key,result);if(FRAGMENTS.size>FRAGMENT_CACHE)FRAGMENTS.delete(FRAGMENTS.keys().next().value!);}
  return result;
}

/* The expanded view of a change is bounded like every other detail: the first lines of the diff, then how many more. */
const MAX_DIFF_LINES=400;
export function diffDetail(diff:LineDiff,width:number):string[]{
  const lines=renderDiffModel(diff.model,width).lines.filter(line=>line.kind!=='file').map(line=>line.text);
  if(lines.length<=MAX_DIFF_LINES)return lines;
  return[...lines.slice(0,MAX_DIFF_LINES),tn('tool.diff.more',lines.length-MAX_DIFF_LINES)];
}
