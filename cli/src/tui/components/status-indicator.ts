import {t,tn} from '../../i18n/index.ts';

/* R3 Q-R3-7: `writing` and `waiting` while a turn runs; `done` / `interrupted` / `failed` after it (gate E7).
   R5a S4: `retrying` while a refused request waits for its next attempt (Q-R5-6). */
/* P14: `agents` while delegated sub-agents work (the parent waits on them; before, that said "thinking"). */
/* Stage 4 (owner 01/10): the status row is the approved mockup's activity line (activity-line.ts); this file keeps the kinds
   and the one word the main roster row says for each (gate E7). */
export type BusyKind='starting'|'thinking'|'writing'|'tool'|'agents'|'waiting'|'retrying'|'compacting'|'connecting'|'updating'|'idle'|'error'|'done'|'interrupted'|'failed';
/** The one word for an activity on the main roster row (gate E7). */
export function activityWord(kind:BusyKind,tool?:string,agents?:number):string{
  if(kind==='agents'&&agents&&agents>0)return tn('screen.busy.agentsCount',agents);
  return kind==='tool'&&tool?t('screen.busy.toolNamed',{tool}):t(`screen.busy.${kind}`);
}
