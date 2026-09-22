import assert from 'node:assert/strict';
import test from 'node:test';

async function virtualizerApi():Promise<any>{
  try{return await import('../../src/tui/components/transcript-virtualizer.ts');}
  catch{return{};}
}

test('transcript-virtualization RED-TV1 — geometric planner fills a row budget while preserving the semantic end anchor',async()=>{
  const api=await virtualizerApi();
  assert.equal(typeof api.planTranscriptVirtualWindow,'function','dynamic-height transcript planner is missing');

  const items=[
    {id:'a',height:2},
    {id:'b',height:2},
    {id:'c',height:10},
    {id:'d',height:2},
    {id:'e',height:2},
  ];

  const tail=api.planTranscriptVirtualWindow({
    items,
    offset:0,
    rowBudget:4,
    heightOf:(item:any)=>item.height,
  });
  assert.deepEqual(tail.rows.map((item:any)=>item.id),['d','e'],'planner must mount only rows that fit the terminal-row budget');
  assert.equal(tail.start,3);
  assert.equal(tail.end,5);

  const scrolled=api.planTranscriptVirtualWindow({
    items,
    offset:1,
    rowBudget:4,
    heightOf:(item:any)=>item.height,
  });
  assert.deepEqual(scrolled.rows.map((item:any)=>item.id),['d'],'offset must preserve the same semantic end anchor even when the preceding row is taller than the viewport');
  assert.equal(scrolled.end,4);

  const oversized=api.planTranscriptVirtualWindow({
    items:[{id:'huge',height:100}],
    offset:0,
    rowBudget:3,
    heightOf:(item:any)=>item.height,
  });
  assert.deepEqual(oversized.rows.map((item:any)=>item.id),['huge'],'an oversized anchor row must still render instead of producing a blank viewport');
});

test('transcript-virtualization RED-TV2 — measurement store is synchronous width-aware and ignores invalid or unchanged writes',async()=>{
  const api=await virtualizerApi();
  assert.equal(typeof api.createTranscriptMeasurementStore,'function','transcript measurement store is missing');
  assert.equal(typeof api.transcriptMeasurementKey,'function','width/render-variant measurement key seam is missing');

  const store=api.createTranscriptMeasurementStore();
  assert.deepEqual(store.getSnapshot(),{version:0});
  let notifications=0;
  const unsubscribe=store.subscribe(()=>{notifications++;});

  const compact80=api.transcriptMeasurementKey('m1',80,'pretty-compact');
  const compact120=api.transcriptMeasurementKey('m1',120,'pretty-compact');
  const raw80=api.transcriptMeasurementKey('m1',80,'raw');

  assert.notEqual(compact80,compact120);
  assert.notEqual(compact80,raw80);
  assert.equal(store.height(compact80),null);

  assert.equal(store.measure(compact80,7),true);
  assert.equal(store.height(compact80),7);
  assert.deepEqual(store.getSnapshot(),{version:1});
  assert.equal(notifications,1);

  assert.equal(store.measure(compact80,7),false,'same measured height must not publish redundant work');
  assert.equal(notifications,1);

  assert.equal(store.measure(compact80,0),false,'zero height must fail closed');
  assert.equal(store.measure(compact80,Number.NaN),false,'non-finite height must fail closed');
  assert.equal(notifications,1);
  unsubscribe();
});

test('transcript-virtualization RED-TV3 — real measurements override estimates without changing the anchored end item',async()=>{
  const api=await virtualizerApi();
  assert.equal(typeof api.planTranscriptVirtualWindow,'function');
  assert.equal(typeof api.createTranscriptMeasurementStore,'function');
  assert.equal(typeof api.transcriptMeasurementKey,'function');

  const items=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
  const store=api.createTranscriptMeasurementStore();
  const variant='pretty-compact';
  const width=80;
  const heightOf=(item:any)=>{
    const measured=store.height(api.transcriptMeasurementKey(item.id,width,variant));
    return measured??2;
  };

  const estimated=api.planTranscriptVirtualWindow({items,offset:0,rowBudget:5,heightOf});
  assert.deepEqual(estimated.rows.map((item:any)=>item.id),['c','d']);
  assert.equal(estimated.end,4);

  store.measure(api.transcriptMeasurementKey('d',width,variant),5);
  const corrected=api.planTranscriptVirtualWindow({items,offset:0,rowBudget:5,heightOf});
  assert.deepEqual(corrected.rows.map((item:any)=>item.id),['d'],'measured growth must shrink only the window start while preserving the tail anchor');
  assert.equal(corrected.end,4);

  const otherWidthKey=api.transcriptMeasurementKey('d',120,variant);
  assert.equal(store.height(otherWidthKey),null,'measurements from another width must never become current geometry authority');
});
