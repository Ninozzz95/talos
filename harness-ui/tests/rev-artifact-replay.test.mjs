import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {avviaSessione} from '../src/agent-service.mjs';
import {talosLavora} from '../src/kernel/talosHarness.mjs';
import {artifactCreated} from '../src/agui-events.mjs';
import {leggiArtefatto,svuotaArtefattiPerTest} from '../src/artifact-store.mjs';
import {leggiBytesVoce,eliminaVoce} from '../src/library-store.mjs';
import {registraRiga} from '../src/session-store.mjs';
import {createHttpApp} from '../src/http-app.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

const LIB='lib-00000000-0000-4000-8000-000000000001';
function root(t){const r=mkdtempSync(join(tmpdir(),'talos-artifact30-'));t.after(()=>rimuoviCartellaDiProva(r));return r;}
function service(t,options={}){
 const cartella=options.cartella??root(t),events=[];let calls=0;
 const promise=avviaSessione({cartella,cartellaDatiProgettoFn:()=>cartella,task:{consegna:'Create an HTML artifact.'},modello:'fixture/artifact30',chiave:'fixture',livelloAccesso:'accesso-pieno',strumentiEstesi:['artifact_create'],onEvento:e=>events.push(e),...options,
  talosLavoraFn:input=>talosLavora({...input,fetchDiRete:async()=>{
   const first=calls++===0;const delta=first?{role:'assistant',tool_calls:[{index:0,id:'create30',type:'function',function:{name:'artifact_create',arguments:JSON.stringify({titolo:'Same title',html:'<!doctype html><p>Exact original — 雪</p>'})}}]}:{role:'assistant',content:'Done.'};
   return new Response(`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason:first?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
  }})});
 return{cartella,events,promise};
}
const event=s=>s.events.find(e=>e.type==='ArtifactCreated');

// Direct handler transport: NO listen(), socket, server, loopback mutation or owner profile.
async function request(app,url,{method='GET',body,headers={}}={}){
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
 Object.assign(req,{url,method,headers:{host:'127.0.0.1:4174',...headers},socket:{localPort:4174},aborted:false});
 const res=new EventEmitter();let finish;const ended=new Promise(r=>finish=r);res.headers={};res.destroyed=false;
 res.setHeader=(k,v)=>res.headers[k]=v;
 res.writeHead=(status,h)=>{res.status=status;Object.assign(res.headers,h);};
 res.end=b=>{res.body=Buffer.from(b??'');finish();};
 app(req,res);await ended;return res;
}
function appFor(cartella){return createHttpApp({staticHandler:async()=>null,token:'artifact30-test-only',sessionRegistry:{
 scaricaVoceLibreria:async(sessionId,id)=>{
  if(sessionId!=='session30')return{erroreAvvio:'Sessione non trovata',code:'NOT_FOUND'};
  const value=await leggiBytesVoce({cartella,id});return value?{ok:true,...value}:{erroreAvvio:'Questa voce non esiste',code:'LIBRARY_NOT_FOUND'};
 }
}});}
const headers={cookie:'talos_token=artifact30-test-only',origin:'http://127.0.0.1:4174','content-type':'application/json'};

test('ARTIFACT30-DURABLE-ID: event journal and Library are usable in a new process without the volatile Map',async t=>{
 const s=service(t);await s.promise;const e=event(s);assert.match(e.voceLibreriaId,/^lib-[0-9a-f-]{36}$/);assert.equal('html'in e,false);
 await registraRiga({cartellaStore:s.cartella,sessionId:'session30',record:e});
 const source=`import{leggiRegistro}from ${JSON.stringify(new URL('../src/session-store.mjs',import.meta.url).href)};import{leggiBytesVoce}from ${JSON.stringify(new URL('../src/library-store.mjs',import.meta.url).href)};import{leggiArtefatto}from ${JSON.stringify(new URL('../src/artifact-store.mjs',import.meta.url).href)};const cartella=process.argv[1];const e=(await leggiRegistro({cartellaStore:cartella,sessionId:'session30'})).find(e=>e.type==='ArtifactCreated');const v=await leggiBytesVoce({cartella,id:e.voceLibreriaId});console.log(JSON.stringify({e,html:v.bytes.toString('utf8'),volatile:leggiArtefatto(e.id)}));`;
 const replay=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',source,s.cartella],{encoding:'utf8',windowsHide:true,timeout:10000}));
 assert.equal(replay.volatile,null);assert.equal(replay.e.voceLibreriaId,e.voceLibreriaId);assert.equal(replay.html,leggiArtefatto(e.id));
 svuotaArtefattiPerTest();const app=appFor(s.cartella);
 const auth=await request(app,'/api/v1/sessions/session30/pagine',{method:'POST',body:{voceId:e.voceLibreriaId},headers});assert.equal(auth.status,200,auth.body.toString());
 const url=JSON.parse(auth.body).data.indirizzo;const page=await request(app,url);assert.equal(page.status,200);assert.equal(page.body.toString('utf8'),replay.html);
 assert.match(page.headers['Content-Security-Policy'],/sandbox allow-scripts/);assert.match(page.headers['Content-Security-Policy'],/connect-src 'none'/);assert.doesNotMatch(page.headers['Content-Security-Policy'],/allow-same-origin/);assert.equal(page.headers['X-Content-Type-Options'],'nosniff');
 await eliminaVoce({cartella:s.cartella,id:e.voceLibreriaId});assert.equal((await request(app,url)).status,404,'deleted Library bytes are never reconstructed');
});
test('ARTIFACT30-WAIT-LIBRARY: no event until durable copy has settled',async t=>{
 let announce,release;const started=new Promise(r=>announce=r),wait=new Promise(r=>release=r);
 const s=service(t,{salvaVoceLibreriaFn:async()=>{announce();await wait;return LIB;}});
 await started;const premature=event(s);release();await s.promise;
 assert.equal(premature,undefined);assert.equal(event(s).voceLibreriaId,LIB);
});
test('ARTIFACT30-INVALID-LIBRARY: invalid saver returns cannot claim a durable reference',async t=>{
 for(const value of[undefined,null,{}, {id:LIB},[],LIB+'/../x','',42]){
  const s=service(t,{salvaVoceLibreriaFn:async()=>value});await s.promise;const e=event(s);assert.ok(e);assert.equal('voceLibreriaId'in e,false);assert.ok(leggiArtefatto(e.id));
 }
});
test('ARTIFACT30-FAILURE: best effort Library failure preserves live artifact without inventing durable id',async t=>{
 const s=service(t,{salvaVoceLibreriaFn:async()=>{throw Error('fixture30 Library failure');}});await s.promise;const e=event(s);assert.equal('voceLibreriaId'in e,false);assert.ok(leggiArtefatto(e.id));
 assert.equal(s.events.find(e=>e.type==='ToolCallResult').isError,false);
});
test('ARTIFACT30-SAME-TITLE: equal titles never share or select a Library reference by title',async t=>{
 const cartella=root(t);const a=service(t,{cartella}),b=service(t,{cartella});await Promise.all([a.promise,b.promise]);
 assert.equal(event(a).titolo,event(b).titolo);assert.ok(event(a).voceLibreriaId);assert.notEqual(event(a).voceLibreriaId,event(b).voceLibreriaId);
});
test('ARTIFACT30-EVENT: additive optional reference and exact legacy shape, never HTML',()=>{
 assert.deepEqual(artifactCreated({messageId:'m',id:'a',titolo:'T'}),{type:'ArtifactCreated',messageId:'m',id:'a',titolo:'T'});
 assert.equal(artifactCreated({messageId:'m',id:'a',titolo:'T',voceLibreriaId:LIB}).voceLibreriaId,LIB);
});
test('ARTIFACT30-HTTPGUARDS: existing page capability still enforces cookie, origin, session and exact Library id',async t=>{
 const s=service(t);await s.promise;const app=appFor(s.cartella);const args={method:'POST',body:{voceId:LIB},headers};
 assert.equal((await request(app,'/api/v1/sessions/session30/pagine',{...args,headers:{}})).status,401);
 assert.equal((await request(app,'/api/v1/sessions/session30/pagine',{...args,headers:{...headers,origin:'https://evil.example'}})).status,403);
 assert.equal((await request(app,'/api/v1/sessions/session30/pagine',{...args,headers:{...headers,'sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await request(app,'/api/v1/sessions/foreign/pagine',args)).status,404);
 assert.equal((await request(app,'/api/v1/sessions/session30/pagine',{...args,body:{voceId:'lib-foreign'}})).status,404);
});
