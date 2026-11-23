/*
 * R5 CONTRACT (owner: lane R; stub written by the coordinator so both lanes compile). Owner decision Q-R5-3: a model's
 * context window comes from the registry rows, the provider's live list when it carries the fields, Ollama's /api/show, a
 * person's override (config `models.<provider:model>.contextWindow`) and the models.dev catalogue (one outbound request, no
 * key, 4 h cache). `null` means nobody knows it: the screen then says `ctx ?` and never invents a number (gate E1). Lane S
 * only CALLS modelProfile; lane R owns the body and may add loaders, never change this signature.
 *
 * R5a lane R — the body. `modelProfile` is synchronous (the screen calls it while drawing): it reads layers that the
 * composition fills and keeps fresh, highest first:
 *   1. `override`    the person's `models.<provider:model>.contextWindow` (and, optional, `.maxOutputTokens`), config/load.ts;
 *   2. `ollama-show` a local Ollama's own answer for the model (see `ollamaWindow`);
 *   3. `provider`    rows the provider's store keeps (`provider-runtime.json` `modelli`) and live catalogue rows that carry a
 *                    window (catalog-service.ts, e.g. OpenRouter's `context_length`);
 *   4. `registry`    the kernel registry's documented rows (`modelliNoti`, `modelliDiRiserva`: dated sources);
 *   5. `models.dev`  the kernel's catalogue adapter (model-catalog-models-dev.mjs), under gate E7 (see `createModelsDevLoader`).
 * The window comes from the highest layer that has one. The reserve is what the kernel sends as `max_tokens` once the
 * Context Engine prepares the request (talosHarness.mjs `preparedContext.measurement.responseReserve`): the person's own
 * `maxOutputTokens` when set, else the model's maximum output capped at RESPONSE_RESERVE_CAP (F-001, below), never more than
 * a quarter of the window. When no layer knows the output limit the reserve is Pi's default for a model without one, 16,384
 * (pi-mono packages/coding-agent/src/core/provider-composer.ts:225 `maxTokens: definition.maxTokens ?? 16384`, 2026-09-24),
 * under the same quarter.
 */
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

export type ModelProfileSource='registry'|'provider'|'ollama-show'|'override'|'models.dev';
export type ModelProfile={windowTokens:number;responseReserve:number;source:ModelProfileSource;date:string|null};
/** Per-million-token list prices and where they come from (gate Q-R5-5: a named price source, with its date). */
export type ModelPrice={inputPerMTok:number;outputPerMTok:number;cacheReadPerMTok:number|null;source:string;date:string|null};

type Layer={windowTokens:number|null;outputTokens:number|null;date:string|null};
type RowsFor=(provider:string)=>{runtime:any[];registry:any[]};
const DEFAULT_RESERVE=16_384;
/*
 * R5a (owner decision 2026-09-24, from the s22 acceptance run): the Context Engine runs only for a window of 64k tokens or
 * more. TALOS's own instructions and tools are about 11.1k tokens; the engine's input limit is the window minus the reserve
 * (a quarter of a small window) minus a 15 % heuristic margin (context-engine profiles.mjs:6), about 0.6 x the window: a 16k
 * window failed every turn (CTX_CONTEXT_OVERFLOW) and anything under ~40k compacts at once. Below this TALOS keeps its simple
 * mode (the kernel's path) and the screen says so once (tui/usage-view.ts smallWindowNotice).
 */
export const CONTEXT_ENGINE_MIN_WINDOW=64_000;

const state={
  rowsFor:(()=>({runtime:[],registry:[]})) as RowsFor,
  registry:{} as Record<string,any>,
  overrides:new Map<string,{windowTokens:number|null;outputTokens:number|null}>(),
  ollama:new Map<string,Layer>(),
  live:new Map<string,Layer&{price:ModelPrice|null}>(),
  modelsDev:new Map<string,Layer&{price:ModelPrice|null}>(),
};

