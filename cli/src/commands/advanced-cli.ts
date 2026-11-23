import {dirname,join,resolve} from 'node:path';
import type {CommandContext} from './context.ts';
import {t} from '../i18n/index.ts';
import {describeError} from '../i18n/error-view.ts';
import {assertNoUnknownOptions,takeFlag,takeOption,writeValue} from './context.ts';
import {describeRun,modeWords,runOutcome,runOutcomeWords,runReasonWords,runTime} from '../automations/run-words.ts';
import {HOST_BEAT_MS,createHostLease,type HostLeaseHandle} from '../automations/host-lease.ts';
import {answerHostRequests,runEnded} from '../automations/cli-scheduler.ts';
import {importTalosModule} from '../runtime/repo.ts';import {createResearchFacade,type ResearchExportFormat} from '../services/research-facade.ts';import {createAutomationFacade} from '../services/automation-facade.ts';import {WHEN_FORMS} from '../automations/when.ts';import {parseAutomationMode} from '../automations/kernel-runs.ts';import {AUTOMATION_TICK_MS,createCliAutomationScheduler} from '../automations/cli-scheduler.ts';import {assessProjectTrust} from '../security/project-trust-gate.ts';import {loadEffectiveConfig} from '../config/load.ts';import {installWindowsAutomationRunner,probeWindowsAutomationRunner,uninstallWindowsAutomationRunner} from '../automations/windows-task.ts';import {keyOriginForEntry,stateKeyOrigin} from '../provider/environment-keys.ts';

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

/*
 * 0.6.6 (owner 14/10/2026, «Comandi ora, schermata dopo»; «Una frase breve»): `talos automation` on the kernel's v2 automations.
 *   add "<instructions>" --when "<when>" [--name N] [--folder PATH] [--model M] [--mode MODE] [--repeat N] [--coordination] [--timezone TZ]
 *   edit <id> [--instructions T] [--when W] [--name N] [--folder PATH] [--model M|--default-model] [--mode MODE] [--repeat N|--forever] [--coordination|--no-coordination] [--timezone TZ]
 *   list · show <id> · history <id> · run <id> · serve [--once] · enable|disable <id> · delete <id> · health · install-runner|uninstall-runner --yes
 * `schedule` and `dry-run` (0.6.5, the old format's daily policy) are gone: `edit --when` and `show` say the same.
 */
