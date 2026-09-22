import {AsyncLocalStorage} from 'node:async_hooks';import {randomUUID} from 'node:crypto';import {rm} from 'node:fs/promises';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import type {CliPaths} from '../paths.ts';import {createSessionFacade} from './session-facade.ts';import {CliRuntimeError} from './types.ts';import {createTalosSystemKeyring} from '../provider/system-keyring.ts';import {configSet} from '../config/commands.ts';import {createTuiCatalogService,keyBench,unusableKeyRefusal} from '../tui/catalog-service.ts';import {createGuardedPluginTrustVerifier,pluginReviewFromSnapshot,scanPluginPackage} from '../security/plugin-guard.ts';import {createTrustAuthority} from '../security/trust-authority.ts';import {createBrokeredKernelExecutor,type KernelTextHelpers} from './brokered-executor.ts';import type {ExecutionBroker} from '../security/execution-broker.ts';import {attachKeyOrigin,createEnvironmentKeyConsent,describeKeyOrigin,providerOfModel,type EnvironmentKeyMode} from '../provider/environment-keys.ts';import {createProviderControlPlane} from '../provider/control-plane.ts';
type RawKeyring={get(service:string,account:string):any;set(service:string,account:string,value:string):any;remove(service:string,account:string):any};
type Modules={
 createProviderCredentialStore:(x:any)=>any;createOwnerRuntimeAdapter:(x:any)=>any;creaFetchMultiProvider?:(fetchDiRete:any,options:any)=>any;compattaSessione?:(x:any)=>Promise<any>;chiediAlModelloUnaVolta?:(x:any)=>Promise<string>;avviaSessione:(x:any)=>Promise<any>;eseguiComandoDiretto?:(x:any)=>Promise<any>;createSessionRegistry:(x:any)=>any;
 verificaTrustPlugin?:(x:any)=>Promise<boolean>;caricaPlugin?:(x:any)=>Promise<any>;fidaPlugin?:(x:any)=>Promise<any>;caricaHooks?:(x:any)=>Promise<any>;fidaHook?:(x:any)=>Promise<any>;eseguiHook?:(x:any)=>Promise<any>;caricaServerMcp?:(x:any)=>Promise<any>;fidaServerMcp?:(x:any)=>Promise<any>;preparaToolMcpPerSessione?:(x:any)=>Promise<any>;nomeEspostoMcp?:(serverId:string,toolName:string)=>string;preparaToolPluginPerSessione?:(x:any)=>Promise<any>;
 createSearchSourceStore?:(x:any)=>any;creaTrasportoSenzaChiave?:()=>any;ENDPOINT_SENTINELLA_DUCKDUCKGO?:string;REGISTRO_FORNITORI?:Record<string,any>;createProviderProbe?:(x:any)=>any;separaFonteModello?:(modello:string)=>{fonte:string;modelloRemoto:string};creaProntoFn?:(x:{providerStore:any;chiaveApi:string|null})=>(modello:unknown)=>any;createChatImageStore?:(x:any)=>any
}
function remapService(s:string){return s.replace(/^talos-harness-/u,'talos-cli-');}
function contextProfileValue(value:unknown):number|null{return Number.isSafeInteger(value)&&Number(value)>0?Number(value):null;}
function createCliContextBridge({repoRoot,paths,registry,providerRegistry,providerStore,ownerRuntime,chatImageStore,separaFonteModello}:{repoRoot:string;paths:CliPaths;registry:any;providerRegistry:Record<string,any>;providerStore:any;ownerRuntime:any;chatImageStore:any;separaFonteModello?:((model:string)=>{fonte:string;modelloRemoto:string})}){
 const profileForSelection=(selected:any)=>{
  const provider=typeof selected?.provider==='string'?selected.provider:null,model=typeof selected?.model==='string'?selected.model:null;
  if(!provider||!model)return null;
  if(contextProfileValue(selected.windowTokens)&&contextProfileValue(selected.responseReserve)&&selected.windowTokens>selected.responseReserve)return selected;
  const record=providerRegistry[provider]??{};
  let runtime:any={};try{runtime=providerStore.getRuntime?.(provider)??{};}catch{runtime={};}
  const rows=[...(Array.isArray(runtime.modelli)?runtime.modelli:[]),...(Array.isArray(record.modelliNoti)?record.modelliNoti:[]),...(Array.isArray(record.modelliDiRiserva)?record.modelliDiRiserva:[])];
  const row=rows.find((candidate:any)=>{
   const raw=String(candidate?.id??candidate?.modelId??'');
   return raw===model||raw===provider+':'+model;
  });
  if(!row)return null;
  const windowTokens=contextProfileValue(row.contextLength??row.contextWindow??row.max_context_length??row.maxInputTokens);
  const responseReserve=contextProfileValue(row.maxOutputTokens??row.max_output_tokens??row.outputTokenLimit);
  if(!windowTokens||!responseReserve||windowTokens<=responseReserve)return null;
  return{provider,model,windowTokens,responseReserve,profileEvidence:{source:typeof row.fonteMetadati==='string'?row.fonteMetadati:typeof row.fonte==='string'?row.fonte:'configured runtime',date:typeof row.dataMetadati==='string'?row.dataMetadati:typeof row.data==='string'?row.data:null}};
 };
 const profileForSession=(sessionId:string,session?:any)=>{
  session??=registry.leggiSessioneContesto?.(sessionId)??null;if(!session)return null;
  if(session.provider==='local')return null;
  let selected:any=null;try{selected=typeof separaFonteModello==='function'?separaFonteModello(String(session.modello??'')):null;}catch{selected=null;}
  if(!selected?.fonte||!selected?.modelloRemoto)return null;
  const profile=profileForSelection({provider:selected.fonte,model:selected.modelloRemoto});if(!profile)return null;
  return{...profile,requestOptions:session.reasoning==null?{}:{reasoning:structuredClone(session.reasoning)}};
 };
 let loaded:Promise<any>|null=null;
 const load=()=>loaded??=(async()=>{
  const contextRoot=join(repoRoot,'context-engine','src'),harnessRoot=join(repoRoot,'harness-ui','src');
  const [engineModule,storeModule,adapterModule,serviceModule,counterModule]=await Promise.all([
   import(pathToFileURL(join(contextRoot,'engine.mjs')).href),
   import(pathToFileURL(join(contextRoot,'node','sqlite-store.mjs')).href),
   import(pathToFileURL(join(harnessRoot,'context-provider-adapter.mjs')).href),
   import(pathToFileURL(join(harnessRoot,'context-desktop-service.mjs')).href),
   import(pathToFileURL(join(harnessRoot,'context-token-counters.mjs')).href),
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
   fetchFn:(url:string,options:any)=>fetch(url,options),
  });
  const adapter=adapterModule.createContextModelAdapter({
   resolveModel:({sessionModel,settings}:any)=>{
    const selected=settings?.model?.mode==='explicit'?settings.model:sessionModel;
    const profile=profileForSelection(selected);
    if(!profile)throw Object.assign(new Error('Context profile unavailable.'),{code:'CTX_MODEL_NOT_CONFIGURED'});
    return profile;
   },
   callModel:(request:any)=>ownerRuntime.callContextModel(request),
  });
  const engine=engineModule.createContextEngine({store,model:adapter,tokenCounter});
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
  });
  await store.health();
  return{store,service};
 })();
 const ensureSettings=async(service:any,sessionId:string)=>{
  for(let attempt=0;attempt<2;attempt++){
   const snapshot=await service.request({sessionId,method:'GET',path:'/'});
   const currentTarget=typeof snapshot?.settings?.targetRatio==='number'?snapshot.settings.targetRatio:null;
   const targetRatio=currentTarget!==null&&currentTarget>0&&currentTarget<0.5?currentTarget:0.49;
   if(snapshot?.settings?.auto===true&&snapshot?.settings?.triggerRatio===0.5&&snapshot?.settings?.targetRatio===targetRatio)return snapshot;
   try{
    await service.request({sessionId,method:'PATCH',path:'/settings',body:{expectedRevision:snapshot.revision,idempotencyKey:'cli-m6e-'+randomUUID(),patch:{auto:true,triggerRatio:0.5,targetRatio}}});
    return service.request({sessionId,method:'GET',path:'/'});
   }catch(error){if((error as any)?.code!=='CTX_STALE_REVISION'||attempt===1)throw error;}
  }
  return service.request({sessionId,method:'GET',path:'/'});
 };
 return{
  async hooks(input:any){const profile=profileForSession(input.sessionId);if(!profile)return undefined;const {service}=await load();await ensureSettings(service,input.sessionId);return service.createKernelHooks(input);},
  async compact(input:any){const profile=profileForSession(input.sessionId);if(!profile)return undefined;const {service}=await load();await ensureSettings(service,input.sessionId);return service.compact(input);},
  async status(sessionId:string){
   const profile=profileForSession(sessionId);if(!profile)return{unavailableReason:'profile-unavailable'};
   const {store}=await load();const snapshot=await store.readContextSnapshot({sessionId});
   const currentTarget=typeof snapshot?.settings?.targetRatio==='number'?snapshot.settings.targetRatio:null;
   const targetRatio=currentTarget!==null&&currentTarget>0&&currentTarget<0.5?currentTarget:0.49;
   const effective=snapshot??{revision:0,measurement:null,activeVersion:null};
   return{...effective,settings:{...(snapshot?.settings??{}),auto:true,triggerRatio:0.5,targetRatio},cliProfileEvidence:profile.profileEvidence??null};
  },
  async close(){if(!loaded)return;const {service,store}=await loaded;try{await service.close();}finally{await store.close();}},
 };
}

