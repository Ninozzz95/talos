/*
 * R2 lane K — gate E13 / Q-R2-5 / owner decision 10: ONE resolver chooses the credential store, `system` (default) or `memory`,
 * from `TALOS_CREDENTIAL_STORE` or the config key `credentials.store` (the variable wins). A test profile (`TALOS_TEST_PROFILE=1`,
 * set by the acceptance profile, or `NODE_TEST_CONTEXT`, set by `node --test` in every test process and inherited by its
 * children) gets `memory` when nothing is chosen, and a test profile that asks for `system` is refused with
 * `CREDENTIAL_STORE_REAL_IN_TEST` BEFORE the native module is resolved or loaded (Hermes `_ensure_test_isolation`).
 * ⛔ Nothing here can reach the real keyring: every loader handed in is a spy that refuses, and the composition cases inject the
 *   kernel modules. `systemKeyringModuleLoads()` counts every attempt to load the native module in this process.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chooseCredentialStore,createMemoryKeyring,openCredentialStore,isTestProfile,CREDENTIAL_STORE_VARIABLE,TEST_PROFILE_VARIABLE} from '../../src/provider/store.ts';
import {systemKeyringModuleLoads} from '../../src/provider/system-keyring.ts';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';
import {loadEffectiveConfig} from '../../src/config/load.ts';
import {resolveCliPaths} from '../../src/paths.ts';
import {runSystemCommand} from '../../src/commands/system-cli.ts';

const OUTSIDE={};                       // no test marker at all: what a person's shell looks like
const PROFILE={[TEST_PROFILE_VARIABLE]:'1'};
function spyLoader(){const calls={resolve:0,load:0};return{calls,resolve:()=>{calls.resolve++;throw Object.assign(new Error('spy: never resolves'),{code:'MODULE_NOT_FOUND'});}};}

test('E13: system is the default, memory is chosen by the variable or the config, and the variable wins',()=>{
  assert.deepEqual(chooseCredentialStore({env:OUTSIDE}),{kind:'system',source:'default',testProfile:false});
  assert.deepEqual(chooseCredentialStore({env:{[CREDENTIAL_STORE_VARIABLE]:'memory'}}),{kind:'memory',source:'environment',testProfile:false});
  assert.deepEqual(chooseCredentialStore({env:{[CREDENTIAL_STORE_VARIABLE]:' Memory '}}),{kind:'memory',source:'environment',testProfile:false});
  assert.deepEqual(chooseCredentialStore({env:OUTSIDE,config:{credentials:{store:'memory'}}}),{kind:'memory',source:'config',testProfile:false});
  assert.deepEqual(chooseCredentialStore({env:{[CREDENTIAL_STORE_VARIABLE]:'system'},config:{credentials:{store:'memory'}}}),{kind:'system',source:'environment',testProfile:false});
  assert.throws(()=>chooseCredentialStore({env:{[CREDENTIAL_STORE_VARIABLE]:'vault'}}),(error:any)=>error?.code==='CREDENTIAL_STORE_INVALID'&&/"vault"/u.test(error.message)&&/system or memory/u.test(error.message));
  /* owner 27/10/2026: `file` is known now, and refused outside a test profile (test-file-keyring.test.ts) */
  assert.throws(()=>chooseCredentialStore({env:{[CREDENTIAL_STORE_VARIABLE]:'file'}}),{code:'CREDENTIAL_STORE_FILE_OUTSIDE_TEST'});
});

test('E13: a test profile is detected by its marker or by node --test, and gets memory when nothing is chosen',()=>{
  assert.equal(isTestProfile(OUTSIDE),false);
  assert.equal(isTestProfile(PROFILE),true);
  assert.equal(isTestProfile({NODE_TEST_CONTEXT:'child-v8'}),true);
  assert.equal(isTestProfile({[TEST_PROFILE_VARIABLE]:'0'}),false);
  assert.deepEqual(chooseCredentialStore({env:PROFILE}),{kind:'memory',source:'test-profile',testProfile:true});
});

