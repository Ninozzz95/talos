import assert from 'node:assert/strict';
import test from 'node:test';
import {
  catalogSourceFromKernel,
  mergeModelRows,
  normalizeModelRows,
} from '../../src/provider/model-catalog.ts';

test('successful provider catalog boundary is live even when the kernel omits fonte',()=>{
  assert.equal(catalogSourceFromKernel(undefined,{successfulCatalogBoundary:true}),'live');
  assert.equal(catalogSourceFromKernel('',{successfulCatalogBoundary:true}),'live');
  assert.equal(catalogSourceFromKernel('configurazione',{successfulCatalogBoundary:true}),'configured');
  assert.equal(catalogSourceFromKernel('documentazione',{successfulCatalogBoundary:true}),'documented');
  assert.equal(catalogSourceFromKernel('mystery',{successfulCatalogBoundary:false}),'unknown');
  assert.equal(catalogSourceFromKernel('https://docs.example.test/providers/gpt',{successfulCatalogBoundary:false}),'unknown','an evidence URL is not a structural availability source');
});

test('model capabilities retain per-field provenance instead of inheriting one row label',()=>{
  const [row]=normalizeModelRows([{
    id:'gpt-test',
    name:'GPT Test',
    contextLength:128_000,
    capabilities:{toolCall:true},
    reasoning:{supportedEfforts:['high','max']},
    inputModalities:['text','image'],
    fonteMetadati:'https://docs.example.test/gpt-test',
    dataMetadati:'2026-09-12',
  }],'openai','live');

  assert.ok(row);
  assert.equal(row.source,'live');
  assert.equal(row.availabilityVerified,true);
  assert.equal(row.contextWindow,128_000);
  assert.equal(row.capabilityEvidence.contextWindow.source,'documented','flattened context with documented metadata is not falsely called live');
  assert.equal(row.capabilityEvidence.contextWindow.evidenceUrl,'https://docs.example.test/gpt-test');
  assert.equal(row.capabilityEvidence.contextWindow.evidenceDate,'2026-09-12');
  assert.equal(row.toolCalling,true);
  assert.equal(row.capabilityEvidence.toolCalling.source,'live');
  assert.equal(row.reasoning,true);
  assert.deepEqual(row.reasoningEfforts,['high','max']);
  assert.equal(row.capabilityEvidence.reasoning.source,'documented');
  assert.equal(row.capabilityEvidence.reasoningEfforts.source,'documented');
  assert.equal(row.images,true);
  assert.equal(row.capabilityEvidence.images.source,'live');
});

test('live availability outranks configured presence while documented capability may fill an unknown live field',()=>{
  const [live]=normalizeModelRows([{
    id:'same',
    name:'Live name',
    capabilities:{toolCall:true},
    inputModalities:['text','image'],
  }],'openai','live');
  const [configured]=normalizeModelRows([{
    id:'same',
    name:'Configured name',
    contextLength:null,
  }],'openai','configured');
  const [documented]=normalizeModelRows([{
    id:'same',
    name:'Documented name',
    contextLength:200_000,
    toolCalling:true,
    fonteDichiarazione:'https://docs.example.test/same',
    dataDichiarazione:'2026-09-10',
  }],'openai','documented');

  const [merged]=mergeModelRows(live!,configured!,documented!);
  assert.ok(merged);
  assert.equal(merged.source,'live','current provider availability beats configured/documented presence');
  assert.equal(merged.availabilityVerified,true);
  assert.equal(merged.name,'Live name');
  assert.equal(merged.toolCalling,true);
  assert.equal(merged.capabilityEvidence.toolCalling.source,'live','live capability beats documented duplicate');
  assert.equal(merged.contextWindow,200_000,'documented evidence may fill a missing live capability');
  assert.equal(merged.capabilityEvidence.contextWindow.source,'documented');
  assert.equal(merged.capabilityEvidence.contextWindow.evidenceUrl,'https://docs.example.test/same');
});

test('configured or unknown presence never invents capabilities or verified availability',()=>{
  const [configured]=normalizeModelRows([{id:'manual',name:'Manual'}],'azure','configured');
  const [unknown]=normalizeModelRows([{id:'mystery'}],'custom','unknown');
  for(const row of [configured!,unknown!]){
    assert.equal(row.availabilityVerified,false);
    assert.equal(row.contextWindow,null);
    assert.equal(row.toolCalling,null);
    assert.equal(row.reasoning,null);
    assert.equal(row.reasoningEfforts,null);
    assert.equal(row.images,null);
    assert.equal(row.capabilityEvidence.contextWindow.source,'unknown');
    assert.equal(row.capabilityEvidence.toolCalling.source,'unknown');
    assert.equal(row.capabilityEvidence.reasoning.source,'unknown');
    assert.equal(row.capabilityEvidence.reasoningEfforts.source,'unknown');
    assert.equal(row.capabilityEvidence.images.source,'unknown');
  }
});

