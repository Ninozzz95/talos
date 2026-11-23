/*
 * Second review of 0.6.2 (bugfixer, 13/10/2026, B1) — the plan's own requests (chatgpt-plan.ts `boundedPlanFetch`). The kernel
 * sends them with no signal and no time limit; here a READ that came without a signal gets a time limit, the signal of whoever
 * asked, and a stop. What must NOT be touched is pinned in the same place: a request that writes (the token exchange, a renewal:
 * the refresh token rotates at each use), a request that has its own signal — and a model's turn, which never passes through the
 * plan at all (the kernel's model destination sends the Responses stream and takes from the plan only the token).
 * The fake OpenAI only (chatgpt-fixture.ts): never the real service, never a real account.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {hermetic,REPO_ROOT} from './first-run-fixture.ts';
import {fakeOpenAi,followSignIn,installFakeOpenAi,MODELS,PLAN_MODEL,RESPONSES,signIn,TOKEN} from './chatgpt-fixture.ts';
import {boundedPlanFetch,openChatgptPlan,PLAN_REQUEST_LIMIT_MS} from '../../src/provider/chatgpt-plan.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import {collectHeadlessRun} from '../../src/headless/run.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
/** A server that accepts and never answers: the request ends only when its signal does. */
function silentServer(){
  const seen:Array<{method:string;signal:AbortSignal|null;ended:'no'|'aborted'}>=[];
  const send=((_url:any,init:any={})=>{
    const entry={method:String(init?.method??'GET'),signal:init?.signal instanceof AbortSignal?init.signal as AbortSignal:null,ended:'no' as 'no'|'aborted'};seen.push(entry);
    return new Promise<Response>((_resolve,reject)=>{entry.signal?.addEventListener('abort',()=>{entry.ended='aborted';reject(Object.assign(new Error('aborted'),{name:'AbortError'}));},{once:true});});
  }) as typeof fetch;
  return{send,seen};
}

test('a read with no signal gets a time limit; a request that writes, or that has its own signal, is passed as it came',async()=>{
  assert.equal(PLAN_REQUEST_LIMIT_MS,30_000);
  const server=silentServer();const requests=boundedPlanFetch(server.send,{limitMs:60});
  const read=requests.fetchImpl('https://api.openai.com/v1/models',{headers:{accept:'application/json'}}).catch(error=>error);
  const write=requests.fetchImpl('https://auth.openai.com/api/accounts/oauth/token',{method:'POST',body:'grant_type=refresh_token'});void write.catch(()=>{});
  const own=new AbortController();
  const signalled=requests.fetchImpl('https://api.openai.com/v1/models',{signal:own.signal});void signalled.catch(()=>{});
  await sleep(150);
  assert.equal((await read)?.name,'AbortError','a list nobody answers held its request past the limit');
  assert.deepEqual(server.seen.map(entry=>[entry.method,entry.signal!==null,entry.ended]),[['GET',true,'aborted'],['POST',false,'no'],['GET',true,'no']]);
  assert.equal(server.seen[2]!.signal,own.signal,'a request with its own signal is not given another');
  /* a renewal is never ended by the stop either: it may already have spent the refresh token */
  requests.stop();await sleep(10);
  assert.equal(server.seen[1]!.ended,'no');
  own.abort();
});

test('`run` carries the asker\'s signal to the reads made inside it, and `stop` ends the reads on their way',async()=>{
  const server=silentServer();const requests=boundedPlanFetch(server.send,{limitMs:60_000});
  const check=new AbortController();
  /* as the kernel's list does it: an await (the token) before the request */
  const inside=requests.run(check.signal,async()=>{await sleep(5);return requests.fetchImpl('https://api.openai.com/v1/models');}).catch(error=>error);
  const outside=requests.fetchImpl('https://api.openai.com/v1/models').catch(error=>error);
  await sleep(30);
  check.abort();await sleep(10);
  assert.deepEqual(server.seen.map(entry=>entry.ended).sort(),['aborted','no'],'the check that ended took its own request with it, and only that one');
  assert.equal((await inside)?.name,'AbortError');
  requests.stop();
  assert.equal((await outside)?.name,'AbortError');
  assert.deepEqual(server.seen.map(entry=>entry.ended),['aborted','aborted']);
  /* nothing is left to stop, and a later read is a new one */
  requests.stop();
  const answered=boundedPlanFetch((async()=>new Response('{}',{status:200})) as typeof fetch);
  assert.equal((await answered.fetchImpl('https://api.openai.com/v1/models')).status,200);
});