test('E13: a test profile that asks for the real store is refused before the native module is resolved or loaded',()=>{
  const before=systemKeyringModuleLoads();
  for(const ask of [{env:{...PROFILE,[CREDENTIAL_STORE_VARIABLE]:'system'}},{env:PROFILE,config:{credentials:{store:'system' as const}}},{env:{NODE_TEST_CONTEXT:'child-v8',[CREDENTIAL_STORE_VARIABLE]:'system'}}]){
    const loader=spyLoader();
    assert.throws(()=>openCredentialStore({repoRoot:tmpdir(),scope:'r2-k',...ask,loader}),(error:any)=>error?.code==='CREDENTIAL_STORE_REAL_IN_TEST'&&error.message.includes(`${CREDENTIAL_STORE_VARIABLE}=memory`));
    assert.deepEqual(loader.calls,{resolve:0,load:0},'refused before resolution');
  }
  assert.equal(systemKeyringModuleLoads(),before,'the native module was never loaded');
});

test('E13: outside a test profile the system store goes through the loader; a memory store never does',()=>{
  const loader=spyLoader();
  const system=openCredentialStore({repoRoot:tmpdir(),scope:'r2-k',env:OUTSIDE,loader});
  assert.equal(system.kind,'system');assert.equal(system.keyring,null);assert.equal(system.problem?.reason,'module-missing');assert.equal(loader.calls.resolve,1);
  const quiet=spyLoader();
  const memory=openCredentialStore({repoRoot:tmpdir(),scope:'r2-k',env:{[CREDENTIAL_STORE_VARIABLE]:'memory'},loader:quiet});
  assert.equal(memory.kind,'memory');assert.equal(quiet.calls.resolve,0);assert.ok(memory.keyring);
});

test('E13: the memory store keeps a value for the process, per profile, and removes it',async()=>{
  const a=createMemoryKeyring('profile-a'),again=createMemoryKeyring('profile-a'),b=createMemoryKeyring('profile-b');
  await a.set('talos-cli-provider','openai','dummy-value');
  assert.equal(await again.get('talos-cli-provider','openai'),'dummy-value','a rebuilt runtime in the same process sees it');
  assert.equal(await b.get('talos-cli-provider','openai'),null,'another profile does not');
  await a.remove('talos-cli-provider','openai');
  assert.equal(await again.get('talos-cli-provider','openai'),null);
});

test('E13: config accepts credentials.store system|memory and refuses anything else',async()=>{
  const home=await mkdtemp(join(tmpdir(),'talos-r2-k-config-'));
  try{
    const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home);
    await mkdir(paths.configRoot,{recursive:true});
    await writeFile(join(paths.configRoot,'config.json'),JSON.stringify({credentials:{store:'memory'}}));
    assert.deepEqual((await loadEffectiveConfig({paths,projectRoot:home})).value.credentials,{store:'memory'});
    await writeFile(join(paths.configRoot,'config.json'),JSON.stringify({credentials:{store:'file'}}));
    await assert.rejects(loadEffectiveConfig({paths,projectRoot:home}),/CONFIG_INVALID_CREDENTIAL_STORE/u);
    await writeFile(join(paths.configRoot,'config.json'),JSON.stringify({credentials:{password:'x'}}));
    await assert.rejects(loadEffectiveConfig({paths,projectRoot:home}),/SECRET_FIELD_FORBIDDEN/u);
  }finally{await rm(home,{recursive:true,force:true});}
});

function kernelModules(seen:{keyring?:any}){
  return{
    createProviderCredentialStore:(o:any)=>{seen.keyring=o.keyring;return{loadFromKeyring(){},getKey:()=>null,getRuntime:()=>({}),hasKey:()=>false,listPublic:()=>[]};},
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    avviaSessione:async()=>({}),
    /* stage 3: the kernel's own tool list, as session-registry.mjs exports it */STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),createSessionRegistry:()=>({ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})}),
  } as any;
}
async function tempPaths(){
  const home=await mkdtemp(join(tmpdir(),'talos-r2-k-compose-'));
  const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home);
  for(const p of [paths.configRoot,paths.dataRoot,paths.cacheRoot,paths.logsRoot])await mkdir(p,{recursive:true});
  return{home,paths};
}

