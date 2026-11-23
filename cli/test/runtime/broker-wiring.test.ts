import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {mkdtemp,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import test,{after} from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DEFAULT_EXECUTION_BROKER_FACTORY,createCliRuntime,createCliRuntimeContext,resolveExecutionBrokerFactory,type ExecutionBrokerFactory} from '../../src/runtime/create-runtime.ts';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';
import {createCliExecutionBroker} from '../../src/security/execution-backends.ts';
import {createExecutionBroker,type ExecutionBackend,type ExecutionBroker,type ExecutionRequest} from '../../src/security/execution-broker.ts';
import {loadMxcSdk,windowsCommandLine} from '../../src/security/mxc-execution-backend.ts';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import type {ProcessTreeProbeResult} from '../../src/security/process-tree-probe.ts';

/*
 * ⭐⭐⭐ B1 slice 12 — IL BROKER VIENE COSTRUITO DAVVERO.
 *
 * Fino a questa fetta `composeTalosRuntime` accettava `brokerFactory` e NESSUNO gliela passava:
 * i due soli ingressi (`createCliRuntime`, `createCliRuntimeContext`) omettevano il campo, quindi
 * ogni comando digitato finiva nel ripiego e dichiarava «nessun broker configurato». Qui si prova
 * il COLLEGAMENTO, non un meccanismo nuovo: il broker e' quello vero di `execution-backends.ts`.
 *
 * ⛔ AMBITO. Tutto cio' che segue riguarda il comando che una PERSONA digita (`runtime.shell`).
 *   NON riguarda l'attrezzo shell che usa il MODELLO: quello viene smistato dentro il kernel
 *   condiviso, che non espone nessun seam di esecuzione (richiesta kernel K-02). Chi legge «broker
 *   attivo» non deve dedurne che anche il secondo sia coperto.
 *
 * ⛔ DUE CONDIZIONI DICHIARATE, invece di due rossi che non parlano del broker:
 *   1. I casi che attraversano il brokered executor valgono su win32: la composizione non passa
 *      `platform`, quindi altrove il broker non viene nemmeno consultato. Su un altro sistema si
 *      SALTANO dicendo perche'.
 *   2. I casi sugli INGRESSI caricano i moduli VERI di `harness-ui` (`createCliRuntime` non ha un
 *      seam `modules`). Misurato il 17/09/2026: in questo albero `harness-ui/node_modules` non
 *      esiste e `@modelcontextprotocol/client` si risolveva solo attraverso la giunzione
 *      `C:\node_modules` → un'ALTRA copia di lavoro; il job `cli-unit` su ubuntu installa solo le
 *      dipendenze del CLI. Se un PACCHETTO di terzi non si risolve si saltano, nominandolo. Un file
 *      di `harness-ui` mancante NON e' un pacchetto di terzi: quello resta un rosso.
 *      Dove le dipendenze esistono davvero, la composizione crea il portachiavi di sistema e LEGGE
 *      le voci `talos-cli-*` (sola lettura).
 */

const REPO_ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const ON_WINDOWS=process.platform==='win32';
const WINDOWS_ONLY=ON_WINDOWS?false:`the composed brokered executor only consults the broker on win32, and this host is ${process.platform}`;

