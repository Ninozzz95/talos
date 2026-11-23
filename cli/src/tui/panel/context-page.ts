/*
 * C4 of the redesign (the mockup's Context Manager, `sezioni-sistema.js`; the PC's words): this chat's context, from the same context service
 * the PC talks to (the composition's `request`). A fixed row over every tab says how full the window is and offers «Compact now». Overview draws
 * the parts; Compactions shows what each one kept; Keep in mind is the facts that stay apart from compaction; Versions and sources goes back
 * to a version; Settings holds only what acts in the CLI: the trigger, the target and the model are the CLI's own, rewritten at every turn
 * (`ensureSettings`), so they are said and not offered. Pure: the data in, rows out. Read once when the page opens and after an action, never
 * on a timer; while a turn runs the fixed row follows the context events the app already receives.
 */
import type {CliContextStatus} from '../../runtime/types.ts';
import {activityClock} from '../activity-line.ts';
import {bar,brailleLine,CHART_FULL,legendRow,squares,stack,type ChartMode,type ChartPart} from '../charts.ts';
import {compactTokens} from '../status-bar.ts';
import {t,tn} from '../../i18n/index.ts';
import {fit,S,wrap,type PanelItem,type SegRow} from './sheet.ts';
import type {RequestSent} from './request-sent.ts';

export type ContextFact={id:string;text:string;status?:string;revision?:number;conflict?:{proposedText?:string}|null};
export type ContextVersion={id:string;model?:{provider?:string;model?:string}|null;createdAt:string;restoredFrom?:string;sourceIds?:readonly string[];coveredThrough?:number;
  measurement?:{inputTokens?:number}|null;summary?:{text?:string}|null;retained?:{personRequests?:{total?:number;kept?:readonly {n:number;text:string}[]}}|null};
export type ContextSettings={auto?:boolean;triggerRatio?:number;targetRatio?:number;retainRecentTurns?:number;focus?:string;model?:{mode?:string;provider?:string;model?:string}};
export type ContextSnapshot={revision:number;settings?:ContextSettings;activeVersion?:{id?:string}|null;facts?:readonly ContextFact[]};
export type ContextPageData={status:CliContextStatus;snapshot:ContextSnapshot|null;versions:readonly ContextVersion[];/* input tokens by turn, an estimate */overTime:readonly number[];now:number;
  /* «Request sent»: the last request as the kernel keeps it; null before the first or when the runtime cannot say */sent?:RequestSent|null};

const PARTS=[['system','s1'],['tools','s2'],['mcp','s3'],['memory','s4'],['messages','s5']] as const;
const partsOf=(status:CliContextStatus)=>status.parts?PARTS.map(([name,color])=>({name:t(`panel.context.part.${name}`),color,value:status.parts![name]})).filter(part=>part.value>0):[];
const share=(value:number,whole:number)=>{const percent=value/(whole||1)*100;return percent>0&&percent<1?'<1%':`${Math.round(percent)}%`;};
const tilde=(status:CliContextStatus)=>status.parts?.exact===false?'~':'';

/** The row over every tab: how full, and the door to Compact now. `asking`: `c` was pressed once. */
export function contextHeadRows(status:CliContextStatus,asking:boolean):SegRow[]{
  const m=status.measurement,rows:SegRow[]=[];
  if(m){
    const trigger=status.autoCompaction.enabled?t('panel.context.compactsAt',{percent:status.autoCompaction.triggerPercent}):t('panel.context.compactsOff');
    rows.push([S(` ${t('panel.context.used',{used:compactTokens(m.inputTokens),window:compactTokens(m.windowTokens)})}`,'b'),S(` · ${m.percentOfWindow}%`,['acc','b']),S(`   ${trigger}`,'faint')]);
  }else rows.push([S(` ${t('panel.context.notMeasured')}`,'dim')]);
  rows.push(asking?[S(` ${t('panel.context.compactAsk')}`,'acc')]:[S(' '),S(` ${t('panel.context.compactNow')} `,['dim','band'],'pkey:c'),S('  c','acc')]);
  rows.push([S('')]);
  return rows;
}

