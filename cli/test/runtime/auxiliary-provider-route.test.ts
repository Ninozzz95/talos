/*
 * B1 slice 24 — compaction and the research judge reach the provider of the model they name.
 *
 * Every scenario goes through the REAL composition (`composeTalosRuntime`, the kernel's own credential store, session
 * registry, agent service and owner runtime) and a REAL finished session run on a 127.0.0.1 fake. What differs from
 * production is only what must: an in-memory keyring, a temporary profile, dummy keys, fake providers, and a global
 * fetch that refuses and records every host but 127.0.0.1 (`first-run-fixture.ts`, `hermetic`).
 *
 * The defect these prove absent was measured by the coordinator's review of slice 18 and is filed as CLI-REQ-05:
 * the registry's default compaction and judge post to the fixed `https://openrouter.ai/api/v1/chat/completions`.
 *
 * 0.6.13 (22/10/2026, r4 4e4004950): the registry's /compact on the kernel path no longer calls the CLI's `compattaSessioneFn`. It
 * summarises the way the end-of-turn summary does: from the projection, through `riassumiPerCompattazioneFn` (agent-service), on
 * the light model the CLI's `modelloRiassuntoFn` names, over the CLI's `fetchModelloFn` (the guarded auxiliary route). It keeps the
 * system messages, the first request, the last three requests and the last two exchanges word for word (`dividiPerCompattazione`),
 * so a one-exchange session answers `niente-da-compattare` and sends nothing: every session here runs TURNS requests. A summary
 * that fails is no longer thrown: the registry answers `{compattato:false, motivo:'errore', codice, dettaglio}` and the screen says
 * it with that code (tui/app.ts `compactResultView`). Each property below is checked on the wire, on the 127.0.0.1 fakes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,settle,startFakeProvider,writeProviderRuntime,type FakeProvider,type Hermetic} from '../provider/first-run-fixture.ts';
import {runTurn} from './r5a-r-fixture.ts';
import {compactResultView} from '../../src/tui/app.ts';
import {missingKeyText} from '../../src/provider/missing-key.ts';

/* 0.6.13: a DeepSeek model the registry does not list, so its window is unknown and these sessions keep the kernel's own compaction,
   the path these tests are about. DeepSeek Flash has a known window since r4 42159b983 (1M), and with it the Context Engine compacts
   instead (and a one-exchange session has nothing to compact, CTX_NOTHING_TO_COMPACT). */
const DEEPSEEK_MODEL='deepseek:deepseek-unlisted-test';
const OPENROUTER_MODEL='vendor/live-model-a';
const LIVE=[{id:'deepseek-unlisted-test',name:'DeepSeek (test, not listed)'},{id:'vendor/live-model-a',name:'Live Model A'}];

const chats=<R extends {method:string;path:string}>(provider:{requests:R[]})=>provider.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/chat/completions'));

/* 0.6.13 (22/10/2026): a chat provider on 127.0.0.1 that also records the model each request names and whether it offered tools
   (a turn does, the summary of a compaction does not: `riassumiPerCompattazione` sends `attrezzi: []`), so the light model and
   "exactly one summary request" are read on the wire. Answers after `delayMs`, and logs in a log shared with other providers when it
   received a chat request and when it finished answering. `/models` lists LIVE, as the fixture's provider does. Never a header value. */
type RecordedRequest=FakeProvider['requests'][number]&{model:string|null;summary:boolean};
type RecordingProvider={url:string;port:number;requests:RecordedRequest[];close():Promise<void>};
async function startRecordingProvider({name='provider',goodKey,delayMs=0,log=[]}:{name?:string;goodKey:string;delayMs?:number;log?:string[]}):Promise<RecordingProvider>{
  const requests:RecordedRequest[]=[];
  const json=(res:http.ServerResponse,status:number,body:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url??'/','http://127.0.0.1');const auth=typeof req.headers.authorization==='string'?req.headers.authorization:null;
    let raw='';for await(const chunk of req)raw+=chunk;
    let body:any={};try{body=JSON.parse(raw||'{}');}catch{body={};}
    requests.push({method:String(req.method),path:url.pathname,hadAuthorization:Boolean(auth),authorizedAs:auth?auth===`Bearer ${goodKey}`?'good':'other':null,
      model:typeof body?.model==='string'?body.model:null,summary:!(Array.isArray(body?.tools)&&body.tools.length>0)});
    if(req.method==='GET'&&url.pathname.endsWith('/models/user')){if(auth!==`Bearer ${goodKey}`)return json(res,401,{error:{message:'No auth credentials found',code:401}});return json(res,200,{data:LIVE});}
    if(req.method==='GET'&&url.pathname.endsWith('/models'))return json(res,200,{data:LIVE});
    if(req.method!=='POST'||!url.pathname.endsWith('/chat/completions'))return json(res,404,{error:{message:'not found'}});
    log.push(`${name}:received`);
    if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
    if(auth!==`Bearer ${goodKey}`){json(res,401,{error:{message:'Invalid credentials'}});log.push(`${name}:answered`);return;}
    /* r4 79dbe20e3 (22/10/2026): a summary is not paid when it cannot reduce (256 tokens or less above the floor), so the session's
       answers are long and a summary request (no tools offered) gets a short one: there is something to compact, and it does reduce.
       r4 109b7d9b0: a summary is paid only when what it can remove is more than the summary itself (its expected size, 400 tokens at
       least) plus the frame, so the answers are longer still (about 13,000 characters each) */
    const content=Array.isArray(body.tools)&&body.tools.length>0?`OK. ${'This answer carries enough words to be worth summarising later. '.repeat(200)}`:'Summary: the person asked for greetings.';
    if(body.stream){
      res.writeHead(200,{'content-type':'text/event-stream'});
      res.write(`data: ${JSON.stringify({id:'c1',choices:[{index:0,delta:{role:'assistant',content}}]})}\n\n`);
      res.write(`data: ${JSON.stringify({id:'c1',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:1,total_tokens:4}})}\n\n`);
      res.end('data: [DONE]\n\n');
    }else json(res,200,{id:'c1',choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:1,total_tokens:4}});
    log.push(`${name}:answered`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port=(server.address() as any).port as number;
  return{url:`http://127.0.0.1:${port}`,port,requests,close:()=>new Promise<void>(resolve=>{server.closeAllConnections?.();server.close(()=>resolve());})};
}

