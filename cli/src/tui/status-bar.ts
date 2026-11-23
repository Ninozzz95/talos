/*
 * R5a lane S — S1, the ONE status row (owner decisions Q-R5-2 and Q-R5-5; gate E1, E2; R3 Q-R3-13):
 *
 *   Full access · No sandbox · model X · ↑1.2k ↓340 · cached 800 · ctx 3.1k/131k 2% · ~$0.004 · cmp 1 · 3 new
 *
 * It is the Hermes form (`☤ model │ 12.4K/200K │ [bar] 6% │ $0.06`, hermes `website/docs/user-guide/cli.md:149-180`,
 * 2026-09-23; TUI `ui-tui/src/components/appChrome.tsx:197-215, 525-547`, 2026-09-19) plus the two R3 safety labels, which
 * lead the row as they led the old footer. Pure: the facts come from lane R's `usageSnapshot` (runtime/usage-snapshot.ts).
 *
 * E1, no invented number: a window nobody knows is `ctx ?` (never a percentage); an estimate carries `~`; a cost is shown
 * only from a named price source (`~$`, list price), `local` for a local engine, `cost ?` otherwise; token counts nobody
 * reported leave their segment out, one side unknown is `?`.
 * E2, one row: when the row is too wide the segments go in a fixed order — cost, cache, ↑↓, the compaction count, the
 * "N new" count, then the window figure (`ctx 3.1k/131k 2%` → `ctx 2%`), then the model is cut in the middle and last
 * dropped. The context figure (`ctx N%` or `ctx ?`), `Full access` and `No sandbox` are never dropped (Q-R3-13).
 * The percentage is toned as Hermes colours it (50 / 80 / 95, appChrome.tsx:319-334); the number is always there, so a
 * monochrome screen loses nothing.
 */
import {t,tn} from '../i18n/index.ts';
import type {UsageSnapshot} from '../runtime/usage-snapshot.ts';
import {shellSafeText} from './components/terminal-shell.ts';
import {displayWidth,truncateDisplay,truncateMiddle} from './text-width.ts';

export type StatusTone='normal'|'warn'|'high'|'critical';
export type StatusSegmentId='fullAccess'|'noSandbox'|'provider'|'model'|'tokens'|'cached'|'context'|'cost'|'compactions'|'unseen'|'console';
export type StatusSegment={id:StatusSegmentId;text:string;tone:StatusTone};
export type StatusSafety={fullAccess:boolean;noSandbox:boolean};
/** C1R: the provider's verification as the local snapshot (or the last revalidation) holds it — declared, never assumed. */
/* `checking`: the one background check is under way and nothing fresh is known yet (the mockup's «checking…», faint). */
/* `verified` (review of 0.6.2, 13/10/2026, B1): the check's verdict on the key, as the report carries it — `true` accepted, `null`
   nothing to judge (a local engine), `false` reached without the key being judged (a public catalogue). `false` never reads
   «verified», whatever the state. */
export type StatusProviderVerification={id:string;state:'available'|'unavailable'|'unverified';fresh:boolean;verified?:boolean|null;checking?:boolean};
/** The ONE reading the rows share (this row and chrome-rows.ts): which of the mockup's three states is said, and the provider's
 *  name made safe for the terminal like the model next to it (B5: it is the part of the model id before the colon, a person's or a
 *  file's text). «verified» only for available AND fresh AND a key nobody left unjudged; «checking…» only while nothing better is known. */
export function providerBadge(verification:StatusProviderVerification):{kind:'verified'|'checking'|'unverified';text:string}{
  const verified=verification.state==='available'&&verification.fresh===true&&verification.verified!==false;
  const kind=verified?'verified':verification.checking===true?'checking':'unverified';
  const provider=shellSafeText(verification.id);
  return{kind,text:t(kind==='verified'?'screen.statusbar.providerVerified':kind==='checking'?'screen.statusbar.providerChecking':'screen.statusbar.providerUnverified',{provider})};
}
/* `consoleWarnings`: owner decision 02/10, the real warnings and errors the console capture counted (tui/console-capture.ts) */
export type StatusBarInput={snapshot:UsageSnapshot|null;model:string;width:number;safety:StatusSafety;unseen?:number;consoleWarnings?:number;providerVerification?:StatusProviderVerification|null};
export type StatusBar={text:string;segments:StatusSegment[]};

