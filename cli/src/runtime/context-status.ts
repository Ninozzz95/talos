import type {CliCompactionRecovery,CliContextStatus,CliResponseReserve,CliSessionUsage} from './types.ts';

const DEFAULT_TRIGGER_RATIO=0.5;

function finite(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;}
function positive(value:unknown):number|null{const n=finite(value);return n!==null&&n>0?n:null;}
function ratio(value:unknown,fallback:number|null=null):number|null{const n=finite(value);return n!==null&&n>0&&n<1?n:fallback;}
function percent(numerator:number,denominator:number):number{return Math.round((numerator/denominator)*1000)/10;}
function integer(value:unknown):number|null{return Number.isSafeInteger(value)&&Number(value)>=0?Number(value):null;}
function text(value:unknown):string|null{return typeof value==='string'&&value.trim()?value.trim():null;}
function absoluteUtc(value:unknown):string|null{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value))return null;
  const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;
}
function compactionRecovery(value:unknown):CliCompactionRecovery|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const row=value as Record<string,unknown>;
  const failedAt=absoluteUtc(row.failedAt),retryAfter=absoluteUtc(row.retryAfter);
  if(typeof row.code!=='string'||!/^CTX_[A-Z0-9_]+$/u.test(row.code)||!Number.isSafeInteger(row.attempts)||Number(row.attempts)<1||!failedAt||!retryAfter||Date.parse(retryAfter)<=Date.parse(failedAt))return undefined;
  return{code:row.code,attempts:Number(row.attempts),failedAt,retryAfter,actions:['wait','/compact'],manualCost:{usd:null,provenance:'unknown'}};
}

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

/** The last request's categories as the window's five parts, or null unless every count is a real one. */
function lastRequestParts(record:unknown):{parts:NonNullable<CliContextStatus['parts']>;lastRequest:NonNullable<CliContextStatus['lastRequest']>}|null{
  const split=(record as any)?.ripartizione;const rows=Array.isArray(split?.categorie)?split.categorie:null;if(!rows)return null;
  const total:Record<string,number>={system:0,rules:0,memory:0,tools:0,mcp:0,conversation:0};
  for(const row of rows){const tokens=integer(row?.tokens);if(tokens===null||typeof row?.id!=='string'||!Object.hasOwn(total,row.id))return null;total[row.id]!+=tokens;}
  return{parts:{system:total.system!,tools:total.tools!,mcp:total.mcp!,memory:total.memory!+total.rules!,messages:total.conversation!,exact:false},
    lastRequest:{at:absoluteUtc((record as any)?.at),messages:integer(split.messaggi)??0,tools:integer(split.attrezzi)??0}};
}
/** The engine's count for the last request it prepared (talos-composition.ts keeps it), when it is two real counts and something was done. */
function lightenedOf(prepared:unknown):{cleared:number;shortened:number}|null{
  const level=prepared as any;
  if(!level||!Number.isSafeInteger(level.cleared)||!Number.isSafeInteger(level.shortened)||level.cleared<0||level.shortened<0)return null;
  return level.cleared+level.shortened>0?{cleared:level.cleared,shortened:level.shortened}:null;
}
export function buildContextStatus({sessionId,snapshot,sessionUsage,lightened=null,lastRequest=null}:{sessionId:string;snapshot:any;sessionUsage:CliSessionUsage|null;/** the kernel's record of the last request sent (`leggiUltimaRichiesta`): its `ripartizione` by category */lastRequest?:unknown;/** `{cleared,shortened}` of the last request the Context Engine prepared for this conversation, when one is known */lightened?:unknown}):CliContextStatus{
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
  const recovery=compactionRecovery(snapshot.compactionCooling);
  const reserve=reserveEvidence(snapshot.cliReserveEvidence);
  const budget=measurement&&safetyMarginTokens!==null&&inputLimitTokens!==null?{
    windowTokens:measurement.windowTokens,responseReserve:measurement.responseReserve,
    safetyMarginTokens,inputLimitTokens,triggerTokens:Math.floor(inputLimitTokens*triggerRatio),
    estimatedMarginTokens:measurement.estimatedMarginTokens,
    provenance:(profileSource?'model profile: '+profileSource+(profileDate?' ('+profileDate+')':''):measurement.method+' prepared-request measurement')+'; Context Engine effective-input safety budget',
  }:null;
  /* stage 7.11: the kernel's parts of the window (desktop `contestoPerParti`, asked 03/10), read only when it sends them all */
  const rawParts=snapshot.parti&&typeof snapshot.parti==='object'?snapshot.parti:measured?.parti&&typeof measured.parti==='object'?measured.parti:null;
  const partOf=(key:string)=>integer(rawParts?.[key]);
  const parts=rawParts&&['sistema','strumenti','strumentiMcp','memoria','messaggi'].every(key=>partOf(key)!==null)
    ?{system:partOf('sistema')!,tools:partOf('strumenti')!,mcp:partOf('strumentiMcp')!,memory:partOf('memoria')!,messages:partOf('messaggi')!,exact:rawParts.esatto===true}:null;
  /* 14/10/2026 (owner): otherwise the parts of the last request sent (richiesta-del-giro.mjs: an estimate, bytes/3.5); the project's
     rules are memory here, as the mockup's grid has five parts (Claude Code counts CLAUDE.md under memory files too) */
  const sent=parts?null:lastRequestParts(lastRequest);
  return{
    schema:'talos.cli.context-status.v1',sessionId,available:true,reason:measurement?null:'not-measured',
    measurement,budget,...(parts?{parts}:sent?{parts:sent.parts,lastRequest:sent.lastRequest}:{}),...(lightenedOf(lightened)?{lightened:lightenedOf(lightened)!}:{}),
    autoCompaction:{
      enabled:settings.auto===true,
      triggerRatio,triggerPercent:Math.round(triggerRatio*1000)/10,targetRatio,
      provenance:'Context Engine session settings; CLI owner trigger: half the input limit, at most context.compactAtTokens (200,000 by default)',
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
    ...(recovery?{compactionRecovery:recovery}:{}),
    ...(reserve?{reserve}:{}),
  };
}
/** F-001: the reserve's provenance from the composition; anything malformed is left out rather than guessed. */
function reserveEvidence(value:any):CliResponseReserve|null{
  if(!value||typeof value!=='object'||!['setting','model','capped','default'].includes(value.kind))return null;
  const reserveTokens=positive(value.reserveTokens);if(reserveTokens===null)return null;
  const modelMaxOutputTokens=value.modelMaxOutputTokens===null?null:positive(value.modelMaxOutputTokens);
  if(modelMaxOutputTokens===null&&value.modelMaxOutputTokens!==null)return null;
  return{kind:value.kind,reserveTokens,modelMaxOutputTokens};
}
