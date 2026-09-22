import type {CliContextStatus,CliSessionUsage} from './types.ts';

const DEFAULT_TRIGGER_RATIO=0.5;

function finite(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;}
function positive(value:unknown):number|null{const n=finite(value);return n!==null&&n>0?n:null;}
function ratio(value:unknown,fallback:number|null=null):number|null{const n=finite(value);return n!==null&&n>0&&n<1?n:fallback;}
function percent(numerator:number,denominator:number):number{return Math.round((numerator/denominator)*1000)/10;}
function integer(value:unknown):number|null{return Number.isSafeInteger(value)&&Number(value)>=0?Number(value):null;}
function text(value:unknown):string|null{return typeof value==='string'&&value.trim()?value.trim():null;}

export function unavailableContextStatus(sessionId:string,reason:string):CliContextStatus{
  return{
    schema:'talos.cli.context-status.v1',sessionId,available:false,reason,
    measurement:null,budget:null,
    autoCompaction:{enabled:true,triggerRatio:DEFAULT_TRIGGER_RATIO,triggerPercent:50,targetRatio:null,provenance:'CLI owner policy; active only when Context Engine measurement is available'},
    cache:{promptTokens:null,cachedTokens:null,percent:null,provenance:'not measured'},
    cost:{usd:null,provenance:'not reported by runtime'},
    sources:{activeVersionId:null,activeSourceCount:null,summaryCitationCount:null,provenance:'no measured Context Engine snapshot'},
  };
}

export function buildContextStatus({sessionId,snapshot,sessionUsage}:{sessionId:string;snapshot:any;sessionUsage:CliSessionUsage|null}):CliContextStatus{
  if(!snapshot||typeof snapshot!=='object')return unavailableContextStatus(sessionId,'not-measured');
  const revision=integer(snapshot.revision);
  const measured=snapshot.measurement&&typeof snapshot.measurement==='object'?snapshot.measurement:null;
  const tokens=measured?.tokens&&typeof measured.tokens==='object'?measured.tokens:null;
  const inputTokens=integer(tokens?.inputTokens),windowTokens=positive(tokens?.windowTokens),responseReserve=integer(tokens?.responseReserve);
  const method=['runtime','provider','heuristic'].includes(tokens?.method)?tokens.method as 'runtime'|'provider'|'heuristic':null;
  const measurement=inputTokens!==null&&windowTokens!==null&&responseReserve!==null&&method?{
    inputTokens,windowTokens,responseReserve,
    percentOfWindow:percent(inputTokens,windowTokens),
    method,exact:tokens?.exact===true,
    measuredAt:text(measured?.measuredAt),
    revision:integer(measured?.revision),
    stale:revision!==null&&integer(measured?.revision)!==revision,
    estimatedMarginTokens:integer(tokens?.estimatedMarginTokens),
  }:null;
  const settings=snapshot.settings&&typeof snapshot.settings==='object'?snapshot.settings:{};
  const triggerRatio=ratio(settings.triggerRatio,DEFAULT_TRIGGER_RATIO)??DEFAULT_TRIGGER_RATIO;
  const targetRatio=ratio(settings.targetRatio,null);
  const promptTokens=integer(sessionUsage?.promptTokens);
  const cachedTokens=integer(sessionUsage?.cachedTokens);
  const cacheMeasured=promptTokens!==null&&promptTokens>0&&cachedTokens!==null&&cachedTokens<=promptTokens;
  const active=snapshot.activeVersion&&typeof snapshot.activeVersion==='object'?snapshot.activeVersion:null;
  const sourceIds=Array.isArray(active?.sourceIds)?active.sourceIds:null;
  const citations=Array.isArray(active?.summary?.sources)?active.summary.sources:null;
  const profile=snapshot.cliProfileEvidence&&typeof snapshot.cliProfileEvidence==='object'?snapshot.cliProfileEvidence:null;
  const profileSource=text(profile?.source);
  const profileDate=text(profile?.date);
  const safetyMarginTokens=measurement?Math.max(measurement.method==='heuristic'?1024:256,Math.ceil(measurement.windowTokens*(measurement.method==='heuristic'?0.15:0.05))):null;
  const inputLimitTokens=measurement&&safetyMarginTokens!==null?Math.max(0,measurement.windowTokens-measurement.responseReserve-safetyMarginTokens):null;
  const budget=measurement&&safetyMarginTokens!==null&&inputLimitTokens!==null?{
    windowTokens:measurement.windowTokens,responseReserve:measurement.responseReserve,
    safetyMarginTokens,inputLimitTokens,triggerTokens:Math.floor(inputLimitTokens*triggerRatio),
    estimatedMarginTokens:measurement.estimatedMarginTokens,
    provenance:(profileSource?'model profile: '+profileSource+(profileDate?' ('+profileDate+')':''):measurement.method+' prepared-request measurement')+'; Context Engine effective-input safety budget',
  }:null;
  return{
    schema:'talos.cli.context-status.v1',sessionId,available:true,reason:measurement?null:'not-measured',
    measurement,budget,
    autoCompaction:{
      enabled:settings.auto===true,
      triggerRatio,triggerPercent:Math.round(triggerRatio*1000)/10,targetRatio,
      provenance:'Context Engine session settings; CLI owner trigger policy is 0.50',
    },
    cache:{
      promptTokens,cachedTokens,
      percent:cacheMeasured?percent(cachedTokens!,promptTokens!):null,
      provenance:cacheMeasured?'whole-session measured usage':'not measured',
    },
    cost:{usd:null,provenance:'not reported by runtime'},
    sources:{
      activeVersionId:text(active?.id),
      activeSourceCount:sourceIds?sourceIds.length:null,
      summaryCitationCount:citations?citations.length:null,
      provenance:active?'Context Engine active version':'no active compacted version',
    },
  };
}
