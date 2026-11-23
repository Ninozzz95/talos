/*
 * B1 slice 18 — `talos -p` with an environment key runs, and the result states where the key came from.
 * The run goes through `main` and the REAL non-interactive entry (`createCliRuntime`) with the kernel's own store and chat
 * path, to a provider on 127.0.0.1, with a dummy key in the process environment. Only the keyring is replaced.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {main} from '../../src/main.ts';
import {createCliRuntime,createCliRuntimeContext} from '../../src/runtime/create-runtime.ts';
import {createEnvironmentKeyConsent,keyOriginForRun} from '../../src/provider/environment-keys.ts';
import {dummyKey,fakeKeyring,filesContaining,hermetic,REPO_ROOT,settle,startFakeProvider,writeProviderRuntime} from '../provider/first-run-fixture.ts';

const REGISTRY=(await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href)).REGISTRO_FORNITORI as Record<string,any>;
const label=(id:string)=>String(REGISTRY[id].etichetta);
const MODEL='openrouter:vendor/live-model-a';
function io(){const out:string[]=[];const err:string[]=[];return{out,err,api:{writeOut:(s:string)=>{out.push(s);},writeErr:(s:string)=>{err.push(s);},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''}};}

test('talos -p with an environment key runs and states its origin',async()=>{
  const key=dummyKey('headless-env');
  await hermetic(async h=>{
    const provider=await startFakeProvider({goodKey:key,models:[{id:'vendor/live-model-a',name:'Live Model A'}]});
    try{
      writeProviderRuntime(h.paths,{openrouter:`${provider.url}/api/v1`});
      const x=io();
      const code=await main(['--project',h.project,'--model',MODEL,'-p','hello','--json','--permission-mode','dontAsk','--timeout','60'],{io:x.api as any,createRuntime:(input:any)=>createCliRuntime({...input,repoRoot:REPO_ROOT,keyring:fakeKeyring()})});
      const parsed=JSON.parse(x.out.join(''));
      assert.equal(code,0,JSON.stringify(parsed));
      assert.equal(parsed.ok,true);
      assert.equal(parsed.result.text,'OK');
      assert.deepEqual(parsed.warnings,[`Key for ${label('openrouter')}: environment variable OPENROUTER_API_KEY, used without asking because this run is non-interactive.`]);
      assert.ok(provider.requests.some(r=>r.method==='POST'&&r.authorizedAs==='good'),'the environment key was used, without asking');
      assert.deepEqual(h.network.blocked,[]);
      assert.equal(x.out.join('').includes(key)||x.err.join('').includes(key),false,'the key is not in the output');
      await settle(h.root);
      assert.deepEqual(filesContaining(h.root,key),[],'nor in any file the run wrote');

      // stream-json carries the same statement as the first event, and the sequence stays contiguous from 1.
      const y=io();
      assert.equal(await main(['--project',h.project,'--model',MODEL,'-p','hello','--output-format','stream-json','--permission-mode','dontAsk','--timeout','60'],{io:y.api as any,createRuntime:(input:any)=>createCliRuntime({...input,repoRoot:REPO_ROOT,keyring:fakeKeyring()})}),0);
      const events=y.out.join('').trim().split('\n').map(line=>JSON.parse(line));
      assert.equal(events[0].type,'warning');assert.equal(events[0].data.code,'PROVIDER_KEY_ORIGIN');assert.equal(events[0].seq,1);
      assert.deepEqual(events.map((e:any)=>e.seq),events.map((_:any,i:number)=>i+1));
    }finally{await provider.close();}
  },{processEnv:{OPENROUTER_API_KEY:key}});
});

test('talos -p with a provider that has no key names it, exits as a key error and sends nothing',async()=>hermetic(async h=>{
  const provider=await startFakeProvider({goodKey:dummyKey('unused'),models:[]});
  try{
    writeProviderRuntime(h.paths,{openrouter:`${provider.url}/api/v1`});
    const x=io();
    const code=await main(['--project',h.project,'--model',MODEL,'-p','hello','--json'],{io:x.api as any,createRuntime:(input:any)=>createCliRuntime({...input,repoRoot:REPO_ROOT,keyring:fakeKeyring()})});
    const parsed=JSON.parse(x.out.join(''));
    assert.equal(parsed.error.code,'PROVIDER_KEY_MISSING');
    /* R2 (gate E8 / Q-R2-7): the one missing-key sentence is the JSON `message`. */
    assert.equal(parsed.error.message,`No API key for ${label('openrouter')}. Set OPENROUTER_API_KEY or run \`talos provider set-key openrouter\`.`);
    assert.equal(code,11);
    assert.equal(provider.requests.length,0);assert.deepEqual(h.network.blocked,[]);
  }finally{await provider.close();}
}));

