/*
 * Stage 3, the plan card (owner 02/10, registro 12): what stays in the transcript when the person approves a plan, as the
 * approved mockup draws it (`kind:'plan'`): a blank row, «▣ Plan proposed · N steps» (glyph accent, title bold, count dim),
 * then each step with its number in the accent. Like Claude Code, which keeps the approved plan as a block of the
 * conversation. The steps are the plan's numbered items, else its bullets, else its lines (planSteps).
 */
import {t,tn} from '../../i18n/index.ts';
import {displayWidth,truncateDisplay} from '../text-width.ts';

export type TranscriptPlanItem={kind:'plan';id:string;steps:string[];content:string};
export type PlanReceiptRow={kind:'blank'}|{kind:'header';glyph:string;title:string;count:string}|{kind:'step';number:string;text:string};

/* The steps a Markdown plan lists: its numbered items, else its bullets, else its non-empty lines (headings without #). */
export function planSteps(content:string):string[]{
  const lines=content.replace(/\r\n?/gu,'\n').split('\n');
  const numbered=lines.map(line=>/^\s*\d+[.)]\s+(.*\S)\s*$/u.exec(line)?.[1]).filter((x):x is string=>Boolean(x));
  if(numbered.length)return numbered;
  const bullets=lines.map(line=>/^\s*[-*+]\s+(.*\S)\s*$/u.exec(line)?.[1]).filter((x):x is string=>Boolean(x));
  if(bullets.length)return bullets;
  return lines.map(line=>line.replace(/^#+\s*/u,'').trim()).filter(Boolean);
}

/** The rows at `width` columns; a step longer than the row is cut (the whole plan stays in copy and search). */
export function planReceiptRows(item:TranscriptPlanItem,width:number,{unicode}:{unicode:boolean}):PlanReceiptRow[]{
  const limit=Math.max(16,Math.floor(width));
  return[{kind:'blank'},{kind:'header',glyph:unicode?'▣':'#',title:t('screen.plan.receipt'),count:' · '+tn('screen.plan.steps',item.steps.length)},
    ...item.steps.map((step,index)=>{const number=`    ${index+1}. `;const room=limit-displayWidth(number);
      return{kind:'step' as const,number,text:displayWidth(step)<=room?step:truncateDisplay(step,room)};})];
}

/** Plain text for copy, search and the exit transcript: the header and the plan's steps. */
export function planReceiptText(item:TranscriptPlanItem):string{
  return [`${t('screen.plan.receipt')} · ${tn('screen.plan.steps',item.steps.length)}`,...item.steps.map((step,index)=>`${index+1}. ${step}`)].join('\n');
}
