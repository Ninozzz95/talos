/*
 * B1 slice 25 — the session runtime asks the CLI whether a model can be used NOW, and a benched key is not a usable key.
 *
 * Every scenario goes through the REAL composition (`composeTalosRuntime` with the kernel's own credential store, session
 * registry, agent service and owner runtime) and, where a run starts, a REAL run on a 127.0.0.1 fake. What differs from
 * production is only what must: an in-memory keyring, a temporary profile, dummy keys, fake providers, and a global fetch that
 * refuses and records every host but 127.0.0.1 (`first-run-fixture.ts`, `hermetic`).
 *
 * ⛔ These assert BEHAVIOUR only — whether a session starts, what a refusal names, what reached which fake — never the shape of
 *   the readiness function the composition hands the session registry, so they keep holding when that function is replaced by
 *   the kernel's own.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,settle,startFakeProvider,writeProviderRuntime,type FakeProvider,type Hermetic} from '../provider/first-run-fixture.ts';

const REGISTRY=(await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href)).REGISTRO_FORNITORI as Record<string,any>;
const label=(id:string)=>String(REGISTRY[id].etichetta);
/* A DeepSeek model the registry does not list: since 0.6.13 DeepSeek Flash has a 1M window, so a session on it starts the Context
   Engine, which these readiness tests are not about (as auxiliary-provider-route.test.ts). */
const DEEPSEEK_MODEL='deepseek:deepseek-unlisted-test';
const OPENROUTER_MODEL='openrouter:vendor/live-model-a';
const LIVE=[{id:'deepseek-unlisted-test',name:'DeepSeek (test, not listed)'},{id:'vendor/live-model-a',name:'Live Model A'}];

const chats=(provider:FakeProvider)=>provider.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/chat/completions'));
/** The time a person reads for "until when": local HH:MM, with the local date in front when it is not today. Written here, not imported. */
function clock(ms:number){
  const at=new Date(ms);const now=new Date();const two=(n:number)=>String(n).padStart(2,'0');
  const time=`${two(at.getHours())}:${two(at.getMinutes())}`;
  return at.toDateString()===now.toDateString()?time:`${at.getFullYear()}-${two(at.getMonth()+1)}-${two(at.getDate())} ${time}`;
}

/* A runtime composed here is closed at the end of its test (as auxiliary-provider-route.test.ts and
   chatgpt-plan-context-engine.test.ts): a database it left open could not be removed on Windows (EPERM) and kept the file's
   process from ending, which held the whole suite for over an hour. */
const opened:any[]=[];
const closing=(fn:(h:Hermetic)=>Promise<void>)=>hermetic(async h=>{try{await fn(h);}finally{for(const context of opened.splice(0))await context?.runtime?.close?.().catch(()=>{});}});
async function compose(h:Hermetic,{model,endpoints,modules}:{model:string;endpoints:Record<string,string>;modules?:any}){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,endpoints);
  const context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model,env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring(),...(modules?{modules}:{})} as any) as any;
  opened.push(context);
  return context;
}
async function outcome<T>(promise:Promise<T>):Promise<{value?:T;error?:any}>{try{return{value:await promise};}catch(error){return{error};}}
/** Waits for the end of a run that did start, so a test never leaves one running behind it. */
async function runEnd(context:any,id:string){
  return await new Promise<any>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('the session did not finish')),30000);
    let off:(()=>void)|null=null;let done=false;
    off=context.runtime.subscribe(id,(event:any)=>{if(done||(event?.type!=='RunFinished'&&event?.type!=='RunError'))return;done=true;clearTimeout(timer);queueMicrotask(()=>off?.());resolve(event);},0);
  });
}

