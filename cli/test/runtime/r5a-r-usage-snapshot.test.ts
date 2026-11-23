/*
 * R5a lane R, S1 — owner decisions Q-R5-2 and Q-R5-5: the status row's facts from the usage that REALLY reaches the CLI
 * (measured in r5a-r-usage-shapes.test.ts: the run's running total in `usage.updated`, each request's own usage in the kernel's
 * `consumo-fornitore` row). Unknown stays null; a percentage needs a window; a cost needs a named price source.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {configureModelProfiles,resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {usageSnapshot} from '../../src/runtime/usage-snapshot.ts';

const registryModule:any=await import(new URL('../../../harness-ui/src/provider-registry.mjs',import.meta.url).href);
const REGISTRY=registryModule.REGISTRO_FORNITORI;
configureModelProfiles({registry:REGISTRY,rowsFor:provider=>({runtime:[],registry:[...(REGISTRY[provider]?.modelliNoti??[]),...(REGISTRY[provider]?.modelliDiRiserva??[])]})});
test.after(()=>resetModelProfiles());

let seq=0;const durable=(row:Record<string,unknown>)=>({...row,_sequenza:++seq});
/* 0.6.13 (22/10/2026): deepseek-flash is a priced registry row since kernel d54028b4a; «no price» is a model no source knows */
/** The value the TUI state keeps, built by the real adapter from the measured rows of a two-request turn. */
function measuredUsage(provider='deepseek',model='deepseek-unlisted-test',declared:number|null=null){
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const rows=[
    durable({type:'RunStarted',runId:'r1'}),
    durable({type:'CUSTOM',name:'consumo-fornitore',value:{provider,model,usage:{prompt_tokens:1000,completion_tokens:50,prompt_tokens_details:{cached_tokens:100}},costoDichiarato:declared,esito:'completato'}}),
    durable({type:'StateDelta',delta:[{op:'replace',path:'/usage',value:{prompt_tokens:1000,completion_tokens:50,cached_tokens:100,giri:1}}]}),
    durable({type:'CUSTOM',name:'consumo-fornitore',value:{provider,model,usage:{prompt_tokens:1400,completion_tokens:30,prompt_tokens_details:{cached_tokens:900}},costoDichiarato:declared,esito:'completato'}}),
    durable({type:'StateDelta',delta:[{op:'replace',path:'/usage',value:{prompt_tokens:2400,completion_tokens:80,cached_tokens:1000,giri:2}}]}),
  ];
  const last=rows.flatMap(row=>adapter.translateAll(row)).filter(e=>e.type==='usage.updated').at(-1) as any;
  return last.value;
}

test('the turn\'s tokens and the context in use are REPORTED figures; no window, no percentage',()=>{
  const snapshot=usageSnapshot({state:{usage:measuredUsage()},contextStatus:null,profile:null});
  assert.deepEqual(snapshot,{inputTokens:2400,outputTokens:80,cachedTokens:1000,windowTokens:null,percent:null,estimated:false,costUsd:null,costSource:null,local:false,compactions:0,contextTokens:1430});
});

test('with a window, the percentage of the context in use; the Context Engine\'s heuristic measurement is marked estimated',()=>{
  const profile={windowTokens:65_536,responseReserve:16_384,source:'override' as const,date:null};
  const reported=usageSnapshot({state:{usage:measuredUsage(),compactions:2},contextStatus:null,profile});
  assert.deepEqual([reported.windowTokens,reported.contextTokens,reported.percent,reported.estimated,reported.compactions],[65_536,1430,2.2,false,2]);
  const measured=usageSnapshot({state:{usage:measuredUsage()},profile:null,contextStatus:{available:true,measurement:{inputTokens:6_000,windowTokens:65_536,responseReserve:16_384,percentOfWindow:9.2,method:'heuristic',exact:false,stale:false}}});
  assert.deepEqual([measured.windowTokens,measured.contextTokens,measured.percent,measured.estimated],[65_536,6_000,9.2,true]);
  const stale=usageSnapshot({state:{usage:measuredUsage()},profile,contextStatus:{available:true,measurement:{inputTokens:6_000,windowTokens:65_536,method:'runtime',exact:true,stale:true}}});
  assert.equal(stale.contextTokens,1430,'a stale measurement is not the context in use');
});

test('cost: a named, dated list price is an estimate with its source; a declared cost is reported; a local engine has none',()=>{
  const listed=usageSnapshot({state:{usage:measuredUsage('zai','glm-5.3-flash')},contextStatus:null,profile:null});
  assert.equal(listed.costSource,'https://docs.z.ai/guides/overview/pricing 2026-09-12');
  assert.ok(Math.abs(listed.costUsd!-((1400*0.15+1000*0.03+80*0.5)/1_000_000))<1e-12,'uncached input, cached input at the cache price, output');
  assert.deepEqual([usageSnapshot({state:{usage:measuredUsage('openrouter','x/y',0.002)},contextStatus:null,profile:null}).costUsd,usageSnapshot({state:{usage:measuredUsage('openrouter','x/y',0.002)},contextStatus:null,profile:null}).costSource],[0.004,'provider-reported']);
  const local=usageSnapshot({state:{usage:measuredUsage('ollama','qwen3')},contextStatus:null,profile:null});
  assert.deepEqual([local.local,local.costUsd,local.costSource],[true,null,null]);
  const unpriced=usageSnapshot({state:{usage:measuredUsage()},contextStatus:null,profile:null});
  assert.deepEqual([unpriced.costUsd,unpriced.costSource],[null,null],'no named source: no number');
  /* 0.6.13 (22/10/2026): DeepSeek Flash's row cites DeepSeek's pricing page; the provider's placeholder `'nessuna'` is never shown as a source */
  const flash=usageSnapshot({state:{usage:measuredUsage('deepseek','deepseek-flash')},contextStatus:null,profile:null});
  assert.equal(flash.costSource,'https://api-docs.deepseek.com/quick_start/pricing/ 2026-10-21');
  assert.ok(Math.abs(flash.costUsd!-((1400*0.3+1000*0.006+80*1.2)/1_000_000))<1e-12,'uncached input, cached input at the cache price, output');
  assert.equal(usageSnapshot({state:{usage:{prompt_tokens:10,completion_tokens:1}},contextStatus:null,profile:null,model:'ollama:qwen3'}).local,true,'the model id names a local engine before any request');
});

test('nothing reported yet: every figure null, never 0',()=>{
  assert.deepEqual(usageSnapshot({state:{usage:null},contextStatus:null,profile:null}),{inputTokens:null,outputTokens:null,cachedTokens:null,windowTokens:null,percent:null,estimated:false,costUsd:null,costSource:null,local:false,compactions:0,contextTokens:null});
});