test('a configured-only extra stays unverified when merged beside a live model',()=>{
  const live=normalizeModelRows([{id:'live-model',name:'Live'}],'openai','live');
  const configured=normalizeModelRows([{id:'manual-model',name:'Manual'}],'openai','configured');
  const rows=mergeModelRows(...live,...configured);
  assert.deepEqual(rows.map(row=>[row.id,row.source,row.availabilityVerified]),[
    ['openai:live-model','live',true],
    ['openai:manual-model','configured',false],
  ]);
  assert.equal(rows.every(row=>row.availabilityVerified),false,'mixed lists cannot be globally verified');
});


test('an explicitly configured row appended inside a successful live response stays configured and unverified',()=>{
  const rows=normalizeModelRows([
    {id:'live',name:'Live'},
    {id:'manual',name:'Manual',fonte:'configurazione',capabilities:{toolCall:null}},
  ],'openai','live');

  assert.equal(rows[0]?.source,'live');
  assert.equal(rows[0]?.availabilityVerified,true);
  assert.equal(rows[1]?.source,'configured');
  assert.equal(rows[1]?.availabilityVerified,false);
  assert.equal(rows[1]?.toolCalling,null);
});


test('explicit live catalog capability fields are retained without model-name inference',()=>{
  const [row]=normalizeModelRows([{
    id:'vendor/model-x',
    context_length:131_072,
    supported_parameters:['tools','reasoning'],
    architecture:{input_modalities:['text','image']},
  }],'openrouter','live');

  assert.ok(row);
  assert.equal(row.id,'openrouter:vendor/model-x');
  assert.equal(row.contextWindow,131_072);
  assert.equal(row.toolCalling,true);
  assert.equal(row.reasoning,true);
  assert.equal(row.images,true);
  assert.equal(row.capabilityEvidence.contextWindow.source,'live');
  assert.equal(row.capabilityEvidence.toolCalling.source,'live');
  assert.equal(row.capabilityEvidence.reasoning.source,'live');
  assert.equal(row.capabilityEvidence.images.source,'live');

  const [unknown]=normalizeModelRows([{id:'looks-like-vision-reasoning-tool-model'}],'openrouter','live');
  assert.equal(unknown?.toolCalling,null);
  assert.equal(unknown?.reasoning,null);
  assert.equal(unknown?.images,null);
});

/* 08/10/2026 (owner: «impossibile che su Anthropic 5.x non si possa aggiustare il ragionamento»): the kernel now builds an Anthropic row's
   `reasoning` from the live catalog's `capabilities.thinking`/`capabilities.effort` (provider-probe.mjs, tests/provider-probe-anthropic-capacita.test.mjs).
   This pins what the CLI makes of that row: the model offers reasoning and exactly those levels, so a configured effort reaches the request
   instead of being dropped with REASONING_EFFORT_UNSUPPORTED. */
test('an Anthropic row carrying the kernel’s reasoning from the live capabilities offers reasoning and exactly its levels',()=>{
  const [opus,budget,none]=normalizeModelRows([
    {id:'anthropic:claude-opus-5-5',nome:'claude-opus-5-5',contextLength:1_000_000,reasoning:{supportedEfforts:['low','medium','high','xhigh','max'],defaultEffort:null,defaultEnabled:false,mandatory:false}},
    {id:'anthropic:claude-haiku-4-5-20251001',nome:'claude-haiku-4-5-20251001',contextLength:200_000,reasoning:{supportedEfforts:[],defaultEffort:null,defaultEnabled:false,mandatory:false}},
    {id:'anthropic:no-thinking',nome:'no-thinking',contextLength:200_000},
  ],'anthropic','live');
  assert.equal(opus!.reasoning,true);
  assert.deepEqual(opus!.reasoningEfforts,['low','medium','high','xhigh','max']);
  assert.equal(budget!.reasoning,true,'thinks on a budget: reasoning yes');
  assert.deepEqual(budget!.reasoningEfforts,[],'but no effort level to offer');
  assert.equal(none!.reasoning,null,'a row without any declaration stays unknown, never invented');
  assert.equal(none!.reasoningEfforts,null);
});