function positiveInteger(value:unknown):number|null{return Number.isSafeInteger(value)&&Number(value)>0?Number(value):null;}
function positiveNumber(value:unknown):number|null{const n=typeof value==='string'&&value.trim()!==''?Number(value):value;return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;}
function keyOf(provider:string,model:string){const prefix=`${provider}:`;return `${provider}:${model.startsWith(prefix)?model.slice(prefix.length):model}`;}
function day(value:unknown):string|null{if(typeof value!=='string'||!value)return null;const match=/^\d{4}-\d{2}-\d{2}/u.exec(value);return match?match[0]:null;}
function today(now=Date.now()){return new Date(now).toISOString().slice(0,10);}

/** The composition's sources: the provider store's rows and the registry's, read live on every call (they are small). A new
 *  composition is a new runtime: what an earlier one learnt from the network (live lists, Ollama, models.dev) is dropped and
 *  learnt again (models.dev from its disk cache). */
export function configureModelProfiles({rowsFor,registry}:{rowsFor:RowsFor;registry:Record<string,any>}){
  state.rowsFor=rowsFor;state.registry=registry??{};
  state.overrides.clear();state.ollama.clear();state.live.clear();state.modelsDev.clear();
}
/** Test and restart hygiene: every layer back to empty. */
export function resetModelProfiles(){
  state.rowsFor=()=>({runtime:[],registry:[]});state.registry={};
  state.overrides.clear();state.ollama.clear();state.live.clear();state.modelsDev.clear();
}

/** `config.models` (validated by config/load.ts): `{"provider:model":{contextWindow,maxOutputTokens?}}`. */
export function setModelOverrides(models:unknown){
  state.overrides.clear();
  if(!models||typeof models!=='object'||Array.isArray(models))return;
  for(const [id,row] of Object.entries(models as Record<string,any>)){
    const windowTokens=positiveInteger(row?.contextWindow),outputTokens=positiveInteger(row?.maxOutputTokens);
    if(windowTokens===null&&outputTokens===null)continue;
    const split=splitModelId(id);if(!split)continue;
    state.overrides.set(keyOf(split.provider,split.model),{windowTokens,outputTokens});
  }
}

/** The provider part of a TALOS model id: a known registry prefix, else OpenRouter (model-destination.mjs:65-75). */
export function splitModelId(id:string):{provider:string;model:string}|null{
  if(typeof id!=='string'||!id.trim())return null;
  const cut=id.indexOf(':');
  if(cut>0){const provider=id.slice(0,cut);if(Object.hasOwn(state.registry,provider)||provider==='openrouter'||provider==='ollama'||provider==='local')return{provider,model:id.slice(cut+1)};}
  return{provider:'openrouter',model:id};
}
/** A local engine (the registry's `catalogo.fonte: 'runtime-locale'`: Ollama, LM Studio, the embedded runtime). */
export function isLocalProvider(provider:string|null|undefined):boolean{
  if(!provider)return false;
  if(provider==='local')return true;
  return state.registry[provider]?.catalogo?.fonte==='runtime-locale';
}

/** Rows from a provider's live catalogue (OpenRouter `/models`, a kernel probe list): those that carry a window. */
export function rememberProviderModelRows(provider:string,rows:readonly any[],now=Date.now()){
  for(const row of rows??[]){
    const raw=String(row?.id??row?.modelId??'').trim();if(!raw)continue;
    const windowTokens=positiveInteger(row?.context_length??row?.contextLength??row?.contextWindow);
    const outputTokens=positiveInteger(row?.top_provider?.max_completion_tokens??row?.maxOutputTokens??row?.max_output_tokens);
    const prompt=positiveNumber(row?.pricing?.prompt),completion=positiveNumber(row?.pricing?.completion),cacheRead=positiveNumber(row?.pricing?.input_cache_read);
    const price:ModelPrice|null=prompt!==null&&completion!==null?{inputPerMTok:prompt*1_000_000,outputPerMTok:completion*1_000_000,cacheReadPerMTok:cacheRead===null?null:cacheRead*1_000_000,source:`${provider} model list`,date:today(now)}:null;
    if(windowTokens===null&&outputTokens===null&&!price)continue;
    state.live.set(keyOf(provider,raw),{windowTokens,outputTokens,date:today(now),price});
  }
}