const temporaryRoots:string[]=[];
after(async()=>{for(const directory of temporaryRoots)await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
async function temporaryRoot(prefix:string){const root=await mkdtemp(join(tmpdir(),prefix));temporaryRoots.push(root);return root;}
/* ⛔ Mai `/cli/cache`: su Windows diventa `C:\cli\cache`, e un giro l'ha scritto davvero. */
function pathsUnder(root:string){return{configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'data','sessions'),logsRoot:join(root,'data','logs'),projectOverridesRoot:join(root,'data','projects'),queueRoot:join(root,'data','queues'),trust:{hooks:join(root,'trust','hooks'),mcp:join(root,'trust','mcp'),plugins:join(root,'trust','plugins'),projects:join(root,'trust','projects')}};}

/** Il pacchetto di terzi che manca ai moduli che `loadModules` importa, o `null` se si risolvono tutti. */
async function harnessUiPackageGap():Promise<string|null>{
  const files=['provider-credential-store.mjs','runtime-owner-adapter.mjs','agent-service.mjs','session-registry.mjs','plugin-registry.mjs','search-source-store.mjs','duckduckgo-search.mjs','provider-registry.mjs','provider-probe.mjs'];
  for(const file of files){
    try{await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src',file)).href);}
    catch(error:any){if(error?.code==='ERR_MODULE_NOT_FOUND'&&/^Cannot find package /u.test(String(error?.message)))return `harness-ui dependencies are not installed here (${String(error.message).split(' imported from')[0]})`;throw error;}
  }
  return null;
}
const PACKAGE_GAP=await harnessUiPackageGap();
const NEEDS_HARNESS_UI=PACKAGE_GAP??false;

/** Why the REAL MXC sandbox cannot run here, or `null` when it can. */
async function realSandboxGap():Promise<string|null>{
  if(process.platform!=='win32')return `the real MXC sandbox needs win32, and this host is ${process.platform}`;
  try{
    const support=(await loadMxcSdk()).getPlatformSupport();
    if(!support.isSupported||!support.availableMethods.includes('processcontainer')||support.isolationTier!=='base-container')return `MXC reports no base-container ProcessContainer on this host: ${JSON.stringify({isSupported:support.isSupported,availableMethods:support.availableMethods,isolationTier:support.isolationTier})}`;
  }catch(error:any){return `the MXC SDK cannot be loaded on this host: ${String(error?.message??error)}`;}
  return null;
}
const REAL_SANDBOX_GAP=await realSandboxGap();
const NEEDS_REAL_SANDBOX=REAL_SANDBOX_GAP??false;

/** Le stesse finte di `execution-backends.test.ts`: un backend che qualifica senza toccare l'SDK vero. */
function verifiedProbe():ProcessTreeProbeResult{return{verified:true,evidence:{schema:'talos.cli.process-tree-evidence.v1',scope:'createprocess-descendant',signals:{heartbeat:'gone',signalZero:'gone',enumeration:'gone'},executorPid:101,descendantPid:202,observedAtMs:5,durationMs:6,cleanup:{descendantKilled:false,executorKilled:true,directoryRemoved:true},boundary:{appContainer:false,integrity:'low',writesOutside:'blocked',network:'blocked'}}};}
function fakeSdk(){return{
  getPlatformSupport:()=>({isSupported:true,availableMethods:['processcontainer'],isolationTier:'base-container' as const}),
  createConfigFromPolicy:()=>({version:'0.8.0-alpha',process:{commandLine:''}}),
  spawnSandboxFromConfig:()=>{const child=new EventEmitter() as EventEmitter&{stdout:PassThrough;stderr:PassThrough;kill():boolean};child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;queueMicrotask(()=>{child.stdout.end('brokered output');child.stderr.end('');child.emit('close',0,null);});return child;},
};}
function memoryStore(){return{read:async()=>null,write:async()=>{}};}
function qualifyingFactory(counter?:{built:number}):ExecutionBrokerFactory{return(o)=>{if(counter)counter.built++;return createCliExecutionBroker({...o,platform:'win32',sdk:fakeSdk(),store:memoryStore(),probe:async()=>verifiedProbe()});};}

/**
 * Un backend che QUALIFICA e che esegue davvero la riga di comando con cmd.exe, costruita con la
 * stessa `windowsCommandLine` di MXC: cosi' la coda, i marcatori e i codici d'uscita sono quelli
 * che cmd produce, non quelli che un test immagina.
 */
function realCmdBackend(raw:{exitCode?:number;stdout?:string;stderr?:string}={}):ExecutionBackend{return{
  name:'stub-cmd-backend',level:'windows-sandbox',available:async()=>({available:true}),
  execute:({request})=>new Promise((resolve,reject)=>{
    const child=spawn(request.executable,[windowsCommandLine(request.args)],{cwd:request.cwd,windowsVerbatimArguments:true,windowsHide:true});
    let stdout='';let stderr='';
    child.stdout.on('data',chunk=>{stdout+=String(chunk);});child.stderr.on('data',chunk=>{stderr+=String(chunk);});
    child.once('error',reject);
    child.once('close',code=>{Object.assign(raw,{exitCode:code??-1,stdout,stderr});resolve({exitCode:code??-1,stdout,stderr,applied:{enforcement:'windows-sandbox',appContainer:true,filesystem:'bfs',network:request.network,processTree:'job-object-kill-on-close',sandboxSpecVersion:'0.1.0'}});});
  }),
};}

/**
 * La composizione vera con moduli finti: si cattura `eseguiComandoSandboxatoFn`, cioe' esattamente
 * la funzione che il kernel chiama per un comando digitato. `repoRoot` e' quello VERO perche' il
 * brokered executor importa davvero `talosHarness.mjs` per gli aiutanti di testo e per il ripiego.
 * Si puo' passare il VERO `eseguiComandoDiretto` del kernel per leggere cio' che la persona vede.
 */
async function composeWithBroker(brokerPart:Record<string,unknown>,eseguiComandoDiretto?:(input:any)=>Promise<any>){
  const root=await temporaryRoot('talos-wiring-compose-');
  let registryOpts:any;let direct:any=null;
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:eseguiComandoDiretto??(async(input:any)=>{direct=input;return{ok:true};}),
    /* stage 3: the kernel's own tool list, as session-registry.mjs exports it */STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),createSessionRegistry:(o:any)=>{registryOpts=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};},
  };
  await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:pathsUnder(root) as any,model:'m',env:{},modules,keyring:null,...brokerPart});
  if(!eseguiComandoDiretto)await registryOpts.eseguiComandoDirettoFn({cartella:process.cwd(),comando:'',onEvento:()=>{}});
  return{
    run:(command:string,opts:Record<string,unknown>={})=>direct.eseguiComandoSandboxatoFn(command,process.cwd(),opts) as Promise<{codice:number;testo:string;enforcement:string;cartellaFinale?:string|null}>,
    runIn:(cartella:string,command:string,opts:Record<string,unknown>={})=>direct.eseguiComandoSandboxatoFn(command,cartella,opts) as Promise<{codice:number;testo:string;enforcement:string;cartellaFinale?:string|null}>,
    typed:(command:string,cartella:string,onEvento:(event:any)=>void)=>registryOpts.eseguiComandoDirettoFn({cartella,comando:command,onEvento,mobile:false,dove:null}),
  };
}
const reasonOf=(line:string)=>line.slice(line.indexOf(' — ')+3);

