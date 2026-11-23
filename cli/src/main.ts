#!/usr/bin/env node
/* ⛔ FIRST: Windows must never run a program from the project folder in place of the real one (security/exe-search-defence.ts) */
import './security/exe-search-defence.ts';
import {LAUNCH_ENV as _launchEnvFirst} from './launch-env.ts';void _launchEnvFirst;
import {relaunch,relaunchWanted} from './relaunch.ts';
import {toolOutputRoot} from './runtime/output-store.ts';
import {MCP_START_FAILED} from './runtime/provider-attempts.ts';
import {resolve} from 'node:path';import {homedir} from 'node:os';import {fileURLToPath} from 'node:url';import {realpathSync} from 'node:fs';
import {stdio,type CliIo} from './io.ts';import {parseCliArgs,type OutputFormat} from './args.ts';import {CLI_VERSION} from './version.ts';import {resolveCliPaths,ensureCliPaths,type CliPaths} from './paths.ts';import {loadEffectiveConfig,readConfigScope} from './config/load.ts';import {createSessionFacade} from './runtime/session-facade.ts';import {createDeferredRuntimeContext} from './runtime/deferred-context.ts';import type {TuiStartup} from './tui/startup.ts';import type {CliRuntime} from './runtime/types.ts';import {collectHeadlessFork,collectHeadlessResume,collectHeadlessRun} from './headless/run.ts';import {renderJson,renderText,exitCodeForResult,withRunWarnings} from './headless/result.ts';import {createLocalAutoClassifier} from './security/auto-classifier.ts';import {abortIsolationChecks,cliShellIsolation} from './security/execution-backends.ts';import {inertTerminalText,renderSafeTalosFailure} from './errors.ts';import {registerActiveRun,reconcileActiveRuns,releaseOnSignals,signalsForPlatform,SIGNAL_RELEASE_TIMEOUT_MS} from './runtime/active-run.ts';
import {isFirstLaunch} from './tui/launch-state.ts';/* P17: the first launch's trust question is step 1 of the setup */
import {exitWhenFinished} from './runtime/unfinished-command.ts';
/* second review of 0.6.2 (13/10/2026): a handle left behind after the screen holds the process two seconds, not for ever */
import {armExitBackstop} from './runtime/exit-backstop.ts';
import {isRequestTooLarge} from './runtime/request-too-large.ts';
/* F-E-001 (0.5.6): the project folder by its long name — a short-name folder handed to the kernel's watcher aborts the process inside the sandbox */
import {longPathForm} from './security/real-path.ts';
import {initializeDevelopmentLogging,developmentLog,developmentLogError,developmentLogLate,closeDevelopmentLogging,developmentTextEvidence} from './diagnostics/development-log.ts';
import {assessProjectTrust,assertProjectTrusted,needsTrustQuestion,nestedRepositoriesForProjectTrust,projectTrustFailure,trustProjectAssessment,type ProjectTrustAssessment} from './security/project-trust-gate.ts';import type {FolderTrustTarget} from './security/trust-authority.ts';import {findTalosRepoRoot,importTalosModule} from './runtime/repo.ts';import type {ProjectTrustPromptChoice,ProjectTrustPromptInput} from './tui/project-trust-prompt.ts';import type {ReasoningEffort,UiTheme} from './config/types.ts';import {providerOfModel} from './provider/environment-keys.ts';import {assertValidKeymap} from './tui/keymap-resolver.ts';
import {COMPACTION_WARNING_CODES,createV2FailureEvent,createV2RunResultAccumulator,createV2SyntheticEvent,withV2RunWarnings} from './protocol/v2/events.ts';import {encodeV2Event,encodeV2Result,exitCodeForV2Result} from './protocol/v2/codec.ts';
/* R3 Q-R3-8b: the first Ctrl+C of `talos -p` stops the run and lets it print a complete interrupted result (exit 130);
   a second one exits at once with 130. Injected so tests never touch the real process signal. */
