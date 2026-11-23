/*
 * LONG-CHAT tappa B1 on the real TuiApp (fixture of r1-layout): resuming a session by id restores that session's family only and, once attached,
 * reads what it needs about it (its reasoning effort, the outcome of its replayed run, its agents) from what is already in memory; a plain start
 * restores nothing. The facade/controller/supervisor wiring is proven in their own tests; this proves app.ts asks the runtime the cheap question.
 */
import assert from 'node:assert/strict';
import {rmSync} from 'node:fs';
import test,{after} from 'node:test';
import {hermeticProfile,mountApp,sleep} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
after(()=>{try{rmSync(env.root,{recursive:true,force:true});}catch{/* best effort */}});

test('B1 app: resume by id restores that family and never lists the whole archive',async()=>{
  const restores:unknown[]=[];const lists:unknown[]=[];
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,history:[],onRestore:selection=>restores.push(selection??'all'),onListSessions:options=>lists.push(options??'all')});
  try{
    await sleep(400);
    assert.deepEqual(restores,[{sessionIds:['s1']}],'the family of the resumed session only');
    assert.ok(lists.length>0,'the app did read the session row (its reasoning effort) after attaching');
    assert.ok(!lists.includes('all'),`the row is read from memory, not by restoring the archive: ${JSON.stringify(lists)}`);
  }finally{app.unmount();}
});

test('B1 app: a plain start restores nothing and lists nothing',async()=>{
  const restores:unknown[]=[];const lists:unknown[]=[];
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,history:[],invocation:{model:'openai:gpt-5-mini',permissionMode:'default'},onRestore:selection=>restores.push(selection??'all'),onListSessions:options=>lists.push(options??'all')});
  try{
    await sleep(400);
    assert.deepEqual(restores,[]);
    assert.ok(!lists.includes('all'),`no whole-archive list at a plain start: ${JSON.stringify(lists)}`);
  }finally{app.unmount();}
});

test('B2 app: the /resume sheet reads every listed conversation\'s events, so it loads the archive first (the list alone is served from the index without loading them)',async()=>{
  const restores:unknown[]=[];
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,history:[],invocation:{model:'openai:gpt-5-mini',permissionMode:'default'},onRestore:selection=>restores.push(selection??'all')});
  try{
    await sleep(300);
    assert.deepEqual(restores,[],'a plain start loads nothing');
    app.press('/resume');await sleep(60);app.press('\r');
    for(let i=0;i<60&&!restores.includes('all');i++)await sleep(50);
    assert.ok(restores.includes('all'),`the sheet loaded the whole archive before reading digests: ${JSON.stringify(restores)}`);
  }finally{app.unmount();}
});
