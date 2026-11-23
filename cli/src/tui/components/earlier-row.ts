import {tn} from '../../i18n/index.ts';
import {truncateDisplay} from '../text-width.ts';

/*
 * Long chats, tappa D (owner 07/10 night): the one dim row at the top of a conversation whose beginning is not on the list yet - after a resume
 * (only the last turns are drawn) or after a long session passed the cap. A click on it, or scrolling up once the view is at the top, loads a page
 * (transcript-model.ts `revealEarlier`). It says messages when there are any, items otherwise (a run of tool rows with no prompt in it).
 */
export function earlierRowText(row:{items:number;messages:number},width:number):string{
  const text=row.messages>0?tn('screen.transcript.earlierUnloaded',row.messages):tn('screen.transcript.earlierUnloadedItems',row.items);
  return truncateDisplay(text,Math.max(1,Math.floor(width)));
}