const REMOVED_AUTOMATION_OPERATIONS=new Set(['schedule','dry-run']);
const coded=(code:string,message:string)=>Object.assign(new Error(message),{code});
export async function runAutomationCommand(ctx:CommandContext,args0:string[],deps:{platform?:string;cliRoot?:string;username?:string;installRunnerFn?:typeof installWindowsAutomationRunner;uninstallRunnerFn?:typeof uninstallWindowsAutomationRunner;probeRunnerFn?:typeof probeWindowsAutomationRunner;assessTrust?:typeof assessProjectTrust;tickMs?:number}={}){
  const args=[...args0];const op=args.shift()??'list';
  /* the options of add and edit, read before the operations (the help-drift check reads each operation's own segment) */
  const options=(edit:boolean)=>{
    const out:Record<string,unknown>={};
    const when=takeOption(args,'--when');if(when!==undefined)out.when=when;
    const name=takeOption(args,'--name');if(name!==undefined)out.name=name;
    const folder=takeOption(args,'--folder');if(folder!==undefined)out.folder=folder;
    const model=takeOption(args,'--model');if(model!==undefined)out.model=model;
    if(edit&&takeFlag(args,'--default-model'))out.model=null;
    const mode=takeOption(args,'--mode');if(mode!==undefined)out.mode=parseAutomationMode(mode);
    const repeat=takeOption(args,'--repeat');if(repeat!==undefined)out.repeat=int(repeat,'AUTOMATION_REPEAT',1);
    if(edit&&takeFlag(args,'--forever'))out.repeat=null;
    if(takeFlag(args,'--coordination'))out.coordination=true;
    if(edit&&takeFlag(args,'--no-coordination'))out.coordination=false;
    const timezone=takeOption(args,'--timezone');if(timezone!==undefined)out.timezone=timezone;
    if(edit){const instructions=takeOption(args,'--instructions');if(instructions!==undefined)out.instructions=instructions;}
    return out;
  };
  const next=(row:any)=>row.nextRunAt&&row.active?t('automation.row.next',{at:row.nextRunAt}):'';
  const line=(row:any)=>t('automation.row',{id:row.id,state:t(row.active?'automation.row.on':'automation.row.off'),schedule:row.schedule,next:next(row),name:row.name,legacy:row.legacy?t('automation.row.legacy'):''})+'\n';
  if(op==='install-runner'||op==='uninstall-runner'){const yes=takeFlag(args,'--yes');assertNoUnknownOptions(args);if(!yes)throw Object.assign(new Error('AUTOMATION_CONFIRM_REQUIRED'),{code:'AUTOMATION_CONFIRM_REQUIRED'});const platform=deps.platform??process.platform;if(platform!=='win32')throw Object.assign(new Error('WINDOWS_REQUIRED'),{code:'WINDOWS_REQUIRED'});const cliRoot=deps.cliRoot??resolve(dirname(process.execPath),'..');const username=deps.username??([process.env.USERDOMAIN,process.env.USERNAME].filter(Boolean).join('\\')||process.env.USERNAME||'');if(op==='install-runner'){const install=deps.installRunnerFn??installWindowsAutomationRunner;const result=await install({platform,cliRoot,definitionDir:join(ctx.paths.dataRoot,'automations','runner'),username});writeValue(ctx,result,'Automation runner installed\n');return 0;}const uninstall=deps.uninstallRunnerFn??uninstallWindowsAutomationRunner;const result=await uninstall({platform});writeValue(ctx,result,'Automation runner removed\n');return 0;}
  if(op==='health'){assertNoUnknownOptions(args);const probe=deps.probeRunnerFn??probeWindowsAutomationRunner;const result=await probe({platform:deps.platform??process.platform});writeValue(ctx,result);return 0;}
  if(REMOVED_AUTOMATION_OPERATIONS.has(op))throw coded('AUTOMATION_OPERATION_REMOVED',t('error.code.AUTOMATION_OPERATION_REMOVED.what'));
  const facade=createAutomationFacade({projectRoot:ctx.projectRoot,dataRoot:ctx.paths.dataRoot,repoRoot:ctx.repoRoot},{probeHealth:deps.probeRunnerFn??probeWindowsAutomationRunner});
  const assess=deps.assessTrust??assessProjectTrust;
  const trustedFolder=async(folder:string)=>{const absolute=resolve(ctx.projectRoot,folder);const verdict=await assess({projectRoot:absolute,trustRoot:ctx.paths.trust.projects});if(!verdict.trusted)throw coded('PROJECT_TRUST_REQUIRED',t('automation.trust.folder',{folder:absolute}));return absolute;};
  if(op==='list'){assertNoUnknownOptions(args);const snapshot=await facade.list();writeValue(ctx,snapshot,snapshot.rows.length?snapshot.rows.map(line).join(''):t('automation.empty')+'\n');return snapshot.state==='ready'?0:1;}
  if(op==='add'){
    const parsed=options(false);const instructions=args.shift();assertNoUnknownOptions(args);
    if(!instructions)throw coded('AUTOMATION_INSTRUCTIONS_REQUIRED',t('error.code.AUTOMATION_INSTRUCTIONS_REQUIRED.what'));
    if(parsed.when===undefined)throw coded('AUTOMATION_WHEN_REQUIRED',t('error.code.AUTOMATION_WHEN_REQUIRED.what'));
    const folder=await trustedFolder(String(parsed.folder??ctx.projectRoot));
    const row=await facade.add({...parsed,instructions,when:String(parsed.when),folder} as any);
    writeValue(ctx,row,t('automation.made',{id:row.id,name:row.name,schedule:row.schedule,next:row.nextRunAt?t('automation.next',{at:row.nextRunAt}):''})+'\n');return 0;
  }
  if(op==='run'||op==='serve')return runAutomationHost(ctx,op,args,deps);
  const id=need(args.shift(),'AUTOMATION_ID');
  if(op==='edit'){const parsed=options(true);assertNoUnknownOptions(args);if(parsed.folder!==undefined)parsed.folder=await trustedFolder(String(parsed.folder));const row=await facade.edit(id,parsed as any);writeValue(ctx,row,t('automation.changed',{id:row.id,name:row.name,schedule:row.schedule})+'\n');return 0;}
  if(op==='show'){
    assertNoUnknownOptions(args);const d=await facade.read(id);
    const body=d.legacy?t('automation.show.legacy'):[t('automation.show.when',{schedule:d.schedule,zone:d.timezone?` (${d.timezone})`:'',state:t(d.active?'automation.row.on':'automation.row.off').trim(),next:next(d)}),t('automation.show.where',{folder:d.folder??'',mode:modeWords(d.mode),model:d.model??t('automation.show.defaultModel'),left:d.runsLeft!==null?t('automation.show.left',{count:d.runsLeft}):''}),'',d.instructions??''].join('\n');
    writeValue(ctx,{...d,runs:d.runs.map(describeRun)},`${d.name}\n${body}\n`);return 0;
  }
  if(op==='history'){
    assertNoUnknownOptions(args);const runs=await facade.history(id);
    const row=(run:any)=>{
      const reason=run.motivo==='fermata'?null:runReasonWords(run.motivo);/* «stopped (stopped)» says it twice */
      return t('automation.history.row',{at:runTime(run)??'?',outcome:runOutcomeWords(run.esito??run.evento),reason:reason?` (${reason})`:'',summary:run.riassunto?`  ${String(run.riassunto).split('\n')[0]!.slice(0,120)}`:''})+'\n'
        +(run.dettaglio?t('automation.history.detail',{detail:String(run.dettaglio).split('\n')[0]!.slice(0,200)})+'\n':'');
    };
    writeValue(ctx,{id,runs:runs.map(describeRun)},runs.length?runs.map(row).join(''):t('automation.history.none')+'\n');return 0;
  }
  if(op==='enable'||op==='disable'){assertNoUnknownOptions(args);const row=await facade.setEnabled(id,op==='enable');writeValue(ctx,row,t('automation.switched',{name:row.name,state:t(row.active?'automation.row.on':'automation.row.off').trim()})+'\n');return 0;}
  if(op==='delete'){assertNoUnknownOptions(args);writeValue(ctx,await facade.remove(id),t('automation.deleted',{id})+'\n');return 0;}
  throw new Error('Unsupported automation operation: '+op);
}

