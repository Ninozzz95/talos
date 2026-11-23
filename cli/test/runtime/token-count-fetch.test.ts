/*
 * 0.6.7 (stress test of 0.6.6, F-C002-001, reproduced on the published 0.6.6): a count endpoint that answers 200 with a body that
 * is not a count failed EVERY turn once a model's window was known (the kernel's CTX_TOKEN_RESPONSE_INVALID). The counter's fetch
 * now hands the kernel only a whole number ≥ 0; anything else reads as the 404 the kernel treats as «estimate». The real kernel
 * counter is used on the answers, so «estimate» is what the kernel itself says, not a guess of this test.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';
import {SLOW_COUNT_ENDPOINT_MS,tokenCountFetch} from '../../src/runtime/token-count-fetch.ts';

const counters:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','context-token-counters.mjs')).href);
const answering=(status:number,body:string|null)=>(async()=>new Response(body,{status,headers:{'content-type':'application/json'}})) as unknown as typeof fetch;
const throwing=(async()=>{throw new TypeError('fetch failed');}) as unknown as typeof fetch;

async function measure(fetchImpl:typeof fetch){
  const counter=counters.createContextTokenCounter({
    resolveProfile:async()=>({baseURL:'http://127.0.0.1:9/v1',apiKey:'sk-test-count-0000',nativeRequestBuilder:async()=>({body:{model:'mock-model',input:[{role:'user',content:'hello'}]}})}),
    fetchFn:tokenCountFetch(fetchImpl),
  });
  return await counter.countPreparedContext({messages:[{role:'user',content:'hello'}],tools:[],model:{provider:'openai',model:'mock-model',windowTokens:64_000,responseReserve:4_096}});
}

test('a 200 that is not a count is an estimate, never a failed turn',async()=>{
  for(const body of [JSON.stringify({id:'resp_1',object:'response',output:[]}),JSON.stringify({input_tokens:'12'}),JSON.stringify({input_tokens:-1}),JSON.stringify({input_tokens:1.5}),'<html>ok</html>','']){
    const measured=await measure(answering(200,body));
    assert.equal(measured.method,'heuristic',`body ${JSON.stringify(body)} reads as an estimate`);
    assert.equal(measured.exact,false);
  }
});

/* first review of 0.6.7 (S4): the field is the one the kernel reads for that endpoint, or the kernel would still fail the turn */
test('the count is read from the field the kernel reads for that endpoint',async()=>{
  for(const body of [JSON.stringify({totalTokens:9}),JSON.stringify({input_tokens:null,totalTokens:3})])
    assert.equal((await measure(answering(200,body))).method,'heuristic',`an OpenAI count endpoint answering ${body}`);
  const gemini=tokenCountFetch(answering(200,JSON.stringify({input_tokens:4})));
  assert.equal((await gemini('http://127.0.0.1:9/v1beta/models/gemini-2.5:countTokens',{method:'POST'})).status,404,'Gemini is read from totalTokens');
  assert.equal((await tokenCountFetch(answering(200,JSON.stringify({totalTokens:4})))('http://127.0.0.1:9/v1beta/models/gemini-2.5:countTokens',{method:'POST'})).status,200);
});

test('a real count still reaches the kernel as the provider\'s count',async()=>{
  const measured=await measure(answering(200,JSON.stringify({object:'response.input_tokens',input_tokens:120})));
  assert.equal(measured.method,'provider');
  assert.equal(measured.inputTokens,120);
});

test('a failed or unreachable count endpoint is an estimate too (as before 0.6.7)',async()=>{
  for(const fetchImpl of [answering(429,'{}'),answering(500,'{}'),answering(401,'{}'),throwing])assert.equal((await measure(fetchImpl)).method,'heuristic');
});

test('the guessed chat-completions count endpoint is never sent',async()=>{
  let sent=0;
  const fetchFn=tokenCountFetch((async()=>{sent+=1;return new Response('{"input_tokens":1}',{status:200});}) as unknown as typeof fetch);
  assert.equal((await fetchFn('http://127.0.0.1:9/v1/chat/completions/input_tokens',{method:'POST'})).status,404);
  assert.equal(sent,0);
});