/* 0.6.13: since r4 42159b983 the registry knows DeepSeek Flash's window (1M), so these sessions run with the Context Engine, which
   opens its database in the profile. A runtime composed here is closed at the end of its test, as the other Context Engine tests
   close theirs (chatgpt-plan-context-engine.test.ts): an open database could not be removed on Windows (EPERM) and kept the file's
   process from ending. */
const opened:any[]=[];
const closing=(fn:(h:Hermetic)=>Promise<void>)=>hermetic(async h=>{try{await fn(h);}finally{for(const context of opened.splice(0))await context?.runtime?.close?.().catch(()=>{});}});
async function compose(h:Hermetic,{model,endpoints,env={...process.env},modules}:{model:string;endpoints:Record<string,string>;env?:Record<string,string|undefined>;modules?:any}){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,endpoints);
  const context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model,env,environmentKeys:'consent',keyring:fakeKeyring(),...(modules?{modules}:{})} as any) as any;
  opened.push(context);
  return context;
}

/* 0.6.13 (22/10/2026): the first request, then four more. `dividiPerCompattazione` keeps the first request, the last three and the
   last two exchanges word for word, so the first two exchanges are the middle a /compact summarises (`tagliabile`); with fewer
   turns the registry answers `niente-da-compattare` and sends nothing, and no property below could be seen on the wire. */
const TURNS=5;
/** Starts a session through the runtime facade, runs TURNS requests in it, and waits until its final messages are stored. */
async function finishedSession(context:any,h:Hermetic,model:string,{turns=TURNS}:{turns?:number}={}):Promise<string>{
  const id:string=await context.runtime.start({projectRoot:h.project,prompt:'request 1: say hi',model,permissionMode:'default'});
  const last:any=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('the session did not finish')),30000);
    let off:(()=>void)|null=null;let done=false;
    off=context.runtime.subscribe(id,(event:any)=>{if(done||(event?.type!=='RunFinished'&&event?.type!=='RunError'))return;done=true;clearTimeout(timer);queueMicrotask(()=>off?.());resolve(event);},0);
  });
  assert.equal(last?.type,'RunFinished',`the session run finished: ${JSON.stringify(last).slice(0,400)}`);
  for(let n=2;n<=turns;n++){
    const {raw}=await runTurn(context,h,`request ${n}: say hi again`,{sessionId:id,permissionMode:'default',timeoutMs:30_000});
    const end=raw.find((event:any)=>event?.type==='RunFinished'||event?.type==='RunError'||event?.type==='RunCancelled');
    assert.equal(end?.type,'RunFinished',`request ${n} finished: ${JSON.stringify(end).slice(0,400)}`);
  }
  // The registry stores the final messages after RunFinished is broadcast, and persists them: wait for the disk to be quiet.
  await context.registry.attendiAssestamento?.(id);
  await settle(h.root);
  return id;
}
/** The view /compact gives of a result (tui/app.ts): a failure keeps its code, «already compact» is only nothing to compact. */
const screenOf=(value:unknown)=>compactResultView(value);

async function outcome<T>(promise:Promise<T>):Promise<{value?:T;error?:any}>{try{return{value:await promise};}catch(error){return{error};}}

/* 0.6.13: the summary runs on the provider's light model when the CLI knows its window (`modelloRiassuntoFn`, review 1 S3-1):
   DeepSeek's is `deepseek-flash` (registry row, 1M), sent to DeepSeek without its prefix. */