/*
 * `run <id>` and `serve [--once]`: the kernel's scheduler hosted in this process (see automations/cli-scheduler.ts), by ONE
 * process per profile (automations/host-lease.ts, the 0.6.6 review's F1). While another process hosts, `run` asks it for the run
 * and waits for the end on the store; `serve` waits to take over; `serve --once` says so and leaves.
 */
type HostDeps={assessTrust?:typeof assessProjectTrust;tickMs?:number;lease?:HostLeaseHandle;pollMs?:number;waitMs?:number;answerMs?:number;onceMs?:number;/** stands for Ctrl+C in the tests */signal?:AbortSignal;beatMs?:number};
/** How long `serve --once` waits for the runs its tick started (the 0.6.6 review's F5: the wait itself is bounded). */
export const AUTOMATION_ONCE_MS=30*60_000;
const pause=(ms:number,signal?:AbortSignal)=>new Promise<void>(resolve=>{
  if(signal?.aborted)return resolve();
  const timer=setTimeout(resolve,ms);signal?.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});
});
/*
 * 0.6.7 (first review of 0.6.7, S2): Ctrl+C or SIGTERM asks the host to stop gracefully; a second one ends the process at once.
 * `on`, not `once`: since r4 7784d574e the kernel listens to SIGINT/SIGTERM/SIGHUP outside Windows (`creaPuliziaDeiGruppi`) and
 * leaves the exit to the host only when another listener is still counted. Node removes a `once` listener before calling it, so
 * the kernel saw nobody, re-sent the signal to the process, and the host died before stopping its runs and releasing the lease.
 */
