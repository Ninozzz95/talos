/*
 * 0.6.13, Z piece C (r4 8b8d1133c, 23/10/2026): «the conversation is too long for this model» with its diagnosis. When the provider
 * refuses a request as too long, the kernel shrinks the conversation toward a target (free steps, at most one paid summary, a summary
 * without a model, at most three retries, never the same request twice). When it still does not fit, the RunError carries at its top
 * `classificazione:'contesto-pieno'` and `contestoPieno:{scalino, bersaglio, numeri?:{richiesti, massimo, uscita}, esauriti?}`
 * (agent-service.mjs, the Z-K1 cure): the step reached, the target in tokens, the provider's own numbers when its refusal said them,
 * and `esauriti:true` only when the retries were used up. A refusal where the frame alone is over the window stops at step 0 without
 * `esauriti` (the durable `non-entra` warning says that case just before).
 * Competitors: Codex says «Codex ran out of room in the model's context window. Start a new thread or clear earlier history» as its
 * own error (codex-rs/core/src/error.rs `ContextWindowExceeded`); gemini-cli names the counts it measured before stopping
 * (packages/core/src/core/client.ts `ContextWindowWillOverflow`, `estimatedRequestTokenCount`, `remainingTokenCount`); Hermes logs
 * the compression attempts it made before giving up (agent/context_compressor.py). TALOS says whether it shortened first, and the
 * provider's numbers when there are any; nothing is invented.
 * No imports, as runtime/request-too-large.ts: the protocol, the error describer and the failure envelope read the same facts. The
 * English names avoid the word «token»: the v1 bridge drops and the failure redactor masks any key that contains it.
 */
export type ContextFull={step:number;target:number|null;numbers?:{requested:number;maximum:number;output:number|null};exhausted?:true};
function count(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value):null;}
function record(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function build(step:number|null,target:unknown,requested:unknown,maximum:unknown,output:unknown,exhausted:unknown):ContextFull|null{
  if(step===null)return null;
  const asked=count(requested),most=count(maximum);
  return{step,target:count(target),...(asked!==null&&most!==null?{numbers:{requested:asked,maximum:most,output:count(output)}}:{}),...(exhausted===true?{exhausted:true as const}:{})};
}
function fromKernel(row:Record<string,unknown>):ContextFull|null{
  const full=record(row.contestoPieno);if(!full)return null;const numbers=record(full.numeri);
  return build(count(full.scalino),full.bersaglio,numbers?.richiesti,numbers?.massimo,numbers?.uscita,full.esauriti);
}
function fromEnglish(row:Record<string,unknown>):ContextFull|null{
  const full=record(row.contextFull);if(!full)return null;const numbers=record(full.numbers);
  return build(count(full.step),full.target,numbers?.requested,numbers?.maximum,numbers?.output,full.exhausted);
}
/**
 * The diagnosis wherever it travels: the CLI's own English `contextFull` (a v2 error, a failure, a v1 event's data) or the kernel's
 * Italian `contestoPieno` on the RunError itself, under its `dati`/`data`, or in an envelope's `details`. Null when the step is
 * missing: nothing is invented.
 */
export function contextFullOf(value:unknown):ContextFull|null{
  try{
    const row=record(value);if(!row)return null;
    for(const candidate of [row,record(row.data),record(row.dati),record(row.details),record(record(row.envelope)?.details)]){
      if(!candidate)continue;const found=fromEnglish(candidate)??fromKernel(candidate);if(found)return found;
    }
    return null;
  }catch{return null;}
}
