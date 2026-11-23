/*
 * Stage 7.4 (the approved mockup's sheets: /history «now · 14 min · 2 h · yesterday · Mon · Sep 27», /resume «now · 2 h ago ·
 * yesterday · Mon · Sep 27»). When something happened, as a person says it: minutes and hours today, «yesterday», the day of
 * the week inside this week (from Monday), then the date. Pure; `now` and the time zone are the caller's (the tests pass both).
 */
import {t} from '../../i18n/index.ts';

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const;
const dayStart=(ms:number,offsetMinutes:number)=>{const local=ms-offsetMinutes*60_000;return local-((local%86_400_000)+86_400_000)%86_400_000;};

/** Stage 7.19 (mockup tasks and notes «today · Sep 27»): the day only — «today», else the date. */
export function panelDay(at:string|number|null|undefined,{now=Date.now(),offsetMinutes=new Date(now).getTimezoneOffset()}:{now?:number;offsetMinutes?:number}={}):string{
  const ms=typeof at==='number'?at:typeof at==='string'?Date.parse(at):Number.NaN;
  if(!Number.isFinite(ms))return '';
  if(dayStart(ms,offsetMinutes)===dayStart(now,offsetMinutes))return t('panel.when.today');
  const local=new Date(ms-offsetMinutes*60_000);
  return `${MONTHS[local.getUTCMonth()]} ${local.getUTCDate()}`;
}
/** `ago` adds the mockup's «ago» to minutes and hours (the /resume list says «2 h ago», /history says «2 h»). */
export function panelWhen(at:string|number|null|undefined,{now=Date.now(),ago=false,offsetMinutes=new Date(now).getTimezoneOffset()}:{now?:number;ago?:boolean;offsetMinutes?:number}={}):string{
  const ms=typeof at==='number'?at:typeof at==='string'?Date.parse(at):Number.NaN;
  if(!Number.isFinite(ms))return '';
  const minutes=Math.floor(Math.max(0,now-ms)/60_000);
  if(minutes<1)return t('panel.when.now');
  const today=dayStart(now,offsetMinutes),day=dayStart(ms,offsetMinutes);
  if(minutes<60)return t(ago?'panel.when.minutesAgo':'panel.when.minutes',{count:minutes});
  if(day===today)return t(ago?'panel.when.hoursAgo':'panel.when.hours',{count:Math.floor(minutes/60)});
  const days=Math.round((today-day)/86_400_000);
  if(days===1)return t('panel.when.yesterday');
  const local=new Date(ms-offsetMinutes*60_000);
  /* the day's name inside this week (from Monday, as the mockup's scene: Friday's list says «Mon», then «Sep 27» for the Sunday
     before), the date before it */
  const weekday=(new Date(today).getUTCDay()+6)%7;
  if(day>=today-weekday*86_400_000)return DAYS[local.getUTCDay()]!;
  return `${MONTHS[local.getUTCMonth()]} ${local.getUTCDate()}`;
}
