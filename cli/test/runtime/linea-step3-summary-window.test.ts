/*
 * «One line», step 3 (11/11/2026, judge v1504): pin S3-1 BEFORE the threshold cure (soglia, 8125b5c89) changes the window of an
 * unknown model. When the soglia enters, the conversation's window falls back to the core's FINESTRA_PRUDENTE (96,000), so the
 * registry's `finestraTokenFn` stops answering null; `modelloRiassuntoFn` (talos-composition.ts:527) must keep reading the KNOWN window
 * of the light model (a separate function), or every summary lands on OpenRouter's free small model, whose window nobody knows
 * (review 1 of 0.6.13, S3-1). Its own process: the model profile's configured windows are per process (model-profile.ts `state`).
 * The composition is the one of desktop-adapter-wiring.test.ts (copied, not imported: that file's tests would run twice).
 */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
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

async function compose(config:Record<string,unknown>|null,extraModules:Record<string,unknown>={},{askPerson=false,statoCompattazione,registryExtras={},projectUntrusted=false}:{projectUntrusted?:boolean;askPerson?:boolean;statoCompattazione?:(id:string)=>unknown;registryExtras?:Record<string,unknown>}={}){
  const root=await mkdtemp(join(tmpdir(),'talos-adapter-wiring-'));roots.push(root);
  const paths=pathsUnder(root);
  if(config){mkdirSync(paths.configRoot,{recursive:true});writeFileSync(join(paths.configRoot,'config.json'),JSON.stringify({version:1,...config}));}
  const seen:{registry:any;owner:any;launch:any;turns:any[]}={registry:null,owner:null,launch:null,turns:[]};
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:(o:any)=>{seen.owner=o;return{talosLavora:async(input:any)=>{seen.turns.push(input);return{};},attrezziKernel:async()=>({base:[],estesi:[]})};},
    avviaSessione:async(input:any)=>{seen.launch=input;return{};},
    eseguiComandoDiretto:async()=>({ok:true}),
    separaFonteModello:(modello:string)=>{const at=modello.indexOf(':');if(at<=0)throw new Error('no provider');return{fonte:modello.slice(0,at),modelloRemoto:modello.slice(at+1)};},
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:(o:any)=>{seen.registry=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true}),...(statoCompattazione?{statoCompattazione}:{}),...registryExtras};},
    ...extraModules,
  };
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:paths as any,model:'m',env:{},modules,keyring:null,askPerson,...(projectUntrusted?{projectUntrusted:true}:{})});
  await seen.registry.avviaSessioneFn({x:1});
  /* the turn as the agent service hands it on: the registry's own window (null when it did not know it) and the network model */
  const turn=async(input:Record<string,unknown>)=>{await seen.launch.talosLavoraFn(input);return seen.turns.at(-1);};
  return{seen,turn,context};
}

const FREE_SMALL='liquid/lfm-2.5-2.6b:free';
const PROVIDERS={REGISTRO_FORNITORI:{openrouter:{id:'openrouter',modelloAusiliario:FREE_SMALL}}};

test('LINEA-3 S3-1: a conversation whose window is KNOWN (200,000) does not send its summaries to the free small model whose window nobody knows',async()=>{
  const {seen}=await compose({models:{'openrouter:vendor/big':{contextWindow:200_000,maxOutputTokens:8_000}}},PROVIDERS);
  assert.equal(seen.registry.finestraTokenFn('openrouter:vendor/big'),200_000,'the window of the conversation is the known one');
  assert.equal(seen.registry.finestraTokenFn(`openrouter:${FREE_SMALL}`),null,'nobody knows the window of the free small model');
  assert.equal(seen.registry.modelloRiassuntoFn('openrouter:vendor/big'),null,'the summary stays on the own model of the conversation, never the free small one');
});

test('LINEA-3 S3-1: the light model is used once its window is known',async()=>{
  const {seen}=await compose({models:{'openrouter:vendor/big':{contextWindow:200_000,maxOutputTokens:8_000},[`openrouter:${FREE_SMALL}`]:{contextWindow:32_000,maxOutputTokens:4_000}}},PROVIDERS);
  assert.equal(seen.registry.modelloRiassuntoFn('openrouter:vendor/big'),`openrouter:${FREE_SMALL}`);
});
