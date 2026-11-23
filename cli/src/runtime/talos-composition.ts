import {existsSync} from 'node:fs';
import {CLI_VERSION} from '../version.ts';
import {providerLabelText} from '../provider/provider-text.ts';
import {importTalosModule} from './repo.ts';
import {fullAccessForSession,permissionForModel,permissionForModelWithNobody,withStartingMode} from './model-permission.ts';
import {ZAI_PROVIDER,zaiAddressChosen,zaiRequestAllowed} from '../provider/zai-addresses.ts';
import {COMPACT_AT_RANGE,compactionRatios,DEFAULT_COMPACT_AT_TOKENS,inputLimitOf} from './compaction-cap.ts';
import {auxiliaryModelFor,auxiliaryModelId} from './auxiliary-model.ts';
import {CHATGPT_PROVIDER,chatgptPlanHandle,keepLeftBehind,sayIfSlow,settleLeftBehind,TOKEN_WORK_NOTICE_MS,TOKEN_WORK_REPLACE_LIMIT_MS,writeExitNotice,type ChatgptPlanHandle} from '../provider/chatgpt-plan.ts';
import {createUsableModels} from './usable-models.ts';
import {contextEngineHostOptions} from './context-engine-options.ts';
import {t} from '../i18n/index.ts';
import {lstat} from 'node:fs/promises';
import {statSync} from 'node:fs';
/* R5a lane R: the runtime facts (S1-S7, owner decisions Q-R5-3…Q-R5-11). */
import {secretValuesFromEnvironment} from '../diagnostics/redact.ts';
import {isTestProfile} from '../provider/store.ts';
import {compactionEvent,continuationWords,createCliEventHub,createRunObserver,mcpStartFailedEvent,noticeEvent,RETRY_AFTER_MAX_MS,summaryRequestedEvent} from './provider-attempts.ts';
import {createToolOutputStore,pruneToolOutput} from './output-store.ts';
import {provideBundledRipgrep} from './repo.ts';
import {createReplayCoalescer,SCREEN_RESULT_LIMITS} from './replay-coalescer.ts';
import {withArchivableCapture} from './context-archive.ts';
import {PROJECT_CONFIG_FILES} from '../security/project-config-positions.ts';
import {networkOpenFor} from './session-modes.ts';
import {createPlanWindow} from './plan-window.ts';
import {tokenCountFetch} from './token-count-fetch.ts';
import {CONTEXT_ENGINE_MIN_WINDOW,configureModelProfiles,contextEngineProfileFits,createModelsDevLoader,modelProfile,modelProfileEvidence,modelReserveEvidence,ollamaWindow,rememberOllamaWindow,rememberProviderModelRows,setModelOverrides,type ModelsDevLoader} from './model-profile.ts';
import {commitSessionListIndex,probeSessionListIndexByEntry} from '../sessions/list-index.ts';import {cliProviderRegistry} from '../provider/cli-providers.ts';import {AsyncLocalStorage} from 'node:async_hooks';import {randomUUID} from 'node:crypto';import {rm,rmdir} from 'node:fs/promises';import {dirname,join} from 'node:path';import {pathToFileURL} from 'node:url';import type {CliPaths} from '../paths.ts';import {createSessionFacade} from './session-facade.ts';import {createFolderTrustCache} from './folder-trust.ts';import {CliRuntimeError} from './types.ts';import {openCredentialStore} from '../provider/store.ts';import {missingKeyText,useProviderRegistry} from '../provider/missing-key.ts';import {loadEffectiveConfig} from '../config/load.ts';import {openRouterRoutingFor,setOpenRouterRouting} from '../provider/openrouter-routing.ts';import {kernelDelegationOptions} from './agents-options.ts';import {guardKernelCallbacks} from './guarded-callbacks.ts';import {configSet} from '../config/commands.ts';import {createTuiCatalogService,keyBench,unusableKeyRefusal} from '../tui/catalog-service.ts';import {createGuardedPluginTrustVerifier,pluginReviewFromSnapshot,scanPluginPackage} from '../security/plugin-guard.ts';import {createTrustAuthority} from '../security/trust-authority.ts';import {createBrokeredKernelExecutor,type KernelTextHelpers} from './brokered-executor.ts';import {ensureSandboxRealpathPreload} from '../security/sandbox-node-realpath.ts';import type {ExecutionBroker} from '../security/execution-broker.ts';import {createCheckpointStore,type CheckpointHandle} from '../workspace/checkpoint-store.ts';import {developmentLog,developmentLogError} from '../diagnostics/development-log.ts';import {attachKeyOrigin,createEnvironmentKeyConsent,describeKeyOrigin,providerOfModel,type EnvironmentKeyMode} from '../provider/environment-keys.ts';import {createProviderControlPlane} from '../provider/control-plane.ts';
type RawKeyring={get(service:string,account:string):any;set(service:string,account:string,value:string):any;remove(service:string,account:string):any};
type Modules={
 leggiAttesaRichiestaDalFornitore?:(headers:unknown,now?:number)=>number|null;leggiRipristinoDelPiano?:(headers:unknown)=>number|null;createProviderCredentialStore:(x:any)=>any;createOwnerRuntimeAdapter:(x:any)=>any;creaFetchMultiProvider?:(fetchDiRete:any,options:any)=>any;compattaSessione?:(x:any)=>Promise<any>;riassumiPerCompattazione?:(x:any)=>Promise<any>;chiediAlModelloUnaVolta?:(x:any)=>Promise<string>;avviaSessione:(x:any)=>Promise<any>;eseguiComandoDiretto?:(x:any)=>Promise<any>;createSessionRegistry:(x:any)=>any;/** stage 3: the kernel's default extended tool list (session-registry.mjs), to leave the question tool out when nobody can answer */STRUMENTI_ESTESI_PREDEFINITI?:readonly string[];
 verificaTrustPlugin?:(x:any)=>Promise<boolean>;caricaPlugin?:(x:any)=>Promise<any>;fidaPlugin?:(x:any)=>Promise<any>;caricaHooks?:(x:any)=>Promise<any>;fidaHook?:(x:any)=>Promise<any>;eseguiHook?:(x:any)=>Promise<any>;caricaServerMcp?:(x:any)=>Promise<any>;fidaServerMcp?:(x:any)=>Promise<any>;preparaToolMcpPerSessione?:(x:any)=>Promise<any>;nomeEspostoMcp?:(serverId:string,toolName:string)=>string;preparaToolPluginPerSessione?:(x:any)=>Promise<any>;
 creaAiutoTalos?:(x:any)=>any;creaGuardaImmagine?:(x:any)=>any;createSearchSourceStore?:(x:any)=>any;creaTrasportoSenzaChiave?:()=>any;ENDPOINT_SENTINELLA_DUCKDUCKGO?:string;REGISTRO_FORNITORI?:Record<string,any>;createProviderProbe?:(x:any)=>any;separaFonteModello?:(modello:string)=>{fonte:string;modelloRemoto:string};creaProntoFn?:(x:{providerStore:any;chiaveApi:string|null})=>(modello:unknown)=>any;createChatImageStore?:(x:any)=>any
}
function remapService(s:string){return s.replace(/^talos-harness-/u,'talos-cli-');}
function contextProfileValue(value:unknown):number|null{return Number.isSafeInteger(value)&&Number(value)>0?Number(value):null;}
/** review of 0.6.4 (B1): one summary request of the Context Engine — counted (R5b), and through the composition's network door
 *  (the Z.AI address rule) instead of the kernel's bare fetch. */
export function callSummaryModel({ownerRuntime,request,summaryFetch,onSummaryRequest}:{ownerRuntime:any;request:any;summaryFetch?:((input:any,init?:any)=>Promise<Response>)|undefined;onSummaryRequest?:(()=>void)|undefined}){
  try{onSummaryRequest?.();}catch{/* a counter never stops a summary */}
  return ownerRuntime.callContextModel(summaryFetch?{...request,fetchDiRete:summaryFetch}:request);
}
export function createCliContextBridge({repoRoot,paths,registry,providerRegistry,providerStore,ownerRuntime,chatImageStore,separaFonteModello,prepareProfile,onSummaryRequest,onPrepared,compactAtTokens,summaryFetch}:{/** review of 0.6.4: the network door for the summary requests */summaryFetch?:(input:any,init?:any)=>Promise<Response>;/** 14/10/2026: the summary's cap from the configuration (null = none) */compactAtTokens?:()=>Promise<number|null>;onSummaryRequest?:()=>void;/** the engine prepared a request: `{sessionId, level1:{cleared,shortened}|null}` (13/10/2026, /context) */onPrepared?:(input:any)=>void;repoRoot:string;paths:CliPaths;registry:any;providerRegistry:Record<string,any>;providerStore:any;ownerRuntime:any;chatImageStore:any;separaFonteModello?:((model:string)=>{fonte:string;modelloRemoto:string});prepareProfile?:(provider:string,model:string)=>Promise<void>}){
 /*
  * ⭐ R5a lane R, S2 (owner decision Q-R5-3): the profile — window and reserve — comes from `modelProfile` (model-profile.ts),
  * which layers the person's override, a local Ollama's own window, the provider's rows, the registry's documented rows and
  * the models.dev catalogue. Before R5 only a registry or store row carrying BOTH a window and an output limit made a profile
  * (5 of the registry's 49 rows, all Z.ai), so for every other model the Context Engine stayed off: no 50 % rule, the kernel's
  * every-8-calls compaction and its silent 8,000-character cut instead (gate finding 2). A model with a known window now gets
  * the Context Engine. The risks of that switch, and what is done about each, are measured in r5a-r-context-engine.test.ts:
  * the token counter's preflight (below), the reserve the kernel sends as `max_tokens`, and the switch mid-session when a
  * window becomes known between two runs.
  */
 const profileForSelection=(selected:any)=>{
  const provider=typeof selected?.provider==='string'?selected.provider:null,model=typeof selected?.model==='string'?selected.model:null;
  if(!provider||!model)return null;
  if(contextProfileValue(selected.windowTokens)&&contextProfileValue(selected.responseReserve)&&selected.windowTokens>selected.responseReserve)return selected.windowTokens>=CONTEXT_ENGINE_MIN_WINDOW&&contextEngineProfileFits(selected.windowTokens,selected.responseReserve)?selected:null;
  const profile=modelProfile({provider,model});
  /* R5a owner decision: below 64k the Context Engine cannot hold TALOS's own instructions and tools; the simple mode stays. */
  /* F-001: a reserve that leaves the engine no input budget turns it off for this model (simple mode) instead of failing
     every turn with CTX_CONTEXT_TOO_SMALL; only the person's own maxOutputTokens can still be that large. */
  if(!profile||profile.windowTokens<CONTEXT_ENGINE_MIN_WINDOW||profile.windowTokens<=profile.responseReserve||!contextEngineProfileFits(profile.windowTokens,profile.responseReserve))return null;
  const evidence=modelProfileEvidence({provider,model});
  return{provider,model,windowTokens:profile.windowTokens,responseReserve:profile.responseReserve,profileEvidence:{source:evidence?.source??profile.source,date:evidence?.date??profile.date},reserveEvidence:modelReserveEvidence({provider,model})};
 };
 const profileForSession=(sessionId:string,session?:any)=>{
  session??=registry.leggiSessioneContesto?.(sessionId)??null;if(!session)return null;
  if(session.provider==='local')return null;
  let selected:any=null;try{selected=typeof separaFonteModello==='function'?separaFonteModello(String(session.modello??'')):null;}catch{selected=null;}
  if(!selected?.fonte||!selected?.modelloRemoto)return null;
  const profile=profileForSelection({provider:selected.fonte,model:selected.modelloRemoto});if(!profile)return null;
  return{...profile,requestOptions:session.reasoning==null?{}:{reasoning:structuredClone(session.reasoning)}};
 };
 /* R5a lane R: the asynchronous sources of a session's model (the override file, a local Ollama, models.dev) are brought up
    to date before the profile decides, each bounded by its own timeout; a source that does not answer leaves the profile as
    it was. */
 const prepareForSession=async(sessionId:string)=>{
  if(!prepareProfile)return;
  const session=registry.leggiSessioneContesto?.(sessionId)??null;if(!session||session.provider==='local')return;
  let selected:any=null;try{selected=typeof separaFonteModello==='function'?separaFonteModello(String(session.modello??'')):null;}catch{selected=null;}
  if(!selected?.fonte||!selected?.modelloRemoto)return;
  try{await prepareProfile(selected.fonte,selected.modelloRemoto);}catch{/* a source that fails is no source */}
 };
 let loaded:Promise<any>|null=null;
 const load=()=>loaded??=(async()=>{
  const contextRoot=join(repoRoot,'context-engine','src'),harnessRoot=join(repoRoot,'harness-ui','src');
  const [engineModule,storeModule,adapterModule,serviceModule,counterModule,contextRuntimeModule,compactionModule]=await Promise.all([
   import(pathToFileURL(join(contextRoot,'engine.mjs')).href),
   import(pathToFileURL(join(contextRoot,'node','sqlite-store.mjs')).href),
   import(pathToFileURL(join(harnessRoot,'context-provider-adapter.mjs')).href),
   import(pathToFileURL(join(harnessRoot,'context-desktop-service.mjs')).href),
   import(pathToFileURL(join(harnessRoot,'context-token-counters.mjs')).href),
   /* the Desktop's host values for the engine (context-engine-options.ts); both modules are already loaded by the registry */
   import(pathToFileURL(join(harnessRoot,'context-runtime.mjs')).href),
   import(pathToFileURL(join(harnessRoot,'kernel','compattazione-desktop.mjs')).href),
  ]);
  const store=storeModule.createSqliteContextStore({databasePath:join(paths.dataRoot,'context','context.sqlite')});
  const tokenCounter=counterModule.createContextTokenCounter({
   resolveProfile:async(model:any)=>{
    let runtime:any={};try{runtime=providerStore.getRuntime?.(model.provider)??{};}catch{runtime={};}
    let key:any=null;try{key=providerStore.getKey?.(model.provider)??null;}catch{key=null;}
    return{
     baseURL:runtime.endpoint??providerRegistry[model.provider]?.baseUrl,
     apiKey:key,
     nativeRequestBuilder:(request:any)=>counterModule.buildPreparedDesktopContextRequest(request,chatImageStore?{resolveImages:(messages:any[])=>chatImageStore.resolveMessages(messages)}:{}),
    };
   },
   /* the count a turn waits on is an estimate when it cannot be read, never a failed turn (runtime/token-count-fetch.ts) */
   fetchFn:tokenCountFetch(),
  });
  const adapter=adapterModule.createContextModelAdapter({
   resolveModel:({sessionModel,settings}:any)=>{
    const selected=settings?.model?.mode==='explicit'?settings.model:sessionModel;
    const profile=profileForSelection(selected);
    if(!profile)throw Object.assign(new Error('Context profile unavailable.'),{code:'CTX_MODEL_NOT_CONFIGURED'});
    return profile;
   },
   /* R5b (R5a open 2): every summary the Context Engine asks for is counted, so a turn can say how many were billed. */
   /* review of 0.6.4 (B1): the summary request through the composition's network door (the Z.AI address rule), not a bare fetch */
   callModel:(request:any)=>callSummaryModel({ownerRuntime,request,summaryFetch,onSummaryRequest}),
  });
  const engine=engineModule.createContextEngine({store,model:adapter,tokenCounter,...contextEngineHostOptions({runtime:contextRuntimeModule,compaction:compactionModule})});
  const service=serviceModule.createDesktopContextService({
   engine,store,
   readSession:(sessionId:string)=>registry.leggiSessioneContesto?.(sessionId)??null,
   isSessionEnabled:(sessionId:string)=>Boolean(profileForSession(sessionId)),
   resolveSessionModel:({sessionId,session}:any)=>{
    const profile=profileForSession(sessionId,session);
    if(!profile)throw Object.assign(new Error('Context profile unavailable.'),{code:'CTX_MODEL_NOT_CONFIGURED'});
    return profile;
   },
   onEvent:(input:any)=>registry.pubblicaEventoContesto(input),
   /* owner 13/10/2026 (the desktop's wiring, harness-ui/server.mjs:827 at dbae665ea): the counts of the engine's level 1 for the
      request being prepared, so /context can say what it was sent without */
   onPrepared:(input:any)=>{try{onPrepared?.(input);}catch{/* a count is an extra: never the turn */}try{registry.annotaPreparazioneContesto?.(input);}catch{/* the same */}},
  });
  await store.health();
  return{store,service,raffreddamentoCompattazione:engineModule.raffreddamentoCompattazione};
 })();
 /* 14/10/2026 (owner, «Tetto di serie, regolabile»): the trigger is the lower of half the input limit and `context.compactAtTokens`
    (200,000 by default, null for none), read at each turn as the model overrides are (runtime/compaction-cap.ts) */
 const ensureSettings=async(service:any,sessionId:string,profile?:any)=>{
  let cap:number|null=DEFAULT_COMPACT_AT_TOKENS;try{if(compactAtTokens)cap=await compactAtTokens();}catch{cap=DEFAULT_COMPACT_AT_TOKENS;}
  for(let attempt=0;attempt<2;attempt++){
   const snapshot=await service.request({sessionId,method:'GET',path:'/'});
   const currentTarget=typeof snapshot?.settings?.targetRatio==='number'?snapshot.settings.targetRatio:null;
   const {triggerRatio,targetRatio}=compactionRatios({inputLimit:inputLimitOf(profile),compactAtTokens:cap,currentTarget});
   /* 14/10/2026 (owner, «Il più economico dello stesso fornitore»): the conversation's summaries run on its provider's light model
      (runtime/auxiliary-model.ts), written in the engine's settings (its resolver refuses a model it was not told: CTX_MODEL_MISMATCH);
      a provider that declares none follows the conversation, as before */
   const light=profile?.provider&&profile?.model?auxiliaryModelFor({provider:String(profile.provider),model:String(profile.model)},providerRegistry):null;
   const model=light&&(light.model!==profile.model)&&profileForSelection(light)?{mode:'explicit',provider:light.provider,model:light.model}:{mode:'follow-session'};
   const sameModel=JSON.stringify(snapshot?.settings?.model??{mode:'follow-session'})===JSON.stringify(model);
   if(snapshot?.settings?.auto===true&&snapshot?.settings?.triggerRatio===triggerRatio&&snapshot?.settings?.targetRatio===targetRatio&&sameModel)return snapshot;
   try{
    await service.request({sessionId,method:'PATCH',path:'/settings',body:{expectedRevision:snapshot.revision,idempotencyKey:'cli-m6e-'+randomUUID(),patch:{auto:true,triggerRatio,targetRatio,model}}});
    return service.request({sessionId,method:'GET',path:'/'});
   }catch(error){if((error as any)?.code!=='CTX_STALE_REVISION'||attempt===1)throw error;}
  }
  return service.request({sessionId,method:'GET',path:'/'});
 };
 return{
  /* P12: `capture` archives only whole tool exchanges (context-archive.ts), so an interrupted turn cannot leave an
     unanswered call in the archive that the history then drops (CTX_HISTORY_DIVERGED on every later turn). */
  async hooks(input:any){await prepareForSession(input.sessionId);const profile=profileForSession(input.sessionId);if(!profile)return undefined;const {service}=await load();await ensureSettings(service,input.sessionId,profile);return withArchivableCapture(await service.createKernelHooks(input));},
  /* F-ENG-3: the messages the Context Engine archived for a session, for the kernel to resume a killed turn from its real
     exchanges (session-tail-recovery.mjs storiaDaArchivioDopoInterruzione). Asked only when a resumed history carries a
     recovery message; with no archive database yet, none is created. */
  async archivedOriginals(sessionId:string){
   try{await lstat(join(paths.dataRoot,'context','context.sqlite'));}catch{return null;}
   const {store}=await load();const messages:unknown[]=[];let afterSequence=0;
   for(;;){
    const page=await store.readOriginals({sessionId,afterSequence,limit:1000});
    for(const record of page)messages.push(record?.message);
    if(page.length<1000)return messages.length?messages:null;
    afterSequence=page.at(-1).sequence;
   }
  },
  async compact(input:any){await prepareForSession(input.sessionId);const profile=profileForSession(input.sessionId);if(!profile)return undefined;const {service}=await load();await ensureSettings(service,input.sessionId,profile);return service.compact(input);},
  /* C4: the Context Manager's page, the service's own routes; with no profile there is no engine for this conversation, and null says so */
  async manage(input:{sessionId:string;method:string;path?:string;body?:unknown}){await prepareForSession(input.sessionId);const profile=profileForSession(input.sessionId);if(!profile)return null;const {service}=await load();await ensureSettings(service,input.sessionId,profile);return service.request(input);},
  async status(sessionId:string){
   await prepareForSession(sessionId);
   const profile=profileForSession(sessionId);if(!profile)return{unavailableReason:'profile-unavailable'};
   const {store,raffreddamentoCompattazione}=await load();const snapshot=await store.readContextSnapshot({sessionId});
   const currentTarget=typeof snapshot?.settings?.targetRatio==='number'?snapshot.settings.targetRatio:null;
   /* 14/10/2026: the same rule the turn's hooks give the engine (half the input limit, at most the configured cap); read only */
   let cap:number|null=DEFAULT_COMPACT_AT_TOKENS;try{if(compactAtTokens)cap=await compactAtTokens();}catch{cap=DEFAULT_COMPACT_AT_TOKENS;}
   const {triggerRatio,targetRatio}=compactionRatios({inputLimit:inputLimitOf(profile),compactAtTokens:cap,currentTarget});
   const effective=snapshot??{revision:0,measurement:null,activeVersion:null};
   const compactionCooling=snapshot?raffreddamentoCompattazione(Array.isArray(snapshot.jobs)?snapshot.jobs:[],new Date().toISOString()):null;
   return{...effective,settings:{...(snapshot?.settings??{}),auto:true,triggerRatio,targetRatio},cliProfileEvidence:profile.profileEvidence??null,cliReserveEvidence:profile.reserveEvidence??null,compactionCooling};
  },
  async close(){if(!loaded)return;const {service,store}=await loaded;try{await service.close();}finally{await store.close();}},
 };
}