test('RED 1: compacting a DeepSeek session reaches DeepSeek with the DeepSeek key, on DeepSeek\'s light model, and nothing reaches OpenRouter',async()=>closing(async h=>{
  const deepseekKey=dummyKey('deepseek');const openrouterKey=dummyKey('openrouter');
  const deepseek=await startRecordingProvider({goodKey:deepseekKey});const openrouter=await startRecordingProvider({goodKey:openrouterKey});
  try{
    const context=await compose(h,{model:DEEPSEEK_MODEL,endpoints:{deepseek:deepseek.url,openrouter:`${openrouter.url}/api/v1`}});
    context.providerStore.setKey('deepseek',deepseekKey);
    // Today the registry refuses to start any session without an OpenRouter key (CLI-REQ-05 §1): it is saved, and must stay unused.
    context.providerStore.setKey('openrouter',openrouterKey);
    const id=await finishedSession(context,h,DEEPSEEK_MODEL);
    const runRequests=chats(deepseek).length;
    assert.equal(runRequests,TURNS,'the session runs themselves reached DeepSeek, one request each');
    assert.deepEqual(h.network.blocked,[],'nothing left the machine during the runs');

    const result=await outcome(context.runtime.compact(id));
    assert.deepEqual(h.network.blocked,[],'compaction made no attempt to reach any host but 127.0.0.1 (openrouter.ai included)');
    assert.equal(openrouter.requests.length,0,'the OpenRouter endpoint received nothing');
    assert.deepEqual(chats(deepseek).slice(runRequests).map(r=>[r.authorizedAs,r.model,r.summary]),[['good','deepseek-flash',true]],'compaction reached DeepSeek once, with the DeepSeek key, asking the light model for a summary');
    assert.equal(result.error,undefined,String(result.error?.code??result.error));
    assert.equal(result.value?.compattato,true,`the summary replaced the history: ${JSON.stringify(result.value)}`);
  }finally{await deepseek.close();await openrouter.close();}
}));

/* 0.6.13: an OpenRouter id written without a provider prefix has no light model of its own (`auxiliaryModelId` keeps it), so the
   summary is asked of the conversation's own model. */
test('RED 2: compacting an OpenRouter session reaches the configured OpenRouter endpoint, not the fixed address',async()=>closing(async h=>{
  const openrouterKey=dummyKey('openrouter');
  const openrouter=await startRecordingProvider({goodKey:openrouterKey});
  try{
    const context=await compose(h,{model:OPENROUTER_MODEL,endpoints:{openrouter:`${openrouter.url}/api/v1`}});
    context.providerStore.setKey('openrouter',openrouterKey);
    const id=await finishedSession(context,h,OPENROUTER_MODEL);
    const runRequests=chats(openrouter).length;
    assert.equal(runRequests,TURNS,'the session runs themselves reached the configured OpenRouter endpoint');

    const result=await outcome(context.runtime.compact(id));
    assert.deepEqual(h.network.blocked,[],'compaction made no attempt to reach https://openrouter.ai');
    const compaction=chats(openrouter).slice(runRequests);
    assert.deepEqual(compaction.map(r=>[r.path,r.authorizedAs,r.model,r.summary]),[['/api/v1/chat/completions','good',OPENROUTER_MODEL,true]],'compaction reached the configured endpoint once, with the OpenRouter key');
    assert.equal(result.error,undefined,String(result.error?.code??result.error));
    assert.equal(result.value?.compattato,true,JSON.stringify(result.value));
  }finally{await openrouter.close();}
}));

/* 0.6.13 (review 1 S3-1): OpenRouter declares a light model (`liquid/lfm-2.5-2.6b:free`), and no source in this profile knows its
   window (no registry row, not in the provider's list, models.dev off). The summary is then asked of the conversation's own model,
   never of a light model whose window could not hold it. */
test('a light model whose window is unknown is not used: the summary is asked of the conversation\'s own model, on its own provider',async()=>closing(async h=>{
  const openrouterKey=dummyKey('openrouter');
  const openrouter=await startRecordingProvider({goodKey:openrouterKey});
  const model=`openrouter:${OPENROUTER_MODEL}`;
  try{
    const context=await compose(h,{model,endpoints:{openrouter:`${openrouter.url}/api/v1`}});
    context.providerStore.setKey('openrouter',openrouterKey);
    const id=await finishedSession(context,h,model);
    const runRequests=chats(openrouter).length;
    assert.deepEqual(chats(openrouter).map(r=>r.model),Array(TURNS).fill(OPENROUTER_MODEL),'the runs asked the conversation\'s model');

    const result=await outcome(context.runtime.compact(id));
    assert.deepEqual(h.network.blocked,[]);
    assert.deepEqual(chats(openrouter).slice(runRequests).map(r=>[r.authorizedAs,r.model,r.summary]),[['good',OPENROUTER_MODEL,true]],'one summary request, on the conversation\'s own model, not on liquid/lfm-2.5-2.6b:free');
    assert.equal(result.value?.compattato,true,`${String(result.error?.code??'')} ${JSON.stringify(result.value)}`);
  }finally{await openrouter.close();}
}));

