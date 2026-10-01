import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {talosLavora} from '../src/kernel/talosHarness.mjs';
import {avviaSessione} from '../src/agent-service.mjs';
import {leggiArtefatto} from '../src/artifact-store.mjs';
import {elencaVoci,leggiVoce} from '../src/library-store.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function directory(t){const root=mkdtempSync(join(tmpdir(),'talos-artifact27-'));t.after(()=>rimuoviCartellaDiProva(root));return root;}
function transport(sent,{html='<p>artifact</p>',titolo='Artifact27',stream=false}={}){
 let count=0;
 return async(_url,opts)=>{
  const request=JSON.parse(opts.body);sent.push(request);assert.equal(request.stream===true,stream);
  const first=count++===0;
  const call={id:'artifact27',type:'function',function:{name:'artifact_create',arguments:JSON.stringify({titolo,html})}};
  if(stream){
   const delta=first?{role:'assistant',tool_calls:[{...call,index:0}]}:{role:'assistant',content:'Done.'};
   return new Response(`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason:first?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
  }
  return Response.json({choices:[{message:first?{role:'assistant',content:null,tool_calls:[call]}:{role:'assistant',content:'Done.'},finish_reason:first?'tool_calls':'stop'}]});
 };
}
async function kernel(t,options={}){
 const sent=[],events=[];
 await talosLavora({cartella:directory(t),task:{consegna:'Create the requested artifact.'},modello:'fixture/artifact27',chiave:'fixture',
  livelloAccesso:'accesso-pieno',strumentiEstesi:['artifact_create'],_giriMassimiInterno:2,
  ...options,fetchDiRete:transport(sent,options),onGiro:e=>events.push(e)});
 const result=events.find(e=>e.tipo==='tool-esito');assert.ok(result);assert.equal(sent.length,2);
 assert.equal(sent[1].messages.find(m=>m.tool_call_id==='artifact27').content,result.content);
 return result;
}
function service(t,{html='<p>artifact</p>',titolo='Artifact27',...options}={}){
 const root=directory(t),events=[],sent=[];
 const promise=avviaSessione({cartella:root,cartellaDatiProgettoFn:()=>root,task:{consegna:'Create the requested artifact.'},modello:'fixture/artifact27',chiave:'fixture',
  livelloAccesso:'accesso-pieno',strumentiEstesi:['artifact_create'],onEvento:e=>events.push(e),...options,
  talosLavoraFn:input=>talosLavora({...input,fetchDiRete:transport(sent,{html,titolo,stream:true})})});
 return{root,events,sent,promise};
}
function result(s){const r=s.events.find(e=>e.type==='ToolCallResult');assert.ok(r,JSON.stringify(s.events.map(e=>({type:e.type,message:e.message}))));
 assert.equal(s.sent.length,2);assert.equal(s.sent[1].messages.find(m=>m.tool_call_id==='artifact27').content,r.content);return r;}

test('ARTIFACT27-MISSING: no callback cannot report a created artifact',async t=>{
 const r=await kernel(t);assert.equal(r.isError,true);assert.match(r.content,/ARTIFACT_UNAVAILABLE/);assert.doesNotMatch(r.content,/created:/);
});
test('ARTIFACT27-EMPTY: empty HTML is an error without invoking the saver',async t=>{
 let calls=0;const r=await kernel(t,{html:' \n ',onArtefatto:async()=>{calls++;return{id:'unexpected'};}});assert.equal(r.isError,true);assert.equal(calls,0);assert.match(r.content,/Empty html/);
});
test('ARTIFACT27-INVALID: invalid callback results never confirm creation or retry',async t=>{
 for(const value of[null,undefined,[],{}, {id:''},{id:'  '},{id:42},{id:'fake',ok:false}]){
  let calls=0;const r=await kernel(t,{onArtefatto:async()=>{calls++;return value;}});assert.equal(r.isError,true);assert.equal(calls,1);assert.match(r.content,/ARTIFACT_RESULT_INVALID/);assert.doesNotMatch(r.content,/created:/);
 }
});
test('ARTIFACT27-THROW: callback exception stays visible without retry',async t=>{
 let calls=0;const r=await kernel(t,{onArtefatto:async()=>{calls++;throw Error('artifact disk unavailable');}});assert.equal(r.isError,true);assert.equal(calls,1);assert.match(r.content,/artifact disk unavailable/);
});
test('ARTIFACT27-SUCCESS: valid legacy id preserves the exact success text',async t=>{
 const r=await kernel(t,{titolo:'Error is quoted data',onArtefatto:async()=>({id:'artifact-real-id'})});assert.equal(r.isError,false);assert.equal(r.content,'created: "Error is quoted data" (id: artifact-real-id)');
});
for(const[id,html]of[['OVERSIZE','x'.repeat(400001)],['UTF8','€'.repeat(133334)]])test(`ARTIFACT27-${id}: rejected bytes do not create a fake id or event`,async t=>{
 let saved=0,libraries=0;const s=service(t,{html,salvaArtefattoFn:()=>{saved++;},salvaVoceLibreriaFn:async()=>{libraries++;}});await s.promise;
 const r=result(s);assert.equal(r.isError,true);assert.match(r.content,/ARTIFACT_TOO_LARGE/);assert.doesNotMatch(r.content,/created:/);
 assert.equal(saved,0);assert.equal(libraries,0);assert.equal(s.events.filter(e=>e.type==='ArtifactCreated').length,0);
});
test('ARTIFACT27-BOUNDARY: exactly 400000 UTF8 bytes are saved without truncation',async t=>{
 const html='é'.repeat(200000);assert.equal(Buffer.byteLength(html),400000);let stored;
 const s=service(t,{html,salvaArtefattoFn:(_id,body)=>{stored=body;},salvaVoceLibreriaFn:async()=>({id:'library-fixture'})});await s.promise;
 assert.equal(result(s).isError,false);assert.equal(stored,html);assert.equal(s.events.filter(e=>e.type==='ArtifactCreated').length,1);
});
test('ARTIFACT27-WAIT: no creation event before an asynchronous saver settles',async t=>{
 let announce,release;const started=new Promise(r=>{announce=r;}),saved=new Promise(r=>{release=r;});
 const s=service(t,{salvaArtefattoFn:async()=>{announce();await saved;},salvaVoceLibreriaFn:async()=>({id:'library-fixture'})});
 await started;await new Promise(r=>setImmediate(r));const premature=s.events.some(e=>e.type==='ArtifactCreated');
 release();await s.promise;assert.equal(premature,false);assert.equal(result(s).isError,false);assert.equal(s.events.filter(e=>e.type==='ArtifactCreated').length,1);
});
test('ARTIFACT27-SAVE-FAIL: failed asynchronous saving cannot announce creation',async t=>{
 let saved=0,libraries=0;const rejected=Promise.reject(Error('artifact save failed'));rejected.catch(()=>{});
 const s=service(t,{salvaArtefattoFn:()=>{saved++;return rejected;},salvaVoceLibreriaFn:async()=>{libraries++;}});await s.promise;
 assert.equal(result(s).isError,true);assert.equal(saved,1);assert.equal(libraries,0);assert.equal(s.events.filter(e=>e.type==='ArtifactCreated').length,0);
});
test('ARTIFACT27-PROVENANCE: real saved bytes and model survive a Library reader process restart',async t=>{
 const html='<p>Original artifact27; error is data.</p>';const s=service(t,{html});await s.promise;
 assert.equal(result(s).isError,false);const event=s.events.find(e=>e.type==='ArtifactCreated');assert.ok(event);assert.equal('html'in event,false);assert.equal(leggiArtefatto(event.id),html);
 const rows=await elencaVoci({cartella:s.root});assert.equal(rows.length,1);assert.equal(rows[0].modello,'fixture/artifact27');assert.equal(rows[0].origine,'generated');
 assert.equal((await leggiVoce({cartella:s.root,id:rows[0].id})).testo,html);
 const source=`import {elencaVoci,leggiVoce} from ${JSON.stringify(new URL('../src/library-store.mjs',import.meta.url).href)};const cartella=process.argv[1];const rows=await elencaVoci({cartella});const saved=await leggiVoce({cartella,id:rows[0].id});process.stdout.write(JSON.stringify({rows,saved}));`;
 const child=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',source,s.root],{encoding:'utf8',windowsHide:true,timeout:10000}));
 assert.equal(child.rows[0].modello,'fixture/artifact27');assert.equal(child.saved.testo,html);
});
test('ARTIFACT27-LIBRARY-FAIL: a real live artifact remains available when its Library copy fails',async t=>{
 const html='<p>Live artifact27.</p>';const s=service(t,{html,salvaVoceLibreriaFn:async()=>{throw Error('fixture Library unavailable');}});await s.promise;
 assert.equal(result(s).isError,false);const e=s.events.find(e=>e.type==='ArtifactCreated');assert.ok(e);assert.equal(leggiArtefatto(e.id),html);assert.deepEqual(await elencaVoci({cartella:s.root}),[]);
});
