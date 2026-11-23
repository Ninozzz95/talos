import type {PermissionMode} from '../args.ts';
import {withStartingMode} from './model-permission.ts';
import type {ReasoningEffort} from '../config/types.ts';
import {rememberSessionMode,sessionModeOf} from './session-modes.ts';
import {backgroundStopNotice} from '../headless/background.ts';
import {writeExitNotice} from '../provider/chatgpt-plan.ts';
import {renderPromptWithAttachments,validateCliAttachments,type CliAttachment,type CliImageAttachment} from './attachments.ts';
import type {CliRuntime,CliSessionSummary,RuntimeListOptions,RuntimeRestoreSelection,StartInput} from './types.ts';import {BACKGROUND_STOP_WAIT_MS,CliRuntimeError,type BackgroundStop} from './types.ts';import {normalizeSessionSummaries,type SessionSummaryEvidence} from './session-summary.ts';import {buildContextStatus,unavailableContextStatus} from './context-status.ts';import {kernelQueueOf} from './kernel-queue.ts';
type Registry={capacita?:Record<string,unknown>;/** C7b, the CLI's own */capacitaMacchinaCli?():Promise<unknown>;/** C7a, the CLI's own: favourites and recents */preferenzeModelliCli?(action?:unknown):Promise<{preferiti:string[];recenti:string[]}>;/** C4, the CLI's own (talos-composition.ts): the context service's routes */gestioneContesto?(input:{sessionId:string;method:string;path?:string;body?:unknown}):unknown;/** the CLI's own (talos-composition.ts): what the Context Engine cleared and shortened in the last request it prepared */contestoAlleggerito?(id:string):unknown;/** the kernel's lease (session-lease.mjs): before a write, `{stato:'nostra'|'altrove'|'spento'|'assente', messaggio?, detentore?}` */allineaSessione?(id:string,options?:{scrivere?:boolean}):Promise<any>;/** the kernel's record of the last request sent (L3-6), or null */leggiUltimaRichiesta?(id:string):unknown;provaModello?(model:string):Promise<any>|any;elimina?(id:string):Promise<any>|any;rispondiDomanda?(id:string,requestId:string,risposta:any):Promise<any>|any;rispondiPiano?(id:string,scelta:any):Promise<any>|any;rispondiElicitazioneMcp?(id:string,requestId:string,risposta:any):Promise<any>|any;ripristina?(options?:{soloSessioni?:readonly string[]}):Promise<any>|any;avviaLibero(input:any,origin?:any):any;aggiornaImpostazioni?(id:string,patch:any):any;resume?(id:string,prompt?:string|null,images?:unknown[],options?:{senzaInterfacciaNelGiro?:boolean;allegaSeTroppoGrande?:boolean}):any;forka?(id:string,options?:{primaDelGiro?:string;modelloRichiesta?:string;senzaInterfacciaNelGiro?:boolean}):any;staChiudendoIlGiro?(id:string):boolean;attendiFuoriDallaFinestra?(id:string):Promise<void>;accodaMessaggio?(id:string,prompt:string,images?:unknown[],options?:{allegaSeTroppoGrande?:boolean}):any;svuotaCoda?(id:string,options?:{id?:string|null}):any;reindirizza?(id:string,prompt:string,options?:{immagini?:unknown[]}):any;compatta?(id:string):any;statoContesto?(id:string):any;chiudiContesto?():Promise<void>|void;elenca?():any[];elencaFigli?(id:string):any;elencaProcessi?(id:string,options?:any):any;fermaComando?(id:string,toolCallId:string):unknown;iscriviti(id:string,sink:(e:unknown)=>void,from?:number,options?:{resultsForScreen?:boolean}):()=>void;rispondiApprovazione(id:string,requestId:string,approved:boolean,motivo?:string|{motivo:string}|{domandaModificata:string}|{ambito:'volta'}|{ambito:'strumento'}|{ambito:'risposta'}):any;ferma(id:string,options?:any):any;/** the kernel's «Stop everything»: a conversation with its whole tree, no wake on the stopped children */fermaTutto?(id:string,options?:{daChi?:string}):any;shell?(id:string,comando:string):any;esporta?(id:string):unknown;};
/** Tappa B2: where the facade reads the session list from when it can (the C4R index, by entry); `probe` throws when the index cannot be trusted at all. */
export type SessionListSource={probe():Promise<{rows:CliSessionSummary[];staleIds:string[];stamp:unknown}>;commit(stamp:unknown,rows:CliSessionSummary[]):Promise<unknown>};
/** `nobodyInFront`: nobody can answer in this process (`talos -p`, a command, the automations' host), said to the kernel on EVERY turn it starts or resumes (0.6.8, r4 f3d93b25c `senzaInterfacciaNelGiro`: per turn, never written to disk, so a `-p` conversation resumed on the screen gets its plan card and questions back; the screen says `false` explicitly) */
type SessionFacadeOptions={/** R2-F1 (cure 208 bis): read the folder's trust again before every person's send (runtime/folder-trust.ts) */beforePersonSend?:()=>Promise<unknown>;/** and its value now */folderTrust?:()=>boolean|null;model:string;origin?:string;nobodyInFront?:boolean;sessionList?:SessionListSource;modelImageCapability?:(model:string)=>boolean|null|Promise<boolean|null>;materializeImage?:(attachment:CliImageAttachment)=>Promise<unknown>};
/* Stage 3 (registro 12, measured by s41): plan mode is the kernel's operating mode too — only then does it offer present_plan. */
function registryOperatingMode(mode:PermissionMode):'piano'|'normale'{return mode==='plan'?'piano':'normale';}
/* F-P-001 (owner 09/10/2026 «Come Claude Code», «Valgono sempre»): every mode but plan is "On request", so every write and
   command reaches the CLI's engine, which applies the mode there: acceptEdits lets edits and filesystem commands go and asks
   the rest, Full access lets everything go. At "Workspace write" the kernel never asked: `echo x > f` ran unasked in
   acceptEdits, and a deny rule the person wrote did not hold in acceptEdits nor in Full access (measured on the 0.5.2 build). */
