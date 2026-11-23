/*
 * C5 of the redesign (the mockup's «Costi e consumo», `sezioni-sistema.js`): what this project spent through the CLI, from the record
 * of its turns (sessions/usage-record.ts). The title says CLI, because the record is the CLI's alone and must not pass for the whole
 * bill. Three views: By day (stacked columns, ←/→ choose the day, its detail below), By model (a bar and a sparkline each), Calendar (a
 * square a day). Two weeks on the charts, at most 60 days on the calendar. No row for the ChatGPT plan: OpenAI does not give the figure,
 * and an estimate has no place here. Pure: the history in, rows out; the file is read once, when the page opens.
 */
import {bar,calendar,CHART_FULL,legendRow,sparkline,stackedColumns,type ChartMode,type ChartPart} from '../charts.ts';
import {compactTokens} from '../status-bar.ts';
import {t,tn} from '../../i18n/index.ts';
import type {UsageDay,UsageHistory} from '../../sessions/usage-record.ts';
import {fit,S,type SegRow} from './sheet.ts';
import {displayWidth,truncateDisplay} from '../text-width.ts';

export const USAGE_CHART_DAYS=14;
const CALENDAR_WEEKS=9;
const SERIES=['s1','s2','s3','s4','s5'] as const,OTHER='s6';
type Series={name:string;color:string;tokens:(day:UsageDay)=>number};

/** Who has a colour: the models that spent most, and the rest in one series so that a day always adds up. */
function seriesOf(history:UsageHistory):Series[]{
  const named=history.models.slice(0,SERIES.length),rest=history.models.slice(SERIES.length);
  const out:Series[]=named.map((name,i)=>({name,color:SERIES[i]!,tokens:day=>day.byModel[name]??0}));
  if(rest.length)out.push({name:t('panel.usage.otherModels'),color:OTHER,tokens:day=>rest.reduce((sum,name)=>sum+(day.byModel[name]??0),0)});
  return out;
}
const lastDays=(history:UsageHistory,count=USAGE_CHART_DAYS)=>history.days.slice(-count);
const percent=(part:number,whole:number)=>`${Math.round(part/(whole||1)*100)}%`;
const money=(usd:number|null)=>usd===null?'':t('panel.usage.cost',{cost:usd.toFixed(2)});
const dateOf=(date:string)=>{const [year,month,day]=date.split('-').map(Number);return new Date(year!,month!-1,day!);};
const dayName=(date:string)=>dateOf(date).toLocaleDateString('en',{weekday:'short',day:'numeric',month:'short'});
const pad=(text:string,size:number)=>text+' '.repeat(Math.max(0,size-displayWidth(text)));
const fitted=(rows:readonly SegRow[],width:number)=>rows.map(row=>fit(row,width));

/** ←/→ on By day: the chosen day stays inside the two weeks of the chart; a click names the day itself. */
export function usageDayStep(day:number,key:string,total:number):number{
  const first=Math.max(0,total-USAGE_CHART_DAYS),last=total-1;
  if(key==='ArrowLeft')return Math.max(first,day-1);
  if(key==='ArrowRight')return Math.min(last,day+1);
  const clicked=/^uday:(\d+)$/u.exec(key);
  return clicked?Math.max(first,Math.min(last,Number(clicked[1]))):day;
}

export function usageByDayRows(history:UsageHistory,day:number,width:number,height:number,mode:ChartMode=CHART_FULL):SegRow[]{
  const series=seriesOf(history),wide=Math.max(2,Math.min(6,Math.floor((width-4)/USAGE_CHART_DAYS)-1));
  const count=Math.min(USAGE_CHART_DAYS,Math.floor((width-4)/(wide+1))),shown=lastDays(history,count),base=history.days.length-shown.length;
  const totals=lastDays(history).map(row=>row.tokens),peak=Math.max(...totals),average=totals.reduce((sum,n)=>sum+n,0)/(totals.length||1);
  const tall=Math.max(4,Math.min(14,height-12)),chosen=Math.max(base,day),row=history.days[chosen]!;
  const out:SegRow[]=[[S(` ${t('panel.usage.byDayTitle')}`,'b'),S(`  ${t('panel.usage.byDayFacts',{peak:compactTokens(peak),average:compactTokens(Math.round(average))})}`,'faint')],[S('')]];
  const parts:ChartPart[][]=shown.map(item=>series.map(one=>({value:one.tokens(item),color:one.color})));
  for(const chart of stackedColumns(parts,tall,{wide,gap:1,action:'uday',base},mode))out.push([S('  '),...chart]);
  out.push([S('  '),...shown.map((item,i)=>{const mine=base+i===chosen;return S(pad(mine?(mode.unicode?'▲':'^'):String(dateOf(item.date).getDate()),wide+1),mine?'acc b':'faint',`uday:${base+i}`);})]);
  out.push([S('')]);
  const facts=[t('panel.usage.tokens',{tokens:compactTokens(row.tokens)}),row.sessions.length?tn('panel.usage.sessions',row.sessions.length):'',row.turns?tn('panel.usage.turns',row.turns):'',money(row.usd)].filter(Boolean).join(' · ');
  out.push([S(`  ${dayName(row.date)}`,'acc b'),S(`  ${facts}`,'dim')]);
  if(row.tokens)for(const one of series){const value=one.tokens(row);if(value)out.push([S('  '),...legendRow(one.color,one.name,compactTokens(value),percent(value,row.tokens),36,mode)]);}
  return fitted(out,width);
}