test('RED 1: a DeepSeek session with a DeepSeek key and no OpenRouter key starts, and only DeepSeek receives anything',async()=>closing(async h=>{
  const deepseekKey=dummyKey('deepseek');
  const deepseek=await startFakeProvider({goodKey:deepseekKey,models:LIVE});const openrouter=await startFakeProvider({goodKey:dummyKey('openrouter-unused'),models:LIVE});
  try{
    const context=await compose(h,{model:DEEPSEEK_MODEL,endpoints:{deepseek:deepseek.url,openrouter:`${openrouter.url}/api/v1`}});
    context.providerStore.setKey('deepseek',deepseekKey);
    assert.equal(context.providerStore.getKey('openrouter'),null,'there is no OpenRouter key at all');
    await context.tuiCatalog.chooseProvider('deepseek');
    assert.deepEqual(await context.tuiCatalog.readiness(DEEPSEEK_MODEL),{ready:true,provider:'deepseek',model:DEEPSEEK_MODEL},'the screen lets the send through');

    const started=await outcome(context.runtime.start({projectRoot:h.project,prompt:'hi',model:DEEPSEEK_MODEL,permissionMode:'default'}));
    assert.equal(started.error,undefined,`the session started: ${started.error?.code} ${started.error?.message}`);
    const last=await runEnd(context,started.value as string);
    assert.equal(last?.type,'RunFinished',`the run finished: ${JSON.stringify(last).slice(0,400)}`);
    await settle(h.root);
    assert.ok(chats(deepseek).length>=1,'the run reached DeepSeek');
    assert.deepEqual([...new Set(chats(deepseek).map(r=>r.authorizedAs))],['good'],'with the DeepSeek key');
    assert.equal(openrouter.requests.length,0,'the OpenRouter endpoint received nothing');
    assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
  }finally{await deepseek.close();await openrouter.close();}
}));

test('a model that cannot be read is refused at start, before anything is sent, even with a usable OpenRouter key',async()=>closing(async h=>{
  const openrouterKey=dummyKey('openrouter');
  const openrouter=await startFakeProvider({goodKey:openrouterKey,models:LIVE});
  try{
    const context=await compose(h,{model:OPENROUTER_MODEL,endpoints:{openrouter:`${openrouter.url}/api/v1`}});
    context.providerStore.setKey('openrouter',openrouterKey);
    const refused=await outcome(context.runtime.start({projectRoot:h.project,prompt:'hi',model:'   ',permissionMode:'default'}));
    if(refused.value)await runEnd(context,refused.value as string).catch(()=>null);
    assert.ok(refused.error,`a session with an unreadable model was refused, not started (got session ${String(refused.value)})`);
    assert.equal(openrouter.requests.length,0,'nothing reached OpenRouter');
    assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
  }finally{await openrouter.close();}
}));