const SEPARATOR=' · ';
/* A model id cut shorter than this says nothing; it is dropped instead. */
const MODEL_MIN=8;
/* The drop order of E2 (first dropped first). `context-window` shortens the context segment; `model` cuts, then drops. */
const DROP_ORDER=['cost','cached','tokens','compactions','unseen','console','context-window','model'] as const;

const count=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;

/** 340 → `340`, 1,200 → `1.2k`, 131,072 → `131k`, 1,500,000 → `1.5m`. */
export function compactTokens(value:number):string{
  const n=Math.max(0,Math.round(value));
  if(n<1000)return String(n);
  if(n<99_950)return `${(n/1000).toFixed(1).replace(/\.0$/u,'')}k`;
  if(n<999_500)return `${Math.round(n/1000)}k`;
  return `${(n/1_000_000).toFixed(1).replace(/\.0$/u,'')}m`;
}
/** A whole percentage; a used window under one percent reads `<1`, never `0` (that would say "empty"). */
export function percentText(percent:number):string{
  if(percent>0&&percent<1)return '<1';
  return String(Math.min(999,Math.round(percent)));
}
/** US dollars at list price: three decimals under a dollar (`0.004`), two above (`1.25`), `<0.001` for dust. */
export function costText(usd:number):string{
  if(usd>0&&usd<0.001)return '<0.001';
  return usd<1?usd.toFixed(3):usd.toFixed(2);
}
/** Hermes's thresholds for the context percentage (50 / 80 / 95). */
export function contextTone(percent:number|null):StatusTone{
  if(percent===null)return 'normal';
  return percent>=95?'critical':percent>=80?'high':percent>=50?'warn':'normal';
}

type Draft=StatusSegment&{short?:string;model?:string};

function contextSegment(snapshot:UsageSnapshot|null):Draft{
  /* R5a wiring: `inputTokens` is the run's total; the context in use is lane R's `contextTokens` (the last request). */
  const window=count(snapshot?.windowTokens),used=count(snapshot?.contextTokens),percent=count(snapshot?.percent);
  if(window===null||window===0||percent===null)return{id:'context',text:t('screen.statusbar.contextUnknown'),tone:'normal'};
  const tilde=snapshot?.estimated?'~':'';
  const short=t('screen.statusbar.contextShort',{percent:`${tilde}${percentText(percent)}`});
  const text=used===null?short:t('screen.statusbar.context',{used:`${tilde}${compactTokens(used)}`,window:compactTokens(window),percent:percentText(percent)});
  return{id:'context',text,short,tone:contextTone(percent)};
}
function tokensSegment(snapshot:UsageSnapshot|null):Draft|null{
  const input=count(snapshot?.inputTokens),output=count(snapshot?.outputTokens);
  if(input===null&&output===null)return null;
  const tilde=snapshot?.estimated?'~':'',unknown=t('screen.statusbar.unknown');
  return{id:'tokens',text:t('screen.statusbar.tokens',{input:input===null?unknown:`${tilde}${compactTokens(input)}`,output:output===null?unknown:`${tilde}${compactTokens(output)}`}),tone:'normal'};
}
function costSegment(snapshot:UsageSnapshot|null):Draft{
  if(snapshot?.local)return{id:'cost',text:t('screen.statusbar.local'),tone:'normal'};
  const usd=count(snapshot?.costUsd),source=typeof snapshot?.costSource==='string'&&snapshot.costSource.trim()?snapshot.costSource:null;
  if(usd===null||source===null)return{id:'cost',text:t('screen.statusbar.costUnknown'),tone:'normal'};
  /* R5a wiring (Q-R5-5, E1): a cost the provider declared is reported, not estimated: no `~`. */
  return{id:'cost',text:t(source==='provider-reported'?'screen.statusbar.costReported':'screen.statusbar.cost',{cost:costText(usd)}),tone:'normal'};
}

