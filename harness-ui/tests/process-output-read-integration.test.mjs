import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {join,relative,resolve,isAbsolute} from 'node:path';
import {createServer} from 'node:http';
import {avviaSessione} from '../src/agent-service.mjs';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {createOwnerRuntimeAdapter} from '../src/runtime-owner-adapter.mjs';
import {createHttpApp} from '../src/http-app.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';
import {talosLavora} from '../src/kernel/talosHarness.mjs';
import {createSessionRegistry} from '../src/session-registry.mjs';
const outputId='15743007-0583-4e50-b99a-a77e33d97115';

test('OUTPUT15-KERNEL-MISSING: retained output is an offered read tool and reaches its session reader', async () => {
  let calls=0,reads=0,offered; const events=[];
  await talosLavora({cartella:tmpdir(),task:{consegna:'Leggi il risultato salvato.'},modello:'fixture',chiave:'fixture',
    messaggiIniziali:[{role:'user',content:'Leggi il risultato salvato.'}],strumentiEstesi:['process_output'],livelloAccesso:'lettura',
    _giriMassimiInterno:3,onGiro:e=>events.push(e),
    readProcessOutputFn:async args=>{reads++;assert.equal(args.outputId,outputId);return 'PAGINA15 completa';},
    fetchDiRete:async (_url,init)=>{
      const request=JSON.parse(init.body);offered??=request.tools;
      const message=calls++===0?{role:'assistant',content:'',tool_calls:[{id:'read15',type:'function',function:{name:'process_output',arguments:JSON.stringify({outputId})}}]}:{role:'assistant',content:'Letto.'};
      return Response.json({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]});
    },
  });
  assert.equal(reads,1,'read callback must be invoked once');
  assert.ok(offered.some(t=>t.function.name==='process_output'));
  assert.equal(events.find(e=>e.tipo==='tool-esito').content,'PAGINA15 completa');
});

test('OUTPUT15-REGISTRY-MISSING: registry exposes the owner-scoped read boundary', async () => {
  const registry=createSessionRegistry({guardaWorkspaceFn:()=>()=>{}});
  try{assert.equal(typeof registry.leggiOutputProcesso,'function');}finally{await registry.chiudi();}
});

for(const mode of ['piano','child','unavailable'])test(`OUTPUT15-ROLE-${mode}: output reads respect capability and Plan/child boundaries`,async()=>{
  let calls=0,reads=0,offered;const events=[];
  await talosLavora({cartella:tmpdir(),task:{consegna:'Leggi.',...(mode==='child'?{contrattoDelega:{schema:'talos.delegation.v1',modalita:'lettura'}}:{})},
    modello:'fixture',chiave:'fixture',messaggiIniziali:[{role:'user',content:'Leggi.'}],strumentiEstesi:['process_output'],livelloAccesso:'lettura',
    modalitaOperativa:mode==='piano'?'piano':'normale',agentRole:mode==='child'?'child':'root',_giriMassimiInterno:3,onGiro:e=>events.push(e),
    ...(mode==='unavailable'?{}:{readProcessOutputFn:async()=>{reads++;return'PAGE15';}}),
    fetchDiRete:async(_url,init)=>{offered??=JSON.parse(init.body).tools;const message=calls++===0?{role:'assistant',content:'',tool_calls:[{id:'read15',type:'function',function:{name:'process_output',arguments:JSON.stringify({outputId})}}]}:{role:'assistant',content:'Fine.'};return Response.json({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]});},
  });
  assert.equal(reads,mode==='unavailable'?0:1);assert.equal(offered.some(t=>t.function.name==='process_output'),mode!=='unavailable');
  assert.equal(events.find(e=>e.tipo==='tool-esito').isError,mode==='unavailable');
});

test('OUTPUT15-ADAPTER: missing read contract is rejected before any provider work',async()=>{
  let ran=0;
  const adapter=createOwnerRuntimeAdapter({modulePath:resolve('output15-old.mjs'),importFn:async()=>({talosLavora:()=>{ran++;}})});
  await assert.rejects(adapter.talosLavora({readProcessOutputFn(){}}),e=>e.code==='PROCESS_OUTPUT_READ_CONTRACT_REQUIRED');assert.equal(ran,0);
});