export function listenForStop(proc:Pick<NodeJS.Process,'on'|'off'|'exit'>,stop:AbortController):()=>void{
  /* the second signal's exit code says which one it was, as -p does (128 + SIGINT 2 / SIGTERM 15; second review of 0.6.7) */
  const onInt=()=>{if(stop.signal.aborted)proc.exit(130);else stop.abort();};
  const onTerm=()=>{if(stop.signal.aborted)proc.exit(143);else stop.abort();};
  proc.on('SIGINT',onInt);proc.on('SIGTERM',onTerm);
  return()=>{proc.off('SIGINT',onInt);proc.off('SIGTERM',onTerm);};
}
export async function runAutomationHost(ctx:CommandContext,op:'run'|'serve',args:string[],deps:HostDeps={}){
  const id=op==='run'?need(args.shift(),'AUTOMATION_ID'):null;const once=op==='serve'&&takeFlag(args,'--once');assertNoUnknownOptions(args);
  const facade=createAutomationFacade({projectRoot:ctx.projectRoot,dataRoot:ctx.paths.dataRoot,repoRoot:ctx.repoRoot});
  if(id)await facade.requireRunnable(id);
  const lease=deps.lease??createHostLease({dir:join(ctx.paths.dataRoot,'automation-host'),role:op});
  const stop=new AbortController();const stopListening=listenForStop(process,stop);const onSignal=()=>stop.abort();
  deps.signal?.addEventListener('abort',onSignal,{once:true});if(deps.signal?.aborted)stop.abort();
  try{
    for(;;){
      let told=false;
      for(;;){
        const got=lease.tryAcquire();
        if(got.ok)break;
        if(id){const asked=await askTheHost(ctx,facade,lease,id,got.holder.pid,stop.signal,deps);if(asked!==null)return asked;continue;}
        if(once)throw coded('AUTOMATION_HOST_RUNNING',t('error.code.AUTOMATION_HOST_RUNNING.what'));
        if(!told){ctx.io.writeErr(t('automation.host.waiting',{pid:got.holder.pid})+'\n');told=true;}
        await pause(deps.waitMs??5_000,stop.signal);if(stop.signal.aborted)return 0;
      }
      const code=await hostAutomations(ctx,facade,lease,id,once,stop,deps);
      /* a host that lost the lease (another process took it after a freeze longer than the stale rule) stopped its own runs and
         leaves: hosting again in this process would make a second runtime beside the first (the third review's F3) */
      return code===HOST_LOST?1:code;
    }
  }finally{stopListening();}
}

