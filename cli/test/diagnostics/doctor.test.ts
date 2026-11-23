import assert from 'node:assert/strict';import test from 'node:test';
import {runDoctor,redactObject} from '../../src/diagnostics/doctor.ts';
test('doctor runs offline checks without provider call',async()=>{let network=0;const r=await runDoctor({paths:{configRoot:'/c',dataRoot:'/d',cacheRoot:'/x'} as never,fsAccess:async()=>true,gitProbe:async()=>true,keyringProbe:async()=>true,networkProbe:async()=>{network++;return true;}} as never);assert.equal(r.ok,true);assert.equal(network,0);});
test('redaction removes secret-like fields recursively',()=>{const r=redactObject({authorization:'Bearer secret',nested:{apiKey:'x',safe:'y'}}) as any;assert.equal(r.authorization,'[REDACTED:13]');assert.equal(r.nested.apiKey,'[REDACTED:1]');assert.equal(r.nested.safe,'y');});


test('M11-A RED — deep doctor preserves independently sourced diagnostic domains without calling optional active probes by default',async()=>{
  let activeProvider=0,performance=0;
  const r:any=await runDoctor({
    paths:{configRoot:'/c',dataRoot:'/d',cacheRoot:'/x'} as never,
    fsAccess:async()=>true,gitProbe:async()=>true,keyringProbe:async()=>true,
    terminalProbe:async()=>({capabilities:{interactive:true,color:true,motion:true,unicode:true},session:{mode:'full',alternateScreen:true,paintBackground:true,fallbackReason:null},layout:{rows:25,columns:100,desiredPageSize:12}}),
    runtimeProbe:async()=>({state:'healthy',layout:{runtime:'source',sessionsRoot:'present'}}),
    trustProbe:async()=>({state:'healthy',trusted:true,reason:'PROJECT_TRUSTED',resources:2}),
    providerProbe:async({active}:{active:boolean})=>{if(active)activeProvider++;return{state:'healthy',profiles:[{id:'openrouter',auth:{source:'saved',configured:true,usable:true},lastHealth:{state:active?'available':'unknown',latencyMs:active?42:null}}]};},
    brokerProbe:async()=>({state:'verified',processTree:{verified:true,source:'cached'}}),
    sessionProbe:async()=>({state:'healthy',persisted:2,readable:2,corrupt:0,skipped:0,capped:false}),
    updateProbe:async()=>({state:'degraded',checksum:'sha256',signature:'unavailable'}),
    performanceProbe:async()=>{performance++;return{rssBytes:123,eventLoopUtilization:0.1};},
    profile:false,
  } as any);
  assert.equal(activeProvider,0);assert.equal(performance,0);
  assert.equal(r.sections.terminal.session.mode,'full');
  assert.equal(r.sections.trust.trusted,true);
  assert.equal(r.sections.providers.profiles[0].lastHealth.latencyMs,null);
  assert.equal(r.sections.broker.processTree.verified,true);
  assert.equal(r.sections.sessions.corrupt,0);
  assert.equal(r.sections.update.signature,'unavailable');
  assert.equal(r.performance,null);
  assert.equal(JSON.stringify(r).includes('secret-value'),false);
});

test('M11-A RED — explicit profiling activates provider latency and process performance only when requested',async()=>{
  let activeProvider=0,performance=0;
  const r:any=await runDoctor({
    paths:{configRoot:'/c',dataRoot:'/d',cacheRoot:'/x'} as never,
    fsAccess:async()=>true,gitProbe:async()=>true,keyringProbe:async()=>true,
    terminalProbe:async()=>({state:'healthy'}),runtimeProbe:async()=>({state:'healthy'}),trustProbe:async()=>({state:'healthy'}),
    providerProbe:async({active}:{active:boolean})=>{if(active)activeProvider++;return{state:'healthy',profiles:[{id:'p',lastHealth:{state:'available',latencyMs:37}}]};},
    brokerProbe:async()=>({state:'unknown'}),sessionProbe:async()=>({state:'healthy'}),updateProbe:async()=>({state:'degraded',signature:'unavailable'}),
    performanceProbe:async()=>{performance++;return{rssBytes:456,eventLoopUtilization:0.2};},
    profile:true,
  } as any);
  assert.equal(activeProvider,1);assert.equal(performance,1);assert.equal(r.sections.providers.profiles[0].lastHealth.latencyMs,37);assert.equal(r.performance.rssBytes,456);
});


test('M11-A hardening RED — context-store health is a separate read-only diagnostic domain from session-store health',async()=>{
  const r:any=await runDoctor({
    paths:{configRoot:'/c',dataRoot:'/d',cacheRoot:'/x'} as never,fsAccess:async()=>true,gitProbe:async()=>true,keyringProbe:async()=>true,
    contextProbe:async()=>({state:'healthy',database:'present',format:'sqlite3',bytes:4096}),
    sessionProbe:async()=>({state:'degraded',persisted:2,readable:1,corrupt:1,skipped:0}),
  } as any);
  assert.equal(r.sections.context.state,'healthy');assert.equal(r.sections.context.format,'sqlite3');assert.equal(r.sections.sessions.corrupt,1);
});
