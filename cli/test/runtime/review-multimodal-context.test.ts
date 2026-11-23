import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {composeWithFake,runTurn,startScriptedProvider,MODEL} from './r5a-r-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
test.after(()=>resetModelProfiles());

test('REV-CONTEXT-MODES repeated plan/manual turns keep archive history aligned',{timeout:60_000},async()=>hermetic(async h=>{
 const key=dummyKey('deepseek'),fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text',text:'OK'})});
 const context=await composeWithFake(h,fake.url,key);
 try{
  const first=await runTurn(context,h,'Plan a small change',{permissionMode:'plan'});
  assert.equal(first.raw.some(e=>e.type==='RunError'),false);
  await context.runtime.setPermissionMode(first.sessionId,'default');
  const second=await runTurn(context,h,'Now explain the next step',{sessionId:first.sessionId});
  assert.equal(second.raw.some(e=>e.type==='RunError'),false);
  await context.runtime.setPermissionMode(first.sessionId,'plan');
  const third=await runTurn(context,h,'Review that plan once more',{sessionId:first.sessionId});
  assert.equal(third.raw.some(e=>e.type==='RunError'),false);
 }finally{await context.runtime.close();await fake.close();}
}));

test('REV-IMAGE-WIRE accepted image bytes reach compatible HTTP transport and survive follow-up',{timeout:60_000},async()=>hermetic(async h=>{
 const key=dummyKey('deepseek'),fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text',text:'OK'})});
 const context=await composeWithFake(h,fake.url,key);
 // Capability metadata is a fixture; this is not a claim about a real provider's vision support.
 const list=context.tuiCatalog.listModels.bind(context.tuiCatalog);
 context.tuiCatalog.listModels=async(input:any)=>(await list(input)).map((row:any)=>({...row,images:true}));
 const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=';
 try{
  const id=await context.runtime.start({projectRoot:h.project,model:MODEL,permissionMode:'default',prompt:'Inspect this image',attachments:[{kind:'image',path:'pixel.png',mimeType:'image/png',bytes:Buffer.from(data,'base64').length,dataBase64:data}]});
  const events:any[]=[];const off=context.runtime.subscribe(id,(event:any)=>events.push(event),0);
  try{const end=Date.now()+20_000;while(!events.some(e=>['RunFinished','RunError','RunCancelled'].includes(e.type))){assert.ok(Date.now()<end,'first image turn completed');await new Promise(resolve=>setTimeout(resolve,20));}}
  finally{off();}
  assert.equal(events.some(e=>e.type==='RunError'),false,JSON.stringify(events.filter(e=>e.type==='RunError')));
  const imageParts=()=>fake.requests.at(-1)!.body.messages.flatMap((m:any)=>Array.isArray(m.content)?m.content:[]).filter((part:any)=>part.type==='image_url');
  assert.equal(imageParts()[0]?.image_url.url,'data:image/png;base64,'+data);
  const follow=await runTurn(context,h,'Look again at the same image',{sessionId:id});
  assert.equal(follow.raw.some(e=>e.type==='RunError'),false);
  assert.equal(imageParts()[0]?.image_url.url,'data:image/png;base64,'+data);
 }finally{await context.runtime.close();await fake.close();}
}));
