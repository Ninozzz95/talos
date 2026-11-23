/*
 * R5a lane R, S3/S4 — owner decisions Q-R5-4 and Q-R5-6 (2026-09-24): the facts the kernel does not publish, observed by the
 * CLI around each model run and handed to the screen and to protocol v2 as transient CLI events.
 *
 * A CLI event is an AG-UI `CUSTOM` row named `talos.cli.*` (the kernel's own CUSTOM rows are `talos.context`,
 * `consumo-fornitore`, `cambio-fornitore`): protocol v1 maps no CUSTOM row (events/bridge.ts MAP), so v1 stays byte-frozen
 * (gate E3); the v2 bridge turns them into `provider.attempt` / `context.compacted` and folds `provider.failure` into the
 * next `run.failed`. They carry no `_sequenza`: they are live facts, never replayed, never persisted.
 *
 * What is observed, and where:
 * - each retry WAIT, from the kernel's own report (G02: `onGiro` `provider-retry`, the unified kernel's contract; the
 *   owner's R5a amendment `onRetryWait` is gone): attempt, status, the wait the provider asked for and the wait actually
 *   taken, so the screen can count down a known wait;
 * - the failure that ends a run: the HTTP status the kernel keeps on the thrown error (`stato`, talosHarness.mjs
 *   `chiamaConRitentaBase`, and `erroreFornitorePubblico` in runtime-owner-adapter.mjs), which agent-service.mjs:1991 drops
 *   when it writes `RunError{message, code}`; and the provider's requested wait, read by this module's fetch observer,
 *   because the multi-provider wrapper rebuilds the error without it. With the status, 401 and 403 get their own words;
 * - the kernel's own compaction (in 0.6.12 the bare kernel's, every 8 model calls once the estimate passed 2,000 tokens; since
 *   0.6.13 the desktop adapter's, named from its `onGiro` report: `onCompaction` below),
 *   which emits no event and was NOT approved as a kernel change: it is recognised at the network boundary the CLI already
 *   owns, by the kernel's two fixed texts — the English summary request it appends (`RICHIESTA_DI_RIASSUNTO`, first line)
 *   and the marker it puts in place of the history (`[conversazione compattata al giro …`). Both are pinned against the
 *   kernel source by r5a-r-provider-attempts.test.ts, so a reworded kernel turns a test red instead of going silent.
 */
import {t,type MessageId} from '../i18n/index.ts';
export const CLI_EVENT=Object.freeze({
  attempt:'talos.cli.provider.attempt',
  failure:'talos.cli.provider.failure',
  compacted:'talos.cli.context.compacted',
  /* R5b (R5a open 2): one Context Engine summary requested; whether it was accepted is the engine's committed version. */
  summaryRequested:'talos.cli.context.summary-requested',
  /* D1: a CLI notice for the person (English, one sentence), shown as a warning line */
  notice:'talos.cli.notice',
  /* 0.6.13 (kernel a2739656d): a compaction this turn named was annulled because the turn failed (`{at, reason:'turn-failed'}`) */
  compactionUndone:'talos.cli.context.compaction-undone',
} as const);
/** The owner's cap (Q-R5-6): a provider's requested wait is honoured up to 60 s; a longer one ends the retries. */
export const RETRY_AFTER_MAX_MS=60_000;
/** The kernel's summary request (talosHarness.mjs `RICHIESTA_DI_RIASSUNTO`), its first words; pinned by test. */
export const KERNEL_SUMMARY_REQUEST_START='Before continuing, summarize your progress on this task so far';
/** The kernel's replacement for a compacted history (talosHarness.mjs `compattaConversazione`); pinned by test. */
export const KERNEL_COMPACTED_MARKER_START='[conversazione compattata al giro ';
/* K3 (desktop 03/10): every form the kernel writes or wrote — the manual marker and the automatic one
   (compattazione-desktop.mjs `MARCATORE_RIASSUNTO`), in Italian (saved sessions) and in English (from K3) */