export function scopeCliKeyring(raw:RawKeyring|null|undefined){if(!raw)return null;return{get:(s:string,a:string)=>raw.get(remapService(s),a),set:(s:string,a:string,v:string)=>raw.set(remapService(s),a,v),remove:(s:string,a:string)=>raw.remove(remapService(s),a)};}
/** The kernel modules the product composes with. Exported so a test can observe one of them while every other stays the production one. */
export async function loadModules(repoRoot:string):Promise<Modules>{await provideBundledRipgrep();const src=join(repoRoot,'harness-ui','src');const [cred,owner,agent,sessions,plugins,search,duck,providerRegistry,probe,destination,readiness,chatImages,providerRetry,planLimits,helpTool,viewImage]=await Promise.all([import(pathToFileURL(join(src,'provider-credential-store.mjs')).href),import(pathToFileURL(join(src,'runtime-owner-adapter.mjs')).href),import(pathToFileURL(join(src,'agent-service.mjs')).href),import(pathToFileURL(join(src,'session-registry.mjs')).href),import(pathToFileURL(join(src,'plugin-registry.mjs')).href),import(pathToFileURL(join(src,'search-source-store.mjs')).href),import(pathToFileURL(join(src,'duckduckgo-search.mjs')).href),import(pathToFileURL(join(src,'provider-registry.mjs')).href),import(pathToFileURL(join(src,'provider-probe.mjs')).href),import(pathToFileURL(join(src,'model-destination.mjs')).href),import(pathToFileURL(join(src,'sessione-pronta.mjs')).href),import(pathToFileURL(join(src,'chat-image-attachments.mjs')).href),import(pathToFileURL(join(src,'provider-retry.mjs')).href),import(pathToFileURL(join(src,'chatgpt-limiti.mjs')).href),import(pathToFileURL(join(src,'kernel','aiuto-talos.mjs')).href),import(pathToFileURL(join(src,'guarda-immagine-ospite.mjs')).href)]);return{creaAiutoTalos:helpTool.creaAiutoTalos,creaGuardaImmagine:viewImage.creaGuardaImmagine,leggiAttesaRichiestaDalFornitore:providerRetry.leggiAttesaRichiestaDalFornitore,/* 0.6.6: when an exhausted ChatGPT plan window comes back, by the kernel's own header reader (chatgpt-limiti.mjs, «come Codex») */leggiRipristinoDelPiano:(headers:unknown)=>planLimits.limiteFinito(planLimits.leggiLimitiDelPiano(headers))?.tornaAlle??null,createProviderCredentialStore:cred.createProviderCredentialStore,createOwnerRuntimeAdapter:owner.createOwnerRuntimeAdapter,creaFetchMultiProvider:owner.creaFetchMultiProvider,compattaSessione:agent.compattaSessione,riassumiPerCompattazione:agent.riassumiPerCompattazione,chiediAlModelloUnaVolta:agent.chiediAlModelloUnaVolta,avviaSessione:agent.avviaSessione,eseguiComandoDiretto:agent.eseguiComandoDiretto,createSessionRegistry:sessions.createSessionRegistry,STRUMENTI_ESTESI_PREDEFINITI:sessions.STRUMENTI_ESTESI_PREDEFINITI,verificaTrustPlugin:plugins.verificaTrustPlugin,createSearchSourceStore:search.createSearchSourceStore,creaTrasportoSenzaChiave:duck.creaTrasportoSenzaChiave,ENDPOINT_SENTINELLA_DUCKDUCKGO:duck.ENDPOINT_SENTINELLA_DUCKDUCKGO,REGISTRO_FORNITORI:cliProviderRegistry(providerRegistry.REGISTRO_FORNITORI),createProviderProbe:probe.createProviderProbe,separaFonteModello:destination.separaFonteModello,creaProntoFn:readiness.creaProntoFn,createChatImageStore:chatImages.createChatImageStore};}
async function loadTrustSupport(repoRoot:string):Promise<Partial<Modules>>{
 const src=join(repoRoot,'harness-ui','src');const [plugins,hooks,mcp,mcpSession,pluginSession]=await Promise.all([import(pathToFileURL(join(src,'plugin-registry.mjs')).href),import(pathToFileURL(join(src,'hook-registry.mjs')).href),import(pathToFileURL(join(src,'mcp-registry.mjs')).href),import(pathToFileURL(join(src,'mcp-session.mjs')).href),import(pathToFileURL(join(src,'plugin-session.mjs')).href)]);
 return{caricaPlugin:plugins.caricaPlugin,fidaPlugin:plugins.fidaPlugin,caricaHooks:hooks.caricaHooks,fidaHook:hooks.fidaHook,eseguiHook:hooks.eseguiHook,caricaServerMcp:mcp.caricaServerMcp,fidaServerMcp:mcp.fidaServerMcp,preparaToolMcpPerSessione:mcpSession.preparaToolMcpPerSessione,nomeEspostoMcp:mcpSession.nomeEspostoMcp,preparaToolPluginPerSessione:pluginSession.preparaToolPluginPerSessione};
}
/**
 * ⭐ B1 slice 18 — THE ENVIRONMENT THAT REACHES THE CREDENTIAL STORE.
 *
 * `environmentKeys:'use'` hands the store the whole environment, as before: a non-interactive run
 * (`talos -p`, CI) uses a key it finds there and states where it came from.
 * `environmentKeys:'consent'` hands it the environment WITHOUT any provider-key variable whose current
 * value has not been approved in `/provider` (`provider/environment-keys.ts`). The default is
 * `consent`: a caller that forgets to choose gets the closed behaviour, not the open one.
 * ⛔ The store reads the environment once, when it is built, and the kernel keeps a reference to it.
 *   An answer given mid-session therefore rebuilds the store behind a forwarder whose identity never
 *   changes, so the kernel sees the approved key from the next request on.
 */
/** The kernel's host of the provider_* tools (fornitori-per-il-modello.mjs), for a store; null when this kernel has none. */
export async function providerExclusionsHost(repoRoot:string,providerStore:any,chatgptAccess:ChatgptPlanHandle['kernelFacade']=null):Promise<((options?:{automazioneDelGiro?:string|null})=>(name:string,args?:any,options?:{fase?:string})=>Promise<any>)|null>{
 const src=join(repoRoot,'harness-ui','src');
 try{
  const [host,lookup]=await Promise.all([import(pathToFileURL(join(src,'fornitori-per-il-modello.mjs')).href),import(pathToFileURL(join(src,'openrouter-fornitori.mjs')).href)]);
  if(typeof host.creaOspiteFornitori!=='function')return null;
  const kernelHost=host.creaOspiteFornitori({providerStore,...(typeof lookup.slugDelFornitore==='function'?{slugDelFornitoreFn:(query:any)=>lookup.slugDelFornitore(query)}:{}),accessoChatgpt:chatgptAccess});
  /* «Continue with ChatGPT» (13/10/2026): where the kernel's answer names the desktop's screens ("Settings, Model laboratory…"), the
     CLI says how it is done HERE. Only the status the model reads; the disconnect and its card are the kernel's own. */
  return(options?:{automazioneDelGiro?:string|null})=>{
   const run=kernelHost(options);
   return async(name:string,args?:any,toolOptions?:{fase?:string})=>{
    /* Decision 116 C, §8 (04/11/2026): the kernel's `sign_in` puts the desktop's and the phone's «Sign in and resume» card in the
       conversation. The CLI has no such card: its answer («the card is now in the conversation») would be false here, and the
       permission card would ask a yes for nothing. So the CLI answers it itself, with no card (preview `carta:false`, the kernel's
       own shape for «nothing to approve»): signing in is the person's command. Hermes: the Codex sign-in is a command of the person
       (hermes_cli/auth.py:2370 login_command, auth_codex.py:945), no tool of the model; OpenAI «Sign in with ChatGPT — errors and
       recovery»: on a confirmed disconnection, ask the user to sign in again. */
    if(name==='chatgpt_account'&&String(args?.action??'').trim().toLowerCase()==='sign_in'){
     const testo=chatgptAccess?t('key.chatgpt.tool.signIn'):t('key.chatgpt.tool.unavailable');
     return toolOptions?.fase==='anteprima'?{ok:true,carta:false,testo}:{ok:true,testo};
    }
    if(name==='chatgpt_account'&&String(args?.action??'').trim().toLowerCase()==='status'&&toolOptions?.fase!=='anteprima'){
     if(!chatgptAccess)return{ok:true,testo:t('key.chatgpt.tool.unavailable')};
     const state=chatgptAccess.stato();
     if(!state?.collegato)return{ok:true,testo:t('key.chatgpt.tool.notConnected')};
     if(!state.pianoAbilitato)return{ok:true,testo:t('key.chatgpt.tool.planNotEnabled',{who:state.email?` (${state.email})`:''})};
    }
    return run(name,args,toolOptions);
   };
  };
 }catch(error){if((error as NodeJS.ErrnoException)?.code==='ERR_MODULE_NOT_FOUND')return null;throw error;}
}
async function linkProviderExclusions(repoRoot:string,registry:any,providerStore:any,chatgptAccess:ChatgptPlanHandle['kernelFacade']=null){
 if(typeof registry?.collegaFornitori!=='function')return;
 const host=await providerExclusionsHost(repoRoot,providerStore,chatgptAccess);if(host)registry.collegaFornitori(host);
}
/* fifth review of 0.6.4 (S1): the store's writers rewrite what they hold in memory (the keyring's pool index, the whole
   provider-runtime.json): one that writes from a store read before another TALOS wrote the keyring puts the OLD state back — a key
   the person replaced came back in the very terminal where they replaced it, at the next rebuild. A writer runs on a store read
   from disk a moment before (`fresh`). Readers keep the cheap look (`current`). */
