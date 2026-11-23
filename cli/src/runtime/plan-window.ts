/*
 * The window of a ChatGPT-plan model, asked from the account's own list when nobody knows it (review of 0.6.0, F4, measured
 * 13/10/2026 in chatgpt-plan-context-engine.test.ts: a plan model has ONE source for its window, and only the model picker
 * remembered it, so `talos -p --model chatgpt:…` and a resumed plan conversation ran without the Context Engine).
 *
 * The rules, each with its reason:
 *   · nothing is asked when the window is known, and nothing goes to OpenAI when nobody is signed in with the plan enabled;
 *   · after an answer that brought no window (a failure, a list without the field) it is not asked again for a minute;
 *   · ONE request at a time, and whoever prepares meanwhile waits for it (review of 0.6.2, 13/10/2026). The minute's gate was
 *     closed the moment the request left, so a second prepare inside it — a parallel session, a sub-agent starting with its parent
 *     — returned at once, before the answer: its first request was prepared with the window still unknown, without the Context
 *     Engine. It now gets the same answer, inside the caller's own bound (talos-composition.ts: 2 s, as models.dev).
 *
 * Taken out of the composition so it can be measured without building the kernel (test/runtime/plan-window.test.ts).
 */
export type PlanWindowSource={
  /** Whether a window is already known for this model of the plan. */
  known(modelId:string):boolean;
  /** The plan when somebody is signed in WITH the plan enabled; null otherwise (not signed in, no plan, no keyring). */
  signedInPlan():Promise<{models():Promise<readonly unknown[]>}|null>;
  /** The list's rows, for the model profiles. */
  remember(rows:readonly unknown[]):void;
  retryMs?:number;now?:()=>number;
};
export const PLAN_LIST_RETRY_MS=60_000;

export function createPlanWindow({known,signedInPlan,remember,retryMs=PLAN_LIST_RETRY_MS,now=Date.now}:PlanWindowSource):(modelId:string)=>Promise<void>{
  let askedAt=-Infinity;let inFlight:Promise<void>|null=null;
  const ask=async():Promise<void>=>{
    let plan:Awaited<ReturnType<PlanWindowSource['signedInPlan']>>=null;
    try{plan=await signedInPlan();}catch{plan=null;}
    if(!plan)return;
    askedAt=now();
    try{remember(await plan.models());}catch{/* a list that cannot be read is no source */}
  };
  return modelId=>{
    if(known(modelId))return Promise.resolve();
    if(inFlight)return inFlight;
    if(now()-askedAt<retryMs)return Promise.resolve();
    const request=ask().finally(()=>{if(inFlight===request)inFlight=null;});
    inFlight=request;
    return request;
  };
}