function defaultOnInterrupt(handler:()=>void){process.on('SIGINT',handler);return()=>{process.off('SIGINT',handler);};}
export type MainDeps={onInterrupt?:(handler:()=>void)=>()=>void;forcedExit?:(code:number)=>void;io:CliIo;createRuntime:(x:any)=>Promise<any>;createRuntimeContext:(x:any)=>Promise<any>;runTui:(x:any)=>Promise<void>;assertProjectTrusted:(x:{projectRoot:string;trustRoot:string})=>Promise<unknown>;assessProjectTrust:(x:{projectRoot:string;trustRoot:string})=>Promise<ProjectTrustAssessment>;trustProjectAssessment:(x:{assessment:ProjectTrustAssessment;trustRoot:string;nestedRepositories?:readonly any[];folder?:FolderTrustTarget;sessionOnly?:boolean})=>Promise<ProjectTrustAssessment>;promptProjectTrust:(x:ProjectTrustPromptInput)=>Promise<ProjectTrustPromptChoice>;loadedFiles:(projectRoot:string)=>Promise<string[]>};
async function defaultCreateRuntime(x:any){const {createCliRuntime}=await import('./runtime/create-runtime.ts');return createCliRuntime(x);}async function defaultCreateRuntimeContext(x:any){const {createCliRuntimeContext}=await import('./runtime/create-runtime.ts');return createCliRuntimeContext(x);}async function defaultRunTui(x:any){const {runInkTui}=await import('./tui/run.ts');return runInkTui(x);}async function defaultPromptProjectTrust(x:ProjectTrustPromptInput){const {runProjectTrustPrompt}=await import('./tui/project-trust-prompt.ts');return runProjectTrustPrompt(x);}
/* R4 Q-R4-13 (`Loaded AGENTS.md`): the instruction files the kernel reads for this folder, found by the kernel's own function
   (AGENTS.md or CLAUDE.md, one per folder, from the repository root down), named relative to that root. Read only after
   trust is settled (E1); a failure only means nothing is announced. */
async function defaultLoadedFiles(projectRoot:string):Promise<string[]>{
  const m=await importTalosModule(findTalosRepoRoot(process.cwd()),'istruzioni-di-progetto.mjs');
  const found=await m.trovaIstruzioniDiProgetto(projectRoot);
  return Array.isArray(found)?found.map((row:any)=>String(row?.etichetta??'')).filter(Boolean):[];
}
/* R4 Q-R4-1/2: which folder decision a choice saves. The home folder and a drive root save none (session only). */
function folderTargetFor(choice:ProjectTrustPromptChoice,assessment:ProjectTrustAssessment):FolderTrustTarget{
  /* «Only this time» (owner decision 2) saves no folder decision, like the home folder */
  if(assessment.folder?.sessionOnly||choice==='once')return'none';
  return choice==='trust-parent'?'parent':'this';
}
function help(){return `TALOS CLI ${CLI_VERSION}\nUsage:\n  talos [prompt...]\n  talos -p "prompt" [--json|--output-format stream-json]\n  talos --resume <id|last> [-p "prompt"]\n  talos --fork <id> [-p "prompt"]\n  talos <project|config|provider|model|session|mcp|hook|plugin|command|memory|notes|tasks|library|research|automation|forge|checkpoint|doctor|logs|diagnostic|update|init> ...\n\nGlobal options:\n  --project PATH  --model PROVIDER:MODEL  --permission-mode MODE\n  --protocol v1|v2  --resume ID  --fork ID  --timeout SECONDS  --verbose  --no-color\n  --attach-if-too-large  with -p: a message too large for the model is sent as an attachment\n`;}
async function sessionId(runtime:CliRuntime,id:string){if(id!=='last')return id;const rows=await runtime.listSessions();const first=rows.at(-1);if(!first?.sessionId)throw Object.assign(new Error('SESSION_NOT_FOUND'),{code:'SESSION_NOT_FOUND'});return String(first.sessionId);}
function outputFormatHint(argv:string[]):OutputFormat{
  let format:OutputFormat=argv.includes('--json')?'json':'text';
  for(let i=0;i<argv.length;i++){
    const token=argv[i]!;
    const inline=token.startsWith('--output-format=')?token.slice('--output-format='.length):undefined;
    const value=inline??(token==='--output-format'?argv[i+1]:undefined);
    if(value==='text'||value==='json'||value==='stream-json')format=value;
    if(token==='--output-format')i+=1;
  }
  return format;
}
function protocolVersionHint(argv:string[]):'v1'|'v2'{
  for(let i=0;i<argv.length;i++){
    const token=argv[i]!;
    const inline=token.startsWith('--protocol=')?token.slice('--protocol='.length):undefined;
    const value=inline??(token==='--protocol'?argv[i+1]:undefined);
    if(value==='v2')return'v2';
    if(token==='--protocol')i+=1;
  }
  return'v1';
}
/* B1 slice 23. A configuration value the loader did not apply is stated where the person looks. */
type ConfigNotice={code:string;message:string};
function renderFailureForProtocol(format:OutputFormat,protocolVersion:'v1'|'v2',error:unknown,notices:readonly ConfigNotice[]=[],verbose=false){
  if(protocolVersion==='v2'&&format!=='text'){
    const accumulator=createV2RunResultAccumulator();
    const events=notices.map((notice,index)=>createV2SyntheticEvent({
      sessionId:'',
      eventId:'talos:none:config-notice:'+(index+1),
      type:'warning',
      data:{code:notice.code,message:notice.message}
    }));
    for(const event of events)accumulator.add(event);
    const failed=createV2FailureEvent({sessionId:'',error,component:'cli'});
    accumulator.add(failed);
    const result=accumulator.result();
    return{
      toStderr:false,
      text:format==='stream-json'?[...events,failed].map(encodeV2Event).join(''):encodeV2Result(result),
      exitCode:exitCodeForV2Result(result)
    };
  }
  return renderSafeTalosFailure(format,error,{component:'cli',notices,verbose}); /* R2 E6: trace id only with --verbose (or JSON) */
}