const STORE_WRITERS:ReadonlySet<string>=new Set(['setKey','clearKey','aggiungiChiave','rimuoviChiave','mettiInPanchina','setRuntime','resetEndpoint','impostaIndirizzoRilevato','impostaEsclusi','impostaDiSerie','impostaEsclusioni']);
function forwardingStore(current:()=>any,shape:any,fresh:()=>any=current):any{const out:Record<string,unknown>={};for(const name of Object.keys(shape??{})){if(typeof shape[name]==='function')out[name]=STORE_WRITERS.has(name)?(...args:unknown[])=>fresh()[name](...args):(...args:unknown[])=>current()[name](...args);}return Object.freeze(out);}
/** Form B, No (a): whatever was trusted one by one in the past, nothing of this folder passes. */
/** C6 and C6-bis of the contract «mai aspettare»: the person's choices in the kernel's shape. `conversation` as a backup only if the person wrote it (the owner: never by itself). */
export function summaryChoiceFrom(context:{summaryModel?:string|null;summaryBackup?:string|null}|undefined){
  const backup=context?.summaryBackup??null;const at=backup?backup.indexOf(':'):-1;
  return{modelloDelRiassunto:context?.summaryModel??null,riservaDelRiassunto:backup==='conversation'?'conversazione':backup?(at>0?{provider:backup.slice(0,at),model:backup.slice(at+1)}:{provider:'openrouter',model:backup}):null};
}
export function closedTrustAuthority<T extends object>(authority:T):T&{verifyScope:(scope:unknown)=>Promise<boolean>}{return{...authority,verifyScope:async()=>false};}
export async function composeTalosRuntime({repoRoot,projectRoot,paths,model,env=process.env,environmentKeys='consent',askPerson=false,modules,keyring,brokerFactory,projectUntrusted=false}:{/** Form B, No (a): nothing of this folder is loaded. */projectUntrusted?:boolean;repoRoot:string;projectRoot:string;paths:CliPaths;model:string;env?:Record<string,string|undefined>;environmentKeys?:EnvironmentKeyMode;/** stage 3: a person can answer the model's questions (the interactive screen); absent ⇒ closed */askPerson?:boolean;modules?:Modules;keyring?:RawKeyring|null;brokerFactory?:(options:{paths:{cacheRoot:string};platform:NodeJS.Platform})=>ExecutionBroker}){const m=modules??await loadModules(repoRoot);const trustM:Modules=modules?m:{...m,...await loadTrustSupport(repoRoot)};/*
  * R2 (gate E13, Q-R2-5): the store comes from the ONE resolver (`provider/store.ts`), `system` or `memory`, chosen by
  * TALOS_CREDENTIAL_STORE or `credentials.store`; a test profile that asks for `system` is refused here, before the native module
  * is resolved. An injected `keyring` (tests, `create-runtime.ts` input) is used as given. A configuration that cannot be read
  * leaves the choice to the variable and the default: the config layer reports its own error where the person looks.
  */
 let storeConfig:any=null;if(keyring===undefined){try{storeConfig=(await loadEffectiveConfig({paths,projectRoot,projectTrusted:!projectUntrusted})).value;}catch{storeConfig=null;}}
 const opened=keyring===undefined?openCredentialStore({repoRoot,scope:paths.dataRoot,env:{...process.env,...env},config:storeConfig}):null;
 const credentialStore=opened?{kind:opened.kind,source:opened.source,testProfile:opened.testProfile}:null;
 const raw=keyring===undefined?opened!.keyring:keyring;const cliKeyring=scopeCliKeyring(raw);
 const providerRegistry=m.REGISTRO_FORNITORI??{};
 /* R2 (E8): the missing-key sentence reads the label and the first variable from this registry. */
 useProviderRegistry(providerRegistry);const consent=createEnvironmentKeyConsent({dataRoot:paths.dataRoot,registry:providerRegistry,env});
 /* F-H-001: a non-interactive run uses the environment as before, but never a variable the person declined (remove-key, --decline). */
 const storeEnvironment=()=>environmentKeys==='use'?consent.environmentForUse():consent.environmentForStore();
 const buildStore=()=>{const built=m.createProviderCredentialStore({env:storeEnvironment(),keyring:cliKeyring,runtimeFile:join(paths.dataRoot,'provider-runtime.json')});built.loadFromKeyring?.();return built;};
 let currentStore=buildStore();
 /* review of 0.6.4 (064b-2/3): every read of the store first looks whether the files it is made of changed (three stats, no network):
    the status row, a check and the model list follow an address chosen in another TALOS, not only the next run */
 let followFiles:()=>void=()=>{};let readAgain:()=>void=()=>{};
 /* sixth review of 0.6.4 (B1): a `-p`, `session resume` or automation runner (`use`) keeps the store it read at start for its
    READS, but its writes too must start from the keyring as it is now: an automation runner up for hours benched a key from its
    start-time store and wrote the shared index back without a key the person had since added or replaced, everywhere. */
 const providerStore=environmentKeys==='use'?forwardingStore(()=>currentStore,currentStore,()=>{readAgain();return currentStore;}):forwardingStore(()=>{followFiles();return currentStore;},currentStore,()=>{readAgain();return currentStore;});
 const answerEnvironmentKey=(id:string,answer:'yes'|'no')=>{consent.answer(id,answer);const before=currentStore;currentStore=buildStore();carryEnvironmentBenches(before,currentStore);rememberCredentialFiles();};
 /*
  * 14/10/2026 (found by the bugfixer's s65 run): a key withdrawn by ANOTHER TALOS — an environment key it declined, a saved key it
  * removed — was still sent by this one, whose store was read at start (F-H-001 / F-S-002 closed it within one process). The other
  * process writes the consent record and the provider-state snapshot when it withdraws a key; before each run (prontoFn) the store
  * is built again when the consent record, the addresses (provider-runtime.json) or the snapshot changed. Reviews of 0.6.4:
  * an environment key's bench lives only in the store's memory, and a rebuild sent a benched key again (S2, 064b-1): the benches of
  * environment keys are carried into the store built again (`carryEnvironmentBenches`); a Z.AI address chosen or changed in another
  * TALOS never reached this one, which kept sending the key to the old address (064b-2/3): the addresses file is followed too.
  * Everything else the store holds is in those files. A saved key's bench lives in the keyring's pool index (a one-key credit bench
  * excepted: see `carryEnvironmentBenches`). Cost: three stats a run.
  */
 const credentialFiles=[join(paths.dataRoot,'provider-consent.json'),join(paths.dataRoot,'provider-runtime.json'),join(paths.cacheRoot,'provider-state.json')];
 /* an environment key benched in the store of before stays benched, until the same moment and for the same cause (its row is
    found by the key's fingerprint; a provider with a saved key is left alone: its bench is in the keyring, and a write there is not
    this rebuild's business) */
 /* sixth review of 0.6.4 (S1): a saved key of the store of before that the store just read does not have */
 const lostSavedKeys=(before:any,after:any)=>{
  let ids:string[]=[];try{ids=(before?.listPublic?.()??[]).map((row:any)=>String(row?.id??'')).filter(Boolean);}catch{return false;}
  for(const id of ids){
   try{
    const kept=new Set((after?.elencaPool?.(id)??[]).map((row:any)=>row?.impronta));
    if((before?.elencaPool?.(id)??[]).some((row:any)=>row?.origine!=='ambiente'&&!kept.has(row?.impronta)))return true;
   }catch{/* a provider that cannot be listed says nothing */}
  }
  return false;
 };
 const carryEnvironmentBenches=(before:any,after:any)=>{
  let ids:string[]=[];try{ids=(before?.listPublic?.()??[]).map((row:any)=>String(row?.id??'')).filter(Boolean);}catch{ids=[];}
  for(const id of ids){
   try{
    /* fourth review of 0.6.4 (B1): never a provider with a saved key. Its bench lives in the keyring's index, and carrying it wrote
       that index from a read: a key the person saved again in another TALOS (a top-up) was benched again for every TALOS. The one
       saved bench a rebuild loses — a one-key credit bench, reloaded as available by the kernel's BUG-25 migration in
       `loadFromKeyring` — costs one more refused request, the honest outcome BUG-25 chose; the migration is the engine's to fix. */
    const fresh=after?.elencaPool?.(id)??[];if(!fresh.length||fresh.some((row:any)=>row?.origine!=='ambiente'))continue;
    for(const old of before?.elencaPool?.(id)??[]){
     if(old?.stato!=='in-panchina'||!Number.isFinite(old?.inPanchinaFino))continue;
     const row=fresh.find((candidate:any)=>candidate?.impronta===old.impronta);
     if(row&&row.stato!=='in-panchina')after.mettiInPanchina?.(id,old.impronta,{classe:old.causa,resetAt:old.inPanchinaFino});
    }
   }catch{/* a bench that cannot be carried is lost, as before this cure: the provider refuses again */}
  }
 };
 const fingerprint=()=>credentialFiles.map(file=>{try{const s=statSync(file);return`${s.mtimeMs}:${s.size}`;}catch{return'-';}}).join('|');
 let knownCredentialFiles=fingerprint();
 function rememberCredentialFiles(){knownCredentialFiles=fingerprint();}
 const followCredentialsChangedElsewhere=()=>{if(environmentKeys==='use')return;const now=fingerprint();if(now===knownCredentialFiles)return;knownCredentialFiles=now;try{const before=currentStore;currentStore=buildStore();carryEnvironmentBenches(before,currentStore);}catch{/* the store of before stays: a read that fails withdraws nothing */}};/* at most one look every 200 ms: a screen reads the store many times in a row; before a run prontoFn looks at once */let lastFileLook=0;followFiles=()=>{const now=performance.now();if(now-lastFileLook<200)return;lastFileLook=now;followCredentialsChangedElsewhere();};/* fifth review of 0.6.4 (S1): before a write, the store as the keyring and the files hold it NOW */readAgain=()=>{const now=fingerprint();try{const before=currentStore;let built=buildStore();
  /* sixth review of 0.6.4 (S1): the system keyring answers «no entry» for ANY failed read (system-keyring.ts), and the store then
     falls back to the single legacy key: a writer would rewrite the pool index with the other saved keys gone. Saved keys missing
     may be such a failed read: the keyring is read ONCE MORE and that second read is used (eighth review, S1: whether or not a
     followed file changed — a `use` process sees «changed» for hours, and the second read costs only when keys look gone).
     ⛔ Seventh review (B1): never the store of before — a key removed elsewhere (its snapshot write failed, or came after the
     keyring) would be written back into the keyring for every TALOS. Two failed reads in a row can still drop the other saved
     keys from the index on that write (the engine falls back to the single legacy key); the keyring adapter calling every error
     «no entry» is the cause, for after 0.6.4. */
  if(lostSavedKeys(before,built))built=buildStore();
  knownCredentialFiles=now;currentStore=built;carryEnvironmentBenches(before,currentStore);}catch{/* the store of before stays */}};
 /* 0.6.13 (owner 21/10/2026: «la 0.6.13 è la compattazione»; «il kernel e i motori devono essere NON NEGOZIABILMENTE centralizzati»):
    the desktop's kernel adapter, the module the desktop runs (kernel-di-serie-desktop.mjs), in place of the bare kernel. It wraps
    only `talosLavora` and re-exports the rest: the turn compacts as the desktop's does (the task and the last requests kept, the
    summariser without tools, a failed Context Engine falling back instead of failing the turn, one retry on a full window); the
    window, the cap and the inactivity sink it needs are given below (`finestraTokenFn`, `talosLavoraConBroker`). */
 const kernel=join(repoRoot,'harness-ui','src','kernel','talosHarness.desktop-hotfix.mjs');
 /* «Continue with ChatGPT» (owner 13/10/2026; the desktop's wiring is harness-ui/server.mjs:168-171 and :302-306 at r4 de8f33317). The plan
    is opened at start only when a session is stored: with nobody signed in this is one keyring read and no kernel module. The token
    is asked a moment before each send and renewed when due; ⛔ never the API key in its place, which is another way of paying. */
 const chatgptPlan=chatgptPlanHandle({repoRoot,keyring:cliKeyring,dataRoot:paths.dataRoot});
 if(chatgptPlan.stored()){try{await chatgptPlan.load();}catch{/* said where the person looks: the provider is then not ready */}}
 const destinazioneModelloDeps={leggiChiave:(p:string)=>{try{return providerStore.getKey(p);}catch{return null;}},leggiRuntime:(p:string)=>{try{return providerStore.getRuntime(p);}catch{return{};}},localePronto:()=>false,
  leggiTokenDelPiano:async()=>{let plan=null;try{plan=await chatgptPlan.load();}catch{plan=null;}if(!plan)throw Object.assign(new Error('A ChatGPT account cannot be connected on this computer.'),{code:'CHATGPT_NON_DISPONIBILE'});return plan.accessToken();},
  registraUsoDelPiano:(entry:unknown)=>{chatgptPlan.loaded()?.recordUsage(entry);},registraLimitiDelPiano:(entry:unknown)=>{chatgptPlan.loaded()?.recordLimits(entry);}};
 const chatImageStore=typeof m.createChatImageStore==='function'?m.createChatImageStore({rootDir:join(paths.dataRoot,'chat-images')}):null;
 const ownerRuntime=m.createOwnerRuntimeAdapter({modulePath:kernel,providerStore,openRouterRuntimeFn:()=>{try{return providerStore.getRuntime('openrouter');}catch{return{timeoutSeconds:600};}},openRouterRoutingFn:(model:unknown)=>openRouterRoutingFor(model),destinazioneModelloDeps,/* 14/10 (owner): the Z.AI key only to the chosen address, never probed elsewhere */zaiSoloIndirizzo:true,...(chatImageStore?{resolveImagesFn:(messages:any[])=>chatImageStore.resolveMessages(messages)}:{})});
 let taskCatalogProvider=null;try{taskCatalogProvider=await ownerRuntime.taskCatalogProvider?.();}catch{taskCatalogProvider=null;}
 let searchSourceStore:any=null;let ricercaWebFn:any=undefined;if(m.createSearchSourceStore){searchSourceStore=m.createSearchSourceStore({env,keyring:cliKeyring,file:join(paths.dataRoot,'search-source.json')});const transport=m.creaTrasportoSenzaChiave?.();ricercaWebFn=()=>searchSourceStore.perKernel({trasportoSenzaChiave:transport,sentinellaDuckDuckGo:m.ENDPOINT_SENTINELLA_DUCKDUCKGO});}
 /* Form B, No (a): a hook, a connection or a plugin trusted one by one in the past does not load in a folder the person now said No to */
 const reviewedTrust=createTrustAuthority({projectRoot,trustRoot:paths.trust.projects});
 const trustAuthority=projectUntrusted?closedTrustAuthority(reviewedTrust):reviewedTrust;
 /* R2-F1 (cure 208 bis): the folder's trust for the kernel and the CLI's engine, read again before every person's send (folder-trust.ts) */
 const folderTrust=createFolderTrustCache({projectRoot,saidNo:projectUntrusted,read:()=>reviewedTrust.folderTrusted()});
 const verificaTrustHookFn=async({hookId}:{hookId:string})=>trustAuthority.verifyScope({kind:'hook',id:hookId});
 const verificaTrustMcpFn=async({serverId}:{serverId:string})=>trustAuthority.verifyScope({kind:'mcp',id:serverId});
 const verificaTrustPluginFn=createGuardedPluginTrustVerifier({projectRoot,inspectReview:()=>trustAuthority.inspect(),verifyTrusted:async({pluginId})=>trustAuthority.verifyScope({kind:'plugin',id:pluginId})});
 async function loadedPlugin(pluginId:string){
  if(typeof trustM.caricaPlugin!=='function')throw Object.assign(new Error('PLUGIN_REGISTRY_UNAVAILABLE'),{code:'PLUGIN_REGISTRY_UNAVAILABLE'});
  const loaded=await trustM.caricaPlugin({cartella:projectRoot});const plugin=loaded.plugin?.find((row:any)=>row.id===pluginId);if(!plugin)throw Object.assign(new Error('PLUGIN_NOT_FOUND'),{code:'PLUGIN_NOT_FOUND'});return plugin;
 }
 async function assertPluginAllowed(pluginId:string){
  const reviewed=await trustAuthority.inspect();const plugin=await loadedPlugin(pluginId);const expectedReview=pluginReviewFromSnapshot(reviewed,pluginId);
  const guard=await scanPluginPackage({projectRoot,plugin:{id:plugin.id,tools:plugin.tools??[],hooks:plugin.hooks??[]},expectedReview});
  if(guard.verdict==='dangerous')throw Object.assign(new Error('PLUGIN_DANGEROUS'),{code:'PLUGIN_DANGEROUS',guard});return{plugin,reviewed};
 }
 async function pluginIdForHook(hookId:string){
  if(typeof trustM.caricaPlugin!=='function')return null;
  const loaded=await trustM.caricaPlugin({cartella:projectRoot});
  for(const plugin of loaded.plugin??[])for(const hook of plugin.hooks??[])if(`plugin:${plugin.id}:${hook.id}`===hookId)return String(plugin.id);
  return null;
 }
 async function executePluginHookWithAuthority(input:any){
  const hookId=String(input?.hook?.id??'');const pluginId=await pluginIdForHook(hookId);
  if(!pluginId)return{consentito:false,motivo:'TALOS cannot resolve the plugin owner for this hook, so it was not executed.'};
  try{
   await assertPluginAllowed(pluginId);
   if(!await trustAuthority.verifyScope({kind:'plugin',id:pluginId}))return{consentito:false,motivo:'The plugin changed or is no longer trusted, so its hook was not executed.'};
  }catch{return{consentito:false,motivo:'TALOS could not verify this plugin package safely, so its hook was not executed.'};}
  if(typeof trustM.eseguiHook!=='function')return{consentito:false,motivo:'The plugin hook executor is unavailable, so the hook was not executed.'};
  return trustM.eseguiHook(input);
 }
 const statoTrustPluginFn=async({pluginId,hash}:{pluginId:string;hash:string})=>{
  const fidato=await verificaTrustPluginFn({cartellaTrust:'authority',pluginId,hash});if(fidato)return{fidato:true,motivo:'fidato',frase:null};
  const snapshot=await trustAuthority.inspect();const prefix=`.harness-ui-plugins/${pluginId}/`;const rows=snapshot.resources.filter(row=>row.kind==='plugin'&&row.relativePath.startsWith(prefix));
  const changed=rows.some(row=>row.state==='changed'||row.state==='removed');
  return{fidato:false,motivo:changed?'contenuto-cambiato':'mai-approvato',frase:changed?'The plugin content no longer matches the TALOS project trust record.':'This plugin is not trusted by the TALOS project authority.'};
 };
 /* R4 Q-R4-17: a folder trusted for this session only keeps nothing on disk — no mirror outside a run's own folder. */
 async function writeMcpMirror(serverId:string,hash:string){if(await trustAuthority.sessionGrant())return;const roots=await trustAuthority.compatibilityRoots();await rm(join(roots.mcp,`${serverId}.json`),{force:true});if(typeof trustM.fidaServerMcp==='function')await trustM.fidaServerMcp({cartellaTrust:roots.mcp,serverId,hash});}
 async function writePluginMirror(pluginId:string,hash:string){if(await trustAuthority.sessionGrant())return;const roots=await trustAuthority.compatibilityRoots();await rm(join(roots.plugins,`${pluginId}.json`),{force:true});if(typeof trustM.fidaPlugin==='function')await trustM.fidaPlugin({cartellaTrust:roots.plugins,pluginId,hash});}
 const fidaHookFn=async({hookId}:{hookId:string})=>{await trustAuthority.trustScope({kind:'hook',id:hookId});return{fidato:true};};
 const fidaServerMcpFn=async({serverId,hash}:{serverId:string;hash:string})=>{await trustAuthority.trustScope({kind:'mcp',id:serverId});await writeMcpMirror(serverId,hash);return{fidato:true};};
 const fidaPluginFn=async({pluginId,hash}:{pluginId:string;hash:string})=>{const review=await assertPluginAllowed(pluginId);await trustAuthority.trustScope({kind:'plugin',id:pluginId},{expected:review.reviewed});await writePluginMirror(pluginId,hash);return{fidato:true};};
 async function sessionCompatibility(){
  const base=await trustAuthority.compatibilityRoots();const launchId=randomUUID();
  const roots={hooks:base.hooks,mcp:join(base.mcp,'runs',launchId),plugins:join(base.plugins,'runs',launchId)};
  if(typeof trustM.caricaServerMcp==='function'&&typeof trustM.fidaServerMcp==='function'){
   const loaded=await trustM.caricaServerMcp({cartella:projectRoot});for(const server of loaded.server??[])if(await trustAuthority.verifyScope({kind:'mcp',id:server.id}))await trustM.fidaServerMcp({cartellaTrust:roots.mcp,serverId:server.id,hash:server.hash});
  }
  if(typeof trustM.caricaPlugin==='function'&&typeof trustM.fidaPlugin==='function'){
   const reviewed=await trustAuthority.inspect();const loaded=await trustM.caricaPlugin({cartella:projectRoot});for(const plugin of loaded.plugin??[]){const expectedReview=pluginReviewFromSnapshot(reviewed,plugin.id);const guard=await scanPluginPackage({projectRoot,plugin:{id:plugin.id,tools:plugin.tools??[],hooks:plugin.hooks??[]},expectedReview});if(guard.verdict!=='dangerous'&&await trustAuthority.verifyScope({kind:'plugin',id:plugin.id}))await trustM.fidaPlugin({cartellaTrust:roots.plugins,pluginId:plugin.id,hash:plugin.hash});}
  }
  /* After a session-only run the folders this run created go too, emptiest first; a folder another run still uses is not empty and stays. */
  const leftovers=[join(base.mcp,'runs'),join(base.plugins,'runs'),base.mcp,base.plugins,base.hooks,dirname(base.hooks),dirname(dirname(base.hooks))];
  const cleanup=async()=>{
   await Promise.all([rm(roots.mcp,{recursive:true,force:true}),rm(roots.plugins,{recursive:true,force:true})]);
   if(await trustAuthority.sessionGrant())for(const folder of leftovers)await rmdir(folder).catch(()=>{});
  };
  return{roots,cleanup};
 }

 /*
  * ⭐⭐⭐ B1 slice 8 — IL COMANDO DIGITATO DALLA PERSONA PASSA DAL BROKER.
  *
  * `createSessionRegistry` accetta da sempre `eseguiComandoDirettoFn` (session-registry.mjs L1329) e
  * `eseguiComandoDiretto` accetta da sempre `eseguiComandoSandboxatoFn` (agent-service.mjs L1975):
  * qui si usano quei due seam gia' esistenti invece di scrivere un secondo esecutore. Cosi' il
  * vocabolario di eventi, l'accorpamento dei pezzi e la cucitura in cronologia restano UNO SOLO.
  *
  * ⛔ `brokerFactory` resta FACOLTATIVO qui e il suo default resta `undefined`, cioe' «nessun
  *   broker consultato, comportamento di ripiego puro»: questa funzione e' PARAMETRICA e non
  *   sceglie.
  * ⭐ B1 fetta 12 — CHI SCEGLIE E' L'INGRESSO. `createCliRuntime`/`createCliRuntimeContext`
  *   (`create-runtime.ts`) passano ora il broker VERO (`createCliExecutionBroker`) per default,
  *   costruito UNA volta per runtime; chi compone puo' ancora sovrascriverlo. Chi legge questo
  *   commento non deve dedurne che il CLI giri senza broker: senza `brokerFactory` e' questa
  *   COMPOSIZIONE a girare senza, non il prodotto.
  * ⛔ Il kernel si carica PIGRAMENTE: nessun comando digitato, nessun costo all'avvio.
  */
 /*
  * ⭐ R5a lane R, S6 (owner decision Q-R5-10): a command's full output is kept in a private file of ITS session
  * (output-store.ts). The session is known where the command starts — a model run (`talosLavoraConBroker`, below) or the
  * person's `!` command (`shell`, below) — and reaches the executor through this async scope; a command outside any session
  * keeps no file, and its marker says so. Folders of sessions that no longer exist are removed at start.
  */
 const toolOutputScope=new AsyncLocalStorage<{sessionId:string|null}>();
 const toolOutputStore=createToolOutputStore({dataRoot:paths.dataRoot,secretValues:secretValuesFromEnvironment({...process.env,...env})});
 void pruneToolOutput({dataRoot:paths.dataRoot,sessionsRoot:paths.sessionsRoot}).catch(()=>{});
 /* R5a lane R, S3/S4: the CLI's own live facts per session (provider-attempts.ts), merged into `subscribe` below. */
 const cliEvents=createCliEventHub();
 const brokeredExecutor=createBrokeredKernelExecutor({
  keepFullOutput:async(text:string)=>{const sessionId=toolOutputScope.getStore()?.sessionId;return sessionId?toolOutputStore.save({sessionId,text}):null;},
  kernel:async()=>(await import(pathToFileURL(kernel).href)) as unknown as KernelTextHelpers,
  ...(brokerFactory?{
   broker:brokerFactory({paths:{cacheRoot:paths.cacheRoot},platform:process.platform}),
   /* F16 hardening, kept: the product asks for the verified AppContainer/BFS sandbox, never a weaker one, network denied.
      R0 lane S, owner decision 1 (2026-09-23): when no verified sandbox exists the command runs on the host, DECLARED
      (`⛶ host · not isolated` and why) instead of being refused; `true` here is the strict switch (gate E7). */
   network:'deny',
   requiredEnforcement:'windows-sandbox',
   requireVerifiedIsolation:false,
   /* F-E-001 (owner 11/10/2026): the person's Node programs inside the sandbox get the realpath fallback; `talos doctor` says so */
   sandboxNodePreload:ensureSandboxRealpathPreload(paths.cacheRoot),
  }:{}),
 });
 /* M1-E: model-owned shell uses the same CLI broker as the direct-command path.
    Broker assignment is last so runtime input cannot replace the product-selected executor. */
 const modelCheckpointStore=paths.checkpointsRoot?createCheckpointStore({rootDir:paths.checkpointsRoot,projectRoot}):null;
 /* D1 (stress test 03/10): a checkpoint that cannot be taken never blocks a tool, and is not remembered as a block for the rest
    of the process: the turn goes on without /undo and says so once; what a snapshot leaves out is said once per session. */
 const coverageSaid=new Map<string,string>();
 const modelCheckpointErrors=new Map<string,unknown>();
 /* 0.6.9 (stress test of 0.6.8; owner 17/10/2026 «un avviso chiaro»): a trusted MCP server that does not start was silent, on the
    screen and in `-p`, and the model only met «unknown tool». The kernel's preparation names them (`falliti`, mcp-session.mjs) and
    drops them after (agent-service.mjs); the CLI keeps them from its own wrapper (prepareMcpWithAuthority, below) and says them on
    the run that follows, in the session's events, as Codex says «MCP client for `x` failed to start». The desktop's kernel event
    `talos.mcp-avvio` replaces this when it lands. Held in the async scope of ONE start (avviaSessioneFn below), never keyed by
    the folder: delegations run in their parent's folder, up to ten at once, and their preparation would overwrite or take the
    parent's failures between its preparation and its run (the desktop's review of 0.6.9). */
 const mcpStartScope=new AsyncLocalStorage<{failures:ReadonlyArray<{serverId?:unknown;errore?:unknown}>|null}>();
 const mcpStartNotices=(failures:ReadonlyArray<{serverId?:unknown;errore?:unknown}>)=>failures.map(row=>{
  const id=String(row?.serverId??'?');const raw=row?.errore instanceof Error?row.errore.message:typeof row?.errore==='string'?row.errore:String((row?.errore as any)?.message??row?.errore??'');
  /* the bugfixer's review of 0.6.9 (N1): a reason that ends with its own full stop made «…mean.. Its tools» */
  const reason=raw.replace(/\s+/gu,' ').trim().slice(0,240).replace(/[.\s]+$/u,'');
  return mcpStartFailedEvent(id,reason);
 });
 /*
  * 0.6.13: what the desktop's adapter needs from its host to compact at the right point.
  *  - The window and output limit of the model a turn sends to (the registry's `leggiFinestraToken`/`leggiLimiteUscita`, and the
  *    turn below), from the same profile the Context Engine uses (model-profile.ts: the person's override, a local Ollama's own
  *    window, the provider's rows, the registry, models.dev). Unknown ⇒ null, and the adapter keeps its 200,000 cap: OpenCode's
  *    window for an unknown model is the same 200,000 (packages/core/src/session/compaction.ts:99), Codex and Hermes fall back to
  *    their configured limit. The output limit is the person's `maxOutputTokens`, else the model's own maximum.
  *  - The person's `context.compactAtTokens` as the adapter's cap (`tettoCompattazioneToken`, r4 75b8b2357), as Hermes hands its
  *    configured cap to the compressor (agent/context_compressor.py threshold_tokens_cap) and Codex reads auto_compact_token_limit
  *    (codex-rs/protocol/src/openai_models.rs:525). «No cap» (null) is the top of the range when the window is known, so 0.75 of
  *    the window decides; with no window the adapter's own 200,000 stays, never a conversation that is never compacted.
  */
 const networkModelRoute=(modelloPerRete:unknown)=>{
  if(typeof modelloPerRete!=='string'||!modelloPerRete||typeof m.separaFonteModello!=='function')return null;
  let selected:any=null;try{selected=m.separaFonteModello(modelloPerRete);}catch{selected=null;}
  return selected?.fonte&&selected?.modelloRemoto?{provider:String(selected.fonte),model:String(selected.modelloRemoto)}:null;
 };
 const finestraTokenFn=(modelloPerRete:unknown):number|null=>{const route=networkModelRoute(modelloPerRete);if(!route)return null;try{return modelProfile(route)?.windowTokens??null;}catch{return null;}};
 const limiteUscitaFn=(modelloPerRete:unknown):number|null=>{
  const route=networkModelRoute(modelloPerRete);if(!route)return null;
  let reserve:ReturnType<typeof modelReserveEvidence>=null;try{reserve=modelReserveEvidence(route);}catch{reserve=null;}
  return reserve?.kind==='setting'?reserve.reserveTokens:reserve?.modelMaxOutputTokens??null;
 };
 /* the last value read, for the registry's synchronous `tettoCompattazioneFn`: read at start, then again at every turn and every
    Context Engine decision, as the model overrides are; a configuration that cannot be read keeps the value of before */
 let compactAtTokensRead:number|null=DEFAULT_COMPACT_AT_TOKENS;
 /* the sessions this process ran a turn of: on the screen's exit their end-of-turn summary still on its way is waited for (close) */
 const sessionsRun=new Set<string>();const END_OF_TURN_SUMMARY_EXIT_LIMIT_MS=5_000;
 /* r4 06b9ed101 (asked by the CLI): the registry's end-of-turn summary and the adapter's own summaries on the provider's light model,
    as the Context Engine's since 14/10 (owner, «Il più economico dello stesso fornitore»; runtime/auxiliary-model.ts). null = the
    conversation's own model: a provider that declares none, or the conversation already on it. The kernel takes the smaller of the
    two windows, and the conversation's model when the light one cannot hold even the smallest summary request. */
 /* Review 1 of 0.6.13 (S3-1): the light model only when the CLI knows its window, the gate the Context Engine's own choice has
    (`profileForSelection`). With its window unknown the kernel measured the summary on the conversation's window: OpenRouter's
    light model is a small free one, and a summary sized for a 1M conversation would fail on it every time. */
 const modelloRiassuntoFn=(modelloPerRete:unknown):string|null=>{
  if(typeof modelloPerRete!=='string'||!modelloPerRete)return null;
  const light=auxiliaryModelId(modelloPerRete,providerRegistry);
  return light!==modelloPerRete&&finestraTokenFn(light)!==null?light:null;
 };
 const compactAtTokensSetting=async():Promise<number|null>=>{
  try{const cap=(await loadEffectiveConfig({paths,projectRoot,projectTrusted:!projectUntrusted})).value.context?.compactAtTokens;compactAtTokensRead=cap===undefined?DEFAULT_COMPACT_AT_TOKENS:cap;}
  catch{/* the value of before stays */}
  return compactAtTokensRead;
 };
 await compactAtTokensSetting();
 const capFor=(cap:number|null,finestraToken:number|null)=>cap??(finestraToken!==null?COMPACT_AT_RANGE[1]:null);
 /* r4 ac98c6588: the registry's own threshold (the end-of-turn summary) with the same cap as the turn, so the two cannot differ */
 const tettoCompattazioneFn=(modelloPerRete:unknown):number|null=>capFor(compactAtTokensRead,finestraTokenFn(modelloPerRete));
 const compactionInputFor=async(kernelInput:any)=>{
  /* the registry reads the window before the turn's Context Engine hooks bring the model's sources up to date (a local Ollama's
     window, models.dev): a window it did not know is read again here, after them */
  const finestraToken=contextProfileValue(kernelInput?.finestraToken)??finestraTokenFn(kernelInput?.modello);
  const limiteUscitaToken=contextProfileValue(kernelInput?.limiteUscitaToken)??limiteUscitaFn(kernelInput?.modello);
  const tettoCompattazioneToken=capFor(await compactAtTokensSetting(),finestraToken);
  return{...(finestraToken!==null?{finestraToken}:{}),...(limiteUscitaToken!==null?{limiteUscitaToken}:{}),...(tettoCompattazioneToken!==null?{tettoCompattazioneToken}:{})};
 };
 const talosLavoraConBroker=async(runtimeInput:any)=>{
  const {checkpointSessionId,checkpointOperation,...kernelInput}=runtimeInput??{};
  const operation=checkpointOperation==='resume'||checkpointOperation==='fork'?checkpointOperation:'start';
  const checkpointState:{promise:Promise<CheckpointHandle|null>|null}={promise:null};
  const beforeMutation=async(azione:any)=>{
   if(!modelCheckpointStore)return;
   if(!checkpointState.promise){
    const started=performance.now();
    developmentLog('checkpoint.lazy.begin',{operation,sessionId:checkpointSessionId??null,actionType:azione?.tipo??null},'debug','runtime-composition');
    checkpointState.promise=modelCheckpointStore.begin({operation,...(typeof checkpointSessionId==='string'&&checkpointSessionId?{sessionId:checkpointSessionId}:{})})
     .then(handle=>{developmentLog('checkpoint.lazy.ready',{operation,sessionId:checkpointSessionId??null,checkpointId:handle.id,durationMs:performance.now()-started},'info','runtime-composition');
      if(runSession&&handle.coverageGap&&coverageSaid.get(runSession)!==handle.coverageGap){coverageSaid.set(runSession,handle.coverageGap);cliEvents.emit(runSession,noticeEvent(`/undo: ${handle.coverageGap}`));}
      return handle;})
     .catch(error=>{recordCheckpointFailure(error);developmentLogError('checkpoint.lazy.failure',error,{operation,sessionId:checkpointSessionId??null,actionType:azione?.tipo??null,durationMs:performance.now()-started},'runtime-composition');
      if(runSession)cliEvents.emit(runSession,noticeEvent(`This turn runs without /undo: the checkpoint could not be taken (${String((error as any)?.code??'CHECKPOINT_FAILED')}).`));
      return null;});
   }
   await checkpointState.promise;
  };
  let result:any;let runError:unknown=null;
  /*
   * ⭐ R5a lane R, S3/S4/S7 (owner decisions Q-R5-4, Q-R5-6, Q-R5-11): the run's observer wraps the innermost transport the
   *   owner adapter uses (`input.fetchDiRete`, runtime-owner-adapter.mjs:1193, the global fetch until now) and receives the
   *   kernel's retry waits (G02, the unified kernel's contract: the cap `attesaRitentaMassimaMs`, 60 s by Q-R5-6, and the
   *   `provider-retry` reports on `onGiro`; the R5a names `retryAfterMaxMs`/`onRetryWait` are gone); the unified kernel always marks
   *   its cut of a tool result in English (`toolResultCutMarker` is gone, output-store.ts `KERNEL_CUT_MARKER`). Assigned after
   *   the runtime input, like the executor, so input cannot remove them.
   */
  const runSession=typeof checkpointSessionId==='string'&&checkpointSessionId?checkpointSessionId:null;
  if(runSession){modelCheckpointErrors.delete(runSession);sessionsRun.add(runSession);}
  const startScope=mcpStartScope.getStore();const failedMcp=startScope?.failures;
  if(startScope&&failedMcp){startScope.failures=null;if(runSession)for(const event of mcpStartNotices(failedMcp))cliEvents.emit(runSession,event);}
  const recordCheckpointFailure=(error:unknown)=>{if(runSession)modelCheckpointErrors.set(runSession,error);};
  const observer=runSession?createRunObserver({sessionId:runSession,hub:cliEvents,readRequestedWait:m.leggiAttesaRichiestaDalFornitore??null,readPlanReset:m.leggiRipristinoDelPiano??null,baseFetch:typeof kernelInput.fetchDiRete==='function'?kernelInput.fetchDiRete:(input:any,init?:any)=>fetch(input,init)}):null;
  /* G02: the unified kernel reports each retry wait on `onGiro` (`provider-retry`); the observer reads it, then the session's
     own `onGiro` gets it unchanged. The kernel already isolates a failing listener (chiamaConRitenta `notifica`). */
  /* Owner 09/10/2026 («Segue il modo + si chiede»): in Full access every command of the run reaches the network; in the other modes
     only a command the person allowed (the kernel sets rete:true after the yes). Read per command, so a mode changed mid-turn counts. */
  const executorForRun=(command:string,folder:string,options:any={})=>brokeredExecutor(command,folder,networkOpenFor(runSession)?{...options,rete:true}:options);
  const kernelOnGiro=kernelInput.onGiro;
  /* F-ENG-4 (owner 09/10/2026, «Lo dice e continua»): each automatic continuation is said in the conversation. */
  const sayContinuation=(evento:any)=>{
   const words=runSession?continuationWords(evento):null;
   if(runSession&&words)cliEvents.emit(runSession,noticeEvent(words));
  };
  const onGiro=observer?(evento:any)=>{observer.onProviderRetry(evento);observer.onCompaction(evento);sayContinuation(evento);return typeof kernelOnGiro==='function'?kernelOnGiro(evento):undefined;}:kernelOnGiro;
  /* F-015: the wrapper hands every argument on (guarded-callbacks.ts), copiaInLibreria included. */
  const guardedCallbacks=guardKernelCallbacks(kernelInput,beforeMutation);
  const compaction=await compactionInputFor(kernelInput);
  /* 0.6.13: the adapter's record of a turn silent for 45 s (creaTelemetriaStallo) goes to the development log; its default is
     `console.warn`, which the TUI counts as a warning and `-p` prints on stderr. Assigned after the input, like the executor. */
  const onStallo=(record:any)=>developmentLog('kernel.stall',{sessionId:runSession,stage:typeof record?.stage==='string'?record.stage:null,stalledMs:Number.isFinite(record?.stalledMs)?record.stalledMs:null},'warning','runtime-composition');
  try{
   /* Review 1 of 0.6.13 (S2-4): the owner runtime keys OpenRouter's `session_id` on the conversation (`talos-s-<sha256>`,
      runtime-owner-adapter.mjs `chiaveDiSessione`); without it the provider saw the prefix fingerprint, which changes with the tool
      list and after a summary. The kernel reads nothing else from it (only `chiaveDiSessione` there). */
   result=await toolOutputScope.run({sessionId:runSession},()=>ownerRuntime.talosLavora({...kernelInput,...(runSession?{checkpointSessionId:runSession}:{}),...guardedCallbacks,...compaction,onStallo,
    ...(observer?{fetchDiRete:observer.fetchDiRete,onGiro}:{}),attesaRitentaMassimaMs:RETRY_AFTER_MAX_MS,
    /* Owner 09/10/2026 («Avvisa, poi chiede o ferma»): the kernel's guard against going round in circles across rounds. */
    guardiaGiriInTondo:true,
    /* R1 of the desktop review (09/10/2026): the kernel offers `network` and asks for it only when the host closes the network;
       the CLI broker runs every command with network:'deny' (F16), so it declares it. Without a broker nothing is closed. */
    reteChiusaDallOspite:Boolean(brokerFactory),
    primaDiMutazioneFn:beforeMutation,eseguiComandoSandboxatoFn:executorForRun}));
  }catch(error){runError=error;observer?.announceFailure(error);}
  const pendingCheckpoint=checkpointState.promise;
  if(pendingCheckpoint){
   let handle:CheckpointHandle|null=null;
   try{handle=await pendingCheckpoint;}catch{/* begin failure was already logged/refused at the action boundary */}
   if(handle){
    const started=performance.now();
    try{await handle.finalize();developmentLog('checkpoint.lazy.finalized',{operation,sessionId:checkpointSessionId??null,checkpointId:handle.id,durationMs:performance.now()-started},'info','runtime-composition');}
    catch(error){recordCheckpointFailure(error);if(runSession)cliEvents.emit(runSession,noticeEvent(`/undo cannot go back before this turn: its checkpoint could not be finished (${String((error as any)?.code??'CHECKPOINT_FAILED')}).`));developmentLogError('checkpoint.lazy.finalize_failure',error,{operation,sessionId:checkpointSessionId??null,checkpointId:handle.id,durationMs:performance.now()-started},'runtime-composition')}
   }
  }
  if(runError)throw runError;
  return result;
 };
 /*
  * ⭐ B1 slice 24 — COMPACTION AND THE RESEARCH JUDGE REACH THE PROVIDER OF THE MODEL THEY NAME.
  *
  * ⭐ B1 slice 25 — KEPT, BY MEASUREMENT, AFTER CLI-REQ-05 LANDED. The kernel at e7b3a1b6 (`harness-ui/` from ba420a95) now
  *   names the session's own model when it compacts (`session-registry.mjs:4502-4514`, `modelloDiSessionePerRete` at `:145`) and
  *   hands both calls `fetchDiRete: fetchModelloFn()` (`:4513`, and the judge through `creaChiediAlModelloGiudice`, `:224-229`).
  *   Slice 24's eleven tests (`test/runtime/auxiliary-provider-route.test.ts`), measured on both routes, hermetic:
  *   - these two functions injected, with `prontoFn` and `fetchModelloFn` wired: 11 of 11 pass;
  *   - the two functions and the compaction scope removed in favour of the kernel's route (`fetchModelloFn` = the guarded route
  *     below): 6 of 11. Failing: no key and an unapproved environment key end `{ok:true, compattato:false}` instead of
  *     `PROVIDER_KEY_MISSING` (the kernel swallows the failed call, `kernel/talosHarness.mjs:260-265`); the kernel is handed the
  *     OpenRouter key (`chiaveFn`) instead of the placeholder, so a request the route did not rewrite is not refused; a local
  *     session answers `compattato:false` instead of a refusal, and a compaction outside the session runtime is sent; two
  *     compactions overlap. ⇒ The injection stays. `fetchModelloFn` is wired to the same guarded route (`registry`, below), so
  *     no kernel path that asks for it reaches a bare `fetch`; the two functions here keep building their own route, because
  *     they report the code it raised before the network.
  *
  * Kernel lines relied on, read at 5e05de8e:
  *  - `session-registry.mjs:4217` `compatta()` calls `compattaSessioneFn({messaggiFinali, modello, chiave})`, and `:1712-1716` the
  *    research judge calls `chiediAlModelloUnaVoltaFn({modello, chiave, prompt})`; the defaults (`:1326`, `:1564`) are
  *    `agent-service.mjs:1905` `compattaSessione` and `:1946` `chiediAlModelloUnaVolta`, which hand `fetchDiRete` to `chiamaConRitenta`.
  *  - `kernel/talosHarness.mjs:1249-1253` `chiamaConRitenta` runs the call inside `fetchDiRete.eseguiConFallback` when it exists;
  *    otherwise `:1308` posts to the fixed `https://openrouter.ai/api/v1/chat/completions` with the key it was given.
  *  - `runtime-owner-adapter.mjs:654` `creaFetchMultiProvider`: only WITH a `providerStore` does it return `eseguiConFallback`
  *    (`:660`, and without it an OpenRouter model goes back to the kernel's own address, `:552`); `:669` a request whose JSON body
  *    has no string `model`, or whose URL is not `/chat/completions`, reaches the network untouched; `:673-675` a provider that
  *    requires a key and has none throws `PROVIDER_KEY_MISSING` before the network; `:710-712` OpenRouter too goes to its
  *    configured endpoint, and `:589` the destination's headers replace the kernel's; `:766-770` a failed call is rethrown as
  *    `PROVIDER_REQUEST_ERROR`, which drops the code raised before the network.
  *  - `model-destination.mjs:122-189` `risolviDestinazioneModello` takes endpoint and key from the model's prefix.
  *  - `kernel/talosHarness.mjs:247-256` `compattaConversazione` swallows a failed call and answers `compattato:false`.
  * Measured with a probe on this tree before writing (recording fetch, no network, dummy keys): the routed DeepSeek judge and
  *   compaction reached `<configured endpoint>/chat/completions` with the DeepSeek key and model `deepseek-flash`, an OpenRouter
  *   model reached the configured OpenRouter endpoint with the OpenRouter key; with the DeepSeek key removed nothing was sent, the
  *   judge failed `PROVIDER_REQUEST_ERROR` and compaction answered `compattato:false`; a body without a model reached the network
  *   layer at the fixed OpenRouter address carrying the credential the kernel was given.
  *
  * Hence four rules:
  *  1. The kernel never receives the OpenRouter key for these calls, only a per-runtime placeholder; the route replaces it with
  *     the destination provider's key, and the network layer REFUSES any request that still carries the placeholder, i.e. one
  *     the route did not rewrite. Nothing reaches the fixed address by falling through.
  *  2. A missing route (a kernel without `creaFetchMultiProvider`, or one that returns no `eseguiConFallback`) is a refusal,
  *     never the registry's default.
  *  3. When the call fails, the code the route raised before the network is the one reported (only for the codes below, whose
  *     messages the kernel or this file wrote: an upstream error keeps the kernel's public message, P-K).
  *  4. An explicit compaction whose model call failed FAILS with that error, instead of reporting "already compact".
  * ⛔ The environment-key consent of slice 18 holds by construction: keys come only from `providerStore`, the consent-filtered
  *   forwarder above, so an unapproved environment key is not visible to these calls either.
  */
 const unroutedCredential=`talos-cli-unrouted-${randomUUID()}`;
 const PRE_NETWORK_CODES=new Set(['PROVIDER_KEY_MISSING','PROVIDER_RUNTIME_INVALID','MODEL_DESTINATION_INVALID','LOCAL_RUNTIME_NOT_READY','AUXILIARY_CALL_NOT_ROUTED']);
 const auxiliaryNetwork=(input:any,init:any={})=>{
  let unrouted=true;
  try{const bearer=`Bearer ${unroutedCredential}`;unrouted=new Headers(init?.headers??undefined).get('authorization')===bearer||(typeof input?.headers?.get==='function'&&input.headers.get('authorization')===bearer);}catch{unrouted=true;}
  if(unrouted)return Promise.reject(new CliRuntimeError('AUXILIARY_CALL_NOT_ROUTED','An auxiliary model request was not routed to its provider, so it was not sent.'));
  /* review of 0.6.4 (B1): the kernel's own compaction goes out here too: through the CLI's Z.AI door, never to an address not chosen */
  return zaiDoor(input,init);
 };
 const auxiliaryFailure=(error:any,modello:unknown)=>{
  if(error?.code!=='PROVIDER_KEY_MISSING')return error;
  const prefix=providerOfModel(String(modello??''));const provider=prefix&&Object.hasOwn(providerRegistry,prefix)?prefix:'openrouter';
  /* R2 (E8 / Q-R2-7): the one missing-key sentence; the code PROVIDER_KEY_MISSING is what the screen maps. */
  return new CliRuntimeError('PROVIDER_KEY_MISSING',missingKeyText(provider),{provider});
 };
 const auxiliaryRoute=()=>{
  const unavailable=()=>new CliRuntimeError('AUXILIARY_ROUTE_UNAVAILABLE','This TALOS kernel cannot route compaction or the research judge to the session provider, so nothing was sent.');
  if(typeof m.creaFetchMultiProvider!=='function')throw unavailable();
  const route=m.creaFetchMultiProvider(auxiliaryNetwork,{dipendenze:destinazioneModelloDeps,providerStore,/* 14/10 (owner): the Z.AI key only to the chosen address */zaiSoloIndirizzo:true});
  if(typeof route?.eseguiConFallback!=='function')throw unavailable();
  let failure:unknown=null;
  const fetchDiRete=Object.assign((input:any,init:any)=>route(input,init),{
   eseguiConFallback:async(chiama:(aggiunte:any)=>Promise<any>,opzioni:any={})=>{
    let thrown:any=null;
    try{
     return await route.eseguiConFallback((aggiunte:any)=>chiama({...aggiunte,fetchDiRete:async(input:any,init:any)=>{thrown=null;try{return await aggiunte.fetchDiRete(input,init);}catch(error){thrown=error;throw error;}}}),opzioni);
    }catch(error:any){
     const stopped=error?.name==='AbortError'||error?.fermatoSuRichiesta===true;
     failure=stopped?error:auxiliaryFailure(PRE_NETWORK_CODES.has(thrown?.code)?thrown:error,opzioni?.modello);
     throw failure;
    }
   },
  });
  return{fetchDiRete,failure:()=>failure};
 };
 /*
  * ⭐ B1 slice 24, condition C1 — COMPACTION NAMES THE SESSION'S MODEL, NOT THE REGISTRY'S.
  *
  * `session-registry.mjs:4217` (at 5e05de8e) handed `compattaSessioneFn` the model the registry was BUILT with (its closure `modello`,
  * i.e. this composition's `model`), not the session's (`voce.modello`); since CLI-REQ-05 the kernel passes the session's own (see
  * slice 25 above), and the scope below still decides. `main.ts` composes once with the launch model, and `/model`
  * only changes the model new sessions start with. Measured on this tree before the cure: a DeepSeek session in a runtime
  * composed with an OpenRouter model compacted on OpenRouter's configured endpoint with the OpenRouter key.
  * ⇒ The session runtime's `compatta` (`sessionRegistry`, below) reads the session's own row from `registry.elenca()`
  *   (`session-registry.mjs:5520` `modello`, `:5525` `provider`; a restored session keeps both, `:3559`, `:3564`), runs ONE
  *   compaction at a time, and binds that session's model to the compaction's async context. `compattaSessioneFn` uses only
  *   that model and ignores the one the kernel passes.
  * ⛔ Never a guess, never a fallback. Refused before anything is sent:
  *   - a compaction that did not come through the session runtime (no bound scope): the model is unknown;
  *   - a session whose provider is not `cloud` (the registry knows only `cloud` and `local`) or whose model is missing;
  *   - a `local` session: its stored model is a bare GGUF id, which the route would read as an OpenRouter id
  *     (`model-destination.mjs:65-75`). Compacting it waits for the kernel fix, CLI-REQ-05.
  * The research judge is unaffected: it names its own model explicitly.
  */
 const compactionScope=new AsyncLocalStorage<{sessionId:string;model:string|null;refusal:CliRuntimeError|null}>();
 const compattaSessioneFn=async({messaggiFinali}:{messaggiFinali:unknown;modello?:unknown})=>{
  const scope=compactionScope.getStore();
  if(!scope)throw new CliRuntimeError('SESSION_MODEL_UNKNOWN','This compaction did not come through the session runtime, so the session model is unknown and nothing was sent.');
  if(scope.refusal)throw scope.refusal;
  if(typeof m.compattaSessione!=='function')throw new CliRuntimeError('AUXILIARY_ROUTE_UNAVAILABLE','This TALOS kernel does not expose compaction, so nothing was sent.');
  const route=auxiliaryRoute();
  const result=await m.compattaSessione({messaggiFinali,modello:scope.model,chiave:unroutedCredential,fetchDiRete:route.fetchDiRete});
  const failure=route.failure();
  if(result?.compattato!==true&&failure)throw failure;
  /* 0.6.13 (D5): the kernel answers «not compacted» without a word for a summary cut short or empty too (talosHarness.mjs
     `compattaConversazione`); with its usage there it was a paid call, so it is a failure to say, never «already compact» */
  if(result?.compattato!==true&&result?.usage)throw new CliRuntimeError('COMPACTION_NO_SUMMARY','The model answered without a usable summary (cut short or empty), so nothing was compacted.',{sessionId:scope.sessionId});
  /* R5a lane R, S3 (Q-R5-4): an explicit /compact of a session without the Context Engine is named like the automatic one: the
     kernel keeps the system prompt and the task (talosHarness.mjs `compattaConversazione`) and summarises the rest. */
  if(result?.compattato===true){
   const before=Array.isArray(messaggiFinali)?messaggiFinali.length:null;const tokens=Number(result?.usage?.prompt_tokens);
   cliEvents.emit(scope.sessionId,compactionEvent({engine:'kernel',messagesSummarized:before===null?null:Math.max(0,before-2),tokensBefore:Number.isSafeInteger(tokens)&&tokens>=0?tokens:null,tokensAfter:null,trigger:'manual'}));
  }
  return result;
 };
 /* r4 4e4004950 (22/10/2026): the registry's summaries — /compact on the kernel path and the end-of-turn summary — call
    `riassumiPerCompattazioneFn` with the key of its `chiaveFn` (the OpenRouter key) and the CLI's route as `fetchDiRete`. The route
    refuses a request it did not rewrite only while it carries the placeholder, so with the real key a summary request with no model,
    or to another path, would leave as it is for the fixed OpenRouter address. Measured on the reworked auxiliary-provider-route test.
    The registry's summaries get the placeholder, as `compattaSessioneFn` gave the kernel: the route puts the key of the session's
    provider in place, and nothing else is ever sent with a key. */
 const riassumiPerCompattazioneFn=(input:any)=>{
  if(typeof m.riassumiPerCompattazione!=='function')throw new CliRuntimeError('AUXILIARY_ROUTE_UNAVAILABLE','This TALOS kernel does not expose the summary call, so nothing was sent.');
  return m.riassumiPerCompattazione({...input,chiave:unroutedCredential});
 };
 const chiediAlModelloUnaVoltaFn=async({modello,prompt,segnaleStop}:{modello:string;prompt:string;segnaleStop?:AbortSignal})=>{
  if(typeof m.chiediAlModelloUnaVolta!=='function')throw new CliRuntimeError('AUXILIARY_ROUTE_UNAVAILABLE','This TALOS kernel does not expose the research judge call, so nothing was sent.');
  return m.chiediAlModelloUnaVolta({modello,chiave:unroutedCredential,prompt,...(segnaleStop?{segnaleStop}:{}),fetchDiRete:auxiliaryRoute().fetchDiRete});
 };
 /*
  * ⭐ B1 slice 25 — READINESS AT START: THE KERNEL DECIDES, THE CLI SAYS IT.
  *
  * The rule "ready means a key usable NOW, for every provider" lives in the kernel since the desktop lane's `3cbecf60`, which fixed
  * the benched-key defect this slice found: `harness-ui/src/sessione-pronta.mjs`, `creaProntoFn`. Kernel lines relied on, read at
  * 3cbecf60:
  *  - `sessione-pronta.mjs:48-72`: synchronous; an empty or unparsable model is not ready; a provider that needs a key is ready
  *    only if `providerStore.getKey` (which skips a benched key) returns one, or, for OpenRouter only, `chiaveApi`.
  *  - `session-registry.mjs:2859-2877`: a non-local session starts only on `pronto`; `codice`/`messaggio` become the refusal, and a
  *    throw becomes one too. Without `prontoFn` the registry keeps asking every session for an OpenRouter key.
  * What the CLI adds around it, and why:
  *  - ⛔ `chiaveApi: null`. On the desktop server it is the startup `OPENROUTER_API_KEY`; here an environment key reaches the store
  *    only with the person's consent (slice 18), so no key outside the store may make a session ready.
  *  - A model whose provider cannot be read, or that the registry does not know, is refused before asking: the kernel answers
  *    "ready" for a provider it has no record of (`sessione-pronta.mjs:60`), and a guard that cannot evaluate denies.
  *  - The refusal is the CLI's own, in English, with the codes the screen gives (`unusableKeyRefusal`, `keyBench`), never the
  *    kernel's Italian sentence. An answer that cannot be read, or a throw, refuses and says TALOS could not tell.
  */
 const kernelReady=typeof m.creaProntoFn==='function'?m.creaProntoFn({providerStore,chiaveApi:null}):null;
 const prontoFn=(modello:unknown)=>{
  followCredentialsChangedElsewhere();
  let fonte:string|null=null;
  try{fonte=typeof modello==='string'&&typeof m.separaFonteModello==='function'?m.separaFonteModello(modello).fonte:null;}catch{fonte=null;}
  const record=fonte&&Object.hasOwn(providerRegistry,fonte)?providerRegistry[fonte]:null;
  if(!fonte||!record)return{pronto:false,codice:'MODEL_DESTINATION_INVALID',messaggio:'The model of this session cannot be read, so nothing was sent. Choose one with /model.'};
  const fornitore=providerLabelText(fonte,String(record.etichetta??fonte));
  let verdict:any=null;try{verdict=kernelReady?kernelReady(modello):null;}catch{verdict=null;}
  /* 14/10/2026 (owner, «the Z.AI key only to the address you chose»): a key saved before, or approved from ZAI_API_KEY, would go to
     the default address nobody chose; the session waits for the choice and nothing is sent */
  if(verdict?.pronto===true&&fonte===ZAI_PROVIDER){let runtime:unknown=null;try{runtime=providerStore.getRuntime?.(fonte);}catch{runtime=null;}if(!zaiAddressChosen(runtime))return{pronto:false,fornitore,codice:'PROVIDER_ADDRESS_REQUIRED',messaggio:t('key.zai.addressRequired')};}
  if(verdict?.pronto===true)return{pronto:true,fornitore};
  if(verdict?.pronto!==false)return{pronto:false,fornitore,codice:'KERNEL_READINESS_UNREADABLE',messaggio:`TALOS could not tell whether ${fornitore} can be used now, so nothing was sent.`};
  let row:any=null;try{row=(providerStore.listPublic?.()??[]).find((entry:any)=>entry?.id===fonte)??null;}catch{row=null;}
  const refusal=unusableKeyRefusal(fonte,keyBench(row));
  return{pronto:false,fornitore,codice:refusal.code,messaggio:refusal.message};
 };
 async function prepareMcpWithAuthority(input:any){
  if(typeof trustM.preparaToolMcpPerSessione!=='function')return{toolMcp:[],chiamaToolMcpFn:null,falliti:[],chiudiTutti:async()=>{}};
  const loaded=typeof trustM.caricaServerMcp==='function'?await trustM.caricaServerMcp({cartella:projectRoot}):null;
  const prepared=await trustM.preparaToolMcpPerSessione(input);
  const startScope=mcpStartScope.getStore();if(startScope)startScope.failures=Array.isArray(prepared?.falliti)&&prepared.falliti.length?prepared.falliti:null;
  if(typeof prepared?.chiamaToolMcpFn!=='function'||!Array.isArray(prepared?.toolMcp)||!loaded)return prepared;
  const owners=new Map<string,string|null>();
  const exposed=(serverId:string,toolName:string)=>typeof trustM.nomeEspostoMcp==='function'?trustM.nomeEspostoMcp(serverId,toolName):`mcp__${serverId}__${toolName}`;
  for(const server of loaded.server??[]){
   for(const toolName of server.allowlist??[]){
    const serverId=String(server.id);const name=exposed(serverId,String(toolName));const previous=owners.get(name);
    owners.set(name,previous===undefined||previous===serverId?serverId:null);
   }
  }
  const routes=new Map<string,string>();
  for(const tool of prepared.toolMcp){
   const name=String(tool?.name??'');const serverId=owners.get(name);
   if(serverId)routes.set(name,serverId);
  }
  const dispatch=prepared.chiamaToolMcpFn;
  return{...prepared,chiamaToolMcpFn:async(name:string,args:any)=>{
   const serverId=routes.get(name);
   if(!serverId)throw Object.assign(new Error('MCP_TOOL_OWNER_UNRESOLVED'),{code:'MCP_TOOL_OWNER_UNRESOLVED'});
   if(!await trustAuthority.verifyScope({kind:'mcp',id:serverId}))throw Object.assign(new Error('MCP_TRUST_INVALIDATED'),{code:'MCP_TRUST_INVALIDATED',serverId});
   return dispatch(name,args);
  }};
 }
 async function preparePluginWithAuthority(input:any){
  if(typeof trustM.preparaToolPluginPerSessione!=='function')return{toolPlugin:[],hookPlugin:[],eseguiToolPluginFn:null};
  const prepared=await trustM.preparaToolPluginPerSessione(input);
  if(typeof prepared?.eseguiToolPluginFn!=='function'||typeof prepared?.pluginIdDiTool!=='function')return prepared;
  const dispatch=prepared.eseguiToolPluginFn;
  return{...prepared,eseguiToolPluginFn:async(name:string,args:any)=>{
   const pluginId=prepared.pluginIdDiTool(name);
   if(typeof pluginId!=='string'||!pluginId)throw Object.assign(new Error('PLUGIN_TOOL_OWNER_UNRESOLVED'),{code:'PLUGIN_TOOL_OWNER_UNRESOLVED'});
   if(!await trustAuthority.verifyScope({kind:'plugin',id:pluginId}))throw Object.assign(new Error('PLUGIN_TRUST_INVALIDATED'),{code:'PLUGIN_TRUST_INVALIDATED',pluginId});
   return dispatch(name,args);
  }};
 }
 const authoritySessionAdapters=typeof trustM.preparaToolMcpPerSessione==='function'||typeof trustM.preparaToolPluginPerSessione==='function';
 let contextBridge:any=null;
 /* ASYNC step 7 (owner 01/10): the person's agents.* limits and child defaults; none set → no parameter, the kernel's own. */
 const delegation=kernelDelegationOptions(await loadEffectiveConfig({paths,projectRoot,projectTrusted:!projectUntrusted}).then(config=>config.value.agents,()=>undefined));
 /* Stage 3 (owner 01/10, «-p senza l'attrezzo, come Claude Code»): only a screen with a person offers ask_user_question;
    without one the kernel's own list goes in without it — never copied by hand, and a kernel without the list refuses
    (closed), it never offers the question to nobody. Before, `talos -p` hung waiting for an answer nobody could give.
    Owner 09/10/2026 («Sì, con la carta»): excluding or allowing again a downstream provider waits for the person's yes on a card,
    so without a person only the list of excluded providers is offered. */
 /* 0.6.15 T6: the devices' tools need the person's card and a window's remote control: never offered without a person */
 /* T6: the window's tool coordinator for the devices' tools (tui-remote.ts `toolCoordinator`), late: the registry is built first */
 const remoteTools:{current:(()=>unknown)|null}={current:null};
 const DEVICE_TOOLS=['remote_phones','remote_phone_pair','remote_phone_revoke','remote_control','remote_phone_folders','remote_phone_folder_allow',
   /* blocked folders step B (Desktop b57daaab0): unblocking widens a device's reach, so it waits for a card: never without a person */
   'remote_phone_folder_revoke','remote_phone_folder_unblock','remote_device_send_file'] as const;
 const WITHOUT_PERSON_LEFT_OUT=new Set(['ask_user_question','provider_exclude','provider_allow','research_start',...DEVICE_TOOLS]);
 /* 0.6.6, the seventh review (S2): since r4 2bd1b3e27 the kernel's registry gives every root conversation the goal's channel
    (`onObiettivoFn`, session-registry.mjs), so `goal_*` reached the model in every CLI conversation — a goal could start the
    kernel's judge, reviewer and up to 20 automatic turns on the person's key or plan, and the CLI has no goal surface to show,
    pause or clear it. Until it has one (a design first), the CLI never offers them, with or without a person. */
 /* 0.6.14 (r4 integra/2026-10-25): remote control (R5.14), the device folders (R5.12) and sending a file to a device (R5.13) are in
    the kernel's default list too, and each needs a device host. 0.6.15 T6 (owner «come nel desktop»): the interactive screen gives
    the registry `remotoFn` (the window's tool coordinator, tui-remote.ts), so they are offered there with the desktop's cards.
    `remote_phone_pair` too: after the person's yes the window opens the QR in its `/remote` card (app.ts, T4). */
 /* r4 c5ce4e453 (the window that grows, local_model_window): reopening the local llama.cpp model with a larger window is the desktop's
    engine; the CLI's local models run in the person's own server, which TALOS does not restart (as planned in PIANO-0615-REMOTO) */
 const NOT_IN_THE_CLI=new Set(['goal_status','goal_create','goal_update','file_changes_undo','local_model_window','local_model']);
 const kernelExtendedTools=():readonly string[]=>{if(!Array.isArray(m.STRUMENTI_ESTESI_PREDEFINITI))throw Object.assign(new Error('KERNEL_TOOL_LIST_UNAVAILABLE'),{code:'KERNEL_TOOL_LIST_UNAVAILABLE'});return m.STRUMENTI_ESTESI_PREDEFINITI.filter(name=>!NOT_IN_THE_CLI.has(name));};
 const toolsWithoutPerson=():readonly string[]=>kernelExtendedTools().filter(name=>!WITHOUT_PERSON_LEFT_OUT.has(name));
 /* the list reads the model picker, which is built further down: asked only when a child is given a model */
 const usableModels=createUsableModels({repoRoot,sources:{
  listProviders:async()=>tuiCatalog?await tuiCatalog.listProviders():[],
  /* no picker yet = a source that cannot be read (never shown: usable-models.ts counts it as failed); the signal is the time limit */
  providerModels:async(provider:string,signal?:AbortSignal)=>{if(!tuiCatalog)throw new Error('the model picker is not built yet');return tuiCatalog.providerModels(provider,signal);},
 }});
 /* blocked folders, step B (contract round 2, rev. 1, Desktop e33e35efe): the folders a device may no longer reach, read from the profile's
    FILE (the kernel's lettore-bloccate.mjs, cached by signature) in EVERY window: a device's turn continued in a window that does not host
    remote control (federation.ts) is held by the same blocks. An older kernel has no reader: no option, as before. */
 const blockedReader=await import(pathToFileURL(join(repoRoot,'harness-ui','src','remoto','lettore-bloccate.mjs')).href).then((mod:any)=>typeof mod.creaLettoreBloccate==='function'?mod.creaLettoreBloccate({fileBloccate:join(paths.dataRoot,'remote','cartelle-bloccate.json')}):null,()=>null);
 /* talos_help: the site's pages of this version, offered only where the package carries them (the kernel's D3: absent rather than broken),
    read at the first call (Performance). Only the CLI's pages and the common ones, never the PC's keys (kernel/aiuto-talos.mjs). */
 const helpFolder=join(repoRoot,'harness-ui','aiuto');
 const aiutoTalos=typeof m.creaAiutoTalos==='function'&&existsSync(join(helpFolder,'index.json'))?m.creaAiutoTalos({cartella:helpFolder,prodotto:'cli',versione:CLI_VERSION}):null;
 /* view_image: the kernel offers it only with the host's function and a model that sees; the person's chat image store keeps the picture. */
 const modelSees:{current:((model:string)=>Promise<boolean|null>)|null}={current:null};
 const guardaImmagineFn=typeof m.creaGuardaImmagine==='function'&&chatImageStore?m.creaGuardaImmagine({chatImageStore}):null;
 const summaryChoice=summaryChoiceFrom(await loadEffectiveConfig({paths,projectRoot,projectTrusted:!projectUntrusted}).then(config=>config.value.context,()=>undefined));
 const registry=m.createSessionRegistry({
  /* A5 of the alignment (kernel 8991181c7): the background logs of the model's commands and of the person's `!` live in TALOS's data,
     never in the project, and Library and Research stay where they are (`cartellaDatiProgettoFn` would move them too) */
  cartellaSfondoProgettoFn:()=>paths.dataRoot,
  /* Owner 27-28/10, «Mai aspettare, ovunque», contract C1: a turn never waits for a model's summary; the adapter's instant compaction, as the desktop's */
  compattazioneIstantanea:true,
  sceltaDelRiassuntoFn:()=>summaryChoice,
  ...(aiutoTalos?{aiutoTalos}:{}),
  ...(guardaImmagineFn?{guardaImmagineFn,vedeImmaginiFn:(modello:string)=>modelSees.current?.(modello)??null}:{}),
  /* Form B, No (a): read once per session by the kernel, saved with it, the same on a resume */
  ...(projectUntrusted?{senzaIstruzioniDelProgettoFn:()=>true}:{}),
  /* R2-F1 (cure 208 bis): read by the registry where the mode is chosen, at every turn and tool call; synchronous, no disk */
  fiduciaDellaCartellaFn:(cartella:string)=>folderTrust.forFolder(cartella),
  ...(blockedReader?{bloccateDelDispositivoFn:blockedReader}:{}),
  /* 0.6.6: the words the model reads for the turn's permission are the CLI's real mode, not the «On request» the gates get (runtime/model-permission.ts) */
  /* with nobody in front (`-p`, a command, the automations' host) what would be asked is refused: the words say so (F3) */
  permessoPerIlModello:askPerson?(voce:unknown)=>permissionForModel(voce):permissionForModelWithNobody,
  /* 0.6.8 (desktop a4dfea6df): the gates get «On request»; document_create asks here whether the person is in Full access */
  accessoPienoDellOspite:fullAccessForSession,
  strumentiEstesi:askPerson?kernelExtendedTools():toolsWithoutPerson(),
  /* Stage 6b (owner 02/10): the sub-agents may ask the person only where someone can answer — the interactive TUI, which shows
     their questions on the agents page; in `-p` nobody can, as for the main session's own tool. */
  ...(askPerson?{domandeDeiFigli:true}:{}),
  /* 0.6.15 T6: the devices' tools reach the window's tool coordinator, set by the window once its remote bridge exists
     (`setRemoteTools`); before that, or in a window without one, the tools say remote control is not available */
  ...(askPerson?{remotoFn:()=>remoteTools.current?.()??null}:{}),
  ...delegation,
  /* 08/10 (owner): the journal's provider-state anchor is an option of the kernel registry, off by default; the CLI writes it (P4). */
  ancoraStatoProvider:true,
  /* 0.6.11 (owner 20/10/2026, after the measure: «Sì, accendilo di serie»): the kernel's deferred tools (ponte-attrezzi.mjs). The
     tools used only on request leave the first list and stay reachable through tool_search / tool_describe / tool_call: the first
     request of a one-line task went from 51 tools and 54,237 characters to 23 and 29,406 (test/acceptance/m01-deferred-tools.measure.ts).
     The desktop has it on since 0.1.33. `TALOS_ATTREZZI_DIFFERITI=0` turns it off. */
  attrezziDifferiti:env.TALOS_ATTREZZI_DIFFERITI!=='0',
  /* 0.6.13: the window and output limit of a session's model, for the registry's end-of-turn summary and the adapter's threshold
     (see `finestraTokenFn` above). The end-of-turn summary, off in 0.6.12 because the bare kernel never read it, is on again:
     the adapter starts the next turn from it (`recordCompattazioneIniziale`). */
  finestraTokenFn,limiteUscitaFn,tettoCompattazioneFn,modelloRiassuntoFn,
  /* Review 1 of 0.6.13 (S2-1), owner 22/10/2026 («Spento solo in -p»): with nobody at the screen (`talos -p`, the one-shot commands)
     the end-of-turn summary is not started. It ran after the answer was printed and held the process: 21 s for a summary of 20 s,
     5.5 min and 15 requests for a provider answering 503, with nothing said. Codex (auto-compact before the next model call,
     `auto_compact_token_limit`), opencode (preflight before a model call, `packages/core/src/session/compaction.ts`) and Hermes
     (`should_compress()` in the loop, before the API call) never summarise after the final answer of a run. On the screen it
     stays, and the close below waits for it, bounded. */
  riassuntoDiFineGiro:askPerson,
  /* 14/10 (owner): a question nobody answers in time does not stop the turn; the model is told and goes on with its own judgment,
     saying what it assumed (Codex auto-resolves, Hermes «the user did not respond», zcode «use your best judgment»). */
  domandaScadutaFerma:false,
  /* 14/10 evening (owner: «Se lo chiedi tu, vale», 0.6.5): a file the person asks, in their own message, to read and follow counts
     as their request (same permissions and mode; never a file named by another file, tool output or a system message). Measured
     before: the person's ChatGPT plan refused even «read ISTRUZIONI.md and do it», citing the data-boundary rule. */
  fileAdottatiDallaPersona:true,
  /* 14/10 (owner: «Sì: il secondo viene rifiutato con una frase chiara»): the kernel's lease between processes on the session
     archive (session-lease.mjs), off until today; the label tells the OTHER TALOS who holds the conversation (session-facade.ts
     asks for it before every write) */
  affittoFraProcessi:{etichetta:askPerson?'TALOS CLI (the screen)':'TALOS CLI (talos -p or a command)'},
  prontoFn,fetchModelloFn:()=>auxiliaryRoute().fetchDiRete,compattaSessioneFn,riassumiPerCompattazioneFn,chiediAlModelloUnaVoltaFn,
  contextHooksFn:(input:any)=>contextBridge?.hooks(input),contextCompactFn:(input:any)=>contextBridge?.compact(input),
  contextArchiveFn:(sessionId:string)=>contextBridge?.archivedOriginals(sessionId)??null,
  avviaSessioneFn:async(raw:any)=>{
   /* 13/10/2026: the registry hands `onRichiestaSpedita` (the kernel's capture of the last request sent) to whoever starts the
      session; the CLI took it out until 14/10. Owner 14/10/2026 («/context con il dettaglio dell'ultima richiesta»): handed on, so
      the registry keeps the LAST request in memory (never on disk, no images) and /context draws its parts. */
   /* 0.6.6, the eighth review (S2): the list sent to the model is not a boundary — a `goal_create` the model calls anyway reached
      the goal's channel and set a goal its judge kept running. Without the channel the kernel answers «not available». */
   const {onObiettivoFn:_goalChannel,...withPerson}=raw??{};
   /* 0.6.6, the ninth review (S3): with nobody in front a proposed plan or a question waited for an answer nobody could give.
      0.6.8: the kernel now knows it per turn (`senzaInterfacciaNelGiro`, passed by session-facade.ts on every turn of a process
      with nobody in front), and refuses the plan card, questions, MCP forms and adopted files itself with the nobody-in-front
      words; the CLI no longer takes the plan and question channels out per process. */
   const input=withPerson;
   if(!authoritySessionAdapters)return mcpStartScope.run({failures:null},()=>m.avviaSessione({...input,talosLavoraFn:talosLavoraConBroker}));
   const compatibility=await sessionCompatibility();
   try{
    return await mcpStartScope.run({failures:null},()=>m.avviaSessione({...input,cartellaTrustMcp:compatibility.roots.mcp,cartellaTrustPlugin:compatibility.roots.plugins,...(trustM.preparaToolMcpPerSessione?{preparaToolMcpPerSessioneFn:prepareMcpWithAuthority}:{}),...(trustM.preparaToolPluginPerSessione?{preparaToolPluginPerSessioneFn:preparePluginWithAuthority}:{}),...(trustM.eseguiHook?{eseguiHookFn:executePluginHookWithAuthority}:{}),talosLavoraFn:talosLavoraConBroker}));
   }finally{await compatibility.cleanup();}
  },
  /* owner 13/10/2026: the models a sub-agent may be given when the person asks for one (runtime/usable-models.ts; the desktop's
     wiring is harness-ui/server.mjs:651). Without it the kernel refuses every model asked for a child. */
  modelliDisponibiliFn:()=>usableModels.list(),
  modello:model,chiave:providerStore.getKey?.('openrouter')??'',chiaveFn:()=>providerStore.getKey?.('openrouter')??'',cartelleProgetto:[{id:'cli',nome:'CLI',percorso:projectRoot}],taskCatalogProvider,ricercaWebFn,cartellaStore:paths.sessionsRoot,
  cartellaTrustHook:paths.trust.hooks,cartellaTrustMcp:paths.trust.mcp,cartellaTrustPlugin:paths.trust.plugins,
  verificaTrustFn:verificaTrustHookFn,verificaTrustMcpFn,fidaHookFn,fidaServerMcpFn,verificaTrustPluginFn,statoTrustPluginFn,fidaPluginFn,
  cartellaNote:join(paths.dataRoot,'notes'),cartellaAttivita:join(paths.dataRoot,'tasks'),cartellaMemoria:join(paths.dataRoot,'memory'),cartellaForge:join(paths.dataRoot,'forge'),attrezziKernelFn:()=>ownerRuntime.attrezziKernel(),
  eseguiComandoDirettoFn:(input:any)=>{if(typeof m.eseguiComandoDiretto!=='function')throw Object.assign(new Error('KERNEL_COMMAND_PATH_UNAVAILABLE'),{code:'KERNEL_COMMAND_PATH_UNAVAILABLE'});return m.eseguiComandoDiretto({...input,eseguiComandoSandboxatoFn:brokeredExecutor});}
 });
 /*
  * Owner 09/10/2026 («Sì, con la carta»): the model's door on OpenRouter's excluded downstream providers, the desktop's host as it is
  * (fornitori-per-il-modello.mjs: listing is free; excluding and allowing again show a card with before → after and wait for the
  * person's yes, in one write). Hermes keeps `providers_ignored` in config and CLI only; Codex and Claude Code have no such tool.
  * The person's door is `talos provider exclusions|exclude|allow` (provider-cli.ts), on the same host.
  */
 await linkProviderExclusions(repoRoot,registry,providerStore,chatgptPlan.kernelFacade);
 /*
  * R5a lane R, S2: the profile's sources (model-profile.ts). The store's and the registry's rows are read live; the person's
  * override is re-read before each decision (the TUI writes it with `writeConfigScope`); a local Ollama is asked for the
  * model's real window; models.dev is loaded in the background (never in a test profile, gate E7) and waited for at most 2 s.
  */
 configureModelProfiles({registry:providerRegistry,rowsFor:(provider:string)=>{
  const record=providerRegistry[provider]??{};let runtime:any={};try{runtime=providerStore.getRuntime?.(provider)??{};}catch{runtime={};}
  return{runtime:Array.isArray(runtime.modelli)?runtime.modelli:[],registry:[...(Array.isArray(record.modelliNoti)?record.modelliNoti:[]),...(Array.isArray(record.modelliDiRiserva)?record.modelliDiRiserva:[])]};
 }});
 let catalogConfig:{catalog?:{modelsDev?:boolean}}|null=null;try{catalogConfig=(await loadEffectiveConfig({paths,projectRoot,projectTrusted:!projectUntrusted})).value;}catch{catalogConfig=null;}
 const modelsDev:ModelsDevLoader=createModelsDevLoader({repoRoot,dataRoot:paths.dataRoot,env:{...process.env,...env},config:catalogConfig,fetchImpl:(url:string,init:RequestInit)=>fetch(url,init),testProfile:isTestProfile({...process.env,...env})});
 const refreshOverrides=async()=>{try{const models=(await loadEffectiveConfig({paths,projectRoot,projectTrusted:!projectUntrusted})).value.models;setModelOverrides(models);setOpenRouterRouting(models);}catch{/* an unreadable configuration is reported by the config layer */}};
 await refreshOverrides();
 const launch=typeof m.separaFonteModello==='function'?(()=>{try{return m.separaFonteModello!(model);}catch{return null;}})():null;
 if(launch?.fonte&&modelsDev.enabled)void modelsDev.load(launch.fonte);
 const withinMs=(work:Promise<unknown>,ms:number)=>new Promise<void>(resolve=>{const timer=setTimeout(resolve,ms);timer.unref?.();work.then(()=>{clearTimeout(timer);resolve();},()=>{clearTimeout(timer);resolve();});});
 /*
  * Review of 0.6.0, F4 (measured 13/10/2026, chatgpt-plan-context-engine.test.ts): a model of the ChatGPT plan has one source for its
  * window, the account's own list, and only the model picker remembered it — so `talos -p --model chatgpt:…` and a resumed plan
  * conversation, where nobody opens /model, ran without the Context Engine. The list is asked here when the window is not known:
  * with the plan's token, only when somebody is signed in with the plan enabled (nothing goes to OpenAI otherwise), within the same
  * 2 s as models.dev, and not again for a minute after an answer that brought no window (a failure, or a list without the field).
  */
 /* Review of 0.6.2 (13/10/2026): the rules live in runtime/plan-window.ts, where they are measured — one request at a time, and a
    prepare made while it is out waits for its answer instead of going on without the window. */
 const planWindow=createPlanWindow({
  known:(modelId:string)=>Boolean(modelProfile({provider:CHATGPT_PROVIDER,model:modelId})),
  signedInPlan:async()=>{
   let plan=chatgptPlan.loaded();if(!plan&&chatgptPlan.stored()){try{plan=await chatgptPlan.load();}catch{plan=null;}}
   let signedIn=false;try{const state=plan?.state();signedIn=state?.connected===true&&state.planEnabled===true;}catch{signedIn=false;}
   return plan&&signedIn?plan:null;
  },
  remember:rows=>rememberProviderModelRows(CHATGPT_PROVIDER,rows as any),
 });
 const prepareProfile=async(provider:string,modelId:string)=>{
  await refreshOverrides();
  if(provider===CHATGPT_PROVIDER)await withinMs(planWindow(modelId),2_000);
  const record=providerRegistry[provider];
  if(record?.catalogo?.fonte==='runtime-locale'&&record?.catalogo?.forma==='ollama-tags'){
   let runtime:any={};try{runtime=providerStore.getRuntime?.(provider)??{};}catch{runtime={};}
   const root=String(runtime.endpoint??record.baseUrl??'');
   rememberOllamaWindow(provider,modelId,await ollamaWindow({root,model:modelId,fetchImpl:(url:string,init:RequestInit)=>fetch(url,init)}));
  }
  if(modelsDev.enabled)await withinMs(modelsDev.load(provider),2_000);
 };
 /*
  * Owner 13/10/2026 («Dire in /context cosa è stato alleggerito»), review of the same day: what the Context Engine cleared and
  * shortened in the LAST request it prepared for each conversation, kept by the CLI. Written at every prepare, with zero too (a
  * later request with nothing cleared takes the line away), so it does not depend on how many times the request was then sent:
  * the kernel's own record gives the counts to the first attempt only, and a request answered 429 and sent again lost them. Two
  * integers per conversation, in memory only; gone with the conversation (`elimina` below).
  */
 const lightenedBySession=new Map<string,{cleared:number;shortened:number}>();
 const rememberPrepared=(input:any)=>{
  const sessionId=input?.sessionId,level=input?.level1;if(typeof sessionId!=='string'||!sessionId)return;
  const counted=level&&Number.isSafeInteger(level.cleared)&&Number.isSafeInteger(level.shortened)&&level.cleared>=0&&level.shortened>=0;
  lightenedBySession.set(sessionId,counted?{cleared:level.cleared,shortened:level.shortened}:{cleared:0,shortened:0});
 };
 contextBridge=createCliContextBridge({repoRoot,paths,registry,providerRegistry,providerStore,ownerRuntime,chatImageStore,prepareProfile,onPrepared:rememberPrepared,summaryFetch:(input:any,init?:any)=>zaiDoor(input,init),compactAtTokens:compactAtTokensSetting,onSummaryRequest:()=>{const sessionId=toolOutputScope.getStore()?.sessionId;if(sessionId)cliEvents.emit(sessionId,summaryRequestedEvent());},...(m.separaFonteModello?{separaFonteModello:m.separaFonteModello}:{})});
 /* C1 (see `compactionScope` above): the session's own row decides the model; one compaction at a time, in call order. */
 const compactionOf=(sessionId:string):{model:string|null;refusal:CliRuntimeError|null}=>{
  let rows:unknown=null;try{rows=registry.elenca?.();}catch{rows=null;}
  const row:any=Array.isArray(rows)?rows.find((candidate:any)=>candidate?.sessionId===sessionId)??null:null;
  const unknown=(details:Record<string,unknown>)=>({model:null,refusal:new CliRuntimeError('SESSION_MODEL_UNKNOWN','The model of this session cannot be determined, so it was not compacted and nothing was sent.',{sessionId,...details})});
  if(!row)return unknown({});
  if(row.provider==='local')return{model:null,refusal:new CliRuntimeError('LOCAL_SESSION_COMPACTION_UNAVAILABLE','Compacting a local-model session waits for a kernel fix (CLI-REQ-05), so nothing was sent.',{sessionId,provider:'local'})};
  if(row.provider!=='cloud')return unknown({provider:typeof row.provider==='string'?row.provider:null});
  if(typeof row.modello!=='string'||row.modello.trim()==='')return unknown({provider:'cloud'});
  return{model:row.modello,refusal:null};
 };
 let compactionTail:Promise<unknown>=Promise.resolve();
 const compactSession=(sessionId:string)=>{
  /* review of 0.6.4 (B1): /compact never asked the readiness at start, and its summary went to the default Z.AI address nobody chose.
     A conversation whose model the readiness refuses for its address is not compacted, and nothing is sent. */
  const own=compactionOf(sessionId);
  if(own.model){let ready:any=null;try{ready=prontoFn(own.model);}catch{ready=null;}if(ready?.pronto===false&&ready.codice==='PROVIDER_ADDRESS_REQUIRED')return Promise.resolve({erroreAvvio:String(ready.messaggio),code:'PROVIDER_ADDRESS_REQUIRED'});}
  /* r4 4e4004950 (desktop, 22/10/2026, S2-A of the CLI's review 2): the registry's /compact on the kernel path no longer calls
     `compattaSessioneFn`; it summarises the way the turn does (projection, light model, a record that replaces the old one). So the
     two things that function did for the CLI are done here: a session the CLI cannot compact is refused before anything is sent,
     and a /compact that compacted is named on the transcript and in -p (trigger 'manual'), with the registry's own figures. A
     Context Engine job answers with its `jobId` and is named by the engine's path, not here. */
  const nonNegative=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
  const run=()=>{const scope={sessionId,...compactionOf(sessionId)};if(scope.refusal)return Promise.reject(scope.refusal);
   return compactionScope.run(scope,()=>registry.compatta(sessionId)).then((result:any)=>{
    if(result?.compattato===true&&result?.annullabile===true&&!result?.jobId)cliEvents.emit(sessionId,compactionEvent({engine:'kernel',messagesSummarized:null,tokensBefore:nonNegative(result.tokenPrima),tokensAfter:nonNegative(result.tokenDopo),trigger:'manual'}));
    return result;});};
  const result=compactionTail.then(run);
  compactionTail=result.then(()=>undefined,()=>undefined);
  return result;
 };
 /*
  * R5a lane R: `iscriviti` also delivers the session's CLI events (provider attempts, a provider failure's facts, a kernel
  * compaction), live only: they carry no `_sequenza`, so a replay never repeats them and the supervisor's cursor ignores them.
  * `shell` runs the person's `!` command inside its session's output scope (S6).
  */
 const subscribeWithCliEvents=(sessionId:string,listener:(event:unknown)=>void,from=0,options?:{resultsForScreen?:boolean})=>{
  /* P-D (owner 07/10 night): the journal keeps every streamed delta, so a long session replays tens of thousands of tiny events. A FULL
     replay (from 0) folds adjacent deltas of one message into one event (replay-coalescer.ts); a replay from a cursor and every live
     event are delivered as they are. The kernel replays synchronously inside `iscriviti`, so the tail is flushed before it returns. */
  const replay=from===0?createReplayCoalescer(listener,options?.resultsForScreen?{giantResults:SCREEN_RESULT_LIMITS}:{}):null;
  let offKernel:unknown;try{offKernel=registry.iscriviti(sessionId,replay?replay.push:listener,from);}finally{replay?.end();}
  const offCli=cliEvents.subscribe(sessionId,listener);
  return()=>{offCli();if(typeof offKernel==='function')offKernel();};
 };
 let modelPreferences:any=null;
 const sessionRegistry=Object.create(registry,{...(typeof registry?.compatta==='function'?{compatta:{value:compactSession,enumerable:true}}:{}),
  contestoAlleggerito:{value:(sessionId:string)=>{const kept=lightenedBySession.get(sessionId);return kept?{...kept}:null;},enumerable:true},
  /* C7a: favourites and recents, the module the PC and the device use (preferenze-modelli.mjs), in a file of this profile */
  /* C7b: memory and disk, the module the PC measures with: no process, no engine */
  capacitaMacchinaCli:{value:async()=>(await importTalosModule(repoRoot,'machine-capacity.mjs')).misuraCapacitaMacchina({storagePath:paths.dataRoot}),enumerable:true},
  preferenzeModelliCli:{value:async(action?:unknown)=>{modelPreferences??=(await importTalosModule(repoRoot,'preferenze-modelli.mjs')).createPreferenzeModelli({file:join(paths.dataRoot,'model-preferences.json'),avvisa:()=>{}});return action?modelPreferences.applica(action):modelPreferences.leggi();},enumerable:true},
  gestioneContesto:{value:(input:{sessionId:string;method:string;path?:string;body?:unknown})=>contextBridge?.manage(input)??null,enumerable:true},
  ...(typeof registry?.elimina==='function'?{elimina:{value:async(sessionId:string,...rest:unknown[])=>{const outcome=await registry.elimina(sessionId,...rest);if(outcome?.ok===true)lightenedBySession.delete(sessionId);return outcome;},enumerable:true}}:{}),statoContesto:{value:(sessionId:string)=>contextBridge.status(sessionId),enumerable:true},chiudiContesto:{value:()=>contextBridge.close(),enumerable:false},
  ...(typeof registry?.iscriviti==='function'?{iscriviti:{value:subscribeWithCliEvents,enumerable:true}}:{}),
  ...(typeof registry?.shell==='function'?{shell:{value:(sessionId:string,comando:string)=>toolOutputScope.run({sessionId},()=>registry.shell(sessionId,comando)),enumerable:true}}:{})});
 let tuiCatalog:any=null;
 const modelImageCapability=async(runModel:string):Promise<boolean|null>=>{const provider=providerOfModel(runModel);if(!provider||!tuiCatalog)return null;try{const rows=await tuiCatalog.listModels({provider});return rows.find((row:any)=>row.id===runModel)?.images??null;}catch{return null;}};
 const materializeImage=async(attachment:any)=>{if(!chatImageStore)throw new CliRuntimeError('IMAGE_ATTACHMENT_UNAVAILABLE','Image attachment storage is unavailable.');const name=String(attachment.path).split('/').at(-1)||'image';return chatImageStore.upload({nome:name,dataUrl:`data:${attachment.mimeType};base64,${attachment.dataBase64}`});};
 const sessionList={probe:()=>probeSessionListIndexByEntry({dataRoot:paths.dataRoot,sessionsRoot:paths.sessionsRoot,repoRoot}),commit:(stamp:unknown,rows:unknown[])=>commitSessionListIndex({dataRoot:paths.dataRoot,sessionsRoot:paths.sessionsRoot,repoRoot,stamp:stamp as any,rows})};
 modelSees.current=modelImageCapability;
 const runtime=createSessionFacade(sessionRegistry,{beforePersonSend:()=>folderTrust.refresh(),folderTrust:()=>folderTrust.current(),model,origin:'talos-cli',nobodyInFront:!askPerson,sessionList:sessionList as any,modelImageCapability,materializeImage});
 /* Second review of 0.6.2 (13/10/2026, B1): the plan's list asked for a model's window (`planWindow`, above) is not awaited past
    its 2 s; closing the runtime — the end of a `-p` run, the screen that left — ends it, so it does not hold the exit. */
 /* Third review of 0.6.2 (13/10/2026, S1): the plan's token work on its way — a renewal, a sign-in's exchange, a sign-out, the
    requests that are never stopped — is waited for FIRST, bounded (chatgpt-plan.ts `TOKEN_WORK_EXIT_LIMIT_MS`, 15 s): `main`
    awaits this close before it returns, so the exit backstop (two seconds after `main`) can no longer cut a renewal whose refresh
    token OpenAI has already rotated. Before the reads are stopped: a sign-in's exchange is followed by two reads of its own.
    With nothing on its way (every exit but that one) nothing is waited. The same close serves `-p` and the screen. */
 {const closeRuntime=typeof (runtime as any).close==='function'?(runtime as any).close.bind(runtime):null;if(closeRuntime)(runtime as any).close=async(...args:unknown[])=>{
  /* fourth review of 0.6.2 (S-1, S-2): said after a second when it is the person's exit that waits; a runtime the supervisor replaces waits two seconds and says nothing */
  const replacing=(args[0] as {replacing?:boolean}|undefined)?.replacing===true;
  /* review of 0.6.3 (S4): what a replaced runtime leaves on its way is kept for the process, and the person's exit waits for it too */
  const waiting=replacing?chatgptPlan.settleTokenWork({limitMs:TOKEN_WORK_REPLACE_LIMIT_MS}).then(settled=>{if(settled.timedOut)keepLeftBehind(chatgptPlan.settleTokenWork());}):Promise.all([chatgptPlan.settleTokenWork(),settleLeftBehind()]).then(()=>{});
  await sayIfSlow(waiting,TOKEN_WORK_NOTICE_MS,()=>{if(!replacing)writeExitNotice(`${t('key.chatgpt.exit.finishing')}\n`);});
  /* Review 1 of 0.6.13 (S2-1): the person who leaves right after the turn that crossed the threshold had a summary sent, paid and then
     cut by the exit backstop, its record lost. The screen's exit waits for it, bounded (END_OF_TURN_SUMMARY_EXIT_LIMIT_MS) and said
     after a second, as tracked work is drained before a process ends (`outstanding`, `wait-promises`; Hermes waits 10 s on its
     gateway's stop). Past the bound it is left, as before. `-p` never starts one (`riassuntoDiFineGiro` above). */
  if(!replacing&&askPerson)await sayIfSlow(settleEndOfTurnSummaries(),TOKEN_WORK_NOTICE_MS,()=>writeExitNotice(`${t('common.exit.summaryFinishing',{seconds:END_OF_TURN_SUMMARY_EXIT_LIMIT_MS/1000})}\n`));
  chatgptPlan.stopRequests();return closeRuntime(...args);};}
 /* the registry's own answer, read every 100 ms: `statoCompattazione(id).inCorso` is true while a background summary is on its way */
 /* r4 4e4004950: the registry's own wait (`attendiRiassuntoDiFineGiro`) covers the turn still settling, when the summary is decided
    but not yet started, which `statoCompattazione().inCorso` did not see (review 2 of 0.6.13, S4-1). One bound for all sessions. */
 async function settleEndOfTurnSummaries(){
  const until=Date.now()+END_OF_TURN_SUMMARY_EXIT_LIMIT_MS;
  if(typeof registry.attendiRiassuntoDiFineGiro==='function'){
   await Promise.all([...sessionsRun].map(id=>Promise.resolve().then(()=>registry.attendiRiassuntoDiFineGiro(id,{attesaMassimaMs:Math.max(0,until-Date.now())})).catch(()=>null)));
   return;
  }
  const running=()=>[...sessionsRun].some(id=>{try{return registry.statoCompattazione?.(id)?.inCorso===true;}catch{return false;}});
  while(running()&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(modelCheckpointStore&&typeof registry.attendiAssestamento==='function')runtime.modelCheckpoints={
  projectRoot:modelCheckpointStore.projectRoot,rootDir:modelCheckpointStore.rootDir,
  async canDefer(){
   // Startup hooks and extension processes can mutate before the kernel tool barrier.
   /* F-H-001: every place the kernel reads hooks, servers and plugins from, `.talos/…` included. */
   const possible=await Promise.all([...PROJECT_CONFIG_FILES.hooks,...PROJECT_CONFIG_FILES.mcp,'.talos/plugins','.harness-ui-plugins'].map(relative=>join(projectRoot,relative)).concat(join(paths.dataRoot,'forge')).map(async pathname=>{
    try{await lstat(pathname);return true;}catch(error){return (error as NodeJS.ErrnoException).code!=='ENOENT';}
   }));
   return !possible.some(Boolean);
  },
  /* D1: settling waits for the turn; a checkpoint that failed was already said and never fails the turn */async settle(sessionId:string){await registry.attendiAssestamento(sessionId);},
 };
 attachKeyOrigin(runtime,(runModel:string)=>{const provider=providerOfModel(runModel);if(!provider)return null;let publicRow:any=null;try{publicRow=(providerStore.listPublic?.()??[]).find((row:any)=>row?.id===provider)??null;}catch{publicRow=null;}return describeKeyOrigin({registry:providerRegistry,provider,publicRow,storeEnv:storeEnvironment(),mode:environmentKeys,store:credentialStore?.kind??null});});
 /* The probe over the saved keys. B1 slice 18: listing, probing and `talos provider test` all build it here, and none of them passes
    `consentiGenerazione`; only the key test's own probe (`createKeyProbe`) may, for a provider that declares its minimal request. */
 /* 14/10/2026 (owner: «the Z.AI key only to the address you chose»): the CLI's own network doors (the provider probe behind the status
    row, a check and the model list; the key test; the catalog's requests) refuse a request to a Z.AI address other than the chosen
    one before it leaves. A run is refused earlier (prontoFn) and the kernel probes nothing (zaiSoloIndirizzo). */
 const zaiDoor=(input:any,init?:any)=>{let runtime:unknown=null;try{runtime=providerStore.getRuntime?.(ZAI_PROVIDER);}catch{runtime=null;}const url=typeof input==='string'?input:input instanceof URL?input.href:String(input?.url??input);if(!zaiRequestAllowed(url,runtime))return Promise.reject(Object.assign(new TypeError('This Z.AI address was not chosen, so nothing was sent to it.'),{code:'PROVIDER_ADDRESS_REQUIRED'}));return fetch(input,init);};
 const storeProbe=(callerSignal?:AbortSignal)=>{if(typeof m.createProviderProbe!=='function')return{prova:async()=>{throw Object.assign(new Error('PROVIDER_PROBE_UNAVAILABLE'),{code:'PROVIDER_PROBE_UNAVAILABLE'});},elencaModelli:async()=>{throw Object.assign(new Error('PROVIDER_CATALOG_UNAVAILABLE'),{code:'PROVIDER_CATALOG_UNAVAILABLE'});}};const fetchImpl=(input:any,init:any={})=>{const internal=init?.signal as AbortSignal|undefined;let signal=callerSignal??internal;if(callerSignal&&internal)signal=AbortSignal.any([internal,callerSignal]);return zaiDoor(input,{...init,...(signal?{signal}:{})});};const probe=m.createProviderProbe({leggiChiave:(id:string)=>{try{return providerStore.getKey?.(id)??null;}catch{return null;}},leggiRuntime:(id:string)=>{try{return providerStore.getRuntime?.(id)??{};}catch{return{};}},fetchImpl,env});
  /* review of 0.6.4 (S5): Z.AI with no address chosen is answered here, before the probe: its door refuses the request, and the probe
     called that «unreachable» (remedy «check the endpoint») when the answer is «choose an address» */
  const unchosen=()=>{let runtime:unknown=null;try{runtime=providerStore.getRuntime?.(ZAI_PROVIDER);}catch{runtime=null;}return!zaiAddressChosen(runtime);};
  return{...probe,prova:async(id:string,...rest:any[])=>id===ZAI_PROVIDER&&unchosen()?{provider:id,esito:'non-provabile',codice:'PROVIDER_ADDRESS_REQUIRED',motivo:t('key.zai.addressRequired')}:probe.prova(id,...rest)};};
 const providerControlPlane=createProviderControlPlane({
  publicProviders:()=>{try{return providerStore.listPublic?.()??[];}catch{return[];}},registry:providerRegistry,
  runtimeFor:(id:string)=>{try{return providerStore.getRuntime?.(id)??{};}catch{return{};}},keyFor:(id:string)=>{try{return providerStore.getKey?.(id)??null;}catch{return null;}},
  createProbe:storeProbe,environmentKey:(id:string)=>environmentKeys==='use'?null:consent.stateFor(id),
  signedIn:(id:string)=>id===CHATGPT_PROVIDER?chatgptPlan.signedIn():null,
  /* testing the plan: signed in with the plan enabled, and its model list answers. ⛔ Never a generation: nothing the plan pays for. */
  /* Second review of 0.6.2 (13/10/2026). B1: the check's signal was dropped here, so the list's request outlived the screen; it
     travels with the request now (chatgpt-plan.ts `boundedPlanFetch`). N3: the verdict is stated — the plan's list answered a
     request made with the plan's token, which is the provider accepting the credential (`credenzialeVerificata:true`, the same
     contract as a key's, provider-probe.mjs CLI-REQ-06) — instead of leaving the badge to read «no verdict» as a yes. */
  signInProbe:async(id:string,signal?:AbortSignal)=>{
   if(id!==CHATGPT_PROVIDER)return{provider:id,esito:'non-sondabile'};
   let plan=chatgptPlan.loaded();if(!plan&&chatgptPlan.stored()){try{plan=await chatgptPlan.load();}catch{plan=null;}}
   const state=plan?.state()??null;
   if(!plan||!state?.connected||!state.planEnabled)return{provider:id,esito:'non-provabile',codice:'PROVIDER_KEY_MISSING'};
   const started=Date.now();
   try{await plan.models({reload:true,...(signal?{signal}:{})});return{provider:id,esito:'collegato',credenzialeVerificata:true,millisecondi:Date.now()-started};}
   catch(error){const code=String((error as any)?.code??'');return{provider:id,esito:code==='CHATGPT_RETE'?'irraggiungibile':code==='CHATGPT_ACCESSO_SCADUTO'||code==='CHATGPT_NON_COLLEGATO'?'non-provabile':'errore',codice:code==='CHATGPT_ACCESSO_SCADUTO'||code==='CHATGPT_NON_COLLEGATO'?'PROVIDER_KEY_MISSING':code};}
  },
 });
 tuiCatalog=createTuiCatalogService({
  /* P21: OpenRouter sign-in with the kernel's PKCE module (the checkout's, or the package's vendor copy). */
  openRouterLogin:async(input?:{paste?:boolean})=>{const {loadOpenRouterOAuth,startOpenRouterLogin}=await import('../provider/openrouter-login.ts');return startOpenRouterLogin({oauth:await loadOpenRouterOAuth(repoRoot),...(input?.paste?{paste:true}:{})});},
  publicProviders:()=>{try{return providerStore.listPublic?.()??[];}catch{return[];}},registry:m.REGISTRO_FORNITORI??{},
  runtimeFor:(id:string)=>{try{return providerStore.getRuntime?.(id)??{};}catch{return{};}},keyFor:(id:string)=>{try{return providerStore.getKey?.(id)??null;}catch{return null;}},
  setKey:(id:string,secret:string)=>{if(typeof providerStore.setKey!=='function')throw Object.assign(new Error('PROVIDER_STORE_UNAVAILABLE'),{code:'PROVIDER_STORE_UNAVAILABLE'});providerStore.setKey(id,secret);},
  /* 14/10/2026 (owner): the Z.AI address the person chose; the store marks it chosen (`endpointConfigured`) */
  setEndpoint:(id:string,endpoint:string)=>{if(typeof providerStore.setRuntime!=='function')throw Object.assign(new Error('PROVIDER_STORE_UNAVAILABLE'),{code:'PROVIDER_STORE_UNAVAILABLE'});providerStore.setRuntime(id,{endpoint});},
  clearKey:(id:string)=>{if(typeof providerStore.clearKey!=='function')throw Object.assign(new Error('PROVIDER_STORE_UNAVAILABLE'),{code:'PROVIDER_STORE_UNAVAILABLE'});providerStore.clearKey(id);},
  createProbe:storeProbe,
  persistModel:(id:string)=>configSet({paths,projectRoot,scope:'project-user',path:'model',value:id}),
  /* ⛔ The candidate key is readable ONLY for the provider it is being tested against, and the probe builds
     the request from that provider's own endpoint: the key cannot reach another provider through this door. */
  createKeyProbe:(provider:string,secret:string,callerSignal?:AbortSignal)=>{if(typeof m.createProviderProbe!=='function')return{prova:async()=>({provider,esito:'non-provabile',motivo:'probe unavailable'})};const fetchImpl=(input:any,init:any={})=>{const internal=init?.signal as AbortSignal|undefined;let signal=callerSignal??internal;if(callerSignal&&internal)signal=AbortSignal.any([internal,callerSignal]);return zaiDoor(input,{...init,...(signal?{signal}:{})});};return m.createProviderProbe({leggiChiave:(id:string)=>id===provider?secret:null,leggiRuntime:(id:string)=>{try{return providerStore.getRuntime?.(id)??{};}catch{return{};}},fetchImpl,env});},
  fetchImpl:(url:string,init:RequestInit)=>zaiDoor(url,init),
  environmentKey:(id:string)=>environmentKeys==='use'?null:consent.stateFor(id),
  answerEnvironmentKey,
  chosenProvider:()=>consent.chosenProvider(),
  chooseProvider:(id:string)=>consent.chooseProvider(id),
  controlPlane:providerControlPlane,chatgpt:chatgptPlan,
  /* C1R: the provider-readiness snapshot the resume reads instead of awaiting a probe (stale-while-revalidate).
     `ensureCliPaths` creates `cacheRoot` before the composition builds; the snapshot never invents directories. */
  providerStateFile:join(paths.cacheRoot,'provider-state.json'),
 });
 /* 0.6.15 remote control (src/remote/host.ts): the kernel's HTTP handler, created in process, wants the chat image store and the
    plan's model list in the shape of `creaCatalogoChatgpt` (`elenca()`); the plan is opened only when a phone asks for it */
 const chatgptCatalog={async elenca(){const plan=await chatgptPlan.load();if(!plan)throw Object.assign(new Error('CHATGPT_NOT_CONNECTED'),{code:'CHATGPT_NOT_CONNECTED'});return plan.models();}};
 return{runtime,registry:sessionRegistry,providerStore,ownerRuntime,searchSourceStore,tuiCatalog,providerProbe:storeProbe,providerControlPlane,credentialStore,chatgptAccess:chatgptPlan.kernelFacade,usableModels,chatImageStore,chatgptCatalog,/* remote control's keyring: the same scoped store, so the kernel's talos-harness-remote is talos-cli-remote here (remapService) */remoteKeyring:cliKeyring,
  /* T6: the interactive window hands the registry its remote tool coordinator (tui-remote-main.ts) */
  setRemoteTools:(fn:(()=>unknown)|null)=>{remoteTools.current=fn;}};}
