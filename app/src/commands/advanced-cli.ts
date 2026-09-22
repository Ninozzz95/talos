import {dirname,join,resolve} from 'node:path';
import type {CommandContext} from './context.ts';
import {assertNoUnknownOptions,takeFlag,takeOption,writeValue} from './context.ts';
import {importTalosModule} from '../runtime/repo.ts';import {createResearchFacade,type ResearchExportFormat} from '../services/research-facade.ts';import {createAutomationFacade} from '../services/automation-facade.ts';import {createAutomationPolicyStore} from '../automations/policy-store.ts';import {createAutomationHistoryStore} from '../automations/history-store.ts';import {runAutomationTick} from '../automations/runner.ts';import {installWindowsAutomationRunner,probeWindowsAutomationRunner,uninstallWindowsAutomationRunner} from '../automations/windows-task.ts';import {keyOriginForEntry,stateKeyOrigin} from '../provider/environment-keys.ts';

function need(v:string|undefined,name:string){if(!v)throw new Error(`${name}_REQUIRED`);return v;}
function int(raw:string|undefined,name:string,min=1){if(raw===undefined)throw new Error(`${name}_REQUIRED`);const n=Number(raw);if(!Number.isSafeInteger(n)||n<min)throw new Error(`${name}_INVALID`);return n;}

export async function runResearchCommand(ctx:CommandContext,args0:string[]){
  const args=[...args0];const op=args.shift()??'list';const mod:any=await importTalosModule(ctx.repoRoot,'research-store.mjs');
  if(op==='start'){
    const depthRaw=takeOption(args,'--depth')??'4';const depth=int(depthRaw,'RESEARCH_DEPTH',2);if(![2,4,6].includes(depth))throw new Error('RESEARCH_DEPTH_INVALID');assertNoUnknownOptions(args);
    const question=args.join(' ').trim();if(!question)throw new Error('RESEARCH_QUERY_REQUIRED');
    const model=ctx.invocation.model??'openai:gpt-5-mini';
    /* B1 slice 18: a one-shot command that runs a model uses an environment key without asking, states its origin, and names a missing key before sending. */
    const rc=await ctx.createRuntimeContext({projectRoot:ctx.projectRoot,paths:ctx.paths,repoRoot:ctx.repoRoot,model,environmentKeys:'use'});
    const origin=stateKeyOrigin(ctx.io,ctx.invocation.outputFormat,keyOriginForEntry(rc.runtime,model,{refuseMissing:true}));
    await rc.registry.ripristina?.();
    const prompt=`Use TALOS Deep Research for the following question. Start the research with depth ${depth}, follow its verification and source-retention workflow, and report the research id immediately; do not replace Deep Research with an ordinary web summary.\n\n${question}`;
    const sessionId=await rc.runtime.start({projectRoot:ctx.projectRoot,prompt,model,permissionMode:'plan'});
    writeValue(ctx,{sessionId,question,depth,started:true,...origin},`${sessionId}\n`);return 0;
  }
  if(op==='list'){assertNoUnknownOptions(args);const rows=await mod.elencaRicerche({cartella:ctx.projectRoot});writeValue(ctx,rows);return 0;}
  const id=need(args.shift(),'RESEARCH_ID');
  if(op==='read'){assertNoUnknownOptions(args);const row=await mod.leggiRicerca({cartella:ctx.projectRoot,id});if(!row)throw new Error('RESEARCH_NOT_FOUND');writeValue(ctx,row);return 0;}
  if(op==='rename'){const title=need(args.shift(),'RESEARCH_TITLE');assertNoUnknownOptions(args);const row=await mod.aggiornaRicerca({cartella:ctx.projectRoot,id,titolo:title});writeValue(ctx,row);return 0;}
  if(op==='delete'){assertNoUnknownOptions(args);await mod.eliminaRicerca({cartella:ctx.projectRoot,id});writeValue(ctx,{ok:true,id},`Deleted research ${id}\n`);return 0;}
  if(op==='export'){
    const format=need(args.shift(),'RESEARCH_EXPORT_FORMAT') as ResearchExportFormat;const out=args.shift();const tone=takeOption(args,'--tone');assertNoUnknownOptions(args);
    const facade=createResearchFacade({projectRoot:ctx.projectRoot,repoRoot:ctx.repoRoot});const result=await facade.exportFile(id,format,out,tone);writeValue(ctx,result,`${result.path}\n`);return 0;
  }
  if(op==='pause'||op==='resume'||op==='cancel'){
    assertNoUnknownOptions(args);const model=ctx.invocation.model??'openai:gpt-5-mini';const rc=await ctx.createRuntimeContext({projectRoot:ctx.projectRoot,paths:ctx.paths,repoRoot:ctx.repoRoot,model,environmentKeys:'use'});await rc.registry.ripristina?.();
    const facade=createResearchFacade({projectRoot:ctx.projectRoot,repoRoot:ctx.repoRoot},{registry:rc.registry});const result=op==='pause'?await facade.pause(id,id):op==='resume'?await facade.resume(id,id):await facade.cancel(id,id);writeValue(ctx,result);return 0;
  }
  throw new Error(`Unsupported research operation: ${op}`);
}