/* How long the start waits for a provider's live model list to affirm a configured effort. The catalog service's own limit is 30 s (a key test); a
   start that waits that long on a dead network is a hang. Codex bounds the same best-effort refresh with 5 s and goes on with what it has. */
const STARTUP_LIVE_LIST_TIMEOUT_MS=5_000;
async function resolveReasoningDefault(catalog:any,model:string,configured:ReasoningEffort|undefined):Promise<{effort:ReasoningEffort|null;notice:ConfigNotice|null}>{
  if(configured===undefined)return{effort:null,notice:null};
  if(!catalog||typeof catalog.listModels!=='function')return{effort:null,notice:{code:'REASONING_EFFORT_CAPABILITY_UNKNOWN',message:`Configured reasoning effort "${configured}" was not applied because TALOS could not verify ${model} capabilities; using model default.`}};
  try{
    const provider=providerOfModel(model);const rows=await catalog.listModels(provider?{provider}:{});const row=rows.find((candidate:any)=>candidate?.id===model);
    const affirms=(candidate:any)=>candidate?.reasoning===true&&Array.isArray(candidate.reasoningEfforts)&&candidate.reasoningEfforts.includes(configured);
    if(affirms(row))return{effort:configured,notice:null};
    /* 08/10/2026 (owner: «impossibile che su Anthropic 5.x non si possa aggiustare il ragionamento»): the rows TALOS knows at start (no network) say
       nothing about a model like Claude 5.x, whose levels only the provider's live list declares (`capabilities.effort`). Asked only when the known row
       does not already affirm the effort, exactly as the TUI does for /effort and /model (app.ts modelMetaWithLevels); a list that cannot be read
       leaves the effort unapplied with the notice of before. */
    if(provider&&typeof catalog.providerModels==='function'){
      try{const live=(await catalog.providerModels(provider,AbortSignal.timeout(STARTUP_LIVE_LIST_TIMEOUT_MS))).rows.find((candidate:any)=>candidate?.id===model);if(affirms(live))return{effort:configured,notice:null};}catch{/* not readable: not affirmed */}
    }
    return{effort:null,notice:{code:'REASONING_EFFORT_UNSUPPORTED',message:`Configured reasoning effort "${configured}" is not affirmed for ${model}; using model default and sending no effort override.`}};
  }catch{
    return{effort:null,notice:{code:'REASONING_EFFORT_CAPABILITY_UNKNOWN',message:`Configured reasoning effort "${configured}" was not applied because ${model} capabilities could not be read; using model default.`}};
  }
}
function configNoticeEvent(sessionId:string,seq:number,notice:ConfigNotice){return{schema:'talos.cli.event.v1',seq,ts:new Date().toISOString(),sessionId,type:'warning',data:{code:notice.code,message:notice.message}};}
/* 0.6.9 (the bugfixer's review of 0.6.9, B1): in text, the run's warnings never left the result; a trusted MCP server that did not
   start (MCP_START_FAILED) is said on stderr, as the configuration notices above and as Codex exec says its own.
   0.6.13: a compaction that did not happen too (the five COMPACTION_* codes of compactionFailureWarning), as Codex's human exec
   output prints its warnings on stderr (codex-rs/exec/src/event_processor_with_human_output.rs:244, :385-390) */
