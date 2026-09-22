import type {CliContextStatus} from '../../runtime/types.ts';
import {truncateDisplay} from '../text-width.ts';

function compact(value:number):string{
  if(value<1000)return String(Math.round(value));
  if(value<1_000_000)return (value/1000).toFixed(1).replace(/\.0$/u,'')+'k';
  return (value/1_000_000).toFixed(1).replace(/\.0$/u,'')+'m';
}
function fit(value:string,width:number){return truncateDisplay(value,Math.max(1,Math.floor(width)));}

export function contextInspectorLines(status:CliContextStatus,{width}:{width:number}):string[]{
  const lines=['Context · '+status.sessionId];
  if(!status.available||!status.measurement){
    lines.push('Prepared context measurement unavailable'+(status.reason?' · '+status.reason:'')+'.');
    lines.push('Auto compaction · trigger '+status.autoCompaction.triggerPercent+'% policy when a measured profile is available');
  }else{
    const m=status.measurement;
    lines.push('Measured context · '+compact(m.inputTokens)+' / '+compact(m.windowTokens)+' · '+m.percentOfWindow+'% · '+m.method+' measurement · '+(m.exact?'exact':'not exact')+(m.stale?' · stale revision':''));
    lines.push('Budget · window '+compact(m.windowTokens)+' · response reserve '+compact(m.responseReserve)+(status.budget?' · safety margin '+compact(status.budget.safetyMarginTokens)+' · input limit '+compact(status.budget.inputLimitTokens):'')+(status.budget?.estimatedMarginTokens!==null&&status.budget?.estimatedMarginTokens!==undefined?' · estimated count margin '+compact(status.budget.estimatedMarginTokens):'')+' · '+(status.budget?.provenance??'measurement provenance unavailable'));
    lines.push('Auto compaction · '+(status.autoCompaction.enabled?'enabled':'disabled')+' · trigger '+status.autoCompaction.triggerPercent+'% of effective input budget'+(status.budget?' · threshold '+compact(status.budget.triggerTokens):'')+(status.autoCompaction.targetRatio!==null?' · target '+(Math.round(status.autoCompaction.targetRatio*1000)/10)+'%':''));
  }
  lines.push(status.cache.percent===null
    ?'Cache · not measured · '+status.cache.provenance
    :'Cache · '+compact(status.cache.cachedTokens??0)+' / '+compact(status.cache.promptTokens??0)+' prompt tokens · '+status.cache.percent+'% · '+status.cache.provenance);
  lines.push('Cost · '+(status.cost.usd===null?'not reported':'$'+status.cost.usd)+' · '+status.cost.provenance);
  lines.push('Sources · '+(status.sources.activeSourceCount===null?'no active compacted source set':status.sources.activeSourceCount)+(status.sources.summaryCitationCount!==null?' · citations '+status.sources.summaryCitationCount:'')+' · '+status.sources.provenance);
  lines.push('Esc / Enter / q closes');
  return lines.map(line=>fit(line,width));
}
