import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,resolve,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fork,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {readProcessOutputPage} from '../src/process-output-access.mjs';
import {eseguiComando,eseguiComandoSandboxato} from '../src/kernel/talosHarness.mjs';
import {createOwnerRuntimeAdapter} from '../src/runtime-owner-adapter.mjs';
import {runWithProcessOutput} from '../src/process-output-session.mjs';
import {normalizzaMetadatiCattura} from '../src/process-output-contract.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';
const marker='__TALOS_CWD_0123456789abcdef__';
const metadata=(prefixBytes=0)=>({schema:'talos.process-output-metadata.v1',controlFooter:{type:'cwd-marker-v1',stream:'stdout',marker,prefixBytes}});
function temporary(t,beforeCleanup){
  const root=mkdtempSync(join(tmpdir(),'talos-meta16-'));
  t.after(async()=>{await beforeCleanup?.();const p=relative(resolve(tmpdir()),resolve(root));assert.ok(p&&!p.startsWith('..')&&!isAbsolute(p));rimuoviCartellaDiProva(root);});return root;
}
async function fixture(t,cap=2_000_000){
  let store;const root=temporary(t,()=>store?.close()),databasePath=join(root,'outputs.sqlite');
  store=await createProcessOutputStore({databasePath,maxOutputBytes:cap});
  const id={sessionId:'s16',runId:'r16',toolCallId:'t16',outputId:randomUUID()};await store.begin(id);
  let sequence=0;
  return{root,databasePath,id,readId:{sessionId:id.sessionId,outputId:id.outputId},get store(){return store;},get sequence(){return sequence;},
    append:async(bytes,meta=metadata(),stream='stdout')=>{await store.append({...id,sequence,stream,bytes:Buffer.from(bytes),metadata:meta});sequence++;},
    finish:(meta=metadata())=>store.finish({...id,sequence,termination:'exited',exitCode:0,metadata:meta,controlFooter:meta?.controlFooter??undefined}),
    reopen:async()=>{await store.close();store=await createProcessOutputStore({databasePath,maxOutputBytes:cap});},
  };
}
test('META16-EARLY: Windows wrapper describes its footer on the first bytes, before close',async t=>{
  const root=temporary(t),script=join(root,'write.cjs');writeFileSync(script,"process.stdout.write('hello');");let first;
  const result=await eseguiComandoSandboxato(`"${process.execPath}" "${script}"`,root,{dove:'windows',tracciaCartella:true,onBytes:chunk=>{first??=chunk.metadata;}});
  assert.equal(result.codice,0);assert.equal(first?.schema,'talos.process-output-metadata.v1');
  assert.equal(first.controlFooter.prefixBytes,process.platform==='win32'?0:1);
  assert.deepEqual(result.outputCapture.captureMetadata,first);
});
test('META16-CRASH: acknowledged chunks retain the footer boundary without finish after reopening',async t=>{
  const f=await fixture(t);await f.append('hello'+marker+'/cwd');await f.reopen();
  const m=await f.store.inspect(f.id);assert.equal(m.outputMetadataVersion,1);assert.equal(m.controlFooter.byteOffset,5);
  const page=await readProcessOutputPage(f.store,f.readId);assert.equal(page.text,'hello');assert.equal(page.state,'recording');
});
test('META16-READ-COST: repeated reads do not scan long stdout when the wrapper marker was never emitted',async t=>{
  const f=await fixture(t);for(let n=0;n<16;n++)await f.append(Buffer.alloc(65536,97));await f.finish();
  let reads=0,bytes=0;const measured={inspect:args=>f.store.inspect(args),readPage:async args=>{reads++;bytes+=args.limit;return f.store.readPage(args);}};
  for(const offset of [0,4096,8192])assert.equal((await readProcessOutputPage(measured,{...f.readId,offset})).text,'a'.repeat(4096));
  assert.equal(reads,3,'one useful read per page, no reverse scan');assert.equal(bytes,3*4096);
});
test('META16-ADAPTER: byte-only owner runtimes are refused before provider or process execution',async()=>{
  let ran=0;const adapter=createOwnerRuntimeAdapter({modulePath:resolve('fixture-meta16.mjs'),importFn:async()=>({SUPPORTA_OUTPUT_PROCESSI:1,talosLavora(){ran++;},eseguiComandoSandboxato(){ran++;}})});
  await assert.rejects(()=>adapter.talosLavora({captureProcessFn(){}}),e=>e.code==='PROCESS_OUTPUT_CONTRACT_REQUIRED');
  await assert.rejects(()=>adapter.eseguiComandoSandboxato('echo unsafe','.',{onBytes(){}}),e=>e.code==='PROCESS_OUTPUT_CONTRACT_REQUIRED');assert.equal(ran,0);
});
for(const prefix of [0,1])test(`META16-SPLIT-${prefix}: bytewise marker preserves original LF and exact raw bytes`,async t=>{
  const f=await fixture(t),original=Buffer.from('original\n\n'),wrapped=Buffer.concat([original,Buffer.from((prefix?'\n':'')+marker+'/cwd\n')]);
  await f.append('warning',metadata(prefix),'stderr');
  for(const b of wrapped)await f.append(Buffer.from([b]),metadata(prefix));
  const finished=await f.finish(metadata(prefix));assert.equal(finished.controlFooter.byteOffset,original.length);
  assert.deepEqual(await f.finish(metadata(prefix)),finished,'finish is idempotent');
  assert.deepEqual(Buffer.from((await f.store.readPage({...f.id,stream:'stdout'})).bytes),wrapped,'raw store is unchanged');
  assert.equal((await readProcessOutputPage(f.store,f.readId)).text,original.toString());
  assert.equal((await readProcessOutputPage(f.store,{...f.readId,stream:'stderr'})).text,'warning');
});
for(const cap of [3,12,1000])test(`META16-CAP-${cap}: complete marker beyond retention cap still defines the correct view`,async t=>{
  const f=await fixture(t,cap),original='content\n',wrapped=original+'\n'+marker+'/cwd';
  await f.append(wrapped.slice(0,12),metadata(1));await f.append(wrapped.slice(12),metadata(1));
  await f.store.fail({...f.id,sequence:f.sequence,code:'OUTPUT_TEST_INTERRUPTED'});
  await f.reopen();const page=await readProcessOutputPage(f.store,f.readId);
  assert.equal(page.text,original.slice(0,cap));assert.equal(page.footerStatus,'excluded');
  assert.equal((await f.store.inspect(f.id)).storedBytes,Math.min(cap,Buffer.byteLength(wrapped)));
  const db=new DatabaseSync(f.databasePath);try{const state=JSON.parse(db.prepare('SELECT control_footer FROM output_captures').get().control_footer);assert.deepEqual(Object.keys(state).sort(),['schema','metadata','observedThrough','byteOffset','pendingPrefixBytes','previousByteIsLF','prefixPrecededByLF'].sort());}finally{db.close();}
});
test('META16-PENDING: a prefix cut by a crash is declared ambiguous and never silently removed',async t=>{
  const f=await fixture(t),text='text\n'+marker.slice(0,17);await f.append(text,metadata(1));await f.reopen();
  const page=await readProcessOutputPage(f.store,f.readId);assert.equal(page.text,text);assert.equal(page.footerStatus,'pending-marker-prefix');
});
test('META16-BOUNDARIES: every two-chunk split preserves data and finds the last exact marker',async t=>{
  const f=await fixture(t),original='a\n'+marker+'x\n\n',wrapped=Buffer.from(original+'\n'+marker+'/cwd');
  for(let split=1;split<wrapped.length;split++){
    const id={...f.id,outputId:randomUUID()};await f.store.begin(id);
    await f.store.append({...id,sequence:0,stream:'stdout',bytes:wrapped.subarray(0,split),metadata:metadata(1)});
    await f.store.append({...id,sequence:1,stream:'stdout',bytes:wrapped.subarray(split),metadata:metadata(1)});
    const page=await readProcessOutputPage(f.store,{sessionId:id.sessionId,outputId:id.outputId});assert.equal(page.text,original,`split ${split}`);
  }
});
test('META16-DUPLICATE: same ACK retry is idempotent, changed or omitted metadata is rejected',async t=>{
  const f=await fixture(t),bytes=Buffer.from('hello\n'+marker.slice(0,12));await f.append(bytes,metadata(1));
  const before=await f.store.inspect(f.id);
  assert.equal((await f.store.append({...f.id,sequence:0,stream:'stdout',bytes,metadata:metadata(1)})).duplicate,true);
  assert.deepEqual(await f.store.inspect(f.id),before);
  for(const meta of [metadata(0),undefined,{schema:'talos.process-output-metadata.v1',controlFooter:null}]){
    await assert.rejects(f.store.append({...f.id,sequence:0,stream:'stdout',bytes,metadata:meta}),e=>e.code==='OUTPUT_METADATA_CONFLICT');
  }
  await assert.rejects(f.store.finish({...f.id,sequence:1,termination:'exited',exitCode:0}),e=>e.code==='OUTPUT_METADATA_CONFLICT');
  assert.deepEqual(await f.store.inspect(f.id),before);
});
test('META16-LEGACY: old records remain readable and cannot acquire retrospective metadata',async t=>{
  const f=await fixture(t);await f.store.append({...f.id,sequence:0,stream:'stdout',bytes:Buffer.from('old'+marker+'/cwd')});
  await assert.rejects(f.store.append({...f.id,sequence:1,stream:'stdout',bytes:Buffer.from('x'),metadata:metadata()}),e=>e.code==='OUTPUT_METADATA_CONFLICT');
  await f.store.finish({...f.id,sequence:1,termination:'exited',exitCode:0,controlFooter:metadata().controlFooter});
  assert.equal((await f.store.inspect(f.id)).outputMetadataVersion,undefined);
  assert.equal((await readProcessOutputPage(f.store,f.readId)).text,'old');
});
test('META16-NO-FOOTER: explicit null persists on stderr-first and empty captures',async t=>{
  const f=await fixture(t),meta={schema:'talos.process-output-metadata.v1',controlFooter:null};await f.append('err',meta,'stderr');
  assert.equal((await readProcessOutputPage(f.store,f.readId)).footerStatus,'absent');
  const bytes=Buffer.from([255,0,65]);await f.append(bytes,meta);await f.finish(meta);
  assert.deepEqual((await readProcessOutputPage(f.store,{...f.readId,format:'raw'})).data,bytes);
  const id={...f.id,outputId:randomUUID()};await f.store.begin(id);
  const done=await f.store.finish({...id,sequence:0,termination:'exited',exitCode:0,metadata:meta});assert.equal(done.outputMetadataVersion,1);
  assert.deepEqual(await f.store.finish({...id,sequence:0,termination:'exited',exitCode:0,metadata:meta}),done);
});
test('META16-ATOMIC: failure after chunk insertion rolls back bytes, counters and metadata together',async t=>{
  const f=await fixture(t),db=new DatabaseSync(f.databasePath);
  try{
    db.exec("CREATE TRIGGER reject_metadata BEFORE UPDATE ON output_captures BEGIN SELECT RAISE(ABORT,'test failure'); END;");
    await assert.rejects(f.append('hello'+marker),e=>e.code==='OUTPUT_STORE_IO');
    const m=await f.store.inspect(f.id);assert.equal(m.nextSequence,0);assert.equal(m.outputMetadataVersion,undefined);assert.equal(m.storedBytes,0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM output_chunks').get().n,0);
    db.exec('DROP TRIGGER reject_metadata');await f.append('hello'+marker);assert.equal((await f.store.inspect(f.id)).controlFooter.byteOffset,5);
  }finally{db.close();}
});
test('META16-INVALID: malformed metadata is rejected before spawning and bad persisted offsets fail closed',async t=>{
  const f=await fixture(t),target=join(f.root,'must-not-exist');
  for(const meta of [{...metadata(),extra:true},metadata(2),{...metadata(),controlFooter:undefined}])assert.throws(()=>normalizzaMetadatiCattura(meta),e=>e.code==='OUTPUT_INVALID_INPUT');
  assert.throws(()=>eseguiComando(process.execPath,['-e',`require('node:fs').writeFileSync(${JSON.stringify(target)},'wrong')`],{onBytes(){},controlFooter:metadata(2).controlFooter}),e=>e.code==='OUTPUT_INVALID_INPUT');
  await f.append('hello'+marker);const db=new DatabaseSync(f.databasePath);
  try{const state=JSON.parse(db.prepare('SELECT control_footer FROM output_captures').get().control_footer);state.byteOffset=99999;db.prepare('UPDATE output_captures SET control_footer=?').run(JSON.stringify(state));}finally{db.close();}
  await assert.rejects(readProcessOutputPage(f.store,f.readId),e=>e.code==='OUTPUT_INTEGRITY_FAILED');
});
test('META16-STOP: real process cancellation leaves metadata and accepted output recoverable',async t=>{
  const f=await fixture(t),abort=new AbortController();let captured;
  const result=await runWithProcessOutput({store:f.store,sessionId:'stop16',runId:'run',toolCallId:'tool',emit:()=>true},({onBytes})=>eseguiComando(process.execPath,['-e',"process.stdout.write('before-stop');setInterval(()=>{},1000)"],{segnaleStop:abort.signal,onBytes:async chunk=>{captured=chunk.metadata;await onBytes(chunk);abort.abort();}}));
  assert.equal(captured.controlFooter,null);assert.equal(result.fermatoSuRichiesta,true);assert.equal(result.processOutput.outputMetadataVersion,1);
  const page=await readProcessOutputPage(f.store,{sessionId:'stop16',outputId:result.processOutput.outputId});assert.equal(page.text,'before-stop');assert.equal(page.termination,'cancelled');
});
test('META16-KILLED-WRITER: a real killed process leaves acknowledged metadata readable in a new process',async t=>{
  let child;const root=temporary(t,async()=>{if(child&&child.exitCode===null&&child.signalCode===null){const closed=once(child,'exit');child.kill('SIGKILL');await closed;}});
  const databasePath=join(root,'crash.sqlite'),script=join(root,'crash.mjs'),executions=join(root,'executions.txt');
  const id={sessionId:'crash16',runId:'run',toolCallId:'tool',outputId:randomUUID()};
  const storeURL=new URL('../src/process-output-store.mjs',import.meta.url).href,readerURL=new URL('../src/process-output-access.mjs',import.meta.url).href;
  writeFileSync(script,`import{appendFileSync}from'node:fs';import{createProcessOutputStore}from ${JSON.stringify(storeURL)};const store=await createProcessOutputStore(${JSON.stringify({databasePath,maxOutputBytes:1000})});const id=${JSON.stringify(id)};await store.begin(id);appendFileSync(${JSON.stringify(executions)},'x');await store.append({...id,sequence:0,stream:'stdout',bytes:Buffer.from(${JSON.stringify('before-crash\n'+marker+'/cwd')}),metadata:${JSON.stringify(metadata(1))}});process.send('ack');setInterval(()=>{},1000);`);
  child=fork(script,[],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});const ack=await once(child,'message');assert.equal(ack[0],'ack');
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  const read=`import{createProcessOutputStore}from ${JSON.stringify(storeURL)};import{readProcessOutputPage}from ${JSON.stringify(readerURL)};const s=await createProcessOutputStore(${JSON.stringify({databasePath,maxOutputBytes:1000})});try{console.log(JSON.stringify(await readProcessOutputPage(s,${JSON.stringify({sessionId:id.sessionId,outputId:id.outputId})})));}finally{await s.close();}`;
  const reader=join(root,'read.mjs');writeFileSync(reader,read);
  const result=spawnSync(process.execPath,[reader],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(result.status,0,result.stderr);
  const page=JSON.parse(result.stdout);assert.equal(page.text,'before-crash');assert.equal(page.state,'recording');assert.equal(readFileSync(executions,'utf8'),'x');
});
for(const dove of ['windows','wsl2'])test(`META16-SESSION-${dove}: the real wrapped command is stored and read without its technical suffix`,{skip:dove==='wsl2'&&process.platform!=='win32'},async t=>{
  const f=await fixture(t),script=join(f.root,'producer.cjs');writeFileSync(script,"process.stdout.write('visible\\n');");
  const command=dove==='windows'?`"${process.execPath}" "${script}"`:"printf 'visible\\n'";
  const result=await runWithProcessOutput({store:f.store,sessionId:'real16',runId:'run',toolCallId:'tool',emit:()=>true},sink=>eseguiComandoSandboxato(command,f.root,{dove,tracciaCartella:true,...sink}));
  assert.equal(result.codice,0);assert.equal(result.outputStorageFailed,false);assert.equal(result.processOutput.outputMetadataVersion,1);
  await f.reopen();const page=await readProcessOutputPage(f.store,{sessionId:'real16',outputId:result.processOutput.outputId});assert.equal(page.text,'visible\n');assert.equal(page.footerStatus,'excluded');
});