test('M1-E-RED-2 — model and direct shell routes receive the same CLI brokered executor and runtime input cannot override it',async()=>{
  for(const authorityAdapters of [false,true]){
    const root=await temporaryRoot(`talos-m1e-model-${authorityAdapters?'authority':'plain'}-`);
    let registryOpts:any=null;let directInput:any=null;let ownerInput:any=null;
    let hostileCalls=0;
    const hostileExecutor=async()=>{hostileCalls+=1;return{codice:0,testo:'hostile',enforcement:'FAKE_ENFORCEMENT'};};
    const modules:any={
      createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
      createOwnerRuntimeAdapter:()=>({
        talosLavora:async(input:any)=>{ownerInput=input;return{comeFinita:'concluso'};},
        attrezziKernel:async()=>({base:[],estesi:[]}),
      }),
      avviaSessione:async(input:any)=>input.talosLavoraFn({marker:'model-owned',eseguiComandoSandboxatoFn:hostileExecutor}),
      eseguiComandoDiretto:async(input:any)=>{directInput=input;return{ok:true};},
      /* stage 3: the kernel's own tool list, as session-registry.mjs exports it */STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),createSessionRegistry:(o:any)=>{registryOpts=o;return{
        ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},
        ferma:()=>true,rispondiApprovazione:()=>({ok:true}),
      };},
      ...(authorityAdapters?{
        preparaToolMcpPerSessione:async()=>({toolMcp:[]}),
      }:{}),
    };
    /* The one broker the composition builds records what reaches it, and refuses to run anything. */
    const brokers:object[]=[];const reached:Array<{broker:object;command:string}>=[];
    const brokerFactory:ExecutionBrokerFactory=()=>{const broker={async execute(request:any){reached.push({broker,command:String(request.args?.at(-1))});throw new Error('the wiring test records the request; it must not execute');}};brokers.push(broker);return broker as any;};
    await composeTalosRuntime({
      repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:pathsUnder(root) as any,model:'m',env:{},
      modules,keyring:null,brokerFactory,
    });
    assert.ok(registryOpts,'composition must expose registry options');
    await registryOpts.eseguiComandoDirettoFn({cartella:process.cwd(),comando:'echo direct',onEvento:()=>{}});
    await registryOpts.avviaSessioneFn({});
    assert.equal(typeof directInput?.eseguiComandoSandboxatoFn,'function','direct shell must still receive the brokered executor');
    assert.equal(typeof ownerInput?.eseguiComandoSandboxatoFn,'function','model shell must receive the brokered executor');
    /* Owner 09/10/2026 («Segue il modo + si chiede»): the model route is the same brokered executor seen through the run's
       session mode (it may add the network in Full access), so the check is where each route lands, not object identity. */
    assert.notStrictEqual(ownerInput.eseguiComandoSandboxatoFn,hostileExecutor,
      'runtime input must not be able to replace the executor selected by the CLI composition');
    await directInput.eseguiComandoSandboxatoFn('echo direct',process.cwd(),{}).catch(()=>{});
    await ownerInput.eseguiComandoSandboxatoFn('echo model',process.cwd(),{}).catch(()=>{});
    assert.deepEqual(reached.map(row=>row.command),['echo direct','echo model'],'both shell routes reach the broker');
    assert.equal(new Set(reached.map(row=>row.broker)).size,1,'direct and model shell routes share the one broker the CLI built');
    assert.ok(brokers.includes(reached[0]!.broker));
    assert.equal(hostileCalls,0,'the executor in the runtime input is never called');
    assert.equal(ownerInput.marker,'model-owned','unrelated runtime input must still pass through');
  }
});


test('F16-HARDEN-RED-3 — CLI product composition requires Windows sandbox enforcement and denies subprocess network by default',{skip:WINDOWS_ONLY},async()=>{
  let seen:any=null;
  const brokerFactory:ExecutionBrokerFactory=()=>({
    async execute(request:any){
      seen=request;
      return{
        exitCode:0,stdout:'strict-policy-ok',stderr:'',
        evidence:{
          requestedEnforcement:request.requiredEnforcement,
          appliedEnforcement:'windows-sandbox',
          backend:'strict-policy-stub',
          appContainer:true,
          filesystem:'bfs',
          network:request.network,
          processTree:'job-object-kill-on-close',
          sandboxSpecVersion:'0.1.0',
        },
      };
    },
  });
  const {run}=await composeWithBroker({brokerFactory});
  const outcome=await run('echo strict-policy');
  assert.equal(outcome.codice,0);
  assert.ok(seen,'the product executor must reach the configured broker on Windows');
  assert.equal(seen.network,'deny','subprocess network must be OS-denied unless a later explicit policy enables it');
  assert.equal(seen.requiredEnforcement,'windows-sandbox','the Windows v1 product must require the verified AppContainer/BFS boundary, not accept a weaker fallback');
});


