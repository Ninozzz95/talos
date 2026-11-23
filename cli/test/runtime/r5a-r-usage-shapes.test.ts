/*
 * R5a lane R, S1 — the usage shapes that REALLY reach the CLI, measured through the real composition before any body was
 * written (brief: "measure them, do not assume") and pinned here: a two-request turn (a tool call, then the answer), each
 * request reporting its own usage, on a fake provider on 127.0.0.1.
 * Measured 2026-09-24 (first run of this file, then turned into assertions):
 *   types   RunStarted, ToolCallStart, ToolCallArgs, CUSTOM, StateDelta, ToolCallResult, TextMessageStart,
 *           TextMessageContent, CUSTOM, TextMessageEnd, StateDelta, RunFinished
 *   /usage  {prompt_tokens:1000,completion_tokens:50,cached_tokens:100,giri:1} then {…2400,80,1000,giri:2}: the RUN's total
 *   CUSTOM  consumo-fornitore {provider,model,usage:<the provider's own>,costoDichiarato:null,esito:'completato'} per request,
 *           BEFORE its /usage delta
 *   result  RunFinished.result.usage {prompt_tokens:2400,completion_tokens:80,prompt_tokens_details:{cached_tokens:1000},giri:2}
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {composeWithFake,runTurn,startScriptedProvider} from './r5a-r-fixture.ts';

const U1={prompt_tokens:1000,completion_tokens:50,total_tokens:1050,prompt_tokens_details:{cached_tokens:100}};
const U2={prompt_tokens:1400,completion_tokens:30,total_tokens:1430,prompt_tokens_details:{cached_tokens:900}};

test('R5a-R S1 — the raw usage rows of a two-request turn, as measured',{timeout:120_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  writeFileSync(path.join(h.project,'README.md'),'# demo\n');
  const fake=await startScriptedProvider({goodKey:key,respond:request=>request.toolResults===0
    ?{kind:'tool',name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'README.md'}],usage:U1}
    :{kind:'text',text:'Done.',usage:U2}});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {raw}=await runTurn(context,h,'read the readme');
    const usage=raw.filter(e=>e?.type==='StateDelta').flatMap(e=>(e.delta??[]).filter((row:any)=>row?.path==='/usage').map((row:any)=>row.value));
    assert.deepEqual(usage,[{prompt_tokens:1000,completion_tokens:50,cached_tokens:100,giri:1},{prompt_tokens:2400,completion_tokens:80,cached_tokens:1000,giri:2}],'the /usage delta is the run\'s running total');
    const requests=raw.filter(e=>e?.type==='CUSTOM'&&e.name==='consumo-fornitore').map(e=>e.value);
    assert.deepEqual(requests.map(value=>[value.provider,value.model,value.usage,value.costoDichiarato,value.esito]),[['deepseek','deepseek-flash',U1,null,'completato'],['deepseek','deepseek-flash',U2,null,'completato']]);
    const order=raw.map(e=>e?.type==='CUSTOM'?`CUSTOM:${e.name}`:e?.type==='StateDelta'&&(e.delta??[]).some((row:any)=>row?.path==='/usage')?'usage':null).filter(Boolean);
    /* 14/10/2026 (owner, /context with the last request's breakdown): the kernel's ephemeral `talos.contesto-richiesta` row comes
       before each request now (the capture is handed on); it is state, never journal, and the v2 stream drops unknown CUSTOM rows */
    assert.deepEqual(order,['CUSTOM:talos.contesto-richiesta','CUSTOM:consumo-fornitore','usage','CUSTOM:talos.contesto-richiesta','CUSTOM:consumo-fornitore','usage'],'each request\'s row precedes its running total');
    assert.deepEqual(raw.find(e=>e?.type==='RunFinished')?.result?.usage,{prompt_tokens:2400,completion_tokens:80,prompt_tokens_details:{cached_tokens:1000},giri:2});
  }finally{await context.runtime.close?.();await fake.close();}
}));