export function usageByModelRows(history:UsageHistory,width:number,mode:ChartMode=CHART_FULL):SegRow[]{
  const shown=lastDays(history),series=seriesOf(history).map(one=>({...one,values:shown.map(one.tokens)})).map(one=>({...one,total:one.values.reduce((sum,n)=>sum+n,0)})).filter(one=>one.total>0);
  const all=series.reduce((sum,one)=>sum+one.total,0),barWidth=Math.max(8,Math.min(width-38,40));
  const out:SegRow[]=[[S(` ${t('panel.usage.byModelTitle')}`,'b'),S(`  ${t('panel.usage.twoWeeks')}`,'faint')],[S('')]];
  for(const one of series){
    out.push([S(`  ${pad(truncateDisplay(one.name,16),17)}`),...bar(one.total,all,barWidth,{color:one.color},mode),S(`  ${compactTokens(one.total).padStart(6)}  ${percent(one.total,all).padStart(4)}`,'dim')]);
    out.push([S(`  ${pad('',17)}`),sparkline(one.values,{role:`f:${one.color}`},mode),S(`  ${t('panel.usage.peak',{peak:compactTokens(Math.max(...one.values))})}`,'faint')],[S('')]);
  }
  const facts=[tn('panel.usage.sessions',new Set(shown.flatMap(day=>day.sessions)).size),tn('panel.usage.turns',shown.reduce((sum,day)=>sum+day.turns,0))];
  const spent=shown.flatMap(day=>day.usd===null?[]:[day.usd]);
  if(spent.length)facts.push(money(spent.reduce((sum,usd)=>sum+usd,0)));
  out.push([S(`  ${facts.join(' · ')}`,'faint')]);
  return fitted(out,width);
}

/** The squares run by week from Monday, so the columns are true weeks; the days after today stay empty. */
export function usageCalendarValues(days:readonly UsageDay[],weeks:number,now:Date):number[]{
  const tokens=new Map(days.map(day=>[day.date,day.tokens]));
  const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(now.getDay()+6)%7-(weeks-1)*7);
  return Array.from({length:weeks*7},(_,i)=>{
    const day=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i);
    const date=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
    return tokens.get(date)??0;
  });
}

export function usageCalendarRows(history:UsageHistory,width:number,now:Date,mode:ChartMode=CHART_FULL):SegRow[]{
  const weeks=Math.max(1,Math.min(CALENDAR_WEEKS,Math.floor((width-8)/2)));
  const heat=(share:number)=>share<.34?'s4':share<.67?'s3':'s1';
  const out:SegRow[]=[[S(` ${t('panel.usage.calendarTitle')}`,'b'),S(`  ${tn('panel.usage.weeks',weeks)} · ${t('panel.usage.eachSquare')}`,'faint')],[S('')]];
  for(const row of calendar(usageCalendarValues(history.days,weeks,now),weeks,{heat},mode))out.push([S('  '),...row]);
  out.push([S('')]);
  if(mode.color)out.push([S(`  ${t('panel.usage.less')} `,'faint'),...['s4','s3','s1'].flatMap(color=>[S('  ',`g:${color}`),S(' ')]),S(t('panel.usage.more'),'faint')]);
  return fitted(out,width);
}

export const usageEmptyRows=(width:number):SegRow[]=>[[S('')],fit([S(`  ${t('panel.usage.empty')}`,'dim')],width)];
