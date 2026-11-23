/*
 * C6 of the redesign: a session's state, by the PC's own cascade (`statoSessione`, session-item.js) on the fields of its row: the first that
 * holds wins. Whoever waits for the person comes first, even after a restart, because the question can still be answered; then one nobody runs
 * any more, which must come before «still open» (a killed session is `conclusa:false` and `interrotta:true`). A finished turn that failed is
 * «To resume» (owner 24/10: the last turn in error does not judge the chat); one stopped on purpose is concluded. The words are those of the
 * filters, on every surface: a row never says a state that no filter holds.
 */
import {t,type MessageId} from '../i18n/index.ts';

export type SessionState='waiting'|'interrupted'|'progress'|'toResume'|'concluded'|'unknown';
export type SessionStateRow={outcome?:string|null;interrupted?:boolean;waiting?:boolean;open?:boolean;agentsWorking?:number};

export function sessionState(row:SessionStateRow):SessionState{
  if(row.waiting)return'waiting';
  if(row.interrupted||row.outcome==='interrupted')return'interrupted';
  if(row.open||row.outcome==='running'||(row.agentsWorking??0)>0)return'progress';
  if(row.outcome==='failed')return'toResume';
  if(row.outcome==='completed'||row.outcome==='stopped')return'concluded';
  return'unknown';
}

/** The filters, in the PC's order. */
export const SESSION_FILTERS:readonly SessionState[]=['progress','waiting','concluded','toResume','interrupted'];
export const sessionStateWord=(state:SessionState):MessageId=>`screen.session.state.${state}` as MessageId;
/** In a row the word runs inside a sentence, as the mockup's `paroleStato`: «in progress · 1m». */
export const sessionStateText=(state:SessionState):string=>t(sessionStateWord(state)).toLowerCase();
/** The mark and its role; `glyph` turns while a session is at work. */
const LOOK:Record<SessionState,readonly [string,string,string]>={waiting:['?','?','warn'],interrupted:['✗','x','dim'],progress:['⠿','*','acc'],toResume:['↻','~','warn'],concluded:['✓','v','ok'],unknown:['·','.','faint']};
export function sessionMark(state:SessionState,{glyph,unicode=true}:{glyph?:string;unicode?:boolean}={}):[string,string]{
  const [mark,ascii,role]=LOOK[state];
  return[state==='progress'&&glyph?glyph:unicode?mark:ascii,role];
}
