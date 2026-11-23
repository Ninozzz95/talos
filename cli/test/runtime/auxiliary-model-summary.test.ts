/*
 * 14/10/2026, owner («Il più economico dello stesso fornitore»). Through the REAL composition, kernel and Context Engine on a fake
 * provider: a conversation on DeepSeek's bigger model is summarised by DeepSeek's light model (the registry's
 * `modelloAusiliario`, deepseek-flash) — the same provider, the same key — while the conversation itself stays on its model.
 * The summary request is the one with no tools (context-engine summary call), as in r5a-coord-ce-compaction.test.ts.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {PASTED_LOG,PASTE_NOTE as NOTE,ceSummaryFor as summaryFor,composeWithFake,runTurn,startScriptedProvider,type ChatRequest} from './r5a-r-fixture.ts';

test.after(()=>resetModelProfiles());
const BIG='deepseek:deepseek-pro';
const FILE=(k:number)=>Array.from({length:180},(_,i)=>`compact file ${k} line ${String(i+1).padStart(3,'0')} ${'x'.repeat(24)}`).join('\n')+'\n';
const read=(k:number)=>({kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:`c${k}.txt`}]});
const tenReads=()=>{let asked=0;return(request:ChatRequest)=>!(request as any).tools?.length?{kind:'text' as const,text:summaryFor(request)}:request.lastUser.startsWith(NOTE)?{kind:'text' as const,text:'Noted.'}:asked<10?read(++asked):{kind:'text' as const,text:'Read them all.'};};

test('the Context Engine summarises a conversation with the light model of the same provider',{timeout:300_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  for(let k=1;k<=10;k++)writeFileSync(path.join(h.project,`c${k}.txt`),FILE(k));
  writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:1,models:{[BIG]:{contextWindow:65_536},'deepseek:deepseek-flash':{contextWindow:65_536}}}));
  const fake=await startScriptedProvider({goodKey:key,respond:tenReads(),models:[{id:'deepseek-pro',name:'DeepSeek Pro'},{id:'deepseek-flash',name:'DeepSeek Flash'}]});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const first=await runTurn(context,h,PASTED_LOG,{timeoutMs:240_000,model:BIG});
    await runTurn(context,h,'read the ten files',{timeoutMs:240_000,sessionId:first.sessionId,model:BIG});
    const summaries=fake.requests.filter(r=>!(r as any).tools?.length);
    const chat=fake.requests.filter(r=>(r as any).tools?.length);
    assert.ok(summaries.length>0,'a summary was asked');
    assert.deepEqual([...new Set(summaries.map(r=>r.body.model))],['deepseek-flash'],'the summary on the light model');
    assert.deepEqual([...new Set(chat.map(r=>r.body.model))],['deepseek-pro'],'the conversation stays on its model');
    assert.ok(fake.requests.every(r=>r.authorized),'the same provider, the same key');
  }finally{await context.runtime.close?.();await fake.close();}
}));
