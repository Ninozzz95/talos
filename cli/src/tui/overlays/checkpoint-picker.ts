/*
 * R5b D3 (owner decision Q-R5-13 and the owner's answers of 2026-09-25): the /undo picker. It lists this conversation's
 * checkpoints, newest first, each with the files it changed; Enter asks first, with Cancel highlighted. On a row not yet
 * undone the question is "go back to before this turn" (it and every newer one are undone, restore.ts rewindToCheckpoint);
 * on an undone row it is "re-apply up to this turn" (it and every older undone one, reapplyToCheckpoint). Files only: the
 * conversation stays.
 */
import {t,tn} from '../../i18n/index.ts';
import {checkpointChanges,type CheckpointChange,type CheckpointRecord} from '../../workspace/checkpoint-store.ts';
import type {NestedRepositoryCoverage} from '../../workspace/checkpoint.ts';
import {sessionAge} from './session-picker.ts';
import type {OverlayContent,OverlayLine} from './scroll-window.ts';

export type UndoPicker={rows:CheckpointRecord[];selected:number;confirm:0|1|null};

/** `2 files: a.txt (modified), b.txt (added)`, or `no files changed` (also `talos checkpoint list`). */
/** The checkpoint row of a turn names this many files at most. */
export const CHECKPOINT_ROW_FILES=3;
/* `max` (stress test 08/10/2026: a turn that changed 34 files wrote all 34 on the checkpoint row, cut by the screen): the
   files named, then «+N more»; /undo lists them all. */
export function checkpointFilesText(files:readonly CheckpointChange[],{max=Infinity}:{max?:number}={}):string{
  if(!files.length)return t('screen.checkpoint.noFiles');
  const named=files.slice(0,Math.max(1,max)).map(row=>`${row.path} (${t(`screen.checkpoint.change.${row.change}`)})`);
  const rest=files.length-named.length;
  return tn('screen.checkpoint.files',files.length,{list:named.join(', ')+(rest>0?' '+t('screen.checkpoint.more',{count:rest}):'')});
}

/** The checkpoints a choice touches, in the picker's order (newest first). */
export function undoRange(rows:readonly CheckpointRecord[],selected:number):{direction:'rewind'|'reapply';steps:CheckpointRecord[]}{
  const chosen=rows[selected];if(!chosen)return{direction:'rewind',steps:[]};
  if(chosen.state==='undone')return{direction:'reapply',steps:rows.slice(selected).filter(row=>row.state==='undone')};
  return{direction:'rewind',steps:rows.slice(0,selected+1).filter(row=>row.state!=='undone')};
}
/** The files a set of checkpoints changed, each named once. */
export function rangeFiles(steps:readonly CheckpointRecord[]):CheckpointChange[]{
  const byPath=new Map<string,CheckpointChange>();
  for(const step of steps)for(const change of checkpointChanges(step))if(!byPath.has(change.path))byPath.set(change.path,change);
  return[...byPath.values()].sort((a,b)=>a.path.localeCompare(b.path));
}

/*
 * R2 (owner 2026-09-30, «Copertura completa»): the submodules and repositories inside the project the chosen checkpoints saw.
 * Their files are restored and their Git history is not; one left out of the checkpoint (too large, too deep) is not restored
 * at all. Said before the person confirms, like Claude Code's "Restored the code, but skipped N files".
 */
export function rangeNestedLines(steps:readonly CheckpointRecord[]):string[]{
  const byPath=new Map<string,NestedRepositoryCoverage>();
  for(const step of steps)for(const row of [...(step.pre.coverage.nested??[]),...(step.post?.coverage.nested??[])]){const known=byPath.get(row.path);if(!known||known.covered&&!row.covered)byPath.set(row.path,row);}
  const rows=[...byPath.values()].sort((a,b)=>a.path.localeCompare(b.path));
  const covered=rows.filter(row=>row.covered).map(row=>row.path),left=rows.filter(row=>!row.covered).map(row=>`${row.path} (${t(`screen.undo.nestedReason.${row.reason??'too-large'}`)})`);
  return[...(covered.length?[t('screen.undo.nestedHistory',{list:covered.join(', ')})]:[]),...(left.length?[t('screen.undo.nestedOut',{list:left.join(', ')})]:[])];
}

function rowText(row:CheckpointRecord,now:number):string{
  const kind=t(row.operation==='shell'?'screen.undo.kind.command':'screen.undo.kind.turn');
  return`${row.state==='undone'?t('screen.undo.undone')+' · ':''}${sessionAge(row.createdAt,now)} · ${kind} · ${checkpointFilesText(checkpointChanges(row))}`;
}

export function undoPickerOverlay(picker:UndoPicker,{now=Date.now()}:{now?:number}={}):OverlayContent{
  if(picker.confirm===null){
    const lines:OverlayLine[]=picker.rows.map((row,index)=>({text:rowText(row,now),tone:index===picker.selected?'selected':row.state==='undone'?'dim':'plain'}));
    return{head:[{text:t('screen.undo.title'),tone:'title'}],sections:[{lines,selected:picker.selected}],foot:[{text:t('screen.undo.keys'),tone:'dim'},{text:t('screen.undo.note'),tone:'dim'}]};
  }
  const {direction,steps}=undoRange(picker.rows,picker.selected);
  const question=direction==='rewind'?tn('screen.undo.confirmRewind',steps.length):tn('screen.undo.confirmReapply',steps.length);
  const act=t(direction==='rewind'?'screen.undo.goBack':'screen.undo.reapply');
  const choices:OverlayLine[]=[t('screen.undo.cancel'),act].map((text,index)=>({text,tone:index===picker.confirm?'selected':'plain'}));
  return{head:[{text:question,tone:'title'},{text:checkpointFilesText(rangeFiles(steps)),tone:'dim'},...rangeNestedLines(steps).map(text=>({text,tone:'dim' as const}))],sections:[{lines:choices,selected:picker.confirm}],foot:[{text:t('screen.undo.confirmKeys'),tone:'dim'}]};
}