test('the interactive entry withholds an environment key that the non-interactive entry uses',async()=>{
  const key=dummyKey('entries');
  await hermetic(async h=>{
    const common={projectRoot:h.project,paths:h.paths,repoRoot:REPO_ROOT,trustVerified:true,model:MODEL};
    const interactive=await createCliRuntimeContext({...common,keyring:fakeKeyring()});
    assert.equal(interactive.providerStore.getKey('openrouter'),null,'interactive: known, unused');
    assert.equal((await interactive.tuiCatalog.listProviders()).find((row:any)=>row.id==='openrouter')?.keySource,'environment-unanswered');
    // B1 slice 18, fix round: the entry states its mode explicitly, as `main` does for -p; a caller that forgets gets consent.
    const headless=await createCliRuntime({...common,keyring:fakeKeyring(),environmentKeys:'use'});
    assert.deepEqual(keyOriginForRun(await createCliRuntime({...common,keyring:fakeKeyring()}),MODEL)?.origin,'none','a factory left on its default withholds the key');
    assert.deepEqual(keyOriginForRun(headless,MODEL),{provider:'openrouter',label:label('openrouter'),required:true,origin:'environment',variable:'OPENROUTER_API_KEY',askedFirst:false});
  },{processEnv:{OPENROUTER_API_KEY:key}});
});

/*
 * F-H-001 (stress test of 0.5.3, S1): after `talos provider remove-key` (or `env-key --decline`) the variable is recorded as
 * declined and shown so, but the non-interactive entries handed the store the whole environment and `-p` sent the declined key
 * anyway ("used without asking"). An explicit no closes the variable for every entry, as TALOS_ENVIRONMENT_KEYS=consent does:
 * an entry can close what consent opened, never open what the person closed. An approved or unanswered variable is still used.
 */
test('F-H-001: a declined environment key is never used by -p; the run is refused before anything is sent',async()=>{
  const key=dummyKey('declined');
  await hermetic(async h=>{
    const provider=await startFakeProvider({goodKey:key,models:[{id:'vendor/live-model-a',name:'Live Model A'}]});
    try{
      writeProviderRuntime(h.paths,{openrouter:`${provider.url}/api/v1`});
      const consent=createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env:{OPENROUTER_API_KEY:key}});
      consent.answer('openrouter','no');
      const x=io();
      const code=await main(['--project',h.project,'--model',MODEL,'-p','hello','--json','--permission-mode','dontAsk','--timeout','60'],{io:x.api as any,createRuntime:(input:any)=>createCliRuntime({...input,repoRoot:REPO_ROOT,keyring:fakeKeyring()})});
      const parsed=JSON.parse(x.out.join(''));
      assert.equal(parsed.error?.code,'PROVIDER_KEY_MISSING',JSON.stringify(parsed));
      assert.equal(code,11);
      assert.equal(provider.requests.filter(r=>r.method==='POST').length,0,'nothing reaches the provider');
      const headless=await createCliRuntime({projectRoot:h.project,paths:h.paths,repoRoot:REPO_ROOT,trustVerified:true,model:MODEL,keyring:fakeKeyring(),environmentKeys:'use'});
      assert.equal(keyOriginForRun(headless,MODEL)?.origin,'none','the non-interactive store does not see the declined variable');
      /* the same variable with ANOTHER value is a new key: unanswered, so -p uses it as before */
      process.env.OPENROUTER_API_KEY=dummyKey('rotated');
      const rotated=await createCliRuntime({projectRoot:h.project,paths:h.paths,repoRoot:REPO_ROOT,trustVerified:true,model:MODEL,keyring:fakeKeyring(),environmentKeys:'use'});
      assert.equal(keyOriginForRun(rotated,MODEL)?.origin,'environment');
    }finally{await provider.close();}
  },{processEnv:{OPENROUTER_API_KEY:key}});
});