test('E13: the composition takes its store from the resolver (talos-composition.ts:131), and refuses the real one in a test profile',async()=>{
  const {home,paths}=await tempPaths();
  try{
    const before=systemKeyringModuleLoads();
    const seen:{keyring?:any}={};
    const composed:any=await composeTalosRuntime({repoRoot:home,projectRoot:home,paths,model:'m',env:{[CREDENTIAL_STORE_VARIABLE]:'memory'},modules:kernelModules(seen)});
    assert.deepEqual(composed.credentialStore,{kind:'memory',source:'environment',testProfile:true});
    await seen.keyring.set('talos-harness-provider','openai','dummy-value');
    assert.equal(await seen.keyring.get('talos-harness-provider','openai'),'dummy-value','the kernel store writes into memory');
    await writeFile(join(paths.configRoot,'config.json'),JSON.stringify({credentials:{store:'memory'}}));
    const fromConfig:any=await composeTalosRuntime({repoRoot:home,projectRoot:home,paths,model:'m',env:{},modules:kernelModules({})});
    assert.equal(fromConfig.credentialStore.source,'config','the config key reaches the composition');
    await assert.rejects(composeTalosRuntime({repoRoot:home,projectRoot:home,paths,model:'m',env:{[CREDENTIAL_STORE_VARIABLE]:'system'},modules:kernelModules({})}),(error:any)=>error?.code==='CREDENTIAL_STORE_REAL_IN_TEST');
    assert.equal(systemKeyringModuleLoads(),before,'no composition loaded the native module');
  }finally{await rm(home,{recursive:true,force:true});}
});

async function doctor(format:'text'|'json',keyring:any,env:Record<string,string>){
  const {home,paths}=await tempPaths();
  const saved=new Map(Object.keys(env).map(name=>[name,process.env[name]]));
  Object.assign(process.env,env);
  try{
    const out:string[]=[];
    const ctx:any={invocation:{outputFormat:format},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:home,repoRoot:home,paths,createRuntimeContext:async()=>({})};
    const code=await runSystemCommand(ctx,'doctor',[],{keyring});
    return{code,text:out.join('')};
  }finally{
    for(const [name,value] of saved){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await rm(home,{recursive:true,force:true});
  }
}

test('F-E-001: on Windows doctor declares the realpath fallback given to Node programs in the sandbox, with its file',{skip:process.platform!=='win32'},async()=>{
  const text=await doctor('text',spyLoader(),{[CREDENTIAL_STORE_VARIABLE]:'memory'});
  assert.match(text.text,/^INFO sandbox-node: Node programs run inside the sandbox get a fallback .*NODE_OPTIONS --require .*talos-sandbox-realpath\.cjs\)$/mu);
});

test('E13: doctor names the active store in one line and in JSON, and never loads the module for memory',async()=>{
  const before=systemKeyringModuleLoads();
  const loader=spyLoader();
  const text=await doctor('text',loader,{[CREDENTIAL_STORE_VARIABLE]:'memory'});
  const lines=text.text.split('\n').filter(line=>line.startsWith('INFO credentials'));
  assert.deepEqual(lines,[`INFO credentials: in memory, this process only (set by ${CREDENTIAL_STORE_VARIABLE})`]);
  assert.match(text.text,/^OK  keyring$/mu);
  const json=JSON.parse((await doctor('json',loader,{[CREDENTIAL_STORE_VARIABLE]:'memory'})).text);
  assert.deepEqual(json.sections.credentials,{state:'healthy',store:'memory',source:'environment',nativeModuleLoaded:false});
  assert.deepEqual(loader.calls,{resolve:0,load:0});
  assert.equal(systemKeyringModuleLoads(),before);
});

