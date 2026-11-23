/*
 * Third adversarial review of 0.6.2 (bugfixer, 13/10/2026, on 550e25973), S1 — the cure's tests.
 *
 * The exit backstop (runtime/exit-backstop.ts) ends the process two seconds after `main` has returned. A ChatGPT token renewal is
 * a request that is deliberately not stoppable (chatgpt-plan.ts `boundedPlanFetch`: the refresh token rotates at each use), and
 * nothing awaited it at exit: `main` -> `runtime.close()` -> the plan's READS were stopped, the renewal was left on its way. If
 * OpenAI had already rotated the refresh token and its answer came later than the two seconds, the new session was never stored
 * and the person was signed out at the next renewal.
 * The cure: the plan keeps its token work in flight (a renewal, a sign-in's exchange, a sign-out), and closing the runtime waits
 * for it — bounded — before it returns; so `main` has awaited it before the backstop is armed.
 *
 * The fake OpenAI only (never the real service, never a real account), a memory keyring, a temp profile.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {hermetic,REPO_ROOT} from './first-run-fixture.ts';
import {fakeOpenAi,followSignIn,installFakeOpenAi,signIn,PLAN_MODEL,TOKEN} from './chatgpt-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import {scopeCliKeyring} from '../../src/runtime/talos-composition.ts';
import {TOKEN_WORK_EXIT_LIMIT_MS,chatgptPlanHandle,openChatgptPlan} from '../../src/provider/chatgpt-plan.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const grant=(url:unknown,options:any)=>String(url)===TOKEN?new URLSearchParams(typeof options?.body==='string'?options.body:'').get('grant_type'):null;
function world(t:{after:(fn:()=>void)=>void}){
  const dataRoot=mkdtempSync(path.join(tmpdir(),'talos-chatgpt-exit-'));t.after(()=>rmSync(dataRoot,{recursive:true,force:true}));
  return{dataRoot,keyring:scopeCliKeyring(createMemoryKeyring(dataRoot))!};
}

test('S1: a renewal whose answer takes 3 s, and the screen leaves at once — closing the runtime waits for it and the new session is stored',{timeout:180_000},async()=>{
  const fake=fakeOpenAi();const inner=fake.fetchImpl;let renewalAnswered=false;
  const fetchImpl=(async(url:any,options:any={})=>{
    const kind=grant(url,options);
    /* the sign-in's session lasts one second, so the first use after it must renew */
    if(kind==='authorization_code'){const first=await inner(url,options);return new Response(JSON.stringify({...await first.json(),expires_in:1}),{status:first.status,headers:{'content-type':'application/json'}});}
    /* OpenAI rotates the refresh token when it receives the request; its answer is three seconds away */
    if(kind==='refresh_token'){const answer=await inner(url,options);await sleep(3_000);renewalAnswered=true;return answer;}
    return inner(url,options);
  }) as typeof fetch;
  await hermetic(async h=>{
    const restore=installFakeOpenAi({...fake,fetchImpl});let context:any=null;let closed=false;
    const raw=createMemoryKeyring(h.paths.dataRoot);
    try{
      const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
      context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:PLAN_MODEL,env:{...process.env},environmentKeys:'consent',keyring:raw} as any);
      const login=await context.tuiCatalog.chatgpt.startLogin({open:()=>false});await followSignIn(login.url,fake);
      assert.equal((await login.outcome).ok,true,'the premise: somebody is signed in to the plan');
      await sleep(1_100);
      /* what the status row does at start (app.ts): the one background check — it asks the plan for its list, which needs the token */
      void Promise.resolve(context.tuiCatalog.refreshProviderState('chatgpt')).catch(()=>{});
      await sleep(300);
      assert.equal(fake.renewals(),1,'the premise: the renewal was sent');
      assert.equal(renewalAnswered,false,'the premise: and it is still on its way');
      /* the screen leaves (app.ts, the unmount effect), then `main`'s finally closes the runtime — the same call `-p` makes */
      context.tuiCatalog.stopProviderChecks();
      const started=Date.now();
      await context.runtime.close();closed=true;
      const waited=Date.now()-started;
      assert.equal(renewalAnswered,true,`the runtime closed in ${waited} ms with the renewal still on its way: the exit backstop would cut it two seconds later, with the refresh token already rotated`);
      assert.ok(waited>=1_500&&waited<TOKEN_WORK_EXIT_LIMIT_MS,`closing waited ${waited} ms`);
      /* the new session is in the keyring: another TALOS reads it and has nothing to renew */
      const next=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:scopeCliKeyring(raw)!,dataRoot:h.paths.dataRoot,fetchImpl:inner});
      assert.equal(await next!.accessToken(),'ACCESS-2','the session the renewal brought was not stored');
      assert.equal(fake.renewals(),1,'one renewal, and its refresh token was not asked for twice');
    }finally{
      if(!closed)await context?.runtime?.close?.().catch(()=>{});
      await context?.chatgptAccess?.esci?.().catch(()=>{});
      restore();
    }
  });
});

test('S1: a renewal that never answers does not hold the exit past the bound; with nothing on its way nothing is waited',async t=>{
  let clock=1_800_000_000_000;const now=()=>clock;
  const w=world(t);const fake=fakeOpenAi({now});let silent=false;
  const fetchImpl=((url:any,options:any={})=>silent&&grant(url,options)==='refresh_token'?new Promise<Response>(()=>{}):fake.fetchImpl(url,options)) as typeof fetch;
  const handle=chatgptPlanHandle({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl,clock:now});
  assert.deepEqual(await handle.settleTokenWork(),{waited:false,timedOut:false},'a plan that was never opened has nothing on its way');
  const plan=(await handle.load())!;
  await signIn(plan,fake);
  let started=Date.now();
  assert.deepEqual(await handle.settleTokenWork(),{waited:false,timedOut:false});
  assert.ok(Date.now()-started<200,'nothing on its way and the close waited');
  clock+=3_590_000;silent=true;
  const token=plan.accessToken();token.catch(()=>{});
  await sleep(50);
  started=Date.now();
  assert.deepEqual(await handle.settleTokenWork({limitMs:300}),{waited:true,timedOut:true});
  const waited=Date.now()-started;
  assert.ok(waited>=250&&waited<2_000,`the bound was 300 ms and the close waited ${waited} ms`);
});

test('S1: a sign-in whose exchange is on its way is waited for and its session stored; one still waiting for the browser holds nothing',async t=>{
  let clock=1_800_000_000_000;const now=()=>clock;
  const w=world(t);const fake=fakeOpenAi({now});
  const fetchImpl=(async(url:any,options:any={})=>{if(grant(url,options)==='authorization_code')await sleep(400);return fake.fetchImpl(url,options);}) as typeof fetch;
  const plan=(await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl,clock:now}))!;
  const attempt=await plan.start();
  /* the browser has not come back: nothing that stores a session is on its way */
  assert.deepEqual(await plan.settleTokenWork({limitMs:5_000}),{waited:false,timedOut:false});
  const page=followSignIn(attempt.url,fake);
  await sleep(150);
  assert.equal(plan.state().connected,false,'the premise: the exchange is on its way');
  assert.deepEqual(await plan.settleTokenWork({limitMs:5_000}),{waited:true,timedOut:false});
  assert.equal(plan.state().connected,true,'the close returned before the sign-in\'s session was stored');
  assert.equal((await page).status,200);assert.equal((await attempt.outcome).ok,true);
});
