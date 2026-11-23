import {rememberSessionMode} from '../runtime/session-modes.ts';
import {toolOutputRoot} from '../runtime/output-store.ts';
import {WINDOW_TURNS} from './transcript-model.ts';
import {randomUUID} from 'node:crypto';
import type {CliAttachment} from '../runtime/attachments.ts';
import {CliRuntimeError,type CliKernelQueue,type CliRuntime,type ElicitationResponse,type PlanDecisionKind,type QuestionResponse} from '../runtime/types.ts';
import {buildAgentTree} from '../runtime/agent-tree.ts';
import type {PermissionAction,PermissionMode,RuleSetInput} from '../security/types.ts';
import type {AutoClassifier} from '../security/permission-engine.ts';
import {createPermissionEngine,modeInUntrustedFolder} from '../security/permission-engine.ts';
import {sessionSecretRecheck} from '../headless/run.ts';
import {createDecisionLog,decisionLogFile,type DecisionOutcome} from '../security/decision-log.ts';
import {createApprovalCoordinator,decisionFromChoice,decisionFromSource,type UserApprovalChoice} from './approval.ts';
import type {ToolDecision,ToolFacts} from './tool-facts.ts';
import {createTuiEventAdapter,denialFromEngine,isolationOf,type TuiEvent,type TuiKernelQueueItem} from './event-adapter.ts';
import {createDescendantApprovals,type DescendantOrigin} from './descendant-approvals.ts';
import {simulatePermission} from '../security/permission-explanation.ts';
import {isStoppedWithoutAnswer} from '../i18n/kernel-map.ts';
import {permissionActionFromApproval} from '../security/from-approval.ts';
import {persistPermissionRule} from '../security/persist.ts';
import type {CliPaths} from '../paths.ts';
import {EXECUTION_TEXT} from '../runtime/brokered-executor.ts';import {secretValuesFromEnvironment} from '../diagnostics/redact.ts';import {normalizeSessions} from './overlays/session-picker.ts';
import {explainApproval,type ApprovalExplanationData} from './overlays/approval-dialog.ts';
import {resolveProjectReferences} from './project-references.ts';
import {createQueueStore,type QueueStoreEntry} from './queue-store.ts';
import {createCheckpointStore,type CheckpointHandle} from '../workspace/checkpoint-store.ts';
import {developmentLog,developmentLogError,developmentTextEvidence} from '../diagnostics/development-log.ts';

// `explanation`, `alwaysSimulation` and `explanationError` (B1 slice 13) are the per-segment account
// and the simulation of "allow always", computed once from the same rules the engine decided with.
/*
 * B1 slice 18 — a send asks before anything leaves the machine. `readiness` answers whether a provider has
 * been chosen, whether the model belongs to it and whether its key is usable; when it is not, the send throws
 * a coded error that names the provider and neither `start` nor `resume` is called.
 */
export type TuiSendReadiness={ready:true}|{ready:false;code:string;provider:string|null;message:string};
export class TuiNotReadyError extends Error{code:string;provider:string|null;constructor(code:string,provider:string|null,message:string){super(message);this.name='TuiNotReadyError';this.code=code;this.provider=provider;}}

/* P13 (owner decision 8): `origin` is set when a sub-agent asks, so the dialog says who asks. */
/* Stage 3 (owner 01-02/10): the model's open question, as the screen shows it (question-card.ts) and answers it. */
/* Stage 6b (owner 02/10): a sub-agent's question to the person, kept apart from the main session's (it never opens the card
   by itself); `task` names the agent that asks. */
export type PendingAgentQuestion={requestId:string;sessionId:string;task:string|null;questions:Extract<TuiEvent,{type:'question.required'}>['questions']};
/* `asker`: set when a sub-agent's question was moved into the card (stage 6b), the agent's task, so the card says who asks. */
export type PendingTuiQuestion={asker?:string;requestId:string;sessionId:string;questions:Extract<TuiEvent,{type:'question.required'}>['questions'];toolCallId?:string;origin?:{mode?:string;agent?:string}};
/* Stage 3 (owner 02/10): the model's proposed plan, as the plan card shows it; the choice is bound to its hash. */
/* Stage 3 (owner 02/10): an MCP server's request to the person (elicit-card.ts). */
export type PendingTuiElicitation={requestId:string;sessionId:string;server:string;mode:'form'|'url';message:string;requestedSchema?:Record<string,unknown>;url?:string;domain?:string};
export type PendingTuiPlan={requestId:string;sessionId:string;hash:string;content:string;revision?:number;toolCallId?:string};
export type PendingTuiApproval={requestId:string;sessionId:string;action:PermissionAction;rawPayload:Record<string,unknown>;reason:string;rule?:string;runtimeHint?:string;origin?:{kind:'agent';task:string|null}}&ApprovalExplanationData;
/* R5a S5 (owner decision Q-R5-8): `slash` is a command that changes the session (/model, /compact, /resume…) typed during a
   turn; it waits in the same ordered queue as prompts and `!` commands, is never written to the queue store (a screen
   command is not work to recover after a restart) and runs through `onQueuedSlash` when its turn in the queue comes. */
export type TuiQueuedAction={kind:'prompt'|'command'|'slash';text:string;attachments?:CliAttachment[];attachIfTooLarge?:true};
/* F-Q1 (owner 03/10): the kernel's queue of the current session, as the screen shows it (gray, inline). */
export type TuiKernelQueue={items:readonly TuiKernelQueueItem[];paused:boolean};
export type TuiQueueEntry={id:string;kind:'prompt'|'command'|'slash';text:string;status:'pending'|'uncertain';attachments?:CliAttachment[]};
type ControllerQueueEntry=Omit<QueueStoreEntry,'kind'>&{kind:QueueStoreEntry['kind']|'slash'};
const storedEntry=(entry:ControllerQueueEntry):entry is QueueStoreEntry=>entry.kind!=='slash';
export type TuiSendOutcome={sessionId:string|null;kind:'prompt'|'command'|'none';queued:boolean;position:number;inKernel?:boolean};
export type TuiSteerState=
 | {status:'requested';redirectId:string}
 | {status:'applied';redirectId:string}
 | {status:'cancelled';redirectId:string}
 | {status:'failed';redirectId:string;code:string;message:string}
 | {status:'rejected';code:string;message:string};
export type TuiSteerOutcome={status:'requested';redirectId:string}|{status:'rejected';code:string;message:string};

