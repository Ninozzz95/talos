/*
 * After the review of 0.6.3 (bugfixer, 14/10/2026), item 1. A runtime the supervisor replaces waits two seconds for a ChatGPT
 * renewal on its way, says nothing, and keeps what is still out for the process (chatgpt-plan.ts `keepLeftBehind`); the next
 * close that is the person's exit waits for it (talos-composition.ts). But when the replacement itself FAILED — the old runtime
 * closed, the new one could not be composed — the supervisor has no runtime left, and its close called nobody: the exit returned
 * at once, the exit backstop could cut the renewal two seconds later, with the refresh token already rotated at OpenAI.
 * The supervisor's close now waits for what was left behind, with the same notice after a second, on stderr.
 *
 * The fake OpenAI only (chatgpt-fixture.ts), a memory keyring, a temp profile: never the real service, never a real account.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hermetic,REPO_ROOT} from './first-run-fixture.ts';
import {fakeOpenAi,followSignIn,installFakeOpenAi,PLAN_MODEL,TOKEN} from './chatgpt-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import {scopeCliKeyring} from '../../src/runtime/talos-composition.ts';
import {keepLeftBehind,openChatgptPlan,TOKEN_WORK_REPLACE_LIMIT_MS} from '../../src/provider/chatgpt-plan.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';
import {CliRuntimeError} from '../../src/runtime/types.ts';
import {t as text} from '../../src/i18n/index.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const grant=(url:unknown,options:any)=>String(url)===TOKEN?new URLSearchParams(typeof options?.body==='string'?options.body:'').get('grant_type'):null;
const NOTICE=text('key.chatgpt.exit.finishing');
/** What is written to stderr while `fn` runs, kept apart; everything is still passed on. */
async function stderrDuring<T>(fn:(said:string[])=>Promise<T>):Promise<T>{
  const said:string[]=[];const write=process.stderr.write;
  (process.stderr as any).write=function(chunk:any,...rest:any[]){said.push(String(chunk));return (write as any).call(process.stderr,chunk,...rest);};
  try{return await fn(said);}finally{(process.stderr as any).write=write;}
}

test('a replacement that fails: the old runtime waits two seconds silently, and the person\'s exit waits for the renewal it left',{timeout:180_000},async()=>{
  const fake=fakeOpenAi();const inner=fake.fetchImpl;let renewalAnswered=false;
  const fetchImpl=(async(url:any,options:any={})=>{
    const kind=grant(url,options);
    if(kind==='authorization_code'){const first=await inner(url,options);return new Response(JSON.stringify({...await first.json(),expires_in:1}),{status:first.status,headers:{'content-type':'application/json'}});}
    /* OpenAI rotates the refresh token when it receives the request; its answer is five seconds away */
    if(kind==='refresh_token'){const answer=await inner(url,options);await sleep(5_000);renewalAnswered=true;return answer;}
    return inner(url,options);
  }) as typeof fetch;
  await hermetic(async h=>{
    const restore=installFakeOpenAi({...fake,fetchImpl});let context:any=null;let supervisor:any=null;
    const raw=createMemoryKeyring(h.paths.dataRoot);
    try{
      const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
      context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:PLAN_MODEL,env:{...process.env},environmentKeys:'consent',keyring:raw} as any);
      const login=await context.tuiCatalog.chatgpt.startLogin({open:()=>false});await followSignIn(login.url,fake);
      assert.equal((await login.outcome).ok,true,'the premise: somebody is signed in to the plan');
      await sleep(1_100);
      void Promise.resolve(context.tuiCatalog.refreshProviderState('chatgpt')).catch(()=>{});
      await sleep(300);
      assert.equal(fake.renewals(),1,'the premise: the renewal was sent');
      context.tuiCatalog.stopProviderChecks();
      /* the composed runtime, whose restore fails in a way the supervisor retries by replacing it; the replacement cannot be composed */
      const failing=Object.create(context.runtime,{restore:{value:async()=>{throw new CliRuntimeError('RUNTIME_RESTORE_TRANSIENT','the runtime went away');}}});
      supervisor=createRuntimeSupervisor({initialRuntime:failing,runtimeFactory:async()=>{throw new Error('the new runtime could not be composed');},policy:{restore:{maxAttempts:2,backoffMs:0}}});
      await stderrDuring(async said=>{
        const started=Date.now();
        await assert.rejects(supervisor.restore(),/could not be composed/u);
        const replaced=Date.now()-started;
        assert.ok(replaced>=TOKEN_WORK_REPLACE_LIMIT_MS-200&&replaced<TOKEN_WORK_REPLACE_LIMIT_MS+1_500,`the replaced runtime waited ${replaced} ms for the renewal, not about two seconds`);
        assert.equal(renewalAnswered,false,'the premise: the renewal outlived the replacement');
        assert.equal(said.filter(line=>line.includes(NOTICE)).length,0,'a replacement said the exit notice');
      });
      await stderrDuring(async said=>{
        const started=Date.now();
        await supervisor.close();
        const waited=Date.now()-started;
        assert.equal(renewalAnswered,true,`the exit returned in ${waited} ms with the renewal a replaced runtime left still on its way: the exit backstop would cut it`);
        assert.equal(said.filter(line=>line.includes(NOTICE)).length,1,'the exit waited more than a second and said nothing (or said it twice)');
      });
      const next=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:scopeCliKeyring(raw)!,dataRoot:h.paths.dataRoot,fetchImpl:inner});
      assert.equal(await next!.accessToken(),'ACCESS-2','the session the renewal brought was not stored');
    }finally{
      await supervisor?.close?.().catch(()=>{});
      await context?.runtime?.close?.().catch(()=>{});
      await context?.chatgptAccess?.esci?.().catch(()=>{});
      restore();
    }
  });
});

test('a supervisor with no runtime still waits for what was left behind, and with nothing left it waits for nothing',async()=>{
  const quick=createRuntimeSupervisor({runtimeFactory:async()=>{throw new Error('never composed');}});
  let started=Date.now();
  await stderrDuring(async said=>{await quick.close();assert.equal(said.filter(line=>line.includes(NOTICE)).length,0);});
  assert.ok(Date.now()-started<500,'nothing was left and the close waited');
  let ended=false;
  keepLeftBehind(sleep(1_400).then(()=>{ended=true;}));
  const supervisor=createRuntimeSupervisor({runtimeFactory:async()=>{throw new Error('never composed');}});
  started=Date.now();
  await stderrDuring(async said=>{
    await supervisor.close();
    assert.equal(ended,true,`the close returned in ${Date.now()-started} ms with the work still on its way`);
    assert.equal(said.filter(line=>line.includes(NOTICE)).length,1,'more than a second and nothing said');
  });
});