/** How long past its deadline a request the host already took waits for the answer. */
export const AUTOMATION_ANSWER_GRACE_MS=10_000;
/** Another process hosts: it is asked for the run. null when it left before taking the request (this process then hosts). */
async function askTheHost(ctx:CommandContext,facade:ReturnType<typeof createAutomationFacade>,lease:HostLeaseHandle,id:string,pid:number,signal:AbortSignal,deps:HostDeps):Promise<number|null>{
  const pollMs=deps.pollMs??500;const requestId=lease.send('run',id);const deadline=Date.now()+(deps.answerMs??60_000);
  let started:any=null;
  for(;;){
    started=lease.result(requestId);if(started)break;
    if(signal.aborted&&lease.withdraw(requestId)){writeValue(ctx,{ok:false,id,outcome:'stopped'},t('automation.run.notStarted',{reason:t('automation.reason.fermata')})+'\n');return 1;}
    if(!lease.holder()){if(lease.withdraw(requestId))return null;throw coded('AUTOMATION_HOST_NOT_ANSWERING',t('error.code.AUTOMATION_HOST_NOT_ANSWERING.what'));}
    /* past the deadline the request is withdrawn if it can be, and the wait ends either way (an answer removed while this
       process was frozen would otherwise be polled for forever: the third review's F5) */
    /* the fourth review's N-B: a request the host took just now (it could not be withdrawn) gets a short grace for its answer */
    if(Date.now()>deadline&&(lease.withdraw(requestId)||Date.now()>deadline+AUTOMATION_ANSWER_GRACE_MS))throw coded('AUTOMATION_HOST_NOT_ANSWERING',t('error.code.AUTOMATION_HOST_NOT_ANSWERING.what'));
    /* a Ctrl+C wakes the wait at once, so the request is withdrawn before a second Ctrl+C can end the process (second review of
       0.6.7: a request left in the queue was started by the host later) */
    await pause(pollMs,signal);
  }
  ctx.io.writeErr(t('automation.host.forwarded',{pid,id})+'\n');
  /* the end is waited for on the store; if the host leaves first, its run left with it */
  const hostGone=new AbortController();
  const watch=setInterval(()=>{if(!lease.holder())hostGone.abort();},Math.max(pollMs,2_000));
  try{return await followRun(ctx,facade,id,started,signal,()=>{lease.send('stop',id);},{},hostGone.signal);}
  finally{clearInterval(watch);}
}

/** The run started (here or by the host): says it, stops it on Ctrl+C, waits for its end and reports it. */
async function followRun(ctx:CommandContext,facade:ReturnType<typeof createAutomationFacade>,id:string,started:any,signal:AbortSignal,stopIt:()=>void,origin:Record<string,unknown>,hostGone?:AbortSignal){
  if(!started?.ok){
    /* the code's English words before the kernel's raw message (fifth review); the trust refusal keeps its own sentence, which
       names the folder */
    const words=started?.code&&started.code!=='PROJECT_TRUST_REQUIRED'?runReasonWords(started.code):null;
    /* 0.6.7 (seventh review of 0.6.6, S4): a code with no words of its own (a disk error, say) gets the error view's English
       sentence, not the raw message, which can carry a path; the raw message stays in the JSON (`message`) */
    const trust=started?.code==='PROJECT_TRUST_REQUIRED'&&typeof started?.erroreAvvio==='string'?started.erroreAvvio:null;
    const reason=(words&&words!==t('automation.reason.ignoto')?words:null)??trust
      ??describeError(Object.assign(new Error(String(started?.erroreAvvio??started?.code??'')),{code:started?.code??'AUTOMATION_RUN_NOT_STARTED'})).what.replace(/\.$/u,'');
    writeValue(ctx,{ok:false,id,code:started?.code??null,...(started?.erroreAvvio?{message:started.erroreAvvio}:{}),...origin},t('automation.run.notStarted',{reason})+'\n');return 1;
  }
  ctx.io.writeErr(t('automation.run.started',{id,session:started.sessionId})+'\n');
  if(signal.aborted)stopIt();else signal.addEventListener('abort',stopIt,{once:true});
  await runEnded(await facade.store(),id,started.runId,hostGone);
  const end=(await facade.history(id)).find((run:any)=>run.runId===started.runId&&run.esito!=='partita')??null;
  const outcome=end?runOutcome(end.esito):'failed';const reason=end?runReasonWords(end.motivo):t('automation.reason.interrotta');
  const report=String(end?.riassunto??'').trim()||(outcome==='stopped'?'':reason)||t('automation.run.noReport');
  writeValue(ctx,{ok:outcome==='done',id,runId:started.runId,sessionId:started.sessionId,outcome,reason,summary:end?.riassunto??null,...origin},
    t(outcome==='done'?'automation.run.done':outcome==='stopped'?'automation.run.stopped':'automation.run.failed',{report})+'\n');
  return outcome==='done'?0:1;
}