/* third review of 0.6.7 (S2): the kernel's estimate after its own 10 s ceiling carries `fallback`, which the engine's strict
   contract refused, so a count endpoint that never answered failed the turn. 0.6.7 stripped it in the CLI; since r4 e4bede2ac
   the contract accepts it, and this is the guard that it still does. */
const hanging=(calls:{n:number})=>((_url:string,options:any)=>{calls.n+=1;return new Promise((_resolve,reject)=>{options?.signal?.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});}) as unknown as typeof fetch;
const REQUEST={messages:[{role:'user',content:'hello'}],tools:[],model:{provider:'openai',model:'mock-model',windowTokens:64_000,responseReserve:4_096}};
const counterOn=(fetchFn:any)=>counters.createContextTokenCounter({
  resolveProfile:async()=>({baseURL:'http://127.0.0.1:9/v1',apiKey:'sk-test-count-0000',nativeRequestBuilder:async()=>({body:{model:'mock-model',input:[{role:'user',content:'hello'}]}})}),
  fetchFn,tempoMassimoMs:50,
});
test('a count endpoint that never answers gives an estimate the Context Engine accepts as it is',async()=>{
  const contracts:any=await import(pathToFileURL(path.join(REPO_ROOT,'context-engine','src','contracts.mjs')).href);
  const raw=await counterOn(tokenCountFetch(hanging({n:0}))).countPreparedContext(REQUEST);
  assert.equal(raw.method,'heuristic');
  assert.equal(raw.fallback,'CTX_TOKEN_TIMEOUT','the kernel says why it estimated');
  assert.equal(contracts.TokenMeasurementV1.safeParse(raw).success,true,'the engine reads the estimate with its fallback');
});

/* fourth review of 0.6.7 (S4): nothing remembered a timed-out endpoint, so every count waited the whole ceiling again */
test('an endpoint that ran out the ceiling is skipped for ten minutes, then asked again',async()=>{
  let clock=1_000_000;const calls={n:0};
  const counter=counterOn(tokenCountFetch(hanging(calls),{now:()=>clock}));
  assert.equal((await counter.countPreparedContext(REQUEST)).fallback,'CTX_TOKEN_TIMEOUT');
  assert.equal(calls.n,1);
  const started=Date.now();
  const second=await counter.countPreparedContext(REQUEST);
  assert.equal(second.method,'heuristic');
  assert.equal(calls.n,1,'the slow endpoint was not asked again');
  assert.ok(Date.now()-started<40,`no wait for the ceiling the second time (${Date.now()-started} ms)`);
  clock+=SLOW_COUNT_ENDPOINT_MS+1;
  await counter.countPreparedContext(REQUEST);
  assert.equal(calls.n,2,'asked again once the ten minutes passed');
});

test('a turn the person stops during a count does not mark the endpoint slow',async()=>{
  const calls={n:0};const fetchFn=tokenCountFetch(hanging(calls));
  const counter=counterOn(fetchFn);
  const stop=new AbortController();
  const pending=counter.countPreparedContext({...REQUEST,signal:stop.signal});
  setTimeout(()=>stop.abort(),5);
  await assert.rejects(pending,(error:any)=>error?.name==='AbortError');
  await counter.countPreparedContext(REQUEST);
  assert.equal(calls.n,2,'the next count still asks the endpoint');
});

test('an aborted count still aborts the turn (the person pressed Esc)',async()=>{
  const controller=new AbortController();controller.abort();
  const fetchFn=tokenCountFetch((async()=>{throw new DOMException('aborted','AbortError');}) as unknown as typeof fetch);
  await assert.rejects(fetchFn('http://127.0.0.1:9/v1/responses/input_tokens',{method:'POST',signal:controller.signal}),(error:any)=>error?.name==='AbortError');
});