test('the default broker factory is the real CLI execution broker, not a placeholder',async()=>{
  assert.equal(DEFAULT_EXECUTION_BROKER_FACTORY,createCliExecutionBroker,'the default must BE createCliExecutionBroker: a look-alike wrapper is how a stub survives a review');
  const cacheRoot=await temporaryRoot('talos-wiring-default-');
  const resolved=resolveExecutionBrokerFactory({});
  assert.equal(typeof resolved.brokerFactory,'function','no override means the default, never "no broker"');
  const broker=resolved.brokerFactory({paths:{cacheRoot},platform:'linux'});
  const workspace=await temporaryRoot('talos-wiring-ws-');
  const request:ExecutionRequest={id:'default-probe',executable:process.execPath,args:['--version'],cwd:workspace,readWritePaths:[workspace],readOnlyPaths:[],network:'deny',requiredEnforcement:'windows-sandbox'};
  await assert.rejects(()=>broker.execute(request),(error:any)=>error?.code==='SANDBOX_REQUIRED_UNAVAILABLE'&&error?.component==='execution-broker','only the real CLI broker fails closed off Windows');
});

/*
 * ⭐⭐⭐ R0 lane S — S3. Owner decision 1 (2026-09-23, review §J.1): when the sandbox cannot be verified a command
 * runs on the HOST, DECLARED — not refused. Measured before this slice: `dd9620d9b` (F16) made the product refuse
 * every command with SANDBOX_REQUIRED_UNAVAILABLE, so on this host (probe broken, D-01) nothing could run at all.
 * The row now says `⛶ host · not isolated` and why. The approval that must precede it is the permission engine's
 * (gate §0.2 rule 2; auto asks, decision 2) — not this executor's.
 */
test('S3 — with isolation unverifiable the product runs the command on the host and declares it not isolated, with the reason',{skip:WINDOWS_ONLY},async()=>{
  const factory:ExecutionBrokerFactory=(o)=>createCliExecutionBroker({...o,store:memoryStore(),sdkLoader:async()=>{throw new Error('no MXC SDK on this host');}});
  const {run}=await composeWithBroker(resolveExecutionBrokerFactory({brokerFactory:factory}));
  const outcome=await run('echo talos-declared-host',{dove:'windows'});
  assert.equal(outcome.codice,0,JSON.stringify(outcome));
  assert.match(outcome.testo,/talos-declared-host/u);
  assert.ok(outcome.enforcement.startsWith('⛶ host · not isolated — '),outcome.enforcement);
  assert.match(outcome.enforcement,/MXC SDK failed to load: no MXC SDK on this host/u,'the row carries the backend\'s own reason');
  assert.equal(/\bsecure\b|\bsafe\b/iu.test(outcome.enforcement),false,'gate E6: never "secure"');
});

test('S3 — a sandbox that exists and FAILS is never bypassed: only "no verified backend" falls back',{skip:WINDOWS_ONLY},async()=>{
  const failing:ExecutionBackend={name:'failing-backend',level:'windows-sandbox',available:async()=>({available:true}),execute:async()=>{throw new Error('MXC_EXECUTION_TIMEOUT');}};
  const mismatching:ExecutionBackend={name:'mismatching-backend',level:'windows-sandbox',available:async()=>({available:true}),execute:async({request})=>({exitCode:0,stdout:'',stderr:'',applied:{enforcement:'windows-sandbox',appContainer:false,filesystem:'restricted-token' as const,network:request.network,processTree:'job-object-kill-on-close',sandboxSpecVersion:'0.1.0'}})};
  for(const [backend,code] of [[failing,'EXECUTION_BACKEND_FAILED'],[mismatching,'SANDBOX_EVIDENCE_MISMATCH']] as const){
    const {run}=await composeWithBroker(resolveExecutionBrokerFactory({brokerFactory:()=>createExecutionBroker({platform:'win32',windowsSandbox:backend})}));
    await assert.rejects(()=>run('echo must-not-run',{dove:'windows'}),(error:any)=>error?.code===code,code);
  }
});

test('a backend that qualifies puts the typed command through the broker and the line names it',{skip:WINDOWS_ONLY},async()=>{
  const {run}=await composeWithBroker(resolveExecutionBrokerFactory({brokerFactory:qualifyingFactory()}));
  const outcome=await run('echo talos-broker-wiring');
  assert.equal(outcome.codice,0);
  assert.match(outcome.testo,/brokered output/u);
  /* R3 Q-R3-12 (gate E5): no 'typed by you' clause in the executor's annotation. */
  assert.equal(outcome.enforcement,'⛉ sandbox (microsoft-mxc-0.8.0) — measured: writes only in the project, network blocked, reads the whole disk, its processes end with it');
});

test('the broker is built when the composition asks for it, once per runtime, never once per command',{skip:WINDOWS_ONLY},async()=>{
  const counter={built:0};
  const resolved=resolveExecutionBrokerFactory({brokerFactory:qualifyingFactory(counter)});
  assert.equal(counter.built,0,'resolving must not build: a broker built here and then dropped would look wired and be absent (review mutation M10)');
  const {run}=await composeWithBroker(resolved);
  assert.equal(counter.built,1,'the composition is what builds it');
  for(let index=0;index<3;index++)await run('echo talos-broker-wiring');
  assert.equal(counter.built,1,'one construction per command would mean one process-tree probe per command');
  assert.strictEqual(resolved.brokerFactory({paths:{cacheRoot:'unused'},platform:'win32'}),resolved.brokerFactory({paths:{cacheRoot:'unused'},platform:'win32'}),'asking again returns the same broker');
  assert.equal(counter.built,1);
});