/** Ollama's own window for a model (see `ollamaWindow`). */
export function rememberOllamaWindow(provider:string,model:string,windowTokens:number|null,now=Date.now()){
  const key=keyOf(provider,model);
  if(windowTokens===null){state.ollama.delete(key);return;}
  state.ollama.set(key,{windowTokens,outputTokens:null,date:today(now)});
}

function registryLayers(provider:string,model:string):{provider:Layer|null;registry:Layer|null;price:ModelPrice|null}{
  let rows:{runtime:any[];registry:any[]}={runtime:[],registry:[]};
  try{rows=state.rowsFor(provider)??rows;}catch{/* a source that cannot be read is no source */}
  const same=(row:any)=>{const raw=String(row?.id??row?.modelId??'');return raw===model||raw===`${provider}:${model}`;};
  const layer=(row:any):Layer|null=>row?{windowTokens:positiveInteger(row.contextLength??row.contextWindow??row.max_context_length??row.maxInputTokens),outputTokens:positiveInteger(row.maxOutputTokens??row.max_output_tokens??row.outputTokenLimit),date:day(row.dataMetadati??row.data)}:null;
  const runtimeRow=(rows.runtime??[]).find(same),registryRow=(rows.registry??[]).find(same);
  const record=state.registry[provider];
  const own=registryRow?.prezzi;
  /* 0.6.13 (full suite, 22/10/2026): the provider's price list (`prezzi.fonte`, Z.ai's pricing page) stays the source; the
     registry's placeholder for «no provider-wide list», `'nessuna'` (DeepSeek since r4 75b8b2357), is never one: /context showed
     «source nessuna 2026-10-21» for DeepSeek Flash. Then the row's own `fonte` and date (DeepSeek's rows cite its pricing page; Z.ai's
     cite the model's page, which is why the provider's list comes first). A price is shown with the page it comes from, as models.dev
     and LiteLLM's price list keep it per model. */
  const named=(value:unknown)=>typeof value==='string'&&value.trim()!==''&&value.trim().toLowerCase()!=='nessuna'?value.trim():null;
  const listSource=named(record?.prezzi?.fonte);
  const price:ModelPrice|null=own&&positiveNumber(own.ingresso)!==null&&positiveNumber(own.uscita)!==null
    ?{inputPerMTok:positiveNumber(own.ingresso)!,outputPerMTok:positiveNumber(own.uscita)!,cacheReadPerMTok:positiveNumber(own.cache),source:listSource??named(registryRow?.fonte)??'TALOS provider registry',date:listSource?day(record?.prezzi?.data)??day(registryRow?.data):day(registryRow?.data)??day(record?.prezzi?.data)}
    :null;
  return{provider:layer(runtimeRow),registry:layer(registryRow),price};
}

export function modelProfile(input:{provider:string;model:string}):ModelProfile|null{
  const provider=typeof input?.provider==='string'?input.provider:'';const model=typeof input?.model==='string'?input.model:'';
  if(!provider||!model)return null;
  const layers=profileLayers(provider,model);
  const windowLayer=layers.find(([,layer])=>layer?.windowTokens);
  if(!windowLayer)return null;
  const [source,chosen]=windowLayer;const windowTokens=chosen!.windowTokens!;
  const responseReserve=reserveFor(layers,windowTokens).reserveTokens;
  if(responseReserve>=windowTokens)return null;
  return{windowTokens,responseReserve,source,date:chosen!.date};
}

/*
 * F-001 (owner, 30/09/2026): the reserve is also the `max_tokens` the kernel sends, so it is what TALOS asks for, not the
 * provider's ceiling. OpenRouter rows of 1,048,576 tokens advertise a 943,717-token maximum; reserving all of it left the
 * Context Engine no input budget (CTX_CONTEXT_TOO_SMALL before any model call). Hermes reserves the max_tokens it requests
 * (agent/context_compressor.py `_compute_threshold_tokens`, 65ad529), OpenCode caps the request at 32,000
 * (provider/transform.ts `OUTPUT_TOKEN_MAX`), Pi keeps 16,384. TALOS: the person's own `maxOutputTokens` as set; else the
 * smaller of the model's maximum and 32,000, never more than a quarter of the window; else Pi's 16,384 under the same quarter.
 */
