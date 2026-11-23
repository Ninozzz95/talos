import {CliRuntimeError,type CliRuntime} from './types.ts';
import type {TuiCatalogService} from '../tui/catalog-service.ts';

/*
 * Startup stage 1 (owner 02/10, «Entrambe, a tappe»; registro 12). Loading the kernel took ~0.25 s of the 0.60 s before the
 * composer, and the TUI was started only after it. Now the TUI starts at once with these stand-ins, and the kernel loads
 * behind them: every asynchronous call waits for the real object and then runs, in the order it was made; a send made
 * before the kernel is ready therefore waits and goes. Claude Code (changelog 2026: «you can start composing your prompt
 * while they come up in the background… the first message waits if needed»), Codex #21318 (responsive at once, the first
 * turn waits only for what it needs), t3code PR #13840 (the turn waits for startup before it is sent).
 * The few synchronous members: `setDefaultReasoningEffort` is kept and applied when ready (the last value wins); `subscribe`
 * subscribes when ready, and an unsubscribe made before that cancels it; `export` and the catalog's `keyTestNotice` have
 * nothing to say before the kernel exists (no session can exist yet; a key flow starts with an awaited call).
 * Once ready, every member passes straight through to the real object. If the kernel fails to load, every waiting call
 * and every later one fails with the kernel's own error, and `ready` rejects with it.
 */
export type RuntimeContextLike={runtime:CliRuntime;tuiCatalog?:TuiCatalogService|null;registry?:unknown};

export type DeferredRuntimeContext<P=unknown>={
  runtime:CliRuntime;catalog:TuiCatalogService;registry:unknown;
  /** The real context, once loaded and prepared; rejects with the kernel's (or prepare's) error. */
  ready:Promise<RuntimeContextLike>;
  /** What `prepare` returned (main: the configured reasoning effort and its notices, for the TUI). */
  prepared:Promise<P|null>;
  isReady():boolean;
};

/* `prepare` runs on the real context BEFORE any waiting call goes through: main applies the configured reasoning effort
   there, so a first prompt given on the command line already carries it (M4-D). An effort the person chose meanwhile is
   applied after it, so the person's choice wins. */