/** C1R: available AND fresh AND a key nobody left unjudged is the only thing that may read «verified» (`providerBadge`); stale or not-available reads «not verified». */
function providerSegment(verification:StatusProviderVerification|null|undefined):StatusSegment|null{
  if(!verification)return null;
  const badge=providerBadge(verification);
  return{id:'provider',text:badge.text,tone:badge.kind==='unverified'?'warn':'normal'};
}

function segmentsOf(input:StatusBarInput):Draft[]{
  const {snapshot}=input,model=shellSafeText(input.model);
  const cached=count(snapshot?.cachedTokens),compactions=count(snapshot?.compactions),unseen=count(input.unseen),consoleWarnings=count(input.consoleWarnings);
  const tokens=tokensSegment(snapshot),provider=providerSegment(input.providerVerification);
  return[
    ...(input.safety.fullAccess?[{id:'fullAccess' as const,text:t('screen.footer.fullAccess'),tone:'normal' as const}]:[]),
    ...(input.safety.noSandbox?[{id:'noSandbox' as const,text:t('screen.footer.noSandbox'),tone:'normal' as const}]:[]),
    /* The provider declaration sits with the safety labels and, like them, is never dropped (E2): a busy row
       truncates its tail before it loses the one warning that a provider was never verified. */
    ...(provider?[provider]:[]),
    ...(model?[{id:'model' as const,text:t('screen.statusbar.model',{model}),tone:'normal' as const,model}]:[]),
    ...(tokens?[tokens]:[]),
    ...(cached?[{id:'cached' as const,text:t('screen.statusbar.cached',{count:compactTokens(cached)}),tone:'normal' as const}]:[]),
    contextSegment(snapshot),
    costSegment(snapshot),
    ...(compactions?[{id:'compactions' as const,text:t('screen.statusbar.compactions',{count:compactions}),tone:'normal' as const}]:[]),
    ...(unseen?[{id:'unseen' as const,text:t('screen.footer.unseen',{count:unseen}),tone:'normal' as const}]:[]),
    ...(consoleWarnings?[{id:'console' as const,text:tn('screen.statusbar.console',consoleWarnings),tone:'warn' as const}]:[]),
  ];
}

const joined=(segments:readonly StatusSegment[])=>segments.map(segment=>segment.text).join(SEPARATOR);

/** The status row at `width` columns: never wider, never more than one row, the protected segments always present. */
export function statusBar(input:StatusBarInput):StatusBar{
  const width=Math.max(0,Math.floor(Number(input.width)||0));
  let current:Draft[]=segmentsOf(input);
  const fits=()=>displayWidth(joined(current))<=width;
  for(const step of DROP_ORDER){
    if(fits())break;
    if(step==='context-window'){current=current.map(segment=>segment.id==='context'&&segment.short?{...segment,text:segment.short}:segment);continue;}
    if(step==='model'){
      const model=current.find(segment=>segment.id==='model');if(!model?.model)continue;
      const others=current.filter(segment=>segment!==model);
      const room=width-displayWidth(joined(others))-(others.length?SEPARATOR.length:0)-displayWidth(t('screen.statusbar.model',{model:''}));
      current=room>=MODEL_MIN?current.map(segment=>segment===model?{...segment,text:t('screen.statusbar.model',{model:truncateMiddle(model.model!,room)})}:segment):others;
      continue;
    }
    current=current.filter(segment=>segment.id!==step);
  }
  const segments:StatusSegment[]=current.map(({id,text,tone})=>({id,text,tone}));
  return{text:truncateDisplay(joined(segments),width),segments};
}
