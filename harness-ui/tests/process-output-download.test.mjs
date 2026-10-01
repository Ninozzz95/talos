import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHttpApp} from '../src/http-app.mjs';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {readProcessOutputPage} from '../src/process-output-access.mjs';
const outputId='15743007-0583-4e50-b99a-a77e33d97115';
const id={sessionId:'s21',outputId,runId:'r21',toolCallId:'t21'};
const bytes=Buffer.alloc(180003);for(let i=0;i<bytes.length;i++)bytes[i]=i%256;

async function fixture(t,{cap=300000,footer=false,failAfterFirst=false}={}){
  const store=await createProcessOutputStore({databasePath:':memory:',maxOutputBytes:cap});
  let server;
  t.after(async()=>{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await store.close();});
  const marker='__TALOS_CWD_0123456789abcdef__';
  const original=footer?Buffer.concat([bytes,Buffer.from('\n'+marker+'C:\\private\\workspace')]):bytes;
  await store.begin(id);let sequence=0;
  for(let at=0;at<original.length;at+=65536)await store.append({...id,sequence:sequence++,stream:'stdout',bytes:original.subarray(at,at+65536),
    ...(footer?{metadata:{schema:'talos.process-output-metadata.v1',controlFooter:{type:'cwd-marker-v1',stream:'stdout',marker,prefixBytes:1}}}:{})});
  await store.finish({...id,sequence,termination:'exited',exitCode:0,
    ...(footer?{metadata:{schema:'talos.process-output-metadata.v1',controlFooter:{type:'cwd-marker-v1',stream:'stdout',marker,prefixBytes:1}}}:{})});
  const requests=[];
  const app=createHttpApp({staticHandler:()=>{},token:'fixture21',sessionRegistry:{leggiOutputProcesso:async(sessionId,args,options)=>{
    requests.push({sessionId,...args});
    if(failAfterFirst&&args.offset>0)throw Object.assign(Error('private/profile/path'),{code:'OUTPUT_INTEGRITY_FAILED'});
    return readProcessOutputPage(store,{...args,sessionId},options);
  }}});
  server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/api/v1/sessions/s21/process-outputs/${outputId}`;
  return {store,requests,url,get:(q='?format=download',options={})=>fetch(url+q,{headers:{Cookie:'talos_token=fixture21'},...options})};
}
test('OUTPUT21-HTTP: complete multi-page binary download preserves every byte and excludes control footer',async t=>{
  const f=await fixture(t,{footer:true}),r=await f.get();assert.equal(r.status,200);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
  assert.equal(r.headers.get('content-length'),String(bytes.length));
  assert.match(r.headers.get('content-disposition'),/-stdout-retained\.bin/);
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('cache-control'),/no-store/);
  assert.equal(r.headers.get('x-talos-output-footer-status'),'excluded');
  assert.ok(f.requests.every(x=>x.limit<=65536&&x.format==='raw'));
  assert.deepEqual(f.requests.map(x=>x.offset),[0,65536,131072]);
});
test('OUTPUT21-LIMIT-HEAD: capped output declares received/stored/state; HEAD emits no body or later-page reads',async t=>{
  const f=await fixture(t,{cap:70000}),head=await f.get('?format=download',{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'70000');assert.equal(await head.text(),'');
  assert.equal(f.requests.length,1);assert.equal(head.headers.get('x-talos-output-state'),'limited');
  assert.equal(head.headers.get('x-talos-output-observed-bytes'),String(bytes.length));
  const r=await f.get();assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(0,70000));
});
test('OUTPUT21-AUTH-QUERY: no credential or foreign session returns no bytes; byte-range arguments are refused',async t=>{
  const f=await fixture(t);assert.equal((await fetch(f.url+'?format=download')).status,401);assert.equal(f.requests.length,0);
  for(const q of ['?format=download&offset=0','?format=download&limit=4','?format=download&stream=bad','?format=download&format=download'])assert.equal((await f.get(q)).status,400,q);
  const r=await fetch(f.url.replace('/s21/','/foreign/')+'?format=download',{headers:{Cookie:'talos_token=fixture21'}});
  assert.equal(r.status,404);assert.doesNotMatch(await r.text(),/private\/profile/);
});
test('OUTPUT21-STREAM-FAILURE: storage failure after headers is an interrupted transfer, never appended JSON or success',async t=>{
  const f=await fixture(t,{failAfterFirst:true});
  await assert.rejects(async()=>{const r=await f.get();await r.arrayBuffer();});
  assert.ok(f.requests.some(r=>r.offset>0),'a rejected query is not a mid-transfer failure');
});
const page=(offset,limit,total=196608)=>({schema:'talos.process-output-page.v1',outputId,runId:'r21',toolCallId:'t21',stream:'stdout',offset,
  bytes:Math.min(limit,total-offset),data:Buffer.alloc(Math.min(limit,total-offset),65),availableBytes:total,storedBytes:total,observedBytes:total,state:'recording',footerStatus:'absent',encoding:'raw'});
test('OUTPUT21-SNAPSHOT: growth never extends snapshot and malformed identity/short page aborts the export',async()=>{
  const {prepareProcessOutputDownload}=await import('../src/process-output-download.mjs');let count=0;
  const f=await prepareProcessOutputDownload(async(s,a)=>{count++;return page(a.offset,a.limit,count===1?196608:262144);},id);
  let total=0;for await(const b of f.chunks)total+=b.length;assert.equal(total,196608);assert.equal(count,3);
  for(const mutate of [p=>({...p,runId:'foreign'}),p=>({...p,bytes:p.bytes-1}),p=>({...p,availableBytes:100})]){
    let n=0;const f=await prepareProcessOutputDownload(async(s,a)=>{const p=page(a.offset,a.limit);return ++n===1?p:mutate(p);},id);
    await assert.rejects(async()=>{for await(const b of f.chunks)void b;},{code:'OUTPUT_INTEGRITY_FAILED'});
  }
});
test('OUTPUT21-BACKPRESSURE: a slow writable bounds outstanding page reads; it does not materialize the full output',async()=>{
  const {prepareProcessOutputDownload}=await import('../src/process-output-download.mjs');let read=0,written=0;
  const f=await prepareProcessOutputDownload(async(s,a)=>{assert.ok(read-written<=2);read++;return page(a.offset,a.limit,65536*20);},id);
  const slow=new Writable({highWaterMark:1,write(b,encoding,done){setImmediate(()=>{written++;done();});}});
  await pipeline(f.chunks,slow);assert.equal(read,20);assert.equal(written,20);
});
test('OUTPUT21-ABORT: cancellation while awaiting a page emits no late bytes or additional reads',async()=>{
  const {prepareProcessOutputDownload}=await import('../src/process-output-download.mjs');const c=new AbortController();let resolve,calls=0;
  const f=await prepareProcessOutputDownload(async(s,a)=>++calls===1?page(a.offset,a.limit):new Promise(r=>{resolve=()=>r(page(a.offset,a.limit));}),id,{signal:c.signal});
  const it=f.chunks[Symbol.asyncIterator]();assert.equal((await it.next()).value.length,65536);const pending=it.next();
  c.abort();resolve();await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,2);
});