/* ⛔ R0 lane S: a broker that cannot be BUILT is an unverifiable sandbox too (owner decision 1). The command runs on the
   host and the row names the construction error by code — never "not configured", never silent. */
test('S3 — broker construction failures run on the host, declared, with the original cause on the row',{skip:WINDOWS_ONLY},async()=>{
  const cases:Array<{factory:ExecutionBrokerFactory;hint:RegExp}>=[
    {
      factory:()=>{throw Object.assign(new Error('the MXC SDK could not be loaded'),{code:'ERR_MODULE_NOT_FOUND'});},
      hint:/^ERR_MODULE_NOT_FOUND: the MXC SDK could not be loaded$/u,
    },
    {
      factory:(()=>{(undefined as any).boom();}) as any,
      hint:/^TypeError: Cannot read properties of undefined \(reading 'boom'\)$/u,
    },
    {
      factory:(()=>undefined) as any,
      hint:/^EXECUTION_BROKER_FACTORY_RETURNED_NOTHING: the broker factory returned no broker$/u,
    },
  ];
  for(const entry of cases){
    const run=(await composeWithBroker(resolveExecutionBrokerFactory({brokerFactory:entry.factory}))).run;
    const outcome=await run('echo talos-unbuildable',{dove:'windows'});
    assert.match(outcome.testo,/talos-unbuildable/u);
    assert.ok(outcome.enforcement.startsWith('⛶ host · not isolated — the isolation broker could not be built ('),outcome.enforcement);
    const detail=outcome.enforcement.slice(outcome.enforcement.indexOf('built (')+7,outcome.enforcement.lastIndexOf('), so'));
    assert.ok(entry.hint.test(detail),`the construction cause must reach the row: ${outcome.enforcement}`);
  }
});

test('stderr and a non-zero exit code reach the person through a broker whose backend qualifies',{skip:WINDOWS_ONLY},async()=>{
  const raw:{exitCode?:number;stdout?:string;stderr?:string}={};
  const factory:ExecutionBrokerFactory=()=>createExecutionBroker({platform:'win32',windowsSandbox:realCmdBackend(raw)});
  const {run}=await composeWithBroker(resolveExecutionBrokerFactory({brokerFactory:factory}));
  const pieces:any[]=[];
  const outcome=await run('type talos_broker_wiring_missing_file.txt',{tracciaCartella:true,onPezzo:(piece:any)=>pieces.push(piece)});
  assert.equal(raw.exitCode,1,'round 5: no tail, so the shell\'s exit status is the command\'s own');
  assert.ok((raw.stderr??'').trim().length>0,'type writes its complaint to stderr');
  assert.equal(outcome.codice,1,'the person sees the COMMAND\'s exit code');
  assert.ok(outcome.testo.includes((raw.stderr??'').trim()),`stderr must reach the person, got: ${JSON.stringify(outcome.testo)}`);
  assert.ok(pieces.some(piece=>piece.flusso==='errori'),'and the live output carries it');
  assert.ok(outcome.enforcement.startsWith('⛉ sandbox (stub-cmd-backend) — '),outcome.enforcement);
  assert.equal(outcome.testo.includes('__TALOS_'),false,'neither marker is ever shown');
});

/** The reference: what plain `cmd /d /s /c <command>` exits with, no tail, same command-line builder as MXC. */
function plainCmd(command:string,cwd:string):Promise<number>{
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env['ComSpec']??'cmd.exe',[windowsCommandLine(['/d','/s','/c',command])],{cwd,windowsVerbatimArguments:true,windowsHide:true,stdio:'ignore'});
    child.once('error',reject);child.once('close',code=>resolve(code??-1));
  });
}
const cmdBrokerFactory:ExecutionBrokerFactory=()=>createExecutionBroker({platform:'win32',windowsSandbox:realCmdBackend()});
/** Never this invocation's variable, never the tail itself: the person sees only what the command printed. */
function assertNoTailLeak(testo:string){
  assert.equal(/__TALOS_EXIT_[0-9a-f]{16,}=/u.test(testo),false,`the nonce variable must never reach the person: ${JSON.stringify(testo)}`);
  assert.equal(testo.includes('call exit /b'),false,`the tail must never reach the person: ${JSON.stringify(testo)}`);
}

/*
 * ⭐⭐ B1 slice 12, round 4 — THE REVIEWER'S CASES, ON REAL cmd.exe, AGAINST PLAIN cmd.
 * The expected code is not written by hand: each command also runs through plain `cmd /d /s /c`, and the
 * brokered route must report exactly that. Measured inside the real MXC sandbox on 17/09/2026 with the
 * same twelve commands: plain and brokered agree on every one.
 */
