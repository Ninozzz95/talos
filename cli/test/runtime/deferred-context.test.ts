/*
 * Startup stage 1 (owner 02/10, «Entrambe, a tappe»): the composer appears before the kernel is loaded. The TUI gets
 * stand-ins for the runtime, the catalog and the registry that wait for the real ones: a send made before the kernel is
 * ready waits and then goes (Claude Code: «the first message waits if needed»; Codex #21318: responsive at once).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';

function gate<T>(){let open!:(value:T)=>void,fail!:(error:unknown)=>void;const promise=new Promise<T>((resolve,reject)=>{open=resolve;fail=reject;});return{promise,open,fail};}
function fakeContext(){
  const calls:string[]=[];const sinks=new Map<string,(event:unknown)=>void>();let effort:unknown='unset';
  const runtime:any={
    start:async(input:any)=>{calls.push(`start:${input.prompt}`);return'session-1';},
    resume:async(id:string,prompt?:string)=>{calls.push(`resume:${id}:${prompt}`);return id;},
    subscribe:(id:string,sink:(event:unknown)=>void)=>{calls.push(`subscribe:${id}`);sinks.set(id,sink);return()=>{calls.push(`unsubscribe:${id}`);sinks.delete(id);};},
    setDefaultReasoningEffort:(value:unknown)=>{effort=value;},
    export:(id:string)=>({exported:id}),
    listSessions:async()=>[{id:'session-1'}],
    close:async()=>{calls.push('close');},
  };
  const tuiCatalog:any={listProviders:async()=>[{id:'ollama'}],keyTestNotice:(id:string)=>`notice ${id}`,readiness:async()=>({ready:true})};
  const registry:any={versioniToolForgiato:async(sessionId:string,id:string)=>({sessionId,id})};
  return{context:{runtime,tuiCatalog,registry},calls,sinks,effort:()=>effort};
}

test('a call made before the kernel is ready waits for it, and runs in order once it is',async()=>{
  const g=gate<any>();const real=fakeContext();const deferred=createDeferredRuntimeContext(g.promise);
  const first=deferred.runtime.start({projectRoot:'p',prompt:'hello'} as any);
  const second=deferred.runtime.resume('session-1','again');
  assert.equal(deferred.isReady(),false);assert.deepEqual(real.calls,[]);
  g.open(real.context);
  assert.equal(await first,'session-1');assert.equal(await second,'session-1');
  assert.deepEqual(real.calls,['start:hello','resume:session-1:again']);
  assert.equal(deferred.isReady(),true);
});

test('subscribe before ready subscribes once ready; an unsubscribe before ready never subscribes',async()=>{
  const g=gate<any>();const real=fakeContext();const deferred=createDeferredRuntimeContext(g.promise);
  const seen:unknown[]=[];
  const off=deferred.runtime.subscribe('session-1',event=>seen.push(event));
  const offEarly=deferred.runtime.subscribe('session-2',()=>{});offEarly();
  g.open(real.context);await deferred.ready;
  real.sinks.get('session-1')!('event-a');
  assert.deepEqual(seen,['event-a']);
  assert.deepEqual(real.calls,['subscribe:session-1'],'session-2 was given up before the kernel was ready');
  off();assert.deepEqual(real.calls,['subscribe:session-1','unsubscribe:session-1']);
});

test('the default reasoning effort set before ready is applied when the kernel is (the last one wins)',async()=>{
  const g=gate<any>();const real=fakeContext();const deferred=createDeferredRuntimeContext(g.promise);
  deferred.runtime.setDefaultReasoningEffort('low' as any);deferred.runtime.setDefaultReasoningEffort('high' as any);
  assert.equal(real.effort(),'unset');
  g.open(real.context);await deferred.ready;
  assert.equal(real.effort(),'high');
});

test('once ready the stand-ins pass straight through: subscribe answers synchronously, export reads the session',async()=>{
  const real=fakeContext();const deferred=createDeferredRuntimeContext(Promise.resolve(real.context));await deferred.ready;
  const off=deferred.runtime.subscribe('session-9',()=>{});
  assert.deepEqual(real.calls,['subscribe:session-9'],'subscribed at once');off();
  assert.deepEqual(deferred.runtime.export('session-9'),{exported:'session-9'});
  assert.equal(deferred.catalog.keyTestNotice('openai'),'notice openai');
});

test('a kernel that fails to load fails every waiting call with its own error, and ready says so',async()=>{
  const g=gate<any>();const deferred=createDeferredRuntimeContext(g.promise);
  const pending=deferred.runtime.start({projectRoot:'p',prompt:'x'} as any);
  const providers=deferred.catalog.listProviders();
  const error=Object.assign(new Error('kernel missing'),{code:'TALOS_RUNTIME_UNAVAILABLE'});g.fail(error);
  await assert.rejects(pending,error);await assert.rejects(providers,error);await assert.rejects(deferred.ready,error);
  assert.equal(deferred.isReady(),false);
  await assert.rejects(deferred.runtime.listSessions(),error,'a later call fails the same way');
});

test('the registry stand-in is not a promise, and its methods wait for the kernel',async()=>{
  const g=gate<any>();const real=fakeContext();const deferred=createDeferredRuntimeContext(g.promise);
  assert.equal(await Promise.resolve(deferred.registry),deferred.registry,'awaiting the registry does not wait for anything');
  const versions=(deferred.registry as any).versioniToolForgiato('session-1','tool');
  g.open(real.context);
  assert.deepEqual(await versions,{sessionId:'session-1',id:'tool'});
});

test('the catalog before ready: async calls wait; the key-test notice is not known yet',async()=>{
  const g=gate<any>();const real=fakeContext();const deferred=createDeferredRuntimeContext(g.promise);
  assert.equal(deferred.catalog.keyTestNotice('openai'),null);
  const providers=deferred.catalog.listProviders();g.open(real.context);
  assert.deepEqual(await providers,[{id:'ollama'}]);
});

test('close before ready waits for the kernel and closes it; after a failure close resolves',async()=>{
  const g=gate<any>();const real=fakeContext();const deferred=createDeferredRuntimeContext(g.promise);
  const closing=deferred.runtime.close();g.open(real.context);await closing;
  assert.deepEqual(real.calls,['close']);
  const failed=createDeferredRuntimeContext(Promise.reject(new Error('no kernel')));
  await failed.ready.catch(()=>{});
  await failed.runtime.close();
});

test('prepare runs on the real context before any waiting call: the configured effort reaches the first turn',async()=>{
  const g=gate<any>();const real=fakeContext();const order:string[]=[];
  const deferred=createDeferredRuntimeContext(g.promise,{prepare:async(context:any)=>{order.push(`prepare effort=${String(real.effort())}`);context.runtime.setDefaultReasoningEffort('medium');return{reasoningEffort:'medium',notices:[]};}});
  const start=deferred.runtime.start({projectRoot:'p',prompt:'first'} as any).then(id=>{order.push(`start effort=${String(real.effort())}`);return id;});
  g.open(real.context);
  assert.deepEqual(await deferred.ready,real.context);
  await start;
  assert.deepEqual(order,['prepare effort=unset','start effort=medium']);
  assert.deepEqual(await deferred.prepared,{reasoningEffort:'medium',notices:[]});
});

test('an effort chosen before ready wins over the configured default that prepare applies',async()=>{
  const g=gate<any>();const real=fakeContext();
  const deferred=createDeferredRuntimeContext(g.promise,{prepare:async(context:any)=>{context.runtime.setDefaultReasoningEffort('medium');return null;}});
  deferred.runtime.setDefaultReasoningEffort('high' as any);
  g.open(real.context);await deferred.ready;
  assert.equal(real.effort(),'high');
});

test('a prepare that fails fails ready, like a kernel that fails to load',async()=>{
  const real=fakeContext();const error=new Error('catalog unreadable');
  const deferred=createDeferredRuntimeContext(Promise.resolve(real.context),{prepare:async()=>{throw error;}});
  await assert.rejects(deferred.ready,error);await assert.rejects(deferred.runtime.listSessions(),error);
});

test('an effort chosen while prepare is still running wins over the configured default',async()=>{
  const real=fakeContext();const step=gate<void>();let preparing!:()=>void;const inPrepare=new Promise<void>(resolve=>{preparing=resolve;});
  const deferred=createDeferredRuntimeContext(Promise.resolve(real.context),{prepare:async(context:any)=>{preparing();await step.promise;context.runtime.setDefaultReasoningEffort('medium');return null;}});
  await inPrepare;
  deferred.runtime.setDefaultReasoningEffort('high' as any);
  step.open();await deferred.ready;
  assert.equal(real.effort(),'high');
});

test('B1 the stand-ins forward the restore selection and the list scope to the real runtime',async()=>{
  const seen:unknown[]=[];const real=fakeContext();
  real.context.runtime.restore=async(selection?:unknown)=>{seen.push(['restore',selection??'all']);return{restored:0,total:0};};
  real.context.runtime.listSessions=async(options?:unknown)=>{seen.push(['list',options??'all']);return[];};
  const deferred=createDeferredRuntimeContext(Promise.resolve(real.context));
  await deferred.runtime.restore({sessionIds:['s1']});await deferred.runtime.restore();
  await deferred.runtime.listSessions({scope:'loaded'});await deferred.runtime.listSessions();
  assert.deepEqual(seen,[['restore',{sessionIds:['s1']}],['restore','all'],['list',{scope:'loaded'}],['list','all']]);
});

/* C2 (08/10): the subscribe options travel through the stand-in too, ready or not */
test('the subscribe cursor and options reach the real runtime, whether the kernel was ready or not',async()=>{
  const seen:unknown[][]=[];
  const make=()=>{const real=fakeContext();real.context.runtime.subscribe=(...args:unknown[])=>{seen.push(args.slice(1));return()=>{};};return real;};
  const early=gate<any>();const real=make();const before=createDeferredRuntimeContext(early.promise);
  before.runtime.subscribe('s',()=>{},0,{resultsForScreen:true});early.open(real.context);await early.promise;await new Promise(resolve=>setImmediate(resolve));
  const ready=createDeferredRuntimeContext(Promise.resolve(make().context));await new Promise(resolve=>setImmediate(resolve));
  ready.runtime.subscribe('s',()=>{},0,{resultsForScreen:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(seen.map(args=>args.slice(1)),[[0,{resultsForScreen:true}],[0,{resultsForScreen:true}]]);
});

/* 0.6.0, found by the acceptance scenario s61 on the built CLI (13/10/2026): the real screen gets its catalog through these
   stand-ins, which did not carry `chatgpt`, so Enter on «ChatGPT plan» in /provider asked for an API key. The in-process screen
   tests handed the app the real catalog and could not see it. */
test('the stand-in catalog carries the ChatGPT plan: state, sign-in, sign-out and usage reach the real one',async()=>{
  const {context}=fakeContext();const asked:string[]=[];
  const login={url:'https://auth.openai.com/x',expiresInMs:600_000,opened:false,remote:false,outcome:Promise.resolve({ok:true,email:null,planEnabled:true}),cancel(){}};
  context.tuiCatalog.chatgpt={
    state:async()=>{asked.push('state');return{connected:false,email:null,planEnabled:false,signingIn:false,usageUrl:'u'};},
    startLogin:async(input:any)=>{asked.push(`start:${typeof input?.open}`);return login;},
    signOut:async()=>{asked.push('signOut');return{signedOut:true,revoked:true};},
    usage:()=>({cinqueOre:{richieste:1,token:2,senzaMisura:0},setteGiorni:{richieste:1,token:2,senzaMisura:0},limits:null}),
  };
  const ready=gate<any>();const deferred=createDeferredRuntimeContext(ready.promise);
  assert.equal(typeof deferred.catalog.chatgpt?.startLogin,'function','the screen can tell the plan is signed in to BEFORE the kernel is loaded');
  assert.equal(deferred.catalog.chatgpt!.usage(),null,'nothing is known before the kernel');
  const state=deferred.catalog.chatgpt!.state();const started=deferred.catalog.chatgpt!.startLogin({open:()=>false});
  ready.open(context);
  assert.equal((await state)?.connected,false);assert.equal(await started,login,'the real sign-in, with its own cancel and outcome');
  assert.deepEqual(await deferred.catalog.chatgpt!.signOut(),{signedOut:true,revoked:true});
  assert.deepEqual(asked,['state','start:function','signOut']);
  assert.equal(deferred.catalog.chatgpt!.usage()?.cinqueOre.richieste,1);
});
test('a runtime whose catalog has no ChatGPT plan: no state, a refused sign-in, nothing to sign out of',async()=>{
  const {context}=fakeContext();const deferred=createDeferredRuntimeContext(Promise.resolve(context as any));
  assert.equal(await deferred.catalog.chatgpt!.state(),null);
  await assert.rejects(deferred.catalog.chatgpt!.startLogin(),{code:'CHATGPT_UNAVAILABLE'});
  assert.deepEqual(await deferred.catalog.chatgpt!.signOut(),{signedOut:false,revoked:false});
});
