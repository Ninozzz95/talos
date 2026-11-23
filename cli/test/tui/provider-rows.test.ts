/*
 * Stage 7.10b (mockup PANELS.provider): a catalogue provider as the /provider sheet shows it — never the key, only where it
 * comes from; a local engine that did not answer is «not running».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {providerViewOf} from '../../src/tui/provider-rows.ts';

const row=(over:Record<string,unknown>)=>({id:'p',label:'P',description:'',configured:false,requiresKey:true,authType:'api-key',local:false,cloud:true,endpointHost:'api.p.test',supportsEndpoint:false,supportsOAuth:false,execution:'',keySource:'missing',environmentVariable:null,benched:null,...over}) as any;

test('a key set, an environment key, no key, a local engine running or not, a provider that needs none',()=>{
  assert.deepEqual(providerViewOf(row({configured:true,keySource:'saved'}),{current:true,reachable:null}),{id:'p',label:'P',search:'',current:true,state:'key',desc:'key saved',address:'api.p.test',key:'stored',needsKey:true});
  assert.deepEqual(providerViewOf(row({configured:true,keySource:'environment',environmentVariable:'P_API_KEY'}),{current:false,reachable:null}),{id:'p',label:'P',search:'',current:false,state:'key',desc:'key from P_API_KEY',address:'api.p.test',key:'environment',needsKey:true});
  assert.equal(providerViewOf(row({}),{current:false,reachable:null}).desc,'press k to add a key');
  assert.equal(providerViewOf(row({keySource:'environment-declined'}),{current:false,reachable:null}).desc,'environment key declined','a declined environment key says so');
  const engine=row({local:true,requiresKey:false,configured:true,keySource:'not-required',endpointHost:'localhost:11434'});
  assert.deepEqual(providerViewOf(engine,{current:false,reachable:true}),{id:'p',label:'P',search:'',current:false,state:'local',desc:'on this computer · no key needed',address:'localhost:11434',key:'none',needsKey:false});
  assert.equal(providerViewOf(engine,{current:false,reachable:false}).state,'down');
  assert.equal(providerViewOf(engine,{current:false,reachable:false}).desc,'start its server, then press t');
  assert.equal(providerViewOf(row({requiresKey:false,configured:true,keySource:'not-required'}),{current:false,reachable:null}).state,'ready','a cloud provider that needs no key');
  const benched=providerViewOf(row({configured:false,keySource:'saved',benched:{cause:'rate limit',until:null}}),{current:false,reachable:null});
  assert.equal(benched.key,'missing','a benched key is not usable now');assert.match(benched.desc,/bench|paused|resting|not used/iu);
});

/* 14/10/2026 (B2 of the 10/10 table; owner: the Z.AI key only to the address you chose): the Z.AI row says which address is in
   use — the plan and the balance share a host, so the host alone did not say it — or that none is chosen yet. */
test('Z.AI: the address in use by name, or that none is chosen',()=>{
  const zai=(over:Record<string,unknown>)=>row({id:'zai',label:'Z.AI',endpointHost:'api.z.ai',...over}) as any;
  assert.equal(providerViewOf(zai({addressChosen:true,address:'GLM Coding Plan'}),{current:false,reachable:null}).address,'GLM Coding Plan · api.z.ai');
  assert.equal(providerViewOf(zai({addressChosen:false,address:null}),{current:false,reachable:null}).address,'not chosen');
  assert.equal(providerViewOf(row({}),{current:false,reachable:null}).address,'api.p.test','other providers: the host as before');
});
