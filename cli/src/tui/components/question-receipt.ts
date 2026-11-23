/*
 * Stage 3 (owner 01-02/10, registro 12): what stays in the transcript after the person answers the model's questions, as
 * the approved mockup draws it (`answers` item): «◆ Your answers», then one row per question — its title dim, two spaces,
 * the answer (a skipped question says «skipped»), wrapped under a six-cell indent. Like Claude Code's «User answered
 * Claude's questions» receipt and OpenCode's answered question part: the person's input stays as data for copy and search.
 */
import {t} from '../../i18n/index.ts';
import {displayWidth,splitGraphemes} from '../text-width.ts';

export type AnswerPair={title:string;answer:string};
/* `valuesOnScreenOnly` (review 1, owner 02/10): an MCP form's values are shown during the session but never reach the
   scrollback left at exit — the kernel keeps them out of the history on purpose; only the fields' titles remain. */
export type TranscriptAnswersItem={kind:'answers';id:string;pairs:AnswerPair[];valuesOnScreenOnly?:true};
/* A drawn row: `lead` dim (indent and title), then `text` plain. The header row is `glyph` (accent) and `title` (bold). */
export type AnswersRow={kind:'header';glyph:string;title:string}|{kind:'pair';lead:string;text:string};

const LEAD='    ',CONTINUATION='      ';

function wrap(lead:string,text:string,width:number):AnswersRow[]{
  const rows:AnswersRow[]=[];let currentLead=lead,current='',used=displayWidth(lead);
  for(const word of text.split(/(\s+)/u).filter(Boolean)){
    const w=displayWidth(word);
    if(used+w>width&&current!==''&&!/^\s+$/u.test(word)){rows.push({kind:'pair',lead:currentLead,text:current});currentLead=CONTINUATION;current='';used=displayWidth(CONTINUATION);}
    if(current===''&&/^\s+$/u.test(word)&&rows.length)continue;
    if(used+w>width){let piece='';for(const g of splitGraphemes(word)){if(used+displayWidth(g)>width){rows.push({kind:'pair',lead:currentLead,text:current+piece});currentLead=CONTINUATION;current='';piece='';used=displayWidth(CONTINUATION);}piece+=g;used+=displayWidth(g);}current+=piece;continue;}
    current+=word;used+=w;
  }
  rows.push({kind:'pair',lead:currentLead,text:current});
  return rows;
}

export function answersRows(item:TranscriptAnswersItem,width:number,{unicode}:{unicode:boolean}):AnswersRow[]{
  const limit=Math.max(16,Math.floor(width));
  return[{kind:'header',glyph:unicode?'◆':'*',title:t('screen.question.receipt')},...item.pairs.flatMap(pair=>wrap(`${LEAD}${pair.title}  `,pair.answer,limit))];
}

/** The exit transcript: the plain text, or only the fields' titles when the values are for the screen only. */
export function answersExitText(item:TranscriptAnswersItem):string{
  if(!item.valuesOnScreenOnly)return answersText(item);
  return [t('screen.question.receipt'),...item.pairs.map(pair=>t('screen.elicit.sentField',{field:pair.title}))].join('\n');
}
/** Plain text for copy and search during the session. */
export function answersText(item:TranscriptAnswersItem):string{
  return [t('screen.question.receipt'),...item.pairs.map(pair=>`${pair.title}  ${pair.answer}`)].join('\n');
}
