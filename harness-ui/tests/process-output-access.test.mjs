import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,resolve,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {readProcessOutputPage,formatProcessOutputPage} from '../src/process-output-access.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t,{stdout=Buffer.from('hello'),stderr=Buffer.from('warning'),cap=1_000_000,footer,finish=true}={}){
  const root=mkdtempSync(join(tmpdir(),'talos-read-output-'));
  const store=await createProcessOutputStore({databasePath:join(root,'output.sqlite'),maxOutputBytes:cap});
  t.after(async()=>{await store.close();const p=relative(resolve(tmpdir()),resolve(root));assert.ok(p&&!p.startsWith('..')&&!isAbsolute(p));rimuoviCartellaDiProva(root);});
  const id={sessionId:'s15',outputId:randomUUID(),runId:'r15',toolCallId:'t15'};
  await store.begin(id);let sequence=0;
  for(const [stream,bytes]of Object.entries({stdout,stderr}))for(let i=0;i<bytes.length;i+=65536)await store.append({...id,stream,sequence:sequence++,bytes:bytes.subarray(i,i+65536)});
  if(finish)await store.finish({...id,sequence,termination:'exited',exitCode:0,...(footer?{controlFooter:footer}:{})});
  return{store,id:{sessionId:id.sessionId,outputId:id.outputId}};
}
test('OUTPUT15-UTF8: byte cursors preserve BOM and every multibyte character over small pages',async t=>{
  const text='\uFEFFA€𐍈漢B\n',f=await fixture(t,{stdout:Buffer.from(text)});
  let offset=0,result='';do{const p=await readProcessOutputPage(f.store,{...f.id,offset,limit:4});assert.equal(p.offset,offset);assert.ok(p.bytes<=4);result+=p.text;offset=p.nextOffset;}while(offset!==null);
  assert.equal(result,text);
  await assert.rejects(readProcessOutputPage(f.store,{...f.id,offset:5}),e=>e.code==='OUTPUT_OFFSET_NOT_TEXT_BOUNDARY');
});
test('OUTPUT15-RAW: invalid UTF8 and binary remain exact bytes; text never invents replacement characters',async t=>{
  for(const bytes of [Buffer.from([65,0,66]),Buffer.from([0xff,65]),Buffer.from([65,0xe2,0x82])]){
    const f=await fixture(t,{stdout:bytes});const p=await readProcessOutputPage(f.store,f.id);assert.equal(p.text,null);assert.equal(p.encoding,'binary-or-invalid-utf8');
    const raw=await readProcessOutputPage(f.store,{...f.id,format:'raw'});assert.equal(hash(raw.data),hash(bytes));
  }
});
test('OUTPUT15-STREAMS: stderr and stdout are separate and another session cannot read either',async t=>{
  const f=await fixture(t);assert.equal((await readProcessOutputPage(f.store,{...f.id,stream:'stderr'})).text,'warning');
  assert.equal((await readProcessOutputPage(f.store,f.id)).text,'hello');
  await assert.rejects(readProcessOutputPage(f.store,{...f.id,sessionId:'other'}),e=>e.code==='OUTPUT_NOT_FOUND');
});
test('OUTPUT15-FOOTER: split marker is excluded from the view without changing command newlines or stored bytes',async t=>{
  const marker='__TALOS_CWD_0123456789abcdef__',prefix='x'.repeat(65530)+'\n\n',stdout=Buffer.from(prefix+marker+'\r\nC:\\fixture\r\n');
  const f=await fixture(t,{stdout,footer:{type:'cwd-marker-v1',stream:'stdout',marker}});
  const p=await readProcessOutputPage(f.store,{...f.id,offset:65520,format:'raw'});
  assert.equal(p.data.toString(),prefix.slice(65520));assert.equal(p.availableBytes,Buffer.byteLength(prefix));assert.equal(p.footerStatus,'excluded');
  assert.equal((await f.store.inspect(f.id)).stdout.sha256,hash(stdout));
});
test('OUTPUT15-LIMIT: retained versus observed bytes, unfinished capture and exhausted cursor remain explicit',async t=>{
  const f=await fixture(t,{stdout:Buffer.from('abcdefghij'),cap:6});const p=await readProcessOutputPage(f.store,f.id);
  assert.equal(p.text,'abcdef');assert.equal(p.state,'limited');assert.equal(p.observedBytes,10);assert.equal(p.storedBytes,6);
  assert.equal((await readProcessOutputPage(f.store,{...f.id,offset:99})).nextOffset,null);
  const running=await fixture(t,{finish:false});const page=await readProcessOutputPage(running.store,running.id);
  assert.equal(page.state,'recording');assert.equal(page.footerStatus,'unknown-unsettled');
  assert.match(formatProcessOutputPage(page),/recording/);
});
test('OUTPUT15-VALIDATION: invalid paging, extra authority and Stop are rejected',async t=>{
  const f=await fixture(t);
  for(const args of [{offset:-1},{limit:65537},{limit:3},{stream:'combined'},{format:'html'},{path:'/tmp/x'},{offset:1.5}])await assert.rejects(readProcessOutputPage(f.store,{...f.id,...args}),e=>e.code==='OUTPUT_INVALID_INPUT');
  await assert.rejects(readProcessOutputPage(f.store,f.id,{signal:AbortSignal.abort()}),e=>e.name==='AbortError');
});