test('RED 2: a provider whose only key is benched is not usable: listed benched with cause and until when, readiness refuses naming it, the runtime refuses to start, and nothing is sent',async()=>closing(async h=>{
  const openrouterKey=dummyKey('openrouter');
  const openrouter=await startFakeProvider({goodKey:openrouterKey,models:LIVE});
  try{
    const context=await compose(h,{model:OPENROUTER_MODEL,endpoints:{openrouter:`${openrouter.url}/api/v1`}});
    context.providerStore.setKey('openrouter',openrouterKey);
    await context.tuiCatalog.chooseProvider('openrouter');
    // The kernel benches a key after a refusal it classifies (a rate limit here) until the provider's own reset time.
    const [entry]=context.providerStore.elencaPool('openrouter');const until=Date.now()+30*60_000;
    context.providerStore.mettiInPanchina('openrouter',entry.impronta,{classe:'traffico',resetAt:until});
    assert.equal(context.providerStore.hasKey('openrouter'),true,'the key is still stored');
    assert.equal(context.providerStore.getKey('openrouter'),null,'and cannot be used now');

    const row=(await context.tuiCatalog.listProviders()).find((candidate:any)=>candidate.id==='openrouter');
    assert.equal(row?.configured,false,'a benched key does not make the provider usable');
    assert.deepEqual(row?.benched,{cause:'rate limit',until,keys:1},'the row says it is benched, why, and until when');
    const ready=await context.tuiCatalog.readiness(OPENROUTER_MODEL);
    assert.deepEqual(ready,{ready:false,code:'PROVIDER_KEY_BENCHED',provider:'openrouter',message:`The ${label('openrouter')} key is benched until ${clock(until)} (rate limit), so nothing was sent to ${label('openrouter')}. Wait until then, or add another key with /provider.`});

    const refused=await outcome(context.runtime.start({projectRoot:h.project,prompt:'hi',model:OPENROUTER_MODEL,permissionMode:'default'}));
    if(refused.value)await runEnd(context,refused.value as string).catch(()=>null);
    assert.ok(refused.error,`the runtime refused to start (got session ${String(refused.value)})`);
    assert.equal(refused.error?.code,'PROVIDER_KEY_BENCHED','the runtime refuses with the code the screen gives');
    assert.equal(refused.error?.message,ready.ready===false?ready.message:null,'and with the same English sentence, not the kernel\'s own');
    assert.equal(openrouter.requests.length,0,'nothing reached OpenRouter');
    assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');

    // Counter-proof: the same key saved again (a fresh pool entry, not benched) starts a session. The refusal above was the bench.
    context.providerStore.setKey('openrouter',openrouterKey);
    assert.equal(context.providerStore.getKey('openrouter')===openrouterKey,true,'the key is usable again');
    assert.equal((await context.tuiCatalog.readiness(OPENROUTER_MODEL)).ready,true);
    const started=await outcome(context.runtime.start({projectRoot:h.project,prompt:'hi',model:OPENROUTER_MODEL,permissionMode:'default'}));
    assert.equal(started.error,undefined,`${started.error?.code} ${started.error?.message}`);
    assert.equal((await runEnd(context,started.value as string))?.type,'RunFinished');
    await settle(h.root);
    assert.deepEqual([...new Set(chats(openrouter).map(r=>r.authorizedAs))],['good']);
  }finally{await openrouter.close();}
}));

/*
 * Integration of B1 slice 25 — the kernel decides readiness (`creaProntoFn`); when its answer cannot be had, the CLI refuses.
 * Found by the coordinator's mutation K5 (an unreadable kernel answer turned into "ready"): no test crossed that branch.
 */
test('when the kernel cannot answer whether a model is usable, the session is refused, says TALOS could not tell, and nothing is sent',async()=>closing(async h=>{
  const openrouterKey=dummyKey('openrouter');
  const openrouter=await startFakeProvider({goodKey:openrouterKey,models:LIVE});
  try{
    const {loadModules}=await import('../../src/runtime/talos-composition.ts');
    const real=await loadModules(REPO_ROOT);
    for(const [name,creaProntoFn] of [
      ['a kernel readiness that throws',()=>()=>{throw new Error('kernel readiness failed');}],
      ['a kernel readiness that answers nothing readable',()=>()=>undefined],
    ] as Array<[string,any]>){
      const context=await compose(h,{model:OPENROUTER_MODEL,endpoints:{openrouter:`${openrouter.url}/api/v1`},modules:{...real,creaProntoFn}});
      context.providerStore.setKey('openrouter',openrouterKey);
      assert.equal(context.providerStore.getKey('openrouter'),openrouterKey,`${name}: the key itself is usable`);
      const refused=await outcome(context.runtime.start({projectRoot:h.project,prompt:'hi',model:OPENROUTER_MODEL,permissionMode:'default'}));
      if(refused.value)await runEnd(context,refused.value as string).catch(()=>null);
      assert.ok(refused.error,`${name}: refused, not started (got session ${String(refused.value)})`);
      assert.equal(refused.error?.code,'KERNEL_READINESS_UNREADABLE',name);
      assert.equal(refused.error?.message,`TALOS could not tell whether ${label('openrouter')} can be used now, so nothing was sent.`,name);
    }
    assert.equal(openrouter.requests.length,0,'nothing reached OpenRouter');
    assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
  }finally{await openrouter.close();}
}));