export function scopeCliKeyring(raw:RawKeyring|null|undefined){if(!raw)return null;return{get:(s:string,a:string)=>raw.get(remapService(s),a),set:(s:string,a:string,v:string)=>raw.set(remapService(s),a,v),remove:(s:string,a:string)=>raw.remove(remapService(s),a)};}
/** The kernel modules the product composes with. Exported so a test can observe one of them while every other stays the production one. */
export async function loadModules(repoRoot:string):Promise<Modules>{const src=join(repoRoot,'harness-ui','src');const [cred,owner,agent,sessions,plugins,search,duck,providerRegistry,probe,destination,readiness,chatImages]=await Promise.all([import(pathToFileURL(join(src,'provider-credential-store.mjs')).href),import(pathToFileURL(join(src,'runtime-owner-adapter.mjs')).href),import(pathToFileURL(join(src,'agent-service.mjs')).href),import(pathToFileURL(join(src,'session-registry.mjs')).href),import(pathToFileURL(join(src,'plugin-registry.mjs')).href),import(pathToFileURL(join(src,'search-source-store.mjs')).href),import(pathToFileURL(join(src,'duckduckgo-search.mjs')).href),import(pathToFileURL(join(src,'provider-registry.mjs')).href),import(pathToFileURL(join(src,'provider-probe.mjs')).href),import(pathToFileURL(join(src,'model-destination.mjs')).href),import(pathToFileURL(join(src,'sessione-pronta.mjs')).href),import(pathToFileURL(join(src,'chat-image-attachments.mjs')).href)]);return{createProviderCredentialStore:cred.createProviderCredentialStore,createOwnerRuntimeAdapter:owner.createOwnerRuntimeAdapter,creaFetchMultiProvider:owner.creaFetchMultiProvider,compattaSessione:agent.compattaSessione,chiediAlModelloUnaVolta:agent.chiediAlModelloUnaVolta,avviaSessione:agent.avviaSessione,eseguiComandoDiretto:agent.eseguiComandoDiretto,createSessionRegistry:sessions.createSessionRegistry,verificaTrustPlugin:plugins.verificaTrustPlugin,createSearchSourceStore:search.createSearchSourceStore,creaTrasportoSenzaChiave:duck.creaTrasportoSenzaChiave,ENDPOINT_SENTINELLA_DUCKDUCKGO:duck.ENDPOINT_SENTINELLA_DUCKDUCKGO,REGISTRO_FORNITORI:providerRegistry.REGISTRO_FORNITORI,createProviderProbe:probe.createProviderProbe,separaFonteModello:destination.separaFonteModello,creaProntoFn:readiness.creaProntoFn,createChatImageStore:chatImages.createChatImageStore};}
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
function forwardingStore(current:()=>any,shape:any){const out:Record<string,unknown>={};for(const name of Object.keys(shape??{})){if(typeof shape[name]==='function')out[name]=(...args:unknown[])=>current()[name](...args);}return Object.freeze(out);}
export async function composeTalosRuntime({repoRoot,projectRoot,paths,model,env=process.env,environmentKeys='consent',modules,keyring,brokerFactory}:{repoRoot:string;projectRoot:string;paths:CliPaths;model:string;env?:Record<string,string|undefined>;environmentKeys?:EnvironmentKeyMode;modules?:Modules;keyring?:RawKeyring|null;brokerFactory?:(options:{paths:{cacheRoot:string};platform:NodeJS.Platform})=>ExecutionBroker}){const m=modules??await loadModules(repoRoot);const trustM:Modules=modules?m:{...m,...await loadTrustSupport(repoRoot)};const raw=keyring===undefined?createTalosSystemKeyring(repoRoot):keyring;const cliKeyring=scopeCliKeyring(raw);
 const providerRegistry=m.REGISTRO_FORNITORI??{};const consent=createEnvironmentKeyConsent({dataRoot:paths.dataRoot,registry:providerRegistry,env});
 const storeEnvironment=()=>environmentKeys==='use'?env:consent.environmentForStore();
 const buildStore=()=>{const built=m.createProviderCredentialStore({env:storeEnvironment(),keyring:cliKeyring,runtimeFile:join(paths.dataRoot,'provider-runtime.json')});built.loadFromKeyring?.();return built;};
 let currentStore=buildStore();
 const providerStore=environmentKeys==='use'?currentStore:forwardingStore(()=>currentStore,currentStore);
 const answerEnvironmentKey=(id:string,answer:'yes'|'no')=>{consent.answer(id,answer);currentStore=buildStore();};const kernel=join(repoRoot,'harness-ui','src','kernel','talosHarness.mjs');
 const destinazioneModelloDeps={leggiChiave:(p:string)=>{try{return providerStore.getKey(p);}catch{return null;}},leggiRuntime:(p:string)=>{try{return providerStore.getRuntime(p);}catch{return{};}},localePronto:()=>false};
 const chatImageStore=typeof m.createChatImageStore==='function'?m.createChatImageStore({rootDir:join(paths.dataRoot,'chat-images')}):null;
 const ownerRuntime=m.createOwnerRuntimeAdapter({modulePath:kernel,providerStore,openRouterRuntimeFn:()=>{try{return providerStore.getRuntime('openrouter');}catch{return{timeoutSeconds:60};}},destinazioneModelloDeps,...(chatImageStore?{resolveImagesFn:(messages:any[])=>chatImageStore.resolveMessages(messages)}:{})});
 let taskCatalogProvider=null;try{taskCatalogProvider=await ownerRuntime.taskCatalogProvider?.();}catch{taskCatalogProvider=null;}
 let searchSourceStore:any=null;let ricercaWebFn:any=undefined;if(m.createSearchSourceStore){searchSourceStore=m.createSearchSourceStore({env,keyring:cliKeyring,file:join(paths.dataRoot,'search-source.json')});const transport=m.creaTrasportoSenzaChiave?.();ricercaWebFn=()=>searchSourceStore.perKernel({trasportoSenzaChiave:transport,sentinellaDuckDuckGo:m.ENDPOINT_SENTINELLA_DUCKDUCKGO});}
 const trustAuthority=createTrustAuthority({projectRoot,trustRoot:paths.trust.projects});
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
 async function writeMcpMirror(serverId:string,hash:string){const roots=await trustAuthority.compatibilityRoots();await rm(join(roots.mcp,`${serverId}.json`),{force:true});if(typeof trustM.fidaServerMcp==='function')await trustM.fidaServerMcp({cartellaTrust:roots.mcp,serverId,hash});}
 async function writePluginMirror(pluginId:string,hash:string){const roots=await trustAuthority.compatibilityRoots();await rm(join(roots.plugins,`${pluginId}.json`),{force:true});if(typeof trustM.fidaPlugin==='function')await trustM.fidaPlugin({cartellaTrust:roots.plugins,pluginId,hash});}
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
  const cleanup=()=>Promise.all([rm(roots.mcp,{recursive:true,force:true}),rm(roots.plugins,{recursive:true,force:true})]).then(()=>undefined);
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
 const brokeredExecutor=createBrokeredKernelExecutor({
  kernel:async()=>(await import(pathToFileURL(kernel).href)) as unknown as KernelTextHelpers,
  ...(brokerFactory?{
   broker:brokerFactory({paths:{cacheRoot:paths.cacheRoot},platform:process.platform}),
   /* F16 hardening: the shipped Windows CLI executes shell work only inside verified AppContainer/BFS isolation. */
   network:'deny',
   requiredEnforcement:'windows-sandbox',
   requireVerifiedIsolation:true,
  }:{}),
 });
 /* M1-E: model-owned shell uses the same CLI broker as the direct-command path.
    Broker assignment is last so runtime input cannot replace the product-selected executor. */
 const talosLavoraConBroker=(runtimeInput:any)=>ownerRuntime.talosLavora({...runtimeInput,eseguiComandoSandboxatoFn:brokeredExecutor});
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
  return fetch(input,init);
 };
 const auxiliaryFailure=(error:any,modello:unknown)=>{
  if(error?.code!=='PROVIDER_KEY_MISSING')return error;
  const prefix=providerOfModel(String(modello??''));const provider=prefix&&Object.hasOwn(providerRegistry,prefix)?prefix:'openrouter';const label=String(providerRegistry[provider]?.etichetta??provider);
  return new CliRuntimeError('PROVIDER_KEY_MISSING',`The ${label} key is missing, so nothing was sent to ${label}. Add it with /provider.`,{provider});
 };
 const auxiliaryRoute=()=>{
  const unavailable=()=>new CliRuntimeError('AUXILIARY_ROUTE_UNAVAILABLE','This TALOS kernel cannot route compaction or the research judge to the session provider, so nothing was sent.');
  if(typeof m.creaFetchMultiProvider!=='function')throw unavailable();
  const route=m.creaFetchMultiProvider(auxiliaryNetwork,{dipendenze:destinazioneModelloDeps,providerStore});
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
  return result;
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
  let fonte:string|null=null;
  try{fonte=typeof modello==='string'&&typeof m.separaFonteModello==='function'?m.separaFonteModello(modello).fonte:null;}catch{fonte=null;}
  const record=fonte&&Object.hasOwn(providerRegistry,fonte)?providerRegistry[fonte]:null;
  if(!fonte||!record)return{pronto:false,codice:'MODEL_DESTINATION_INVALID',messaggio:'The model of this session cannot be read, so nothing was sent. Choose one with /model.'};
  const fornitore=String(record.etichetta??fonte);
  let verdict:any=null;try{verdict=kernelReady?kernelReady(modello):null;}catch{verdict=null;}
  if(verdict?.pronto===true)return{pronto:true,fornitore};
  if(verdict?.pronto!==false)return{pronto:false,fornitore,codice:'KERNEL_READINESS_UNREADABLE',messaggio:`TALOS could not tell whether ${fornitore} can be used now, so nothing was sent.`};
  let row:any=null;try{row=(providerStore.listPublic?.()??[]).find((entry:any)=>entry?.id===fonte)??null;}catch{row=null;}
  const refusal=unusableKeyRefusal(fornitore,keyBench(row));
  return{pronto:false,fornitore,codice:refusal.code,messaggio:refusal.message};
 };
 async function prepareMcpWithAuthority(input:any){
  if(typeof trustM.preparaToolMcpPerSessione!=='function')return{toolMcp:[],chiamaToolMcpFn:null,falliti:[],chiudiTutti:async()=>{}};
  const loaded=typeof trustM.caricaServerMcp==='function'?await trustM.caricaServerMcp({cartella:projectRoot}):null;
  const prepared=await trustM.preparaToolMcpPerSessione(input);
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
 const registry=m.createSessionRegistry({
  prontoFn,fetchModelloFn:()=>auxiliaryRoute().fetchDiRete,compattaSessioneFn,chiediAlModelloUnaVoltaFn,
  contextHooksFn:(input:any)=>contextBridge?.hooks(input),contextCompactFn:(input:any)=>contextBridge?.compact(input),
  avviaSessioneFn:async(input:any)=>{
   if(!authoritySessionAdapters)return m.avviaSessione({...input,talosLavoraFn:talosLavoraConBroker});
   const compatibility=await sessionCompatibility();
   try{
    return await m.avviaSessione({...input,cartellaTrustMcp:compatibility.roots.mcp,cartellaTrustPlugin:compatibility.roots.plugins,...(trustM.preparaToolMcpPerSessione?{preparaToolMcpPerSessioneFn:prepareMcpWithAuthority}:{}),...(trustM.preparaToolPluginPerSessione?{preparaToolPluginPerSessioneFn:preparePluginWithAuthority}:{}),...(trustM.eseguiHook?{eseguiHookFn:executePluginHookWithAuthority}:{}),talosLavoraFn:talosLavoraConBroker});
   }finally{await compatibility.cleanup();}
  },
  modello:model,chiave:providerStore.getKey?.('openrouter')??'',chiaveFn:()=>providerStore.getKey?.('openrouter')??'',cartelleProgetto:[{id:'cli',nome:'CLI',percorso:projectRoot}],taskCatalogProvider,ricercaWebFn,cartellaStore:paths.sessionsRoot,
  cartellaTrustHook:paths.trust.hooks,cartellaTrustMcp:paths.trust.mcp,cartellaTrustPlugin:paths.trust.plugins,
  verificaTrustFn:verificaTrustHookFn,verificaTrustMcpFn,fidaHookFn,fidaServerMcpFn,verificaTrustPluginFn,statoTrustPluginFn,fidaPluginFn,
  cartellaNote:join(paths.dataRoot,'notes'),cartellaAttivita:join(paths.dataRoot,'tasks'),cartellaMemoria:join(paths.dataRoot,'memory'),cartellaForge:join(paths.dataRoot,'forge'),attrezziKernelFn:()=>ownerRuntime.attrezziKernel(),
  eseguiComandoDirettoFn:(input:any)=>{if(typeof m.eseguiComandoDiretto!=='function')throw Object.assign(new Error('KERNEL_COMMAND_PATH_UNAVAILABLE'),{code:'KERNEL_COMMAND_PATH_UNAVAILABLE'});return m.eseguiComandoDiretto({...input,eseguiComandoSandboxatoFn:brokeredExecutor});}
 });
 contextBridge=createCliContextBridge({repoRoot,paths,registry,providerRegistry,providerStore,ownerRuntime,chatImageStore,...(m.separaFonteModello?{separaFonteModello:m.separaFonteModello}:{})});
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
  const run=()=>compactionScope.run({sessionId,...compactionOf(sessionId)},()=>registry.compatta(sessionId));
  const result=compactionTail.then(run);
  compactionTail=result.then(()=>undefined,()=>undefined);
  return result;
 };
 const sessionRegistry=Object.create(registry,{...(typeof registry?.compatta==='function'?{compatta:{value:compactSession,enumerable:true}}:{}),statoContesto:{value:(sessionId:string)=>contextBridge.status(sessionId),enumerable:true},chiudiContesto:{value:()=>contextBridge.close(),enumerable:false}});
 let tuiCatalog:any=null;
 const modelImageCapability=async(runModel:string):Promise<boolean|null>=>{const provider=providerOfModel(runModel);if(!provider||!tuiCatalog)return null;try{const rows=await tuiCatalog.listModels({provider});return rows.find((row:any)=>row.id===runModel)?.images??null;}catch{return null;}};
 const materializeImage=async(attachment:any)=>{if(!chatImageStore)throw new CliRuntimeError('IMAGE_ATTACHMENT_UNAVAILABLE','Image attachment storage is unavailable.');const name=String(attachment.path).split('/').at(-1)||'image';return chatImageStore.upload({nome:name,dataUrl:`data:${attachment.mimeType};base64,${attachment.dataBase64}`});};
 const runtime=createSessionFacade(sessionRegistry,{model,origin:'talos-cli',modelImageCapability,materializeImage});
 attachKeyOrigin(runtime,(runModel:string)=>{const provider=providerOfModel(runModel);if(!provider)return null;let publicRow:any=null;try{publicRow=(providerStore.listPublic?.()??[]).find((row:any)=>row?.id===provider)??null;}catch{publicRow=null;}return describeKeyOrigin({registry:providerRegistry,provider,publicRow,storeEnv:storeEnvironment(),mode:environmentKeys});});
 /* The probe over the saved keys. B1 slice 18: listing, probing and `talos provider test` all build it here, and none of them passes
    `consentiGenerazione`; only the key test's own probe (`createKeyProbe`) may, for a provider that declares its minimal request. */
 const storeProbe=(callerSignal?:AbortSignal)=>{if(typeof m.createProviderProbe!=='function')return{prova:async()=>{throw Object.assign(new Error('PROVIDER_PROBE_UNAVAILABLE'),{code:'PROVIDER_PROBE_UNAVAILABLE'});},elencaModelli:async()=>{throw Object.assign(new Error('PROVIDER_CATALOG_UNAVAILABLE'),{code:'PROVIDER_CATALOG_UNAVAILABLE'});}};const fetchImpl=(input:any,init:any={})=>{const internal=init?.signal as AbortSignal|undefined;let signal=callerSignal??internal;if(callerSignal&&internal)signal=AbortSignal.any([internal,callerSignal]);return fetch(input,{...init,...(signal?{signal}:{})});};return m.createProviderProbe({leggiChiave:(id:string)=>{try{return providerStore.getKey?.(id)??null;}catch{return null;}},leggiRuntime:(id:string)=>{try{return providerStore.getRuntime?.(id)??{};}catch{return{};}},fetchImpl,env});};
 const providerControlPlane=createProviderControlPlane({
  publicProviders:()=>{try{return providerStore.listPublic?.()??[];}catch{return[];}},registry:providerRegistry,
  runtimeFor:(id:string)=>{try{return providerStore.getRuntime?.(id)??{};}catch{return{};}},keyFor:(id:string)=>{try{return providerStore.getKey?.(id)??null;}catch{return null;}},
  createProbe:storeProbe,environmentKey:(id:string)=>environmentKeys==='use'?null:consent.stateFor(id),
 });
 tuiCatalog=createTuiCatalogService({
  publicProviders:()=>{try{return providerStore.listPublic?.()??[];}catch{return[];}},registry:m.REGISTRO_FORNITORI??{},
  runtimeFor:(id:string)=>{try{return providerStore.getRuntime?.(id)??{};}catch{return{};}},keyFor:(id:string)=>{try{return providerStore.getKey?.(id)??null;}catch{return null;}},
  setKey:(id:string,secret:string)=>{if(typeof providerStore.setKey!=='function')throw Object.assign(new Error('PROVIDER_STORE_UNAVAILABLE'),{code:'PROVIDER_STORE_UNAVAILABLE'});providerStore.setKey(id,secret);},
  clearKey:(id:string)=>{if(typeof providerStore.clearKey!=='function')throw Object.assign(new Error('PROVIDER_STORE_UNAVAILABLE'),{code:'PROVIDER_STORE_UNAVAILABLE'});providerStore.clearKey(id);},
  createProbe:storeProbe,
  persistModel:(id:string)=>configSet({paths,projectRoot,scope:'project-user',path:'model',value:id}),
  /* ⛔ The candidate key is readable ONLY for the provider it is being tested against, and the probe builds
     the request from that provider's own endpoint: the key cannot reach another provider through this door. */
  createKeyProbe:(provider:string,secret:string,callerSignal?:AbortSignal)=>{if(typeof m.createProviderProbe!=='function')return{prova:async()=>({provider,esito:'non-provabile',motivo:'probe unavailable'})};const fetchImpl=(input:any,init:any={})=>{const internal=init?.signal as AbortSignal|undefined;let signal=callerSignal??internal;if(callerSignal&&internal)signal=AbortSignal.any([internal,callerSignal]);return fetch(input,{...init,...(signal?{signal}:{})});};return m.createProviderProbe({leggiChiave:(id:string)=>id===provider?secret:null,leggiRuntime:(id:string)=>{try{return providerStore.getRuntime?.(id)??{};}catch{return{};}},fetchImpl,env});},
  fetchImpl:(url:string,init:RequestInit)=>fetch(url,init),
  environmentKey:(id:string)=>environmentKeys==='use'?null:consent.stateFor(id),
  answerEnvironmentKey,
  chosenProvider:()=>consent.chosenProvider(),
  chooseProvider:(id:string)=>consent.chooseProvider(id),
  controlPlane:providerControlPlane,
 });
 return{runtime,registry:sessionRegistry,providerStore,ownerRuntime,searchSourceStore,tuiCatalog,providerProbe:storeProbe,providerControlPlane};}