export function createDeferredRuntimeContext<P=unknown>(pending:Promise<RuntimeContextLike>,{prepare}:{prepare?:(context:RuntimeContextLike)=>Promise<P|null>}={}):DeferredRuntimeContext<P>{
  let real:RuntimeContextLike|null=null;
  let effort:{value:Parameters<CliRuntime['setDefaultReasoningEffort']>[0]}|null=null;
  let preparedValue:P|null=null;
  let checksStopped=false;
  const ready=pending.then(async context=>{
    if(prepare)preparedValue=await prepare(context);
    real=context;
    if(effort&&typeof context.runtime.setDefaultReasoningEffort==='function')context.runtime.setDefaultReasoningEffort(effort.value);
    return context;
  });
  const prepared=ready.then(()=>preparedValue);
  prepared.catch(()=>{/* reported through ready */});
  ready.catch(()=>{/* each waiting call reports the failure; this keeps it from being an unhandled rejection */});
  const later=<T>(use:(context:RuntimeContextLike)=>T|Promise<T>):Promise<T>=>ready.then(use);
  const catalogOf=(context:RuntimeContextLike):TuiCatalogService=>{
    if(!context.tuiCatalog)throw new CliRuntimeError('TUI_CATALOG_UNAVAILABLE','The model catalog is not available in this runtime');
    return context.tuiCatalog;
  };

  const runtime:CliRuntime={
    get modelCheckpoints(){return real?.runtime.modelCheckpoints;},
    restore:selection=>later(c=>c.runtime.restore(selection)),
    interruptedByPreviousProcess:()=>later(c=>c.runtime.interruptedByPreviousProcess?.()??Promise.resolve([])),
    start:input=>later(c=>c.runtime.start(input)),
    setDefaultReasoningEffort(value){if(real)real.runtime.setDefaultReasoningEffort?.(value);else effort={value};},
    setReasoningEffort:(id,value)=>later(c=>c.runtime.setReasoningEffort(id,value)),
    setPermissionMode:(id,mode)=>later(c=>c.runtime.setPermissionMode(id,mode)),
    resume:(id,prompt,attachments,options)=>later(c=>c.runtime.resume(id,prompt,attachments,options)),
    fork:(id,prompt,attachments,options)=>later(c=>c.runtime.fork(id,prompt,attachments,options)),
    setSessionModel:(id,model)=>later(c=>{if(typeof c.runtime.setSessionModel!=='function')throw new CliRuntimeError('SESSION_SETTINGS_UNAVAILABLE','The session settings are not available until the kernel is loaded.');return c.runtime.setSessionModel(id,model);}),
    steer:(id,prompt,attachments)=>later(c=>c.runtime.steer(id,prompt,attachments)),
    queueMessage:(id,prompt,attachments,options)=>later(c=>{if(!c.runtime.queueMessage)throw new Error('SESSION_QUEUE_UNAVAILABLE');return options?.attachIfTooLarge?c.runtime.queueMessage(id,prompt,attachments,{attachIfTooLarge:true}):c.runtime.queueMessage(id,prompt,attachments);}),
    unqueueMessage:(id,queuedId)=>later(c=>{if(!c.runtime.unqueueMessage)throw new Error('SESSION_QUEUE_UNAVAILABLE');return c.runtime.unqueueMessage(id,queuedId);}),
    compact:id=>later(c=>c.runtime.compact(id)),
    contextManager:(id,request)=>later(c=>c.runtime.contextManager?.(id,request)??null),
    requestTools:id=>later(c=>c.runtime.requestTools?.(id)??null),
    folderTrust:()=>real?.runtime.folderTrust?.()??null,
    processes:()=>later(c=>c.runtime.processes?.()??[]),
    stopProcess:(id,call)=>later(c=>c.runtime.stopProcess?.(id,call)??'unknown'),
    requestSent:id=>later(c=>c.runtime.requestSent?.(id)??null),
    machineCapacity:()=>later(c=>c.runtime.machineCapacity?.()??null),
    modelPreferences:action=>later(c=>c.runtime.modelPreferences?.(action)??null),
    contextStatus:id=>later(c=>{
      if(typeof c.runtime.contextStatus!=='function')throw new CliRuntimeError('CONTEXT_STATUS_UNAVAILABLE','Context status is not available in this runtime');
      return c.runtime.contextStatus(id);
    }),
    listSessions:options=>later(c=>c.runtime.listSessions(options)),
    subscribe(id,sink,from,options){
      if(real)return real.runtime.subscribe(id,sink,from,options);
      let off:(()=>void)|null=null;let cancelled=false;
      ready.then(c=>{if(!cancelled)off=c.runtime.subscribe(id,sink,from,options);},()=>{});
      return()=>{cancelled=true;const stop=off;off=null;stop?.();};
    },
    answerApproval:(id,requestId,approved,reason)=>later(c=>c.runtime.answerApproval(id,requestId,approved,reason)),
    answerQuestion:(id,requestId,response)=>later(c=>c.runtime.answerQuestion(id,requestId,response)),
    answerPlan:(id,choice)=>later(c=>c.runtime.answerPlan(id,choice)),
    answerElicitation:(id,requestId,response)=>later(c=>c.runtime.answerElicitation(id,requestId,response)),
    cancel:(id,options)=>later(c=>c.runtime.cancel(id,options)),
    deleteSession:id=>later(c=>c.runtime.deleteSession?c.runtime.deleteSession(id):Promise.reject(new CliRuntimeError('SESSION_DELETE_UNAVAILABLE'))),
    backgroundCommandCount:id=>later(c=>c.runtime.backgroundCommandCount?c.runtime.backgroundCommandCount(id):0),
    stopBackgroundCommands:(ids,options)=>later(c=>c.runtime.stopBackgroundCommands?c.runtime.stopBackgroundCommands(ids,options):Promise.resolve([])),
    shell:(id,command)=>later(c=>c.runtime.shell(id,command)),
    export:id=>real?real.runtime.export(id):null,
    capabilities:()=>real?.runtime.capabilities?.()??{forkBeforeRun:false,modelCheck:false},
    checkModel:model=>later(c=>c.runtime.checkModel?c.runtime.checkModel(model):Promise.reject(new CliRuntimeError('MODEL_CHECK_UNAVAILABLE'))),
    forkBeforeRun:(id,runId)=>later(c=>c.runtime.forkBeforeRun?c.runtime.forkBeforeRun(id,runId):Promise.reject(new CliRuntimeError('FORK_CUT_UNAVAILABLE'))),
    supervisorEvidence:()=>real?.runtime.supervisorEvidence?.()??[],
    close:()=>ready.then(c=>c.runtime.close(),()=>{}),
  };

  /* 0.6.1 (adversarial review of 0.6.0, F3): every member of the catalog is optional or not, but HERE each one must be written, so a
     member added to the real catalog and forgotten in this stand-in does not compile (`chatgpt` in 0.6.0 compiled, and was undefined on
     the real screen; the status row's provider badge, C1R, had never been carried here since 0.5.0). */
  const catalog:Required<TuiCatalogService>={
    listProviders:()=>later(c=>catalogOf(c).listProviders()),
    probeProvider:(id,signal)=>later(c=>catalogOf(c).probeProvider(id,signal)),
    listModels:input=>later(c=>catalogOf(c).listModels(input)),
    providerModels:(provider,signal)=>later(c=>catalogOf(c).providerModels(provider,signal)),
    selectModel:(id,scope)=>later(c=>catalogOf(c).selectModel(id,scope)),
    testProviderKey:(id,secret,signal)=>later(c=>catalogOf(c).testProviderKey(id,secret,signal)),
    keyTestNotice:id=>real?.tuiCatalog?real.tuiCatalog.keyTestNotice(id):null,
    setProviderKey:(id,secret,signal)=>later(c=>catalogOf(c).setProviderKey(id,secret,signal)),
    clearProviderKey:id=>later(c=>catalogOf(c).clearProviderKey(id)),
    answerEnvironmentKey:(id,answer)=>later(c=>catalogOf(c).answerEnvironmentKey(id,answer)),
    chosenProvider:()=>later(c=>catalogOf(c).chosenProvider()),
    chooseProvider:id=>later(c=>catalogOf(c).chooseProvider(id)),
    chooseProviderAddress:(id,endpoint)=>later(c=>catalogOf(c).chooseProviderAddress(id,endpoint)),
    readiness:model=>later(c=>catalogOf(c).readiness(model)),
    startOpenRouterLogin:input=>later(c=>{
      const login=catalogOf(c).startOpenRouterLogin;
      if(typeof login!=='function')throw new CliRuntimeError('OPENROUTER_LOGIN_UNAVAILABLE','OpenRouter sign-in is not available in this runtime');
      return login.call(c.tuiCatalog,input);
    }),
    /* 0.6.1 (found by acceptance s61 on the built 0.6.0, 13/10/2026): the ChatGPT plan was not carried by these stand-ins, so on the
       real screen `catalog.chatgpt` was undefined and Enter on «ChatGPT plan» asked for an API key. It is always here, so the screen
       knows the plan is signed in to before the kernel is loaded; a runtime without it answers as "cannot be connected here". */
    chatgpt:{
      state:()=>later(c=>catalogOf(c).chatgpt?catalogOf(c).chatgpt!.state():null),
      startLogin:input=>later(c=>{
        const plan=catalogOf(c).chatgpt;
        if(!plan)throw new CliRuntimeError('CHATGPT_UNAVAILABLE','A ChatGPT account cannot be connected in this runtime');
        return plan.startLogin(input);
      }),
      signOut:()=>later(c=>catalogOf(c).chatgpt?catalogOf(c).chatgpt!.signOut():{signedOut:false,revoked:false}),
      usage:()=>real?.tuiCatalog?.chatgpt?.usage()??null,
    },
    /* The status row's «<provider>: verified / not verified» (C1R; owner 07/10/2026 «tienilo», wired on the real screen after the review
       of 0.6.0 found it had never been there). The reading is synchronous and local: until the kernel is loaded there is nothing to
       read, and nothing is said (never a «not verified» that flips a moment later); the one check waits for the kernel like every
       other call, and the row is read again when it lands. */
    providerState:id=>(real?.tuiCatalog?.providerState?.(id)??null) as ReturnType<NonNullable<TuiCatalogService['providerState']>>,
    refreshProviderState:id=>later(c=>{
      const refresh=catalogOf(c).refreshProviderState;
      /* a runtime without the check: nothing is known, and the row says nothing; a screen that left before the kernel was loaded
         (`stopProviderChecks` below) asks for no check any more — it would be sent after the screen, for nobody */
      return typeof refresh==='function'&&!checksStopped?refresh.call(c.tuiCatalog,id):(null as unknown as Awaited<ReturnType<NonNullable<TuiCatalogService['refreshProviderState']>>>);
    }),
    /* Review of 0.6.2 (13/10/2026, B2): a key that is set or removed resets what the check knew, and the screen is told. Like
       `subscribe` above: it listens once the kernel is loaded (no key can change before that), and a listener that leaves first
       never does. */
    /* gate red of 13/10/2026 (s52): the screen leaves, the checks in flight end with it; one still waiting for the kernel is not sent */
    stopProviderChecks(){checksStopped=true;real?.tuiCatalog?.stopProviderChecks?.();},
    onProviderStateChanged(listener){
      if(real)return real.tuiCatalog?.onProviderStateChanged?.(listener)??(()=>{});
      let off:(()=>void)|null=null;let cancelled=false;
      ready.then(c=>{if(!cancelled)off=c.tuiCatalog?.onProviderStateChanged?.(listener)??null;},()=>{});
      return()=>{cancelled=true;const stop=off;off=null;stop?.();};
    },
  };

  /* The registry is used by the Forge and research panels, always as `await registry.method(...)` on a session that exists
     (so after the kernel). Any member read before ready is a method that waits; `then` is never one, so the stand-in is
     not taken for a promise. */
  const registry=new Proxy({},{
    get(_target,key){
      if(real){const target=real.registry as any;const value=target?.[key];return typeof value==='function'?value.bind(target):value;}
      if(key==='then'||typeof key==='symbol')return undefined;
      return(...args:unknown[])=>later(c=>{
        const fn=(c.registry as any)?.[key];
        if(typeof fn!=='function')throw Object.assign(new Error(`The registry has no ${String(key)}`),{code:'REGISTRY_METHOD_UNAVAILABLE'});
        return fn.apply(c.registry,args);
      });
    },
  });

  return{runtime,catalog,registry,ready,prepared,isReady:()=>real!==null};
}