test('OUTPUT15-REAL: real session/process -> reference -> tool read -> HTTP -> restart, with no repeated execution',async t=>{
  const root=mkdtempSync(join(tmpdir(),'talos-output-read15-'));let store,registry,server;
  t.after(async()=>{if(server)await new Promise(r=>server.close(r));await registry?.chiudi();await store?.close();const p=relative(resolve(tmpdir()),resolve(root));assert.ok(p&&!p.startsWith('..')&&!isAbsolute(p));rimuoviCartellaDiProva(root);});
  const middle='MIDDLE15-VERIFIED',stdout='a'.repeat(100000)+middle+'z'.repeat(200000),script=join(root,'producer.cjs');
  const executions=join(root,'executions.txt');
  writeFileSync(script,`require('node:fs').appendFileSync(${JSON.stringify(executions)},'x');process.stdout.write(${JSON.stringify(stdout)});process.stderr.write('stderr15');`);
  const command=`"${process.execPath}" "${script}"`,databasePath=join(root,'profile','outputs.sqlite');
  store=await createProcessOutputStore({databasePath,maxOutputBytes:1000000});
  let calls=0,retainedId,readContent,shellCalls=0,delayedStore;
  const fetchFixture=async(_url,init)=>{
    const request=JSON.parse(init.body);let tool;
    if(calls===0){shellCalls++;tool={name:'shell',arguments:JSON.stringify({comando:command})};}
    if(calls===1){
      const result=request.messages.filter(m=>m.role==='tool').at(-1).content;
      retainedId=result.match(/output reference: ([0-9a-f-]{36})/i)?.[1];assert.ok(retainedId,'actual retained ID is disclosed by command result');
      assert.ok(request.tools.some(t=>t.function.name==='process_output'));
      tool={name:'process_output',arguments:JSON.stringify({outputId:retainedId,offset:100000,limit:middle.length})};
    }
    if(calls===2)readContent=request.messages.filter(m=>m.role==='tool').at(-1).content;
    calls++;const message=tool?{role:'assistant',content:'',tool_calls:[{id:`call15-${calls}`,type:'function',function:tool}]}:{role:'assistant',content:'Ho letto la pagina conservata.'};
    return Response.json({choices:[{message,finish_reason:tool?'tool_calls':'stop'}]});
  };
  const options={cartellaStore:join(root,'sessions'),modello:'fixture',chiave:'fixture',guardaWorkspaceFn:()=>()=>{},processOutputStoreFn:()=>delayedStore??store,
    preparaEsecuzioneFn:id=>({cartella:root,task:{id,consegna:'Leggi il risultato del comando.'}}),
    avviaSessioneFn:input=>avviaSessione({...input,cartella:root,livelloAccesso:'completo',contestoDelProgettoFn:async()=>null,leggiContestoWorkspaceFn:()=>({}),
      talosLavoraFn:input=>talosLavora({...input,fetchDiRete:fetchFixture,onDelta:undefined,_giriMassimiInterno:4,ambienteComandiFn:()=>({dove:'windows',revisione:0})}),
    }),
  };
  registry=createSessionRegistry(options);const {sessionId}=registry.avvia('task15');await registry.attendiAssestamento(sessionId);
  assert.equal(shellCalls,1);assert.ok(readContent?.endsWith(middle),readContent);
  assert.equal((await registry.leggiOutputProcesso(sessionId,{outputId:retainedId,stream:'stderr'})).text,'stderr15');
  await assert.rejects(registry.leggiOutputProcesso(sessionId,{outputId:retainedId,sessionId:'other'}),e=>e.code==='OUTPUT_INVALID_INPUT');
  await assert.rejects(registry.leggiOutputProcesso('other',{outputId:retainedId}),e=>e.code==='OUTPUT_NOT_FOUND');
  server=createServer(createHttpApp({staticHandler:()=>{},token:'fixture15',sessionRegistry:registry}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/api/v1/sessions/${sessionId}/process-outputs/${retainedId}?offset=100000&limit=${middle.length}`;
  assert.equal((await fetch(url)).status,401);
  const response=await fetch(url,{headers:{Cookie:'talos_token=fixture15'}});assert.equal(response.status,200);assert.equal((await response.json()).data.text,middle);
  await new Promise(r=>server.close(r));server=null;await registry.chiudi();await store.close();
  store=await createProcessOutputStore({databasePath,maxOutputBytes:1000000});registry=createSessionRegistry(options);await registry.ripristina();
  assert.equal((await registry.leggiOutputProcesso(sessionId,{outputId:retainedId,offset:100000,limit:middle.length})).text,middle);
  assert.equal(shellCalls,1);
  assert.equal(readFileSync(executions,'utf8'),'x','the actual child process ran once across reads and restart');
  let release;delayedStore=new Promise(r=>{release=r;});
  const late=registry.leggiOutputProcesso(sessionId,{outputId:retainedId});
  await registry.chiudi();release(store);
  await assert.rejects(late,e=>e.code==='OUTPUT_SESSION_UNAVAILABLE','closing during admission must fence a late read');
});
