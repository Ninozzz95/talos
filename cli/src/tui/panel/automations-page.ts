/*
 * C9 of the redesign (the mockup's «Automations · runs that start by themselves»): the List with its switch, the next run and the last one,
 * and the runs to review; the Calendar of the next seven days, an hour per cell, each letter a run the kernel already has due. Every
 * figure is read from the store and from the kernel's own schedule (automation-facade.ts `page`); nothing here is guessed.
 */
import {calendarCell,calendarDay,type AutomationCalendar,type AutomationCenterRow} from '../../services/automation-facade.ts';
import {runOutcomeWords,runReasonWords,runTime} from '../../automations/run-words.ts';
import {t,tn,type MessageId} from '../../i18n/index.ts';
import {S,wrap,type PanelItem,type SegRow} from './sheet.ts';
import {truncateMiddle} from '../text-width.ts';

export type AutomationsData={state:'ready'|'invalid';rows:readonly AutomationCenterRow[];error:{code:string;message:string}|null;
  review:readonly any[];runs:ReadonlyMap<string,readonly any[]>;calendar:AutomationCalendar;
  /* Frontend 01/11: the model an automation with none of its own runs with (the host's rule: the configured model, else its default) */defaultModel?:string|null};
export const AUTOMATION_FILTERS=['all','active','paused','review'] as const;
export type AutomationFilter=(typeof AUTOMATION_FILTERS)[number];

/** The runs to review of one automation (their ids), as the kernel's `daGuardare` lists them. */
export const reviewOf=(data:AutomationsData,id:string)=>data.review.filter(run=>run?.automazioneId===id&&typeof run.runId==='string').map(run=>String(run.runId));

/** «in 5 min», «in 7 h», «in 2 days»; a time already passed is «due now». */
export function inWords(at:string|null,now:number):string|null{
  const when=at?Date.parse(at):NaN;if(!Number.isFinite(when))return null;
  const minutes=Math.round((when-now)/60_000);
  if(minutes<=0)return t('panel.automations.overdue');
  if(minutes<60)return t('panel.automations.inMinutes',{count:minutes});
  if(minutes<48*60)return t('panel.automations.inHours',{count:Math.round(minutes/60)});
  return t('panel.automations.inDays',{count:Math.round(minutes/1440)});
}

function metaOf(row:AutomationCenterRow,now:number):string{
  if(row.legacy)return t('panel.automations.oldFormat');
  if(row.running)return t('panel.automations.runningNow');
  if(!row.active)return t('panel.automations.paused');
  const when=inWords(row.nextRunAt,now);if(when)return t('panel.automations.nextIn',{when});
  return(row.plan as {tipo?:string}|null)?.tipo==='manuale'?t('panel.automations.byHand'):'';
}
function lastRunWords(runs:readonly any[]|undefined):string{
  const last=runs?.find(run=>run?.esito&&run.esito!=='partita')??runs?.[0];
  return last?t('panel.automations.lastRun',{outcome:runOutcomeWords(last.esito??last.evento)}):t('panel.automations.neverRan');
}

export function automationItems(data:AutomationsData,now:number):PanelItem[]{
  return data.rows.map(row=>{
    const review=reviewOf(data,row.id).length;
    return{id:row.id,label:row.name,current:row.active&&!row.legacy,meta:metaOf(row,now),desc:[row.schedule,row.legacy?'':lastRunWords(data.runs.get(row.id))].filter(Boolean).join(' · '),
      search:row.instructions??'',...(review?{badge:t('panel.automations.review',{count:review}),badgeRoles:['warn','band']}:{})};
  });
}
/** The filters' tests, each over the row it stands for. */
export function automationMatches(data:AutomationsData,filter:AutomationFilter):(item:PanelItem)=>boolean{
  const byId=new Map(data.rows.map(row=>[row.id,row]));
  if(filter==='active')return item=>Boolean(byId.get(item.id!)?.active)&&!byId.get(item.id!)?.legacy;
  if(filter==='paused')return item=>!byId.get(item.id!)?.active||Boolean(byId.get(item.id!)?.legacy);
  if(filter==='review')return item=>reviewOf(data,item.id!).length>0;
  return()=>true;
}

const localTime=(at:string|null)=>{const when=at?new Date(at):null;return when&&Number.isFinite(when.getTime())?when.toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):null;};

