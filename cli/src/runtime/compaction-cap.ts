/*
 * 14/10/2026, owner («Tetto di serie, regolabile»): the Context Engine summarises a conversation when its input reaches HALF the
 * model's input limit (the CLI's rule since M6-E). With a huge window (GLM, 1M) that is past 400,000 tokens, so requests of
 * ~365k were sent, slow and costly. The trigger is now the lower of the two: half the limit, or `compactAtTokens` (200,000 by
 * default; `context.compactAtTokens` in the configuration, `null` for no cap). Codex: `auto_compact_token_limit` is the lower of
 * 90 % of the window and the configured limit (codex-rs/protocol/src/openai_models.rs:525); Hermes: thresholds per model over
 * the input budget (agent/context_compressor.py:2864). Below the cap nothing changes: 0.5 and 0.49, as before.
 */
export const DEFAULT_COMPACT_AT_TOKENS=200_000;
export const COMPACT_AT_RANGE:readonly [number,number]=Object.freeze([8_000,10_000_000]) as readonly [number,number];
const HALF=0.5;
const floor4=(value:number)=>Math.floor(value*10_000)/10_000;

/** The engine's input limit for a profile (context-engine/src/profiles.mjs `validateContextProfile`), or null when unknown. */
export function inputLimitOf(profile:{windowTokens?:unknown;responseReserve?:unknown;method?:unknown;marginTokens?:unknown}|null|undefined):number|null{
  const window=Number(profile?.windowTokens),reserve=Number(profile?.responseReserve??0);
  if(!Number.isInteger(window)||window<=0||!Number.isInteger(reserve)||reserve<0)return null;
  const estimate=(profile?.method??'heuristic')==='heuristic';
  const margin=Number.isInteger(profile?.marginTokens)?Number(profile!.marginTokens):Math.max(estimate?1024:256,Math.ceil(window*(estimate?0.15:0.05)));
  const limit=window-reserve-margin;
  return limit>0?limit:null;
}

/** The trigger and target ratios for one conversation. `currentTarget`: the one in the engine's settings, kept when it is valid. */
export function compactionRatios({inputLimit,compactAtTokens,currentTarget}:{inputLimit:number|null;compactAtTokens:number|null;currentTarget:number|null}):{triggerRatio:number;targetRatio:number}{
  let triggerRatio=HALF;
  if(compactAtTokens!==null&&inputLimit!==null&&inputLimit*HALF>compactAtTokens)triggerRatio=Math.max(0.0001,floor4(compactAtTokens/inputLimit));
  /* review of 0.6.4 (S4): the target always follows the trigger of NOW. Kept from before, a target lowered by the cap (0.235 for a 1M
     window) outlived a model switch or the cap's removal and made every summary far more aggressive than meant. The CLI has no
     setting for the target, so nothing the person chose is lost. `currentTarget` is accepted and ignored. */
  void currentTarget;
  const targetRatio=floor4(triggerRatio*0.98);
  return{triggerRatio,targetRatio};
}