export const KERNEL_COMPACTED_MARKER_STARTS=Object.freeze([KERNEL_COMPACTED_MARKER_START,'[conversation compacted at turn ','[conversazione compattata: ','[conversation compacted: ']);

/* 0.6.6 (owner 14/10: «è in grigio, non è molto evidente»): `planLimit` marks the wait for a ChatGPT plan's usage limit (the
   kernel's `motivo:'limite-del-piano'`), `resumesAt` the clock time the kernel will try again (its `retryAt`); the failure
   that ends a run on that limit carries when the plan's window comes back (`resetsAt`), read from the service's own headers. */
export type ProviderAttemptFact={attempt:number;maxAttempts:number;status:number|null;retryAfterMs:number|null;waitMs:number|null;planLimit?:true;resumesAt?:number|null};
export type ProviderFailureFact={status:number|null;retryAfterMs:number|null;resetsAt?:number|null};
/* `method` (0.6.13 review 9 F5, additive): `tool-results` when the kernel only shortened older tool results, with no summary; absent
   for a summary, as before */
export type CompactionFact={engine:'kernel'|'context-engine';messagesSummarized:number|null;tokensBefore:number|null;tokensAfter:number|null;trigger?:'automatic'|'manual';method?:'tool-results'|'images'|'without-model';imagesReplaced?:number;fallbackReason?:CompactionFallbackReason;
  /* review 10 R10-9 (additive): the compaction started because the provider refused the request as too long (`compattazione-inizio`
     `motivo:'overflow'`), not at the automatic threshold */
  afterRefusal?:true;
  /* 0.6.14 (additive): the kernel compacted at its EMERGENCY line (`motivo:'emergenza'`), not at the normal one */
  emergency?:true;
  /* judge v1541, cured by v1579 and v1597 (additive): the emergency line the KERNEL wrote, as it wrote it — its `compattazione-inizio`
     `soglia` at the emergency, or the optional `soglia` of an instant end row; absent when the kernel wrote none, never computed here */
  emergencyThreshold?:number;
  /* judge v1597 (additive): neither the row nor its start says why the kernel compacted, so the screen names no rule and no number */
  causeUnknown?:true;
  /* the record's identity (ISO time), so a later annulment of the same compaction can take its line back */
  at?:string};
const ISO_TIME=/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u;
/* Z piece C (r4 7ea1e0dc4, 23/10/2026): a summary written by TALOS's own code, not by a model (`ripiego:true`), carries the kernel's
   reason in one word (desktop-hotfix `ragione`): `bersaglio` (the provider said the request did not fit, so it shrinks to a target at
   once), `freno` (paid automatic summaries are paused), and the L1 reasons `tempo` · `saltato` · `esaurito` · `rifiutato` */
export type CompactionFallbackReason='target'|'brake'|'time'|'skipped'|'exhausted'|'refused';
const FALLBACK_REASONS:Readonly<Record<string,CompactionFallbackReason>>={bersaglio:'target',freno:'brake',tempo:'time',saltato:'skipped',esaurito:'exhausted',rifiutato:'refused'};
export type CliCustomEvent={type:'CUSTOM';name:string;value:Record<string,unknown>};

function finiteOrNull(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)?value:null;}
function nonNegativeInteger(value:unknown):number|null{const n=finiteOrNull(value);return n!==null&&n>=0?Math.round(n):null;}

/**
 * G02: the provider's requested wait is read by the KERNEL's own reader (`leggiAttesaRichiestaDalFornitore`,
 * harness-ui/src/provider-retry.mjs: `retry-after-ms`, then RFC 9110 `Retry-After`), handed in by the composition — one
 * grammar, no CLI copy that could drift from the one that decides the wait.
 */
export type RequestedWaitReader=(headers:unknown,now?:number)=>number|null;
/** When an exhausted ChatGPT plan window comes back (epoch ms), from the service's headers; null when they do not say. */
export type PlanResetReader=(headers:unknown)=>number|null;

