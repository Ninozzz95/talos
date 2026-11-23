/*
 * Stage 7.10 (mockup PANELS.model): a catalogue model as the /model sheet shows it — where it runs, its list price only from a
 * named source, what it can do, and the efforts TALOS can set («default» first).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {modelRowOf,priceText} from '../../src/tui/model-rows.ts';

const base={source:'live',available:'live',availabilityVerified:true,capabilityEvidence:{} as any} as const;

test('prices as the mockup writes them',()=>{
  assert.equal(priceText(0.22),'$0.22');assert.equal(priceText(3),'$3');assert.equal(priceText(0.1),'$0.10');
});

test('a local model is free on this computer; a remote one without a known price names only where it runs',()=>{
  const local=modelRowOf({...base,id:'ollama:gemma-4-12b',provider:'ollama',name:'gemma-4-12b',contextWindow:32_000,toolCalling:true,reasoning:false,reasoningEfforts:null,images:false} as any,{providerLabel:'Ollama',local:true});
  assert.deepEqual(local,{id:'ollama:gemma-4-12b',name:'gemma-4-12b',provider:'Ollama',contextWindow:32_000,desc:'Ollama · on this computer · free',caps:'tools · no reasoning',efforts:['default'],verified:true,
    /* the model picker of the redesign filters on these */reasons:false,images:false,tools:true,free:true});
  assert.equal(modelRowOf({...base,availabilityVerified:false,id:'ollama:x',provider:'ollama',name:'x',contextWindow:null,toolCalling:null,reasoning:null,reasoningEfforts:null,images:null} as any,{providerLabel:'Ollama',local:true}).verified,false,'a model the provider did not list now');
  const remote=modelRowOf({...base,id:'nowhere-known:model-x',provider:'nowhere-known',name:'nowhere-known:model-x',contextWindow:null,toolCalling:null,reasoning:true,reasoningEfforts:['high','low','medium'],images:true} as any,{providerLabel:'Somewhere',local:false});
  assert.equal(remote.desc,'Somewhere','no price is invented');
  assert.equal(remote.name,'model-x','the name without the provider');
  assert.equal(remote.caps,'images · reasoning low to high','the levels in TALOS\'s order');
  assert.deepEqual(remote.efforts,['default','low','medium','high']);
});