export function createTuiSessionController({askEverything=false,runtime,projectRoot,model,mode,rules,paths,autoClassifier,readiness,onEvent,onApproval,onQuestion,onAgentQuestions,onPlan,onPlanApproved,onKernelMode,onKernelSettings,onElicitation,onError=()=>{},onQueueChange,onQueueRestored,onQueuedDispatch,onQueuedSlash,onSteerState,onKernelQueue,onComposerRestore}:{/** Form B, No (a) */askEverything?:boolean;runtime:CliRuntime;projectRoot:string;model:string;mode:PermissionMode;rules:RuleSetInput;paths?:CliPaths;autoClassifier?:AutoClassifier;readiness?:(model:string)=>Promise<TuiSendReadiness>;onEvent:(e:TuiEvent)=>void;onApproval?:(p:PendingTuiApproval|null)=>void;onQuestion?:(q:PendingTuiQuestion|null)=>void;onAgentQuestions?:(list:readonly PendingAgentQuestion[])=>void;onPlan?:(p:PendingTuiPlan|null)=>void;onPlanApproved?:(x:{mode:PermissionMode;newSessionId?:string})=>void;onKernelMode?:(x:{mode:PermissionMode;reason?:string})=>void;
  /** owner 27/10/2026: the session's settings changed in the kernel (here or from a paired device): model and reasoning for the status row */
  onKernelSettings?:(x:{model:string|null;reasoningEffort:string|null;origin:{kind:'computer'}|{kind:'model'}|{kind:'device';deviceId:string};reason:string})=>void;onElicitation?:(e:PendingTuiElicitation|null)=>void;onError?:(e:unknown)=>void;onQueueChange?:(queue:readonly TuiQueuedAction[])=>void;onQueueRestored?:(queue:readonly TuiQueueEntry[])=>void;onQueuedDispatch?:(action:TuiQueuedAction)=>void;onQueuedSlash?:(text:string)=>Promise<void>|void;onSteerState?:(state:TuiSteerState)=>void;onKernelQueue?:(queue:TuiKernelQueue)=>void;onComposerRestore?:(text:string)=>void}){
  /* decision 173: in a folder the person said No to, Full access is held as Normal, from the start and when it is chosen */
  /* R2-F1 (cure 208 bis): the folder is untrusted after the person's No, or when its trust was taken away while TALOS was open (the
     runtime reads the trust store again before every person's send, folder-trust.ts) */
  const untrustedNow=()=>askEverything||runtime.folderTrust?.()===false;
  let currentMode=modeInUntrustedFolder(mode,untrustedNow());
  let modeChange:Promise<void>|null=null;
  /* Owner 08/10/2026 («cambino istantaneamente … anche se vengono applicati dal turno dopo, come fa Claude Code»): the
     session whose kernel took the permission at once and left its operating mode for the turn's end (session-facade.ts) */
  let operatingModePending:string|null=null;
  type HeldMode={mode:PermissionMode;level:string;reason:string};
  type ModeFlight={sessionId:string;held:HeldMode|null};
  /* this window's own mode request in flight: the mode snapshots that come meanwhile wait for its answer */
  let modeFlight:ModeFlight|null=null;
  function setMode(next:PermissionMode):Promise<void>{
    next=modeInUntrustedFolder(next,untrustedNow());
    if(!current&&!modeChange){currentMode=next;return Promise.resolve();}
    const sessionId=current,previous=modeChange;
    const task=(async()=>{
      if(previous)await previous.catch(()=>{});
      if(current!==sessionId||closed)throw new CliRuntimeError('SESSION_SETTINGS_FAILED');
      /* Desktop review block 11 E-R1 (contract §F.3 point 5): the answer to this request does not win by itself over a newer
         snapshot that came while it was in flight. Such a snapshot is HELD (heldSnapshot) and weighed here: the newest one that
         carries a mode is this request's own echo when its level is this mode's (Full access echoes "On request"; plan asked
         during a turn echoes no mode at all, the kernel keeps it for the turn's end), and the kernel's newer word otherwise. */
      const flight:ModeFlight={sessionId:sessionId??'',held:null};
      if(sessionId)modeFlight=flight;
      let answered=false;
      try{
        const result=sessionId?await runtime.setPermissionMode(sessionId,next):undefined;
        if(current!==sessionId||closed)throw new CliRuntimeError('SESSION_SETTINGS_FAILED');
        answered=true;
        if(!flight.held||flight.held.level===cliLevel(next))currentMode=next;
        else applyKernelMode(flight.held);
        operatingModePending=result&&result.operatingModeDeferred===true?sessionId:null;
      }finally{
        if(modeFlight===flight)modeFlight=null;
        /* a request that failed leaves the kernel's own word, if it said one, in the conversation it was said for (review A2) */
        if(!answered&&flight.held&&!closed&&current===flight.sessionId)applyKernelMode(flight.held);
      }
    })();
    modeChange=task;
    const settled=()=>{if(modeChange===task)modeChange=null;};
    void task.then(settled,settled);
    return task;
  }
  let currentModel=model;
  const engine=createPermissionEngine({askEverything:untrustedNow,/* riga 224: the yeses of the conversation open now */conversation:()=>current,projectRoot,...(paths?.dataRoot?{toolOutputRoot:toolOutputRoot(paths.dataRoot)}:{}),rules,mode,...(autoClassifier?{classifier:autoClassifier}:{}),secretRecheck:sessionSecretRecheck(projectRoot),...(paths?{persistRule:async(effect,action)=>persistPermissionRule({paths,projectRoot,effect,action})}:{})});
  /* R5a wiring (Q-R5-17, gate finding 15): the adapter learns who refused a tool BEFORE the kernel hears the "no" — the engine
     alone (a deny rule, the policy, the mode: `denialFromEngine`) or the person (`resolveApproval`) — so the row never words
     a refusal nobody asked for as the person's. */
  const denialTargets=new Map<string,{toolCallId:string;action:PermissionAction}>();
  /* stage 7.21 (owner 03/10): the last 50 decisions of this project, for /permissions «Recent» */
  const decisionLog=typeof paths?.projectOverridesRoot==='string'?createDecisionLog(decisionLogFile(paths,projectRoot)):null;
  const OUTCOME:Record<string,DecisionOutcome>={'allow-once':'allowed-once','allow-session':'allowed-session','allow-always':'allowed-always','deny-once':'denied','deny-always':'denied-always',blocked:'blocked'};
  const coordinator=createApprovalCoordinator({engine,answer:(sid,rid,approved,motive)=>motive?runtime.answerApproval(sid,rid,approved,motive):runtime.answerApproval(sid,rid,approved),interactive:true,mode:()=>currentMode,
    onDecided:({action,choice,code})=>{void decisionLog?.append({at:new Date().toISOString(),action,outcome:OUTCOME[choice]!,...(code?{code}:{})}).catch(error=>developmentLogError('decisions.write',error,{sessionId:current},'tui-controller'));},
    beforeDeny:(rid,decision)=>{const target=denialTargets.get(rid);if(target)adapter.noteDenial(target.toolCallId,denialFromEngine(decision,{rule:()=>simulatePermission({rules,action:target.action,projectRoot}).explanation.rule??null}));}});
  const adapter=createTuiEventAdapter(secretValuesFromEnvironment(process.env));
  /* P13: the approvals the current run's sub-agents ask for (descendant-approvals.ts), watched while that run is open. */
  const descendants=createDescendantApprovals({runtime,secretValues:secretValuesFromEnvironment(process.env),
    onRequired:(origin,event)=>requestApproval(origin.sessionId,event,origin),
    onResolved:(_origin,requestId)=>approvalResolved(requestId),
    /* Stage 6b: a descendant's question waits in its own list (the panel's «needs you») until answered or resolved elsewhere. */
    onQuestion:(origin,event)=>agentQuestionAsked(origin,event),
    onQuestionResolved:(_origin,requestId)=>{agentQuestionGone(requestId);if(openQuestions.some(q=>q.requestId===requestId))questionClosed(requestId);},
    onError:error=>developmentLogError('descendants.failure',error,{sessionId:current},'tui-controller')});
  let unsubscribe=()=>{};
  let closed=false;
  let current:string|null=null;
  /*
   * ⭐⭐⭐ DECISIONE OWNER 16/09/2026 — UN COMANDO DIGITATO MENTRE UN GIRO E' IN CORSO SI ACCODA.
   *
   * Misurato sui due concorrenti: Claude Code accoda SEMPRE mentre un turno e' attivo, Hermes
   * esegue subito e lo documenta come regola. Sono opposti, quindi nessuna posizione di parita'
   * esisteva e l'owner ha scelto la prima.
   * ⇒ Conseguenza che TOGLIE lavoro: non serve nessun lucchetto sull'albero di lavoro, e un'intera
   *   classe di difetti da scrittura concorrente non puo' verificarsi per costruzione.
   */
  const queuedEntries:ControllerQueueEntry[]=[];
  const queueStore=paths?.queueRoot?createQueueStore({rootDir:paths.queueRoot}):null;
  let queuePausedState=false,drainingQueue=false,boundaryWhileDraining=false,queueEpoch=0;
  let kernelQueue:TuiKernelQueue={items:[],paused:false};
  function screenQueue(queue:CliKernelQueue):TuiKernelQueue{return{items:queue.items.map(item=>item.origin==='person'?{id:item.id,origin:item.origin,text:item.text,...(item.images?{images:item.images}:{})}:{id:item.id,origin:item.origin,...(item.childId?{childId:item.childId}:{})}),paused:queue.paused};}
  function setKernelQueue(next:TuiKernelQueue){kernelQueue={items:next.items.map(item=>({...item})),paused:next.paused&&next.items.length>0};onKernelQueue?.(kernelQueue);}
  let queueHydration:Promise<void>=Promise.resolve();
  let pendingSteer:{redirectId:string;text:string}|null=null;
  let steerInvocation:{text:string}|null=null;
  let cancelling=false;
  const checkpointStore=paths?.checkpointsRoot?createCheckpointStore({rootDir:paths.checkpointsRoot,projectRoot}):null;
  const shellAwaitingStart:CheckpointHandle[]=[];
  const shellByCommandId=new Map<string,CheckpointHandle>();
  const shellCommandForCheckpoint=new Map<CheckpointHandle,string>();
  /* R0 (2026-09-23): "this checkpoint received its ComandoUtenteIniziato". Unlike the map above it is NOT cleared by
     ComandoUtenteFinito, so a command that finishes before `runtime.shell` returns is not misread as never correlated
     (which raised CHECKPOINT_SHELL_CORRELATION_FAILED and blocked every later mutation). */
  const shellCorrelated=new WeakSet<CheckpointHandle>();
  /* D1 (stress test 03/10, owner «Mai bloccare»): a checkpoint failure is said, never kept as a block on every later command,
     and the queue is not paused for it; /undo simply does not cover that command. */
  function checkpointFailure(code:string,error:unknown){
    const message=error instanceof Error?error.message:String(error);
    const blocked=Object.assign(new Error(`${code}: ${message}`),{code,cause:error});
    developmentLogError('checkpoint.failure',blocked,{code},'tui-controller');if(!closed)onError(blocked);return blocked;
  }
  async function runModelMutation(operation:'start'|'resume'|'fork',sessionId:string|null,invoke:()=>Promise<string>){
    if(modeChange)await modeChange;
    /* owner 09/10/2026 (the shell's network follows the mode): the session this turn runs in has the mode on screen */
    if(sessionId)rememberSessionMode(sessionId,currentMode);
    const invokeStarted=performance.now();developmentLog('runtime.invoke.begin',{operation,sessionId},'debug','tui-controller');
    try{const id=await invoke();rememberSessionMode(id,currentMode);developmentLog('runtime.invoke.accepted',{operation,sessionId:id,durationMs:performance.now()-invokeStarted},'info','tui-controller');return id;}
    catch(error){developmentLogError('runtime.invoke.failure',error,{operation,sessionId,durationMs:performance.now()-invokeStarted},'tui-controller');throw error;}
  }
  async function runShellMutation(sessionId:string,command:string){
    if(modeChange)await modeChange;
    if(!checkpointStore){await runtime.shell(sessionId,command);return;}
    let checkpoint:CheckpointHandle;
    try{checkpoint=await checkpointStore.begin({operation:'shell',sessionId});}
    catch(error){checkpointFailure('CHECKPOINT_BEGIN_FAILED',error);await runtime.shell(sessionId,command);return;}
    shellAwaitingStart.push(checkpoint);
    try{
      await runtime.shell(sessionId,command);
      if(!shellCorrelated.has(checkpoint)){
        const index=shellAwaitingStart.indexOf(checkpoint);if(index>=0)shellAwaitingStart.splice(index,1);
        throw checkpointFailure('CHECKPOINT_SHELL_CORRELATION_FAILED',new Error('Direct shell returned without its synchronous ComandoUtenteIniziato correlation event.'));
      }
    }
    catch(error){
      if(!shellCorrelated.has(checkpoint)){
        const index=shellAwaitingStart.indexOf(checkpoint);if(index>=0)shellAwaitingStart.splice(index,1);
        try{await checkpoint.finalize();}catch(finalization){checkpointFailure('CHECKPOINT_FINALIZE_FAILED',finalization);}
      }
      throw error;
    }
  }
  function processRawEvent(id:string,raw:unknown,allowDrain=true){
    /* A1 rimedio 3 (owner 07/10, rischio compat accettato): durante il replay la coppia raw_event+runtime_event per
       OGNI evento rigenerato è il cuore dell'A1 (~9.600 righe per resume, 3 syscall ciascuna). Dentro la finestra di
       replay gli eventi si CONTANO; a fine replay `attach` scrive UN SOLO `runtime.replay.summary`. Il percorso live
       resta integralmente loggato. */
    if(closed)return;if(replayingHistory)replayCount+=1;else developmentLog('runtime.raw_event',{sessionId:id,raw},'debug','tui-controller');
    handleRawSteerEvent(raw);
    const events=adapter.translateAll(raw);
    const person=personCommandEvents(raw,events[0]??null);
    if(!events.length){for(const extra of person)onEvent(extra);return;}
    for(const [index,translated] of events.entries()){processEvent(id,translated,allowDrain);if(index===0)for(const extra of person)onEvent(extra);}
  }
  function processEvent(id:string,translated:TuiEvent,allowDrain:boolean){
    let event=personStopVerdict(id,translated);
    if(event.type==='run.started'){openRun=event.runId?{runId:event.runId}:{};if(!replayingHistory)turnEnded=false;if(replayingHistory)event={...event,history:true};else descendants.start(id);}
    /* ASYNC (owner 01/10): the run's end lets go of the descendants only once none is alive (`release`); a delegated agent
       announced by the kernel (`agent.changed`) is watched even when no run is open. */
    else if(event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled'){openRun=null;runEpoch++;descendants.release();if(!replayingHistory){questionsOf(id,[]);plansOf(id);elicitationsOf(id);}
      /* the turn is over: the operating mode the kernel left for its end goes now (an error is said, the mode stays) */
      if(!replayingHistory&&operatingModePending===id&&id===current){operatingModePending=null;void setMode(currentMode).catch(onError);}}
    else if(event.type==='queue.changed'&&id===current)setKernelQueue({items:event.items,paused:event.paused});
    else if(event.type==='agent.changed'&&!replayingHistory){descendants.start(id);if(!openRun)descendants.release();else void descendants.sync();}
    onEvent(event);
    bypassWhy(event);
    if((event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled')&&interruptTerminalSession===id){const resolve=interruptTerminalResolve;interruptTerminalResolve=null;resolve?.();}
    if(event.type==='approval.required'){
      if(replayingHistory)replayedApprovals.set(event.requestId,event);
      else requestApproval(id,event);
    }else if(event.type==='approval.resolved')approvalResolved(event.requestId);
    else if(event.type==='question.required'){if(replayingHistory)replayedQuestions.set(event.requestId,event);else questionAsked(id,event);}
    else if(event.type==='question.resolved')questionClosed(event.requestId);
    else if(event.type==='elicitation.required'){if(replayingHistory)replayedElicitations.set(event.requestId,event);else elicitationAsked(id,event);}
    else if(event.type==='elicitation.resolved')elicitationClosed(event.requestId);
    else if(event.type==='plan.required'){if(replayingHistory)replayedPlans.set(event.requestId,event);else planProposed(id,event);}
    else if(event.type==='plan.resolved'){planClosed(event.requestId);if(!replayingHistory)planDecided(event);}
    /* owner 27/10/2026 (Desktop f573cdc93): a settings snapshot older than one already seen for this session is dropped (a replay,
       two changes crossing); during a replay only its version is remembered, the restored session already has its settings */
    else if((event.type==='session.settings.changed'||(event.type==='session.mode.changed'&&event.version!==undefined))&&!newerSettings(id,event.version!))return;
    else if(event.type==='session.settings.changed'&&!replayingHistory){
      if(event.mode&&KERNEL_MODES.has(event.mode)){
        const said:HeldMode={mode:event.mode as PermissionMode,level:snapshotLevel(event.mode),reason:event.reason};
        if(modeFlight&&modeFlight.sessionId===id)modeFlight.held=said;else applyKernelMode(said);
      }
      if(event.model&&id===current)currentModel=event.model;
      onKernelSettings?.({model:event.model,reasoningEffort:event.reasoningEffort,origin:event.origin,reason:event.reason});
    }
    else if(event.type==='session.mode.changed'&&!replayingHistory&&KERNEL_MODES.has(event.mode)){currentMode=event.mode as PermissionMode;
      /* review A5: said at once, and held too, so the answer to a request in flight does not put the old level back */
      if(modeFlight&&modeFlight.sessionId===id)modeFlight.held={mode:currentMode,level:snapshotLevel(event.mode),reason:event.reason??''};
      onKernelMode?.({mode:currentMode,...(event.reason?{reason:event.reason}:{})});}
    else if(allowDrain&&(event.type==='run.completed'||event.type==='run.failed')&&!pendingSteer&&!cancelling){turnEnded=true;requestQueuedDrain(id);}
  }
  /*
   * R3 gate E12, owner decision Q-R3-15. The engine answers asynchronously, and a replay is synchronous: a replayed
   * approval used to open its dialog AFTER the replayed answer had closed it (a stale dialog for a run long over). A
   * replayed request is only remembered; once the replay is over it is asked only if its run is still waiting in the
   * kernel (settleReplayedRun). A live request answered, or whose run ended, before the engine replied never opens.
   */
  let runEpoch=0;
  /* owner 27/10/2026: the newest settings version seen per session (the kernel's `versione` only grows) */
  const settingsVersions=new Map<string,number>();
  function newerSettings(sessionId:string,version:number){
    const seen=settingsVersions.get(sessionId);if(seen!==undefined&&version<=seen)return false;
    settingsVersions.set(sessionId,version);return true;
  }
  /* F-P-001: the kernel knows only a LEVEL — plan, "On request" (the CLI's default, acceptEdits and Full access alike: the CLI's
     engine applies the mode) or the "Workspace write" the CLI never sends. A snapshot changes the CLI's mode only when its level
     differs from the mode's own: a device that changes the model does not take the PC out of Full access (CLI block 11 r4). */
  const cliLevel=(mode:PermissionMode)=>mode==='plan'?'plan':'ask';
  const snapshotLevel=(mode:string)=>mode==='plan'?'plan':mode==='acceptEdits'?'write':'ask';
  function applyKernelMode(said:HeldMode){
    if(said.level===cliLevel(currentMode))return;
    currentMode=said.mode;onKernelMode?.({mode:currentMode,reason:said.reason});
  }
  /* the last turn ended and asked for the queue to go out, and no turn has started since (send() reads it after its awaits) */
  let turnEnded=false;
  /*
   * Q-R3-13 (owner, R3 follow-up): `Full access` is the why of every row that RAN in bypass mode, the tools the kernel ran
   * without asking included. The mode is taken when the tool starts (live only: a replay does not know the old mode); at
   * its result, a tool with no why yet that was not refused gets `full-access`. A row the person answered, and the
   * person's own `!` command, keep their why; a why is sent once per tool.
   */
  const decidedTools=new Set<string>();
  const toolModes=new Map<string,PermissionMode>();
  const groupCards=new Map<string,{ids:string[];count:number}>(),coveredByAll=new Map<string,number>();/* row 126 round 2: a group card's listed calls; the calls «Allow all» covered get their why when they end, only if no card of their own decided them and they were not refused (as Full access) */
  function emitDecision(toolCallId:string,decision:ToolDecision){
    if(decision.kind==='full-access'&&decidedTools.has(toolCallId))return;
    decidedTools.add(toolCallId);onEvent({type:'tool.decision',toolCallId,decision});
  }
  function bypassWhy(event:TuiEvent){
    if(event.type==='tool.started'){if(!replayingHistory)toolModes.set(event.toolCallId,currentMode);return;}
    if(event.type==='tool.completed'){
      const mode=toolModes.get(event.toolCallId);toolModes.delete(event.toolCallId);const all=coveredByAll.get(event.toolCallId);coveredByAll.delete(event.toolCallId);
      if((all||mode==='bypassPermissions')&&!decidedTools.has(event.toolCallId)&&event.outcome?.allowed!==false)emitDecision(event.toolCallId,all?{kind:'all',count:all}:{kind:'full-access'});
      return;
    }
    if(event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled'){decidedTools.clear();toolModes.clear();coveredByAll.clear();groupCards.clear();}
  }
  const replayedApprovals=new Map<string,Extract<TuiEvent,{type:'approval.required'}>>();
  /*
   * Stage 3 (owner 01-02/10; Codex request queue, our Q-R3-15). The open questions in arrival order: the screen shows the
   * first, the next after it closes — answered here, elsewhere, or by the end of its run. A replayed question is only
   * remembered and asked when the replay is over if its run still waits (settleReplayedRun); one already closed never opens.
   */
  let openQuestions:PendingTuiQuestion[]=[];
  let agentQuestions:PendingAgentQuestion[]=[];
  function agentQuestionAsked(origin:{sessionId:string;task:string|null},event:Extract<TuiEvent,{type:'question.required'}>){
    if(closedQuestions.has(event.requestId)||agentQuestions.some(q=>q.requestId===event.requestId))return;
    agentQuestions=[...agentQuestions,{requestId:event.requestId,sessionId:origin.sessionId,task:origin.task,questions:event.questions}];onAgentQuestions?.(agentQuestions);
  }
  function agentQuestionGone(requestId:string){
    if(!agentQuestions.some(q=>q.requestId===requestId))return;
    agentQuestions=agentQuestions.filter(q=>q.requestId!==requestId);onAgentQuestions?.(agentQuestions);
  }
  const replayedQuestions=new Map<string,Extract<TuiEvent,{type:'question.required'}>>();
  const closedQuestions=new Set<string>();
  function showQuestion(before:PendingTuiQuestion|null){const now=openQuestions[0]??null;if(now!==before)onQuestion?.(now);}
  function questionsOf(sessionId:string|null,keep:PendingTuiQuestion[]){const before=openQuestions[0]??null;openQuestions=[...openQuestions.filter(q=>q.sessionId!==sessionId),...keep];showQuestion(before);}
  function questionAsked(id:string,event:Extract<TuiEvent,{type:'question.required'}>){
    if(closedQuestions.has(event.requestId)||openQuestions.some(q=>q.requestId===event.requestId))return;
    const before=openQuestions[0]??null;
    openQuestions=[...openQuestions,{requestId:event.requestId,sessionId:id,questions:event.questions,...(event.toolCallId?{toolCallId:event.toolCallId}:{}),...(event.origin?{origin:event.origin}:{})}];
    showQuestion(before);
  }
  /* Stage 3, MCP elicitation: the same rules as questions and plans. */
  let openElicitations:PendingTuiElicitation[]=[];
  const replayedElicitations=new Map<string,Extract<TuiEvent,{type:'elicitation.required'}>>();
  const closedElicitations=new Set<string>();
  function showElicitation(before:PendingTuiElicitation|null){const now=openElicitations[0]??null;if(now!==before)onElicitation?.(now);}
  function elicitationsOf(sessionId:string|null){const before=openElicitations[0]??null;openElicitations=sessionId===null?[]:openElicitations.filter(e=>e.sessionId!==sessionId);showElicitation(before);}
  function elicitationAsked(id:string,event:Extract<TuiEvent,{type:'elicitation.required'}>){
    if(closedElicitations.has(event.requestId)||openElicitations.some(e=>e.requestId===event.requestId))return;
    const before=openElicitations[0]??null;
    openElicitations=[...openElicitations,{requestId:event.requestId,sessionId:id,server:event.server,mode:event.mode,message:event.message,
      ...(event.requestedSchema?{requestedSchema:event.requestedSchema}:{}),...(event.url?{url:event.url}:{}),...(event.domain?{domain:event.domain}:{})}];
    showElicitation(before);
  }
  function elicitationClosed(requestId:string){
    replayedElicitations.delete(requestId);
    closedElicitations.add(requestId);if(closedElicitations.size>256)closedElicitations.delete(closedElicitations.values().next().value!);
    const before=openElicitations[0]??null;openElicitations=openElicitations.filter(e=>e.requestId!==requestId);showElicitation(before);
  }
  /* Stage 3, the plan card: the same rules as the questions — one shown, closed from anywhere, replay only while its run waits. */
  let openPlans:PendingTuiPlan[]=[];
  const replayedPlans=new Map<string,Extract<TuiEvent,{type:'plan.required'}>>();
  const closedPlans=new Set<string>();
  function showPlan(before:PendingTuiPlan|null){const now=openPlans[0]??null;if(now!==before)onPlan?.(now);}
  function plansOf(sessionId:string|null){const before=openPlans[0]??null;openPlans=sessionId===null?[]:openPlans.filter(p=>p.sessionId!==sessionId);showPlan(before);}
  function planProposed(id:string,event:Extract<TuiEvent,{type:'plan.required'}>){
    if(closedPlans.has(event.requestId)||openPlans.some(p=>p.requestId===event.requestId))return;
    const before=openPlans[0]??null;
    openPlans=[...openPlans,{requestId:event.requestId,sessionId:id,hash:event.hash,content:event.content,...(event.revision!==undefined?{revision:event.revision}:{}),...(event.toolCallId?{toolCallId:event.toolCallId}:{})}];
    showPlan(before);
  }
  /*
   * Stage 3, after an approval (registro 12, pezzo 13b): the kernel has already left plan mode and set the permission
   * (plan-contract.mjs PERMESSI_DOPO_IL_PIANO); the screen FOLLOWS it, never rewrites it (Gemini CLI #20650: a screen mode
   * that differs from the model's confuses it). A clean conversation names the new session the kernel started from the plan.
   * Live only: an approval replayed from history changes nothing now.
   */
  /* Stage 3, pezzo 13c: the modes the kernel can set by itself, followed as it says them (one source: the kernel). */
  const KERNEL_MODES=new Set<string>(['plan','default','acceptEdits']);
  const MODE_AFTER_PLAN:Record<string,PermissionMode>={'ask-before-edits':'default','accept-edits':'acceptEdits','clean-conversation':'acceptEdits'};
  function planDecided(event:Extract<TuiEvent,{type:'plan.resolved'}>){
    /* only an approval names a mode (keep-planning is not in the table) */const mode=event.decision?MODE_AFTER_PLAN[event.decision]:undefined;
    if(!mode)return;
    currentMode=mode;
    onPlanApproved?.({mode,...(event.newSessionId?{newSessionId:event.newSessionId}:{})});
  }
  function planClosed(requestId:string){
    replayedPlans.delete(requestId);
    closedPlans.add(requestId);if(closedPlans.size>256)closedPlans.delete(closedPlans.values().next().value!);
    const before=openPlans[0]??null;openPlans=openPlans.filter(p=>p.requestId!==requestId);showPlan(before);
  }
  function questionClosed(requestId:string){
    replayedQuestions.delete(requestId);
    closedQuestions.add(requestId);if(closedQuestions.size>256)closedQuestions.delete(closedQuestions.values().next().value!);
    const before=openQuestions[0]??null;openQuestions=openQuestions.filter(q=>q.requestId!==requestId);showQuestion(before);
    agentQuestionGone(requestId);
  }
  const answeredApprovals=new Set<string>();
  const approvalTools=new Map<string,string>();
  function approvalResolved(requestId:string){
    replayedApprovals.delete(requestId);approvalTools.delete(requestId);
    answeredApprovals.add(requestId);if(answeredApprovals.size>256)answeredApprovals.delete(answeredApprovals.values().next().value!);
    onApproval?.(null);
  }
  function requestApproval(id:string,event:Extract<TuiEvent,{type:'approval.required'}>,origin?:DescendantOrigin){
    const action=permissionActionFromApproval(event.payload);const epoch=runEpoch;answeredApprovals.delete(event.requestId);
    if(event.toolCallId)denialTargets.set(event.requestId,{toolCallId:event.toolCallId,action});
    /* A5h: a card with an origin is a descendant's (a child or a delegate): the engine may lift the chain's mark in acceptEdits or Full access */
    void coordinator.request(id,event.requestId,action,origin?{child:true}:undefined).finally(()=>denialTargets.delete(event.requestId)).then(result=>{
      if(result.pending){
        if(answeredApprovals.has(event.requestId)||epoch!==runEpoch||(origin?!descendants.watching().includes(id):current!==id))return;
        if(event.toolCallId){approvalTools.set(event.requestId,event.toolCallId);coveredByAll.delete(event.toolCallId);/* its own card decides it */}
        const listed=(event.payload.gruppo as {chiamate?:Array<{toolCallId?:unknown}>}|undefined)?.chiamate;if(result.action.sameCalls&&Array.isArray(listed))groupCards.set(event.requestId,{ids:listed.map(call=>String(call?.toolCallId)),count:result.action.sameCalls});
        const runtimeHint=event.payload.trifecta===true?'trifecta':undefined;onApproval?.({requestId:event.requestId,sessionId:id,...(origin?{origin:{kind:'agent' as const,task:origin.task}}:{}),action:result.action,rawPayload:event.payload,reason:result.reason,...(result.rule?{rule:result.rule}:{}),...(runtimeHint?{runtimeHint}:{}),...explainApproval({rules,action:result.action,projectRoot,persists:Boolean(paths)})});
      }else{
        /* R3 gate E4 (Q-R3-3): why the engine let it run, on the tool's row. */
        const decision=result.allowed?decisionFromSource(result.source):null;
        if(decision&&event.toolCallId)emitDecision(event.toolCallId,decision);
        onApproval?.(null);
      }
    }).catch(onError);
  }
  /*
   * R3 gate E4 (Q-R3-1/3). The person's `!` command: the kernel announces it as `ComandoUtenteIniziato{comandoId}`
   * immediately followed by its `ToolCallStart{shell}` (agent-service.mjs:2124-2125) and ends it with
   * `ComandoUtenteFinito{comandoId,codice,enforcement}` (:2168); the v2 bridge drops both. That tool call's row is the
   * person's (`typed by you`), with the exit code and isolation of the finish event. Its duration is measured here, live
   * only: a replay delivers every event at once, and a duration measured on the observer of a replay is not a duration
   * (agui-events.mjs OSS-1), so a replayed command states none.
   */
  let personCommandNext:string|null=null;
  const personCommands=new Map<string,{toolCallId:string;startedAt:number|null}>();
  function personCommandEvents(raw:unknown,event:TuiEvent|null):TuiEvent[]{
    const row=raw&&typeof raw==='object'?raw as Record<string,unknown>:null;
    const announced=personCommandNext;personCommandNext=null;
    if(row?.type==='ComandoUtenteIniziato'){personCommandNext=typeof row.comandoId==='string'&&row.comandoId?row.comandoId:null;return[];}
    if(announced&&event?.type==='tool.started'&&event.toolName==='shell'){
      personCommands.set(announced,{toolCallId:event.toolCallId,startedAt:replayingHistory?null:performance.now()});
      decidedTools.add(event.toolCallId);
      return[{type:'tool.origin',toolCallId:event.toolCallId,origin:'person'},{type:'tool.decision',toolCallId:event.toolCallId,decision:{kind:'typed'}}];
    }
    if(row?.type==='ComandoUtenteFinito'&&typeof row.comandoId==='string'){
      const command=personCommands.get(row.comandoId);if(!command)return[];personCommands.delete(row.comandoId);
      const isolation=isolationOf(row.enforcement);
      const facts:ToolFacts={
        ...(typeof row.codice==='number'&&Number.isInteger(row.codice)?{exitCode:row.codice}:{}),
        ...(command.startedAt!==null&&!replayingHistory?{durationMs:Math.max(0,Math.round(performance.now()-command.startedAt))}:{}),
        ...(isolation?{isolation}:{}),
      };
      return Object.keys(facts).length?[{type:'tool.facts',toolCallId:command.toolCallId,facts}]:[];
    }
    return[];
  }
  function handleCheckpointRaw(id:string,raw:unknown){
    if(!raw||typeof raw!=='object')return false;
    const row=raw as {type?:unknown;comandoId?:unknown};
    if(row.type==='ComandoUtenteIniziato'){
      const checkpoint=shellAwaitingStart.shift();
      if(checkpoint&&typeof row.comandoId==='string'&&row.comandoId){checkpoint.bindCommand(row.comandoId);shellByCommandId.set(row.comandoId,checkpoint);shellCommandForCheckpoint.set(checkpoint,row.comandoId);shellCorrelated.add(checkpoint);}
      return false;
    }
    if(row.type==='ComandoUtenteFinito'){
      let commandId=typeof row.comandoId==='string'&&row.comandoId?row.comandoId:null;
      let checkpoint=commandId?shellByCommandId.get(commandId)??null:null;
      if(!checkpoint&&commandId===null&&shellByCommandId.size===1){const only=[...shellByCommandId.entries()][0]!;commandId=only[0];checkpoint=only[1];}
      if(checkpoint&&commandId){shellByCommandId.delete(commandId);shellCommandForCheckpoint.delete(checkpoint);void checkpoint.finalize().catch(error=>checkpointFailure('CHECKPOINT_FINALIZE_FAILED',error));}
      else if(commandId===null&&shellByCommandId.size>1)checkpointFailure('CHECKPOINT_SHELL_CORRELATION_FAILED',new Error('Multiple direct shell checkpoints are active and the terminal event has no command id.'));
      return false;
    }
    return false;
  }
  function steerState(state:TuiSteerState){onSteerState?.(state);}
  function pendingSteerNow(){return pendingSteer;}
  function rejectSteer(code:string,message:string):TuiSteerOutcome{const outcome={status:'rejected' as const,code,message};steerState(outcome);return outcome;}
  function handleRawSteerEvent(raw:unknown){
    if(!raw||typeof raw!=='object')return;
    const row=raw as {type?:unknown;redirectId?:unknown;message?:unknown;code?:unknown};
    const type=typeof row.type==='string'?row.type:'',redirectId=typeof row.redirectId==='string'?row.redirectId:'';
    if(type==='RunRedirectRequested'){
      if(!steerInvocation||pendingSteer||!redirectId)return;
      pendingSteer={redirectId,text:steerInvocation.text};steerState({status:'requested',redirectId});return;
    }
    if(!pendingSteer||pendingSteer.redirectId!==redirectId)return;
    if(type==='RunRedirectApplied'){steerState({status:'applied',redirectId});pendingSteer=null;return;}
    if(type==='RunRedirectCancelled'){steerState({status:'cancelled',redirectId});pendingSteer=null;return;}
    if(type==='RunRedirectFailed'){
      const code=typeof row.code==='string'?row.code:'SESSION_STEER_FAILED',message=typeof row.message==='string'?row.message:'Steering failed.';
      steerState({status:'failed',redirectId,code,message});pendingSteer=null;
    }
  }
  function actionOf(entry:ControllerQueueEntry):TuiQueuedAction{return{kind:entry.kind,text:entry.text,...(entry.attachments?{attachments:entry.attachments.map(row=>({...row}))}:{}),...(entry.attachIfTooLarge?{attachIfTooLarge:true as const}:{})};}
  function publicEntry(entry:ControllerQueueEntry):TuiQueueEntry{return{id:entry.id,kind:entry.kind,text:entry.text,status:entry.status==='dispatching'?'uncertain':'pending',...(entry.attachments?{attachments:entry.attachments.map(row=>({...row}))}:{})};}
  function queueSnapshot():TuiQueuedAction[]{return queuedEntries.map(actionOf);}
  function queueEntriesSnapshot():TuiQueueEntry[]{return queuedEntries.map(publicEntry);}
  function notifyQueue(){onQueueChange?.(queueSnapshot());}
  async function persistFor(sessionId:string,entries:readonly ControllerQueueEntry[]){if(queueStore)await queueStore.save(sessionId,entries.filter(storedEntry));}
  async function replaceQueue(entries:readonly ControllerQueueEntry[],sessionId:string=current??''){
    if(!sessionId)throw new Error('SESSION_NOT_FOUND');
    await persistFor(sessionId,entries);
    if(current!==sessionId)throw new Error('QUEUE_SESSION_CHANGED');
    queuedEntries.splice(0,queuedEntries.length,...entries.map(entry=>({...entry,...(entry.attachments?{attachments:entry.attachments.map(row=>({...row}))}:{})})));notifyQueue();
  }
  async function hydrateQueue(id:string,epoch:number){
    queuedEntries.length=0;queuePausedState=false;notifyQueue();if(!queueStore)return;
    try{const loaded=await queueStore.load(id);if(current!==id||epoch!==queueEpoch)return;queuedEntries.splice(0,queuedEntries.length,...loaded);queuePausedState=loaded.length>0;notifyQueue();if(loaded.length)onQueueRestored?.(queueEntriesSnapshot());}
    catch(error){if(current!==id||epoch!==queueEpoch)return;queuePausedState=true;onError(error);}
  }
  async function enqueue(action:TuiQueuedAction){
    await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');
    const entry:ControllerQueueEntry={id:randomUUID(),kind:action.kind,text:action.text,status:'pending',...(action.attachments?.length?{attachments:action.attachments.map(row=>({...row}))}:{}),...(action.kind==='prompt'&&action.attachIfTooLarge?{attachIfTooLarge:true as const}:{})};
    await replaceQueue([...queuedEntries,entry],current);return entry;
  }
  function queuePosition(entry:ControllerQueueEntry){const index=queuedEntries.findIndex(row=>row.id===entry.id);return index<0?0:index+1;}
  async function dispatchQueuedActions(id:string){
    await queueHydration;if(current!==id||queuePausedState||drainingQueue)return;drainingQueue=true;
    let followed:string|null=null;
    try{
      while(current===id&&queuedEntries.length){
        const next=queuedEntries[0]!;if(next.kind==='prompt')await assertReady();
        const marked:ControllerQueueEntry={...next,status:'dispatching',...(next.attachments?{attachments:next.attachments.map(row=>({...row}))}:{})},tail=queuedEntries.slice(1);
        if(marked.kind==='slash'){
          /* R5a Q-R5-8: out of the queue first, then run; a command that moved the session (/resume, /fork) takes what was
             typed after it along, since that was typed for the session it opens. */
          await replaceQueue(tail,id);
          try{await onQueuedSlash?.(marked.text);}catch(error){onError(error);}
          if(current!==id){
            const moved=tail.filter(entry=>!queuedEntries.some(row=>row.id===entry.id));
            if(current&&moved.length){await queueHydration;await persistFor(id,[]);await replaceQueue([...queuedEntries,...moved.map(entry=>({...entry,status:'pending' as const}))],current);followed=current;}
            return;
          }
          continue;
        }
        if(marked.kind==='prompt'){
          /* F-Q5 (owner 03/10, «tutti in un colpo alla fine del turno come fanno gli altri»; Claude Code interactive-mode: «When the
             turn ends with messages still queued, they go out without another key press, in the order you typed them»): the
             messages at the head of the queue go out together, one turn, in order; a queued command or slash keeps its place. */
          /* review 9 F7: a prompt sent as an attachment goes alone, with its run option; the group stops before it */
          let count=0;while(count<queuedEntries.length&&queuedEntries[count]!.kind==='prompt'&&(count===0||!queuedEntries[count]!.attachIfTooLarge)&&!(count>0&&queuedEntries[0]!.attachIfTooLarge))count++;
          const group=queuedEntries.slice(0,count).map(entry=>({...entry,status:'dispatching' as const,...(entry.attachments?{attachments:entry.attachments.map(row=>({...row}))}:{})}));
          const rest=queuedEntries.slice(count);
          await replaceQueue([...group,...rest],id);
          const text=group.map(entry=>entry.text).join('\n\n'),attachments=group.flatMap(entry=>entry.attachments??[]);
          const asAttachment=group.length===1&&group[0]!.attachIfTooLarge===true;
          try{await runModelMutation('resume',id,()=>asAttachment?runtime.resume(id,text,attachments.length?attachments:undefined,{attachIfTooLarge:true}):runtime.resume(id,text,attachments.length?attachments:undefined));}
          catch(error){if(current===id)await replaceQueue([...group.map(entry=>({...entry,status:'pending' as const})),...queuedEntries.filter(entry=>!group.some(sent=>sent.id===entry.id))],id).catch(onError);throw error;}
          /* 14/10/2026: what was queued while the turn was being started stays (it was dropped with the old `rest`) */
          await replaceQueue(queuedEntries.filter(entry=>!group.some(sent=>sent.id===entry.id)),id);for(const entry of group)onQueuedDispatch?.(actionOf(entry));return;
        }
        await replaceQueue([marked,...tail],id);
        /* R5a S5 (E8, gate finding 8): a queued `!` command's own line is shown BEFORE it runs, so its row lands after it. */
        onQueuedDispatch?.(actionOf(marked));
        try{await runShellMutation(id,marked.text);}
        catch(error){if(current===id)await replaceQueue([{...marked,status:'pending'},...queuedEntries.filter(entry=>entry.id!==marked.id)],id).catch(onError);throw error;}
        await replaceQueue(queuedEntries.filter(entry=>entry.id!==marked.id),id);
      }
    }finally{drainingQueue=false;if(boundaryWhileDraining){boundaryWhileDraining=false;requestQueuedDrain(id);}if(followed)requestQueuedDrain(followed);}
  }
  /* stage 7.14 (owner 03/10, /queue «send now» at rest): that one entry goes now, out of order, as the queue would send it;
     the rest stays as it was, a paused queue still paused */
  async function sendQueuedNow(id:string){
    await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');
    if(drainingQueue)throw Object.assign(new Error('QUEUE_BUSY'),{code:'QUEUE_BUSY'});
    const sessionId=current;const entry=queuedEntries.find(row=>row.id===id);if(!entry)throw new Error('QUEUE_ENTRY_NOT_FOUND');
    if(entry.kind==='prompt')await assertReady();
    await replaceQueue(queuedEntries.filter(row=>row.id!==id),sessionId);
    if(entry.kind==='slash'){await onQueuedSlash?.(entry.text);return;}
    if(entry.kind==='command'){onQueuedDispatch?.(actionOf(entry));await runShellMutation(sessionId,entry.text);return;}
    try{await runModelMutation('resume',sessionId,()=>entry.attachIfTooLarge?runtime.resume(sessionId,entry.text,entry.attachments,{attachIfTooLarge:true}):runtime.resume(sessionId,entry.text,entry.attachments));}
    catch(error){if(current===sessionId)await replaceQueue([entry,...queuedEntries],sessionId).catch(onError);throw error;}
    onQueuedDispatch?.(actionOf(entry));
  }
  /* R5a Q-R5-8: a session-changing slash command typed during a turn waits in the queue (app.ts decides which ones). */
  async function deferSlash(text:string,{running}:{running:boolean}){
    await queueHydration;const value=String(text??'').trim();if(!current)throw new Error('SESSION_NOT_FOUND');if(!value)return 0;
    const entry=await enqueue({kind:'slash',text:value});
    if(!running&&!queuePausedState)await dispatchQueuedActions(current);
    return queuePosition(entry);
  }
  function requestQueuedDrain(id:string){
    if(queuePausedState||pendingSteer||cancelling)return;if(drainingQueue){boundaryWhileDraining=true;return;}
    void queueHydration.then(()=>{if(current===id&&!queuePausedState&&!pendingSteer&&!cancelling)return dispatchQueuedActions(id);}).catch(onError);
  }
  async function assertReady(){if(!readiness)return;const answer=await readiness(currentModel);if(!answer.ready)throw new TuiNotReadyError(answer.code,answer.provider,answer.message);}
  async function resolveId(id:string){if(id!=='last')return id;const rows=await runtime.listSessions();const row=rows.at(-1);if(!row?.sessionId)throw new Error('SESSION_NOT_FOUND');return String(row.sessionId);}
  /*
   * R1 lane R (D-04, D-08; gate E9). Re-attaching to an EXISTING session (resume, fork) replays its history synchronously inside
   * `runtime.subscribe` (registry `iscriviti`, session-registry.mjs:5825-5831): those RunStarted events are marked `history`, so
   * the transcript never lets an old message absorb a new send's echo. A session this controller has just started is not
   * history — the prompt given on the command line is echoed by app.ts only after `initialize` returns.
   * `openRun` follows the run lifecycle of the attached session; the kernel appends no terminal event to a run cut off by
   * closing TALOS (measured: RunStarted, TextMessageStart, TextMessageContent, then nothing) but its session list says so.
   */
  let replayingHistory=false;let replayCount=0;
  /*
   * R3 gate E8, owner decision Q-R3-8. The kernel ends every stopped run with `RunError{code:'fermato'}`
   * (harness-ui/src/agent-service.mjs:185); the CLI is the only one that knows the person asked for the stop, so it keeps
   * that request until the run's terminal event and turns that event into the interrupted path the transcript already
   * has (`run.cancelled{interrupted:true}`), with `reason:'person'` (a replayed cut-off run has no reason). A `fermato`
   * nobody asked for (the model went silent), or any other code racing the stop, stays a failure. The request belongs to
   * the run that was open when it was made: a new `run.started` drops it.
   */
  let stopRequested:string|null=null;
  function personStopVerdict(id:string,event:TuiEvent):TuiEvent{
    if(event.type==='run.started'){stopRequested=null;return event;}
    if(event.type!=='run.failed'&&event.type!=='run.cancelled'&&event.type!=='run.completed')return event;
    const asked=stopRequested===id;if(asked)stopRequested=null;
    /* A replayed `fermato` is the person's stop unless it is the kernel's exact "stopped without an answer" sentence. */
    if(event.type!=='run.failed'||event.error?.envelope?.code!=='fermato')return event;
    const replayedStop=replayingHistory&&!isStoppedWithoutAnswer(event.error.raw??event.error.message??'');
    if(!asked&&!replayedStop)return event;
    return{type:'run.cancelled',...(event.runId?{runId:event.runId}:{}),interrupted:true,reason:'person',...(event.eventId?{eventId:event.eventId}:{})};
  }
  let openRun:{runId?:string}|null=null;
  function attach(id:string,from=0,history=false){
    unsubscribe();descendants.stop();adapter.bindSession(id,{fresh:history});current=id;openRun=null;replayedApprovals.clear();replayedQuestions.clear();{const before=openQuestions[0]??null;openQuestions=[];showQuestion(before);}replayedPlans.clear();plansOf(null);replayedElicitations.clear();elicitationsOf(null);personCommandNext=null;decidedTools.clear();toolModes.clear();const epoch=++queueEpoch;queueHydration=hydrateQueue(id,epoch);setKernelQueue({items:[],paused:false});
    replayingHistory=history;replayCount=0;
    try{unsubscribe=runtime.subscribe(id,(raw)=>{if(handleCheckpointRaw(id,raw))return;processRawEvent(id,raw);},from,history?{resultsForScreen:true}:undefined);}
    finally{replayingHistory=false;if(history&&replayCount>0){developmentLog('runtime.replay.summary',{sessionId:id,rawEvents:replayCount},'debug','tui-controller');/* long chats, tappa D: the screen starts with the last turns; the older ones wait one page-load away */onEvent({type:'history.window',turns:WINDOW_TURNS});}}
    if(history){const rows=Promise.resolve().then(()=>runtime.listSessions({scope:'loaded'}));rows.catch(()=>{});attachedList={id,rows};void recountAgents(id);}
    return id;
  }
  /* one read of the kernel's list for each attach with history, shared by the agents' recount and the replayed run's settling */
  let attachedList:{id:string;rows:Promise<any>}|null=null;
  /* Riga 224 (T4, return): the agents live in the process and the kernel tells only the conversation on screen, so back on one (resume, fork,
     the lists) its descendants still at work are counted again from the kernel's list; another conversation's are not (Codex
     tui/src/app/session_lifecycle.rs:85-112 rebuilds the running agents from its thread list in the same way). */
  async function recountAgents(id:string){let rows:ReturnType<typeof normalizeSessions>[number][];try{rows=normalizeSessions(await attachedList!.rows);}catch{return;}if(current!==id)return;
    const parentOf=new Map(rows.map(row=>[row.id,row.parentId]));const mine=(row:ReturnType<typeof normalizeSessions>[number])=>{let up=row.parentId;for(let hop=0;up&&hop<64;hop++,up=parentOf.get(up)??null)if(up===id)return true;return false;};
    for(const row of rows)if(row.outcome==='running'&&mine(row))onEvent({type:'agent.changed',childId:row.id,parentId:row.parentId,reason:'created',kind:'lifecycle',status:'started',task:row.name??row.delegatedTask,tool:null,startedAt:row.startedAt,interrupted:false,count:null,ended:false,prompt:null,endedAt:null,tokens:null,model:row.model,approvalsPending:null});}
  /* After a history replay, a run still open in the events but not running in the kernel was cut off: it is closed as
     interrupted through one terminal event, so the transcript row and the status line (state.ts `run.cancelled`) agree with
     the footer. Settled BEFORE any new prompt of the same resume is sent, and skipped if the session moved on meanwhile. */
  async function settleReplayedRun(id:string){
    /* R3 E12 (Q-R3-15): the approvals the replay left unanswered are asked only when their run is still waiting. */
    const waiting=[...replayedApprovals.values()];replayedApprovals.clear();
    const waitingQuestions=[...replayedQuestions.values()];replayedQuestions.clear();
    const waitingPlans=[...replayedPlans.values()];replayedPlans.clear();
    const waitingElicitations=[...replayedElicitations.values()];replayedElicitations.clear();
    const open=openRun;if(!open||current!==id)return;
    let outcome:unknown=null;
    try{outcome=(await (attachedList?.id===id?attachedList.rows:runtime.listSessions({scope:'loaded'}))).find((row:any)=>row?.sessionId===id)?.outcome??null;}catch(error){developmentLogError('replay.settle.failure',error,{sessionId:id},'tui-controller');return;}
    if(current===id&&openRun===open&&outcome==='running'){for(const event of waiting)requestApproval(id,event);for(const event of waitingQuestions)questionAsked(id,event);for(const event of waitingPlans)planProposed(id,event);for(const event of waitingElicitations)elicitationAsked(id,event);descendants.start(id);return;}
    if(current!==id||openRun!==open||typeof outcome!=='string'||outcome==='running'||outcome==='unknown')return;
    openRun=null;onEvent({type:'run.cancelled',...(open.runId?{runId:open.runId}:{}),interrupted:true});
  }
  async function listSessions(options?:{scope?:'all'|'loaded'}){return normalizeSessions(await runtime.listSessions(options));}
  async function agentTree(){if(!current)return null;return buildAgentTree(await runtime.listSessions({scope:'loaded'}),current);}
  /* B1 slice 18, fix round: a prompt makes resume and fork a send, so readiness is asked FIRST — before the session list, the
     subscription or the runtime call — and a not-ready answer reaches no runtime method. Without a prompt nothing is sent. */
  async function referencesFor(text:string){return resolveProjectReferences({projectRoot,prompt:text});}
  function promptAction(text:string,attachments:CliAttachment[],attachIfTooLarge=false):TuiQueuedAction{return{kind:'prompt',text,...(attachments.length?{attachments}:{}),...(attachIfTooLarge?{attachIfTooLarge:true as const}:{})};}
  async function resumeSession(id:string,prompt?:string){const text=prompt?.trim();if(text)await assertReady();const attachments=text?await referencesFor(text):[];const resolved=await resolveId(id);attach(resolved,0,true);await queueHydration;await settleReplayedRun(resolved);if(text)await runModelMutation('resume',resolved,()=>runtime.resume(resolved,text,attachments));return resolved;}
  async function forkSession(id:string,prompt?:string){const text=prompt?.trim();if(text)await assertReady();const attachments=text?await referencesFor(text):[];const resolved=await resolveId(id);const child=await runModelMutation('fork',null,()=>runtime.fork(resolved,text,attachments));attach(child,0,true);await queueHydration;await settleReplayedRun(child);return child;}
  async function initialize({resume,fork,initialPrompt}:{resume?:string;fork?:string;initialPrompt?:string}={}){const text=initialPrompt?.trim();if(text)await assertReady();const attachments=text?await referencesFor(text):[];if(resume||fork){const target=resume||fork;/* B2: `last` needs the list, served from the index; the start-up call comes first (the supervisor retries it), then only that family */await runtime.restore({sessionIds:target&&target!=='last'?[target]:[]});}if(resume){const id=await resolveId(resume);if(resume==='last')await runtime.restore({sessionIds:[id]});attach(id,0,true);await queueHydration;await settleReplayedRun(id);if(text)await runModelMutation('resume',id,()=>runtime.resume(id,text,attachments));return id;}if(fork){const parent=await resolveId(fork);if(fork==='last')await runtime.restore({sessionIds:[parent]});const id=await runModelMutation('fork',null,()=>runtime.fork(parent,text,attachments));attach(id,0,true);await queueHydration;await settleReplayedRun(id);return id;}if(text){const id=await runModelMutation('start',null,()=>runtime.start({projectRoot,prompt:text,model:currentModel,permissionMode:currentMode,...(attachments.length?{attachments}:{})}));attach(id,0);await queueHydration;return id;}return null;}
  /*
   * ⛔ IL PREFISSO `!` VA AL COMANDO, NON AL MODELLO. Nessun `start`/`resume` parte da questo ramo:
   *   il testo non diventa mai un messaggio per il modello.
   * ⛔ E senza sessione si RIFIUTA a voce alta: far sparire un comando digitato e' peggio che negarlo.
   */
  /* stage 7.13 (/clear «Start a new conversation»; Claude Code /clear keeps the old one in /resume): the next message starts a
     new session; this one stays in the kernel. Refused while a turn runs or messages wait, so nothing queued is lost. */
  function startFresh({running}:{running:boolean}){
    if(running||queuedEntries.length)throw Object.assign(new Error('SESSION_BUSY'),{code:'SESSION_BUSY'});
    unsubscribe();unsubscribe=()=>{};descendants.stop();current=null;openRun=null;replayedApprovals.clear();replayedQuestions.clear();{const before=openQuestions[0]??null;openQuestions=[];showQuestion(before);}replayedPlans.clear();plansOf(null);replayedElicitations.clear();elicitationsOf(null);personCommandNext=null;decidedTools.clear();toolModes.clear();++queueEpoch;
  }
  /* `attachIfTooLarge` (0.6.13, the screen's «Send as attachment»): the same text again with the kernel's run option
     `allegaSeTroppoGrande`, so a request too large for the model goes as head, tail and a file the model reads. It rides on the
     turn this send starts or resumes; a message that has to wait in a queue goes as a normal one (the queues carry no run options). */
  async function send(prompt:string,{running,attachIfTooLarge=false}:{model:string;running:boolean;attachIfTooLarge?:boolean}):Promise<TuiSendOutcome>{
    developmentLog('controller.send',{prompt:developmentTextEvidence(prompt),running,currentSessionId:current,model:currentModel,mode:currentMode,queueCount:queuedEntries.length},'debug','tui-controller');await queueHydration;const text=prompt.trim();
    if(!text)return{sessionId:current,kind:'none',queued:false,position:0};
    if(text.startsWith('!')){
      const command=text.slice(1).trim();
      if(!command)return{sessionId:current,kind:'none',queued:false,position:0};
      if(!current)throw new Error(EXECUTION_TEXT.shellSessionRequired);
      if(running||queuedEntries.length){
        const action=await enqueue({kind:'command',text:command});
        if(!running&&!queuePausedState)await dispatchQueuedActions(current);else if(turnEnded&&!drainingQueue)requestQueuedDrain(current);
        const position=queuePosition(action);
        return{sessionId:current,kind:'command',queued:position>0,position};
      }
      await runShellMutation(current,command);
      return{sessionId:current,kind:'command',queued:false,position:0};
    }
    await assertReady();const attachments=await referencesFor(text);
    if(running||queuedEntries.length){
      if(!current)throw new Error('SESSION_NOT_FOUND');
      /* F-Q1 (owner 03/10, «Come Claude Code, completo»; kernel K5): while the turn runs, the message goes into the KERNEL's
         queue and enters after the current step, in the same turn. If the kernel cannot take it (the turn is closing, an
         older kernel), it waits in this queue and goes out when the turn ends, as before: a typed message is never lost. */
      if(running&&runtime.queueMessage){
        try{
          const queue=attachIfTooLarge?await runtime.queueMessage(current,text,attachments,{attachIfTooLarge:true}):await runtime.queueMessage(current,text,attachments);
          setKernelQueue(screenQueue(queue));
          return{sessionId:current,kind:'prompt',queued:true,position:queue.items.filter(item=>item.origin==='person').length,inKernel:true};
        }catch(error){developmentLogError('queue.kernel.refused',error,{sessionId:current},'tui-controller');}
      }
      const action=await enqueue(promptAction(text,attachments,attachIfTooLarge));
      /* 14/10/2026 (r1-resume-live-app, 4 in 12 under load): `running` is what the screen knew when the message was typed; the
         turn can end during the awaits above (the kernel refused because it was closing) and its end drained an empty queue.
         The screen also learns of the end after the controller: a message typed in that gap arrives with `running` still true.
         When the turn has ended (its end asked for the queue to go out) and none has started since, it goes now; a drain in
         flight starts a turn whose end takes it. */
      if(!running&&!queuePausedState)await dispatchQueuedActions(current);else if(turnEnded&&!drainingQueue)requestQueuedDrain(current);
      const position=queuePosition(action);
      return{sessionId:current,kind:'prompt',queued:position>0,position};
    }
    if(current){await runModelMutation('resume',current,()=>attachIfTooLarge?runtime.resume(current!,text,attachments,{attachIfTooLarge:true}):runtime.resume(current!,text,attachments));return{sessionId:current,kind:'prompt',queued:false,position:0};}
    const id=await runModelMutation('start',null,()=>runtime.start({projectRoot,prompt:text,model:currentModel,permissionMode:currentMode,...(attachments.length?{attachments}:{}),...(attachIfTooLarge?{attachIfTooLarge:true}:{})}));attach(id,0);return{sessionId:id,kind:'prompt',queued:false,position:0};
  }
  async function steer(prompt:string,{running}:{running:boolean}):Promise<TuiSteerOutcome>{
    await queueHydration;const text=String(prompt??'').trim();
    if(!text)return rejectSteer('STEER_TEXT_REQUIRED','Steering text is required.');
    if(text.startsWith('!'))return rejectSteer('STEER_COMMAND_UNSUPPORTED','Shell commands cannot be used as steering input.');
    if(!current)return rejectSteer('SESSION_NOT_FOUND','There is no active session to steer.');
    if(!running)return rejectSteer('STEER_NOT_RUNNING','Steering requires an active run.');
    if(pendingSteer||steerInvocation)return rejectSteer('STEER_ALREADY_PENDING','A steering request is already waiting for a safe boundary.');
    try{
      await assertReady();const attachments=await referencesFor(text);steerInvocation={text};
      const accepted=await runtime.steer(current,text,attachments);
      const correlated=pendingSteerNow();if(correlated&&correlated.redirectId!==accepted.redirectId){
        const stale=correlated;pendingSteer=null;steerState({status:'failed',redirectId:stale.redirectId,code:'STEER_CORRELATION_FAILED',message:'The runtime returned a different steering correlation id.'});
        return rejectSteer('STEER_CORRELATION_FAILED','The runtime returned a different steering correlation id.');
      }
      if(!pendingSteerNow()){pendingSteer={redirectId:accepted.redirectId,text};steerState({status:'requested',redirectId:accepted.redirectId});}
      return{status:'requested',redirectId:accepted.redirectId};
    }catch(error){
      pendingSteer=null;const code=typeof (error as any)?.code==='string'?(error as any).code:'SESSION_STEER_REJECTED',message=error instanceof Error?error.message:String(error);
      return rejectSteer(code,message);
    }finally{steerInvocation=null;}
  }
  async function editQueue(id:string,text:string){await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');const index=queuedEntries.findIndex(row=>row.id===id);if(index<0)throw new Error('QUEUE_ENTRY_NOT_FOUND');const value=text.trim();if(!value)throw new Error('QUEUE_TEXT_REQUIRED');const previous=queuedEntries[index]!,attachments=previous.kind==='prompt'?await referencesFor(value):[];const edited:ControllerQueueEntry={id:previous.id,kind:previous.kind,text:value,status:'pending',...(attachments.length?{attachments}:{})};const next=[...queuedEntries];next[index]=edited;await replaceQueue(next,current);}
  async function moveQueue(id:string,direction:-1|1){await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');const index=queuedEntries.findIndex(row=>row.id===id);if(index<0)throw new Error('QUEUE_ENTRY_NOT_FOUND');const target=Math.max(0,Math.min(queuedEntries.length-1,index+direction));if(target===index)return;const next=[...queuedEntries];const [entry]=next.splice(index,1);next.splice(target,0,entry!);await replaceQueue(next,current);}
  async function deleteQueue(id:string){await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');const index=queuedEntries.findIndex(row=>row.id===id);if(index<0)return null;const next=[...queuedEntries];const [removed]=next.splice(index,1);await replaceQueue(next,current);if(next.length===0)queuePausedState=false;return removed?publicEntry(removed):null;}
  async function clearQueue(){await queueHydration;const dropped=queueSnapshot();if(current)await replaceQueue([],current);else{queuedEntries.length=0;notifyQueue();}queuePausedState=false;return dropped;}
  async function dispatchQueue(){await queueHydration;if(!current)throw new Error('SESSION_NOT_FOUND');if(!queuedEntries.length){queuePausedState=false;return 0;}const normalized=queuedEntries.map(row=>row.status==='dispatching'?{...row,status:'pending' as const}:row);await replaceQueue(normalized,current);queuePausedState=false;await dispatchQueuedActions(current);return queuedEntries.length;}
  let interruptPromise:Promise<number>|null=null;
  let interruptTerminalSession:string|null=null;
  let interruptTerminalResolve:(()=>void)|null=null;
  /* F-Q1 (owner 03/10): the person's queued messages leave both queues — the kernel's (only those still waiting: one already
     delivered is not taken back) and this one (prompts only; a queued command keeps its place). */
  async function takeBackPrompts(sessionId:string):Promise<string[]>{
    await queueHydration;const texts:string[]=[];
    const local=queuedEntries.filter(entry=>entry.kind==='prompt'&&entry.status!=='dispatching');
    if(local.length&&current===sessionId){await replaceQueue(queuedEntries.filter(entry=>!local.includes(entry)),sessionId);texts.push(...local.map(entry=>entry.text));}
    const waiting=kernelQueue.items.filter(item=>item.origin==='person'&&item.text);
    if(waiting.length&&runtime.unqueueMessage)for(const item of waiting){try{if(await runtime.unqueueMessage(sessionId,item.id))texts.push(item.text!);}catch(error){onError(error);}}
    return texts;
  }
  /* F-Q1 (Claude Code: ↑ edits what is queued; Pi `restoreQueuedMessagesToEditor`): everything the person queued, back as one draft. */
  async function takeBackQueued():Promise<string|null>{if(!current)return null;const texts=await takeBackPrompts(current);return texts.length?texts.join('\n\n'):null;}
  function kernelQueueOps(){if(!current||!runtime.unqueueMessage||!runtime.queueMessage)throw Object.assign(new Error('SESSION_QUEUE_UNAVAILABLE'),{code:'SESSION_QUEUE_UNAVAILABLE'});return{sessionId:current,unqueue:runtime.unqueueMessage.bind(runtime),queue:runtime.queueMessage.bind(runtime)};}
  const delivered=()=>Object.assign(new Error('QUEUE_ENTRY_DELIVERED'),{code:'QUEUE_ENTRY_DELIVERED'});
  /* F-Q1, /queue for a message in the kernel's queue (owner 03/10: no «move up» there — they all go in together). */
  async function deleteKernelQueued(id:string){const ops=kernelQueueOps();return ops.unqueue(ops.sessionId,id);}
  async function editKernelQueued(id:string,text:string){
    const value=text.trim();if(!value)throw new Error('QUEUE_TEXT_REQUIRED');const ops=kernelQueueOps();
    if(!await ops.unqueue(ops.sessionId,id))throw delivered();
    const attachments=await referencesFor(value);
    try{setKernelQueue(screenQueue(await ops.queue(ops.sessionId,value,attachments)));}
    catch(error){developmentLogError('queue.kernel.refused',error,{sessionId:ops.sessionId},'tui-controller');await enqueue(promptAction(value,attachments));if(!openRun)requestQueuedDrain(ops.sessionId);}
  }
  async function steerKernelQueued(id:string,{running}:{running:boolean}):Promise<TuiSteerOutcome>{
    const item=kernelQueue.items.find(row=>row.id===id&&row.origin==='person');if(!item?.text)throw new Error('QUEUE_ENTRY_NOT_FOUND');
    const ops=kernelQueueOps();if(!await ops.unqueue(ops.sessionId,id))throw delivered();
    const outcome=await steer(item.text,{running});
    if(outcome.status!=='requested'){try{setKernelQueue(screenQueue(await ops.queue(ops.sessionId,item.text,await referencesFor(item.text))));}catch(error){onError(error);}}
    return outcome;
  }
  async function interrupt({send=false}:{send?:boolean}={}){
    await queueHydration;if(!current)return queuedEntries.length;if(interruptPromise)return interruptPromise;
    const sessionId=current;cancelling=true;interruptTerminalSession=sessionId;if(openRun)stopRequested=sessionId;
    const terminal=new Promise<void>(resolve=>{interruptTerminalResolve=resolve;});
    interruptPromise=(async()=>{
      try{await runtime.cancel(sessionId);await terminal;}
      catch(error){queuePausedState=true;onError(error);throw error;}
      finally{cancelling=false;interruptTerminalSession=null;interruptTerminalResolve=null;}
      if(current!==sessionId)return queuedEntries.length;
      /* F-Q1 (owner 03/10, «Tornano nel composer», like Claude Code and Pi): after a stop nothing goes out by itself — the
         queued messages come back to the composer as one draft, a queued command waits paused. Only «interrupt and send»
         (the /busy mode the person chose for this Enter) still sends them. */
      const restored=await takeBackPrompts(sessionId);
      const normalized=queuedEntries.map(row=>row.status==='dispatching'?{...row,status:'pending' as const}:row);
      if(send){
        const prompts:ControllerQueueEntry[]=[];for(const text of restored){const attachments=await referencesFor(text);prompts.push({id:randomUUID(),kind:'prompt',text,status:'pending',...(attachments.length?{attachments}:{})});}
        await replaceQueue([...prompts,...normalized],sessionId);queuePausedState=false;await dispatchQueuedActions(sessionId);return queuedEntries.length;
      }
      if(restored.length)onComposerRestore?.(restored.join('\n\n'));
      await replaceQueue(normalized,sessionId);queuePausedState=normalized.length>0;return queuedEntries.length;
    })().finally(()=>{interruptPromise=null;});
    return interruptPromise;
  }
  /* stage 7.21 (owner 03/10): a rule changed in /permissions is obeyed at once, by the engine this session decides with */
  const setRules=(next:RuleSetInput)=>engine.replaceRules(next);
  const decisions=async()=>decisionLog?await decisionLog.list():[];
  return{initialize,attach,replaying:()=>replayingHistory,startFresh,sendQueuedNow,takeBackQueued,deleteKernelQueued,editKernelQueued,steerKernelQueued,kernelQueue:()=>kernelQueue,setRules,decisions,send,deferSlash,steer,listSessions,agentTree,resumeSession,forkSession,pendingCommands:()=>queuedEntries.filter(action=>action.kind==='command').length,pendingPrompts:()=>queuedEntries.filter(action=>action.kind==='prompt').length,queue:queueSnapshot,queueEntries:queueEntriesSnapshot,queuePaused:()=>queuePausedState,queueReady:()=>queueHydration,editQueue,moveQueue,deleteQueue,clearQueue,dispatchQueue,interrupt,current:()=>current,mode:()=>currentMode,setMode,model:()=>currentModel,setModel(next:string){if(typeof next!=='string'||!next.trim())throw new Error('MODEL_REQUIRED');currentModel=next.trim();},async compact(){if(!current)throw new Error('SESSION_NOT_FOUND');return runtime.compact(current);},async answerElicitation(requestId:string,response:ElicitationResponse){/* Stage 3: only an answer the kernel accepted takes the card away */const open=openElicitations.find(e=>e.requestId===requestId);if(!open)throw Object.assign(new Error('ELICITATION_NOT_OPEN'),{code:'ELICITATION_NOT_OPEN'});await runtime.answerElicitation(open.sessionId,requestId,response);elicitationClosed(requestId);},async answerPlan(requestId:string,decision:PlanDecisionKind,feedback?:string){/* Stage 3: the choice carries the hash of the plan on screen; only an accepted choice takes the card away. */const open=openPlans.find(p=>p.requestId===requestId);if(!open)throw Object.assign(new Error('PLAN_NOT_OPEN'),{code:'PLAN_NOT_OPEN'});await runtime.answerPlan(open.sessionId,{requestId,hash:open.hash,decision,...(feedback?{feedback}:{})});planClosed(requestId);},agentQuestions:()=>agentQuestions,
    /* Stage 6b: the answer from the agents page goes to the child's own session; only an accepted answer leaves the list. */
    async answerAgentQuestion(requestId:string,response:QuestionResponse){const open=agentQuestions.find(q=>q.requestId===requestId);if(!open)throw Object.assign(new Error('QUESTION_NOT_OPEN'),{code:'QUESTION_NOT_OPEN'});await runtime.answerQuestion(open.sessionId,requestId,response);questionClosed(requestId);},
    /* Stage 6b: several questions or choices — the child's question moves into the stage 3 card, first in line, naming its agent. */
    openAgentQuestion(requestId:string){const ask=agentQuestions.find(q=>q.requestId===requestId);if(!ask||openQuestions.some(q=>q.requestId===requestId))return;const before=openQuestions[0]??null;openQuestions=[{requestId:ask.requestId,sessionId:ask.sessionId,questions:ask.questions,asker:ask.task??''},...openQuestions];showQuestion(before);},
    async answerQuestion(requestId:string,response:QuestionResponse){/* Stage 3: the kernel checks the answer against its contract; only an accepted answer takes the card away (a refusal leaves it and says why). */const open=openQuestions.find(q=>q.requestId===requestId);if(!open)throw Object.assign(new Error('QUESTION_NOT_OPEN'),{code:'QUESTION_NOT_OPEN'});await runtime.answerQuestion(open.sessionId,requestId,response);questionClosed(requestId);},async resolveApproval(requestId:string,choice:UserApprovalChoice,extra?:{domandaModificata:string}){/* R3 R3-ROW: the link is taken BEFORE the answer: the kernel's ApprovalResolved arrives during the await and drops it. */const toolCallId=approvalTools.get(requestId);approvalTools.delete(requestId);if(toolCallId&&!choice.startsWith('allow-'))adapter.noteDenial(toolCallId,{by:'person'});await coordinator.resolve(requestId,choice,extra);const group=groupCards.get(requestId);groupCards.delete(requestId);const all=choice==='allow-calls'&&group?group.count:0;if(all)for(const id of group!.ids)if(id!==toolCallId)coveredByAll.set(id,all);const decision=all?{kind:'all' as const,count:all}:decisionFromChoice(choice);if(toolCallId&&decision)emitDecision(toolCallId,decision);onApproval?.(null);},async cancel(){if(!current)return[] as TuiQueuedAction[];const sessionId=current;if(openRun)stopRequested=current;onEvent({type:'run.cancelled'});cancelling=true;try{await runtime.cancel(sessionId);/* F-Q1 (owner 03/10): the queued messages come back to the composer; only queued commands are dropped */const restored=await takeBackPrompts(sessionId);if(restored.length)onComposerRestore?.(restored.join('\n\n'));const dropped=queueSnapshot();await clearQueue();return dropped;}catch(error){queuePausedState=true;onError(error);throw error;}finally{cancelling=false;}},close(){if(closed)return;closed=true;developmentLog('controller.close',{sessionId:current,queueCount:queuedEntries.length},'info','tui-controller');descendants.stop();unsubscribe();}};
}
