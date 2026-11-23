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
  assert.equal(typeof api.planTranscriptVirtualWindow,'function','estimate-to-measured transcript correction planner is missing');
  assert.equal(typeof api.createTranscriptMeasurementStore,'function','estimate-to-measured transcript measurement store is missing');
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


test('transcript-virtualization RED-TV6A — explicit reveal falls back to the exact legacy logical page only when geometry would hide the target',async()=>{
  const api=await virtualizerApi();
  assert.equal(typeof api.planTranscriptVirtualWindow,'function');

  const items=[
    {id:'a',height:1},
    {id:'b',height:10},
    {id:'c',height:10},
    {id:'d',height:10},
    {id:'e',height:10},
  ];

  const strict=api.planTranscriptVirtualWindow({
    items,
    offset:0,
    rowBudget:3,
    heightOf:(item:any)=>item.height,
  });
  assert.deepEqual(strict.rows.map((item:any)=>item.id),['e']);

  const reveal=api.planTranscriptVirtualWindow({
    items,
    offset:0,
    rowBudget:3,
    heightOf:(item:any)=>item.height,
    revealIndex:0,
    legacyPageSize:5,
  });
  assert.deepEqual(
    reveal.rows.map((item:any)=>item.id),
    ['a','b','c','d','e'],
    'OWNER policy A requires exact legacy-page fallback when strict geometry would hide an explicit search/jump target',
  );
  assert.equal(reveal.start,0);
  assert.equal(reveal.end,5);

  const alreadyVisible=api.planTranscriptVirtualWindow({
    items,
    offset:0,
    rowBudget:3,
    heightOf:(item:any)=>item.height,
    revealIndex:4,
    legacyPageSize:5,
  });
  assert.deepEqual(alreadyVisible.rows.map((item:any)=>item.id),['e'],'a reveal already inside strict geometry must not widen the window');
});

/* 08/10/2026 — the height estimate of an item that was never mounted is kept per item object. Before, every plan (three per render) re-counted
   every such item: the Markdown of every assistant message and the wrapped lines of every tool row, on each frame of a long transcript. */
function counted<T extends object>(item:T):{item:T;reads:()=>number}{
  let reads=0;
  /* `kind` and `status` are what decides whether a count may be kept; the CONTENT fields are what a count reads */
  const proxy=new Proxy(item,{get(target,key,receiver){if(key!=='kind'&&key!=='status')reads+=1;return Reflect.get(target,key,receiver);}});
  return{item:proxy,reads:()=>reads};
}
const LONG_PROSE=Array.from({length:40},(_,index)=>`Paragraph ${index}: a sentence that is long enough to wrap at a narrow width, with \`code\` and **bold** words.`).join('\n\n');
const finishedTool={kind:'tool',id:'tool:t1',name:'shell',status:'completed',argsText:'{"comando":"npm test"}',liveOutput:'',finalOutput:'exit 0\nok\nok\nok',startedAt:1,endedAt:2,outcome:null};

test('transcript-virtualization EST1 — the estimate of an unchanged item is kept for the same width and options, and equals a fresh count',async()=>{
  const {estimateTranscriptItemRows}=await virtualizerApi();
  assert.equal(typeof estimateTranscriptItemRows,'function');
  const items=[
    {kind:'message',id:'m1',role:'assistant',text:LONG_PROSE,streaming:false},
    {kind:'message',id:'m2',role:'user',text:'a short question'},
    {kind:'reasoning',id:'r1',text:'thinking about a thing at some length',streaming:false},
    finishedTool,
    {kind:'warning',id:'w1',text:'something happened'},
  ];
  for(const item of items){
    const watched=counted(item as object);
    const first=estimateTranscriptItemRows(watched.item,60,{maxProseWidth:80,expandedTools:false,reasoningVisible:true});
    const afterFirst=watched.reads();
    assert.ok(afterFirst>0,`${(item as any).id}: the first count reads the item`);
    const second=estimateTranscriptItemRows(watched.item,60,{maxProseWidth:80,expandedTools:false,reasoningVisible:true,now:123456});
    assert.equal(watched.reads(),afterFirst,`${(item as any).id}: the second count does not read the item again (a clock that no finished row reads is not part of the key)`);
    assert.equal(second,first);
    assert.equal(estimateTranscriptItemRows(structuredClone(item),60,{maxProseWidth:80,expandedTools:false,reasoningVisible:true}),first,`${(item as any).id}: the kept value is the fresh value`);
  }
});

