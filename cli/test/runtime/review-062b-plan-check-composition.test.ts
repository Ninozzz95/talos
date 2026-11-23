/*
 * Second review of 0.6.2 (bugfixer, 13/10/2026). The first cures' tests of the ChatGPT plan's check (provider-state-review-062.test.ts,
 * «C5» and the plan half of «EXIT») used a fake control plane that honoured the signal and stated no verdict: they were green while
 * the real composition dropped the signal (B1) and let «no verdict» read as verified (N3). These go through the REAL composition
 * and the fake OpenAI (never the real service, never a real account), next to the review's own red file
 * (review-062b-chatgpt-check-not-stopped.test.ts):
 *   N3  a plan whose list answers is «verified» because the probe SAYS the credential was accepted;
 *   C5  a list slower than the catalog's 2 s does not hold the check, and its late answer is written;
 *   N5  …and the screen is told when it lands.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hermetic,REPO_ROOT} from '../provider/first-run-fixture.ts';
import {fakeOpenAi,followSignIn,installFakeOpenAi,MODELS,PLAN_MODEL} from '../provider/chatgpt-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import {readProviderStateSnapshot} from '../../src/provider/provider-state-snapshot.ts';
import {join} from 'node:path';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('the plan\'s check through the real composition: verified by a stated verdict; a slow list does not hold it, lands late, and the screen is told',{timeout:180_000},async()=>{
  const fake=fakeOpenAi();let delayMs=0;
  const fetchImpl=(async(url:any,options:any={})=>{
    if(delayMs>0&&String(url)===MODELS)await sleep(delayMs);
    return fake.fetchImpl(url,options);
  }) as typeof fetch;
  await hermetic(async h=>{
    const restore=installFakeOpenAi({...fake,fetchImpl});let context:any=null;
    try{
      const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
      context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:PLAN_MODEL,env:{...process.env},environmentKeys:'consent',keyring:createMemoryKeyring(h.paths.dataRoot)} as any);
      const catalog=context.tuiCatalog;
      /* nobody signed in: nothing is sent, and nothing is claimed */
      assert.equal((await catalog.refreshProviderState('chatgpt')).state,'unverified');
      assert.deepEqual(fake.calls,[]);
      const login=await catalog.chatgpt.startLogin({open:()=>false});await followSignIn(login.url,fake);
      assert.equal((await login.outcome).ok,true);
      /* N3: the list answered a request made with the plan's token — the probe states it, the row may say «verified» */
      const healthy=await catalog.refreshProviderState('chatgpt');
      assert.deepEqual([healthy.state,healthy.verified,healthy.fresh],['available',true,true]);
      const file=join(h.paths.cacheRoot,'provider-state.json');
      assert.deepEqual((entry=>[entry?.state,entry?.verified])(readProviderStateSnapshot({file}).providers.chatgpt),['available',true]);
      /* C5 + N5: sign in again (what was known is reset), and the list now takes longer than the catalog's 2 s */
      const again=await catalog.chatgpt.startLogin({open:()=>false});await followSignIn(again.url,fake);
      assert.equal((await again.outcome).ok,true);
      assert.equal(catalog.providerState('chatgpt').state,'unverified','the premise: a sign-in resets what the check knew');
      const told:string[]=[];catalog.onProviderStateChanged((id:string)=>told.push(id));
      delayMs=2_600;const started=Date.now();
      const slow=await catalog.refreshProviderState('chatgpt');
      const waited=Date.now()-started;
      assert.ok(waited<2_500,`the plan's check held the refresh past its budget (${waited} ms)`);
      assert.equal(slow.state,'unverified','an unanswered check is a declared «not verified»');
      assert.deepEqual(told,[]);
      await sleep(Math.max(0,2_600-waited)+400);
      assert.deepEqual((report=>[report.state,report.verified])(catalog.providerState('chatgpt')),['available',true],'the answer that lands late is written through');
      assert.deepEqual(told,['chatgpt'],'and the screen is told, so the row does not stay «not verified» for the session');
    }finally{
      delayMs=0;
      await context?.chatgptAccess?.esci?.().catch(()=>{});await context?.runtime?.close?.().catch(()=>{});
      restore();
    }
  });
});
