import {t,tn} from '../../i18n/index.ts';
import type {CliContextStatus} from '../../runtime/types.ts';
import {truncateDisplay} from '../text-width.ts';
import {listOverlay,type OverlayContent} from './scroll-window.ts';

function compact(value:number):string{
  if(value<1000)return String(Math.round(value));
  if(value<1_000_000)return (value/1000).toFixed(1).replace(/\.0$/u,'')+'k';
  return (value/1_000_000).toFixed(1).replace(/\.0$/u,'')+'m';
}
function fit(value:string,width:number){return truncateDisplay(value,Math.max(1,Math.floor(width)));}

export function contextInspectorLines(status:CliContextStatus,{width}:{width:number}):string[]{
  const lines=[t('screen.context.title',{session:status.sessionId})];
  if(!status.available||!status.measurement){
    lines.push(t('screen.context.unmeasured',{reason:status.reason?' · '+status.reason:''}));
    lines.push('Auto compaction · trigger '+status.autoCompaction.triggerPercent+'% policy when a measured profile is available');
  }else{
    const m=status.measurement;
    lines.push('Measured context · '+compact(m.inputTokens)+' / '+compact(m.windowTokens)+' · '+m.percentOfWindow+'% · '+m.method+' measurement · '+(m.exact?'exact':'not exact')+(m.stale?' · stale revision':''));
    lines.push('Budget · window '+compact(m.windowTokens)+' · response reserve '+compact(m.responseReserve)+(status.budget?' · safety margin '+compact(status.budget.safetyMarginTokens)+' · input limit '+compact(status.budget.inputLimitTokens):'')+(status.budget?.estimatedMarginTokens!==null&&status.budget?.estimatedMarginTokens!==undefined?' · estimated count margin '+compact(status.budget.estimatedMarginTokens):'')+' · '+(status.budget?.provenance??'measurement provenance unavailable'));
    if(status.reserve)lines.push(t(`screen.context.reserve.${status.reserve.kind}`,{reserve:compact(status.reserve.reserveTokens),max:status.reserve.modelMaxOutputTokens===null?'?':compact(status.reserve.modelMaxOutputTokens)}));
    lines.push('Auto compaction · '+(status.autoCompaction.enabled?'enabled':'disabled')+' · trigger '+status.autoCompaction.triggerPercent+'% of effective input budget'+(status.budget?' · threshold '+compact(status.budget.triggerTokens):'')+(status.autoCompaction.targetRatio!==null?' · target '+(Math.round(status.autoCompaction.targetRatio*1000)/10)+'%':''));
  }
  if(status.lightened){
    /* owner 13/10/2026: the engine's rules made the request lighter with no model call; said so the drop in used space has a reason */
    const {cleared,shortened}=status.lightened;
    const what=cleared&&shortened?t('screen.context.lightened.both',{cleared:tn('screen.context.lightened.cleared',cleared),shortened:tn('screen.context.lightened.shortenedToo',shortened)})
      :cleared?tn('screen.context.lightened.cleared',cleared):tn('screen.context.lightened.shortened',shortened);
    lines.push(t('screen.context.lightened',{what}));
  }
  if(status.compactionRecovery){
    const recovery=status.compactionRecovery;
    lines.push(t('screen.context.recovery.paused',{code:recovery.code,attempts:recovery.attempts}));
    lines.push(t('screen.context.recovery.retry',{time:recovery.retryAfter}));
    lines.push(t('screen.context.recovery.actions'));
    lines.push(t('screen.context.recovery.cost'));
  }
  lines.push(status.cache.percent===null
    ?'Cache · not measured · '+status.cache.provenance
    :'Cache · '+compact(status.cache.cachedTokens??0)+' / '+compact(status.cache.promptTokens??0)+' prompt tokens · '+status.cache.percent+'% · '+status.cache.provenance);
  lines.push('Cost · '+(status.cost.usd===null?'not reported':'$'+status.cost.usd)+' · '+status.cost.provenance);
  lines.push('Sources · '+(status.sources.activeSourceCount===null?'no active compacted source set':status.sources.activeSourceCount)+(status.sources.summaryCitationCount!==null?' · citations '+status.sources.summaryCitationCount:'')+' · '+status.sources.provenance);
  lines.push(t('screen.center.closes'));
  return lines.map(line=>fit(line,width));
}
// R1 Q-R1-3: the same lines as a capped, scrolling overlay (overlays/scroll-window.ts).
// Unbounded width: the fit wraps each line to the box instead of cutting it, so no measurement is lost off the edge.
export function contextInspectorOverlay(status:CliContextStatus):OverlayContent{
  return listOverlay(contextInspectorLines(status,{width:Number.POSITIVE_INFINITY}),{head:1,list:0,selected:0,foot:1,tones:(_line,index)=>index===0?'accent':'dim'});
}
