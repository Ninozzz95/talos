import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHttpApp} from '../src/http-app.mjs';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {readProcessOutputPage} from '../src/process-output-access.mjs';
const outputId='15743007-0583-4e50-b99a-a77e33d97115';

test('OUTPUT15-HTTP-MISSING: authenticated page read reaches exactly the requested session/output',async t=>{
  let received;
  const server=createServer(createHttpApp({staticHandler:()=>{},token:'fixture15',sessionRegistry:{
    leggiOutputProcesso:async(sessionId,args)=>{received={sessionId,args};return{schema:'talos.process-output-page.v1',outputId,text:'pagina15'};},
  }}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const url=`http://127.0.0.1:${server.address().port}/api/v1/sessions/s15/process-outputs/${outputId}`;
  const response=await fetch(url,{headers:{Cookie:'talos_token=fixture15'}});
  assert.equal(response.status,200);
  assert.equal((await response.json()).data.text,'pagina15');
  assert.equal(received.sessionId,'s15');assert.equal(received.args.outputId,outputId);
});

async function realHttp(t){
  const store=await createProcessOutputStore({databasePath:':memory:',maxOutputBytes:100000});
  const id={sessionId:'s15',outputId,runId:'r15',toolCallId:'t15'},bytes=Buffer.from([0,255,65,66,67,68]);
  await store.begin(id);await store.append({...id,sequence:0,stream:'stdout',bytes});await store.finish({...id,sequence:1,termination:'exited',exitCode:0});
  let calls=0,corrupt=false;
  const server=createServer(createHttpApp({staticHandler:()=>{},token:'fixture15',sessionRegistry:{
    leggiOutputProcesso:async(sessionId,args)=>{calls++;if(corrupt)throw Object.assign(Error('private/profile/path'),{code:'OUTPUT_INTEGRITY_FAILED'});return readProcessOutputPage(store,{...args,sessionId});},
  }}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));await store.close();});
  const base=`http://127.0.0.1:${server.address().port}/api/v1/sessions/s15/process-outputs/${outputId}`;
  const get=(query='',options={})=>fetch(base+query,{headers:{Cookie:'talos_token=fixture15'},...options});
  return{base,get,bytes,calls:()=>calls,corrupt:()=>{corrupt=true;}};
}

test('OUTPUT15-HTTP-RAW-HEAD: exact raw page, honest filename/size/cursor, no body for HEAD',async t=>{
  const f=await realHttp(t),response=await f.get('?format=raw&offset=1&limit=3');
  assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),f.bytes.subarray(1,4));
  assert.match(response.headers.get('content-disposition'),/-stdout-1-3\.bin/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('x-talos-output-next-offset'),'4');assert.equal(response.headers.get('x-talos-output-available-bytes'),'6');
  assert.match(response.headers.get('cache-control'),/no-store/);
  const head=await f.get('?format=raw&offset=1&limit=3',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'3');assert.equal(await head.text(),'');
  const text=await f.get();assert.equal((await text.json()).data.text,null);
});
test('OUTPUT15-HTTP-AUTH-OWNER: unauthenticated request never reaches store; another session receives no bytes',async t=>{
  const f=await realHttp(t);assert.equal((await fetch(f.base)).status,401);assert.equal(f.calls(),0);
  const other=await fetch(f.base.replace('/sessions/s15/','/sessions/other/'),{headers:{Cookie:'talos_token=fixture15'}});assert.equal(other.status,404);assert.doesNotMatch(await other.text(),/private\/profile/);
});
test('OUTPUT15-HTTP-QUERY: duplicates, traversal, unrelated authority and invalid numeric values are refused',async t=>{
  const f=await realHttp(t);
  for(const query of ['?offset=1&offset=2','?sessionId=other','?path=/x','?offset=-1','?offset=1.5','?offset=01','?offset=9007199254740992','?limit=65537','?stream=combined','?format=html'])assert.equal((await f.get(query)).status,400,query);
  assert.equal((await f.get('?limit=4',{method:'POST'})).status,405);
});
test('OUTPUT15-HTTP-INTEGRITY: corrupted storage is a visible failure without leaking local paths',async t=>{
  const f=await realHttp(t);f.corrupt();const response=await f.get();assert.equal(response.status,500);const text=await response.text();assert.match(text,/OUTPUT_INTEGRITY_FAILED/);assert.doesNotMatch(text,/private\/profile/);
});
