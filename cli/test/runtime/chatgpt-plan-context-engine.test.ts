/*
 * Review of 0.6.0, suspect F4, measured on 13/10/2026 (was RED on 13/10/2026, cured after 0.6.1).
 *
 * A model of the ChatGPT plan (`chatgpt:<slug>`) has ONE source for its context window: the account's own model list (the kernel's
 * `modelloDelPiano` reads `context_window`). The registry has no row for it, there is no models.dev entry under `chatgpt`, and the
 * only place that remembered the list's rows for `modelProfile` was the model picker (catalog-service.ts `liveModels`). So the window
 * was known only in a process where somebody had opened /model on the plan. `prepareProfile` (talos-composition.ts), which brings a
 * session's model up to date before the Context Engine decides, refreshed the person's overrides, a local Ollama and models.dev —
 * never the plan.
 *
 * Measured before the cure, through the real composition and the fake OpenAI answering `context_window: 400000`:
 *   signed in, a NEW composition on the same profile (what `talos -p --model chatgpt:…` and a resumed plan conversation are),
 *   one turn -> `modelProfile` null, the account's list never asked, no `context/context.sqlite` (the Context Engine never
 *   started: the kernel's simple mode, with its every-8-calls compaction and 8,000-character cut);
 *   the same composition after `providerModels('chatgpt')` -> window 400000, and the next turn creates the Context Engine's store.
 *
 * The cure: `prepareProfile` asks the plan for its list when the session's model is the plan's and its window is not known — with
 * the plan's token, only when somebody is signed in with the plan enabled, bounded like the other sources, and not again for a
 * minute after an answer that brought no window (a failure, or a list without the field).
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {hermetic,REPO_ROOT,type Hermetic} from '../provider/first-run-fixture.ts';
import {fakeOpenAi,followSignIn,installFakeOpenAi,MODELS,PLAN_MODEL,type FakeOpenAi} from '../provider/chatgpt-fixture.ts';
import {runTurn} from './r5a-r-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import * as profiles from '../../src/runtime/model-profile.ts';
import {collectHeadlessRun} from '../../src/headless/run.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';

test.after(()=>profiles.resetModelProfiles());
const WINDOW=400_000;
const PLAN={provider:'chatgpt',model:'gpt-5.5'};
/** The fake OpenAI, with the plan's list answered by `list` (the fixture's own list carries no window). */
function fakeWithList(list:()=>Response):FakeOpenAi{
  const fake=fakeOpenAi();const inner=fake.fetchImpl;
  const fetchImpl=(async(url:any,options:any={})=>{
    const answer=await inner(url,options);
    return String(url)===MODELS&&answer.status===200?list():answer;
  }) as typeof fetch;
  return{...fake,fetchImpl};
}
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const withWindow=()=>json(200,{data:[{slug:'gpt-5.5',display_name:'GPT-5.5',visibility:'list',context_window:WINDOW}]});
async function compose(h:Hermetic,keyring:any):Promise<any>{
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  return await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:PLAN_MODEL,env:{...process.env},environmentKeys:'consent',keyring} as any);
}
/** Signed in through a first composition; `fn` gets a SECOND one on the same profile, where nobody has opened the model list. */
async function signedInElsewhere(fake:FakeOpenAi,fn:(h:Hermetic,context:any)=>Promise<void>){
  await hermetic(async h=>{
    const restore=installFakeOpenAi(fake);const opened:any[]=[];
    try{
      const keyring=createMemoryKeyring(h.paths.dataRoot);
      const first=await compose(h,keyring);opened.push(first);
      const login=await first.tuiCatalog.chatgpt.startLogin({open:()=>false});await followSignIn(login.url,fake);
      assert.equal((await login.outcome).ok,true);
      const second=await compose(h,keyring);opened.push(second);
      assert.equal(profiles.modelProfile(PLAN),null,'a new composition knows no window for the plan model');
      assert.equal(listAsked(fake).length,0,'and nobody has asked the account for its list');
      await fn(h,second);
    }finally{for(const context of opened){await context.chatgptAccess?.esci?.().catch(()=>{});await context.runtime.close?.().catch(()=>{});}restore();}
  });
}
const listAsked=(fake:FakeOpenAi)=>fake.calls.filter(call=>call.url===MODELS);
const contextStore=(h:Hermetic)=>path.join(h.paths.dataRoot,'context','context.sqlite');

test('a plan model gets the Context Engine in a process where nobody opened the model list',{timeout:180_000},async()=>{
  const fake=fakeWithList(withWindow);
  await signedInElsewhere(fake,async(h,context)=>{
    const turn=await runTurn(context,h,'Say hello.',{model:PLAN_MODEL,timeoutMs:30_000});
    assert.match(JSON.stringify(turn.raw),/Done by the plan\./u,JSON.stringify(turn.raw.filter((event:any)=>event?.type==='RunError')));
    assert.equal(listAsked(fake).length,1,'the account was asked for its list, once, before the request');
    assert.match(listAsked(fake)[0]!.authorization??'',/^Bearer ACCESS-/u,'with the plan\'s token');
    assert.equal(profiles.modelProfile(PLAN)?.windowTokens,WINDOW,'the window the account says');
    assert.equal(existsSync(contextStore(h)),true,'the Context Engine prepared the request (its store exists)');
    /* the second request does not ask again: the window is known */
    await runTurn(context,h,'Say hello again.',{model:PLAN_MODEL,timeoutMs:30_000});
    assert.equal(listAsked(fake).length,1);
  });
});

test('`-p` on a plan model: the same',{timeout:180_000},async()=>{
  const fake=fakeWithList(withWindow);
  await signedInElsewhere(fake,async(h,context)=>{
    const headless=await collectHeadlessRun(createRuntimeSupervisor({initialRuntime:context.runtime,runtimeFactory:()=>context.runtime}),{projectRoot:h.project,checkpointsRoot:h.paths.checkpointsRoot,model:PLAN_MODEL,permissionMode:'bypassPermissions',prompt:'Say hello.',protocolVersion:'v2'});
    assert.match(JSON.stringify(headless.result),/Done by the plan\./u);
    assert.equal(profiles.modelProfile(PLAN)?.windowTokens,WINDOW);
    assert.equal(existsSync(contextStore(h)),true);
  });
});

test('a list that cannot be read costs the turn nothing, and is not asked again at every request',{timeout:180_000},async()=>{
  const fake=fakeWithList(()=>json(500,{error:{message:'down'}}));
  await signedInElsewhere(fake,async(h,context)=>{
    for(const prompt of ['Say hello.','Say hello again.']){
      const turn=await runTurn(context,h,prompt,{model:PLAN_MODEL,timeoutMs:30_000});
      assert.match(JSON.stringify(turn.raw),/Done by the plan\./u,JSON.stringify(turn.raw.filter((event:any)=>event?.type==='RunError')));
    }
    assert.equal(listAsked(fake).length,1,'asked once, not once per request');
    assert.equal(profiles.modelProfile(PLAN),null,'no window is invented');
    assert.equal(existsSync(contextStore(h)),false,'so the simple mode stays');
  });
});
