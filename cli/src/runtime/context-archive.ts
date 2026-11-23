/*
 * P12 (owner, 2026-09-25, "quando riprendo sessione mi dà CTX_HISTORY_DIVERGED"). Measured on a copy of the owner's
 * session and Context Engine archive: the archive held 10 messages, the last an assistant message with a tool call and NO
 * result (12:16:45, the turn interrupted there); the session's own history had dropped that unanswered call, as it must (a
 * call without its result is not sent back to a model), and gone on with the next person's messages. From then on the
 * archive was no longer a prefix of the history, `syncOriginals` (harness-ui/src/context-desktop-service.mjs:202) refused
 * every turn, and the session could not be resumed.
 * Where the unanswered call came from: the kernel archives the whole history at several points of a turn, among them
 * right after the model's answer, BEFORE the tools run (talosHarness.mjs `capture` reason 'response'). The cure, on the
 * CLI's side of the bridge (the kernel and the service are not edited): `capture` never archives an assistant message
 * whose tool calls do not all have a result yet, nor the partial results after it. The next capture, once the results
 * are in, archives the exchange whole; if the turn stops first, nothing unanswered was archived. The archive stays a
 * prefix of the history in both cases.
 */

type Message={role?:unknown;tool_calls?:unknown;tool_call_id?:unknown};

/** The longest prefix of `messages` that does not end inside an unanswered tool exchange. */
export function archivableHistory<T>(messages:readonly T[]):T[]{
  const rows=messages as readonly Message[];
  for(let index=rows.length-1;index>=0;index--){
    const message=rows[index];
    if(message?.role!=='assistant'||!Array.isArray(message.tool_calls)||message.tool_calls.length===0)continue;
    const wanted=new Set(message.tool_calls.map((call:any)=>call?.id).filter((id:unknown)=>typeof id==='string'&&id));
    for(let later=index+1;later<rows.length&&rows[later]?.role==='tool';later++)wanted.delete(rows[later]!.tool_call_id as string);
    /* The last tool exchange decides: complete, the whole history is archivable; unanswered, it and what follows wait. */
    return wanted.size===0?[...messages]:messages.slice(0,index);
  }
  return [...messages];
}

/*
 * The same measurement found a race: `syncOriginals` reads the session revision, then appends with it
 * (context-desktop-service.mjs:199-204), while a Context Engine compaction running in the background can commit a version
 * in between (outside that session's queue). The append is then refused with CTX_STALE_REVISION and the TURN failed
 * (r5a-coord-ce-compaction: 3 of 8 runs once capture waited for whole tool exchanges, 0 of 11 before; the race existed
 * before too, only rarer). A retry is safe: `syncOriginals` rereads the revision and appends only what is missing, and
 * `prepare` recomputes from the archive. So `capture` and `prepare` retry a stale revision, briefly.
 * The shape follows Hermes' SQLite write retry (hermes_state.py:467-489, read 2026-09-26): patience is TIME-based, since
 * "attempt-counted budgets destroyed turns on a healthy store", and each wait is RANDOM (20-150 ms), so two writers that
 * lost the same race do not collide again in step (the "full jitter" of AWS's "Exponential Backoff and Jitter"). The
 * budget is short, like Hermes' wait on a live compression lock: a compaction's commit is one write, and the revision reread
 * after it succeeds; a revision that keeps moving for two seconds is a real conflict, and the error goes on.
 */
const STALE_PATIENCE_MS=2_000,STALE_WAIT_MIN_MS=20,STALE_WAIT_MAX_MS=150;
async function retryStale<T>(operation:()=>Promise<T>|T,patienceMs:number):Promise<T>{
  const deadline=Date.now()+patienceMs;
  for(;;){
    try{return await operation();}
    catch(error){
      const remaining=deadline-Date.now();
      if((error as {code?:unknown})?.code!=='CTX_STALE_REVISION'||remaining<=0)throw error;
      const wait=STALE_WAIT_MIN_MS+Math.random()*(STALE_WAIT_MAX_MS-STALE_WAIT_MIN_MS);
      await new Promise(resolve=>setTimeout(resolve,Math.min(wait,remaining)));
    }
  }
}

/* The errors of `syncOriginals` itself (context-desktop-service.mjs): with these, nothing new was archived. */
const ARCHIVING_ERRORS=new Set(['CTX_INVALID_INPUT','CTX_HISTORY_DIVERGED','CTX_STALE_REVISION']);
type KernelContextHooks={capture?:(input:{messages:unknown[];reason?:string})=>unknown;prepare?:(input:any)=>unknown;[key:string]:unknown};
/** The service's kernel hooks: `capture` archives only whole tool exchanges; `capture` and `prepare` retry a stale revision. */
export function withArchivableCapture<H extends KernelContextHooks|undefined|null>(hooks:H,{stalePatienceMs=STALE_PATIENCE_MS}:{stalePatienceMs?:number}={}):H{
  if(!hooks||typeof hooks.capture!=='function')return hooks;
  const capture=hooks.capture,prepare=hooks.prepare;
  /*
   * P18 phase 1 (owner 2026-09-26). The kernel captures at 'start', 'before-request', 'response', after EVERY tool result
   * and at 'finished'; with the rule above most of those carry the prefix already archived (a tool exchange is archived
   * once, when its last result is in), and each still cost the service a full reread of the archive and a sha256 of
   * every message (context-desktop-service.mjs syncOriginals): ~25 ms a capture at 1,351 messages, measured with
   * scripts/bench-tools.ts. A prefix with the same length, first and last message as the last one archived is not sent
   * again. Any other change (longer, shorter, a message replaced) still goes to the service, which decides.
   */
  let archived:{length:number;first:unknown;last:unknown}|null=null;
  /* P19 (owner 27/09, session cad61a7e): what the service last ACCEPTED, from capture or prepare, for the session registry
     to resume from when a turn fails after an exchange was archived (session-registry.mjs messaggiDopoUnGiroFallito). */
  let accepted:unknown[]|null=null;
  const sameAsArchived=(rows:readonly unknown[])=>archived!==null&&rows.length===archived.length&&rows[0]===archived.first&&rows[rows.length-1]===archived.last;
  return {
    ...hooks,
    capture:async(input:{messages:unknown[];reason?:string})=>{
      if(!Array.isArray(input?.messages))return retryStale(()=>capture(input),stalePatienceMs);
      const rows=archivableHistory(input.messages);
      if(sameAsArchived(rows))return undefined;
      const result=await retryStale(()=>capture({...input,messages:rows}),stalePatienceMs);
      archived={length:rows.length,first:rows[0],last:rows[rows.length-1]};accepted=rows;
      return result;
    },
    ...(typeof prepare==='function'?{prepare:async(input:any)=>{
      /* prepare archives the originals when it has them, else the history it is given (context-desktop-service.mjs), and
         only then compacts: a context error that is not one of the archiving step's own (the session cad61a7e failed with
         CTX_INVALID_SUMMARY) comes after the history was archived, and counts as archived. */
      const originals=Array.isArray(input?.originali)?input.originali:Array.isArray(input?.messages)?input.messages:null;
      try{const result=await retryStale(()=>prepare(input),stalePatienceMs);if(originals)accepted=[...originals];return result;}
      catch(error){const code=(error as {code?:unknown})?.code;if(originals&&typeof code==='string'&&code.startsWith('CTX_')&&!ARCHIVING_ERRORS.has(code))accepted=[...originals];throw error;}
    }}:{}),
    archivedMessages:()=>accepted?[...accepted]:null,
  } as H;
}
