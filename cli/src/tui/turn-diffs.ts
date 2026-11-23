/*
 * Stage 7.16 (/diff «By turn», owner 03/10; Claude Code's /diff per-turn view is rebuilt from the conversation, not from git,
 * so later edits and `git add` do not change it): each checkpoint of this conversation, newest first, named by the message
 * that started its turn (a shell command by its kind), with what that turn alone changed, in the /diff sheet's shape. The
 * checkpoints and their order are /undo's (undo-points.ts): a model turn takes the next message, a shell command none.
 */
import {t} from '../i18n/index.ts';
import type {SessionTurn} from '../sessions/digest.ts';
import {checkpointFileDiffs,type CheckpointFileDiff} from '../workspace/checkpoint-delta.ts';
import type {CheckpointRecord,CheckpointStore} from '../workspace/checkpoint-store.ts';
import type {DiffTurn} from './panel/commands.ts';
import type {DiffFile} from './panel/sheet.ts';

/* as many turns as /undo lists */
const TURNS_MAX=50;

function noteOf(file:CheckpointFileDiff):string{
  const what=t(file.change==='added'?'panel.diff.note.added':file.change==='deleted'?'panel.diff.note.deleted':'panel.diff.note.modified');
  return file.rows?what:t('panel.diff.note.withBinary',{what});
}
function fileOf(file:CheckpointFileDiff):DiffFile{
  const hunks=(file.rows??[]).flatMap(row=>row.kind==='hunk'?[row.text]:row.kind==='add'?['+'+row.text]:row.kind==='remove'?['-'+row.text]:row.kind==='context'?[' '+row.text]:[]);
  return{path:file.path,add:file.added??0,del:file.removed??0,note:noteOf(file),hunks};
}
/** `records` as sessionCheckpoints gives them (newest first); `turns` your messages, newest first (sessionTurns). */
export async function turnDiffs(store:CheckpointStore,records:readonly CheckpointRecord[],turns:readonly SessionTurn[]):Promise<DiffTurn[]>{
  const rows=records.filter(row=>row.state==='complete'||row.state==='undone').slice(0,TURNS_MAX);
  let model=0;const out:DiffTurn[]=[];
  for(const row of rows){
    let label:string;
    if(row.operation==='shell')label=t('panel.diff.shell');
    else{const turn=turns[model];model+=1;label=turn?turn.text.replace(/\s+/gu,' ').trim():t('panel.diff.aTurn');}
    out.push({label,files:(await checkpointFileDiffs(store,row)).map(fileOf)});
  }
  return out;
}
