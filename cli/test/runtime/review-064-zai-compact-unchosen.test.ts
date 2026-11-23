/*
 * Review of 0.6.4 (bugfixer, 14/10/2026) — written RED by the bugfixer; the cures are in talos-composition.ts (B1).
 * «The Z.AI key goes ONLY to the address you chose» (CHANGELOG 0.6.4: «sends the key only there»). prontoFn refuses a run, and the
 * CLI's own doors (probe, model list, key test) go through `zaiDoor`. Two doors do not:
 *  - a manual /compact (`registry.compatta`) never asks prontoFn: the session runtime's `compactSession` → kernel `compatta` →
 *    Context Engine summary (`ownerRuntime.callContextModel`, bare fetch inside the kernel) or the kernel's own compaction
 *    (`compattaSessioneFn` → `auxiliaryNetwork`, bare fetch). With a key saved before 0.6.4 and no address chosen, the whole
 *    conversation and the key go to the store's DEFAULT Z.AI address.
 *  - `auxiliaryNetwork` calls `fetch`, not `zaiDoor`; `zaiSoloIndirizzo:true` only stops the kernel's probing, it does not refuse
 *    the unchosen default.
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
const UNCHOSEN={endpoint:'https://api.z.ai/api/paas/v4',endpointConfigured:false};

async function composeWith(extra:Record<string,unknown>){
  const root=await mkdtemp(join(tmpdir(),'talos-review-064-zai-'));roots.push(root);
  const seen:{registryOpts:any;network:any;kernelCompactions:string[]}={registryOpts:null,network:null,kernelCompactions:[]};
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'zai-key-saved-before-064',getRuntime:(id:string)=>id==='zai'?UNCHOSEN:{},hasKey:()=>true,listPublic:()=>[]}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    creaFetchMultiProvider:(network:unknown)=>{seen.network=network;return Object.assign(async()=>new Response('{}'),{eseguiConFallback:async(chiama:any)=>chiama({})});},
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async()=>({ok:true}),
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    REGISTRO_FORNITORI:{zai:{id:'zai',etichetta:'Z.AI'}},
    separaFonteModello:(model:string)=>({fonte:model.split(':')[0],modelloRemoto:model.split(':').slice(1).join(':')}),
    creaProntoFn:()=>()=>({pronto:true}),
    createSessionRegistry:(o:any)=>{seen.registryOpts=o;return{
      ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true}),
      elenca:()=>[{sessionId:'s-zai',provider:'cloud',modello:'zai:glm-5.3-flash'}],
      compatta:async(sessionId:string)=>{seen.kernelCompactions.push(sessionId);return{ok:true,compattato:true};},
    };},
    ...extra,
  };
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:pathsUnder(root) as any,model:'zai:glm-5.3-flash',env:{},modules,keyring:null});
  return{context,seen};
}

test('RED 0.6.4: /compact of a Z.AI conversation with no address chosen sends nothing (refused like a run)',async()=>{
  const {context,seen}=await composeWith({});
  let refusal:any=null;
  /* the registry's contract: a refusal is `{erroreAvvio, code}` (session-facade.ts `compact` turns it into the error) */
  try{const answer:any=await context.registry.compatta('s-zai');if(answer?.erroreAvvio)refusal=answer;}catch(error){refusal=error;}
  assert.deepEqual(seen.kernelCompactions,[],'the kernel compaction (Context Engine summary or the kernel\'s own) must not start: it sends the conversation and the key to the default Z.AI address');
  assert.equal(refusal?.code,'PROVIDER_ADDRESS_REQUIRED');
});

test('RED 0.6.4: the auxiliary route\'s network refuses a Z.AI address that was not chosen, before it leaves',async()=>{
  const {seen}=await composeWith({});
  seen.registryOpts.fetchModelloFn();
  assert.equal(typeof seen.network,'function','the auxiliary network was handed to the route');
  const original=globalThis.fetch;const sent:string[]=[];
  globalThis.fetch=(async(input:any)=>{sent.push(String(input?.url??input));return new Response('{}');}) as typeof fetch;
  let refusal:any=null;
  try{await seen.network('https://api.z.ai/api/paas/v4/chat/completions',{method:'POST',headers:{authorization:'Bearer zai-key-saved-before-064'},body:'{}'});}
  catch(error){refusal=error;}
  finally{globalThis.fetch=original;}
  assert.deepEqual(sent,[],'nothing may leave for the unchosen default address');
  assert.equal(refusal?.code,'PROVIDER_ADDRESS_REQUIRED');
});

test('review of 0.6.4 (B1): the Context Engine\'s summary goes out through the composition\'s door, and is still counted',async()=>{
  const {callSummaryModel}=await import('../../src/runtime/talos-composition.ts');
  const asked:any[]=[];let counted=0;
  const ownerRuntime={callContextModel:async(request:any)=>{asked.push(request);return{text:'summary'};}};
  const door=async()=>new Response('{}');
  await callSummaryModel({ownerRuntime,request:{provider:'zai',model:'glm-4.7-flash',messages:[]},summaryFetch:door,onSummaryRequest:()=>{counted+=1;}});
  assert.equal(asked[0]?.fetchDiRete,door,'the kernel is handed the door, not left with its bare fetch');
  assert.equal(asked[0]?.model,'glm-4.7-flash');
  assert.equal(counted,1);
  await callSummaryModel({ownerRuntime,request:{provider:'x',model:'y',messages:[]},onSummaryRequest:()=>{throw new Error('a counter');}});
  assert.equal('fetchDiRete' in asked[1],false,'no door given: the request as it was');
});