/** A kernel `provider-retry` wait report (talosLavora `onGiro`, fase `attesa`) as the CLI's attempt fact. */
function attemptFromKernel(row:Record<string,unknown>,requestedWaitMs:number|null):Record<string,unknown>{
  const planLimit=row.motivo==='limite-del-piano';
  return{attempt:row.tentativo,maxAttempts:row.tentativiMassimi,status:row.httpStatus,retryAfterMs:requestedWaitMs,waitMs:row.attesaMs,...(planLimit?{planLimit:true,resumesAt:row.retryAt}:{})};
}

export function attemptEvent(info:unknown):CliCustomEvent|null{
  const row=info&&typeof info==='object'?info as Record<string,unknown>:null;
  const attempt=nonNegativeInteger(row?.attempt),maxAttempts=nonNegativeInteger(row?.maxAttempts);
  if(attempt===null||maxAttempts===null)return null;
  const value:ProviderAttemptFact={attempt,maxAttempts,status:nonNegativeInteger(row?.status),retryAfterMs:nonNegativeInteger(row?.retryAfterMs),waitMs:nonNegativeInteger(row?.waitMs),...(row?.planLimit===true?{planLimit:true as const,resumesAt:nonNegativeInteger(row?.resumesAt)}:{})};
  return{type:'CUSTOM',name:CLI_EVENT.attempt,value};
}
/**
 * One reading of an in-turn compaction row, so the words and numbers are the same live and after `--resume`. Live it is the adapter's
 * `onGiro` report (`compattazione-fine`, figures in its `record`); in a replay it is the kernel's durable journal row (`talos.compattazione`
 * `fine`, the same fields with the record's figures at its top level, agent-service.mjs) — review 14 R14-1 of 0.6.13. Null when the
 * row is not named: an adopted end-of-turn record alone, or a free row that shortened no tool output and no image.
 */
/** What the kernel's `compattazione-inizio` of the same request said, when there was one: its `motivo` and its `soglia`. */
export type CompactionStart={motivo?:unknown;soglia?:unknown}|null|undefined;
export type CompactionCause={cause:'threshold'|'emergency'|'refusal'|null;line:number|null};
/**
 * Judge v1597 (a): ONE reading of WHY the kernel compacted, live and after `--resume`. An instant swap — a model summary already
 * prepared, adopted at once — has no `compattazione-inizio` (agent-service.mjs:1648 «lo scambio istantaneo non ha un
 * compattazione-inizio»): its end row carries the `motivo` itself (`talosHarness.desktop-hotfix.mjs` annunciaCompattazione, `istantanea`),
 * and so does every journal end row (agent-service.mjs:1652-1653). Before, the CLI read the reason only from the start row, so a summary
 * adopted at the emergency was said live as the «75%» rule and after --resume as the emergency: two screens for one compaction.
 * The row's own reason first, then its start's. The line is the kernel's number only: the end row's optional `soglia`, or the start's.
 * No reason ⇒ `cause:null`, said with no rule and no number; a reason this CLI does not know is never mapped to a near one.
 */