export async function runAutomationCommand(ctx:CommandContext,args0:string[],deps:{platform?:string;cliRoot?:string;username?:string;installRunnerFn?:typeof installWindowsAutomationRunner;uninstallRunnerFn?:typeof uninstallWindowsAutomationRunner;probeRunnerFn?:typeof probeWindowsAutomationRunner}={}){
  const args=[...args0];const op=args.shift()??'list';
  if(op==='install-runner'||op==='uninstall-runner'){const yes=takeFlag(args,'--yes');assertNoUnknownOptions(args);if(!yes)throw Object.assign(new Error('AUTOMATION_CONFIRM_REQUIRED'),{code:'AUTOMATION_CONFIRM_REQUIRED'});const platform=deps.platform??process.platform;if(platform!=='win32')throw Object.assign(new Error('WINDOWS_REQUIRED'),{code:'WINDOWS_REQUIRED'});const cliRoot=deps.cliRoot??resolve(dirname(process.execPath),'..');const username=deps.username??([process.env.USERDOMAIN,process.env.USERNAME].filter(Boolean).join('\\\\')||process.env.USERNAME||'');if(op==='install-runner'){const install=deps.installRunnerFn??installWindowsAutomationRunner;const result=await install({platform,cliRoot,definitionDir:join(ctx.paths.dataRoot,'automations','runner'),username});writeValue(ctx,result,'Automation runner installed\\n');return 0;}const uninstall=deps.uninstallRunnerFn??uninstallWindowsAutomationRunner;const result=await uninstall({platform});writeValue(ctx,result,'Automation runner removed\\n');return 0;}
  if(op==='health'){assertNoUnknownOptions(args);const probe=deps.probeRunnerFn??probeWindowsAutomationRunner;const result=await probe({platform:deps.platform??process.platform});writeValue(ctx,result);return 0;}
  const mod:any=await importTalosModule(ctx.repoRoot,'automation-store.mjs');const store=mod.createAutomationStore({cartella:join(ctx.paths.dataRoot,'automations')});
  const policyStore=createAutomationPolicyStore(join(ctx.paths.dataRoot,'automation-policies'));const historyStore=createAutomationHistoryStore(join(ctx.paths.dataRoot,'automation-history'));
  const facade=createAutomationFacade({projectRoot:ctx.projectRoot,dataRoot:ctx.paths.dataRoot,repoRoot:ctx.repoRoot},{loadAutomationStore:async()=>store,policyStore,historyStore,probeHealth:deps.probeRunnerFn??probeWindowsAutomationRunner});
  if(op==='list'){assertNoUnknownOptions(args);writeValue(ctx,await facade.list());return 0;}
  if(op==='add'){const taskId=need(args.shift(),'AUTOMATION_TASK');const interval=int(takeOption(args,'--interval')??'5','AUTOMATION_INTERVAL',5);const limit=int(takeOption(args,'--limit')??'3','AUTOMATION_LIMIT');const name=takeOption(args,'--name');assertNoUnknownOptions(args);const row=await store.crea({taskId,nome:name,intervalloMinuti:interval,limiteAlGiorno:limit});writeValue(ctx,row);return 0;}
  if(op==='serve'){
    const once=takeFlag(args,'--once');assertNoUnknownOptions(args);const model=ctx.invocation.model??'openai:gpt-5-mini';const rc=await ctx.createRuntimeContext({projectRoot:ctx.projectRoot,paths:ctx.paths,repoRoot:ctx.repoRoot,model,environmentKeys:'use'});const origin=stateKeyOrigin(ctx.io,ctx.invocation.outputFormat,keyOriginForEntry(rc.runtime,model,{refuseMissing:false}));await rc.registry.ripristina?.();
    const tick=async()=>runAutomationTick({rows:await store.elenca(),policyFor:(id:string)=>policyStore.get(id),savePolicy:(id:string,p:any)=>policyStore.put(id,p),appendHistory:(id:string,h:any)=>historyStore.append(id,h),recordExecution:(id:string)=>store.registraEsecuzione(id),registry:rc.registry});
    if(once){const result=await tick();writeValue(ctx,{ok:true,once:true,result,...origin},'Automation tick complete\\n');return 0;}
    let inFlight:Promise<unknown>|null=null;const startTick=()=>{if(inFlight)return;inFlight=tick().catch(()=>undefined).finally(()=>{inFlight=null;});};const timer=setInterval(startTick,30_000);
    writeValue(ctx,{ok:true,running:true,...origin},'TALOS automation runner active; Ctrl+C to stop\\n');await new Promise<void>((resolve)=>{const stop=()=>{clearInterval(timer);process.off('SIGINT',stop);process.off('SIGTERM',stop);resolve();};process.once('SIGINT',stop);process.once('SIGTERM',stop);});return 0;
  }
  const id=need(args.shift(),'AUTOMATION_ID');
  if(op==='schedule'){
    const at=need(takeOption(args,'--at'),'AUTOMATION_TIME');const timezone=need(takeOption(args,'--timezone'),'AUTOMATION_TIMEZONE');const missed=need(takeOption(args,'--missed'),'AUTOMATION_MISSED_POLICY');if(missed!=='skip'&&missed!=='latest')throw new Error('AUTOMATION_MISSED_POLICY_INVALID');
    const grace=int(takeOption(args,'--grace-minutes')??'5','AUTOMATION_GRACE',0);const catchup=int(takeOption(args,'--catchup-minutes')??(missed==='latest'?'180':'0'),'AUTOMATION_CATCHUP',0);const base=int(takeOption(args,'--backoff-base-seconds')??'30','AUTOMATION_BACKOFF_BASE');const max=int(takeOption(args,'--backoff-max-seconds')??'900','AUTOMATION_BACKOFF_MAX');assertNoUnknownOptions(args);if(max<base)throw new Error('AUTOMATION_BACKOFF_INVALID');
    const result=await facade.configureDaily(id,{at,timezone,missed,graceMinutes:grace,catchupWindowMinutes:catchup,baseSeconds:base,maxSeconds:max});writeValue(ctx,result);return 0;
  }
  if(op==='dry-run'){assertNoUnknownOptions(args);writeValue(ctx,await facade.dryRun(id));return 0;}
  if(op==='history'){assertNoUnknownOptions(args);writeValue(ctx,await facade.history(id));return 0;}
  if(op==='enable'||op==='disable'){assertNoUnknownOptions(args);writeValue(ctx,await facade.setEnabled(id,op==='enable'));return 0;}
  if(op==='delete'){assertNoUnknownOptions(args);await store.elimina(id);await Promise.all([policyStore.delete(id),historyStore.delete(id)]);writeValue(ctx,{ok:true,id},'Deleted automation '+id+'\\n');return 0;}
  if(op==='run'){
    assertNoUnknownOptions(args);const row=await store.leggi(id);if(!row)throw new Error('AUTOMATION_NOT_FOUND');const model=ctx.invocation.model??'openai:gpt-5-mini';const rc=await ctx.createRuntimeContext({projectRoot:ctx.projectRoot,paths:ctx.paths,repoRoot:ctx.repoRoot,model,environmentKeys:'use'});const origin=stateKeyOrigin(ctx.io,ctx.invocation.outputFormat,keyOriginForEntry(rc.runtime,model,{refuseMissing:false}));await rc.registry.ripristina?.();const attemptedAt=new Date().toISOString();
    try{let result:any;if(typeof rc.registry.avvia==='function')result=await rc.registry.avvia(row.taskId,{}, {kind:'talos-cli-automation-manual'});else result=await rc.runtime.start({projectRoot:ctx.projectRoot,prompt:'Run TALOS task '+row.taskId,model,permissionMode:'dontAsk'});if(result?.erroreAvvio)throw Object.assign(new Error(result.erroreAvvio),{code:result.code});const sessionId=typeof result==='string'?result:result?.sessionId;if(!sessionId)throw Object.assign(new Error('AUTOMATION_SESSION_ID_MISSING'),{code:'AUTOMATION_SESSION_ID_MISSING'});await store.registraEsecuzione(id);await historyStore.append(id,{attemptedAt,scheduledAt:null,slotKey:null,outcome:'dispatch-started',sessionId,errorCode:null,errorMessage:null,nextRetryAt:null});writeValue(ctx,{ok:true,id,sessionId,...origin},sessionId+'\\n');return 0;}catch(error:any){await historyStore.append(id,{attemptedAt,scheduledAt:null,slotKey:null,outcome:'dispatch-failed',sessionId:null,errorCode:typeof error?.code==='string'?error.code:'AUTOMATION_DISPATCH_FAILED',errorMessage:error instanceof Error?error.message:String(error),nextRetryAt:null});throw error;}
  }
  throw new Error('Unsupported automation operation: '+op);
}