test('through the plan: the list is a bounded read that `models({signal})` and `stopRequests` end; the sign-in\'s exchange is not touched',async()=>{
  await hermetic(async h=>{
    const fake=fakeOpenAi();const sent:Array<{url:string;method:string;signal:AbortSignal|null}>=[];let silent=false;
    const fetchImpl=((url:any,options:any={})=>{
      const signal=options?.signal instanceof AbortSignal?options.signal as AbortSignal:null;
      sent.push({url:String(url),method:String(options?.method??'GET'),signal});
      if(!silent||String(url)!==MODELS)return fake.fetchImpl(url,options);
      return new Promise<Response>((_resolve,reject)=>{signal?.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});});
    }) as typeof fetch;
    const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:createMemoryKeyring(h.paths.dataRoot),dataRoot:h.paths.dataRoot,fetchImpl});
    assert.equal((await signIn(plan,{...fake,fetchImpl} as any)).outcome.ok,true);
    const exchange=sent.filter(call=>call.url===TOKEN);
    assert.ok(exchange.length>=1&&exchange.every(call=>call.method==='POST'&&call.signal===null),'the token exchange is sent as the kernel sends it');
    assert.equal((await plan!.models({reload:true})).length,1);
    assert.ok(sent.filter(call=>call.url===MODELS).every(call=>call.signal!==null),'the list carries a signal');
    silent=true;
    const check=new AbortController();
    const asked=plan!.models({reload:true,signal:check.signal}).catch(error=>error);
    await sleep(30);check.abort();
    assert.equal((await asked)?.code,'CHATGPT_RETE','the list ended with its asker');
    const windowAsked=plan!.models({reload:true}).catch(error=>error);
    await sleep(30);plan!.stopRequests();
    assert.equal((await windowAsked)?.code,'CHATGPT_RETE','and a read nobody gave a signal to ends at the stop');
    silent=false;
    await plan!.signOut();
  });
});

/* The turn. `boundedPlanFetch` marks what passes through it by being on the stack when the request leaves: the plan's list is
   (the control), the Responses stream of a turn is not — so no limit of the plan can cut a turn that runs for minutes. */
test('a turn of the plan never passes through the plan\'s bounded fetch: the Responses stream is the kernel\'s own request',{timeout:180_000},async()=>{
  const fake=fakeOpenAi();const through:Array<{url:string;plan:boolean}>=[];
  const fetchImpl=((url:any,options:any={})=>{
    through.push({url:String(url),plan:/chatgpt-plan\.ts/u.test(String(new Error('where').stack))});
    return fake.fetchImpl(url,options);
  }) as typeof fetch;
  await hermetic(async h=>{
    const restore=installFakeOpenAi({...fake,fetchImpl});let context:any=null;
    try{
      const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
      context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:PLAN_MODEL,env:{...process.env},environmentKeys:'consent',keyring:createMemoryKeyring(h.paths.dataRoot)} as any);
      await context.tuiCatalog.chooseProvider('chatgpt');
      const login=await context.tuiCatalog.chatgpt.startLogin({open:()=>false});await followSignIn(login.url,fake);
      assert.equal((await login.outcome).ok,true);
      assert.equal((await context.tuiCatalog.providerModels('chatgpt')).listing,'live');
      const headless=await collectHeadlessRun(createRuntimeSupervisor({initialRuntime:context.runtime,runtimeFactory:()=>context.runtime}),{projectRoot:h.project,checkpointsRoot:h.paths.checkpointsRoot,model:PLAN_MODEL,permissionMode:'bypassPermissions',prompt:'Say hello.',protocolVersion:'v2'});
      assert.match(JSON.stringify(headless.result),/Done by the plan\./u);
      const lists=through.filter(call=>call.url===MODELS),turns=through.filter(call=>call.url===RESPONSES);
      assert.ok(lists.length>=1&&lists.every(call=>call.plan),'the control: the plan\'s list passes through the bounded fetch');
      assert.equal(turns.length,1);
      assert.equal(turns[0]!.plan,false,'the turn\'s stream passed through the plan\'s fetch: its 30 s limit would cut a long turn');
    }finally{
      await context?.chatgptAccess?.esci?.().catch(()=>{});await context?.runtime?.close?.().catch(()=>{});
      restore();
    }
  });
});
