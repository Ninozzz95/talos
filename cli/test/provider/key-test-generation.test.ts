/*
 * B1 slice 18, fix round — conditions 2a, 2c and 7.
 *
 * - Only the KEY TEST may ask the kernel probe to generate (`consentiGenerazione:true`). The probe is spied at the module the
 *   composition loads, so every path that builds a probe is seen: listing providers, listing models, probing, and
 *   `talos provider test`. The provider on 127.0.0.1 counts the POSTs as the second witness.
 * - `talos provider set-key` states the one-token request BEFORE it reads the key, for the providers that get it and only for them.
 * - `talos provider test` exits 0 only when the provider answered `collegato`.
 * Real composition, real kernel store, registry and probe; in-memory keyring, temporary profile, dummy keys.
 */
import {providerLabelText} from '../../src/provider/provider-text.ts';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {runSubcommand} from '../../src/subcommands.ts';
import {composeTalosRuntime,loadModules} from '../../src/runtime/talos-composition.ts';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,startOneTokenProvider,writeProviderRuntime,type Hermetic} from './first-run-fixture.ts';

const src=path.join(REPO_ROOT,'harness-ui','src');
const load=(file:string)=>import(pathToFileURL(path.join(src,file)).href);
const REGISTRY=(await load('provider-registry.mjs')).REGISTRO_FORNITORI as Record<string,any>;
/* R2 (D-05): the screen shows the English provider label, mapped by id (provider-text.ts). */
const label=(id:string)=>providerLabelText(id,String(REGISTRY[id].etichetta));

/**
 * The kernel modules the composition loads (`loadModules`, the production loader), with only the probe factory wrapped by a spy.
 * ⛔ Integration of B1 slice 25: this used to rebuild the module list by hand, and a list kept by hand falls behind the loader. It
 *   had no `creaProntoFn`, so the session runtime's readiness below refused for having no kernel answer, not from the key store
 *   the test names (found by the coordinator's mutation K5: an unreadable kernel answer turned into "ready" started the session).
 */
async function spiedModules(calls:Array<{phase:string;id:string;consent:boolean;kind:'prova'|'elencaModelli'}>,phase:()=>string){
  const modules=await loadModules(REPO_ROOT);
  const createProviderProbe=modules.createProviderProbe;
  if(typeof createProviderProbe!=='function')throw new Error('the kernel does not expose createProviderProbe');
  return{
    ...modules,
    createProviderProbe:(deps:any)=>{
      const real=createProviderProbe(deps);
      return{
        prova:(id:string,options?:any)=>{calls.push({phase:phase(),id,consent:options?.consentiGenerazione===true,kind:'prova'});return real.prova(id,options);},
        elencaModelli:(id:string)=>{calls.push({phase:phase(),id,consent:false,kind:'elencaModelli'});return real.elencaModelli(id);},
      };
    },
  };
}

function cli(h:Hermetic,createRuntimeContext:(input:any)=>Promise<any>,positionals:string[],{json=true,secret}:{json?:boolean;secret?:string}={}){
  const out:string[]=[];const err:string[]=[];const order:string[]=[];
  const io:any={writeOut:(s:string)=>{out.push(s);order.push('out');},writeErr:(s:string)=>{err.push(s);order.push(`err:${s}`);},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>'',...(secret!==undefined?{readSecret:async()=>{order.push('prompt');return secret;}}:{})};
  const inv:any={command:'subcommand',interactive:false,outputFormat:json?'json':'text',verbose:false,color:false,project:h.project,positionals};
  return runSubcommand(inv,{io,repoRoot:REPO_ROOT,paths:h.paths,createRuntimeContext}).then(code=>({code,out:out.join(''),err:err.join(''),order}));
}

/*
 * B1 slice 25 — the five providers whose registry declares a minimal request (four OpenAI-chat providers and Z.ai's Anthropic port)
 * are all tested by the kernel's own one-token request. For each of them: the key test is the only call that passes
 * `consentiGenerazione`, and listing, probing, readiness (the screen's and the session runtime's) and `talos provider test` never do.
 */
const MINIMAL_PROVIDERS=Object.keys(REGISTRY).filter(id=>REGISTRY[id]?.destinazioneChat===true&&REGISTRY[id]?.sonda?.richiestaMinima);