export function compactionCauseOf(row:Record<string,unknown>,start:CompactionStart):CompactionCause{
  const motivo=typeof row.motivo==='string'&&row.motivo?row.motivo:typeof start?.motivo==='string'&&start.motivo?start.motivo:null;
  const cause=motivo==='soglia'?'threshold' as const:motivo==='emergenza'?'emergency' as const:motivo==='overflow'?'refusal' as const:null;
  const line=cause==='emergency'?nonNegativeInteger(row.soglia)||nonNegativeInteger(start?.soglia)||null:null;
  return{cause,line};
}
export function compactionFactOf(row:Record<string,unknown>,figures:Record<string,unknown>|null,start:CompactionStart=null):CompactionFact|null{
  /* review 4 S3-2 of 0.6.13 (22/10/2026), the form agreed with the desktop: a row born from a record prepared elsewhere carries
     `adottato:{at,origine,tokenDopo,conResto}`. The registry's end-of-turn summary (`origine:'fine-giro'`) was already named when
     it was written (protocol/v2/events.ts, `motivo:'background'`): adopting it alone names nothing, and a rest summarised on top
     of it is named from the adopted figure, so the base is not counted twice. A record a turn prepared (`'giro'`, or no mark) was
     never named: named as before. */
  const adopted=row.adottato&&typeof row.adottato==='object'?row.adottato as Record<string,unknown>:null;
  if(adopted?.origine==='fine-giro'&&adopted.conResto!==true)return null;
  /* review 9 F1/F5 of 0.6.13 (23/10/2026): a row with no summary (`soloCoda`) is free. Where only rule K worked (`accorciati`, older
     long messages shortened with their full text saved) it is quiet, as contract (c) and the CHANGELOG say; where older tool
     results were shortened (`ridotti`, or a tail-only row without `accorciati`) it is named as that, never as «summarized». A
     K-only row named here also re-armed the brake's warning. Z F1 (r4, confirmed by the Desktop 23/10/2026): a tail-only row is
     quiet when it shortened no tool output (`ridotti`) and replaced no image (`immagini`), whatever `accorciati` says; otherwise
     it is named, with the images. */
  const tailOnly=row.soloCoda===true;
  const trimmed=nonNegativeInteger(row.ridotti)??0,images=nonNegativeInteger(row.immagini)??0;
  if(tailOnly&&trimmed===0&&images===0)return null;
  const before=adopted?.origine==='fine-giro'?nonNegativeInteger(adopted.tokenDopo):nonNegativeInteger(figures?.tokenPrima);
  const {cause,line}=compactionCauseOf(row,start);
  return{engine:'kernel',messagesSummarized:null,tokensBefore:before,tokensAfter:nonNegativeInteger(figures?.tokenDopo),trigger:'automatic',
    ...(tailOnly?{method:trimmed>0?'tool-results' as const:'images' as const,...(images>0?{imagesReplaced:images}:{})}
      :row.ripiego===true?{method:'without-model' as const,...(typeof row.ragione==='string'&&FALLBACK_REASONS[row.ragione]?{fallbackReason:FALLBACK_REASONS[row.ragione]}:{})}:{}),
    ...(cause==='refusal'?{afterRefusal:true as const}:cause==='emergency'?{emergency:true as const,...(line?{emergencyThreshold:line}:{})}
      :cause===null&&!tailOnly&&row.ripiego!==true?{causeUnknown:true as const}:{}),...(typeof figures?.at==='string'&&ISO_TIME.test(figures.at)?{at:figures.at}:{})};
}
export function compactionEvent(fact:CompactionFact):CliCustomEvent{return{type:'CUSTOM',name:CLI_EVENT.compacted,value:{...fact}};}
export function summaryRequestedEvent():CliCustomEvent{return{type:'CUSTOM',name:CLI_EVENT.summaryRequested,value:{}};}
/* A8 of the alignment: why the kernel reopened a turn. `comando-rosso` (R-53) and `prova-rossa` (R-58) reopen once, so they say no
   count; a reason the CLI does not know yet gets the neutral sentence, never «output limit» (it was the else branch until 0.7.0). */
const CONTINUATION_WORDS:Readonly<Record<string,MessageId>>={'tetto-uscita':'screen.continuation.outputLimit',silenzio:'screen.continuation.silence','comando-rosso':'screen.continuation.failedCommand','prova-rossa':'screen.continuation.failedTest'};
/* Decision 245 (owner 05/11/2026): a push after an answer that stopped «for the context» says nothing, on the screen and in `-p`: zero
   cards, zero notices, the line only in the kernel's journal (agent-service.mjs `talos.continuazione`), as on the PC. */
