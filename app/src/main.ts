#!/usr/bin/env node
import {resolve} from 'node:path';import {homedir} from 'node:os';import {pathToFileURL} from 'node:url';
import {stdio,type CliIo} from './io.ts';import {parseCliArgs,type OutputFormat} from './args.ts';import {CLI_VERSION} from './version.ts';import {resolveCliPaths,ensureCliPaths} from './paths.ts';import {loadEffectiveConfig} from './config/load.ts';import {createSessionFacade} from './runtime/session-facade.ts';import type {CliRuntime} from './runtime/types.ts';import {collectHeadlessFork,collectHeadlessResume,collectHeadlessRun} from './headless/run.ts';import {renderJson,renderText,exitCodeForResult,withRunWarnings} from './headless/result.ts';import {createLocalAutoClassifier} from './security/auto-classifier.ts';import {inertTerminalText,renderSafeTalosFailure} from './errors.ts';import {registerActiveRun} from './runtime/active-run.ts';
import {initializeDevelopmentLogging,developmentLog,developmentLogError,closeDevelopmentLogging,developmentTextEvidence} from './diagnostics/development-log.ts';
import {assessProjectTrust,assertProjectTrusted,nestedRepositoriesForProjectTrust,projectTrustFailure,trustProjectAssessment,type ProjectTrustAssessment} from './security/project-trust-gate.ts';import type {ProjectTrustPromptChoice,ProjectTrustPromptInput} from './tui/project-trust-prompt.ts';import type {ReasoningEffort} from './config/types.ts';import {providerOfModel} from './provider/environment-keys.ts';import {assertValidKeymap} from './tui/keymap-resolver.ts';
import {createV2FailureEvent,createV2RunResultAccumulator,createV2SyntheticEvent,withV2RunWarnings} from './protocol/v2/events.ts';import {encodeV2Event,encodeV2Result,exitCodeForV2Result} from './protocol/v2/codec.ts';
export type MainDeps={io:CliIo;createRuntime:(x:any)=>Promise<any>;createRuntimeContext:(x:any)=>Promise<any>;runTui:(x:any)=>Promise<void>;assertProjectTrusted:(x:{projectRoot:string;trustRoot:string})=>Promise<unknown>;assessProjectTrust:(x:{projectRoot:string;trustRoot:string})=>Promise<ProjectTrustAssessment>;trustProjectAssessment:(x:{assessment:ProjectTrustAssessment;trustRoot:string;nestedRepositories?:readonly any[]})=>Promise<ProjectTrustAssessment>;promptProjectTrust:(x:ProjectTrustPromptInput)=>Promise<ProjectTrustPromptChoice>};
async function defaultCreateRuntime(x:any){const {createCliRuntime}=await import('./runtime/create-runtime.ts');return createCliRuntime(x);}async function defaultCreateRuntimeContext(x:any){const {createCliRuntimeContext}=await import('./runtime/create-runtime.ts');return createCliRuntimeContext(x);}async function defaultRunTui(x:any){const {runInkTui}=await import('./tui/run.ts');return runInkTui(x);}async function defaultPromptProjectTrust(x:ProjectTrustPromptInput){const {runProjectTrustPrompt}=await import('./tui/project-trust-prompt.ts');return runProjectTrustPrompt(x);}
function help(){return `TALOS CLI ${CLI_VERSION}\nUsage:\n  talos [prompt...]\n  talos -p "prompt" [--json|--output-format stream-json]\n  talos --resume <id|last> [-p "prompt"]\n  talos --fork <id> [-p "prompt"]\n  talos <project|config|provider|model|session|mcp|hook|plugin|command|memory|notes|tasks|library|research|automation|forge|checkpoint|doctor|logs|diagnostic|update|init> ...\n\nGlobal options:\n  --project PATH  --model PROVIDER:MODEL  --permission-mode MODE\n  --protocol v1|v2  --resume ID  --fork ID  --timeout SECONDS  --verbose  --no-color\n`;}
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
function renderFailureForProtocol(format:OutputFormat,protocolVersion:'v1'|'v2',error:unknown,notices:readonly ConfigNotice[]=[]){
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
  return renderSafeTalosFailure(format,error,{component:'cli',notices});
}

