import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime} from '../provider/first-run-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {PASTED_LOG,PASTE_NOTE,ceSummaryFor as summaryFor,runTurn,startScriptedProvider,type ChatRequest} from './r5a-r-fixture.ts';

const MODEL='ollama:fake-qwen';
const FILE=(k:number)=>Array.from({length:180},(_,i)=>`compact file ${k} line ${String(i+1).padStart(3,'0')} ${'x'.repeat(24)}`).join('\n')+'\n';
const read=(k:number)=>({kind:'tool' as const,name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:`c${k}.txt`}]});


test.after(()=>resetModelProfiles());

test('P3-OLLAMA-FAKE-COMPACTION: local Ollama wire commits a Context Engine version through real composition',{timeout:300_000},async()=>hermetic(async h=>{
  for(let k=1;k<=10;k++)writeFileSync(path.join(h.project,`c${k}.txt`),FILE(k));
  let asked=0;
  const fake=await startScriptedProvider({
    goodKey:null,
    models:[{id:'fake-qwen',name:'fake-qwen'}],
    answerOther:(method,where)=>method==='POST'&&where==='/api/show'?{status:200,body:{parameters:'num_ctx 65536',model_info:{'qwen.context_length':131072}}}:method==='GET'&&where==='/api/tags'?{status:200,body:{models:[{name:'fake-qwen',model:'fake-qwen'}]}}:null,
    /* r4 de8f33317 (C1): ten reads alone no longer reach a summary; it comes from the log the person pasted in the first turn. The
       scripted model counts its own reads (the engine clears old tool results, so counting them in the request would loop). */
    respond:request=>{
      if(!request.tools.length)return{kind:'text',text:summaryFor(request)};
      if(request.lastUser.startsWith(PASTE_NOTE))return{kind:'text',text:'Noted.'};
      return asked<10?read(++asked):{kind:'text',text:'Done: read ten files.'};
    },
  });
  writeProviderRuntime(h.paths,{ollama:fake.url});
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring()} as any);
  try{
    const first=await runTurn(context,h,PASTED_LOG,{model:MODEL,timeoutMs:240_000});
    const {sessionId,raw}=await runTurn(context,h,'read the ten files',{model:MODEL,timeoutMs:240_000,sessionId:first.sessionId});
    const custom=raw.filter(e=>e?.type==='CUSTOM').map(e=>`${e.name}:${e.value?.kind??''}`);
    const status=await context.runtime.contextStatus(sessionId);
    const observed=JSON.stringify({requests:fake.requests.length,other:fake.other,custom,version:status?.activeVersion??status?.version??null,errors:raw.filter(e=>e?.type==='RunError')});
    assert.deepEqual(h.network.blocked,[],`unexpected outbound request: ${observed}`);
    assert.ok(fake.requests.length>0,`no Ollama-shaped chat request: ${observed}`);
    assert.ok(fake.requests.every(request=>request.authorized),`the keyless fake saw an Authorization header: ${observed}`);
    assert.ok(fake.other.some(request=>request.path==='/api/show'),`no Ollama model-window discovery: ${observed}`);
    assert.equal(status.measurement?.windowTokens,65_536,`the Ollama num_ctx was not used: ${observed}`);
    assert.match(status.budget?.provenance??'',/^model profile: ollama-show/u,`the Ollama window lacks provenance: ${observed}`);
    assert.ok(custom.includes('talos.context:context.version.committed'),`no committed Context Engine version: ${observed}`);
    assert.ok(fake.requests.some(request=>!request.tools.length),`no summary request: ${observed}`);
    assert.ok(raw.some(e=>e?.type==='RunFinished'),`the turn did not finish: ${observed}`);
  }finally{await context.runtime.close?.();await fake.close();}
}));
