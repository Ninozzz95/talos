/*
 * Stage 7.8 (mockup /undo; owner 03/10 «foglio intero»): the points of this conversation the /undo sheet lists, newest first —
 * every checkpoint, also the turns that changed no file. Each is named after the message that started its turn («Before:
 * <message>», the model's checkpoints matched to your messages from the newest), a shell command's after it, and the oldest
 * one, when it is the conversation's first turn, «Start of the conversation». Each carries the files its own turn changed and
 * the files that go back to how they were (or, on an undone point, come back) — with their lines (checkpoint-delta.ts).
 */
import {t} from '../i18n/index.ts';
import type {SessionTurn} from '../sessions/digest.ts';
import {checkpointDeltas} from '../workspace/checkpoint-delta.ts';
import type {CheckpointRecord,CheckpointStore} from '../workspace/checkpoint-store.ts';
import {undoRange} from './overlays/checkpoint-picker.ts';
import type {UndoPoint} from './panel/commands.ts';

/** At most this many points: the newest; reading their files costs one pass each. */
export const UNDO_POINTS_MAX=50;

/* «The login e2e test is flaky. Find out why and fix it.» → «The login e2e test is flaky…» (the mockup's rows): the first
   sentence when there are more, else the text, cut at 60 */
export function shortMessage(text:string):string{
  const flat=text.replace(/\s+/gu,' ').trim();
  const sentence=/^(.{8,60}?)[.!?](?:\s|$)/u.exec(flat);
  if(sentence&&sentence[0].trim().length<flat.length)return `${sentence[1]}…`;
  const chars=[...flat];return chars.length>60?`${chars.slice(0,59).join('')}…`:flat;
}

/** `records`: this conversation's checkpoints, newest first; `turns`: your messages with their turn, newest first. */
export async function undoPoints(store:CheckpointStore,records:readonly CheckpointRecord[],turns:readonly SessionTurn[]):Promise<UndoPoint[]>{
  const rows=records.filter(row=>row.state==='complete'||row.state==='undone').slice(0,UNDO_POINTS_MAX);
  let model=0;const runs:Array<string|undefined>=[];
  const labels=rows.map(row=>{
    if(row.operation==='shell'){runs.push(undefined);return t('panel.undo.shell');}
    const turn=turns[model];model+=1;runs.push(turn?.runId);
    return turn?t('panel.undo.before',{message:shortMessage(turn.text)}):t('panel.undo.aTurn');
  });
  /* the oldest point is the start when it is the conversation's first turn */
  const startsIt=rows.length>0&&rows.at(-1)!.operation!=='shell'&&model===turns.length;
  const out:UndoPoint[]=[];
  for(const [index,row] of rows.entries()){
    const undone=row.state==='undone';
    const files=await checkpointDeltas(store,[row]);
    const back=await checkpointDeltas(store,undoRange(rows,index).steps);
    const start=startsIt&&index===rows.length-1;
    out.push({id:row.id,...(runs[index]?{runId:runs[index]!}:{}),label:start?t('panel.undo.start'):labels[index]!,at:row.createdAt,undone,...(start?{start:true}:{}),files,back});
  }
  return out;
}