test('a command whose last output line has no newline reports its real exit code and leaks nothing',{skip:WINDOWS_ONLY},async()=>{
  const dir=await temporaryRoot('talos-wiring-nonewline-');
  await writeFile(join(dir,'ok-partial.cmd'),'@echo off\r\n<nul set /p =all good\r\nexit /b 1\r\n');
  const {runIn}=await composeWithBroker(resolveExecutionBrokerFactory({brokerFactory:cmdBrokerFactory}));
  for(const [command,shown] of [['<nul set /p =Continue?','Continue?'],['.\\ok-partial.cmd','all good']] as const){
    const expected=await plainCmd(command,dir);
    assert.equal(expected,1,`plain cmd must fail for ${command}, or the case proves nothing`);
    const outcome=await runIn(dir,command,{tracciaCartella:true});
    assert.equal(outcome.codice,expected,`${command}: brokered exit ${outcome.codice}, plain cmd ${expected}`);
    assert.equal(outcome.testo,shown);
    assert.equal(outcome.testo.includes('__TALOS_'),false,`no marker may be glued onto the last line: ${JSON.stringify(outcome.testo)}`);
    assertNoTailLeak(outcome.testo);
  }
});

test('printed markers and a shadowed errorlevel cannot forge the exit code in either direction',{skip:WINDOWS_ONLY},async()=>{
  const dir=await temporaryRoot('talos-wiring-forgery-');
  const {runIn}=await composeWithBroker(resolveExecutionBrokerFactory({brokerFactory:cmdBrokerFactory}));
  const forgeries:Array<[string,string,number]>=[
    ['old marker, failure shown as success','<nul set /p =__TALOS_EXIT__0& exit /b 1',1],
    ['old marker, success shown as failure','echo ok & <nul set /p =__TALOS_EXIT__1& exit /b 0',0],
    ['guessed nonce, failure shown as success','<nul set /p =__TALOS_EXIT_0123456789abcdef01234567__0& exit /b 1',1],
    ['guessed nonce, success shown as failure','echo ok & <nul set /p =__TALOS_EXIT_0123456789abcdef01234567__1& exit /b 0',0],
    ['fake folder marker, failure shown as success','echo __TALOS_EXIT__0& echo __TALOS_CWD__& echo C:\\fake& exit /b 1',1],
    ['fake folder marker, success shown as failure','echo __TALOS_EXIT__1& echo __TALOS_CWD__& echo C:\\fake& exit /b 0',0],
    ['shadowed errorlevel, failure shown as success','set errorlevel=0& type talos_forgery_missing.txt',1],
    ['shadowed errorlevel, success shown as failure','set errorlevel=1& echo ok',0],
  ];
  for(const [label,command,real] of forgeries){
    const expected=await plainCmd(command,dir);
    assert.equal(expected,real,`${label}: plain cmd exits ${expected}, the case assumes ${real}`);
    const outcome=await runIn(dir,command,{tracciaCartella:true});
    assert.equal(outcome.codice,expected,`${label}: brokered exit ${outcome.codice}, plain cmd ${expected} — command: ${command}`);
    assertNoTailLeak(outcome.testo);
  }
});

test('the kernel\'s own event text shows the person the exit code and stderr of a brokered command',{skip:WINDOWS_ONLY||NEEDS_HARNESS_UI},async()=>{
  const agentService:any=await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','agent-service.mjs')).href);
  const raw:{exitCode?:number;stdout?:string;stderr?:string}={};
  const factory:ExecutionBrokerFactory=()=>createExecutionBroker({platform:'win32',windowsSandbox:realCmdBackend(raw)});
  const {typed}=await composeWithBroker(resolveExecutionBrokerFactory({brokerFactory:factory}),agentService.eseguiComandoDiretto);
  const events:any[]=[];
  const outcome=await typed('type talos_broker_wiring_missing_file.txt',process.cwd(),event=>events.push(event));
  assert.equal(outcome.codice,1);
  const rawStderr=(raw.stderr??'').replace(/[\r\n]+$/u,'');
  assert.ok(rawStderr.length>0,'type writes its complaint to stderr');
  const serialized=events.map(event=>JSON.stringify(event));
  const toolResult=serialized.find(text=>text.includes('exit 1 [sandbox: ⛉ sandbox (stub-cmd-backend)'));
  assert.ok(toolResult,`the tool result the person reads must start with the real exit code: ${serialized.join('\n')}`);
  assert.ok(toolResult.includes(JSON.stringify(rawStderr).slice(1,-1)),`and must contain the exact stderr cmd produced: ${toolResult}`);
});

/*
 * ⭐⭐⭐ B1 slice 12, round 5 — THE REVIEWER'S HIJACK, INSIDE THE REAL SANDBOX.
 * Round 4 saved the exit code with `call set` and returned it with `call exit`. Inside the MXC sandbox those
 * names resolve to a same-named batch file in the working directory; on the host they do not, which is why
 * the round-4 forgery tests (host cmd) stayed green. This test runs the real SDK with the production policy,
 * only the process-tree answer stubbed, in a workspace that carries set.bat, set.cmd, exit.bat and exit.cmd.
 */