function writeTextWarnings(io:CliIo,events:unknown){
  if(!Array.isArray(events))return;
  for(const event of events){const data=(event as any)?.type==='warning'?(event as any)?.data:null;if((data?.code===MCP_START_FAILED||COMPACTION_WARNING_CODES.has(data?.code))&&typeof data?.message==='string')io.writeErr(`Warning: ${inertTerminalText(data.message)}\n`);}
}
/* 0.6.13 (owner 22/10/2026): a message too large for the model is an error of the run's input, said on stderr with its numbers
   (stdout stays empty: there is no answer), as Codex rejects an over-large input with a typed error (codex-rs/protocol/src/
   user_input.rs:10) and as the failures before a run are said here (renderSafeTalosFailure). */
function textToStderr(result:any){return result?.ok===false&&isRequestTooLarge(result?.error);}
export function output(io:CliIo,format:string,protocolVersion:'v1'|'v2',collected:any){if(format==='text')writeTextWarnings(io,collected?.events);if(format==='json')io.writeOut(protocolVersion==='v2'?encodeV2Result(collected.result):renderJson(collected.result));else if(format!=='stream-json'){const text=renderText(collected.result);if(textToStderr(collected.result))io.writeErr(text);else io.writeOut(text);}return protocolVersion==='v2'?exitCodeForV2Result(collected.result):exitCodeForResult(collected.result);}
/* R5b D4 (Q-R5-14): the trust question is drawn in the person's theme. It is asked before the folder is trusted, so only the
   USER configuration is read here (migrated, as every read is); a theme in the folder's own config is not. Unreadable: Calm. */
async function userThemeForTrust(paths:CliPaths,projectRoot:string):Promise<{theme?:UiTheme}>{
  try{const theme=(await readConfigScope({paths,projectRoot,scope:'user'})).ui?.theme;return theme?{theme}:{};}catch{return{};}
}
/* Second review of 0.6.2 (13/10/2026): whether this process showed the interactive screen. The exit backstop is for that run only
   (runtime/exit-backstop.ts): `-p` and the subcommands exit as they always did — no headless hang is proven. Read after `main`
   has returned, by the program's own entry below; a test that calls `main` arms nothing. */