test('only the key test asks the probe to generate: listing providers and models, probing, readiness and talos provider test never do',async()=>hermetic(async h=>{
  assert.deepEqual([...MINIMAL_PROVIDERS].sort(),['deepinfra','huggingface','novita','ollama-cloud','zai-anthropic']);
  const good=dummyKey('minimal-good');
  const messages=await startOneTokenProvider({goodKey:good,shape:'anthropic-messages'});const chat=await startOneTokenProvider({goodKey:good,shape:'openai-chat'});
  const fakeOf=(id:string)=>REGISTRY[id].wire==='anthropic-messages'?messages:chat;
  const posts=()=>[...messages.requests,...chat.requests].filter(r=>r.method==='POST').length;
  try{
    writeProviderRuntime(h.paths,Object.fromEntries(MINIMAL_PROVIDERS.map(id=>[id,`${fakeOf(id).url}/v1`])));
    const calls:Array<{phase:string;id:string;consent:boolean;kind:'prova'|'elencaModelli'}>=[];let phase='compose';
    const modules=await spiedModules(calls,()=>phase);const keyring=fakeKeyring();
    const createRuntimeContext=(input:any={})=>composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:input.model??'openai:gpt-5-mini',env:process.env,environmentKeys:input.environmentKeys??'consent',modules:modules as any,keyring});
    const context:any=await createRuntimeContext();

    phase='key-test';
    for(const id of MINIMAL_PROVIDERS){
      const saved=await context.tuiCatalog.setProviderKey(id,good);
      assert.equal(saved.outcome,'valid',`${id}: ${JSON.stringify({outcome:saved.outcome,message:saved.message})}`);
      assert.equal(saved.saved,true,`${id}: the key is saved on the kernel's verified acceptance`);
    }
    assert.equal(posts(),MINIMAL_PROVIDERS.length,'each key test sent its one POST');

    phase='list-providers';await context.tuiCatalog.listProviders();
    for(const id of MINIMAL_PROVIDERS){
      phase='provider-models';await context.tuiCatalog.providerModels(id);
      phase='list-models';await context.tuiCatalog.listModels({provider:id});await context.tuiCatalog.listModels({provider:id,refresh:true}).catch(()=>{});
      phase='probe';await context.tuiCatalog.probeProvider(id);
      phase='readiness';await context.tuiCatalog.chooseProvider(id);await context.tuiCatalog.readiness(`${id}:${REGISTRY[id].sonda.richiestaMinima.corpo.model}`);
      phase='provider-test';
      const tested=await cli(h,createRuntimeContext,['provider','test',id]);
      assert.equal(tested.out.includes(good),false,`${id}: the key is not printed`);
      assert.ok(calls.some(c=>c.phase==='provider-test'&&c.id===id&&c.kind==='prova'),`${id}: talos provider test went through the probe the spy sees`);
    }
    phase='list-models';await context.tuiCatalog.listModels({});
    // The session runtime's own readiness answers from the key store, before anything is sent: a provider with no key is refused.
    phase='runtime-readiness';
    await assert.rejects(context.runtime.start({projectRoot:h.project,prompt:'hi',model:'kimi:kimi-test',permissionMode:'default'}),(error:any)=>error?.code==='PROVIDER_KEY_MISSING'&&error?.message===`No API key for ${label('kimi')}. Set MOONSHOT_API_KEY or run \`talos provider set-key kimi\`.` /* R2 (gate E8 / Q-R2-7): the one sentence, the registry's first variable */,'a model whose provider has no key does not start, and the refusal says the key is missing');
    assert.equal(calls.filter(c=>c.phase==='runtime-readiness').length,0,'the runtime readiness never builds a probe');

    assert.deepEqual(calls.filter(c=>c.consent).map(c=>[c.phase,c.id]),MINIMAL_PROVIDERS.map(id=>['key-test',id]),'exactly one call per provider asked to generate, and each was its key test');
    assert.equal(posts(),MINIMAL_PROVIDERS.length,'no other path generated at any provider');
  }finally{await messages.close();await chat.close();}
}));

