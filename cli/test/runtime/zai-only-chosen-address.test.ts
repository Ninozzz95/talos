/*
 * 14/10/2026, owner (CLI and desktop): the Z.AI key goes ONLY to the address the person chose; another address (the China
 * ones included) only when the person asks. The kernel probes every Z.AI address by default (09/10); the CLI hands its runtime
 * adapter `zaiSoloIndirizzo: true`, so nothing is probed and nothing is switched on its own (harness-ui zai-indirizzo.mjs).
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';

const REPO_ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const roots:string[]=[];
after(async()=>{for(const directory of roots)await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
function pathsUnder(root:string){return{configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'data','sessions'),logsRoot:join(root,'data','logs'),projectOverridesRoot:join(root,'data','projects'),queueRoot:join(root,'data','queues'),trust:{hooks:join(root,'trust','hooks'),mcp:join(root,'trust','mcp'),plugins:join(root,'trust','plugins'),projects:join(root,'trust','projects')}};}

test('the composed CLI asks the kernel runtime adapter to send the Z.AI key only to the chosen address',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-zai-only-'));roots.push(root);
  let adapterOpts:any=null;
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:(o:any)=>{adapterOpts=o;return{talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})};},
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async()=>({ok:true}),
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:()=>({ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})}),
  };
  await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:pathsUnder(root) as any,model:'m',env:{},modules,keyring:null});
  assert.equal(adapterOpts?.zaiSoloIndirizzo,true);
});

test('the auxiliary route (compaction, titles, the research judge) sends the Z.AI key only to the chosen address too',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-zai-only-aux-'));roots.push(root);
  let registryOpts:any=null;const routeOpts:any[]=[];
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    creaFetchMultiProvider:(_network:unknown,o:any)=>{routeOpts.push(o);return Object.assign(async()=>new Response('{}'),{eseguiConFallback:async(chiama:any)=>chiama({})});},
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async()=>({ok:true}),
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:(o:any)=>{registryOpts=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};},
  };
  await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:pathsUnder(root) as any,model:'m',env:{},modules,keyring:null});
  registryOpts.fetchModelloFn();
  assert.ok(routeOpts.length>=1,'the auxiliary route was built');
  for(const o of routeOpts)assert.equal(o?.zaiSoloIndirizzo,true);
});

/* A Z.AI key saved before 14/10, or one approved from ZAI_API_KEY, would go to the default address nobody chose: a session on a
   Z.AI model does not start until the person chose the address, and the refusal says how (nothing is sent). */
async function readinessWith(runtime:Record<string,unknown>){
  const root=await mkdtemp(join(tmpdir(),'talos-zai-ready-'));roots.push(root);
  let registryOpts:any=null;
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:(id:string)=>id==='zai'?runtime:{},hasKey:()=>true,listPublic:()=>[]}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async()=>({ok:true}),
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    REGISTRO_FORNITORI:{zai:{id:'zai',etichetta:'Z.AI'},deepseek:{id:'deepseek',etichetta:'DeepSeek'}},
    separaFonteModello:(model:string)=>({fonte:model.split(':')[0]}),
    creaProntoFn:()=>()=>({pronto:true}),
    createSessionRegistry:(o:any)=>{registryOpts=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};},
  };
  await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:pathsUnder(root) as any,model:'m',env:{},modules,keyring:null});
  return registryOpts.prontoFn;
}

test('a Z.AI session does not start before the person chose the address, and says how to choose it',async()=>{
  const pronto=await readinessWith({endpoint:'https://api.z.ai/api/paas/v4',endpointConfigured:false});
  const refused=pronto('zai:glm-5.3-flash');
  assert.equal(refused.pronto,false);
  assert.equal(refused.codice,'PROVIDER_ADDRESS_REQUIRED');
  assert.match(refused.messaggio,/talos provider configure zai --address plan/u);
  assert.match(refused.messaggio,/nothing was sent/u);
  assert.equal(pronto('deepseek:deepseek-chat').pronto,true,'another provider is not touched');
});

test('a Z.AI session starts once the person chose the address',async()=>{
  const pronto=await readinessWith({endpoint:'https://api.z.ai/api/coding/paas/v4',endpointConfigured:true});
  assert.equal(pronto('zai:glm-5.3-flash').pronto,true);
});