let interactiveScreenRan=false;
export async function main(argv:string[],deps:Partial<MainDeps>={}):Promise<number>{const io=deps.io??stdio;initializeDevelopmentLogging({...(process.env.TALOS_CLI_DEV_LOG_DIR?{logDir:process.env.TALOS_CLI_DEV_LOG_DIR}:{}),argv,component:'cli-main'});developmentLog('cli.main.enter',{argv:argv.map(developmentTextEvidence)});let inv;try{inv=parseCliArgs(argv);}catch(error){developmentLogError('cli.args.failure',error,{argv:argv.map(developmentTextEvidence)},'cli-main');const format=outputFormatHint(argv);const failure=renderFailureForProtocol(format,format==='text'?'v1':protocolVersionHint(argv),error);if(failure.toStderr)io.writeErr(failure.text);else io.writeOut(failure.text);closeDevelopmentLogging({exitCode:failure.exitCode,reason:'args'});return failure.exitCode;}if(inv.command==='version'){io.writeOut(`${CLI_VERSION}\n`);closeDevelopmentLogging({exitCode:0,reason:'version'});return 0;}if(inv.command==='help'){io.writeOut(help());closeDevelopmentLogging({exitCode:0,reason:'help'});return 0;}if(inv.command==='subcommand'){const {runSubcommand}=await import('./subcommands.ts');const code=await runSubcommand(inv,{io,createRuntimeContext:deps.createRuntimeContext??defaultCreateRuntimeContext});closeDevelopmentLogging({exitCode:code,reason:'subcommand'});return code;}
 /* 0.6.15: the window's remote control bridge (src/remote/tui-remote-main.ts), interactive screen only */let tuiRemote:import('./remote/tui-remote.ts').TuiRemote|null=null;let runtime:CliRuntime|null=null;let releaseActiveRun:(()=>Promise<void>)|null=null;let releaseInterrupt:(()=>void)|null=null;let uninstallSignals:(()=>void)|null=null;let notices:readonly ConfigNotice[]=[];let noticesStreamed=false;try{const projectRoot=longPathForm(resolve(inv.project??process.cwd()));const paths=resolveCliPaths(process.env,process.platform,homedir());await ensureCliPaths(paths);initializeDevelopmentLogging({paths,projectRoot,argv,component:'cli-main'});developmentLog('cli.paths.ready',{projectRoot,paths},'info','cli-main');const interactive=inv.interactive&&io.stdinIsTTY&&io.stdoutIsTTY;const injectedRuntime=Boolean(deps.createRuntime||deps.createRuntimeContext);const trustInjected=Boolean(deps.assertProjectTrusted||deps.assessProjectTrust||deps.trustProjectAssessment||deps.promptProjectTrust);let projectUntrusted=false;if(trustInjected||!injectedRuntime){const trustInput={projectRoot,trustRoot:paths.trust.projects};if(interactive){const assessment=await (deps.assessProjectTrust??assessProjectTrust)(trustInput);/* R4 Q-R4-1: every folder with no saved decision is asked, with or without project files; headless keeps its rule (E3). */if(needsTrustQuestion(assessment)){const nestedRepositories=await nestedRepositoriesForProjectTrust(assessment);const choice=await (deps.promptProjectTrust??defaultPromptProjectTrust)({assessment,nestedRepositories,color:inv.color!==false,...await userThemeForTrust(paths,projectRoot),...(isFirstLaunch(paths.dataRoot)?{setupStep:true}:{})});/* Ctrl+C quits as before. No (a), owner's decision, form B: TALOS opens without the folder's instructions, hooks and connections, and asks for every change and command. */if(choice==='no')projectUntrusted=true;else{if(choice!=='trust'&&choice!=='trust-parent'&&choice!=='once')throw projectTrustFailure(assessment);const folder=folderTargetFor(choice,assessment);/* Session only with nothing to trust: nothing is written. */if(!assessment.trusted||folder!=='none')await (deps.trustProjectAssessment??trustProjectAssessment)({assessment,trustRoot:paths.trust.projects,nestedRepositories,...(assessment.folder?{folder}:{}),/* Q-R4-17: the home folder's grant, and «Only this time», are for this process only. */...(assessment.folder?.sessionOnly||choice==='once'?{sessionOnly:true}:{})});}}}else await (deps.assertProjectTrusted??assertProjectTrusted)(trustInput);}const effective=await loadEffectiveConfig({paths,projectRoot,...(projectUntrusted?{projectTrusted:false}:{}),cli:{...(inv.model?{model:inv.model}:{}),...(inv.permissionMode?{permissionMode:inv.permissionMode}:{})}});const selectedModel=effective.value.model??'openai:gpt-5-mini';const selectedMode=projectUntrusted?'default':inv.permissionMode??effective.value.permissionMode??'default';const rules=effective.value.permissions??{allow:[],ask:[],deny:[]};const effectiveKeymap=interactive?assertValidKeymap(effective.value.ui?.keymap):undefined;notices=projectUntrusted?[]:effective.ignored.map(({code,message})=>({code,message}));if(interactive||inv.outputFormat==='text')for(const notice of notices)io.writeErr(`Warning: ${inertTerminalText(notice.message)}\n`);let prompt=inv.prompt;if(!prompt&&!interactive&&!io.stdinIsTTY)prompt=(await io.readStdin()).trim();let activeRuntime:CliRuntime;let catalog:any=undefined;let liveRegistry:any=undefined;let startup:Promise<TuiStartup|null>|undefined;if(interactive){const contextFactory=deps.createRuntimeContext??defaultCreateRuntimeContext;
  /* Startup stage 1 (owner 02/10, «Entrambe, a tappe»; registro 12): the TUI starts at once and the kernel loads behind
     stand-ins that wait for it (runtime/deferred-context.ts) — the composer no longer waits ~0.25 s for the kernel. The
     configured reasoning effort is checked and applied on the real context BEFORE any waiting call goes through, so a first
     prompt carries it (M4-D); its notice goes to the TUI, since stderr is under the running screen. A kernel that fails to
     load ends the TUI with its error (tui/run.ts), which main reports as before. */
  let composedReady!:(context:any)=>void;const composed=new Promise<any>(resolve=>{composedReady=resolve;});
  {const {windowRemote}=await import('./remote/tui-remote-main.ts');tuiRemote=windowRemote({dataRoot:paths.dataRoot,projectRoot,repoRoot:findTalosRepoRoot(process.cwd()),composed});}
  const deferred=createDeferredRuntimeContext<TuiStartup>(contextFactory({projectRoot,paths,model:selectedModel,trustVerified:true,...(projectUntrusted?{projectUntrusted:true}:{}),environmentKeys:'consent',/* stage 3: a person is at the screen, so the model may ask */person:'present'}),{prepare:async context=>{composedReady(context);
    const resolved=await resolveReasoningDefault(context.tuiCatalog,selectedModel,effective.value.reasoningEffort);let effort=resolved.effort;let notice=resolved.notice;
    if(typeof context.runtime.setDefaultReasoningEffort==='function')context.runtime.setDefaultReasoningEffort(effort);else if(effort!==null){effort=null;notice={code:'REASONING_EFFORT_RUNTIME_UNAVAILABLE',message:`Configured reasoning effort could not be applied by this runtime; using model default.`};}
    return{reasoningEffort:effort,notices:notice?[notice]:[]};
  }});
  activeRuntime=deferred.runtime;catalog=deferred.catalog;liveRegistry=deferred.registry;startup=deferred.prepared;}else if(effective.value.reasoningEffort!==undefined&&(!deps.createRuntime||deps.createRuntimeContext)){const contextFactory=deps.createRuntimeContext??defaultCreateRuntimeContext;const context=await contextFactory({projectRoot,paths,model:selectedModel,trustVerified:true,environmentKeys:'use'});activeRuntime=context.runtime;catalog=context.tuiCatalog;}else{const factory=deps.createRuntime??defaultCreateRuntime;/* B1 slice 18: the entry decides. The screen asks before using an environment key; -p uses it and states its origin. */const raw=await factory({projectRoot,paths,model:selectedModel,trustVerified:true,environmentKeys:'use'});activeRuntime=(raw&&typeof raw.start==='function')?raw:createSessionFacade(raw.registry,{model:selectedModel});}
  /* headless: checked and applied here, before the first turn; interactive: in the stand-ins' prepare step above */
  let appliedReasoningEffort:ReasoningEffort|null=null;let reasoningNotice:ConfigNotice|null=null;
  if(!interactive){const reasoningDefault=await resolveReasoningDefault(catalog,selectedModel,effective.value.reasoningEffort);appliedReasoningEffort=reasoningDefault.effort;reasoningNotice=reasoningDefault.notice;
  if(typeof (activeRuntime as any).setDefaultReasoningEffort==='function')(activeRuntime as any).setDefaultReasoningEffort(appliedReasoningEffort);else if(appliedReasoningEffort!==null){appliedReasoningEffort=null;reasoningNotice={code:'REASONING_EFFORT_RUNTIME_UNAVAILABLE',message:`Configured reasoning effort could not be applied by this runtime; using model default.`};}
  if(reasoningNotice){notices=[...notices,reasoningNotice];if(inv.outputFormat==='text')io.writeErr(`Warning: ${inertTerminalText(reasoningNotice.message)}\n`);}}
  runtime=activeRuntime;
  /* F-022/RIF-1 (owner 05/10): before registering this process, sweep the markers left by dead ones (window closed,
     second Ctrl+C): unparsable, dead PIDs, or over age. TALOS_ACTIVE_RUN_RECONCILE=0 disables it. */
  if(process.env.TALOS_ACTIVE_RUN_RECONCILE!=='0'){try{const purged=await reconcileActiveRuns(paths);if(purged>0)developmentLog('cli.active_run.reconciled',{removed:purged},'info','cli-main');}catch(error){developmentLogError('cli.active_run.reconcile.failure',error,{},'cli-main');}}
  releaseActiveRun=await registerActiveRun(paths,{projectRoot});
  /* F-022 D2: a closed window (SIGHUP on Windows) or SIGTERM/SIGBREAK must not leave the marker behind. */
  /* R7 (reserve, owner 05/10): the forced exits (signal or second Ctrl+C) close the development log before leaving —
     process.exit skips the finally below, so the close rides on the exit path itself; closeDevelopmentLogging is sync
     and idempotent, which is what an exit path is allowed to be (Node docs: 'exit' listeners must be synchronous). */
  const forcedExit=deps.forcedExit??((code:number)=>{try{closeDevelopmentLogging({signalExit:true});}catch{}process.exit(code);});
  uninstallSignals=releaseOnSignals(signalsForPlatform(),{release:()=>releaseActiveRun?.(),exit:forcedExit});
  if(interactive){interactiveScreenRan=true;/* R4 Q-R4-13: what the first frame says was loaded (lane N renders it through onboardingSteps). */let loadedFiles:string[]=[];try{if(!projectUntrusted)loadedFiles=await (deps.loadedFiles??defaultLoadedFiles)(projectRoot);}catch(error){developmentLogError('cli.loaded_files.failure',error,{},'cli-main');}await (deps.runTui??defaultRunTui)({loadedFiles,...(projectUntrusted?{projectUntrusted:true}:{}),runtime:activeRuntime,registry:liveRegistry,catalog,invocation:{...inv,model:selectedModel,permissionMode:selectedMode},projectRoot,paths,permissionRules:rules,keymap:effectiveKeymap,uiTheme:effective.value.ui?.theme,exitOutput:effective.value.ui?.exitOutput,mouse:effective.value.ui?.mouse,notifications:effective.value.ui?.notifications,maxProseWidth:effective.value.ui?.maxProseWidth??null,reduceMotion:effective.value.ui?.reduceMotion===true,editor:effective.value.ui?.editor??null,toolRows:effective.value.ui?.toolRows??'grouped',startView:effective.value.ui?.startView??'essential',initialReasoningEffort:appliedReasoningEffort,startup,configuredModel:effective.value.model??null,autoClassifier:selectedMode==='auto'?createLocalAutoClassifier({shellIsolation:cliShellIsolation({paths:{cacheRoot:paths.cacheRoot}})}):undefined,shellIsolation:cliShellIsolation({paths:{cacheRoot:paths.cacheRoot}}),initialPrompt:prompt,...(tuiRemote?{remote:tuiRemote}:{})});await tuiRemote?.stop().catch(()=>{});return 0;}/* R3 Q-R3-13: the TUI asks the same shared probe once after the boot (No sandbox, (unsandboxed)). */
  const machineProtocol=inv.outputFormat==='text'?'v1':(inv.protocolVersion??'v1');
  const headlessStop=new AbortController();releaseInterrupt=(deps.onInterrupt??defaultOnInterrupt)(()=>{if(headlessStop.signal.aborted){/* F-022 D3 + R7: the second Ctrl+C answers on stderr, releases the marker under the same 5 s leash as the signal exits (a hung rm must not make Ctrl+C powerless), closes the development log (idempotent), and leaves with 130=128+SIGINT. */io.writeErr('\nSecond Ctrl+C: releasing the run marker and closing the development log.\n');const stop=async()=>{try{await Promise.race([Promise.resolve().then(()=>releaseActiveRun?.()).catch(()=>{}),new Promise<void>((resolve)=>{const timer=setTimeout(resolve,SIGNAL_RELEASE_TIMEOUT_MS);if(typeof timer.unref==='function')timer.unref();})]);}catch{}try{closeDevelopmentLogging({signalExit:'SIGINT'});}catch{}forcedExit(130);};void stop();return;}headlessStop.abort();/* R7: the first Ctrl+C answers too, so the second one is never a mystery (opencode footer.view.tsx:406, 'Press ctrl+c again to exit'). */if(!interactive)io.writeErr('\nInterrupted — press Ctrl+C again to force exit.\n');});
  /* 0.6.13: --attach-if-too-large sets the kernel's run option `allegaSeTroppoGrande` for this run (headless/run.ts, session-facade.ts) */
  const common={...(inv.attachIfTooLarge?{attachIfTooLarge:true}:{}),projectRoot,toolOutputRoot:toolOutputRoot(paths.dataRoot),model:selectedModel,permissionMode:selectedMode,permissionRules:rules,...(paths.checkpointsRoot?{checkpointsRoot:paths.checkpointsRoot}:{}),protocolVersion:machineProtocol,...(inv.timeoutSeconds!==undefined?{timeoutSeconds:inv.timeoutSeconds}:{}),...(selectedMode==='auto'?{autoClassifier:createLocalAutoClassifier({shellIsolation:cliShellIsolation({paths:{cacheRoot:paths.cacheRoot}})})}:{}),signal:headlessStop.signal};
  const streamNotices=(sessionId:string)=>{if(noticesStreamed)return;noticesStreamed=true;notices.forEach((notice,index)=>{if(machineProtocol==='v2')io.writeOut(encodeV2Event(createV2SyntheticEvent({sessionId,eventId:'talos:'+encodeURIComponent(sessionId||'none')+':config-notice:'+(index+1),type:'warning',data:{code:notice.code,message:notice.message}})));else io.writeOut(JSON.stringify(configNoticeEvent(sessionId,index+1,notice))+'\n');});};
  const onStreamEvent=inv.outputFormat==='stream-json'?(event:any)=>{streamNotices(String(event?.sessionId??''));if(machineProtocol==='v2')io.writeOut(encodeV2Event(event));else io.writeOut(JSON.stringify(notices.length?{...event,seq:Number(event.seq)+notices.length}:event)+'\n');}:undefined;let collected:any;
  if(inv.resume){await activeRuntime.restore();const id=await sessionId(activeRuntime,inv.resume);const previous=activeRuntime.export(id) as any;const from=Array.isArray(previous?.eventi)?previous.eventi.length:Array.isArray(previous?.events)?previous.events.length:0;collected=await collectHeadlessResume(activeRuntime,id,prompt,{...common,from,...(inv.model?{explicitModel:inv.model}:{})/* review B #1: only a typed --model is an override; selectedModel here is the config default and must never be persisted over the session's saved model */},onStreamEvent);}
  else if(inv.fork){await activeRuntime.restore();const id=await sessionId(activeRuntime,inv.fork);collected=await collectHeadlessFork(activeRuntime,id,prompt,{...common,from:0,...(inv.model?{explicitModel:inv.model}:{})},onStreamEvent);}
  else{if(!prompt)throw Object.assign(new Error('A prompt is required for headless mode'),{code:'CLI_USAGE_ERROR'});collected=await collectHeadlessRun(activeRuntime,{...common,prompt},onStreamEvent);}
  if(inv.outputFormat==='stream-json')streamNotices(String(collected.result.sessionId??''));
  const result=notices.length?(machineProtocol==='v2'?withV2RunWarnings(collected.result,[...notices.map(notice=>notice.message),...collected.result.warnings]):withRunWarnings(collected.result,[...notices.map(notice=>notice.message),...collected.result.warnings])):collected.result;
  return output(io,inv.outputFormat,machineProtocol,{...collected,result});
 }catch(error){developmentLogError('cli.main.failure',error,{notices},'cli-main');const protocol=inv.outputFormat==='text'?'v1':(inv.protocolVersion??'v1');const failure=renderFailureForProtocol(inv.outputFormat,protocol,error,inv.outputFormat==='json'||(inv.outputFormat==='stream-json'&&!noticesStreamed)?notices:[],inv.verbose);if(failure.toStderr)io.writeErr(failure.text);else io.writeOut(failure.text);return failure.exitCode;}finally{/* R3 (owner, 2026-09-24): quitting aborts a sandbox check still running (the TUI's startup check or the broker's first probe); it ends what it started and leaves no verdict. */try{const left=await abortIsolationChecks();/* ⛔ R3: a process a check could not prove its own was left running, never ended on trust: stated here. */if(left.length>0)developmentLog('cli.isolation.left_running',{pids:left,why:'the sandbox check could not prove at kill time that these pids were its own processes, so it did not end them'},'warning','cli-main');}catch{}try{await runtime?.close();}catch(error){developmentLogError('cli.runtime.close.failure',error,{},'cli-main');}try{releaseInterrupt?.();}catch{/* the handler is gone with the process */}try{uninstallSignals?.();}catch{/* the handlers are gone with the process */}try{await releaseActiveRun?.();}catch(error){developmentLogError('cli.active_run.release.failure',error,{},'cli-main');}closeDevelopmentLogging({runtimeClosed:true});}
}
/* Installation, Linux proof (02/10, registro 12): npm installs the bin on Linux and macOS as a symlink, so `process.argv[1]` is
   the link while `import.meta.url` is the real file, and comparing them left `talos` silent there since the first release.
   Node 24 says it itself (`import.meta.main`, 24.2.0, early development); real paths compared are the fallback. */