test('talos provider set-key states the one-token request before reading the key, for the providers that get it and only for them',async()=>hermetic(async h=>{
  const good=dummyKey('stated');
  const zai=await startOneTokenProvider({goodKey:good,shape:'anthropic-messages'});const chat=await startOneTokenProvider({goodKey:good,shape:'openai-chat'});
  const models=http.createServer((req,res)=>{res.writeHead(req.headers.authorization===`Bearer ${good}`?200:401,{'content-type':'application/json'});res.end(JSON.stringify({data:[]}));});
  await new Promise<void>(resolve=>models.listen(0,'127.0.0.1',()=>resolve()));
  try{
    const modelsUrl=`http://127.0.0.1:${(models.address() as any).port}`;
    writeProviderRuntime(h.paths,{'zai-anthropic':`${zai.url}/v1`,deepinfra:`${chat.url}/v1`,openrouter:`${modelsUrl}/api/v1`});
    const keyring=fakeKeyring();
    const createRuntimeContext=(input:any={})=>composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:input.model??'openai:gpt-5-mini',env:process.env,environmentKeys:input.environmentKeys??'consent',keyring});
    for(const provider of ['zai-anthropic','deepinfra']){
      const statement=`One message with a one-token limit is sent to ${label(provider)} to test the key and may use a small amount of credit.\n`;
      for(const json of [false,true]){
        const run=await cli(h,createRuntimeContext,['provider','set-key',provider],{json,secret:good});
        assert.equal(run.code,0,`${provider}: ${run.out}`);
        assert.equal(run.err,statement,`${provider} (${json?'json':'text'}): the statement, once, on stderr`);
        assert.ok(run.order.indexOf(`err:${statement}`)>=0&&run.order.indexOf(`err:${statement}`)<run.order.indexOf('prompt'),'stated before the key is read, so before anything is sent');
      }
    }
    const openrouter=await cli(h,createRuntimeContext,['provider','set-key','openrouter'],{json:false,secret:good});
    assert.equal(openrouter.code,0);assert.equal(openrouter.err,'','no one-token statement for a provider with an authenticated free check');
    assert.equal(zai.requests.length,2);assert.equal(chat.requests.length,2);
  }finally{await zai.close();await chat.close();await new Promise<void>(resolve=>models.close(()=>resolve()));}
}));

test('talos provider test exits 11 when the provider refuses the key and 0 when it answers collegato',async()=>hermetic(async h=>{
  let status=401;const seen:string[]=[];
  const server=http.createServer((req,res)=>{seen.push(String(req.method));res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(status===200?{data:[{id:'gpt-test'}]}:{error:{message:'status under test'}}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  try{
    writeProviderRuntime(h.paths,{openai:`http://127.0.0.1:${(server.address() as any).port}/v1`});
    const keyring=fakeKeyring();
    const createRuntimeContext=(input:any={})=>composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:input.model??'openai:gpt-5-mini',env:process.env,environmentKeys:input.environmentKeys??'consent',keyring});
    const context:any=await createRuntimeContext();
    context.providerStore.setKey('openai',dummyKey('provider-test'));
    const refused=await cli(h,createRuntimeContext,['provider','test','openai']);
    // R0: since `1fce022b1` (M5-A) `provider test` prints the control-plane profile; `lastHealth.state` maps `esito` one to one (`health.ts`).
    assert.equal(JSON.parse(refused.out).lastHealth.state,'auth-failed');
    assert.equal(refused.code,11,'a refused key is not a success');
    status=500;
    const failing=await cli(h,createRuntimeContext,['provider','test','openai']);
    assert.equal(JSON.parse(failing.out).lastHealth.state,'error');assert.equal(failing.code,11,'an error answer is not a success');
    status=200;
    const accepted=await cli(h,createRuntimeContext,['provider','test','openai']);
    assert.equal(JSON.parse(accepted.out).lastHealth.state,'available');
    assert.equal(accepted.code,0);
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    const offline=await cli(h,createRuntimeContext,['provider','test','openai']);
    assert.equal(JSON.parse(offline.out).lastHealth.state,'unreachable');assert.equal(offline.code,11,'unreachable is not a success');
    assert.deepEqual(seen,['GET','GET','GET'],'a read, never a generation');
  }finally{server.closeAllConnections?.();server.close();}
}));
