/*
 * The fetch the kernel's token counter uses (harness-ui/src/context-token-counters.mjs) before each model request, once a model's
 * window is known. The counter POSTs the prepared request to a count endpoint and reads 404/405/501 as «estimate»; every other
 * failure fails the counter, and with it the turn.
 *
 * ⛔ R5a lane R, S2 risk 1 (measured, r5a-r-context-engine.test.ts): only three providers document a count endpoint (OpenAI
 *   `/responses/input_tokens`, Anthropic `/messages/count_tokens`, Gemini `:countTokens`); for every other one the kernel guesses
 *   `/chat/completions/input_tokens`, which no provider in the registry documents — an extra request per turn that at best answers
 *   404, and at worst 400/401/403/429, which fails EVERY turn. So the guessed endpoint is never sent, and a documented one that
 *   fails, or cannot be reached, is read the same way: a count that could not be taken is an estimate, never a failed turn.
 * ⛔ 0.6.7 (stress test of 0.6.6, F-C002-001, reproduced on the published 0.6.6): an endpoint that answers 200 with a body that is
 *   not a count (an OpenAI-compatible proxy or local server that does not implement `/responses/input_tokens`) passed through, and
 *   the kernel failed EVERY turn with CTX_TOKEN_RESPONSE_INVALID (context-token-counters.mjs:196-198). Only a whole number ≥ 0
 *   (`input_tokens`, Gemini `totalTokens`) reaches the kernel; anything else is the 404 «estimate». Claude Code estimates when its
 *   count fails; Codex and OpenCode always estimate. The desktop takes the same rule into the kernel module (r4, after 0.6.6).
 * ⛔ 0.6.8 (fourth review of 0.6.7, S4): the kernel's counter gives up after its own 10 s ceiling (TEMPO_MASSIMO_DEL_CONTEGGIO_MS,
 *   an `AbortSignal.timeout` joined to the turn's signal), but nothing remembered it: an endpoint that accepts the connection and
 *   never answers cost 10 s on EVERY count, up to three per request under compaction. An endpoint that ran out the ceiling is now
 *   skipped for ten minutes: its counts are estimates at once. Only the ceiling marks it (the abort's reason is the timeout's
 *   `TimeoutError`); a turn stopped by the person never does. The 0.6.7 strip of `fallback` before the Context Engine
 *   (`countTheEngineReads`) is gone: since r4 e4bede2ac the engine's contract accepts it.
 */
export const SLOW_COUNT_ENDPOINT_MS=10*60_000;
export function tokenCountFetch(fetchImpl?:typeof fetch,{now=Date.now}:{now?:()=>number}={}){
  const notCounted=()=>new Response(null,{status:404});
  /* endpoint (origin + path) → until when it is skipped */
  const slow=new Map<string,number>();
  return async(url:string,options:any):Promise<Response>=>{
    const parsed=new URL(url);const pathname=parsed.pathname;const endpoint=`${parsed.origin}${pathname}`;
    if(/\/chat\/completions\/input_tokens$/u.test(pathname))return notCounted();
    if((slow.get(endpoint)??0)>now())return notCounted();
    try{
      /* the global fetch is looked up at each call, as the inline code did (first review of 0.6.7) */
      const response=await (fetchImpl??globalThis.fetch)(url,options);
      if(!response.ok){try{await response.body?.cancel();}catch{/* not read */}return notCounted();}
      const text=await response.text();
      let body:any=null;try{body=JSON.parse(text);}catch{return notCounted();}
      /* the field the kernel reads for that endpoint (context-token-counters.mjs: Gemini `:countTokens` → totalTokens, else input_tokens) */
      const count=/:countTokens$/u.test(pathname)?body?.totalTokens:body?.input_tokens;
      if(!Number.isSafeInteger(count)||count<0)return notCounted();
      return new Response(text,{status:response.status,headers:{'content-type':'application/json'}});
    }
    catch(error){
      if(options?.signal?.aborted){
        if(options.signal.reason?.name==='TimeoutError')slow.set(endpoint,now()+SLOW_COUNT_ENDPOINT_MS);
        throw error;
      }
      return notCounted();
    }
  };
}