test('RED 3: the research judge for a DeepSeek model reaches DeepSeek with the DeepSeek key, and nothing reaches OpenRouter',async()=>closing(async h=>{
  const deepseekKey=dummyKey('deepseek');const openrouterKey=dummyKey('openrouter');
  const deepseek=await startFakeProvider({goodKey:deepseekKey,models:LIVE});const openrouter=await startFakeProvider({goodKey:openrouterKey,models:LIVE});
  const store:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','research-store.mjs')).href);
  try{
    /* The production module set, with one observer: the session launch input carries the registry's own research
       deposit (`componiRapportoRicercaFn`, session-registry.mjs:3159), the function the kernel's `research_deposit` calls.
       Calling it runs the registry's research orchestrator, whose judge is the registry's `chiediAlModelloFn`. */
    const {loadModules}=await import('../../src/runtime/talos-composition.ts');
    const real:any=await loadModules(REPO_ROOT);
    let deposit:any=null;
    const modules={...real,avviaSessione:(input:any)=>{deposit=input.componiRapportoRicercaFn;return real.avviaSessione(input);}};
    const context=await compose(h,{model:DEEPSEEK_MODEL,endpoints:{deepseek:deepseek.url,openrouter:`${openrouter.url}/api/v1`},modules});
    context.providerStore.setKey('deepseek',deepseekKey);context.providerStore.setKey('openrouter',openrouterKey);
    await finishedSession(context,h,DEEPSEEK_MODEL);
    assert.equal(typeof deposit,'function','the registry handed the session its research deposit');
    const runRequests=chats(deepseek).length;

    // A research authored by another model, whose judge is the DeepSeek model, with the text of its one source held on disk.
    const id='slice24-judge';const url='https://example.invalid/sky';const held='Measured in this test: the fake sky over the loopback address is blue.';
    await store.creaRicerca({cartella:h.project,id,domanda:'Is the fake sky blue?',profondita:'deep',modello:'vendor/author-model',modelloGiudice:DEEPSEEK_MODEL});
    const {ref}=await store.scriviFonte({cartella:h.project,id,testo:held});
    await store.scriviIndiceFonti({cartella:h.project,id,voci:[{url,ref}]});

    const composed=await deposit({id,domanda:'Is the fake sky blue?',testo:'The fake sky is blue.',affermazioni:[{testo:'The fake sky is blue.',fonte:url,passaggio:'the fake sky over the loopback address is blue'}],fonti:[{url,titolo:'Sky',letta:true}]});
    assert.equal(composed?.ok,true,JSON.stringify(composed).slice(0,400));
    assert.deepEqual(h.network.blocked,[],'the judge made no attempt to reach any host but 127.0.0.1 (openrouter.ai included)');
    assert.equal(openrouter.requests.length,0,'the OpenRouter endpoint received nothing');
    const judged=chats(deepseek).slice(runRequests);
    assert.ok(judged.length>=1,'the judge reached DeepSeek');
    assert.deepEqual([...new Set(judged.map(r=>r.authorizedAs))],['good'],'every judge request carried the DeepSeek key');
  }finally{await deepseek.close();await openrouter.close();}
}));

/* 0.6.13: a summary that fails is the registry's `{compattato:false, motivo:'errore', codice, dettaglio}` (no longer thrown); the
   code is the one the route raised before the network (`PRE_NETWORK_CODES`), the detail the CLI's own sentence, and the screen
   says it as that failure, never «already compact». */
test('RED 4: with no DeepSeek key, compaction says the key is missing and sends nothing anywhere',async()=>closing(async h=>{
  const deepseekKey=dummyKey('deepseek');const openrouterKey=dummyKey('openrouter');
  const deepseek=await startRecordingProvider({goodKey:deepseekKey});const openrouter=await startRecordingProvider({goodKey:openrouterKey});
  try{
    const context=await compose(h,{model:DEEPSEEK_MODEL,endpoints:{deepseek:deepseek.url,openrouter:`${openrouter.url}/api/v1`}});
    context.providerStore.setKey('deepseek',deepseekKey);context.providerStore.setKey('openrouter',openrouterKey);
    const id=await finishedSession(context,h,DEEPSEEK_MODEL);
    context.providerStore.clearKey('deepseek');
    assert.equal(context.providerStore.getKey('deepseek'),null,'the DeepSeek key is gone');
    const before={deepseek:deepseek.requests.length,openrouter:openrouter.requests.length};

    const result=await outcome(context.runtime.compact(id));
    assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
    assert.deepEqual({deepseek:deepseek.requests.length,openrouter:openrouter.requests.length},before,'no fake received anything');
    assert.equal(result.error,undefined,String(result.error?.code??result.error));
    /* block 19 of the Desktop: the kernel says which summary model it cannot use, and why */
    assert.deepEqual([result.value?.compattato,result.value?.motivo,result.value?.nonDisponibile?.stato,result.value?.nonDisponibile?.motivo],[false,'non-disponibile','inutilizzabile','senza-chiave'],`compaction named the missing key, got ${JSON.stringify(result.value)}`);
    const screen:any=screenOf(result.value);
    assert.deepEqual([screen.kind,screen.code],['failed','PROVIDER_KEY_MISSING'],'/compact says the failure with its code, not «already compact»');
    assert.ok(screen.headline.includes(missingKeyText('deepseek')),`the screen has the CLI\'s one missing-key sentence (R2 E8): ${screen.headline}`);
  }finally{await deepseek.close();await openrouter.close();}
}));