test('inside the REAL MXC sandbox, workspace set/exit batch files cannot change a command\'s exit code',{skip:NEEDS_REAL_SANDBOX},async(t)=>{
  const workspace=await temporaryRoot('talos-wiring-hijack-');
  for(const name of ['set.bat','set.cmd','exit.bat','exit.cmd'])await writeFile(join(workspace,name),'@exit /b 0\r\n');
  const broker=createCliExecutionBroker({paths:{cacheRoot:workspace},probe:async()=>verifiedProbe(),store:memoryStore()});
  const {runIn}=await composeWithBroker(resolveExecutionBrokerFactory({brokerFactory:()=>broker}));
  const cases:Array<[string,number]>=[
    ['findstr /c:zzz talos_absent.txt',1],
    ['echo @exit /b 0> set.bat & findstr /c:zzz talos_absent.txt',1],
    ['type talos_missing.txt & echo ok',0],
  ];
  for(const [command,real] of cases){
    const host=await plainCmd(command,workspace);
    const sandboxPlain=(await broker.execute({id:'plain',executable:process.env['ComSpec']??'cmd.exe',args:['/d','/s','/c',command],cwd:workspace,readWritePaths:[workspace],readOnlyPaths:[path.parse(workspace).root],network:'internet-client',requiredEnforcement:'restricted-process'})).exitCode;
    const outcome=await runIn(workspace,command,{tracciaCartella:true});
    t.diagnostic(`${JSON.stringify(command)}: host cmd ${host} | sandbox cmd /d /s /c ${sandboxPlain} | brokered ${outcome.codice} | ${outcome.enforcement.slice(0,34)}`);
    assert.equal(host,real,`host cmd must exit ${real} for ${command}, or the case proves nothing`);
    assert.ok(outcome.enforcement.startsWith('⛉ sandbox (microsoft-mxc-0.8.0) — '),`the command must really have run in the sandbox: ${outcome.enforcement}`);
    assert.equal(outcome.codice,sandboxPlain,`${command}: brokered ${outcome.codice}, plain cmd /d /s /c in the same sandbox ${sandboxPlain}`);
    assert.equal(outcome.codice,host,`${command}: brokered ${outcome.codice}, host cmd ${host}`);
  }
});

test('a compound command reports the same exit code as plain cmd and as the kernel fallback',{skip:WINDOWS_ONLY},async(t)=>{
  const dir=await temporaryRoot('talos-wiring-compound-');
  const {runIn}=await composeWithBroker(resolveExecutionBrokerFactory({brokerFactory:cmdBrokerFactory}));
  const kernel:any=await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','kernel','talosHarness.mjs')).href);
  const command='type talos_compound_missing.txt & echo ok';
  const plain=await plainCmd(command,dir);
  const brokered=(await runIn(dir,command,{tracciaCartella:true})).codice;
  const fallback=(await kernel.eseguiComandoSandboxato(command,dir,{dove:'windows',tracciaCartella:true})).codice;
  t.diagnostic(`${JSON.stringify(command)}: plain cmd ${plain} | brokered ${brokered} | kernel fallback (cmd route) ${fallback}`);
  assert.equal(plain,0,'plain cmd reports the status of the last command');
  assert.equal(brokered,plain,'one command, one exit code, whether or not a backend qualifies');
  assert.equal(fallback,plain);
});

/*
 * ⭐ B1 slice 12, round 5 — THE KERNEL WITHOUT THE FOLDER MARKER, END TO END.
 * The REAL session registry and the REAL `eseguiComandoDiretto`, with no model at all (`avviaSessioneFn` ends
 * at once; the key is a placeholder nothing reads). No error, the output not cut, and the working directory
 * unchanged: `cd sub` does not persist on the brokered route. ⛔ Declared, not a regression — on the cmd route
 * the kernel's folder parser already returns null, so a `cd` does not persist there either.
 */
