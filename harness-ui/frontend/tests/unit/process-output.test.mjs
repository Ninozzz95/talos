import test from 'node:test';
import assert from 'node:assert/strict';
const url = new URL('../../src/components/process-output.js', import.meta.url);
const api = await import(url.href).catch(e => {if (e.code === 'ERR_MODULE_NOT_FOUND' && e.url === url.href) return {}; throw e;});
const receipt = {schema:'talos.process-output.v1', sessionId:'s /雪', runId:'run1', toolCallId:'call1', outputId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state:'complete'};
const page = {schema:'talos.process-output-page.v1', outputId:receipt.outputId, runId:'run1', toolCallId:'call1', stream:'stdout', offset:0, bytes:4, nextOffset:4, availableBytes:8, storedBytes:8, observedBytes:8, state:'complete', encoding:'utf-8', text:'ciao', footerStatus:'absent'};
function client(fetchFn) {assert.equal(typeof api.creaClientOutput, 'function'); return api.creaClientOutput({receipt, fetchFn, API:p=>'http://127.0.0.1:4176'+p});}
const ok = data => ({ok:true,json:async()=>({ok:true,data})});

test('OUTPUT21-DOWNLOAD-URL: complete retained stream has a separate explicit URL without cursor or page limit',()=>{
  const c=client(()=>{throw Error('no eager request');});
  const u=new URL(c.downloadUrl({stream:'stderr'}));
  assert.equal(u.searchParams.get('format'),'download');assert.equal(u.searchParams.get('stream'),'stderr');
  assert.deepEqual([...u.searchParams.keys()],['stream','format']);
  assert.match(u.pathname,/s%20%2F%E9%9B%AA/);
  assert.throws(()=>c.downloadUrl({stream:'foreign'}),/valida/);
});

test('OUTPUT20-IDENTITY: receipts require exact session/tool identity and safe schema/IDs', () => {
  assert.equal(typeof api.normalizzaRicevutaOutput,'function');
  assert.equal(api.normalizzaRicevutaOutput(receipt,{sessionId:receipt.sessionId,toolCallId:'call1'}).outputId,receipt.outputId);
  for (const value of [null,{...receipt,schema:'unknown'},{...receipt,sessionId:'other'},{...receipt,toolCallId:'other'},{...receipt,outputId:'../x'},{...receipt,runId:'x\n'},{...receipt,state:'invented'}]) {
    assert.equal(api.normalizzaRicevutaOutput(value,{sessionId:receipt.sessionId,toolCallId:'call1'}),null);
  }
});
test('OUTPUT20-PAGE: typed bounded page preserves UTF8 and forwards abort; no eager fetch', async () => {
  const calls=[], c=client(async (...args)=>{calls.push(args);return ok(page);}), controller=new AbortController();
  assert.equal(calls.length,0);
  assert.deepEqual(await c.leggi({signal:controller.signal}),page);
  assert.equal(calls[0][1].signal,controller.signal);
  assert.match(calls[0][0],/sessions\/s%20%2F%E9%9B%AA\/process-outputs\/.*\?stream=stdout&offset=0&limit=4096&format=text$/);
});
test('OUTPUT20-INVALID: foreign identity, invalid cursor and malformed payload fail closed', async () => {
  for (const change of [{outputId:'foreign'},{runId:'other'},{toolCallId:'other'},{stream:'stderr'},{offset:1},{bytes:4097},{bytes:-1},{nextOffset:0},{nextOffset:5},{availableBytes:3},{storedBytes:-1},{observedBytes:NaN},{schema:'unknown'},{text:null},{text:'x'.repeat(4097)},{encoding:'raw'},{state:'invented'}]) {
    await assert.rejects(client(async()=>ok({...page,...change})).leggi(),/risposta.*valida/i);
  }
});
test('OUTPUT20-BINARY: invalid UTF8 is explicit and never replaced or interpreted', async () => {
  const p={...page,encoding:'binary-or-invalid-utf8',text:null};
  assert.deepEqual(await client(async()=>ok(p)).leggi(),p);
  await assert.rejects(client(async()=>ok({...p,text:'replacement'})).leggi(),/risposta.*valida/i);
});
test('OUTPUT20-ERROR: API failures disclose no server payload and do not retry', async () => {
  let calls=0; const c=client(async()=>{calls++;return {ok:false,status:404,json:async()=>({error:'secret server path'})};});
  await assert.rejects(c.leggi(),e=>/non.*disponibile/i.test(e.message)&&!e.message.includes('secret'));
  assert.equal(calls,1);
});
test('OUTPUT20-RAW: explicit raw download stays a bounded page with encoded owned identity', () => {
  const c=client(()=>{throw Error('no fetch');});
  assert.match(c.rawUrl({stream:'stderr',offset:4}),/stream=stderr&offset=4&limit=4096&format=raw$/);
  for(const args of [{stream:'all'},{offset:-1},{offset:0.5},{offset:Number.MAX_SAFE_INTEGER+1}]) assert.throws(()=>c.rawUrl(args));
});
test('OUTPUT20-FINAL-PAGE: Unicode byte count and terminal cursor must agree', async () => {
  const p={...page,bytes:4,availableBytes:4,storedBytes:4,observedBytes:4,nextOffset:null,text:'🦊'};
  assert.deepEqual(await client(async()=>ok(p)).leggi(),p);
  await assert.rejects(client(async()=>ok({...p,text:'ciao!'})).leggi(),/risposta.*valida/i);
  await assert.rejects(client(async()=>ok({...page,nextOffset:null})).leggi(),/risposta.*valida/i);
});
test('OUTPUT20-RAW-EXACT: downloading a UTF8-adjusted page excludes bytes from the following page', () => {
  const c=client(()=>{throw Error('no fetch');});
  assert.match(c.rawUrl({offset:0,limit:4093}),/limit=4093&format=raw$/);
  for(const limit of [0,-1,4097,0.5,NaN])assert.throws(()=>c.rawUrl({limit}));
});
