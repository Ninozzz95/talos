import assert from 'node:assert/strict';
import test from 'node:test';
import {createMemoryCenterModel,moveMemoryCenterSelection,renderMemoryCenterLines} from '../../src/tui/overlays/memory-center.ts';

const row:any={
  id:'m\\danger\u001b[2J',
  title:'Alpha\u202Ehidden\nnext',
  content:'Body\u0007text',
  kind:'preference',
  createdAt:'2026-09-21T10:00:00.000Z',
  updatedAt:'2026-09-21T11:00:00.000Z',
  provenance:{
    writer:'persona',
    writerEvidence:'persisted',
    scope:'global',
    scopeEvidence:'derived-store-contract',
    projectId:null,
    sessionId:null,
    source:null
  },
  duplicateControl:{
    mode:'create-title-normalized',
    normalization:'trim-lowercase',
    onCreateDuplicate:'return-existing-no-write',
    onUpdate:'not-checked',
    semanticDetection:false,
    merge:false
  },
  usage:{status:'unavailable',reason:'store-does-not-persist-memory-usage'},
  cost:{status:'unavailable',reason:'store-does-not-persist-memory-cost'}
};

const snapshot:any={
  state:'ready',
  scope:{kind:'global',evidence:'derived-store-contract',projectId:null,sessionId:null},
  rows:[row],
  error:null
};

test('M9-A RED — Memory Center renders provenance scope duplicate policy and measured-only usage/cost honestly',()=>{
  const lines=renderMemoryCenterLines(createMemoryCenterModel(snapshot,0));
  const output=lines.join('\n');
  /* R2 (gate §1.5, Q-R2-10): the kernel's `origine`/`formato` values are shown in English (persona → you, modello → model,
     markdown → Markdown), never raw. */
  for(const token of ['Memory','global','Writer: you','persisted','trim-lowercase','return-existing-no-write','not-checked','Usage: unavailable','Cost: unavailable','m'])assert.match(output,new RegExp(token,'u'));
});

test('M9-A RED — Memory Center neutralizes terminal controls bidi line breaks and backslashes',()=>{
  const lines=renderMemoryCenterLines(createMemoryCenterModel(snapshot,0));
  const output=lines.join('\n');
  assert.equal(output.includes('\u001b'),false);
  assert.equal(output.includes('\u202e'),false);
  assert.equal(output.includes('\u0007'),false);
  assert.equal(lines.some(line=>line.includes('hidden\nnext')),false);
  assert.match(output,/\\u001b/u);
  assert.match(output,/\\u202e/u);
  assert.match(output,/\\u0007/u);
  assert.match(output,/\\\\/u);
});

test('M9-A RED — Memory Center selection is bounded and uses stable memory ids',()=>{
  const second={...row,id:'m-2',title:'Beta'};
  let model=createMemoryCenterModel({...snapshot,rows:[row,second]},0);
  model=moveMemoryCenterSelection(model,1);assert.equal(model.selected,1);
  assert.equal(model.snapshot.rows[model.selected]?.id,'m-2');
  model=moveMemoryCenterSelection(model,99);assert.equal(model.selected,1);
  model=moveMemoryCenterSelection(model,-99);assert.equal(model.selected,0);
});

test('M9-A RED — invalid store state stays visibly invalid instead of rendering guessed memories',()=>{
  const invalid:any={state:'invalid',scope:snapshot.scope,rows:[],error:{code:'MEMORY_STORE_INVALID',message:'bad row'}};
  const output=renderMemoryCenterLines(createMemoryCenterModel(invalid,0)).join('\n');
  assert.match(output,/MEMORY_STORE_INVALID/u);
  assert.match(output,/bad row/u);
  assert.doesNotMatch(output,/persona|modello/u);
});
