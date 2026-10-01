import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { registraRiga, leggiRegistro } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const tick = () => new Promise(r => setImmediate(r));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;});return {promise,resolve,reject}; }
function bank(t, { writer = registraRiga, persistent = true, command = async () => ({ codice: 0, testo: 'output' }) } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-command-settings-')), store = join(root, 'store'), runs = [], cleanup = [];
  const registry = createSessionRegistry({
    ...(persistent ? { cartellaStore: store } : {}), modello: 'fixture', chiave: 'fixture',
    guardaWorkspaceFn: () => () => {}, registraRigaFn: writer, eseguiComandoDirettoFn: command,
    preparaEsecuzioneFn: id => ({ cartella: root, comandoProva: 'npm test', task: { id, consegna: 'Verifica.' } }),
    avviaSessioneFn(input) {
      const end=deferred(); runs.push({input,end});
      input.onEvento({type:'RunStarted',threadId:'fixture',runId:'run-'+runs.length});
      return end.promise;
    },
  });
  const {sessionId} = registry.avvia('settings-fixture');
  const settle = async (index=0) => {
    const run=runs[index]; run.input.onEvento({type:'RunFinished',threadId:'fixture',runId:'run-'+(index+1)});
    run.end.resolve({ok:true,esito:{detto:'fatto',comeFinita:'concluso',messaggiFinali:[{role:'user',content:'Verifica.'},{role:'assistant',content:'fatto'}]}});
    await registry.attendiAssestamento(index===0?sessionId:registry.elenca().at(-1)?.sessionId);
  };
  t.after(async()=>{
    for(const fn of cleanup)fn();
    for(const run of runs)run.end.resolve({ok:false});
    await registry.chiudi();
    const sub=relative(resolve(tmpdir()),resolve(root));assert.ok(sub&&!sub.startsWith('..')&&!isAbsolute(sub));
    rimuoviCartellaDiProva(root);
  });
  return {root,store,registry,sessionId,runs,cleanup,settle,settings:()=>registry.impostazioniComandi(sessionId)};
}
function freshProcess(b, sessionId=b.sessionId) {
  // ⛔ 01/10/2026: era resolve('src/…'), cioè dalla cartella CORRENTE. ci.yml lancia la suite da harness-ui/ e passava;
  // release.yml:515 la lancia dalla radice del repo (`node --test harness-ui/tests/*.test.mjs`) e il sottoprocesso non
  // trovava il modulo ⇒ 11 rossi SETTINGS06, release ferma a «Test server falliti». Lo stesso modulo della riga 10,
  // risolto da questo file (Node.js, ESM: import.meta.url + new URL).
  const url=new URL('../src/session-registry.mjs', import.meta.url).href;
  const script=`import {createSessionRegistry} from ${JSON.stringify(url)};
    const r=createSessionRegistry({cartellaStore:process.argv[1],modello:'fixture',chiave:'fixture',guardaWorkspaceFn:()=>()=>{}});
    const restored=await r.ripristina();console.log(JSON.stringify({restored,settings:r.impostazioniComandi(process.argv[2])}));await r.chiudi();`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script,b.store,sessionId],{encoding:'utf8',timeout:15000,windowsHide:true});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim());
}
async function http(t, registry) {
  const server=createServer(createHttpApp({sessionRegistry:registry}));
  await new Promise((ok,ko)=>{server.once('error',ko);server.listen(0,'127.0.0.1',ok);});
  t.after(()=>new Promise(ok=>server.close(ok)));
  const base='http://127.0.0.1:'+server.address().port;
  return (id,route,body)=>fetch(`${base}/api/v1/sessions/${id}/${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}

test('SETTINGS06-RESTART: confirmed choices survive a genuinely new process', async t=>{
  const b=bank(t);await b.settle();
  await b.registry.doveGiranoIComandi(b.sessionId,'windows');
  await b.registry.comandiNellaConversazione(b.sessionId,true);
  assert.deepEqual(freshProcess(b).settings,{ok:true,dove:'windows',comandiNellaConversazione:true});
});
test('SETTINGS06-LEGACY: old session remains automatic and private',async t=>{
  const b=bank(t);await b.settle();
  assert.deepEqual(freshProcess(b).settings,{ok:true,dove:null,comandiNellaConversazione:false});
});
test('SETTINGS06-FSYNC: real journal append requests a flush before acknowledgement',async t=>{
  let observed=false;
  const b=bank(t,{writer:args=>registraRiga(args,{appendFileFn:(path,data,options)=>{
    if(args.record.tipo==='impostazioni-comandi'){observed=true;assert.equal(options.flush,true);}
    return appendFile(path,data,options);
  }})});
  await b.settle();await b.registry.doveGiranoIComandi(b.sessionId,'windows');assert.equal(observed,true);
  assert.equal(freshProcess(b).settings.dove,'windows');
});
test('SETTINGS06-DELAY: memory and admission wait for durable acknowledgement',async t=>{
  const gate=deferred();let started=false;
  const b=bank(t,{writer:args=>args.record.tipo==='impostazioni-comandi'?(started=true,gate.promise.then(()=>registraRiga(args))):registraRiga(args)});
  b.cleanup.push(()=>gate.resolve());await b.settle();
  const pending=Promise.resolve(b.registry.doveGiranoIComandi(b.sessionId,'windows'));
  await tick();assert.equal(started,true);assert.equal(b.settings().dove,null);
  assert.equal(b.registry.resume(b.sessionId,'continua').code,'SESSION_NOT_READY');
  assert.equal(b.registry.forka(b.sessionId).code,'SESSION_NOT_READY');
  assert.equal(b.registry.shell(b.sessionId,'echo unexpected').code,'SESSION_NOT_READY');
  assert.equal((await b.registry.elimina(b.sessionId)).code,'SESSION_NOT_READY');
  let settled=false;const waiting=b.registry.attendiAssestamento(b.sessionId).then(()=>settled=true);
  await tick();assert.equal(settled,false);gate.resolve();await pending;await waiting;
  assert.equal(b.settings().dove,'windows');
});
test('SETTINGS06-FAIL: failed write preserves old state and permits explicit retry',async t=>{
  let fail=true;
  const b=bank(t,{writer:args=>args.record.tipo==='impostazioni-comandi'&&fail?Promise.reject(new Error('fixture disk failure')):registraRiga(args)});
  await b.settle();
  await assert.rejects(Promise.resolve(b.registry.doveGiranoIComandi(b.sessionId,'windows')),/disk failure/);
  assert.equal(b.settings().dove,null);fail=false;
  await b.registry.doveGiranoIComandi(b.sessionId,'wsl2');
  assert.equal(freshProcess(b).settings.dove,'wsl2');
});
test('SETTINGS06-CONCURRENT: ordered field patches do not erase each other',async t=>{
  const b=bank(t);await b.settle();
  await Promise.all([b.registry.doveGiranoIComandi(b.sessionId,'windows'),b.registry.comandiNellaConversazione(b.sessionId,true),b.registry.doveGiranoIComandi(b.sessionId,'wsl2')]);
  assert.deepEqual(freshProcess(b).settings,{ok:true,dove:'wsl2',comandiNellaConversazione:true});
  const changes=(await leggiRegistro({cartellaStore:b.store,sessionId:b.sessionId})).filter(r=>r.tipo==='impostazioni-comandi');
  assert.equal(changes.length,3);
  assert.deepEqual(changes.map(r=>Object.keys(r).filter(k=>k!=='tipo')), [['doveGiranoIComandi'],['comandiNellaConversazione'],['doveGiranoIComandi']]);
});
test('SETTINGS06-FALSE-NULL: explicit reset overrides older saved preferences',async t=>{
  const b=bank(t);await b.settle();
  await b.registry.doveGiranoIComandi(b.sessionId,'windows');await b.registry.comandiNellaConversazione(b.sessionId,true);
  await b.registry.doveGiranoIComandi(b.sessionId,null);await b.registry.comandiNellaConversazione(b.sessionId,false);
  const rows=(await leggiRegistro({cartellaStore:b.store,sessionId:b.sessionId})).filter(r=>r.tipo==='impostazioni-comandi');assert.equal(rows.length,4);
  assert.deepEqual(freshProcess(b).settings,{ok:true,dove:null,comandiNellaConversazione:false});
});
for(const [route,body] of [['dove-girano-i-comandi',{dove:'windows'}],['comandi-nella-conversazione',{acceso:true}]]){
  test(`SETTINGS06-HTTP-${route}: response waits for storage`,async t=>{
    const gate=deferred(),started=deferred();
    const b=bank(t,{writer:args=>{if(args.record.tipo!=='impostazioni-comandi')return registraRiga(args);started.resolve('write');return gate.promise.then(()=>registraRiga(args));}});
    b.cleanup.push(()=>gate.resolve());await b.settle();const post=await http(t,b.registry);
    let received=false;const request=post(b.sessionId,route,body).then(r=>{received=true;return r;});
    assert.equal(await Promise.race([started.promise,request.then(()=>'response')]),'write');
    await tick();assert.equal(received,false);gate.resolve();assert.equal((await request).status,200);
    const settings=freshProcess(b).settings;assert.equal(route.startsWith('dove')?settings.dove:settings.comandiNellaConversazione,route.startsWith('dove')?'windows':true);
  });
}
test('SETTINGS06-FORK: inherits confirmed choices, independently and durably',async t=>{
  const b=bank(t);await b.settle();await b.registry.doveGiranoIComandi(b.sessionId,'windows');await b.registry.comandiNellaConversazione(b.sessionId,true);
  const fork=b.registry.forka(b.sessionId);assert.ok(fork.sessionId);
  assert.deepEqual(b.registry.impostazioniComandi(fork.sessionId),{ok:true,dove:'windows',comandiNellaConversazione:true});
  b.runs[1].input.onEvento({type:'RunFinished'});b.runs[1].end.resolve({ok:true});await b.registry.attendiAssestamento(fork.sessionId);
  await b.registry.doveGiranoIComandi(b.sessionId,'wsl2');
  assert.equal(freshProcess(b,fork.sessionId).settings.dove,'windows');
});
test('SETTINGS06-HTTP-FAIL: failed storage never returns a success receipt',async t=>{
  const b=bank(t,{writer:args=>args.record.tipo==='impostazioni-comandi'?Promise.reject(new Error('fixture disk failure')):registraRiga(args)});
  await b.settle();const post=await http(t,b.registry);const response=await post(b.sessionId,'dove-girano-i-comandi',{dove:'windows'});
  assert.equal(response.status,500);assert.equal(b.settings().dove,null);
});
test('SETTINGS06-LATE-CWD: old command cannot restore cwd after environment change',async t=>{
  const command=deferred(),calls=[];const b=bank(t,{command:args=>{calls.push(args);return calls.length===1?command.promise:Promise.resolve({codice:0,testo:'ok'});}});
  b.cleanup.push(()=>command.resolve({codice:0,testo:'ok'}));await b.settle();
  await b.registry.doveGiranoIComandi(b.sessionId,'wsl2');b.registry.shell(b.sessionId,'echo first');
  await b.registry.doveGiranoIComandi(b.sessionId,'windows');command.resolve({codice:0,testo:'ok',cartellaFinale:'/mnt/c/old'});await tick();await tick();
  b.registry.shell(b.sessionId,'echo second');assert.equal(calls[1].dove,'windows');assert.equal(calls[1].cartella,b.root);
});
for(const mode of ['enable-late','off-on']){
  test(`SETTINGS06-LATE-CONTEXT-${mode}: switch never retroactively shares in-flight output`,async t=>{
    const command=deferred();const b=bank(t,{command:()=>command.promise});b.cleanup.push(()=>command.resolve({codice:0,testo:'UNSHARED-OUTPUT'}));await b.settle();
    if(mode==='off-on')await b.registry.comandiNellaConversazione(b.sessionId,true);
    b.registry.shell(b.sessionId,'echo UNSHARED-COMMAND');
    if(mode==='off-on')await b.registry.comandiNellaConversazione(b.sessionId,false);
    await b.registry.comandiNellaConversazione(b.sessionId,true);
    command.resolve({codice:0,testo:'UNSHARED-OUTPUT'});await tick();await tick();
    b.registry.resume(b.sessionId,'continua');assert.doesNotMatch(JSON.stringify(b.runs[1].input.messaggiIniziali),/UNSHARED/);
  });
}
test('SETTINGS06-CLOSE: shutdown drains accepted preference writes and refuses new ones',async t=>{
  const gate=deferred();let started=false;const b=bank(t,{writer:args=>args.record.tipo==='impostazioni-comandi'?(started=true,gate.promise.then(()=>registraRiga(args))):registraRiga(args)});
  b.cleanup.push(()=>gate.resolve());await b.settle();const write=Promise.resolve(b.registry.doveGiranoIComandi(b.sessionId,'windows'));await tick();assert.equal(started,true);
  let closed=false;const closing=b.registry.chiudi().then(r=>{closed=true;return r;});await tick();assert.equal(closed,false);
  assert.ok((await b.registry.comandiNellaConversazione(b.sessionId,true)).erroreAvvio);gate.resolve();await write;assert.equal((await closing).scaduta,false);
  assert.equal(freshProcess(b).settings.dove,'windows');
});
test('SETTINGS06-INVALID: invalid values do not persist; corrupt saved choice is reported',async t=>{
  const b=bank(t);await b.settle();assert.equal(b.registry.doveGiranoIComandi(b.sessionId,'powershell').code,'DOVE_NON_VALIDO');assert.equal(b.registry.comandiNellaConversazione(b.sessionId,'yes').code,'SCELTA_NON_VALIDA');
  assert.equal((await leggiRegistro({cartellaStore:b.store,sessionId:b.sessionId})).filter(r=>r.tipo==='impostazioni-comandi').length,0);
  await registraRiga({cartellaStore:b.store,sessionId:b.sessionId,record:{tipo:'impostazioni-comandi',doveGiranoIComandi:'unknown'},durable:true});
  const result=freshProcess(b);assert.equal(result.restored.ripristinate,0);assert.equal(result.settings.code,'NOT_FOUND');
});
test('SETTINGS06-NO-STORE: synchronous in-memory contract remains compatible',async t=>{
  const b=bank(t,{persistent:false});assert.deepEqual(b.registry.doveGiranoIComandi(b.sessionId,'windows'),{ok:true,dove:'windows'});assert.deepEqual(b.registry.comandiNellaConversazione(b.sessionId,true),{ok:true,acceso:true});await b.settle();
});