/** Resolves when no run started here has agents at work (or results waiting for its wake), or when `signal` stops the wait. */
async function agentsDone(host:{agentsWorking:()=>boolean},signal:AbortSignal){while(host.agentsWorking()&&!signal.aborted)await pause(250,signal);}

/** hostAutomations' result when another process took the lease. */
const HOST_LOST=-1;
/** How long a host that leaves waits for the runs it stopped to end. */
export const AUTOMATION_STOP_WAIT_MS=10_000;
/**
 * The review's N3: what this process still runs is stopped before the lease goes — a run left going without a host is reconciled,
 * or started a second time, by the next host.
 */
async function stopWhatRuns(host:Awaited<ReturnType<typeof createCliAutomationScheduler>>){
  const left=await host.running().catch(()=>[] as {id:string;runId:string}[]);
  for(const run of left)await Promise.resolve(host.stopRun(run.id)).catch(()=>{});
  /* 0.6.7 (the reviews of 0.6.6): the scheduler stops a run's own session; the agents it delegated to are separate sessions that
     stop does not reach, and leaving would end them half-way with nobody told — they are stopped too */
  try{host.stopHere();}catch{/* leaving anyway */}
  const deadline=AbortSignal.timeout(AUTOMATION_STOP_WAIT_MS);
  for(const run of left)await host.runEnded(run.id,run.runId,deadline);
}