function registryPermission(mode:PermissionMode):string{return mode==='plan'?'Read only':'On request';}
/* Rule 17 measure (03/11/2026, built CLI): leaving TALOS while a delegated agent still worked left its request to the provider
   open, and the exit backstop ended the process two seconds later («held … TCPSocketWrap»). The exit hint promises the agents are
   stopped (interrupt.ts), so the last close stops every conversation still at work — a turn running, or agents under an answered
   chat (`discendentiAlLavoro`) — with its whole tree: the kernel's `fermaTutto`, which also keeps a parent from waking on its
   stopped children. A row rebuilt after a crash (`interrotta`) runs nothing here. A kernel without it stops each working row.
   A stop that fails never keeps TALOS. Hermes, run_agent.py `close()` → `_close_active_children(soft=False)`: the children are
   closed with their parent; Node's fetch ends its request, and frees the socket, when its AbortSignal fires. */
function stopWorkingConversations(registry:Registry,rows:readonly any[]):void{
  const working=(row:any)=>row?.conclusa!==true&&row?.interrotta!==true;
  for(const row of rows){
    if(typeof row?.sessionId!=='string')continue;
    try{
      if(typeof registry.fermaTutto==='function'){if(!row.padreId&&(working(row)||Number(row.discendentiAlLavoro)>0))registry.fermaTutto(row.sessionId,{daChi:'persona'});}
      else if(working(row))registry.ferma(row.sessionId,{daChi:'persona'});
    }catch{/* a stop that fails still lets TALOS end */}
  }
}
const KERNEL_PLAN_DECISIONS:Record<string,string>={'ask-before-edits':'procedi-con-conferma','accept-edits':'procedi-accetta-modifiche','clean-conversation':'conversazione-pulita','keep-planning':'continua-a-pianificare'};
export function createSessionFacade(registry:Registry,{beforePersonSend,folderTrust,model,origin='talos-cli',nobodyInFront=false,sessionList,modelImageCapability,materializeImage}:SessionFacadeOptions):CliRuntime{
 const cancelled=new Set<string>();let restored=false;let prepared=false;const familiesLoaded=new Set<string>();let defaultReasoningEffort:ReasoningEffort|null=null;
 /* Long-chat tappa B1 (owner 07/10 night, «prima la coda»): the facade asks the kernel for what it needs, not for the whole archive. No selection = every session
    (the list, «last»); a selection = those sessions' families (kernel `ripristina({soloSessioni})`, additive: an older kernel ignores it and restores all, which
    is still correct); `[]` = nothing, the start-up work still done - a new task needs no old session. Measured on a copy of the owner's real archive (43 journals,
    57 MB): a plain start was ~280 ms slower than with an empty profile. Codex resolves one rollout per thread id (thread_rollout_resolver.rs), Pi opens one file (SessionManager.open). */
 async function restore(selection?:RuntimeRestoreSelection){
  const partial=Array.isArray(selection?.sessionIds);
  /* a partial restore that brings nothing new (the whole archive is in memory, or these families already are) is not asked of the kernel */
  if(partial&&(restored||(selection!.sessionIds.length>0&&selection!.sessionIds.every(id=>familiesLoaded.has(id)))))return{restored:0,total:0,partial:true as const};
  /* The kernel's start-up work (recovery of process-output deletions) runs only while no session is in memory, so it must be the kernel's FIRST call: the empty
     selection loads nothing and does it. A named session or the list can come first (the index-backed list may load a few before the first start), hence once, before anything else. */
  if(!prepared&&!(partial&&selection!.sessionIds.length===0)&&typeof registry.ripristina==='function'){await registry.ripristina({soloSessioni:[]});prepared=true;}
  const x=typeof registry.ripristina==='function'?await registry.ripristina(partial?{soloSessioni:[...selection!.sessionIds]}:undefined):{};
  if(partial){prepared=true;for(const id of selection!.sessionIds)familiesLoaded.add(id);}else restored=true;
  return{restored:Number(x?.ripristinate??x?.restored??0),total:Number(x?.totali??x?.total??0),...(partial?{partial:true as const}:{})};
 }
 async function ensure(){if(!restored)await restore();}
 async function ensureNone(){if(!restored&&!prepared)await restore({sessionIds:[]});}
 async function ensureSession(sessionId:string){if(restored||familiesLoaded.has(sessionId))return;await restore({sessionIds:[sessionId]});}
/*
 * 14/10/2026, owner («Sì: il secondo viene rifiutato con una frase chiara»): two TALOS on one conversation. The kernel's lease
 * (session-lease.mjs, «Affitto come Hermes», on with `affittoFraProcessi` in talos-composition.ts) is taken at the first write
 * and released 30 s after the last; before each write here the CLI asks for it, so a conversation another TALOS is writing to
 * is refused with the kernel's sentence (who holds it, its pid, since when) and a stable code (SESSION_LEASED, exit 15), and a
 * holder that died is taken over at once. Hermes: hermes_cli/active_sessions.py, shared_session_attach.py.
 */
async function holdForWriting(sessionId:string){
  if(typeof registry.allineaSessione!=='function')return;
  let answer:any=null;try{answer=await registry.allineaSessione(sessionId,{scrivere:true});}catch{return;/* the lease failing never blocks (Hermes cli.py:933) */}
  if(answer?.stato==='altrove')throw new CliRuntimeError('SESSION_LEASED',typeof answer.messaggio==='string'&&answer.messaggio?answer.messaggio:'This conversation is open in another TALOS.',{holder:answer.detentore??null});
}
 /* g-q18/g-q19 (registro 12): between a turn's final event and its settling the kernel refuses fork and resume
    (REV-SESSION-READY); like its HTTP routes (`http-app.mjs:6069`, `:6109`) the facade waits for that window — milliseconds —
    and never for a turn still running, where the registry answers as always. */
 async function settled(sessionId:string){if(registry.staChiudendoIlGiro?.(sessionId)&&typeof registry.attendiFuoriDallaFinestra==='function')await registry.attendiFuoriDallaFinestra(sessionId);}
 function sessionRow(sessionId:string):any{let rows:any[]=[];try{rows=typeof registry.elenca==='function'?registry.elenca():[];}catch{rows=[];}return rows.find(candidate=>candidate?.sessionId===sessionId)??null;}
 function sessionModel(sessionId:string):string|null{const row=sessionRow(sessionId);return typeof row?.modello==='string'&&row.modello.trim()?row.modello.trim():null;}
 /* review B #4: the CLI reaches the kernel registry in-process, past http-app's modelloRichiestaValido (config.mjs — the
    single authority on model-id grammar), so a garbage id like "x y" would be persisted and poison every later turn with
    failures at provider-call time. This local check is a deliberate superset (no whitespace, no control characters);
    shapes stay the kernel's business. */
 function modelloAccettabile(model:string|null):boolean{
  if(model===null)return true;
  return /^[^\s\u0000-\u001f\u007f]+$/u.test(model);
 }
 async function prepare(prompt:string|undefined,runModel:string|null,attachments:readonly CliAttachment[]|undefined){
  const rows=validateCliAttachments(attachments);if(rows.length&&!String(prompt??'').trim())throw new CliRuntimeError('ATTACHMENT_PROMPT_REQUIRED','Attachments require a prompt.');
  const images=rows.filter((row):row is CliImageAttachment=>row.kind==='image');const stored:unknown[]=[];
  if(images.length){
   let capability:boolean|null=null;try{capability=runModel&&modelImageCapability?await modelImageCapability(runModel):null;}catch{capability=null;}
   if(capability!==true)throw new CliRuntimeError('MODEL_IMAGE_UNSUPPORTED','The selected model does not affirm image input support.',{model:runModel});
   if(!materializeImage)throw new CliRuntimeError('IMAGE_ATTACHMENT_UNAVAILABLE','Image attachment storage is unavailable.');
   for(const image of images){try{stored.push(await materializeImage(image));}catch(error){if(typeof (error as any)?.code==='string')throw error;throw new CliRuntimeError('IMAGE_ATTACHMENT_MATERIALIZE_FAILED','The image could not be stored safely.');}}
  }
  return{prompt:renderPromptWithAttachments(String(prompt??''),rows),images:stored};
 }
 async function contextStatus(sessionId:string){
  await ensureSession(sessionId);
  if(typeof registry.statoContesto!=='function')return unavailableContextStatus(sessionId,'runtime-unavailable');
  const raw=await registry.statoContesto(sessionId);
  if(raw?.unavailableReason)return unavailableContextStatus(sessionId,String(raw.unavailableReason));
  const rows=typeof registry.elenca==='function'?[...registry.elenca()]:[];
  const usage=normalizeSessionSummaries(rows).find(row=>row.id===sessionId||row.sessionId===sessionId)?.usage??null;
  /* owner 13/10/2026: what the last request was sent without. Review of the same day: read from the CLI's own record of what the
     engine prepared, not from the kernel's record of the last request sent (`leggiUltimaRichiesta`), which gives the counts to
     the first attempt only and so lost them whenever a request was sent again. In memory, never on disk. */
  let lightened:unknown=null;try{lightened=typeof registry.contestoAlleggerito==='function'?registry.contestoAlleggerito(sessionId):null;}catch{lightened=null;}
  /* 14/10/2026 (owner, «/context con il dettaglio»): the breakdown of the last request sent, by category (the kernel's, in memory) */
  let lastRequest:unknown=null;try{lastRequest=typeof registry.leggiUltimaRichiesta==='function'?registry.leggiUltimaRichiesta(sessionId):null;}catch{lastRequest=null;}
  return buildContextStatus({sessionId,snapshot:raw,sessionUsage:usage,lightened,lastRequest});
 }
 /* R2-F1: a source that fails never stops the send (the cache counts it as not trusted) */
 const personSends=async()=>{if(beforePersonSend)try{await beforePersonSend();}catch{/* see folder-trust.ts */}};
 async function start(input:StartInput){await ensureNone();await personSends();const prepared=await prepare(input.prompt,input.model||model,input.attachments);const reasoningEffort=input.reasoningEffort??defaultReasoningEffort;const x=withStartingMode(input.permissionMode,()=>registry.avviaLibero({cartellaLibera:input.projectRoot,consegna:prepared.prompt,modello:input.model||model,permessi:registryPermission(input.permissionMode),modalitaOperativa:registryOperatingMode(input.permissionMode),...(reasoningEffort?{reasoning:{effort:reasoningEffort}}:{}),...(prepared.images.length?{immagini:prepared.images}:{}),...(input.operationId?{operationId:input.operationId}:{}),senzaInterfacciaNelGiro:nobodyInFront,/* 0.6.13 (contract (b) with the Desktop, 22/10/2026): the run option that sends a request too large for the model as an attachment */...(input.attachIfTooLarge===true?{allegaSeTroppoGrande:true}:{})}, {kind:origin}));if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'RUNTIME_START_FAILED',x.erroreAvvio);if(typeof x?.sessionId!=='string')throw new CliRuntimeError('RUNTIME_START_FAILED');cancelled.delete(x.sessionId);rememberSessionMode(x.sessionId,input.permissionMode);return x.sessionId;}
 async function setPermissionMode(sessionId:string,mode:PermissionMode){rememberSessionMode(sessionId,mode);
  await ensureSession(sessionId);
  if(typeof registry.aggiornaImpostazioni!=='function')throw new CliRuntimeError('SESSION_SETTINGS_UNAVAILABLE');
  /* g-q19 (registro 12): the kernel refuses a change of operating mode while a turn runs (a fork starts one at once), so
     the operating mode travels only when it changes — read from the kernel, which may have switched it itself — as
     Codex's `OverrideTurnContext` leaves an absent field unchanged. */
  const operating=registryOperatingMode(mode),current=sessionRow(sessionId)?.modalitaOperativa;
  const permessi=registryPermission(mode),withOperating=current!==operating;
  await holdForWriting(sessionId);
  let answer=await registry.aggiornaImpostazioni(sessionId,{permessi,...(withOperating?{modalitaOperativa:operating}:{})});
  /* Owner 08/10/2026 («cambino istantaneamente … anche se vengono applicati dal turno dopo, come fa Claude Code»): the kernel
     refuses its operating mode while a turn runs (`mode-change-while-running`) but takes the permission. The permission goes
     now; the caller sends the mode again when the turn ends (session-controller.ts). Any other refusal stays an error. */
  let operatingModeDeferred=false;
  if(withOperating&&answer?.code==='SESSION_NOT_READY'&&answer?.reason==='mode-change-while-running'){
    answer=await registry.aggiornaImpostazioni(sessionId,{permessi});
    operatingModeDeferred=answer?.ok===true;
  }
  if(answer?.erroreAvvio)throw new CliRuntimeError(answer.code??'SESSION_SETTINGS_FAILED',answer.erroreAvvio);
  if(answer?.ok!==true)throw new CliRuntimeError('SESSION_SETTINGS_FAILED');
  return{operatingModeDeferred};
 }

 /* What the kernel holds in memory, as summaries: the rows of every loaded session with the children's and approvals' evidence. */
 async function loadedSummaries():Promise<CliSessionSummary[]>{
  const rows=typeof registry.elenca==='function'?[...registry.elenca()]:[];
  const evidence=new Map<string,SessionSummaryEvidence>();
  if(typeof registry.elencaFigli==='function'){
    const parentIds=[...new Set(rows.map((row:any)=>typeof row?.padreId==='string'&&row.padreId.trim()?row.padreId:null).filter((value):value is string=>value!==null))];
    for(const parentId of parentIds){
      let result:any=null;try{result=registry.elencaFigli(parentId);}catch{result=null;}
      for(const child of Array.isArray(result?.figli)?result.figli:[]){
        const childId=typeof child?.sessionId==='string'?child.sessionId:null;if(!childId)continue;
        evidence.set(childId,{...(evidence.get(childId)??{}),child});
      }
    }
  }
  if(typeof registry.elencaProcessi==='function'){
    for(const row of rows){
      if(row?.inAttesaApprovazione!==true||typeof row?.sessionId!=='string')continue;
      let result:any=null;try{result=registry.elencaProcessi(row.sessionId);}catch{result=null;}
      const signal=Array.isArray(result?.guardia?.segnalazioni)?result.guardia.segnalazioni.find((entry:any)=>entry?.soggetto==='approvazione'):null;
      const approval=signal?{requestId:signal.requestId,waitingMs:signal.fermoDaMs}:null;
      if(approval)evidence.set(row.sessionId,{...(evidence.get(row.sessionId)??{}),approval});
    }
  }
  return normalizeSessionSummaries(rows,evidence);
 }
 /* Long-chat tappa B2 (owner 07/10 night): the whole list, served from the C4R index BY ENTRY when a source is given. A fresh row costs nothing; the stale or
    new journals are restored - their families, through the kernel option of tappa B1 - and recomputed; sessions already in memory answer with their live row;
    the merged list is written back, anchored to the stamp taken BEFORE the restore. Any trouble with the index is the old way: restore everything. After a FULL
    restore the live list is complete and is returned as is (nothing anchors a stamp to rows computed earlier, so it is not written back either). */
 async function listSummaries(options?:RuntimeListOptions):Promise<CliSessionSummary[]>{
  if(options?.scope==='loaded')return loadedSummaries();
  if(!sessionList||restored){await ensure();return loadedSummaries();}
  let probe:Awaited<ReturnType<SessionListSource['probe']>>|null=null;
  try{probe=await sessionList.probe();}catch{probe=null;}
  if(!probe){await ensure();return loadedSummaries();}
  if(probe.staleIds.length>0)await restore({sessionIds:probe.staleIds}); /* restore() itself skips what is already in memory */
  const byId=new Map<string,CliSessionSummary>();
  for(const row of probe.rows)byId.set(row.id,row);
  for(const row of await loadedSummaries())byId.set(row.id,row);
  const merged=[...byId.values()].sort((a,b)=>{
    if(a.startedAt===b.startedAt)return 0;
    if(a.startedAt===null)return-1;
    if(b.startedAt===null)return 1;
    return a.startedAt.localeCompare(b.startedAt);
  });
  if(probe.staleIds.length>0){try{await sessionList.commit(probe.stamp,merged);}catch{/* a failed write-back never fails the list: the next one recomputes */}}
  return merged;
 }
 async function contextManager(sessionId:string,request:{method:string;path?:string;body?:unknown}){await ensureSession(sessionId);return (await registry.gestioneContesto?.({sessionId,...request}))??null;}
 async function modelPreferences(action?:unknown){return (await registry.preferenzeModelliCli?.(action))??null;}
 /* C8: the tools the last request carried, kept by the kernel in memory (leggiUltimaRichiesta); null before the first one */
 async function requestTools(sessionId:string){try{const last=(registry as {leggiUltimaRichiesta?:(id:string)=>{tools?:unknown[]}|null|undefined}).leggiUltimaRichiesta?.(sessionId);return Array.isArray(last?.tools)?last!.tools:null;}catch{return null;}}
 async function machineCapacity(){return (await registry.capacitaMacchinaCli?.())??null;}
 /* the Context Manager's «Request sent»: the same record, its messages (the kernel already left the images out) and how many tools */
 async function requestSent(sessionId:string){try{const last=(registry as {leggiUltimaRichiesta?:(id:string)=>any}).leggiUltimaRichiesta?.(sessionId);if(!last||!Array.isArray(last.messages))return null;
  return{at:typeof last.at==='string'?last.at:typeof last.at==='number'?new Date(last.at).toISOString():null,model:typeof last.model==='string'?last.model:null,messages:last.messages as unknown[],tools:Array.isArray(last.tools)?last.tools.length:0};}catch{return null;}}
 /* C12d: the process ledger of every conversation this window has in memory (the kernel's `elencaProcessi`, a read), newest first */
 async function processes(){
  if(typeof registry.elencaProcessi!=='function')return[];
  const out:any[]=[];
  for(const row of await loadedSummaries()){
   let ledger:any=null;try{ledger=registry.elencaProcessi(row.id);}catch{ledger=null;}
   for(const p of Array.isArray(ledger?.processi)?ledger.processi:[]){
    if(typeof p?.toolCallId!=='string')continue;
    out.push({sessionId:row.id,sessionTitle:row.name??null,toolCallId:p.toolCallId,command:typeof p.comando==='string'?p.comando:null,description:typeof p.descrizione==='string'?p.descrizione:null,origin:typeof p.origine==='string'?p.origine:null,
     startedAt:typeof p.inizio==='string'?p.inizio:null,durationMs:Number.isFinite(p.durataMs)?p.durataMs:null,runningForMs:Number.isFinite(p.inCorsoDaMs)?p.inCorsoDaMs:null,outcome:String(p.esito??'senza-esito'),
     exitCode:Number.isSafeInteger(p.codiceUscita)?p.codiceUscita:null,background:p.inSfondo===true,outputFile:typeof p.fileSfondo==='string'?p.fileSfondo:null});
   }
  }
  return out.sort((a,b)=>String(b.startedAt??'').localeCompare(String(a.startedAt??'')));
 }
 /* C12d: the kernel's own stop of one command; a command that already finished answers «not running», never an error (Mobile 01/11) */
 async function stopProcess(sessionId:string,toolCallId:string){
  if(typeof registry.fermaComando!=='function')return 'unknown' as const;
  let answer:unknown;try{answer=registry.fermaComando(sessionId,toolCallId);}catch{answer=undefined;}
  return answer==='fermato'?'stopped' as const:answer==='non-in-corso'?'not-running' as const:'unknown' as const;
 }
 return{...(folderTrust?{folderTrust}:{}),requestTools,requestSent,processes,stopProcess,contextManager,machineCapacity,modelPreferences,restore,start,setPermissionMode,setDefaultReasoningEffort(effort){defaultReasoningEffort=effort;},async setReasoningEffort(sessionId,effort){await ensureSession(sessionId);if(typeof registry.aggiornaImpostazioni!=='function')throw new CliRuntimeError('SESSION_SETTINGS_UNAVAILABLE');await holdForWriting(sessionId);const x=await registry.aggiornaImpostazioni(sessionId,{reasoning:{effort}});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_SETTINGS_FAILED',x.erroreAvvio);if(x?.ok!==true)throw new CliRuntimeError('SESSION_SETTINGS_FAILED');},async setSessionModel(sessionId,model){await ensureSession(sessionId);const next=typeof model==='string'?model.trim():'';if(!next)throw new CliRuntimeError('MODEL_REQUIRED');if(!modelloAccettabile(next))throw new CliRuntimeError('MODEL_INVALID',`The model id "${next}" is not a valid model id: it must not contain spaces or control characters.`,{model:next});if(typeof registry.aggiornaImpostazioni!=='function')throw new CliRuntimeError('SESSION_SETTINGS_UNAVAILABLE');await holdForWriting(sessionId);const x=await registry.aggiornaImpostazioni(sessionId,{modello:next});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_SETTINGS_FAILED',x.erroreAvvio);if(x?.ok!==true)throw new CliRuntimeError('SESSION_SETTINGS_FAILED');},async resume(sessionId,prompt,attachments,options){await ensureSession(sessionId);await personSends();if(typeof registry.resume!=='function')throw new CliRuntimeError('SESSION_RESUME_UNAVAILABLE');/* RICERCA 5×5×5×5 cambio-modello (dossier §5.1-5.3): an explicit --model wins over the session's saved model (precedence flag > saved, like Codex ResumeModelSettings and Claude Code doc :141) and persists on the kernel's sanctioned channel aggiornaImpostazioni{modello} (key admitted session-registry.mjs:7882, durable record :7936-7938); the resumed run reads voceEsistente.modello (:7853), so persisting first is what makes the run use it. Persist-first is declared behaviour (review B #3): the saved model is durable before the run starts, so a run the kernel refuses (closing window, turn in flight) still leaves the model changed; only prepare — attachments and the image capability — runs before the persist, so an unsupported model fails there and the saved model stays untouched. */const overrideModel=typeof options?.model==='string'&&options.model.trim()?options.model.trim():null;if(overrideModel&&!modelloAccettabile(overrideModel))throw new CliRuntimeError('MODEL_INVALID',`The model id "${overrideModel}" is not a valid model id: it must not contain spaces or control characters.`,{model:overrideModel});const prepared=await prepare(prompt,overrideModel??sessionModel(sessionId),attachments);await settled(sessionId);/* 0.6.6 (the live trial of the ChatGPT plan's cache, 15/10/2026): the same model the session already has is NOT written again — writing it rebuilt the head of the conversation, and every resume with --model (the stress test's own loop) paid the whole prefix: 0 cached tokens with --model, 9.728 without. 0.6.7 (sixth review of 0.6.6, N1): the lease is taken BEFORE the comparison — taking it may reload the session from disk, and a model another TALOS just saved must be the one compared with --model */await holdForWriting(sessionId);if(overrideModel&&overrideModel!==sessionModel(sessionId)){if(typeof registry.aggiornaImpostazioni!=='function')throw new CliRuntimeError('SESSION_SETTINGS_UNAVAILABLE');const risposta=await registry.aggiornaImpostazioni(sessionId,{modello:overrideModel});if(risposta?.erroreAvvio)throw new CliRuntimeError(risposta.code??'SESSION_SETTINGS_FAILED',risposta.erroreAvvio);if(risposta?.ok!==true)throw new CliRuntimeError('SESSION_SETTINGS_FAILED');}await holdForWriting(sessionId);const x=registry.resume(sessionId,prepared.prompt.trim()||null,prepared.images,{senzaInterfacciaNelGiro:nobodyInFront,/* 0.6.13 contract (b): this turn only, never saved */...(options?.attachIfTooLarge===true?{allegaSeTroppoGrande:true}:{})});/* Decision 198 (owner 04/11/2026): a resume with nothing in it after a finished turn is refused by the kernel with its reason
   (`SESSION_NOT_READY` / `nothing-to-resume`, CLI condition 1 of the form); it reads as what happened, never «busy saving, try again». */if(x?.code==='SESSION_NOT_READY'&&x?.reason==='nothing-to-resume')throw new CliRuntimeError('NOTHING_TO_RESUME',x.erroreAvvio,{reason:x.reason});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_RESUME_FAILED',x.erroreAvvio,x.reason?{reason:x.reason}:{});if(typeof x?.sessionId!=='string')throw new CliRuntimeError('SESSION_RESUME_FAILED');cancelled.delete(x.sessionId);return x.sessionId;},async fork(sessionId,prompt,attachments,options){await ensureSession(sessionId);await personSends();if(typeof registry.forka!=='function')throw new CliRuntimeError('SESSION_FORK_UNAVAILABLE');/* RICERCA 5×5×5×5 (dossier §5.1) + revisione fase B (06/10/2026): the explicit --model travels in forka's options as
   `modelloRichiesta` — the kernel reads that key (session-registry.mjs:7576) and applies it to the CHILD only (:7656,
   `originale.modello` otherwise); the parent keeps its own. The first draft passed `{modello}`: the kernel destructures
   `{primaDelGiro, modelloRichiesta}`, so the flag died silently at this seam and the child inherited the parent's model
   (revisione fase B: BOCCIATO). */const overrideModel=typeof options?.model==='string'&&options.model.trim()?options.model.trim():null;if(overrideModel&&!modelloAccettabile(overrideModel))throw new CliRuntimeError('MODEL_INVALID',`The model id "${overrideModel}" is not a valid model id: it must not contain spaces or control characters.`,{model:overrideModel});const prepared=await prepare(prompt,overrideModel??sessionModel(sessionId),attachments);await settled(sessionId);const x=withStartingMode(sessionModeOf(sessionId),()=>registry.forka!(sessionId,{...(overrideModel?{modelloRichiesta:overrideModel}:{}),/* 0.6.8 (second review, finding 3): the forked turn too */senzaInterfacciaNelGiro:nobodyInFront}));if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_FORK_FAILED',x.erroreAvvio);if(typeof x?.sessionId!=='string')throw new CliRuntimeError('SESSION_FORK_FAILED');if(prepared.prompt.trim()){if(typeof registry.accodaMessaggio!=='function')throw new CliRuntimeError('SESSION_QUEUE_UNAVAILABLE');const q=registry.accodaMessaggio(x.sessionId,prepared.prompt.trim(),prepared.images);if(q?.erroreAvvio)throw new CliRuntimeError(q.code??'SESSION_QUEUE_FAILED',q.erroreAvvio);}return x.sessionId;},async queueMessage(sessionId,prompt,attachments,options){await ensureSession(sessionId);await personSends();if(typeof registry.accodaMessaggio!=='function')throw new CliRuntimeError('SESSION_QUEUE_UNAVAILABLE');const text=String(prompt??'').trim();if(!text)throw new CliRuntimeError('QUEUE_TEXT_REQUIRED');const prepared=await prepare(text,sessionModel(sessionId),attachments);await holdForWriting(sessionId);/* review 9 F7 of 0.6.13: the kernel queue takes the attachment option per message (session-registry.mjs `accodaMessaggio`) */const x=options?.attachIfTooLarge?registry.accodaMessaggio(sessionId,prepared.prompt.trim(),prepared.images,{allegaSeTroppoGrande:true}):registry.accodaMessaggio(sessionId,prepared.prompt.trim(),prepared.images);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_QUEUE_FAILED',x.erroreAvvio);if(x?.ok!==true)throw new CliRuntimeError('SESSION_QUEUE_FAILED');return kernelQueueOf(x.coda);},async unqueueMessage(sessionId,id){await ensureSession(sessionId);if(typeof registry.svuotaCoda!=='function')throw new CliRuntimeError('SESSION_QUEUE_UNAVAILABLE');await holdForWriting(sessionId);const x=registry.svuotaCoda(sessionId,{id});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_QUEUE_FAILED',x.erroreAvvio);return x?.rimosso===true;},async steer(sessionId,prompt,attachments){await ensureSession(sessionId);await personSends();if(typeof registry.reindirizza!=='function')throw new CliRuntimeError('SESSION_STEER_UNAVAILABLE','Steering is unavailable for this runtime.');const text=String(prompt??'').trim();if(!text)throw new CliRuntimeError('STEER_TEXT_REQUIRED','Steering text is required.');const prepared=await prepare(text,sessionModel(sessionId),attachments);await holdForWriting(sessionId);const x=registry.reindirizza(sessionId,prepared.prompt.trim(),prepared.images.length?{immagini:prepared.images}:{});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_STEER_REJECTED',x.erroreAvvio);if(x?.ok!==true||typeof x?.redirectId!=='string'||!x.redirectId)throw new CliRuntimeError('SESSION_STEER_REJECTED','The runtime did not accept the steering request.');return{redirectId:x.redirectId};},async compact(sessionId){await ensureSession(sessionId);if(typeof registry.compatta!=='function')throw new CliRuntimeError('SESSION_COMPACT_UNAVAILABLE');await holdForWriting(sessionId);const x=await registry.compatta(sessionId);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_COMPACT_FAILED',x.erroreAvvio);return x;},contextStatus,async listSessions(options?:RuntimeListOptions){return listSummaries(options);}
 ,subscribe:(id,sink,from=0,options)=>registry.iscriviti(id,sink,from,options),async answerQuestion(id,rid,response){/* stage 3: as answerApproval; the kernel validates the contract */if(typeof registry.rispondiDomanda!=='function')throw new CliRuntimeError('REGISTRY_METHOD_UNAVAILABLE');const x=await registry.rispondiDomanda(id,rid,{requestId:rid,...response});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'QUESTION_ANSWER_FAILED',x.erroreAvvio);},async answerPlan(id,choice){/* stage 3: the CLI's English decision in the kernel's words (plan-contract.mjs DECISIONI_PIANO), only here */const decisione=KERNEL_PLAN_DECISIONS[choice.decision];if(!decisione)throw new CliRuntimeError('PLAN_DECISION_INVALID');if(typeof registry.rispondiPiano!=='function')throw new CliRuntimeError('REGISTRY_METHOD_UNAVAILABLE');const x=await registry.rispondiPiano(id,{requestId:choice.requestId,hash:choice.hash,decisione,...(choice.feedback?{feedback:choice.feedback}:{})});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'PLAN_ANSWER_FAILED',x.erroreAvvio);
  /* F-P-001: the kernel puts itself at "Workspace write" after «accept edits» (plan-contract.mjs PERMESSI_DOPO_IL_PIANO), where it
     never asks; the CLI's acceptEdits is "On request", sent before the model's next call can bring a command. */
  if(choice.decision==='accept-edits')await setPermissionMode(id,'acceptEdits');else if(choice.decision==='ask-before-edits')rememberSessionMode(id,'default');},async answerElicitation(id,rid,response){/* stage 3: the kernel validates the content against the server's schema */if(typeof registry.rispondiElicitazioneMcp!=='function')throw new CliRuntimeError('REGISTRY_METHOD_UNAVAILABLE');const x=await registry.rispondiElicitazioneMcp(id,rid,response);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'ELICITATION_ANSWER_FAILED',x.erroreAvvio);},async answerApproval(id,rid,approved,reason){const x=reason===undefined?await registry.rispondiApprovazione(id,rid,approved):await registry.rispondiApprovazione(id,rid,approved,reason);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'APPROVAL_FAILED',x.erroreAvvio);},capabilities(){return{forkBeforeRun:registry.capacita?.forkPrimaDelGiro===true,modelCheck:registry.capacita?.provaModello===true};},async checkModel(model){/* stage 7.10d: one token from the chosen model, nothing kept (desktop `provaModello`, asked 03/10) */if(registry.capacita?.provaModello!==true||typeof registry.provaModello!=='function')throw new CliRuntimeError('MODEL_CHECK_UNAVAILABLE');const x=await registry.provaModello(model);const time=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;if(x?.esito==='risponde')return{answers:true,firstTokenMs:time(x.millisecondiPrimoToken),ms:time(x.millisecondi)};return{answers:false,firstTokenMs:null,ms:time(x?.millisecondi),code:String(x?.codice??x?.code??'MODEL_CHECK_FAILED'),...(typeof x?.motivo==='string'?{reason:x.motivo}:{})};},async forkBeforeRun(id,runId){/* stages 7.6/7.8 (desktop 88c68695c): the kernel cuts just before the turn and starts nothing; its `taglio` says the cut happened */if(registry.capacita?.forkPrimaDelGiro!==true||typeof registry.forka!=='function')throw new CliRuntimeError('FORK_CUT_UNAVAILABLE');const x=await registry.forka(id,{primaDelGiro:runId,senzaInterfacciaNelGiro:nobodyInFront});if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'FORK_FAILED',x.erroreAvvio,typeof x.motivo==='string'?{motivo:x.motivo}:{});const cut=x?.taglio;if(typeof x?.sessionId!=='string'||!cut||cut.primaDelGiro!==runId)throw new CliRuntimeError('FORK_CUT_UNCONFIRMED');return{sessionId:x.sessionId,message:typeof cut.messaggio==='string'?cut.messaggio:'',...(Array.isArray(cut.allegati)&&cut.allegati.length?{attachments:cut.allegati}:{})};},async deleteSession(id){/* stage 7.5 (/resume «d delete»): the kernel's own deletion; its refusal keeps its code */if(typeof registry.elimina!=='function')throw new CliRuntimeError('SESSION_DELETE_UNAVAILABLE');await ensureSession(id);await holdForWriting(id);const x=await registry.elimina(id);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_DELETE_FAILED',x.erroreAvvio);if(x?.ok!==true)throw new CliRuntimeError('SESSION_DELETE_FAILED');},async cancel(id,options){if(cancelled.has(id))return;cancelled.add(id);const ok=options?.by==='system'?await registry.ferma(id,{daChi:'sistema'}):await registry.ferma(id);if(ok===false)throw new CliRuntimeError('SESSION_NOT_FOUND');},async shell(sessionId,command){await ensureSession(sessionId);const text=String(command??'').trim();if(!text)throw new CliRuntimeError('SHELL_COMMAND_REQUIRED','A command is required');if(typeof registry.shell!=='function')throw new CliRuntimeError('SESSION_SHELL_UNAVAILABLE');await holdForWriting(sessionId);const x=await registry.shell(sessionId,text);if(x?.erroreAvvio)throw new CliRuntimeError(x.code??'SESSION_SHELL_FAILED',x.erroreAvvio);if(x?.ok!==true)throw new CliRuntimeError('SESSION_SHELL_FAILED');},async stopBackgroundCommands(sessionIds,options){
  /* F-ENG-2 (rc.1 stress smoke, 08/10/2026; owner «Fermarli e dirlo nel risultato»): the kernel's process ledger says which rows went to the background;
     `fermaComando` stops each one. Since A6-bis R2 (desktop cb6224e48) a backgrounded command stays registered until its REAL exit, so a later ask that
     answers anything but 'fermato' means the process is gone — asking again is harmless, the abort is idempotent. A row the ledger shows in the background
     but this process does not run (a resumed session) answers 'non-in-corso' at once and is not listed: nothing here stopped it. */
  if(typeof registry.elencaProcessi!=='function'||typeof registry.fermaComando!=='function')return[];
  const ask=(stop:{sessionId:string;toolCallId:string}):unknown=>{try{return registry.fermaComando!(stop.sessionId,stop.toolCallId);}catch{return undefined;}};
  const stops:BackgroundStop[]=[];
  for(const sessionId of new Set(sessionIds)){
    let ledger:any=null;try{ledger=registry.elencaProcessi(sessionId);}catch{ledger=null;}
    for(const row of Array.isArray(ledger?.processi)?ledger.processi:[]){
      if(row?.inSfondo!==true||typeof row.toolCallId!=='string')continue;
      if(ask({sessionId,toolCallId:row.toolCallId})!=='fermato')continue;
      stops.push({sessionId,toolCallId:row.toolCallId,command:typeof row.comando==='string'?row.comando:null,outputFile:typeof row.fileSfondo==='string'?row.fileSfondo:null,exited:false});
    }
  }
  const deadline=Date.now()+(options?.waitMs??BACKGROUND_STOP_WAIT_MS);
  for(;;){
    for(const stop of stops){if(stop.exited)continue;const answer=ask(stop);if(answer!=='fermato'&&answer!==undefined)stop.exited=true;}
    if(stops.every(stop=>stop.exited)||Date.now()>=deadline)return stops;
    await new Promise(done=>setTimeout(done,options?.pollMs??50));
  }
 },backgroundCommandCount(sessionId:string){
  /* FE-048: what leaving this folder would stop, read from the same ledger */
  if(typeof registry.elencaProcessi!=='function')return 0;
  let ledger:any=null;try{ledger=registry.elencaProcessi(sessionId);}catch{ledger=null;}
  return(Array.isArray(ledger?.processi)?ledger.processi:[]).filter((row:any)=>row?.inSfondo===true).length;
 },export:(id)=>registry.esporta?.(id)??null,async close(input?:{replacing?:boolean}){
  /* Acceptance s68 (b), 14/10/2026: a command still in the background (a464f3336) when the screen left held TALOS until the exit
     backstop cut it (its process and pipes). The runtime's last close stops the background commands of every session in memory,
     bounded, and says which — as `talos -p` does (F-ENG-2). A replacement's close stops nothing: the conversation goes on. */
  if(input?.replacing!==true&&typeof registry.elenca==='function'){
    let rows:any[]=[];try{rows=[...registry.elenca()];}catch{rows=[];}
    stopWorkingConversations(registry,rows);
    const ids:string[]=rows.map((row:any)=>row?.sessionId).filter((id:unknown):id is string=>typeof id==='string');
    let stops:BackgroundStop[]=[];
    if(ids.length)try{stops=await (this as CliRuntime).stopBackgroundCommands!(ids,{waitMs:BACKGROUND_STOP_WAIT_MS});}catch{stops=[];}
    if(stops.length)writeExitNotice(`${backgroundStopNotice(stops)}\n`);
    /* Review 3 of 0.6.13 (S4, 22/10/2026): the registry's own close was never called, so a summary still on its way after the
       exit's bounded wait (talos-composition.ts) was not stopped and the exit backstop cut it two seconds later. `chiudi` stops it,
       ends the registry's own background work (searches, the Linux home, goal checks) and flushes its writes, bounded here by the
       same two seconds the backstop allows (the server waits up to 10 s, Hermes `gateway/run.py` «Up to 10s for SIGTERM»). */
    try{await (registry as any).chiudi?.({attesaMassimaMs:2_000});}catch{/* a close that fails still lets TALOS end */}
  }
  await registry.chiudiContesto?.();
 }};
}