export function contextOverviewRows(data:ContextPageData,width:number,height:number,mode:ChartMode=CHART_FULL):SegRow[]{
  const {status,overTime}=data,m=status.measurement,inner=width-1,out:SegRow[]=[];
  if(!status.available||!m)return[[S(` ${t('panel.context.unavailable')}`,'dim')]];
  const parts=partsOf(status),pieces:ChartPart[]=parts.map(part=>({value:part.value,color:part.color})),barWidth=Math.min(inner-2,64);
  if(parts.length)out.push(stack(pieces,barWidth,{total:m.windowTokens},mode));
  else out.push(bar(m.inputTokens,m.windowTokens,barWidth,{},mode));
  out.push([S(t('panel.context.reserved',{tokens:compactTokens(m.responseReserve)}),'faint')],[S('')]);
  const legend=parts.map(part=>legendRow(part.color,part.name,`${tilde(status)}${compactTokens(part.value)}`,share(part.value,m.windowTokens),Math.min(36,inner),mode));
  if(inner>=60&&height>=14&&parts.length){
    const cols=inner>=74?20:15,cells=squares(pieces,m.windowTokens,{cols,rows:6},mode);
    cells.forEach((row,i)=>out.push([...row,S('  '),...(legend[i]??[])]));
  }else out.push(...legend);
  const room=height-out.length-2;
  if(overTime.length>1&&room>=4){
    out.push([S('')],[S(t('panel.context.overTime'),'b'),S(`  ${tn('panel.context.turns',overTime.length)}`,'faint')]);
    out.push(...brailleLine(overTime,Math.min(inner,64),Math.min(4,room-2),{role:'acc',fill:true},mode));
  }
  return out.map(row=>fit([S(' '),...row],width));
}

const modelName=(version:ContextVersion)=>version.model?.model??t('panel.context.modelUnknown');
const ago=(createdAt:string,now:number)=>activityClock(Math.max(0,now-Date.parse(createdAt)));
const after=(version:ContextVersion)=>typeof version.measurement?.inputTokens==='number'?t('panel.context.tokensAfter',{tokens:compactTokens(version.measurement.inputTokens)}):'';

/** Oldest is the first compaction: the numbers stay when a new one arrives. A restored version is not a compaction. */
export function contextCompactionItems(versions:readonly ContextVersion[],now:number):PanelItem[]{
  const made=versions.filter(version=>!version.restoredFrom);
  return made.map((version,i)=>({id:version.id,label:t('panel.context.compactionName',{n:made.length-i}),meta:modelName(version),desc:[after(version),t('panel.context.ago',{time:ago(version.createdAt,now)})].filter(Boolean).join(' · ')}));
}

export function contextVersionItems(versions:readonly ContextVersion[],activeId:string|null,now:number):PanelItem[]{
  return versions.map((version,i)=>({id:version.id,label:t(version.restoredFrom?'panel.context.versionRestored':'panel.context.versionName',{n:versions.length-i}),meta:t('panel.context.ago',{time:ago(version.createdAt,now)}),current:version.id===activeId,
    desc:[after(version),tn('panel.context.sources',version.sourceIds?.length??0)].join(' · ')}));
}

/** What a version kept: the person's requests it holds by number, then the summary. */
export function contextKeptRows(version:ContextVersion,width:number):SegRow[]{
  const out:SegRow[]=[],kept=version.retained?.personRequests;
  if(kept?.kept?.length){
    out.push([S(t('panel.context.keptRequests',{kept:kept.kept.length,total:kept.total??kept.kept.length}),'faint')]);
    for(const request of kept.kept)out.push(...wrap(`${request.n}. ${request.text}`,width).map(line=>[S(line)] as SegRow));
    out.push([S('')]);
  }
  if(version.summary?.text){out.push([S(t('panel.context.summary'),'faint')],...wrap(version.summary.text,width).map(line=>[S(line,'dim')] as SegRow));}
  return out.length?out:[[S(t('panel.context.keptUnknown'),'dim')]];
}

export function contextFactItems(facts:readonly ContextFact[]):PanelItem[]{
  return facts.filter(fact=>fact.status!=='removed').map(fact=>({id:fact.id,label:fact.status==='conflict'&&fact.conflict?.proposedText?fact.conflict.proposedText:fact.text,...(fact.status==='conflict'?{badge:t('panel.context.proposed'),badgeRoles:['warn','band']}:{})}));
}

/** The figures of the Settings tab the CLI decides by itself: said, not offered. */
export function contextOwnSettingsRows(settings:ContextSettings|undefined,status:CliContextStatus):SegRow[]{
  const model=settings?.model?.mode==='explicit'?settings.model.model??'':t('panel.context.followChat');
  return[[S('')],[S(`   ${t('panel.context.setByCli',{trigger:status.autoCompaction.triggerPercent,model})}`,'faint')]];
}
