/*
 * Contract «mai aspettare» C1 (owner 27/10/2026, «Ovunque»), through the REAL composition, kernel and Context Engine on a fake on 127.0.0.1:
 * over the input limit a turn does not wait for a summary. It leaves at once with the summary without the model, the model's goes on behind,
 * and the turn does its ten reads while that summary is still held. This replaces the proof of the Skip that lasted the whole turn: on a
 * network model there is no wait left to skip. A local model with one slot still waits (compattazione.motoreAPostoUnico), and its Skip stays
 * proved in the kernel's tests. Same pressure as r5b-ce-summary-refused.test.ts (a pasted log, then ten reads).
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {pastedLog,ceSummaryFor,composeWithFake,runTurn,startScriptedProvider,type ChatRequest} from './r5a-r-fixture.ts';

test.after(()=>resetModelProfiles());
const FILE=(k:number)=>Array.from({length:180},(_,i)=>`compact file ${k} line ${String(i+1).padStart(3,'0')} ${'x'.repeat(24)}`).join('\n')+'\n';
const read=(k:number)=>({kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:`c${k}.txt`}]});
/* a summary request, by where its words stand: the Context Engine's schema in the FIRST message, the simple compaction's instruction in the LAST.
   Anywhere else they are history: a real turn carries the summary it was compacted with, and held as a summary it was answered with one. */
const textOf=(message:any)=>JSON.stringify(message?.content??'');
const summaryKind=(request:ChatRequest)=>{const messages=request.body?.messages??[];return textOf(messages[0]).includes('talos.context.summary.v1')?'engine':textOf(messages.at(-1)).includes('CONTEXT COMPACTION. The conversation above')?'simple':null;};
const isSummary=(request:ChatRequest)=>summaryKind(request)!==null;

/* TRACE for the Desktop (27/10/2026): who sends a simple-compaction summary. The fake provider is a server, so its own stack never
   holds the kernel: the stack is taken on the CALLER's side, wrapping fetch in this process (TALOS_TRACE_SUMMARY=1 prints it). */
const TRACE=process.env.TALOS_TRACE_SUMMARY==='1';
if(TRACE){
  Error.stackTraceLimit=50;
  const original=globalThis.fetch;
  globalThis.fetch=(async(input:any,init?:any)=>{
    const body=typeof init?.body==='string'?init.body:'';
    if(body.includes('CONTEXT COMPACTION. The conversation above'))console.log('TRACE-SIMPLE-SUMMARY\n'+String(new Error('who').stack));
    return original(input,init);
  }) as typeof fetch;
}

const HELD_MS=20_000;

test('a turn over the limit does not wait for the summary held by the provider, and does its ten reads',{timeout:120_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  for(let k=1;k<=10;k++)writeFileSync(path.join(h.project,`c${k}.txt`),FILE(k));
  writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:2,models:{'deepseek:deepseek-flash':{contextWindow:65_536}}}));
  let holding=false;
  const fake=await startScriptedProvider({goodKey:key,respond:(request)=>{
    if(isSummary(request))return{kind:'text',text:ceSummaryFor(request),...(holding?{delayMs:HELD_MS}:{})};
    if(request.lastUser==='hello')return{kind:'text',text:'Hi.'};
    return request.toolResults<10?read(request.toolResults+1):{kind:'text',text:'Done: read ten files.'};
  }});
  const context:any=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId}=await runTurn(context,h,'hello',{timeoutMs:60_000});
    /* over the input limit at once (r5b: limit 39,321 tokens at a 65,536 window, about 24.6 tokens a pasted line) */
    holding=true;
    const before=fake.requests.length;const started=Date.now();
    const turn=await runTurn(context,h,pastedLog(1700)+'\nNow read the ten files.',{timeoutMs:60_000,sessionId});
    const tookMs=Date.now()-started;
    const facts=JSON.stringify({tookMs,end:turn.raw.filter((e:any)=>e.type==='RunError'||e.type==='RunFinished'||e.name==='talos.compattazione').map((e:any)=>e.type==='CUSTOM'?[e.value?.fase,e.value?.motivo,e.value?.compattato,e.value?.ripiego,e.value?.ragione].join('/'):e.type+':'+String(e.message??e.result?.comeFinita??'').slice(0,120)).slice(-14),requests:fake.requests.slice(before).map(r=>(summaryKind(r)?'summary:'+summaryKind(r):'turn'+r.toolResults)+'@'+(r.at-started))});
    assert.ok(fake.requests.slice(before).some(isSummary),`no summary was asked, so this proves nothing: ${facts}`);
    assert.equal(fake.requests.slice(before).filter(r=>!isSummary(r)).length>=11,true,`the turn did not go on with its ten reads: ${facts}`);
    assert.ok(tookMs<HELD_MS,`the turn waited for the summary held ${HELD_MS} ms: ${facts}`);
  }finally{await context?.runtime.close?.();await fake.close();}
}));