const SILENT_CONTINUATIONS:ReadonlySet<string>=new Set(['fermata-contesto']);
export function continuationWords(evento:any):string|null{
  if(evento?.tipo!=='continuazione'||SILENT_CONTINUATIONS.has(String(evento.motivo)))return null;
  return t(CONTINUATION_WORDS[String(evento.motivo)]??'screen.continuation.other',{count:`${Number(evento.tentativo)||1} of ${Number(evento.tentativiMassimi)||1}`});
}
export function noticeEvent(message:string):CliCustomEvent{return{type:'CUSTOM',name:CLI_EVENT.notice,value:{message}};}
/** 0.6.9: the code of a trusted MCP server that did not start, so `-p` text, v1, v2 and the screen can tell it from other notices */
export const MCP_START_FAILED='MCP_START_FAILED';
/**
 * 0.6.9 (owner 17/10/2026 «un avviso chiaro»): a trusted MCP server that did not start. `serverId` and `reason` travel apart from
 * the sentence, so the screen can keep the server's name and its check command when only the kernel's reason is not English
 * (the bugfixer's review of 0.6.9, N2).
 */
export function mcpStartFailedEvent(serverId:string,reason:string):CliCustomEvent{
  const message=`MCP server "${serverId}" did not start${reason?`: ${reason}`:''}. Its tools are not available in this turn. Check it with: talos mcp test ${serverId}`;
  return{type:'CUSTOM',name:CLI_EVENT.notice,value:{message,code:MCP_START_FAILED,serverId,reason}};
}
/** The same sentence without the reason, for a screen that cannot show the reason (it is not English). */
export function mcpStartFailedWithoutReason(serverId:string):string{return `MCP server "${serverId}" did not start. Its tools are not available in this turn. Check it with: talos mcp test ${serverId}`;}
export function failureEvent(fact:ProviderFailureFact):CliCustomEvent{return{type:'CUSTOM',name:CLI_EVENT.failure,value:{...fact}};}

/** Per-session listeners for the CLI's transient events; the composition merges them into `subscribe`. */
export function createCliEventHub(){
  const listeners=new Map<string,Set<(event:unknown)=>void>>();
  return{
    emit(sessionId:string,event:CliCustomEvent){
      for(const listener of [...(listeners.get(sessionId)??[])]){try{listener(event);}catch{/* a listener's failure is its own */}}
    },
    subscribe(sessionId:string,listener:(event:unknown)=>void){
      let set=listeners.get(sessionId);if(!set){set=new Set();listeners.set(sessionId,set);}
      set.add(listener);
      return()=>{const current=listeners.get(sessionId);current?.delete(listener);if(current&&current.size===0)listeners.delete(sessionId);};
    },
    size(sessionId:string){return listeners.get(sessionId)?.size??0;},
  };
}
export type CliEventHub=ReturnType<typeof createCliEventHub>;

function textOf(content:unknown):string{
  if(typeof content==='string')return content;
  if(Array.isArray(content))return content.map(part=>part&&typeof part==='object'&&typeof (part as any).text==='string'?(part as any).text:'').join('');
  return '';
}
function requestBody(init:any):any{
  if(typeof init?.body!=='string')return null;
  try{return JSON.parse(init.body);}catch{return null;}
}
function conversationOf(body:any):any[]|null{return Array.isArray(body?.messages)?body.messages:null;}
function isSummaryRequest(messages:any[]):boolean{
  const last=messages.at(-1);
  return last?.role==='user'&&textOf(last.content).startsWith(KERNEL_SUMMARY_REQUEST_START);
}
function carriesCompactedMarker(messages:any[]):boolean{
  return messages.some(message=>{if(message?.role!=='user')return false;const text=textOf(message.content);return KERNEL_COMPACTED_MARKER_STARTS.some(start=>text.startsWith(start));});
}
const SYSTEM_ROLES=new Set(['system','developer']);

/**
 * One model run's observer. `fetchDiRete` wraps the innermost transport the owner adapter uses (talosLavora's
 * `input.fetchDiRete`, runtime-owner-adapter.mjs:1193): every real HTTP request of the run passes through it, retries and
 * fallback providers included. It never changes a request or a response.
 */
