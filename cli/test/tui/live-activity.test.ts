import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveLiveActivity} from '../../src/tui/live-activity.ts';

test('M2-A-RED-4 — live activity is pure and preserves run-start timing',()=>{
  assert.deepEqual(deriveLiveActivity({running:false,reasoning:null,tools:[]},123),{kind:'idle',startedAt:null});
  assert.deepEqual(deriveLiveActivity({running:true,reasoning:null,tools:[]},123),{kind:'thinking',startedAt:123});
  assert.deepEqual(deriveLiveActivity({running:true,reasoning:{id:'r',text:'x'},tools:[]},123),{kind:'thinking',startedAt:123});
  assert.deepEqual(deriveLiveActivity({running:true,reasoning:null,tools:[{status:'running'}]},123),{kind:'tool',startedAt:123});
});

test('live activity module has no renderer or controller dependency',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/tui/live-activity.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"]react['"]|from ['"]ink['"]|session-controller|CliRuntime/u);
});


test('direct-dispatch RED — model submit has no starting/preparation activity state',()=>{
  const activity=deriveLiveActivity({running:false,preparing:true,reasoning:null,tools:[]} as any,456);
  assert.deepEqual(activity,{kind:'idle',startedAt:null});
});