export const RESPONSE_RESERVE_CAP=32_000;
export type ModelReserveEvidence={kind:'setting'|'model'|'capped'|'default';reserveTokens:number;modelMaxOutputTokens:number|null};
function reserveFor(layers:Array<[ModelProfileSource,Layer|null|undefined]>,windowTokens:number):ModelReserveEvidence{
  const setting=layers.find(([source,layer])=>source==='override'&&layer?.outputTokens)?.[1]?.outputTokens??null;
  const advertised=layers.find(([source,layer])=>source!=='override'&&layer?.outputTokens)?.[1]?.outputTokens??null;
  if(setting!==null)return{kind:'setting',reserveTokens:setting,modelMaxOutputTokens:advertised};
  const quarter=Math.max(1,Math.floor(windowTokens/4));
  if(advertised===null)return{kind:'default',reserveTokens:Math.min(DEFAULT_RESERVE,quarter),modelMaxOutputTokens:null};
  const reserveTokens=Math.max(1,Math.min(advertised,RESPONSE_RESERVE_CAP,quarter));
  return{kind:reserveTokens<advertised?'capped':'model',reserveTokens,modelMaxOutputTokens:advertised};
}
function profileLayers(provider:string,model:string):Array<[ModelProfileSource,Layer|null|undefined]>{
  const key=keyOf(provider,model);const bare=key.slice(provider.length+1);
  const fixed=registryLayers(provider,bare);const override=state.overrides.get(key);
  return[
    ['override',override?{windowTokens:override.windowTokens,outputTokens:override.outputTokens,date:null}:null],
    ['ollama-show',state.ollama.get(key)],
    ['provider',fixed.provider],
    ['provider',state.live.get(key)],
    ['registry',fixed.registry],
    ['models.dev',state.modelsDev.get(key)],
  ];
}
/** Where the reserve of `modelProfile` comes from, for /context: the person's setting, the model's own maximum, that maximum
 *  capped at RESPONSE_RESERVE_CAP (or a quarter of the window), or the default when no source knows the maximum. */
export function modelReserveEvidence(input:{provider:string;model:string}):ModelReserveEvidence|null{
  const profile=modelProfile(input);if(!profile)return null;
  return reserveFor(profileLayers(input.provider,input.model),profile.windowTokens);
}
/**
 * Whether the Context Engine accepts a window and reserve (context-engine/src/profiles.mjs `validateContextProfile` with its
 * most cautious, `heuristic` margin: max(1,024, 15 % of the window)). The composition hands the engine only profiles that fit,
 * so a reserve set too high turns the engine off for that model (TALOS's simple mode) instead of failing every turn with
 * CTX_CONTEXT_TOO_SMALL. rev-f001-response-reserve.test.ts compares this with the engine's own function on a grid of values.
 */
export function contextEngineProfileFits(windowTokens:number,responseReserve:number):boolean{
  if(!Number.isInteger(windowTokens)||windowTokens<=0||!Number.isInteger(responseReserve)||responseReserve<0)return false;
  const margin=Math.max(1024,Math.ceil(windowTokens*0.15));
  return windowTokens-responseReserve-margin>0;
}

/** Where the window of `modelProfile` comes from, for the context status's provenance: a row's own dated source URL when the
 *  registry or the provider's store names one, else the layer's name. */
export function modelProfileEvidence(input:{provider:string;model:string}):{source:string;date:string|null}|null{
  const profile=modelProfile(input);if(!profile)return null;
  if(profile.source==='registry'||profile.source==='provider'){
    let rows:{runtime:any[];registry:any[]}={runtime:[],registry:[]};
    try{rows=state.rowsFor(input.provider)??rows;}catch{/* no rows */}
    const bare=keyOf(input.provider,input.model).slice(input.provider.length+1);
    const row=[...(rows.runtime??[]),...(rows.registry??[])].find((candidate:any)=>{const raw=String(candidate?.id??candidate?.modelId??'');return raw===bare||raw===`${input.provider}:${bare}`;});
    const url=typeof row?.fonteMetadati==='string'?row.fonteMetadati:typeof row?.fonte==='string'?row.fonte:null;
    if(url)return{source:url,date:profile.date};
  }
  return{source:profile.source,date:profile.date};
}