export function createRunObserver({sessionId,hub,readRequestedWait,readPlanReset=null,baseFetch=(input:any,init?:any)=>fetch(input,init),now=()=>Date.now()}:{sessionId:string;hub:CliEventHub;readRequestedWait:RequestedWaitReader|null;readPlanReset?:PlanResetReader|null;baseFetch?:(input:any,init?:any)=>Promise<Response>;now?:()=>number}){
  const requestedWait=(headers:unknown):number|null=>{
    if(!readRequestedWait)return null;
    try{return nonNegativeInteger(readRequestedWait(headers,now()));}catch{return null;}
  };
  let lastResponse:{status:number;retryAfterMs:number|null}|null=null;
  /* When the plan's exhausted window comes back, as the service's last refusal said (epoch ms). */
  let lastPlanReset:number|null=null;
  /* The requested wait of the latest real failed response, until the kernel reports the wait it took for it. */
  let unreadWait:number|null=null;
  let pending:{messagesSummarized:number;tokensBefore:number|null}|null=null;
  /* review 10 R10-9: why the kernel's compaction of each request started (`compattazione-inizio` `motivo`), until its end row */
  const startedBecause=new Map<unknown,string>();const startedAt=new Map<unknown,unknown>();
  const emit=(event:CliCustomEvent|null)=>{if(event)hub.emit(sessionId,event);};
  async function fetchDiRete(input:any,init?:any):Promise<Response>{
    const messages=conversationOf(requestBody(init));
    let summary:{messagesSummarized:number;tokensBefore:number|null}|null=null;
    if(messages){
      if(isSummaryRequest(messages)){
        /* Summarised: everything but the system prompt, the task (kept word for word) and the summary request itself. */
        const conversation=messages.filter(message=>!SYSTEM_ROLES.has(String(message?.role)));
        summary={messagesSummarized:Math.max(0,conversation.length-2),tokensBefore:null};
      }else if(pending){
        const done=pending;pending=null;
        if(carriesCompactedMarker(messages))emit(compactionEvent({engine:'kernel',messagesSummarized:done.messagesSummarized,tokensBefore:done.tokensBefore,tokensAfter:null,trigger:'automatic'}));
      }
    }
    const response=await baseFetch(input,init);
    /* the plan's own headers, from the service's refusal itself: when the kernel waits and asks again, the response it ends on is
       its own (Retry-After only), so the time the window comes back is kept from the last real one (any request shape) */
    if(!response.ok&&readPlanReset){try{const at=nonNegativeInteger(readPlanReset(response.headers));if(at!==null)lastPlanReset=at;}catch{/* headers it cannot read */}}
    if(messages){
      lastResponse={status:response.status,retryAfterMs:response.ok?null:requestedWait(response.headers)};
      unreadWait=lastResponse.retryAfterMs;
      if(summary){
        pending=summary;
        /* The summary call is not streamed (talosHarness.mjs `compattaConversazione` passes no onDelta): its reported input
           tokens are read from a copy, off the kernel's path. */
        if(response.ok&&typeof response.clone==='function'){
          const holder=summary;
          void response.clone().json().then((body:any)=>{const tokens=nonNegativeInteger(body?.usage?.prompt_tokens??body?.usage?.input_tokens);if(tokens!==null)holder.tokensBefore=tokens;}).catch(()=>{});
        }
      }
    }
    return response;
  }
  return{
    fetchDiRete,
    /**
     * G02: the kernel's retry report (`onGiro` `{tipo:'provider-retry', fase:'attesa', tentativo, tentativiMassimi,
     * httpStatus, attesaMs}`, talosHarness.mjs chiamaConRitentaBase) becomes the attempt fact. The kernel reports the wait it
     * TAKES; the wait the provider ASKED for is this observer's reading of the failed response, read once: an attempt the
     * store answered itself, with no request (a key benched until the wait is over), has none.
     */
    /**
     * 0.6.13 (full suite, 22/10/2026): the desktop adapter reports each compaction it applies on `onGiro` (`compattazione-fine`,
     * `compattato:true`, with its record: talosHarness.desktop-hotfix.mjs `applicaCompattazione`, one per `compattazioni`), and its
     * summary request no longer starts with the bare kernel's words, so the request-shape reading above never saw it: the screen
     * named it only at the run's end with no numbers, and `-p` v2 not at all. Named here, live, once, with the record's figures;
     * the screen's end-of-run count (event-adapter.ts) then has nothing missing. How many messages it summarised is not in the
     * record, so it is not said.
     */
    onCompaction(evento:unknown){
      const row=evento&&typeof evento==='object'?evento as Record<string,unknown>:null;
      /* kernel a2739656d (the CLI's review 13, R13-1): a free summary named in a turn that then failed is annulled; its line goes */
      if(row?.tipo==='compattazione-annullata'){if(row.motivo==='giro-fallito'&&typeof row.at==='string'&&ISO_TIME.test(row.at))emit({type:'CUSTOM',name:CLI_EVENT.compactionUndone,value:{at:row.at,reason:'turn-failed'}});return;}
      if(row?.tipo==='compattazione-inizio'){if(typeof row.motivo==='string')startedBecause.set(row.giro,row.motivo);startedAt.set(row.giro,row.soglia);return;}
      const start=row?.tipo==='compattazione-fine'&&startedBecause.has(row.giro)?{motivo:startedBecause.get(row.giro),soglia:startedAt.get(row.giro)}:null;
      if(row?.tipo==='compattazione-fine'){startedBecause.delete(row.giro);startedAt.delete(row.giro);}
      if(row?.tipo!=='compattazione-fine'||row.compattato!==true)return;
      const record=row.record&&typeof row.record==='object'?row.record as Record<string,unknown>:null;
      /* the adopted record and the free rows: compactionFactOf above (review 14 R14-1: one reading, live and in a replay) */
      const fact=compactionFactOf(row,record,start);if(fact)emit(compactionEvent(fact));
    },
    onProviderRetry(evento:unknown){
      const row=evento&&typeof evento==='object'?evento as Record<string,unknown>:null;
      /* `fine` closes the report (chiamaConRitenta `notifica`): it is not a wait, and it does not use up the provider's ask */
      if(row?.tipo!=='provider-retry'||row.fase!=='attesa')return;
      const asked=lastResponse&&lastResponse.status===row.httpStatus?unreadWait:null;unreadWait=null;
      emit(attemptEvent(attemptFromKernel(row,asked)));
    },
    /** The facts of the error that ended the run, announced BEFORE the kernel's RunError reaches the stream. */
    announceFailure(error:unknown){
      const row=error&&typeof error==='object'?error as Record<string,unknown>:null;
      const status=nonNegativeInteger(row?.stato)??nonNegativeInteger(row?.status)??(lastResponse&&lastResponse.status>=400?lastResponse.status:null);
      const wait=nonNegativeInteger(row?.retryAfterMs)??(lastResponse&&lastResponse.status===status?lastResponse.retryAfterMs:null);
      /* the plan's limit: the kernel's error keeps the service's headers (`intestazioni`, erroreDelPiano) */
      let resetsAt:number|null=null;
      if(row?.code==='CHATGPT_LIMITE_DEL_PIANO'&&readPlanReset){
        try{resetsAt=nonNegativeInteger(readPlanReset(row.intestazioni));}catch{resetsAt=null;}
        /* the kernel's retries used up: its error carries its own headers; the service's last word is the one that says when */
        if(resetsAt===null&&lastPlanReset!==null&&lastPlanReset>now())resetsAt=lastPlanReset;
      }
      if(status===null&&wait===null&&resetsAt===null)return;
      emit(failureEvent({status,retryAfterMs:wait,...(resetsAt!==null?{resetsAt}:{})}));
    },
  };
}