function startedAsProgram():boolean{
  if((import.meta as {main?:boolean}).main===true)return true;
  try{return Boolean(process.argv[1])&&realpathSync(process.argv[1]!)===realpathSync(fileURLToPath(import.meta.url));}catch{return false;}
}
/* `afterFinished`: `main` has returned — the screen ended, its exit transcript is written, and the `finally` above has awaited its
   own clean-up: the sandbox checks ended, `runtime.close()` (the ChatGPT plan's token work on its way, bounded; the plan's reads
   stopped; the Context Engine closed; the supervisor's journal released), the run marker, the development log. Nothing else is
   awaited (the list is in runtime/exit-backstop.ts). Only then, and only after the interactive screen, the backstop is armed; it
   fires only if something still holds the event loop, and what holds it is ended with the process. */
if(startedAsProgram())exitWhenFinished(main(process.argv.slice(2)).then(code=>{const folder=relaunchWanted();return folder?relaunch(folder):code;}),{writeErr:text=>process.stderr.write(text),onFatal:e=>developmentLogError('cli.process.fatal',e,{},'cli-main'),afterFinished:code=>{if(interactiveScreenRan)armExitBackstop({code,log:record=>developmentLogLate('cli.exit.backstop',{...record,why:'the screen had ended and every awaited clean-up was done, and something still kept the process alive'},'warning','cli-main')});}});