/** The list price of a model from a NAMED source (registry, live list, models.dev), or null. Never invented. */
export function modelPrice(input:{provider:string;model:string}):ModelPrice|null{
  const provider=typeof input?.provider==='string'?input.provider:'';const model=typeof input?.model==='string'?input.model:'';
  if(!provider||!model||isLocalProvider(provider))return null;
  const key=keyOf(provider,model);const bare=key.slice(provider.length+1);
  return registryLayers(provider,bare).price??state.live.get(key)?.price??state.modelsDev.get(key)?.price??null;
}

/*
 * OLLAMA. The window Ollama runs a model with is NOT the model's trained maximum (`model_info.<arch>.context_length`, which
 * /api/show and /api/tags report): it is the Modelfile's `num_ctx`, else the server's default — "Context length to use unless
 * otherwise specified (default: 4k/32k/256k based on VRAM)" (ollama/ollama envconfig/config.go, 98acec40, 2026-09-15). A
 * loaded model reports the window it really has in /api/ps `context_length` (api/types.go `ProcessModelResponse`, d0c8cdb7,
 * 2026-09-18). So: `num_ctx` from /api/show `parameters` when set; else /api/ps for a loaded model; else unknown. The trained
 * maximum only caps the first. Same rules as the R4 local list (catalog-service.ts): no key, no redirect, capped, 3 s.
 */
const OLLAMA_TIMEOUT_MS=3_000,OLLAMA_MAX_BYTES=4*1024*1024;
async function readJsonCapped(response:Response):Promise<any>{
  if(!response.ok||!response.body){try{await response.body?.cancel();}catch{/* not read */}return null;}
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>OLLAMA_MAX_BYTES)return null;chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));}catch{return null;}
}
export async function ollamaWindow({root,model,fetchImpl,signal}:{root:string;model:string;fetchImpl:(url:string,init:RequestInit)=>Promise<Response>;signal?:AbortSignal}):Promise<number|null>{
  const base=String(root??'').trim().replace(/\/+$/u,'').replace(/\/v1$/u,'');
  if(!/^https?:\/\//iu.test(base))return null;
  const timeout=()=>signal?AbortSignal.any([signal,AbortSignal.timeout(OLLAMA_TIMEOUT_MS)]):AbortSignal.timeout(OLLAMA_TIMEOUT_MS);
  let trained:number|null=null;
  try{
    const show=await readJsonCapped(await fetchImpl(`${base}/api/show`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({model}),redirect:'error',signal:timeout()}));
    const info=show?.model_info&&typeof show.model_info==='object'?show.model_info:{};
    trained=positiveInteger(Object.entries(info).find(([name])=>name.endsWith('.context_length'))?.[1]);
    const numCtx=/(?:^|\n)\s*num_ctx\s+(\d+)\s*(?:\n|$)/u.exec(String(show?.parameters??''));
    if(numCtx){const value=positiveInteger(Number(numCtx[1]));if(value!==null)return trained!==null?Math.min(value,trained):value;}
  }catch{/* not reachable: unknown */}
  try{
    const ps=await readJsonCapped(await fetchImpl(`${base}/api/ps`,{method:'GET',headers:{accept:'application/json'},redirect:'error',signal:timeout()}));
    const row=(Array.isArray(ps?.models)?ps.models:[]).find((entry:any)=>entry?.name===model||entry?.model===model);
    const loaded=positiveInteger(row?.context_length);
    if(loaded!==null)return loaded;
  }catch{/* not reachable: unknown */}
  return null;
}

/*
 * MODELS.DEV, under gate E7: one outbound GET of https://models.dev/api.json, no key, no personal data; cached 4 h under the
 * data root by the kernel adapter itself (model-catalog-models-dev.mjs: `<dataRoot>/cache/models-dev-<hash>.json`, TTL 4 h,
 * ETag revalidation, schema-checked); this wrapper adds what E7 asks and the adapter does not do: `redirect:'error'`, a body
 * capped at 32 MiB, 15 s (the adapter's own timeout). OFF in test profiles (`provider/store.ts` `isTestProfile`:
 * TALOS_TEST_PROFILE=1 or NODE_TEST_CONTEXT) and when `TALOS_MODELS_DEV=off`: then nothing is imported and nothing is sent.
 */