test('RED 5: in consent mode an unapproved DEEPSEEK_API_KEY in the environment is not used by compaction',async()=>closing(async h=>{
  const deepseekKey=dummyKey('deepseek');const openrouterKey=dummyKey('openrouter');
  const deepseek=await startRecordingProvider({goodKey:deepseekKey});const openrouter=await startRecordingProvider({goodKey:openrouterKey});
  try{
    const endpoints={deepseek:deepseek.url,openrouter:`${openrouter.url}/api/v1`};
    // The session runs on a saved DeepSeek key, with no DeepSeek variable in the environment.
    const first=await compose(h,{model:DEEPSEEK_MODEL,endpoints});
    first.providerStore.setKey('deepseek',deepseekKey);first.providerStore.setKey('openrouter',openrouterKey);
    const id=await finishedSession(first,h,DEEPSEEK_MODEL);
    /* Then a restart on the same profile: no saved DeepSeek key (a fresh keyring), and the same value exported but never
       answered. Removing the saved key with `clearKey` instead would not do: the kernel store then withholds the environment
       for that provider even once approved (`provider-credential-store.mjs:401-404`), and the counter-proof below could not bite. */
    const context=await compose(h,{model:DEEPSEEK_MODEL,endpoints,env:{...process.env,DEEPSEEK_API_KEY:deepseekKey}});
    assert.equal((await context.tuiCatalog.listProviders()).find((row:any)=>row.id==='deepseek')?.keySource,'environment-unanswered','the screen knows the variable and has not asked yet');
    assert.equal(context.providerStore.getKey('deepseek'),null,'the unapproved environment key is not visible to the store');
    const before={deepseek:deepseek.requests.length,openrouter:openrouter.requests.length};

    const refused=await outcome(context.runtime.compact(id));
    assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
    assert.deepEqual({deepseek:deepseek.requests.length,openrouter:openrouter.requests.length},before,'the environment key was not sent anywhere');
    assert.equal(refused.error,undefined,String(refused.error?.code??refused.error));
    assert.deepEqual([refused.value?.compattato,refused.value?.motivo,refused.value?.nonDisponibile?.motivo],[false,'non-disponibile','senza-chiave'],`got ${JSON.stringify(refused.value)}`);

    // Counter-proof: the same key, once approved, is used by the same compaction path. The refusal above was consent, not a bad key.
    await context.tuiCatalog.answerEnvironmentKey('deepseek','yes');
    assert.equal(context.providerStore.getKey('deepseek')===deepseekKey,true,'the approved environment key is now visible to the store');
    const approved=await outcome(context.runtime.compact(id));
    assert.deepEqual(h.network.blocked,[]);
    assert.equal(openrouter.requests.length,before.openrouter,'OpenRouter still received nothing');
    assert.deepEqual(chats(deepseek).slice(before.deepseek).map(r=>[r.authorizedAs,r.summary]),[['good',true]],'the approved environment key reached DeepSeek, once, with the summary request');
    assert.equal(approved.value?.compattato,true,`${String(approved.error?.code??'')} ${JSON.stringify(approved.value)}`);
  }finally{await deepseek.close();await openrouter.close();}
}));

/* The two refusals the injection adds. Each replaces ONE production module with a kernel that misbehaves in the way the
   refusal exists for; everything else, the finished session included, is the production composition. */
async function sessionWithModules(h:Hermetic,override:(real:any)=>any){
  const deepseekKey=dummyKey('deepseek');const openrouterKey=dummyKey('openrouter');
  const deepseek=await startRecordingProvider({goodKey:deepseekKey});const openrouter=await startRecordingProvider({goodKey:openrouterKey});
  const {loadModules}=await import('../../src/runtime/talos-composition.ts');
  const real:any=await loadModules(REPO_ROOT);
  const context=await compose(h,{model:DEEPSEEK_MODEL,endpoints:{deepseek:deepseek.url,openrouter:`${openrouter.url}/api/v1`},modules:override(real)});
  context.providerStore.setKey('deepseek',deepseekKey);context.providerStore.setKey('openrouter',openrouterKey);
  const id=await finishedSession(context,h,DEEPSEEK_MODEL);
  return{context,id,deepseek,openrouter,openrouterKey,close:async()=>{await deepseek.close();await openrouter.close();}};
}

/*
 * 0.6.13 (22/10/2026): the kernel's summary call is now `riassumiPerCompattazioneFn` (agent-service `riassumiPerCompattazione`), and
 * the registry hands it `chiaveFn()`, which the CLI composes as the OpenRouter key (talos-composition.ts, `chiaveFn`), instead of
 * the per-runtime placeholder `compattaSessioneFn` handed `compattaSessione` until r4 4e4004950. The misbehaving kernel goes in where
 * the summary call is made: the registry option when the CLI passes none (today), else the module the CLI's own wrapper would call
 * (`modules.riassumiPerCompattazione`), so the test reads the same before and after a cure.
 * ⛔ RED since r4 4e4004950, product defect (CLI): the kernel's summary call holds the OpenRouter key, so a summary request the route
 * did not rewrite is no longer refused by `auxiliaryNetwork` (it refuses only the placeholder) and goes to https://openrouter.ai with
 * the OpenRouter key and the conversation. Measured here: the hermetic fetch records the attempt on https://openrouter.ai.
 */
