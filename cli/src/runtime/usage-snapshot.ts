/*
 * R5 CONTRACT (owner: lane R; stub written by the coordinator so both lanes compile). Owner decisions Q-R5-2/4/5: the one
 * status row shows `model · ↑in ↓out · ctx used/window % · ~$cost · cmp N`. usageSnapshot turns the turn's reported usage,
 * the context status and the model profile into those facts. Unknown stays unknown (`null`, never 0 or a guess, gate E1);
 * `estimated` marks a figure that was estimated rather than reported; `costUsd` only with a named price source
 * (`costSource`), `local` engines have no price. Lane S only CALLS it and draws the row (new `tui/status-bar.ts`); lane R owns
 * the body and may not change the signature.
 *
 * R5a lane R — the body, built on the shapes MEASURED through the real composition (r5a-r-usage-shapes.test.ts, 2026-09-24):
 * - `usage.updated` carries the RUN's running total, `{prompt_tokens, completion_tokens, cached_tokens, turns}`
 *   (talosHarness.mjs `conto`, agent-service.mjs `eventoPerUsage`); it restarts at every run. That is `↑in ↓out`.
 * - each model request's own usage arrives as the kernel's `CUSTOM consumo-fornitore` (runtime-owner-adapter.mjs:978, with the
 *   provider, the model, the provider's `usage` and, when the provider declares one, its cost); the event adapter folds the
 *   last one into the usage value as `lastRequest`, and the run's declared costs as `declaredCostUsd`.
 * - the context in use is what the last request carried plus what it answered (Pi `calculateContextTokens`: `totalTokens`, or
 *   input + output, packages/coding-agent/docs/compaction.md, 2026-09-24): reported, not estimated. When the Context Engine
 *   has measured the prepared request (`contextStatus.measurement`), that measurement is used instead, `estimated` when its
 *   method is the heuristic.
 * - `percent` exists only with a window (a profile, or the engine's measurement). No window, no percent: the screen says `ctx ?`.
 * - cost: a cost the provider declared for this run's requests is used as reported (`costSource: 'provider-reported'`);
 *   otherwise the list price of a NAMED source (`modelPrice`: the registry's dated rows, a live model list, models.dev with
 *   its date), cached input at the cache-read price when one is listed — an ESTIMATE, which the screen marks `~` (Q-R5-5);
 *   otherwise null. A local engine (`isLocalProvider`) has no price: `local:true`, cost null.
 * - `compactions`: the count lane S keeps from `context.compacted` events, passed as `state.compactions`; 0 when none.
 * Optional additions to the frozen shape (stated in the hand-back): the input's `model?` and `state.compactions?`, and the
 * output's `contextTokens?` (the used figure the row prints before the window).
 */
import {isLocalProvider,modelPrice,splitModelId,type ModelProfile} from './model-profile.ts';

export type UsageSnapshot={
  inputTokens:number|null;outputTokens:number|null;cachedTokens:number|null;
  windowTokens:number|null;percent:number|null;estimated:boolean;
  costUsd:number|null;costSource:string|null;local:boolean;
  compactions:number;
  /** R5a lane R (optional addition): the context in use, the figure before the window in `ctx 3.1k/131k`. */
  contextTokens?:number|null;
};

function objectValue(value:unknown):Record<string,any>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:null;}
function count(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;}
function first(...values:unknown[]):number|null{for(const value of values){const n=count(value);if(n!==null)return n;}return null;}

export function usageSnapshot(input:{state:{usage:unknown;compactions?:number};contextStatus:unknown;profile:ModelProfile|null;model?:string|null}):UsageSnapshot{
  const usage=objectValue(input?.state?.usage);
  const last=objectValue(usage?.lastRequest);
  const inputTokens=first(usage?.prompt_tokens,usage?.promptTokens,usage?.input_tokens,usage?.inputTokens);
  const outputTokens=first(usage?.completion_tokens,usage?.completionTokens,usage?.output_tokens,usage?.outputTokens);
  const cachedTokens=first(usage?.cached_tokens,usage?.cachedTokens,usage?.prompt_tokens_details?.cached_tokens);
  const turns=first(usage?.turns,usage?.giri);

  const status=objectValue(input?.contextStatus);
  const measurement=status?.available===true?objectValue(status.measurement):null;
  const measured=measurement&&measurement.stale!==true&&count(measurement.inputTokens)!==null?measurement:null;

  let contextTokens:number|null=null;let estimated=false;
  if(measured){contextTokens=count(measured.inputTokens);estimated=measured.exact!==true||measured.method==='heuristic';}
  else if(last&&count(last.inputTokens)!==null){contextTokens=count(last.inputTokens)!+(count(last.outputTokens)??0);}
  else if(turns===1&&inputTokens!==null){contextTokens=inputTokens+(outputTokens??0);}

  const windowTokens=count(input?.profile?.windowTokens)??(measured?count(measured.windowTokens):null);
  const percent=contextTokens!==null&&windowTokens?Math.round((contextTokens/windowTokens)*1000)/10:null;

  const named=typeof input?.model==='string'&&input.model?splitModelId(input.model):null;
  const provider=typeof last?.provider==='string'&&last.provider?last.provider:named?.provider??null;
  const model=typeof last?.model==='string'&&last.model?last.model:named?.model??null;
  const local=isLocalProvider(provider);

  let costUsd:number|null=null;let costSource:string|null=null;
  const declared=count(usage?.declaredCostUsd);
  if(!local&&declared!==null){costUsd=declared;costSource='provider-reported';}
  else if(!local&&provider&&model&&inputTokens!==null&&outputTokens!==null){
    const price=modelPrice({provider,model});
    if(price){
      const cached=Math.min(cachedTokens??0,inputTokens);
      const cacheRate=price.cacheReadPerMTok??price.inputPerMTok;
      costUsd=((inputTokens-cached)*price.inputPerMTok+cached*cacheRate+outputTokens*price.outputPerMTok)/1_000_000;
      costSource=price.date?`${price.source} ${price.date}`:price.source;
    }
  }
  const compactions=Math.max(0,Math.round(count(input?.state?.compactions)??0));
  return{inputTokens,outputTokens,cachedTokens,windowTokens,percent,estimated,costUsd,costSource,local,compactions,contextTokens};
}
