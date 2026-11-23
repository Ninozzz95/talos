/*
 * Second adversarial review of 0.6.2 (bugfixer, 13/10/2026, on e379b2b0a). RED ON PURPOSE: it proves a finding, it is not a cure.
 *
 * The commit says: «Every background check has its AbortController; the screen stops them on unmount (stopProviderChecks)».
 * True for a key provider. For the ChatGPT plan the controller exists and nothing is tied to it:
 *   catalog-service.ts  probeProviderState  -> controlPlane.probe('chatgpt', check.signal)
 *   control-plane.ts:170                    -> deps.signInProbe(id, signal)
 *   talos-composition.ts:812                -> signInProbe:async(id)=>{ ... plan.models({reload:true}) }      the signal is dropped here
 *   harness-ui chatgpt-rotte.mjs `elenca`   -> fetch(`${RISORSA}/models`, {headers})                          no signal, no timeout
 * So with somebody signed in to the plan and a `chatgpt:` model on the status row, the request the row's check sends cannot be
 * stopped: after Ctrl+C Ctrl+C the process lives until OpenAI answers or Node's own fetch gives up (minutes, not the 31 s measured
 * for a key provider). The unit test of the cure (provider-state-review-062.test.ts, «EXIT») uses a fake control plane that
 * honours the signal, so it is green while the real composition does not.
 *
 * Through the real composition and the fake OpenAI (never the real service, never a real account): the plan's list is asked by
 * the check and never answered; the screen leaves; the request must have been given a signal, and that signal must be aborted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hermetic,REPO_ROOT} from '../provider/first-run-fixture.ts';
import {fakeOpenAi,followSignIn,installFakeOpenAi,MODELS,PLAN_MODEL} from '../provider/chatgpt-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('the screen that leaves ends the ChatGPT plan\'s check too: its request carries the check\'s signal',{timeout:180_000},async()=>{
  const fake=fakeOpenAi();const inner=fake.fetchImpl;
  let silent=false;const unanswered:Array<{signal:AbortSignal|null}>=[];
  /* once `silent`, the plan's list is a request nobody answers; it ends only if whoever sent it ends it */
  const fetchImpl=((url:any,options:any={})=>{
    if(!silent||String(url)!==MODELS)return inner(url,options);
    const signal:AbortSignal|null=options?.signal instanceof AbortSignal?options.signal:null;
    unanswered.push({signal});
    return new Promise<Response>((_resolve,reject)=>{signal?.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});});
  }) as typeof fetch;
  await hermetic(async h=>{
    const restore=installFakeOpenAi({...fake,fetchImpl});let context:any=null;
    try{
      const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
      context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:PLAN_MODEL,env:{...process.env},environmentKeys:'consent',keyring:createMemoryKeyring(h.paths.dataRoot)} as any);
      const login=await context.tuiCatalog.chatgpt.startLogin({open:()=>false});await followSignIn(login.url,fake);
      assert.equal((await login.outcome).ok,true,'the premise: somebody is signed in to the plan');
      silent=true;
      /* what the status row does at start (app.ts): the one background check; it comes back at the catalog's 2 s budget */
      const report=await context.tuiCatalog.refreshProviderState('chatgpt');
      assert.equal(report.state,'unverified','the budget ended the wait');
      assert.equal(unanswered.length,1,'the premise: the check asked the plan for its list, and nobody answered');
      /* the screen leaves (app.ts, the unmount effect) */
      context.tuiCatalog.stopProviderChecks();
      await sleep(50);
      assert.ok(unanswered[0]!.signal,'the plan\'s list request was sent with NO signal: nothing can stop it, and the process waits for it after the screen has gone');
      assert.equal(unanswered[0]!.signal!.aborted,true,'the request has a signal, and leaving the screen did not end it');
    }finally{
      silent=false;
      await context?.chatgptAccess?.esci?.().catch(()=>{});await context?.runtime?.close?.().catch(()=>{});
      restore();
    }
  });
});