async function resolveReasoningDefault(catalog:any,model:string,configured:ReasoningEffort|undefined):Promise<{effort:ReasoningEffort|null;notice:ConfigNotice|null}>{
  if(configured===undefined)return{effort:null,notice:null};
  if(!catalog||typeof catalog.listModels!=='function')return{effort:null,notice:{code:'REASONING_EFFORT_CAPABILITY_UNKNOWN',message:`Configured reasoning effort "${configured}" was not applied because TALOS could not verify ${model} capabilities; using model default.`}};
  try{
    const provider=providerOfModel(model);const rows=await catalog.listModels(provider?{provider}:{});const row=rows.find((candidate:any)=>candidate?.id===model);
    if(row?.reasoning===true&&Array.isArray(row.reasoningEfforts)&&row.reasoningEfforts.includes(configured))return{effort:configured,notice:null};
    return{effort:null,notice:{code:'REASONING_EFFORT_UNSUPPORTED',message:`Configured reasoning effort "${configured}" is not affirmed for ${model}; using model default and sending no effort override.`}};
  }catch{
    return{effort:null,notice:{code:'REASONING_EFFORT_CAPABILITY_UNKNOWN',message:`Configured reasoning effort "${configured}" was not applied because ${model} capabilities could not be read; using model default.`}};
  }
}
function configNoticeEvent(sessionId:string,seq:number,notice:ConfigNotice){return{schema:'talos.cli.event.v1',seq,ts:new Date().toISOString(),sessionId,type:'warning',data:{code:notice.code,message:notice.message}};}
function output(io:CliIo,format:string,protocolVersion:'v1'|'v2',collected:any){if(format==='json')io.writeOut(protocolVersion==='v2'?encodeV2Result(collected.result):renderJson(collected.result));else if(format!=='stream-json')io.writeOut(renderText(collected.result));return protocolVersion==='v2'?exitCodeForV2Result(collected.result):exitCodeForResult(collected.result);}
export async function main(argv:string[],deps:Partial<MainDeps>={}):Promise<number>{const io=deps.io??stdio;initializeDevelopmentLogging({...(process.env.TALOS_CLI_DEV_LOG_DIR?{logDir:process.env.TALOS_CLI_DEV_LOG_DIR}:{}),argv,component:'cli-main'});developmentLog('cli.main.enter',{argv:argv.map(developmentTextEvidence)});let inv;try{inv=parseCliArgs(argv);}catch(error){developmentLogError('cli.args.failure',error,{argv:argv.map(developmentTextEvidence)},'cli-main');const format=outputFormatHint(argv);const failure=renderFailureForProtocol(format,format==='text'?'v1':protocolVersionHint(argv),error);if(failure.toStderr)io.writeErr(failure.text);else io.writeOut(failure.text);closeDevelopmentLogging({exitCode:failure.exitCode,reason:'args'});return failure.exitCode;}if(inv.command==='version'){io.writeOut(`${CLI_VERSION}\n`);closeDevelopmentLogging({exitCode:0,reason:'version'});return 0;}if(inv.command==='help'){io.writeOut(help());closeDevelopmentLogging({exitCode:0,reason:'help'});return 0;}if(inv.command==='subcommand'){const {runSubcommand}=await import('./subcommands.ts');const code=await runSubcommand(inv,{io,createRuntimeContext:deps.createRuntimeContext??defaultCreateRuntimeContext});closeDevelopmentLogging({exitCode:code,reason:'subcommand'});return code;}
 let runtime:CliRuntime|null=null;let releaseActiveRun:(()=>Promise<void>)|null=null;let notices:readonly ConfigNotice[]=[];let noticesStreamed=false;try{const projectRoot=resolve(inv.project??process.cwd());const paths=resolveCliPaths(process.env,process.platform,homedir());await ensureCliPaths(paths);initializeDevelopmentLogging({paths,projectRoot,argv,component:'cli-main'});developmentLog('cli.paths.ready',{projectRoot,paths},'info','cli-main');const interactive=inv.interactive&&io.stdinIsTTY&&io.stdoutIsTTY;const injectedRuntime=Boolean(deps.createRuntime||deps.createRuntimeContext);const trustInjected=Boolean(deps.assertProjectTrusted||deps.assessProjectTrust||deps.trustProjectAssessment||deps.promptProjectTrust);if(trustInjected||!injectedRuntime){const trustInput={projectRoot,trustRoot:paths.trust.projects};if(interactive){const assessment=await (deps.assessProjectTrust??assessProjectTrust)(trustInput);if(!assessment.trusted){const nestedRepositories=await nestedRepositoriesForProjectTrust(assessment);const choice=await (deps.promptProjectTrust??defaultPromptProjectTrust)({assessment,nestedRepositories});if(choice!=='trust')throw projectTrustFailure(assessment);await (deps.trustProjectAssessment??trustProjectAssessment)({assessment,trustRoot:paths.trust.projects,nestedRepositories});}}else await (deps.assertProjectTrusted??assertProjectTrusted)(trustInput);}const effective=await loadEffectiveConfig({paths,projectRoot,cli:{...(inv.model?{model:inv.model}:{}),...(inv.permissionMode?{permissionMode:inv.permissionMode}:{})}});const selectedModel=effective.value.model??'openai:gpt-5-mini';const selectedMode=inv.permissionMode??effective.value.permissionMode??'default';const rules=effective.value.permissions??{allow:[],ask:[],deny:[]};const effectiveKeymap=interactive?assertValidKeymap(effective.value.ui?.keymap):undefined;notices=effective.ignored.map(({code,message})=>({code,message}));if(interactive||inv.outputFormat==='text')for(const notice of notices)io.writeErr(`Warning: ${inertTerminalText(notice.message)}\n`);let prompt=inv.prompt;if(!prompt&&!interactive&&!io.stdinIsTTY)prompt=(await io.readStdin()).trim();let activeRuntime:CliRuntime;let catalog:any=undefined;let liveRegistry:any=undefined;if(interactive){const contextFactory=deps.createRuntimeContext??defaultCreateRuntimeContext;const context=await contextFactory({projectRoot,paths,model:selectedModel,trustVerified:true,environmentKeys:'consent'});activeRuntime=context.runtime;catalog=context.tuiCatalog;liveRegistry=context.registry;}else if(effective.value.reasoningEffort!==undefined&&(!deps.createRuntime||deps.createRuntimeContext)){const contextFactory=deps.createRuntimeContext??defaultCreateRuntimeContext;const context=await contextFactory({projectRoot,paths,model:selectedModel,trustVerified:true,environmentKeys:'use'});activeRuntime=context.runtime;catalog=context.tuiCatalog;}else{const factory=deps.createRuntime??defaultCreateRuntime;/* B1 slice 18: the entry decides. The screen asks before using an environment key; -p uses it and states its origin. */const raw=await factory({projectRoot,paths,model:selectedModel,trustVerified:true,environmentKeys:'use'});activeRuntime=(raw&&typeof raw.start==='function')?raw:createSessionFacade(raw.registry,{model:selectedModel});}
  const reasoningDefault=await resolveReasoningDefault(catalog,selectedModel,effective.value.reasoningEffort);let appliedReasoningEffort=reasoningDefault.effort;let reasoningNotice=reasoningDefault.notice;
  if(typeof (activeRuntime as any).setDefaultReasoningEffort==='function')(activeRuntime as any).setDefaultReasoningEffort(appliedReasoningEffort);else if(appliedReasoningEffort!==null){appliedReasoningEffort=null;reasoningNotice={code:'REASONING_EFFORT_RUNTIME_UNAVAILABLE',message:`Configured reasoning effort could not be applied by this runtime; using model default.`};}
  if(reasoningNotice){notices=[...notices,reasoningNotice];if(interactive||inv.outputFormat==='text')io.writeErr(`Warning: ${inertTerminalText(reasoningNotice.message)}\n`);}
  runtime=activeRuntime;
  releaseActiveRun=await registerActiveRun(paths,{projectRoot});
  if(interactive){await (deps.runTui??defaultRunTui)({runtime:activeRuntime,registry:liveRegistry,catalog,invocation:{...inv,model:selectedModel,permissionMode:selectedMode},projectRoot,paths,permissionRules:rules,keymap:effectiveKeymap,uiTheme:effective.value.ui?.theme,initialReasoningEffort:appliedReasoningEffort,autoClassifier:selectedMode==='auto'?createLocalAutoClassifier():undefined,initialPrompt:prompt});return 0;}
  const machineProtocol=inv.outputFormat==='text'?'v1':(inv.protocolVersion??'v1');
  const common={projectRoot,model:selectedModel,permissionMode:selectedMode,permissionRules:rules,...(paths.checkpointsRoot?{checkpointsRoot:paths.checkpointsRoot}:{}),protocolVersion:machineProtocol,...(inv.timeoutSeconds!==undefined?{timeoutSeconds:inv.timeoutSeconds}:{}),...(selectedMode==='auto'?{autoClassifier:createLocalAutoClassifier()}:{})};
  const streamNotices=(sessionId:string)=>{if(noticesStreamed)return;noticesStreamed=true;notices.forEach((notice,index)=>{if(machineProtocol==='v2')io.writeOut(encodeV2Event(createV2SyntheticEvent({sessionId,eventId:'talos:'+encodeURIComponent(sessionId||'none')+':config-notice:'+(index+1),type:'warning',data:{code:notice.code,message:notice.message}})));else io.writeOut(JSON.stringify(configNoticeEvent(sessionId,index+1,notice))+'\n');});};
  const onStreamEvent=inv.outputFormat==='stream-json'?(event:any)=>{streamNotices(String(event?.sessionId??''));if(machineProtocol==='v2')io.writeOut(encodeV2Event(event));else io.writeOut(JSON.stringify(notices.length?{...event,seq:Number(event.seq)+notices.length}:event)+'\n');}:undefined;let collected:any;
  if(inv.resume){await activeRuntime.restore();const id=await sessionId(activeRuntime,inv.resume);const previous=activeRuntime.export(id) as any;const from=Array.isArray(previous?.eventi)?previous.eventi.length:Array.isArray(previous?.events)?previous.events.length:0;collected=await collectHeadlessResume(activeRuntime,id,prompt,{...common,from},onStreamEvent);}
  else if(inv.fork){await activeRuntime.restore();const id=await sessionId(activeRuntime,inv.fork);collected=await collectHeadlessFork(activeRuntime,id,prompt,{...common,from:0},onStreamEvent);}
  else{if(!prompt)throw Object.assign(new Error('A prompt is required for headless mode'),{code:'CLI_USAGE_ERROR'});collected=await collectHeadlessRun(activeRuntime,{...common,prompt},onStreamEvent);}
  if(inv.outputFormat==='stream-json')streamNotices(String(collected.result.sessionId??''));
  const result=notices.length?(machineProtocol==='v2'?withV2RunWarnings(collected.result,[...notices.map(notice=>notice.message),...collected.result.warnings]):withRunWarnings(collected.result,[...notices.map(notice=>notice.message),...collected.result.warnings])):collected.result;
  return output(io,inv.outputFormat,machineProtocol,{...collected,result});
 }catch(error){developmentLogError('cli.main.failure',error,{notices},'cli-main');const protocol=inv.outputFormat==='text'?'v1':(inv.protocolVersion??'v1');const failure=renderFailureForProtocol(inv.outputFormat,protocol,error,inv.outputFormat==='json'||(inv.outputFormat==='stream-json'&&!noticesStreamed)?notices:[]);if(failure.toStderr)io.writeErr(failure.text);else io.writeOut(failure.text);return failure.exitCode;}finally{try{await runtime?.close();}catch(error){developmentLogError('cli.runtime.close.failure',error,{},'cli-main');}try{await releaseActiveRun?.();}catch(error){developmentLogError('cli.active_run.release.failure',error,{},'cli-main');}closeDevelopmentLogging({runtimeClosed:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){main(process.argv.slice(2)).then(c=>{process.exitCode=c;},e=>{developmentLogError('cli.process.fatal',e,{},'cli-main');console.error(e);process.exitCode=70;});}