test('a kernel request that the route did not rewrite is refused before the network, and the kernel never holds the OpenRouter key',async()=>closing(async h=>{
  const seen:{chiave?:unknown}={};
  // A kernel whose summary posts a body without a model to its own fixed address: the route passes such a request through untouched.
  const misbehaving=async({messaggi,chiave,fetchDiRete,modello}:any)=>{
    seen.chiave=chiave;
    const send=(attempt:any)=>attempt('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${chiave}`,'Content-Type':'application/json'},body:JSON.stringify({messages:messaggi})});
    if(typeof fetchDiRete?.eseguiConFallback==='function')await fetchDiRete.eseguiConFallback(({fetchDiRete:attempt}:any)=>send(attempt),{modello});else await send(fetchDiRete);
    return{scelta:{role:'assistant',content:'A summary.'},finishReason:'stop',usage:null};
  };
  const s=await sessionWithModules(h,real=>({...real,riassumiPerCompattazione:misbehaving,
    createSessionRegistry:(options:any)=>real.createSessionRegistry({...options,riassumiPerCompattazioneFn:options?.riassumiPerCompattazioneFn??misbehaving})}));
  try{
    const before={deepseek:s.deepseek.requests.length,openrouter:s.openrouter.requests.length};
    const result=await outcome(s.context.runtime.compact(s.id));
    assert.equal(typeof seen.chiave,'string','the misbehaving summary call was made');
    assert.deepEqual(h.network.blocked,[],'the unrouted request never reached the network (here: no attempt on https://openrouter.ai)');
    assert.deepEqual({deepseek:s.deepseek.requests.length,openrouter:s.openrouter.requests.length},before,'no fake received anything');
    assert.notEqual(seen.chiave,s.openrouterKey,'the kernel was handed a placeholder, not the OpenRouter key');
    assert.equal(result.error,undefined,String(result.error?.code??result.error));
    assert.deepEqual([result.value?.compattato,result.value?.codice],[false,'AUXILIARY_CALL_NOT_ROUTED'],`got ${JSON.stringify(result.value)}`);
  }finally{await s.close();}
}));

/* 0.6.13: the registry calls `fetchModelloFn()` while building the summary call; without the route it throws AUXILIARY_ROUTE_UNAVAILABLE
   there, and the registry answers that failure with its code instead of falling back to its bare `fetch` (the fixed address). */
test('a kernel without the multi-provider route refuses compaction instead of falling back to the registry default',async()=>closing(async h=>{
  const s=await sessionWithModules(h,real=>({...real,creaFetchMultiProvider:undefined}));
  try{
    const before={deepseek:s.deepseek.requests.length,openrouter:s.openrouter.requests.length};
    const result=await outcome(s.context.runtime.compact(s.id));
    assert.deepEqual(h.network.blocked,[],'nothing tried to reach openrouter.ai');
    assert.deepEqual({deepseek:s.deepseek.requests.length,openrouter:s.openrouter.requests.length},before,'no fake received anything');
    assert.equal(result.error,undefined,String(result.error?.code??result.error));
    assert.deepEqual([result.value?.compattato,result.value?.motivo,result.value?.codice],[false,'errore','AUXILIARY_ROUTE_UNAVAILABLE'],`got ${JSON.stringify(result.value)}`);
    assert.equal((screenOf(result.value) as any).code,'AUXILIARY_ROUTE_UNAVAILABLE','/compact says it as that failure');
  }finally{await s.close();}
}));

/*
 * Condition C1 — compaction uses the SESSION's model. `session-registry.mjs:4217` passes the model the registry was composed
 * with, and the product composes once with the launch model while `/model` changes only the model sessions start with.
 * 0.6.13 (22/10/2026): since r4 4e4004950 the registry's /compact names the session's own model itself (`modelloDiSessionePerRete`)
 * and no longer calls `compattaSessioneFn`, where the CLI's compaction scope lived. What the CLI keeps is in `compactSession`: the
 * session's own row is read first (`compactionOf`: a local session and a session without a model are refused before the registry is
 * asked), and one compaction at a time. The light model (`deepseek-flash`) is DeepSeek's own, so «only its own provider» holds for it.
 * ⛔ The startSlowProvider of slice 24 is now `startRecordingProvider` (above), with the same log and delay.
 */

/** Rewrites the header (and any settings row) of a persisted session, as a session written that way would read after a restart. */
function rewriteSessionHeader(h:Hermetic,sessionId:string,change:(record:any)=>any){
  const file=path.join(h.paths.sessionsRoot,`${sessionId}.jsonl`);
  let changed=0;
  const lines=fs.readFileSync(file,'utf8').split('\n').map(line=>{
    if(!line.trim())return line;
    const record=JSON.parse(line);
    if(record?.tipo!=='intestazione'&&record?.tipo!=='impostazioni-sessione')return line;
    changed+=1;return JSON.stringify(change(record));
  });
  assert.ok(changed>=1,`the header of ${sessionId} was found`);
  fs.writeFileSync(file,lines.join('\n'));
}

for(const composedWith of ['openrouter:vendor/live-model-a','openai:gpt-5-mini']){
  test(`C1: in a runtime composed with ${composedWith}, a DeepSeek session compacts on DeepSeek with the DeepSeek key`,async()=>closing(async h=>{
    const deepseekKey=dummyKey('deepseek');const openrouterKey=dummyKey('openrouter');
    const deepseek=await startRecordingProvider({goodKey:deepseekKey});const openrouter=await startRecordingProvider({goodKey:openrouterKey});
    try{
      const context=await compose(h,{model:composedWith,endpoints:{deepseek:deepseek.url,openrouter:`${openrouter.url}/api/v1`}});
      context.providerStore.setKey('deepseek',deepseekKey);context.providerStore.setKey('openrouter',openrouterKey);
      const id=await finishedSession(context,h,DEEPSEEK_MODEL);
      const runRequests=chats(deepseek).length;
      assert.equal(runRequests,TURNS,'the session runs themselves reached DeepSeek');

      const result=await outcome(context.runtime.compact(id));
      assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
      assert.equal(openrouter.requests.length,0,'the OpenRouter endpoint received nothing, run or compaction');
      assert.deepEqual(chats(deepseek).slice(runRequests).map(r=>[r.authorizedAs,r.model,r.summary]),[['good','deepseek-flash',true]],'compaction reached DeepSeek once, with the DeepSeek key, on DeepSeek\'s light model (never the registry\'s model)');
      assert.equal(result.error,undefined,`not refused: ${result.error?.code} ${result.error?.message}`);
      assert.equal(result.value?.compattato,true,JSON.stringify(result.value));
    }finally{await deepseek.close();await openrouter.close();}
  }));
}

/*
 * 0.6.13 (22/10/2026): «a compaction that bypasses the session runtime is refused» guarded slice 24's C1 defect: the registry
 * named ITS model, and only the scope the session runtime bound told `compattaSessioneFn` the session's. Since r4 4e4004950 the
 * registry no longer calls `compattaSessioneFn` and names the session's own model itself (`modelloDiSessionePerRete`), so that refusal
 * has no code path left (and the only caller of the registry's `compatta` is the session runtime's `compactSession`). Replaced by the
 * nearest guarantee of the new path: a compaction that bypasses the session runtime still names the SESSION's model and goes out only
 * through the CLI's route (its provider, its key, nothing to OpenRouter), and the registry itself refuses a session whose model it
 * cannot read. The local and model-less sessions keep the CLI's own refusal, said in the CLI's words, before the registry is asked.
 */
test('C1: a local session and a session whose model is unknown are refused before anything is sent, and a compaction that bypasses the session runtime still names the session\'s model on its own provider',async()=>closing(async h=>{
  const deepseekKey=dummyKey('deepseek');const openrouterKey=dummyKey('openrouter');
  const deepseek=await startRecordingProvider({goodKey:deepseekKey});const openrouter=await startRecordingProvider({goodKey:openrouterKey});
  try{
    const endpoints={deepseek:deepseek.url,openrouter:`${openrouter.url}/api/v1`};
    // Four finished DeepSeek sessions, persisted by the real registry, each long enough to have something to compact.
    const first=await compose(h,{model:DEEPSEEK_MODEL,endpoints});
    first.providerStore.setKey('deepseek',deepseekKey);first.providerStore.setKey('openrouter',openrouterKey);
    const localId=await finishedSession(first,h,DEEPSEEK_MODEL);
    const unknownId=await finishedSession(first,h,DEEPSEEK_MODEL);
    const bypassId=await finishedSession(first,h,DEEPSEEK_MODEL);
    const intactId=await finishedSession(first,h,DEEPSEEK_MODEL);
    /* One becomes what a local session looks like on disk (`provider:'local'`, the model a bare GGUF id: `session-registry.mjs:2667`
       and `:2726`); one loses its model. The composition is the one that would read them after a restart. */
    rewriteSessionHeader(h,localId,record=>({...record,provider:'local',runtimeId:'llama-server',modello:'qwen3-0.6b-q4_k_m.gguf',modelId:'qwen3-0.6b-q4_k_m.gguf'}));
    rewriteSessionHeader(h,unknownId,record=>{const {modello:_m,modelId:_i,...rest}=record;return rest;});

    const {loadModules}=await import('../../src/runtime/talos-composition.ts');
    const real:any=await loadModules(REPO_ROOT);
    let kernelRegistry:any=null;
    const context=await compose(h,{model:DEEPSEEK_MODEL,endpoints,modules:{...real,createSessionRegistry:(options:any)=>(kernelRegistry=real.createSessionRegistry(options))}});
    context.providerStore.setKey('deepseek',deepseekKey);context.providerStore.setKey('openrouter',openrouterKey);
    await context.runtime.restore();
    const row=(id:string)=>(context.registry.elenca() as any[]).find(r=>r.sessionId===id);
    assert.deepEqual([row(localId)?.provider,row(localId)?.modello],['local','qwen3-0.6b-q4_k_m.gguf'],'the restored session is local');
    assert.deepEqual([row(unknownId)?.provider,row(unknownId)?.modello],['cloud',null],'the restored session has no model');
    assert.deepEqual([row(intactId)?.provider,row(intactId)?.modello],['cloud',DEEPSEEK_MODEL]);
    assert.deepEqual([row(bypassId)?.provider,row(bypassId)?.modello],['cloud',DEEPSEEK_MODEL]);
    const before={deepseek:deepseek.requests.length,openrouter:openrouter.requests.length};

    const local=await outcome(context.runtime.compact(localId));
    const unknown=await outcome(context.runtime.compact(unknownId));
    const unknownBypass=await outcome(kernelRegistry.compatta(unknownId));
    assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
    assert.deepEqual({deepseek:deepseek.requests.length,openrouter:openrouter.requests.length},before,'no fake received anything');
    assert.equal(local.error?.code,'LOCAL_SESSION_COMPACTION_UNAVAILABLE',`local: ${JSON.stringify(local.value??String(local.error))}`);
    assert.match(String(local.error?.message),/CLI-REQ-05/u);
    assert.equal(unknown.error?.code,'SESSION_MODEL_UNKNOWN',`unknown: ${JSON.stringify(unknown.value??String(unknown.error))}`);
    assert.match(String(unknown.error?.message),/cannot be determined, so it was not compacted and nothing was sent/u,'refused by the CLI (compactionOf), before the registry is asked');
    assert.equal(unknownBypass.value?.code,'SESSION_MODEL_UNKNOWN',`the registry itself refuses a session whose model it cannot read: ${JSON.stringify(unknownBypass.value??String(unknownBypass.error))}`);

    // A compaction that bypasses the session runtime: the session's own model, on its own provider, through the CLI's route.
    const bypass=await outcome(kernelRegistry.compatta(bypassId));
    assert.deepEqual(h.network.blocked,[],'the bypassing compaction made no attempt on https://openrouter.ai');
    assert.equal(openrouter.requests.length,before.openrouter,'OpenRouter received nothing');
    assert.deepEqual(chats(deepseek).slice(before.deepseek).map(r=>[r.authorizedAs,r.model,r.summary]),[['good','deepseek-flash',true]],'it reached DeepSeek once, with the DeepSeek key, never the registry\'s model');
    assert.equal(bypass.value?.compattato,true,`bypass: ${JSON.stringify(bypass.value??String(bypass.error))}`);

    // Counter-proof: the intact session, through the session runtime, compacts on DeepSeek. The refusals above were not a broken setup.
    const afterBypass=chats(deepseek).length;
    const intact=await outcome(context.runtime.compact(intactId));
    assert.deepEqual(h.network.blocked,[]);
    assert.equal(openrouter.requests.length,before.openrouter,'OpenRouter still received nothing');
    assert.deepEqual(chats(deepseek).slice(afterBypass).map(r=>[r.authorizedAs,r.model,r.summary]),[['good','deepseek-flash',true]]);
    assert.equal(intact.value?.compattato,true,String(intact.error?.code??intact.error));
  }finally{await deepseek.close();await openrouter.close();}
}));

test('C1: two compactions started together, on a DeepSeek and an OpenRouter session, run one after the other and each reaches only its own provider',async()=>closing(async h=>{
  const deepseekKey=dummyKey('deepseek');const openrouterKey=dummyKey('openrouter');const log:string[]=[];
  const deepseek=await startRecordingProvider({name:'deepseek',goodKey:deepseekKey,delayMs:400,log});const openrouter=await startRecordingProvider({name:'openrouter',goodKey:openrouterKey,delayMs:400,log});
  try{
    // Composed with a third provider's model, so neither session's model is the registry's.
    const context=await compose(h,{model:'openai:gpt-5-mini',endpoints:{deepseek:deepseek.url,openrouter:`${openrouter.url}/api/v1`}});
    context.providerStore.setKey('deepseek',deepseekKey);context.providerStore.setKey('openrouter',openrouterKey);
    const deepseekSession=await finishedSession(context,h,DEEPSEEK_MODEL);
    const openrouterSession=await finishedSession(context,h,OPENROUTER_MODEL);
    const before={deepseek:chats(deepseek).length,openrouter:chats(openrouter).length};
    log.length=0;

    const [a,b]=await Promise.all([outcome(context.runtime.compact(deepseekSession)),outcome(context.runtime.compact(openrouterSession))]);
    assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
    assert.deepEqual(chats(deepseek).slice(before.deepseek).map(r=>[r.authorizedAs,r.model,r.summary]),[['good','deepseek-flash',true]],'DeepSeek received exactly its own compaction, with its key, on its light model');
    assert.deepEqual(chats(openrouter).slice(before.openrouter).map(r=>[r.path,r.authorizedAs,r.model,r.summary]),[['/api/v1/chat/completions','good',OPENROUTER_MODEL,true]],'OpenRouter received exactly its own compaction, with its key');
    assert.equal(a.value?.compattato,true,`DeepSeek session: ${a.error?.code} ${a.error?.message}`);
    assert.equal(b.value?.compattato,true,`OpenRouter session: ${b.error?.code} ${b.error?.message}`);
    // Serialized: the second request is received only after the first was answered.
    const first=log[0]?.split(':')[0]==='openrouter'?'openrouter':'deepseek';const second=first==='deepseek'?'openrouter':'deepseek';
    assert.deepEqual(log,[`${first}:received`,`${first}:answered`,`${second}:received`,`${second}:answered`],'the two compactions did not overlap');
  }finally{await deepseek.close();await openrouter.close();}
}));