test('E13: the observable can say yes: a module loaded through the loader (a fake the test hands in) is reported',async()=>{
  const values=new Map<string,string>();
  const Entry=class{k:string;constructor(s:string,a:string){this.k=`${s}:${a}`;}getPassword(){return values.get(this.k)??null;}setPassword(v:string){values.set(this.k,v);}deletePassword(){values.delete(this.k);}};
  let loads=0;
  // `doctor` passes the repo root; the approved-roots check is lexical, so a path under it is accepted and `load` (the fake) runs.
  const fake={resolve:()=>join(tmpdir(),'r2-k-fake-root','harness-ui','node_modules','@napi-rs','keyring','index.cjs'),load:()=>{loads++;return{Entry};}};
  const before=systemKeyringModuleLoads();
  const {home,paths}=await tempPaths();
  const saved=process.env[CREDENTIAL_STORE_VARIABLE];process.env[CREDENTIAL_STORE_VARIABLE]='system';
  try{
    const out:string[]=[];
    const ctx:any={invocation:{outputFormat:'json'},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:home,repoRoot:join(tmpdir(),'r2-k-fake-root'),paths,createRuntimeContext:async()=>({})};
    await runSystemCommand(ctx,'doctor',[],{keyring:fake});
    assert.equal(loads,1,'the fake was loaded once');assert.equal(systemKeyringModuleLoads(),before+1);
    assert.deepEqual(JSON.parse(out.join('')).sections.credentials,{state:'healthy',store:'system',source:'environment',nativeModuleLoaded:true});
  }finally{
    if(saved===undefined)delete process.env[CREDENTIAL_STORE_VARIABLE];else process.env[CREDENTIAL_STORE_VARIABLE]=saved;
    await rm(home,{recursive:true,force:true});
  }
});

test('E13: doctor in a test profile that asks for the real store says it was refused, and resolves nothing',async()=>{
  const loader=spyLoader();
  const text=await doctor('text',loader,{[CREDENTIAL_STORE_VARIABLE]:'system',[TEST_PROFILE_VARIABLE]:'1'});
  assert.match(text.text,/^ERR keyring: This is a test profile, so TALOS did not open the real credential store/mu);
  assert.match(text.text,/^INFO credentials: refused: This is a test profile/mu);
  assert.deepEqual(loader.calls,{resolve:0,load:0});
  const json=JSON.parse((await doctor('json',loader,{[CREDENTIAL_STORE_VARIABLE]:'system',[TEST_PROFILE_VARIABLE]:'1'})).text);
  assert.equal(json.sections.credentials.code,'CREDENTIAL_STORE_REAL_IN_TEST');
  assert.equal(json.sections.credentials.nativeModuleLoaded,false);
});

test('E13: a key saved in the memory store is not said to be in the system keyring',async()=>{
  const {describeKeyOrigin,keyOriginNotice}=await import('../../src/provider/environment-keys.ts');
  const registry={openai:{etichetta:'OpenAI',chiaveObbligatoria:true,auth:{nomeVariabile:['OPENAI_API_KEY']}}};
  const row={requiresKey:true,origineChiave:'custodia'};
  assert.equal(keyOriginNotice(describeKeyOrigin({registry,provider:'openai',publicRow:row,storeEnv:{},mode:'use',store:'memory'})!),'Key for OpenAI: kept in memory for this process only.');
  assert.equal(keyOriginNotice(describeKeyOrigin({registry,provider:'openai',publicRow:row,storeEnv:{},mode:'use',store:'system'})!),'Key for OpenAI: saved in the system keyring.');
  assert.equal(keyOriginNotice(describeKeyOrigin({registry,provider:'openai',publicRow:row,storeEnv:{},mode:'use'})!),'Key for OpenAI: saved in the system keyring.','an injected keyring keeps the old wording');
});
