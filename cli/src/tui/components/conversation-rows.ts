import {displayWidth,splitGraphemes} from '../text-width.ts';

/*
 * The conversation as the approved mockup draws it (07/10, `buildItemRows`; owner 08/10 «Tutta la conversazione»):
 *   (blank row)
 *    › The login e2e test is flaky. Find out why and fix it.     ← the person's words: ` › ` accent bold, the text bold, both
 *                                                                  on the band colour across the whole width; wrapped rows
 *                                                                  start with three spaces
 *   (blank row)
 *     Sessions refresh in src/auth/session.ts …                  ← the answer: no label, Markdown indented two cells
 * No «You» and no «TALOS» label: the shape says who speaks (Claude Code `>` before the prompt, Codex `›` on a tinted row).
 */
export const PROMPT_LEAD=' › ';
export const PROMPT_CONTINUE='   ';
export const ANSWER_INDENT=2;
/** The rows of a turn under the prompt (calls, notices) stand as far in as the answer. */
export const TURN_INDENT=2;

/** The mockup's `wrap`: by words, a word longer than the row is cut; trailing spaces dropped. Widths are display cells. */
export function wrapWords(text:string,width:number):string[]{
  const limit=Math.max(1,Math.floor(width));const out:string[]=[];
  const cut=(line:string):[string,string]=>{let head='',used=0;const rest:string[]=[];for(const g of splitGraphemes(line)){if(rest.length||used+displayWidth(g)>limit){rest.push(g);continue;}head+=g;used+=displayWidth(g);}return[head,rest.join('')];};
  for(const para of String(text).split(/\r?\n/u)){
    if(!para){out.push('');continue;}
    let line='';
    for(const word of para.split(/(\s+)/u)){
      if(!word)continue;
      if(displayWidth(line+word)>limit&&line.trim()){out.push(line.replace(/\s+$/u,''));line=word.replace(/^\s+/u,'');}
      else line+=word;
      while(displayWidth(line)>limit){const [head,rest]=cut(line);out.push(head);line=rest;}
    }
    out.push(line.replace(/\s+$/u,''));
  }
  return out;
}
/** The person's message: each row with its lead, padded to the width so the band fills it. */
export function promptRows(text:string,width:number):string[]{
  const room=Math.max(1,Math.floor(width)-PROMPT_LEAD.length);
  return wrapWords(text,Math.max(1,Math.floor(width)-4)).map((line,index)=>{const lead=index?PROMPT_CONTINUE:PROMPT_LEAD;return lead+line+' '.repeat(Math.max(0,room-displayWidth(line)));});
}
