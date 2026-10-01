import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {talosLavora, ATTREZZI_OPENAI} from '../src/kernel/talosHarness.mjs';
import {avviaSessione} from '../src/agent-service.mjs';
import {createOwnerRuntimeAdapter} from '../src/runtime-owner-adapter.mjs';
import {createSessionRegistry} from '../src/session-registry.mjs';
import {registraRiga} from '../src/session-store.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';
import {SALTA_SENZA_WSL} from './aiuto/wsl-reale.mjs';

function fixture(t, cleanup = true) {
  const root=mkdtempSync(join(tmpdir(),'talos-agent-environment-'));
  if(cleanup)t.after(()=>removeFixture(root));
  return root;
}
function removeFixture(root){const sub=relative(resolve(tmpdir()),resolve(root));assert.ok(sub&&!sub.startsWith('..')&&!isAbsolute(sub));rimuoviCartellaDiProva(root);}
const call=(name,args={})=>({id:'command-07',type:'function',function:{name,arguments:JSON.stringify(args)}});
async function run(cartella,{dove='windows',callback,command='echo SHELL07',tool='shell',beforeReply,runtime=talosLavora,...options}={}) {
  const requests=[],events=[];
  const result=await runtime({cartella,task:{consegna:'Verifica il comando richiesto.'},modello:'fixture/environment',chiave:'fixture',
    messaggiIniziali:[{role:'system',content:'Verifica.'},{role:'user',content:'Verifica il comando richiesto.'}],
    livelloAccesso:'completo',_giriMassimiInterno:3,comandoProva:command,
    ambienteComandiFn:callback??(()=>({dove,revisione:0})),...options,
    fetchDiRete:async(_url,init)=>{requests.push(JSON.parse(init.body));await beforeReply?.(requests.length);
      const message=requests.length===1?{role:'assistant',content:'',tool_calls:[call(tool,{comando:command})]}:{role:'assistant',content:'Verificato.'};
      return Response.json({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]});},
    onGiro:e=>events.push(e),
  });
  return {result,requests,events,output:events.find(e=>e.tipo==='tool-esito')};
}
for(const dove of ['windows','wsl2'])test(`SHELL07-${dove.toUpperCase()}: real process follows the selected environment`,{skip:process.platform!=='win32'?true:dove==='wsl2'?SALTA_SENZA_WSL:false},async t=>{
  const original=structuredClone(ATTREZZI_OPENAI);
  const r=await run(fixture(t),{dove});
  assert.match(r.output.content,/SHELL07/);assert.equal(r.output.isError,false);
  const receipt=r.events.find(e=>e.tipo==='ricevuta').ricevuta;
  assert.equal(receipt.evidence.sandboxEnforcement,dove==='windows'?'none':'wsl2');
  const description=r.requests[0].tools.find(t=>t.function.name==='shell').function.description;
  assert.match(description,dove==='windows'?/Selected command environment: Windows.*cmd\.exe/:/Selected command environment: Linux.*WSL2.*Bash/);
  assert.deepEqual(ATTREZZI_OPENAI,original,'global schemas remain immutable');
});
test('SHELL07-PROVA: explicit WSL applies to the configured test command', {skip:SALTA_SENZA_WSL}, async t=>{
  const r=await run(fixture(t),{dove:'wsl2',tool:'prova',command:'printf SHELL07'});
  assert.match(r.output.content,/^exit 0 \[sandbox: wsl2 \(Linux in WSL [^\]]+\)\]\nSHELL07/);assert.equal(r.output.isError,false); // F009: la prova in Linux dichiara con che utente
});
test('SHELL07-PROVA-ZERO: a zero-suite report is not a pass in WSL', {skip:SALTA_SENZA_WSL}, async t=>{
  const r=await run(fixture(t),{dove:'wsl2',tool:'prova',command:'printf "# tests 0\\n"'});
  assert.match(r.output.content,/NO tests ran/);assert.equal(r.output.isError,true);
});
test('SHELL07-PROVA-EXIT: WSL preserves the real nonzero exit', {skip:SALTA_SENZA_WSL}, async t=>{
  const r=await run(fixture(t),{dove:'wsl2',tool:'prova',command:'printf SHELL07; exit 42'});
  assert.match(r.output.content,/^exit 42 \[sandbox: wsl2 \(Linux in WSL [^\]]+\)\]\nSHELL07/);assert.equal(r.output.isError,true); // F009
});
test('SHELL07-TAP-EMPTY: a real Node TAP reporter with zero tests is not a pass',async t=>{
  const root=fixture(t);writeFileSync(join(root,'empty.test.mjs'),"import test from 'node:test'; test('present',()=>{});");
  // The test runner's private marker would suppress a nested run; only the fixture child removes it.
  writeFileSync(join(root,'run-tests.cjs'),`const {spawnSync}=require('node:child_process');
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const r=spawnSync(process.execPath,['--test','--test-isolation=none','--test-reporter=tap','--test-name-pattern=absent','empty.test.mjs'],{encoding:'utf8',env});
    process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status??1);`);
  const r=await run(root,{tool:'prova',command:`"${process.execPath}" run-tests.cjs`});
  assert.match(r.output.content,/# tests 0/);
  assert.equal(r.output.isError,true);assert.match(r.output.content,/NO tests ran/);
});
test('SHELL07-CHANGE: a command prepared before an environment change is never executed', async t=>{
  const root=fixture(t);let revision=0;
  const r=await run(root,{callback:()=>({dove:revision?'wsl2':'windows',revisione:revision}),command:'echo forbidden > forbidden.txt',beforeReply:n=>{if(n===1)revision++;}});
  assert.equal(existsSync(join(root,'forbidden.txt')),false);
  assert.equal(r.output.isError,true);assert.match(r.output.content,/COMMAND_ENVIRONMENT_CHANGED/);
  assert.match(r.requests[1].tools.find(t=>t.function.name==='shell').function.description,/Selected command environment: Linux/);
});
test('SHELL07-APPROVAL: selection is rechecked after approval',async t=>{
  const root=fixture(t);let revision=0,approvals=0;
  const r=await run(root,{callback:()=>({dove:'windows',revisione:revision}),command:'echo forbidden > forbidden.txt',
    livelloAccesso:'workspace',permessiPerAttrezzo:{shell:'chiedi'},chiediApprovazioneFn:async()=>{approvals++;revision++;return true;}});
  assert.equal(approvals,1);assert.equal(existsSync(join(root,'forbidden.txt')),false);assert.match(r.output.content,/COMMAND_ENVIRONMENT_CHANGED/);
});
for(const [id,value,extra] of [['INVALID',{dove:'unknown',revisione:0},{}],['REVISION',{dove:null,revisione:-1},{}],['MOBILE',{dove:'windows',revisione:0},{mobile:true}]]){
  test(`SHELL07-${id}: invalid environment fails before contacting the model`,async t=>{
    let requests=0;
    await assert.rejects(()=>talosLavora({cartella:fixture(t),task:{consegna:'Verifica.'},modello:'fixture',chiave:'fixture',ambienteComandiFn:()=>value,...extra,
      fetchDiRete:async()=>{requests++;return Response.json({choices:[{message:{role:'assistant',content:'ok'},finish_reason:'stop'}]});}}),/COMMAND_ENVIRONMENT/);
    assert.equal(requests,0);
  });
}
test('SHELL07-LEGACY: absent callback leaves the historical tool descriptions unchanged',async t=>{
  const r=await run(fixture(t),{ambienteComandiFn:undefined,command:'echo SHELL07'});
  assert.equal(r.requests[0].tools.find(t=>t.function.name==='shell').function.description,ATTREZZI_OPENAI.find(t=>t.function.name==='shell').function.description);
});
for(const when of ['PRE','READ'])test(`SHELL07-STOP-${when}: Stop remains a cancelled outcome without contacting the provider`,async t=>{
  const controller=new AbortController();let requests=0;
  if(when==='PRE')controller.abort();
  const result=await talosLavora({cartella:fixture(t),task:{consegna:'Verifica.'},modello:'fixture',chiave:'fixture',segnaleStop:controller.signal,
    ambienteComandiFn:()=>{if(when==='READ')controller.abort();return{dove:null,revisione:0};},
    fetchDiRete:async()=>{requests++;throw Error('unexpected provider');}});
  assert.equal(result.comeFinita,'fermato');assert.equal(requests,0);
});
test('SHELL07-SERVICE: real service and kernel execute the selected Windows command', {skip:process.platform!=='win32'},async t=>{
  const r=await run(fixture(t),{dove:'windows',runtime:input=>avviaSessione({...input,onEvento:()=>{},
    contestoDelProgettoFn:async()=>null,leggiContestoWorkspaceFn:async()=>({}),
    talosLavoraFn:kernelInput=>talosLavora({...kernelInput,fetchDiRete:input.fetchDiRete,onDelta:undefined,onGiro:input.onGiro,_giriMassimiInterno:3})})});
  assert.equal(r.result.ok,true,JSON.stringify(r.result));
  assert.equal(r.events.find(e=>e.tipo==='ricevuta').ricevuta.evidence.sandboxEnforcement,'none');
});
test('SHELL07-ADAPTER: old runtime cannot silently ignore the callback',async()=>{
  let calls=0;const adapter=createOwnerRuntimeAdapter({modulePath:resolve('fixture-environment.mjs'),importFn:async()=>({talosLavora:async()=>{calls++;}})});
  await assert.rejects(()=>adapter.talosLavora({ambienteComandiFn:()=>({dove:'windows',revisione:0})}),e=>e.code==='COMMAND_ENVIRONMENT_CONTRACT_REQUIRED');assert.equal(calls,0);
});
test('SHELL07-ADAPTER-SUPPORTED: callback reaches a compatible runtime unchanged',async()=>{
  const fn=()=>({dove:'wsl2',revisione:1});let observed;
  const adapter=createOwnerRuntimeAdapter({modulePath:resolve('fixture-environment.mjs'),importFn:async()=>({SUPPORTA_AMBIENTE_COMANDI:1,talosLavora:async input=>{observed=input.ambienteComandiFn;}})});
  await adapter.talosLavora({ambienteComandiFn:fn});assert.equal(observed,fn);
});
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
function bank(t,writer=registraRiga){
  const root=fixture(t,false),store=join(root,'store'),runs=[];
  const registry=createSessionRegistry({cartellaStore:store,modello:'fixture',chiave:'fixture',guardaWorkspaceFn:()=>()=>{},registraRigaFn:writer,
    preparaEsecuzioneFn:id=>({cartella:root,task:{id,consegna:'Verifica.'},comandoProva:'echo test'}),
    avviaSessioneFn:input=>{const end=deferred();runs.push({input,end});input.onEvento({type:'RunStarted'});return end.promise;}});
  const {sessionId}=registry.avvia('fixture');
  t.after(async()=>{for(const r of runs)r.end.resolve({ok:false});await registry.chiudi();removeFixture(root);});
  const settle=async(index=0,id=sessionId)=>{runs[index].input.onEvento({type:'RunFinished'});runs[index].end.resolve({ok:true,esito:{detto:'ok',comeFinita:'concluso',messaggiFinali:[{role:'user',content:'Verifica.'},{role:'assistant',content:'ok'}]}});await registry.attendiAssestamento(id);};
  return {root,store,registry,sessionId,runs,settle};
}
test('SHELL07-REGISTRY: confirmed live choice, resume, fork and child inherit without aliasing',async t=>{
  const b=bank(t);assert.equal(typeof b.runs[0].input.ambienteComandiFn,'function');
  await b.registry.doveGiranoIComandi(b.sessionId,'windows');assert.equal((await b.runs[0].input.ambienteComandiFn()).dove,'windows');
  const child=await b.runs[0].input.onDelega('Leggi senza modificare.',b.root,{modalita:'lettura'});assert.equal(child.esito,'avviato');
  assert.equal((await b.runs[1].input.ambienteComandiFn()).dove,'windows');
  await b.settle();const fork=b.registry.forka(b.sessionId);assert.ok(fork.sessionId);assert.equal((await b.runs[2].input.ambienteComandiFn()).dove,'windows');
  await b.registry.doveGiranoIComandi(b.sessionId,'wsl2');assert.equal((await b.runs[2].input.ambienteComandiFn()).dove,'windows');
  const resumed=b.registry.resume(b.sessionId,'continua');assert.ok(resumed.sessionId);assert.equal((await b.runs[3].input.ambienteComandiFn()).dove,'wsl2');
});
const legame={runId:'11111111-1111-4111-8111-111111111111',nodeId:'leggi',activityExecutionId:'22222222-2222-4222-8222-222222222222',attempt:1,leaseId:'33333333-3333-4333-8333-333333333333',leaseEpoch:1};
test('SHELL07-WORKFLOW: inherits root environment while retaining read-only policy and frozen link',async t=>{
  const b=bank(t);await b.registry.doveGiranoIComandi(b.sessionId,'windows');
  const step=b.registry.avviaSessioneDiPasso({legame,rootSessionId:b.sessionId,consegna:'Leggi.'});assert.ok(step.sessionId);
  assert.equal(typeof b.runs[1].input.ambienteComandiFn,'function');assert.equal((await b.runs[1].input.ambienteComandiFn()).dove,'windows');
  assert.equal(b.runs[1].input.permessi,'Read only');assert.equal(b.runs[1].input.livelloAccesso,'lettura');assert.equal(b.runs[1].input.agentRole,'root');
  const finished=step.fine;await b.settle(1,step.sessionId);await finished;
});
test('SHELL07-PENDING: a pending preference cannot admit a tool or workflow step',async t=>{
  const gate=deferred();const b=bank(t,args=>args.record.tipo==='impostazioni-comandi'?gate.promise.then(()=>registraRiga(args)):registraRiga(args));
  const pending=b.registry.doveGiranoIComandi(b.sessionId,'windows');
  try {assert.equal(typeof b.runs[0].input.ambienteComandiFn,'function');await assert.rejects(async()=>b.runs[0].input.ambienteComandiFn(),/COMMAND_ENVIRONMENT_PENDING/);
    assert.equal(b.registry.avviaSessioneDiPasso({legame,rootSessionId:b.sessionId,consegna:'Leggi.'}).code,'SESSION_NOT_READY');
  } finally {gate.resolve();await pending;}
});
