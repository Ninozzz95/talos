/*
 * 0.6.15 remote control (owner 26/10/2026: «Stesse regole del desktop», «Due voci separate»): the CLI hosts the kernel's
 * HTTP handler in process, with no port, and the kernel's remote coordinator with its OWN identity.
 * - the keyring the kernel sees has one service, renamed to the CLI's own, and a store that answers with a promise is refused
 *   (the kernel's identity reads synchronously: identita.mjs `leggi`);
 * - with the CLI's real composition (isolated profile, memory store, no model run) every list of the phone's closed list answers
 *   200 — the three that did not on 26/10 before http-deps.ts (doctor, models, providers) included — and nothing listens;
 * - building the host writes nothing to the data folder and opens nothing: the transport starts only when remote is turned on.
 */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {CLI_PROGRAM_NAME,CLI_REMOTE_SERVICE,IN_PROCESS_PORT,KERNEL_REMOTE_SERVICE,cliRemoteKeyring,createRemoteHost,remotePaths} from '../../src/remote/host.ts';
import {cliHttpDeps} from '../../src/remote/http-deps.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';

const VENDOR=resolve(import.meta.dirname,'..','..','vendor');
function dir(t:{after:(fn:()=>void)=>void}){const d=mkdtempSync(join(tmpdir(),'talos-remote-host-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return d;}

test('the kernel sees one keyring service, renamed to the CLI\'s own; any other is refused, and so is a store with promises',()=>{
  const base=createMemoryKeyring(`remote-host-${process.pid}`);
  const k=cliRemoteKeyring(base);
  k.set(KERNEL_REMOTE_SERVICE,'endpoint','abc');
  assert.equal(base.get(CLI_REMOTE_SERVICE,'endpoint'),'abc','written under talos-cli-remote');
  assert.equal(base.get(KERNEL_REMOTE_SERVICE,'endpoint'),null,'never under the kernel\'s (or the desktop\'s) name');
  assert.equal(k.get(KERNEL_REMOTE_SERVICE,'endpoint'),'abc');
  k.remove(KERNEL_REMOTE_SERVICE,'endpoint');
  assert.equal(k.get(KERNEL_REMOTE_SERVICE,'endpoint'),null);
  for(const other of ['talos-cli-provider','talos-harness-remote-desktop','talos-cli-remote'])assert.throws(()=>k.get(other,'x'),{code:'REMOTE_KEYRING_SCOPE'},other);
  const asyncStore=cliRemoteKeyring({get:async()=>'x',set:async()=>{},remove:async()=>{}});
  assert.throws(()=>asyncStore.get(KERNEL_REMOTE_SERVICE,'endpoint'),{code:'REMOTE_KEYRING_ASYNC'});
  assert.equal(CLI_REMOTE_SERVICE,'talos-cli-remote');
  assert.equal(CLI_PROGRAM_NAME,'TALOS CLI');
});

test('the host hands the kernel the CLI\'s files, identity, program name and excluded folders, and opens nothing',async t=>{
  const dataRoot=dir(t);
  let given:any=null;
  const fakeModules:Record<string,any>={
    'http-app.mjs':{createHttpApp:(deps:any)=>{given={...given,http:deps};return ()=>{};}},
    'remoto/index.mjs':{creaRemoto:(options:any)=>{given={...given,remote:options};return {ferma:async()=>{given.stopped=true;}};}},
    'remoto/chiamata-interna.mjs':{creaChiamataInterna:(options:any)=>{given={...given,call:options};return async()=>({stato:200,dati:{}});}},
    'iscrizione-sessione.mjs':{iscriviConRigiocata:()=>{}},
  };
  const registry={elenca:()=>[]};
  const host=await createRemoteHost({repoRoot:'R',dataRoot,registry,keyring:createMemoryKeyring(`remote-host-b-${process.pid}`),pcName:'DESK',httpDeps:{providerStore:{x:1}},importModule:async(file:string)=>fakeModules[file],loadBinding:()=>({binding:true})});
  const p=remotePaths(dataRoot);
  assert.equal(given.http.sessionRegistry,registry);
  assert.deepEqual(given.http.providerStore,{x:1});
  assert.match(given.http.token,/^[0-9a-f]{48}$/u,'a fresh in-process gate token');
  assert.equal(given.call.porta,IN_PROCESS_PORT);
  assert.equal(given.call.gettone,given.http.token);
  assert.deepEqual([given.remote.fileImpostazioni,given.remote.fileTelefoni,given.remote.fileConsensi,given.remote.fileSegretoCartelle,given.remote.cartellaChat],[p.settings,p.phones,p.consents,p.folderSecret,p.chatFolder]);
  assert.equal(given.remote.programma,'TALOS CLI');
  assert.equal(given.remote.nomePc,'DESK');
  assert.deepEqual(given.remote.cartelleAmmesse,[]);
  assert.ok(given.remote.cartelleEscluse.includes(dataRoot)&&given.remote.cartelleEscluse.includes('R'),'its own install and data folder are never offered to a device');
  assert.deepEqual(await given.remote.caricaIroh(),{binding:true});
  given.remote.keyring.set(KERNEL_REMOTE_SERVICE,'endpoint','k');
  assert.equal(existsSync(p.dir),false,'nothing written to the data folder by building the host');
  await host.stop();await host.stop();
  assert.equal(given.stopped,true);
});

test('with the CLI\'s real composition every list the phone asks answers 200, through the in-process handler',{timeout:120_000},async t=>{
  const base=dir(t);
  for(const d of ['r','l','u','t','proj'])mkdirSync(join(base,d),{recursive:true});
  const env={...process.env,APPDATA:join(base,'r'),LOCALAPPDATA:join(base,'l'),USERPROFILE:join(base,'u'),HOME:join(base,'u'),TEMP:join(base,'t'),TMP:join(base,'t'),TALOS_CREDENTIAL_STORE:'memory',TALOS_TEST_PROFILE:'1'};
  const saved={...process.env};
  Object.assign(process.env,env);
  t.after(()=>{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);});
  const {resolveCliPaths,ensureCliPaths}=await import('../../src/paths.ts');
  const {createCliRuntimeContext}=await import('../../src/runtime/create-runtime.ts');
  const paths=resolveCliPaths(process.env as any,process.platform,join(base,'u'));
  await ensureCliPaths(paths);
  const context:any=await createCliRuntimeContext({projectRoot:join(base,'proj'),paths,repoRoot:VENDOR,model:'ollama:qwen3-coder-test',trustVerified:true});
  const fakeFetch=(async()=>new Response(JSON.stringify({data:[]}),{status:200,headers:{'content-type':'application/json'}})) as typeof fetch;
  const httpDeps=await cliHttpDeps({repoRoot:VENDOR,context,fetch:fakeFetch});
  const host=await createRemoteHost({repoRoot:VENDOR,dataRoot:paths.dataRoot,registry:context.registry,keyring:createMemoryKeyring(`remote-host-c-${process.pid}`),chatImageStore:context.chatImageStore,httpDeps,pcName:'probe',loadBinding:()=>null});
  t.after(()=>host.stop());
  for(const percorso of ['/api/v1/sessions','/api/v1/doctor','/api/v1/models','/api/v1/providers','/api/v1/projects','/api/v1/local-models']){
    const r=await host.call({metodo:'GET',percorso,origine:'telefono:probe'});
    assert.equal(r.stato,200,percorso);
  }
  /* a session route reaches the CLI's own registry: an unknown session is «not found», not a missing dependency */
  await assert.rejects(host.call({metodo:'GET',percorso:'/api/v1/sessions/sess-unknown/pending',origine:'telefono:probe'}),{code:'NOT_FOUND'});
  /* only the secret of the file ids (file-dispositivi.mjs, as in the desktop): no settings, no paired phones, no consents, no
     identity — those are written when remote control is turned on, paired or consented */
  const written=existsSync(remotePaths(paths.dataRoot).dir)?readdirSync(remotePaths(paths.dataRoot).dir,{recursive:true}).map(String).sort():[];
  assert.deepEqual(written.filter(name=>!/^file-dispositivi([\\/]segreto)?$/u.test(name)),[],written.join(','));
});
