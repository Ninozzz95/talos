/*
 * FE-048, owner 01/11 («Fascia sopra il prompt», in place of his 03/10 choice): what the person queued waits in a band right above the
 * composer, not at the end of the conversation (mockup `righeCoda`). Its head says when it goes and opens the queue; each row shows a
 * message, at most three, and sends it now. Alt+S says itself on the first row, the only one it reaches.
 */
import type {StyledRow,StyledSegment} from '../components/styled-rows.ts';
import {displayWidth,truncateDisplay} from '../text-width.ts';
import {t,tn} from '../../i18n/index.ts';

export type BandEntry={id:string;kind:'prompt'|'command'|'slash';text:string;inTurn?:boolean};
const ROWS_SHOWN=3;
const S=(text:string,role:string|readonly string[],action?:string):StyledSegment=>({text,roles:typeof role==='string'?[role]:role,...(action?{action,element:action}:{})});
const filled=(row:StyledSegment[],width:number):StyledRow=>{const used=displayWidth(row.map(segment=>segment.text).join(''));return used<width?[...row,S(' '.repeat(width-used),'band')]:row;};

export function queueBandRows(entries:readonly BandEntry[],{width,paused=false}:{width:number;paused?:boolean}):StyledRow[]{
  if(!entries.length)return[];
  const when=t(paused?'screen.queue.paused':entries[0]!.inTurn?'screen.queue.afterStep':'screen.queue.atEnd');
  const count=` ${tn('screen.queue.count',entries.length)}`;
  const rows:StyledRow[]=[filled([S(count,['dim','band'],'open:queue'),S(truncateDisplay(` · ${when}`,Math.max(1,width-displayWidth(count))),['faint','band'],'open:queue')],width)];
  entries.slice(0,ROWS_SHOWN).forEach((entry,index)=>{
    /* a command waits for the turn to end: it has no «now» */
    const now=entry.kind==='prompt';const send=`queue:${entry.id}`;
    const tail=now?[...(index===0?[S('  alt+s ',['acc','band'],send)]:[S('  ','band')]),S(t('screen.queue.sendNow'),['faint','band'],send)]:[];
    const tailWidth=displayWidth(tail.map(segment=>segment.text).join(''));
    const text=truncateDisplay(`${entry.kind==='command'?'!':''}${entry.text}`,Math.max(4,width-5-tailWidth));
    rows.push(filled([S('   › ',['acc','band']),S(text,'band','open:queue'),S(' '.repeat(Math.max(0,width-5-displayWidth(text)-tailWidth)),'band'),...tail],width));
  });
  return rows;
}