export const MODELS_DEV_URL='https://models.dev/api.json';
export const MODELS_DEV_MAX_BYTES=32*1024*1024;
export function modelsDevFetch(fetchImpl:(url:string,init:RequestInit)=>Promise<Response>,maxBytes=MODELS_DEV_MAX_BYTES){
  return async(url:string,init:RequestInit={})=>{
    const response=await fetchImpl(url,{...init,redirect:'error'});
    const declared=Number(response.headers?.get?.('content-length'));
    if(Number.isFinite(declared)&&declared>maxBytes){try{await response.body?.cancel();}catch{/* refused */}throw Object.assign(new Error('MODELS_DEV_TOO_LARGE'),{code:'MODELS_DEV_TOO_LARGE'});}
    if(!response.body)return response;
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Object.assign(new Error('MODELS_DEV_TOO_LARGE'),{code:'MODELS_DEV_TOO_LARGE'});chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});}
    return new Response(Buffer.concat(chunks),{status:response.status,statusText:response.statusText,headers:response.headers});
  };
}
/* R5b (owner 2026-09-24 "in configurazione"): models.dev is off when the test profile runs, when TALOS_MODELS_DEV=off, or when
   the configuration says `catalog.modelsDev: false`; the reason is kept so `talos doctor` can say it. */
export type ModelsDevSwitch={enabled:boolean;reason:'on'|'config'|'environment'|'test'};
export const MODELS_DEV_CACHE_HOURS=4;
export function modelsDevSwitch({env,config,testProfile}:{env:Record<string,string|undefined>;config:{catalog?:{modelsDev?:boolean}}|null|undefined;testProfile:boolean}):ModelsDevSwitch{
  if(testProfile)return{enabled:false,reason:'test'};
  if(String(env.TALOS_MODELS_DEV??'').trim().toLowerCase()==='off')return{enabled:false,reason:'environment'};
  if(config?.catalog?.modelsDev===false)return{enabled:false,reason:'config'};
  return{enabled:true,reason:'on'};
}
export type ModelsDevLoader={enabled:boolean;load(provider:string):Promise<void>};
export function createModelsDevLoader({repoRoot,dataRoot,env,config,fetchImpl,testProfile}:{repoRoot:string;dataRoot:string;env:Record<string,string|undefined>;config?:{catalog?:{modelsDev?:boolean}}|null;fetchImpl:(url:string,init:RequestInit)=>Promise<Response>;testProfile:boolean}):ModelsDevLoader{
  if(!modelsDevSwitch({env,config,testProfile}).enabled)return{enabled:false,load:async()=>{}};
  let catalog:Promise<any>|null=null;const done=new Map<string,Promise<void>>();
  const open=()=>catalog??=import(pathToFileURL(join(repoRoot,'harness-ui','src','model-catalog-models-dev.mjs')).href)
    .then((m:any)=>m.createModelsDevCatalog({cartellaStore:dataRoot,url:MODELS_DEV_URL,fetchFn:modelsDevFetch(fetchImpl)}));
  return{
    enabled:true,
    load(provider:string){
      const known=done.get(provider);if(known)return known;
      const work=(async()=>{
        const result=await (await open()).ottieni(provider);
        if(!result?.disponibile)return;
        const date=day(result.aggiornatoAlle);
        for(const row of result.modelli??[]){
          const model=String(row?.modelId??'');if(!model)continue;
          const prices=row?.prezziPerMilione;const input=positiveNumber(prices?.input),output=positiveNumber(prices?.output);
          state.modelsDev.set(keyOf(provider,model),{windowTokens:positiveInteger(row.contextLength),outputTokens:positiveInteger(row.maxOutputTokens),date,
            price:input!==null&&output!==null?{inputPerMTok:input,outputPerMTok:output,cacheReadPerMTok:positiveNumber(prices?.cache_read),source:'models.dev',date}:null});
        }
      })().catch(()=>{done.delete(provider);});
      done.set(provider,work);return work;
    },
  };
}