test('transcript-virtualization EST2 — a different width or layout option is a different estimate, counted again',async()=>{
  const {estimateTranscriptItemRows}=await virtualizerApi();
  const message={kind:'message',id:'m1',role:'assistant',text:LONG_PROSE,streaming:false};
  const base={maxProseWidth:80,expandedTools:false,reasoningVisible:true};
  const variants:Array<[string,number,Record<string,unknown>]>=[
    ['width',40,base],['raw',60,{...base,raw:true}],['prose width',60,{...base,maxProseWidth:50}],['no prose width',60,{maxProseWidth:null,expandedTools:false,reasoningVisible:true}],
    ['expanded tools',60,{...base,expandedTools:true}],['reasoning hidden',60,{...base,reasoningVisible:false}],
  ];
  const watched=counted(message);
  estimateTranscriptItemRows(watched.item,60,base);
  for(const [name,width,options] of variants){
    const before=watched.reads();
    const rows=estimateTranscriptItemRows(watched.item,width,options);
    assert.ok(watched.reads()>before,`${name}: counted again`);
    assert.equal(rows,estimateTranscriptItemRows(structuredClone(message),width,options),`${name}: equals a fresh count`);
  }
  const tool=counted(finishedTool as object);
  estimateTranscriptItemRows(tool.item,60,{expandedTools:false});
  const before=tool.reads();
  estimateTranscriptItemRows(tool.item,60,{expandedTools:true});
  assert.ok(tool.reads()>before,'a tool row opened (expanded) is another estimate');
});

test('transcript-virtualization EST3 — a changed item is a new object and is counted again; a row that reads the clock is never kept',async()=>{
  const {estimateTranscriptItemRows}=await virtualizerApi();
  const streaming={kind:'message',id:'m1',role:'assistant',text:'one line',streaming:true};
  const grown={...streaming,text:'one line\n\n'+LONG_PROSE};
  const a=estimateTranscriptItemRows(streaming,60,{maxProseWidth:80});
  const b=estimateTranscriptItemRows(grown,60,{maxProseWidth:80});
  assert.ok(b>a,'a grown message is not answered with the old count');
  for(const status of ['queued','running','streaming']){
    const running=counted({...finishedTool,id:`tool:${status}`,status,startedAt:0,endedAt:null,finalOutput:''} as object);
    estimateTranscriptItemRows(running.item,60,{expandedTools:false,now:0});
    const before=running.reads();
    estimateTranscriptItemRows(running.item,60,{expandedTools:false,now:90_000});
    assert.ok(running.reads()>before,`a ${status} tool row is read again: its line says how long it has run`);
  }
  const approval=counted({...finishedTool,id:'tool:approval',status:'approval',endedAt:null,finalOutput:''} as object);
  estimateTranscriptItemRows(approval.item,60,{expandedTools:false});
  const before=approval.reads();
  estimateTranscriptItemRows(approval.item,60,{expandedTools:false});
  assert.equal(approval.reads(),before,'a tool row that waits for the person does not read the clock, so it is kept');
});

/* Long chats, tappa D: the announcement row counts what is above the view WITHOUT the row that offers the beginning of the conversation */
test('transcript-virtualization ABOVE1 — the earlier row is not one of the items above the view, and not a message',async()=>{
  const api=await virtualizerApi();
  assert.equal(typeof api.countAboveView,'function');
  const items=[{kind:'earlier'},{kind:'message'},{kind:'tool'},{kind:'message'},{kind:'message'}];
  assert.deepEqual(api.countAboveView(items,0),{hidden:0,messages:0},'nothing above the view');
  assert.deepEqual(api.countAboveView(items,1),{hidden:0,messages:0},'only the row is above: nothing to announce');
  assert.deepEqual(api.countAboveView(items,2),{hidden:1,messages:1});
  assert.deepEqual(api.countAboveView(items,4),{hidden:3,messages:2},'the three items after the row: a message, a tool, a message');
  assert.deepEqual(api.countAboveView(items.slice(1),3),{hidden:3,messages:2},'without the row it is as it always was');
  assert.deepEqual(api.countAboveView([],5),{hidden:5,messages:0});
});