export function automationDetail(data:AutomationsData,id:string|undefined,width:number,now:number):SegRow[]{
  const row=data.rows.find(value=>value.id===id);if(!row)return[];
  const pair=(label:Parameters<typeof t>[0],value:string,roles=''):SegRow=>[S(t(label).padEnd(10),'faint'),S(value,roles)];
  const out:SegRow[]=[[S(row.name,'b')],pair('panel.automations.when',row.schedule)];
  if(row.legacy)return[...out,[S('')],...wrap(t('panel.automations.legacyNote'),width).map(line=>[S(line,'warn')] as SegRow)];
  out.push(pair('panel.automations.status',row.running?t('panel.automations.runningNow'):row.active?t('panel.automations.on'):t('panel.automations.paused'),row.active?'ok':'dim'));
  const next=row.active?localTime(row.nextRunAt):null;if(next)out.push(pair('panel.automations.next',`${next} · ${inWords(row.nextRunAt,now)}`));
  out.push(pair('panel.automations.folder',truncateMiddle(row.folder??'',Math.max(12,width-10))),pair('panel.automations.mode',row.mode?t(`panel.permissions.mode.${row.mode}` as MessageId):''),pair('panel.automations.model',row.model??(data.defaultModel?t('panel.automations.defaultModelIs',{model:data.defaultModel}):t('panel.automations.defaultModel'))));
  if(row.runsLeft!==null)out.push(pair('panel.automations.left',String(row.runsLeft)));
  if(row.instructions)out.push([S('')],[S(t('panel.automations.instructions'),'faint')],...wrap(row.instructions,width).map(line=>[S(line)] as SegRow));
  const toReview=new Set(reviewOf(data,row.id));const runs=data.runs.get(row.id)??[];
  out.push([S('')],[S(t('panel.automations.runs'),'faint')]);
  if(!runs.length)out.push([S(t('panel.automations.noRuns'),'dim')]);
  for(const run of runs.slice(0,5)){
    const words=[localTime(runTime(run))??'?',runOutcomeWords(run.esito??run.evento),run.motivo&&run.motivo!=='fermata'?runReasonWords(run.motivo):null].filter(Boolean).join(' · ');
    out.push([S(toReview.has(String(run.runId))?'! ':'  ','warn'),S(words,toReview.has(String(run.runId))?'':'dim')]);
  }
  if(toReview.size)out.push([S('')],[S(tn('panel.automations.reviewNote',toReview.size),'faint')]);
  return out;
}

/** The letter of the n-th automation drawn: A–Z, then a–z, then #. */
export const calendarLetter=(index:number)=>index<26?String.fromCharCode(65+index):index<52?String.fromCharCode(71+index):'#';

/**
 * The Calendar: a row per day, an hour per cell (as wide as the page allows), a letter where one automation has a run due, `+` where more
 * than one has. Hours already past today are blank; the legend says which letter is which automation and in how many hours it runs.
 */
export function automationCalendarRows(data:AutomationsData,width:number,now:number):SegRow[]{
  const cal=data.calendar;const out:SegRow[]=[...wrap(t('panel.automations.calendar.head'),width-2).map(line=>[S(` ${line}`,'faint')] as SegRow),[S('')]];
  const drawn=cal.rows.filter(row=>row.hours.length);
  if(!drawn.length)return[...out,[S(` ${t('panel.automations.calendar.empty')}`,'dim')]];
  const label=9,cw=Math.max(1,Math.min(4,Math.floor((width-label-1)/24)));const nowHour=calendarCell(cal.from,now);
  const who=new Map<number,number[]>();drawn.forEach((row,index)=>{for(const hour of row.hours)who.set(hour,[...(who.get(hour)??[]),index]);});
  const head:string[]=[];for(let hour=0;hour<24;hour+=cw===1?6:3)head.push(String(hour).padStart(2,'0').padEnd(cw*(cw===1?6:3)));
  out.push([S(' '.repeat(label),'faint'),S(head.join('').trimEnd(),'faint')]);
  for(let day=0;day<cal.days;day+=1){
    const date=calendarDay(cal.from,day);const segs:SegRow=[S(` ${date.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit'})}`.padEnd(label),day===0?'acc':'faint')];
    for(let hour=0;hour<24;hour+=1){
      const at=day*24+hour,here=who.get(at)??[];
      const cell=at<nowHour?' ':here.length>1?'+':here.length?calendarLetter(here[0]!):'·';
      segs.push(S(cell.padEnd(cw),here.length?'acc b':'faint'));
    }
    out.push(segs);
  }
  out.push([S('')]);
  drawn.forEach((row,index)=>{const source=data.rows.find(value=>value.id===row.id);
    out.push([S(` ${tn('panel.automations.calendar.legend',row.hours.length,{letter:calendarLetter(index),name:row.name,when:source?.schedule??''})}`,'dim')]);});
  if([...who.values()].some(list=>list.length>1))out.push([S(` ${t('panel.automations.calendar.many')}`,'faint')]);
  return out;
}
