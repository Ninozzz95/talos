/*
 * Stage 3 (owner 02/10: «dialogo agenti visibile», registro 12): one parent↔child exchange in the transcript, updated in
 * place — «↳ <child's task> asks: …» (or «↳ TALOS asks <task>: …»), then «↳ answer: …» or why it was not answered. Like
 * Claude Code's «Message from @agent» and Codex's last agent message. The agents' words are data: drawn dim, under a lead,
 * never as the person's message. One formatter for the rows, the height and the copy/search text.
 */
import {t,type MessageId} from '../../i18n/index.ts';
import {displayWidth,splitGraphemes} from '../text-width.ts';

export type DialogueDirection='child-to-parent'|'parent-to-child';
export type TranscriptDialogueItem={kind:'dialogue';id:string;childId:string;task:string|null;direction:DialogueDirection;question:string;answer?:string;cancelled?:string};
export type DialogueRow={lead:string;who:string;text:string};

const LEAD='  ↳ ',CONTINUATION='    ';
const CANCELLED:Record<string,MessageId>={'delivery-failed':'screen.dialogue.cancelled.delivery','journal-failed':'screen.dialogue.cancelled.journal'};

function asker(item:TranscriptDialogueItem):string{
  return item.direction==='parent-to-child'
    ?t('screen.dialogue.parentAsks',{agent:item.task??t('screen.dialogue.unnamedObject')})
    :t('screen.dialogue.childAsks',{agent:item.task??t('screen.dialogue.unnamed')});
}
function cancelText(item:TranscriptDialogueItem):string{
  const reason=item.cancelled??'';
  if(reason==='recipient-closing')return t(item.direction==='parent-to-child'?'screen.dialogue.cancelled.recipient':'screen.dialogue.cancelled.parent');
  return t(CANCELLED[reason]??'screen.dialogue.cancelled.other');
}
/* One logical line under its lead, wrapped by words at `width`; a word longer than the row is cut by cells. */
function wrap(lead:string,who:string,text:string,width:number):DialogueRow[]{
  const rows:DialogueRow[]=[];let row:DialogueRow={lead,who,text:''};let used=displayWidth(lead+who);
  for(const word of text.split(/(\s+)/u).filter(Boolean)){
    const w=displayWidth(word);
    if(used+w>width&&row.text.trim()!==''){rows.push(row);row={lead:CONTINUATION,who:'',text:''};used=displayWidth(CONTINUATION);if(/^\s+$/u.test(word))continue;}
    if(used+w>width){for(const g of splitGraphemes(word)){const gw=displayWidth(g);if(used+gw>width){rows.push(row);row={lead:CONTINUATION,who:'',text:''};used=displayWidth(CONTINUATION);}row.text+=g;used+=gw;}continue;}
    row.text+=word;used+=w;
  }
  rows.push(row);
  return rows.map(r=>({...r,text:r.text.trimEnd()}));
}

export function dialogueRows(item:TranscriptDialogueItem,width:number):DialogueRow[]{
  const limit=Math.max(20,Math.floor(width));
  const rows=wrap(LEAD,asker(item),item.question,limit);
  if(item.answer!==undefined)rows.push(...wrap(LEAD,t('screen.dialogue.answer'),item.answer,limit));
  else if(item.cancelled!==undefined)rows.push({lead:LEAD,who:'',text:cancelText(item)});
  return rows;
}

/** Plain text for copy, search and the exit transcript. */
export function dialogueText(item:TranscriptDialogueItem):string{
  const lines=[asker(item)+item.question];
  if(item.answer!==undefined)lines.push(t('screen.dialogue.answer')+item.answer);
  else if(item.cancelled!==undefined)lines.push(cancelText(item));
  return lines.join('\n');
}