test('the kernel copes with no folder marker: no error, the full text, and the working directory left unchanged',{skip:WINDOWS_ONLY||NEEDS_HARNESS_UI},async(t)=>{
  const {createSessionRegistry}:any=await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','session-registry.mjs')).href);
  const agentService:any=await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','agent-service.mjs')).href);
  const brokeredExecutor=(await import('../../src/runtime/brokered-executor.ts')).createBrokeredKernelExecutor({
    kernel:async()=>(await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','kernel','talosHarness.mjs')).href)) as any,
    broker:createExecutionBroker({platform:'win32',windowsSandbox:realCmdBackend()}),
  });
  const project=await temporaryRoot('talos-wiring-registry-');
  await mkdir(join(project,'sub'));
  const registry=createSessionRegistry({
    avviaSessioneFn:async()=>({comeFinita:'concluso'}),
    chiave:'placeholder-no-model-is-called',chiaveFn:()=>'placeholder-no-model-is-called',modello:'none/none',
    cartelleProgetto:[{id:'p',nome:'P',percorso:project}],
    /* ⛔ Measured: the real per-session folder watcher keeps the test process alive forever (the file never
       exits). It is not what this test is about, so it is replaced by one that watches nothing. */
    guardaWorkspaceFn:()=>()=>{},
    eseguiComandoDirettoFn:(input:any)=>agentService.eseguiComandoDiretto({...input,eseguiComandoSandboxatoFn:brokeredExecutor}),
  });
  const started=registry.avviaLibero({cartellaId:'p',consegna:'broker wiring test'});
  assert.equal(typeof started.sessionId,'string',JSON.stringify(started));
  const events:any[]=[];
  const unsubscribe=registry.iscriviti(started.sessionId,(event:any)=>events.push(event),0);
  t.after(()=>{try{unsubscribe();}catch{}});
  async function typed(command:string){
    const from=events.length;
    assert.deepEqual(registry.shell(started.sessionId,command),{ok:true});
    for(let turn=0;turn<200&&!events.slice(from).some(event=>event.type==='ComandoUtenteFinito');turn++)await new Promise(resolve=>setTimeout(resolve,25));
    const finished=events.slice(from).find(event=>event.type==='ComandoUtenteFinito');
    assert.ok(finished,`no ComandoUtenteFinito for ${command}`);
    assert.equal(finished.errore,undefined,`the kernel reported an error for ${command}: ${finished.errore}`);
    const shown=events.slice(from).map(event=>JSON.stringify(event)).find(text=>text.includes('[sandbox: ⛉ sandbox (stub-cmd-backend)'));
    assert.ok(shown,`no tool result for ${command}`);
    return JSON.parse(shown).content as string;
  }
  await typed('cd sub');
  const where=await typed('cd');
  const reportedWhere=where.split('\n').at(-1)?.trim();
  assert.ok(reportedWhere,`the working directory result must contain a path: ${where}`);
  assert.equal((await realpath(reportedWhere)).toLowerCase(),(await realpath(project)).toLowerCase(),`the working directory must be unchanged after cd sub: ${where}`);
  const text=await typed('echo line-one& echo line-two& echo __TALOS_CWD__& echo line-four');
  assert.match(text,/line-one\s+line-two\s+__TALOS_CWD__\s+line-four$/u,`the output must reach the person whole, a printed marker included: ${text}`);
});

test('a throwing broker factory does not stop either entry point from producing a runtime',{skip:NEEDS_HARNESS_UI},async()=>{
  const cliPaths=pathsUnder(await temporaryRoot('talos-wiring-entry-throw-'));
  const brokerFactory:ExecutionBrokerFactory=()=>{throw new Error('BROKER_CONSTRUCTION_FAILED');};
  const runtime=await createCliRuntime({projectRoot:REPO_ROOT,repoRoot:REPO_ROOT,paths:cliPaths as any,trustVerified:true,brokerFactory});
  assert.equal(typeof runtime.shell,'function');
  const context=await createCliRuntimeContext({projectRoot:REPO_ROOT,repoRoot:REPO_ROOT,paths:cliPaths as any,trustVerified:true,brokerFactory});
  assert.equal(typeof context.runtime.shell,'function');
});

test('both entry points hand the broker to the composition, once each, with the same arguments',{skip:NEEDS_HARNESS_UI},async()=>{
  const cliPaths=pathsUnder(await temporaryRoot('talos-wiring-entry-'));
  const seen:{paths:{cacheRoot:string};platform:NodeJS.Platform}[]=[];const built:ExecutionBroker[]=[];
  const qualifying=qualifyingFactory();
  const brokerFactory:ExecutionBrokerFactory=(o)=>{seen.push(o);const broker=qualifying(o);built.push(broker);return broker;};
  await createCliRuntime({projectRoot:REPO_ROOT,repoRoot:REPO_ROOT,paths:cliPaths as any,trustVerified:true,brokerFactory});
  /* ⛔ M10: la fabbrica viene chiamata SOLO dalla composizione. Costruire e buttare via lascerebbe 0. */
  assert.equal(seen.length,1,'createCliRuntime must hand exactly one broker to the composition');
  await createCliRuntimeContext({projectRoot:REPO_ROOT,repoRoot:REPO_ROOT,paths:cliPaths as any,trustVerified:true,brokerFactory});
  assert.equal(seen.length,2,'createCliRuntimeContext must hand exactly one broker to the composition too');
  assert.notStrictEqual(built[0],built[1],'each runtime owns its own broker');
  assert.deepEqual(seen[0],seen[1],'a difference between the two entry points is how a feature ends up working in one command and not another');
  assert.equal(seen[0]?.paths.cacheRoot,cliPaths.cacheRoot,'the broker caches its process-tree evidence under the CLI cache root, not somewhere invented');
  assert.equal(seen[0]?.platform,process.platform);
});

/*
 * ⭐⭐⭐ R0 lane S — the real proof, through the PRODUCT composition: the real CLI broker, the real process-tree probe
 * with its workload checks, the real SDK. A model-selected `dir /b` runs inside MXC and the row names the backend.
 */
test('S3 REAL — through the product composition a command runs inside MXC once the probe verifies this host',{skip:NEEDS_REAL_SANDBOX},async(t)=>{
  const workspace=await temporaryRoot('talos-wiring-real-');
  await writeFile(join(workspace,'talos-real-proof.txt'),'x');
  const {runIn}=await composeWithBroker(resolveExecutionBrokerFactory({}));
  const outcome=await runIn(workspace,'dir /b');
  t.diagnostic(`${outcome.codice} | ${outcome.enforcement} | ${outcome.testo.slice(0,80)}`);
  assert.equal(outcome.codice,0,JSON.stringify(outcome));
  assert.match(outcome.testo,/talos-real-proof\.txt/u);
  assert.ok(outcome.enforcement.startsWith('⛉ sandbox (microsoft-mxc-0.8.0) — '),outcome.enforcement);
});
