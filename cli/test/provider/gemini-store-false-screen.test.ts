/*
 * Row 10 of PIANO-CLI-0.7.0 (judge v2526): `store:false` reaches Gemini from the two roads the 0.6.18 measure did not take.
 * The package measure of 21/11 (RAPPORTO-MISURA-STORE-GEMINI-CLI-0618) saw only `talos -p` with streaming. Here:
 *   1. the interactive screen: a typed prompt, the real composed runtime, `:streamGenerateContent`;
 *   2. no streaming: the Context Engine's summary (`callSummaryModel`, the CLI's own door, `stream:false`), `:generateContent`.
 * No byte leaves the process: the hermetic fixture refuses every host but its own loopback servers, and the Gemini address is
 * answered here, in the process, before the fixture's fetch is ever asked. The key is a dummy and is never printed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';
import {callSummaryModel} from '../../src/runtime/talos-composition.ts';
import {dummyKey,fakeKeyring,hermetic,mountTui,REPO_ROOT} from './first-run-fixture.ts';

const GEMINI='generativelanguage.googleapis.com';
const MODEL_ID='gemini-3.5-flash-lite';
const MODEL=`gemini:${MODEL_ID}`;
type Seen={method:string;path:string;body:any};

/** Answers Gemini in the process; everything else goes to the fixture's fetch (which refuses it). */
function geminiInProcess(){
  const seen:Seen[]=[];const behind=globalThis.fetch;
  const piece={candidates:[{content:{role:'model',parts:[{text:'OK'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:5,candidatesTokenCount:1,totalTokenCount:6}};
  globalThis.fetch=(async(input:any,init?:any)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:String(input?.url));
    if(url.hostname!==GEMINI)return behind(input,init);
    const raw=typeof init?.body==='string'?init.body:null;let body:any=null;try{body=raw===null?null:JSON.parse(raw);}catch{body='unreadable';}
    seen.push({method:String(init?.method??'GET'),path:url.pathname,body});
    if(url.pathname.endsWith(':streamGenerateContent'))return new Response(`data: ${JSON.stringify(piece)}\n\n`,{headers:{'content-type':'text/event-stream'}});
    if(url.pathname.endsWith(':generateContent'))return Response.json(piece);
    if(url.pathname.endsWith(':countTokens'))return Response.json({totalTokens:5});
    if(url.pathname.endsWith('/models'))return Response.json({models:[{name:`models/${MODEL_ID}`,displayName:'Flash Lite',inputTokenLimit:1_048_576,outputTokenLimit:65_536,supportedGenerationMethods:['generateContent','countTokens']}]});
    return Response.json({error:{code:404,message:'not served here',status:'NOT_FOUND'}},{status:404});
  }) as typeof fetch;
  return seen;
}

async function composed(h:any){
  const context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring()} as any);
  context.providerStore.setKey('gemini',dummyKey('gemini-store'));
  return context;
}

test('row 10: a prompt typed on the interactive screen reaches Gemini streaming with store:false',async()=>hermetic(async h=>{
  const seen=geminiInProcess();
  const context=await composed(h);
  try{
    await context.tuiCatalog.chooseProvider('gemini');
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,model:MODEL});
    try{
      await tui.typeAndEnter('hello gemini');
      await tui.until(frame=>/\bOK\b/u.test(frame),'the streamed reply',30_000);
    }finally{tui.unmount();}
    const turns=seen.filter(row=>row.method==='POST'&&row.path.endsWith(`/models/${MODEL_ID}:streamGenerateContent`));
    assert.equal(turns.length,1,`one streaming request (seen: ${seen.map(row=>row.path).join(', ')})`);
    assert.equal(turns[0]!.body?.store,false,'the interactive screen sends store:false');
    assert.ok(Array.isArray(turns[0]!.body?.contents),'and it is the SDK body, with store added to it');
    assert.equal(h.network.blocked.length,0,`nothing left the process: ${h.network.blocked.join(', ')}`);
  }finally{await context.runtime.close();}
}));

test('row 10: a request without streaming (the Context Engine summary) reaches Gemini generateContent with store:false',async()=>hermetic(async h=>{
  const seen=geminiInProcess();
  const context=await composed(h);
  try{
    const answer=await callSummaryModel({ownerRuntime:context.ownerRuntime,request:{provider:'gemini',model:MODEL_ID,messages:[{role:'user',content:'summarise: hello'}],maxOutputTokens:64}});
    assert.ok(answer,'the summary came back');
    const calls=seen.filter(row=>row.method==='POST'&&row.path.endsWith(`/models/${MODEL_ID}:generateContent`));
    assert.equal(calls.length,1,`one request without streaming (seen: ${seen.map(row=>row.path).join(', ')})`);
    assert.equal(calls[0]!.body?.store,false,'the request without streaming sends store:false');
    assert.equal(seen.some(row=>row.path.endsWith(':streamGenerateContent')),false,'and it is not the streaming road');
    assert.equal(h.network.blocked.length,0,`nothing left the process: ${h.network.blocked.join(', ')}`);
  }finally{await context.runtime.close();}
}));
