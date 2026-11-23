/*
 * R5a lane S — S1 data wiring and the `/usage` view (owner decisions Q-R5-2, Q-R5-5, Q-R5-8; gate E1).
 *
 * `usageFacts` asks lane R's two frozen contracts — `modelProfile({provider,model})` and
 * `usageSnapshot({state,contextStatus,profile})` — for what the status row and `/usage` show. Before R5a the layout replaced
 * the turn's usage with the context status (`layoutState={...state,usage:contextStatus??state.usage}`, app.ts:1564 at
 * 4676d2f59), so a reported `1200 in / 340 out` never reached the screen (gate finding 1); both now go to the snapshot.
 * A contract body that throws is a figure nobody knows, never a crash of the screen (E1: unknown stays unknown).
 * `/usage` is a view (Q-R5-8: it runs at once during a turn): tokens, the window with its source and date, the cost with
 * its source or `cost unknown`, and the compaction count with the rule that produced it (E9: the 50 % threshold is stated
 * where the window is known).
 */
import {t,type MessageId} from '../i18n/index.ts';
import {CONTEXT_ENGINE_MIN_WINDOW,modelProfile,type ModelProfile} from '../runtime/model-profile.ts';
import {usageSnapshot,type UsageSnapshot} from '../runtime/usage-snapshot.ts';
import {shellSafeText} from './components/terminal-shell.ts';
import {compactTokens,costText,percentText} from './status-bar.ts';

export type UsageFacts={snapshot:UsageSnapshot|null;profile:ModelProfile|null};

/** `ollama:qwen3` → {provider:'ollama',model:'qwen3'}; the part after the first colon is the provider's own model id (the
 *  shape runtime/talos-composition.ts `profileForSelection` matches). A sentinel (`none · /provider`) has no provider. */
export function splitModelId(id:string):{provider:string;model:string}|null{
  const text=String(id??''),at=text.indexOf(':');
  if(at<=0||at===text.length-1||/\s/u.test(text))return null;
  return{provider:text.slice(0,at),model:text.slice(at+1)};
}

export function usageFacts({model,usage,contextStatus,compactions=0}:{model:string;usage:unknown;contextStatus:unknown;compactions?:number}):UsageFacts{
  let profile:ModelProfile|null=null;
  const selected=splitModelId(model);
  try{profile=selected?modelProfile(selected):null;}catch{profile=null;}
  let snapshot:UsageSnapshot|null=null;
  try{snapshot=usageSnapshot({state:{usage,compactions},contextStatus,profile,model});}catch{snapshot=null;}
  return{snapshot,profile};
}

const number=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const full=(value:number)=>new Intl.NumberFormat('en-US').format(Math.round(value));

function sourceWords(profile:ModelProfile|null):string{
  if(!profile)return t('screen.usageView.sourceUnnamed');
  const id=`screen.usageView.source.${profile.source}`;
  const named=['registry','provider','ollama-show','override','models.dev'].includes(profile.source)?t(id as MessageId):t('screen.usageView.sourceUnnamed');
  return profile.date?t('screen.usageView.sourceDated',{source:named,date:shellSafeText(profile.date)}):named;
}

/** The `/usage` block. Every figure nobody reported says so; nothing is computed here that lane R did not provide. */
export function usageViewText({model,facts}:{model:string;facts:UsageFacts}):string{
  const {snapshot,profile}=facts;
  const estimated=(text:string)=>snapshot?.estimated?t('screen.usageView.estimated',{text}):text;
  const input=number(snapshot?.inputTokens),output=number(snapshot?.outputTokens),cached=number(snapshot?.cachedTokens);
  const unknown=t('screen.statusbar.unknown');
  const tokens=input===null&&output===null?t('screen.usageView.tokensUnknown'):estimated(cached
    ?t('screen.usageView.tokensCached',{input:input===null?unknown:full(input),output:output===null?unknown:full(output),cached:full(cached)})
    :t('screen.usageView.tokens',{input:input===null?unknown:full(input),output:output===null?unknown:full(output)}));
  const window=number(snapshot?.windowTokens),percent=number(snapshot?.percent),inUse=number(snapshot?.contextTokens);
  const context=window===null||window===0?t('screen.usageView.contextUnknown')
    :inUse===null||percent===null?t('screen.usageView.contextUsedUnknown',{window:compactTokens(window),source:sourceWords(profile)})
    :t('screen.usageView.context',{used:estimated(full(inUse)),window:full(window),percent:percentText(percent),source:sourceWords(profile)});
  const usd=number(snapshot?.costUsd),costSource=typeof snapshot?.costSource==='string'&&snapshot.costSource.trim()?shellSafeText(snapshot.costSource):null;
  const cost=snapshot?.local?t('screen.usageView.local'):usd!==null&&costSource?t('screen.usageView.cost',{cost:costText(usd),source:costSource}):t('screen.usageView.costUnknown');
  const compactions=number(snapshot?.compactions)??0;
  const rule=window&&window>=CONTEXT_ENGINE_MIN_WINDOW?t('screen.usageView.compactionsEarly',{count:compactions}):window?t('screen.usageView.compactionsSmallWindow',{count:compactions}):t('screen.usageView.compactionsKernel',{count:compactions});
  return t('screen.usageView.block',{model:shellSafeText(model),tokens,context,cost,compactions:rule});
}

/** R5a (owner 2026-09-24): said once per model when its known window is below the Context Engine's 64k; null otherwise. */
export function smallWindowNotice(profile:ModelProfile|null,model:string):string|null{
  if(!profile||profile.windowTokens>=CONTEXT_ENGINE_MIN_WINDOW)return null;
  return t('screen.context.smallWindow',{model:shellSafeText(model),window:compactTokens(profile.windowTokens),min:compactTokens(CONTEXT_ENGINE_MIN_WINDOW)});
}