/** This process holds the lease: the runtime, the scheduler, the beat, the requests of the others; released at the end. */
async function hostAutomations(ctx:CommandContext,facade:ReturnType<typeof createAutomationFacade>,lease:HostLeaseHandle,id:string|null,once:boolean,stop:AbortController,deps:HostDeps):Promise<number>{
  const timers:ReturnType<typeof setInterval>[]=[];const lost=new AbortController();
  let hosted:Awaited<ReturnType<typeof createCliAutomationScheduler>>|null=null;
  let rc:Awaited<ReturnType<CommandContext['createRuntimeContext']>>|null=null;
  try{
    const effective=await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot,cli:{...(ctx.invocation.model?{model:ctx.invocation.model}:{})}});
    const model=ctx.invocation.model??effective.value.model??'openai:gpt-5-mini';
    rc=await ctx.createRuntimeContext({projectRoot:ctx.projectRoot,paths:ctx.paths,repoRoot:ctx.repoRoot,model,environmentKeys:'use'});
    const origin=stateKeyOrigin(ctx.io,ctx.invocation.outputFormat,keyOriginForEntry(rc.runtime,model,{refuseMissing:false}));await rc.registry.ripristina?.();
    const host=await createCliAutomationScheduler({repoRoot:ctx.repoRoot,paths:ctx.paths,registry:rc.registry,store:await facade.store(),...(deps.assessTrust?{assess:deps.assessTrust}:{})});
    hosted=host;
    let busy=false;
    /* the fourth review's N-H: after a freeze the overdue timers fire before the beat: nothing is taken or started unless the lease
       on the disk is still this process's */
    const requests=setInterval(()=>{if(busy||lost.signal.aborted||!lease.owns())return;busy=true;void answerHostRequests(host,lease).catch(()=>{}).finally(()=>{busy=false;});},deps.pollMs??500);
    timers.push(requests);
    timers.push(setInterval(()=>{if(!lost.signal.aborted&&!lease.beat()){ctx.io.writeErr(t('automation.host.lost')+'\n');lost.abort();}},deps.beatMs??HOST_BEAT_MS));
    /* the review's N2: whoever hosts checks the schedules, a `run` too — a `serve` waiting meanwhile cannot, and a run due then
       would be skipped as «no process was running the automations». Not `serve --once`, which checks once (the third review's
       F1), and a `run` only until its own run ends (F2) */
    const ticking=once?null:setInterval(()=>{if(!lost.signal.aborted&&lease.owns())void host.tick().catch(()=>{});},deps.tickMs??AUTOMATION_TICK_MS);
    if(ticking)timers.push(ticking);
    if(id){
      const started=await host.runNow(id);
      if(!started)throw coded('AUTOMATION_NOT_FOUND','AUTOMATION_NOT_FOUND');
      /* a check at once: a run a killed process left open in the store is closed now, not waited on (the third review's F4) —
         only when the person's own run started (the fourth review's N-G: a refused `run` starts nothing else) */
      if(started.ok)await host.tick().catch(()=>{});
      /* a lost lease ends the wait as the host's leaving does for a handed-over run (the fourth review's N-C) */
      /* 0.6.7 (the reviews of 0.6.6): a Ctrl+C whose stop is refused (the run ended just then) says so instead of nothing */
      const stopOwn=()=>{void Promise.resolve(host.stopRun(id)).then((answer:any)=>{if(answer?.ok===false){const words=runReasonWords(answer.code)??String(answer.code);ctx.io.writeErr(t('automation.run.stopRefused',{reason:words.charAt(0).toLowerCase()+words.slice(1)})+'\n');}}).catch(()=>{});};
      const code=await followRun(ctx,facade,id,started,stop.signal,stopOwn,origin,lost.signal);
      if(ticking)clearInterval(ticking);
      if(lost.signal.aborted)return HOST_LOST;
      /* the runs other processes asked for while this one hosted live in this process: they end before it leaves (unless stopped) */
      const waiting=await host.running();
      if(waiting.length&&!stop.signal.aborted)ctx.io.writeErr(t('automation.host.finishing',{count:waiting.length})+'\n');
      for(let others=waiting;others.length&&!stop.signal.aborted&&!lost.signal.aborted;others=await host.running()){
        for(const run of others)await host.runEnded(run.id,run.runId,AbortSignal.any([stop.signal,lost.signal]));
      }
      /* the agents its runs delegated to work on after the runs' own turns: leaving now would end them (as -p, children.ts) */
      await agentsDone(host,AbortSignal.any([stop.signal,lost.signal,AbortSignal.timeout(deps.onceMs??AUTOMATION_ONCE_MS)]));
      return code;
    }
    await host.tick();
    if(once){
      const limit=AbortSignal.any([stop.signal,lost.signal,AbortSignal.timeout(deps.onceMs??AUTOMATION_ONCE_MS)]);
      for(const run of await host.running()){if(limit.aborted)break;await host.runEnded(run.id,run.runId,limit);}
      await agentsDone(host,limit);
      if(lost.signal.aborted)return HOST_LOST;
      writeValue(ctx,{ok:true,once:true,...origin},t('automation.serve.once')+'\n');return 0;
    }
    writeValue(ctx,{ok:true,running:true,...origin},t('automation.serve.active')+'\n');
    const ended=AbortSignal.any([stop.signal,lost.signal]);
    while(!ended.aborted)await pause(2**31-1,ended);
    return lost.signal.aborted?HOST_LOST:0;
  }finally{
    for(const timer of timers)clearInterval(timer);
    /* lost: only the sessions of this process are stopped (the third review's F3), not the store's runs through the scheduler. The
       kernel's scheduler of this process still writes a stopped run's end («stopped»); the store closes only the run it has open
       under that runId, so a run the new host already closed or restarted stays as it is — its history may only get a second end row,
       «stopped», which is what happened here (the fourth review's N-D) */
    if(hosted&&lost.signal.aborted)hosted.stopHere();
    else if(hosted)await stopWhatRuns(hosted).catch(()=>{});
    /* 0.6.7 (ninth review of 0.6.6): the runtime this host built is closed before it leaves, as -p closes its own */
    try{await (rc as any)?.runtime?.close?.();}catch{/* leaving anyway */}
    lease.release();
  }
}
