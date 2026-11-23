import {TOOL_PERMISSION_DENIED,type PermissionDenial} from '../../headless/denials.ts';
import {backgroundStopsOf} from '../../headless/background.ts';
import type {BackgroundStop} from '../../runtime/types.ts';
import {delegationResultsOf,parseDelegationResult} from './delegation.ts';
import {kernelQueueOf,queueOriginOf} from '../../runtime/kernel-queue.ts';
import type {CliKernelQueueOrigin} from '../../runtime/types.ts';
import {createRedactor} from '../../diagnostics/redact.ts';
import {inertTerminalText,safeTalosFailure,type TalosFailure} from '../../errors.ts';
import {describeError} from '../../i18n/error-view.ts';
import {RECEIPT_ALLOWED_BY_KIND,RECEIPT_POSTCONDITION,RECEIPT_VIA} from '../../i18n/kernel-map.ts';
import type {CliContextStatus,CliSessionSummary} from '../../runtime/types.ts';
import {parseToolOutputMarker,parseToolResultCut} from '../../runtime/output-store.ts';
import {CLI_EVENT,MCP_START_FAILED,compactionFactOf} from '../../runtime/provider-attempts.ts';
import {toolDisplay} from '../../tui/tool-display.ts';
import {t,tn,type MessageId} from '../../i18n/index.ts';
import {requestTooLargeOf} from '../../runtime/request-too-large.ts';
import {contextFullOf} from '../../runtime/context-full.ts';
import {KERNEL_CLASSES} from '../../i18n/kernel-map.ts';
/* Owner 11/10/2026: "the person sees why" a hook refused a tool. */
function hookRefusalText(hookId:string,tool:string|null,reason:string|null):string{
  const base=t(tool?'screen.hooks.refusedTool':'screen.hooks.refused',{hook:hookId||'?',tool:tool??''});
  return reason?`${base}: ${reason.replace(/\s+/gu,' ').trim()}`:`${base}.`;
}
/*
 * 0.6.13, the compaction release (owner 21/10/2026; the Desktop found D-MO-12 on the phone). The kernel says a compaction that
 * did not happen on CUSTOM `talos.compattazione` `{fase:'fine', compattato:false, motivo, codice?}` (agent-service.mjs
 * `compattazione-fine`, the desktop adapter's `ripiego` once per turn and `archivio-riallineato`, the base loop and the registry's
 * background compaction with the summary's reason). The bridge dropped them all: a Context Engine that failed and the simple
 * compaction that took over were silent. Each one is now ONE durable English warning that stops nothing, with a stable code, an
 * English reason and the kernel's own code when it has one — the way Codex says a failed remote compaction and its local
 * fallback (`core/src/session/turn.rs:221-229`, `compact_remote_v2.rs:266-272`) and opencode keeps the failure on the session
 * (`packages/core/src/session/compaction.ts:638-646`).
 * Not said here: a compaction that DID happen (counted once by `talos.cli.context.compacted`, provider-attempts.ts), the start,
 * nothing to compact, a background summary the conversation overtook (`superata`), a stop by the person (`interrotta`), and the
 * background preparation (`talos.compattazione-preparata`: the turn compacts in front when it needs to, and that one is said).
 * The kernel's `dettaglio` (positions and roles) and an `error: <message>` reason stay out: the protocol is English.
 */
/* r4 0ec393426 and d06f6a9d3 (desktop, 21/10/2026): `ceduta`, an end-of-turn summary that gave the single-slot engine back to the
   person's turn, and `motore`, the close of the row the adapter opens while the turn waits for the Context Engine's own summary
   (that summary's outcome is said by the engine's events). Both are normal ends, silent on the desktop too. r4 (desktop, 22/10/2026,
   second adversarial review B): `nulla-da-ridurre` closes the row of a compaction that found nothing to reduce. r4 (desktop, cure of
   the CLI's review 3 S2-2): `inefficace`, a summary that came back no shorter than what it would replace. It was written (and paid
   for), but not applied; the conversation goes on unchanged (review 4 S3-1 of 0.6.13). */
/* Contract with the Desktop (22/10/2026), (c): `accorciati` {messaggi:n}, older long messages shortened for the model with the full
   text saved, is free and loses nothing (the model can read the saved text), so it is quiet, as «simple at first sight» asks; the
   owner's research put it behind /context, not in the conversation (§4.4). */
/* A2 of the alignment (kernel/catena-del-riassunto.mjs MOTIVI_INUTILIZZABILE): why the summary model cannot be used, one sentence each. */
const SUMMARY_MODEL_WORDS:Readonly<Record<string,MessageId>>={'non-trovato':'screen.summaryModel.notFound','senza-chiave':'screen.summaryModel.noKey','accesso-negato':'screen.summaryModel.denied','non-configurato':'screen.summaryModel.notConfigured'};
const COMPACTION_QUIET=new Set(['niente-da-compattare','superata','interrotta','ceduta','motore','nulla-da-ridurre','inefficace','accorciati']);
/* Contract (c): `freno`, automatic paid summaries paused after two that did not shorten the conversation (the kernel's breaker, as
   Hermes `record_rejected_compaction` agent/context_compressor.py:2516-2523 and Claude Code's rapid-refill stop). Said ONCE per
   arming with its own code (createCompactionWarnings below); `/compact` still forces one. */
const COMPACTION_CODES={fallback:'COMPACTION_FALLBACK',realigned:'COMPACTION_HISTORY_REALIGNED',failed:'COMPACTION_FAILED',paused:'COMPACTION_PAUSED',
  windowTooSmall:'COMPACTION_WINDOW_TOO_SMALL'} as const;
/* the five codes a `-p` in text writes on stderr (main.ts `writeTextWarnings`) */
export const COMPACTION_WARNING_CODES:ReadonlySet<string>=new Set(Object.values(COMPACTION_CODES));
const COMPACTION_SUMMARY_REASONS:Record<string,{reason:string;id:MessageId}>={
  errore:{reason:'error',id:'screen.compaction.reason.error'},
  esaurito:{reason:'retries-exhausted',id:'screen.compaction.reason.exhausted'},
  troncato:{reason:'truncated',id:'screen.compaction.reason.truncated'},
  vuoto:{reason:'empty',id:'screen.compaction.reason.empty'},
  'non-salvata':{reason:'not-saved',id:'screen.compaction.reason.notSaved'},
  /* 0.6.13 release review S4-1 (22/10/2026): the summariser's reasons at kernel 06b9ed101 (compattazione-desktop.mjs:494-498) read
     «unknown»: a tool call instead of a summary, and a refusal in prose (the same list, so both). Each cause in its own words, as
     Hermes says «Compression refused (summary would grow the conversation)» apart from «Compression aborted»
     (agent/manual_compression_feedback.py:52-57) and opencode publishes the summariser's own error (core/src/session/compaction.ts:
     638-646). The Italian `errore: <text>` is an error as `error: <text>` is (session-registry.mjs:5599 writes the English form). */
  attrezzo:{reason:'tool-call',id:'screen.compaction.reason.toolCall'},
  rifiuto:{reason:'refused',id:'screen.compaction.reason.refused'},
  /* C6-bis, the end-of-turn shape of «non-disponibile» (compattato:false): the summary model was not ready and no backup could write it */
  'non-disponibile':{reason:'unavailable',id:'screen.compaction.reason.unavailable'},
};
const ERROR_TEXT_REASON=/^(?:error|errore):/u;
/*
 * 0.6.13 release review S4-2 (22/10/2026): a fallback is not always a failure. The Context Engine's in-turn summary has a ceiling
 * (context-engine engine.mjs:432-442, CTX_COMPACTION_TIMEOUT; Hermes abandons at 600 s, agent/conversation_compression.py:668), and
 * the person's Skip cancels its job (engine.mjs:329-331 and :568, CTX_JOB_CANCELLED); the adapter then compacts without waiting
 * (desktop-hotfix :1111-1118, `ragioneSenzaModello`). The kernel's `ripiego` event carries only that code, so the code picks the
 * words; the warning code stays COMPACTION_FALLBACK. Research. Competitors: Hermes «Compressed with fallback» against «Compression
 * aborted» (manual_compression_feedback.py:52-66) and its log says «committed a deterministic fallback summary», not «recovered»
 * (website/docs/developer-guide/context-compression-and-caching.md:188-193), with timeouts as their own class (:174-180); Codex
 * prefixes only a real failure «Error running remote compact task» (core/src/session/turn.rs:221-229, compact_remote_v2.rs:266-272);
 * opencode separates `Compaction.Failed` from `Compaction.Ended` (core/src/session/compaction.ts:638-650). Docs: errors.ts
 * CTX_COMPACTION_TIMEOUT («took too long … compacted without the model … Nothing to do: the turn goes on»); Hermes docs above;
 * opencode docs config.mdx:745-760 (compaction is automatic support work). Best practices: name what happened, not a generic failure
 * (clig.dev «catch it and rewrite the error message to be useful»); a planned degradation is not an error (Hermes, «not
 * "recovered"»); keep the stable code and vary the words (Codex's error events keep their code, only the prefix says the cause).
 */
/* Z piece D (r4 ab2f70f59, 23/10/2026): `perche` says why the brake was pulled: `colpi`, paid summaries that did not shorten the
   conversation (Hermes `record_rejected_compaction`, agent/context_compressor.py:2516-2523); `ricariche`, a conversation that filled
   up again right after each one (Claude Code's rapid-refill stop). Without it, the generic sentence. */
const BRAKE_BY_CAUSE:Readonly<Record<string,MessageId>>={colpi:'screen.compaction.brake.hits',ricariche:'screen.compaction.brake.refills'};
const FALLBACK_BY_CODE:Readonly<Record<string,MessageId>>={CTX_COMPACTION_TIMEOUT:'screen.compaction.fallback.timeout',CTX_JOB_CANCELLED:'screen.compaction.fallback.cancelled'};
const kernelCode=(value:unknown)=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/u.test(value)?value:null;
export type CompactionFailureWarning={code:string;reason:string;message:string;errorCode?:string};
const wholeCount=(value:unknown):number|null=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:null;
export function compactionFailureWarning(value:Record<string,unknown>|null|undefined):CompactionFailureWarning|null{
  if(value?.fase==='fine'&&value.motivo==='freno')return{code:COMPACTION_CODES.paused,reason:'brake',message:t(BRAKE_BY_CAUSE[String(value.perche)]??'screen.compaction.brake')};
  if(!value||value.fase!=='fine'||value.compattato!==false)return null;
  const motivo=typeof value.motivo==='string'?value.motivo:'';
  if(COMPACTION_QUIET.has(motivo))return null;
  const errorCode=kernelCode(value.codice);const withCode=errorCode?{errorCode}:{};
  if(motivo==='ripiego')return{code:COMPACTION_CODES.fallback,reason:'fallback',message:errorCode?t(FALLBACK_BY_CODE[errorCode]??'screen.compaction.fallback',{code:errorCode}):t('screen.compaction.fallback.noCode'),...withCode};
  /* r4, cure of the CLI's review 7 F6 (22/10/2026, the form agreed with the desktop): at the emergency, with a known window, the floor
     (frame + expected summary + measured gap) does not fit the window, so no summary is paid; said once per session and window */
  if(motivo==='non-entra'){const window=wholeCount(value.finestra),floor=wholeCount(value.pavimento);return{code:COMPACTION_CODES.windowTooSmall,reason:'window-too-small',
    message:window!==null&&floor!==null?t(wholeCount(value.riserva)!==null?'screen.compaction.windowTooSmall.reserve':'screen.compaction.windowTooSmall',{window:window.toLocaleString('en-US'),floor:floor.toLocaleString('en-US')}):t('screen.compaction.windowTooSmall.noNumbers')};}
  if(motivo==='archivio-riallineato')return{code:COMPACTION_CODES.realigned,reason:'history-realigned',message:t('screen.compaction.realigned',{code:errorCode??'CTX_HISTORY_DIVERGED'}),...withCode};
  const known=COMPACTION_SUMMARY_REASONS[motivo]??(ERROR_TEXT_REASON.test(motivo)?COMPACTION_SUMMARY_REASONS.errore!:null);
  const reasonText=known?.reason==='error'&&errorCode?t('screen.compaction.reason.errorCode',{code:errorCode}):t(known?.id??'screen.compaction.reason.unknown');
  return{code:COMPACTION_CODES.failed,reason:known?.reason??'unknown',message:t('screen.compaction.failed',{reason:reasonText}),...withCode};
}
/**
 * Contract (c) of 22/10/2026: the brake is said once per arming. The kernel may name it again while it holds (one `freno` per
 * turn it skips a paid summary); the person needs it once. Z piece D (r4 ab2f70f59, 23/10/2026): the event carries
 * `freno:{colpi,mezzoAlVerdetto,at}`, and `at` is the pull's identity, new at every pull. A paid summary does not re-arm the
 * kernel's brake (only a grown middle, a new model or window, or /compact do, and a new pull then has a new `at`), so a brake with
 * `at` is said once per distinct `at` and nothing else resets it. Without `at` (an older kernel) the flag rule stays: a compaction
 * that happened (`compattato:true`, or the CLI's own `compacted` fact) means summaries run again. One gate per bridge, so a replay
 * says it once where it happened.
 */
export function createCompactionWarnings(){
  let braked=false;let pull:string|null=null;
  return{
    rearm(){braked=false;},
    warningFor(value:Record<string,unknown>|null|undefined):CompactionFailureWarning|null{
      if(value?.fase==='fine'&&value.compattato===true)braked=false;
      const warning=compactionFailureWarning(value);
      if(warning?.code!==COMPACTION_CODES.paused)return warning;
      const brake=value?.freno&&typeof value.freno==='object'?value.freno as Record<string,unknown>:null;
      const at=typeof brake?.at==='string'&&brake.at?brake.at:null;
      if(at!==null){if(at===pull)return null;pull=at;braked=true;return warning;}
      if(braked)return null;braked=true;return warning;
    },
  };
}
import type {
  TalosV2Cursor,
  TalosV2Durability,
  TalosV2EnforcementEvidence,
  TalosV2Error,
  TalosV2Event,
  TalosV2EventType,
  TalosV2RunResult,
  TalosV2ToolReceipt,
  TalosV2ToolResult,
} from './types.ts';

// Gate E11 (2026-09-23): a key is secret by exact normalized name or by a whole secret word, never by
// substring, so usage counters such as prompt_tokens survive. Counters are allowed first; secret values
// are masked in place (the key stays, as in diagnostics/redact.ts), never dropped. v1 bridge.ts is frozen.
const USAGE_COUNTER_KEYS=new Set([
  'prompt_tokens','completion_tokens','total_tokens','cached_tokens','reasoning_tokens','token_count',
  'input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens',
  'promptTokens','completionTokens','totalTokens','inputTokens','outputTokens','reasoningTokens',
  /* review 3 of 0.6.13: the kernel's compaction counts (tokens before and after a summary), numbers only like the rest */
  'tokenPrima','tokenDopo'
]);
const OTEL_USAGE_COUNTER=/^gen_ai\.usage\.[a-z0-9_.]+_tokens$/u;
const SECRET_KEYS=new Set([
  'authorization','proxyauthorization','apikey','xapikey','accesstoken','refreshtoken','idtoken',
  'clientsecret','password','passwd','secret','token'
]);
const SECRET_WORDS=new Set(['authorization','apikey','apikeys','password','passwords','passwd','secret','secrets','token']);
function usageCounter(key:string,value:unknown){
  return typeof value==='number'&&Number.isFinite(value)&&(USAGE_COUNTER_KEYS.has(key)||OTEL_USAGE_COUNTER.test(key));
}
/* Twin repair of desktop 0.2.2, round 8 (reviewer 3 after round 7, RED 2): a zero width space, a joiner or a soft hyphen inside the secret
   word (`pa​ssword_confirmation`) split it into two words and the value stayed in clear, 15 of 24 names on the row and on the card.
   They are removed before the name is read, as the kernel does (forme-di-segreto.mjs `nomeDiCampoSegreto`, INVISIBILI). */
const INVISIBLE_IN_NAME=/[\p{Default_Ignorable_Code_Point}\p{Bidi_Control}]/gu;
function secretKey(rawKey:string){
  const key=rawKey.replace(INVISIBLE_IN_NAME,'');
  if(SECRET_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/gu,'')))return true;
  const words=key.replace(/([a-z0-9])([A-Z])/gu,'$1 $2').toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
  return words.some((word,index)=>SECRET_WORDS.has(word)||(word==='api'&&(words[index+1]==='key'||words[index+1]==='keys')));
}
const MASK=/^\[REDACTED(?::\d+)?\]$/u;
function masked(value:unknown){
  if(typeof value==='string'&&MASK.test(value))return value;// withoutMeta() cleans an already clean event
  return typeof value==='string'?`[REDACTED:${Buffer.byteLength(value,'utf8')}]`:'[REDACTED]';
}
const FAILED_RECEIPT_STATUSES=new Set(['denied','premise_absent','failed','refused_busy']);
const TOOL_RECEIPT_KEYS=new Set(['status','consentito','allowed','via','motivo','reason','risk','evidence']);
const ENFORCEMENT_KEYS=new Set([
  'exitCode','requestedEnforcement','appliedEnforcement','sandboxEnforcement','backend','appContainer',
  'filesystem','network','processTree','processTreeEvidence','sandboxSpecVersion'
]);
const TOOL_TOP_LEVEL_KEYS=new Set(['type','_sequenza','toolCallId','content','receipt','outcome','isError','duplicate','interrotta']);

function objectValue(value:unknown):Record<string,unknown>|null{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function stringValue(value:unknown):string|null{return typeof value==='string'&&value.length>0?value:null;}
function numberValue(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)?value:null;}
function booleanValue(value:unknown):boolean|null{return typeof value==='boolean'?value:null;}
function detailsOutside(source:Record<string,unknown>|null,known:Set<string>):Record<string,unknown>|undefined{
  if(!source)return undefined;
  const details=Object.fromEntries(Object.entries(source).filter(([key])=>!known.has(key)));
  return Object.keys(details).length?details:undefined;
}
/*
 * Twin repair of desktop 0.2.2, round 5 (reviewer 3, RED, measured end to end): `out[key]=…` with the name «__proto__» SET THE PROTOTYPE
 * instead of making a field, so an argument named «__proto__» vanished from the terminal card while the tool received it. Every name is
 * now put with `defineProperty` when it is «__proto__» (an ordinary object, prototype untouched; the other names keep the plain
 * assignment, which is the same for them), as the kernel puts it (talosHarness.mjs `argomentiPerLaCarta`, `metti`). Claude Code fixed
 * the same defect (CHANGELOG 897: «values with `__proto__` keys silently removed»).
 */
function put(out:Record<string,unknown>,key:string,value:unknown){
  if(key==='__proto__')Object.defineProperty(out,key,{value,enumerable:true,writable:true,configurable:true});
  else out[key]=value;
}
/* The kernel's outside-tool cards (talosHarness.mjs TIPI_ATTREZZO_DI_FUORI): their `argomenti` are already masked by NAME by the kernel
   (`nomeDiCampoSegreto`, forme-di-segreto.mjs) and cut. Round 5 (reviewer 3, REV3-24): the bridge masked again by its own wider word rule
   (`secretKey` below: `token_limit`, `secret_santa`, `password_hint` became «[REDACTED]» on the terminal and stayed readable on the PC).
   ⛔ Round 6 (reviewer 3 after round 5, RED; owner 14/11 17:13, judge v1895-v1896): trusting the kernel alone showed in clear names the
   CLI 0.6.14 masked, 16 of 24 in the reviewer's probe against 2 of 24 (`password_confirmation`, `api_key_2`, `apiKeyValue`,
   `secret_answer`…): the kernel wants the secret word at the END of the name, as Hermes does (agent/redact.py:493-497). The bridge puts
   Gate E11 (`secretKey`, `usageCounter`) back ON TOP of the kernel's masks: a name is masked when it is an exact secret name or holds a
   whole secret word anywhere, usage counters stay readable, and the kernel's own «[redacted]» is kept as the kernel wrote it. The cost,
   accepted with the decision: `token_limit`, `secret_santa`, `password_hint` are masked again on the terminal. */
const KERNEL_MASKED_ARGUMENTS=new Set(['mcp_tool','plugin_tool','forge_tool']);
const KERNEL_MASK='[redacted]';// forme-di-segreto.mjs SEGRETO_OSCURATO
/* Twin repair of 0.2.2, round 7: also the second half of the tool row's masks (tui/tools/argument-masks.ts), so the row and the card
   pass the same E11 pass on top of the kernel's. */
export function cleanKernelArguments(value:unknown,redactText:(value:string)=>string):unknown{
  if(Array.isArray(value))return value.map(item=>cleanKernelArguments(item,redactText));
  if(value&&typeof value==='object'){
    const out:Record<string,unknown>={};
    for(const [key,item] of Object.entries(value as Record<string,unknown>)){
      if(usageCounter(key,item))put(out,key,item);
      else if(secretKey(key))put(out,key,item===KERNEL_MASK?item:masked(item));
      else put(out,key,cleanKernelArguments(item,redactText));
    }
    return out;
  }
  return typeof value==='string'?redactText(value):value;
}
function clean(value:unknown,redactText:(value:string)=>string):unknown{
  if(Array.isArray(value))return value.map(item=>clean(item,redactText));
  if(value&&typeof value==='object'){
    const out:Record<string,unknown>={};
    const kernelMasked=KERNEL_MASKED_ARGUMENTS.has(String((value as Record<string,unknown>).tipo));
    for(const [key,item] of Object.entries(value as Record<string,unknown>)){
      if(kernelMasked&&key==='argomenti')put(out,key,cleanKernelArguments(item,redactText));
      else if(usageCounter(key,item))put(out,key,item);
      else if(secretKey(key))put(out,key,masked(item));
      else put(out,key,clean(item,redactText));
    }
    return out;
  }
  return typeof value==='string'?redactText(value):value;
}
function nativeSequence(value:unknown):number|null{
  if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)return value;
  if(typeof value==='string'&&/^\d+$/u.test(value)){
    const parsed=Number(value);
    if(Number.isSafeInteger(parsed))return parsed;
  }
  return null;
}
function cursorFor(sessionId:string,sequence:number|null):TalosV2Cursor|null{
  return sequence===null?null:{sessionId,sequence};
}
function eventIdFor(sessionId:string,sequence:number|null,synthetic:number){
  const identity=encodeURIComponent(sessionId||'none');
  return sequence===null?'talos:'+identity+':transient:'+synthetic:'talos:'+identity+':native:'+sequence;
}
function baseEvent(input:{
  sessionId:string;
  sequence:number|null;
  synthetic:number;
  clock:()=>string;
  durability:TalosV2Durability;
  type:TalosV2EventType;
  data:Record<string,unknown>;
}):TalosV2Event{
  return{
    schema:'talos.cli.event.v2',
    version:2,
    sessionId:input.sessionId,
    eventId:eventIdFor(input.sessionId,input.sequence,input.synthetic),
    cursor:cursorFor(input.sessionId,input.sequence),
    ts:input.clock(),
    durability:input.durability,
    type:input.type,
    data:input.data,
  };
}

function toolStatus(raw:Record<string,unknown>,receiptStatus:string|null):TalosV2ToolResult['status']{
  if(raw.interrotta===true)return'interrupted';
  if(raw.outcome==='cancelled')return'cancelled';
  if(receiptStatus==='effect_unknown')return'unknown';
  if(receiptStatus==='succeeded')return'completed';
  if(receiptStatus&&FAILED_RECEIPT_STATUSES.has(receiptStatus))return'failed';
  if(raw.isError===true)return'failed';
  return'completed';
}
function enforcementFrom(receipt:Record<string,unknown>|null):TalosV2EnforcementEvidence|null{
  const evidence=objectValue(receipt?.evidence);
  if(!evidence)return null;
  const extra=detailsOutside(evidence,ENFORCEMENT_KEYS);
  return{
    exitCode:numberValue(evidence.exitCode),
    requested:stringValue(evidence.requestedEnforcement),
    applied:stringValue(evidence.appliedEnforcement),
    sandbox:stringValue(evidence.sandboxEnforcement),
    backend:stringValue(evidence.backend),
    appContainer:booleanValue(evidence.appContainer),
    filesystem:stringValue(evidence.filesystem),
    network:stringValue(evidence.network),
    processTree:stringValue(evidence.processTree),
    sandboxSpecVersion:stringValue(evidence.sandboxSpecVersion),
    ...(evidence.processTreeEvidence!==undefined?{processTreeEvidence:evidence.processTreeEvidence}:{}),
    ...(extra?{details:extra}:{}),
  };
}
function toolResultFromNative(raw:Record<string,unknown>):TalosV2ToolResult|null{
  const toolCallId=stringValue(raw.toolCallId);
  if(!toolCallId)return null;
  const receipt=objectValue(raw.receipt);
  const receiptStatus=stringValue(receipt?.status);
  const receiptExtra=detailsOutside(receipt,TOOL_RECEIPT_KEYS);
  const topExtra=detailsOutside(raw,TOOL_TOP_LEVEL_KEYS);
  const normalizedReceipt:TalosV2ToolReceipt={
    status:receiptStatus,
    allowed:booleanValue(receipt?.consentito??receipt?.allowed),
    via:receiptVia(receipt?.via),
    reason:stringValue(receipt?.motivo??receipt?.reason),
    risk:stringValue(receipt?.risk),
    ...(receiptExtra?{details:englishRecord(receiptExtra,RECEIPT_DETAILS_SHAPE)}:{}),
  };
  /* R5a lane R (Q-R5-10/11, additive): the two cut markers the model read, as facts. */
  const content=String(raw.content??'');
  const saved=parseToolOutputMarker(content);const cut=parseToolResultCut(content);
  return{
    toolCallId,
    status:toolStatus(raw,receiptStatus),
    content,
    receipt:normalizedReceipt,
    enforcement:enforcementFrom(receipt),
    ...(topExtra?{details:englishRecord(topExtra,TOOL_DETAILS_SHAPE)}:{}),
    /* owner 13/10/2026: a discarded identical copy is said as a fact (agent-service.mjs marks it `duplicate: true`) */
    ...(raw.duplicate===true&&raw.outcome==='cancelled'?{duplicate:true as const}:{}),
    ...(saved?{outputSaved:{path:saved.path,keptChars:saved.keptChars,totalChars:saved.totalChars}}:{}),
    ...(cut?{readCut:{shownLines:cut.shownLines,totalLines:cut.totalLines,limitChars:cut.limitChars,shownChars:cut.shownChars,totalChars:cut.totalChars}}:{}),
  };
}

function withoutMeta(raw:Record<string,unknown>,redactText:(value:string)=>string){
  const cleaned=clean(raw,redactText) as Record<string,unknown>;
  delete cleaned.type;
  delete cleaned._sequenza;
  return cleaned;
}

/*
 * Gate E11 / Q-R2-6 (owner 2026-09-24): v2 is opt-in and unreleased, so its pass-through payloads are renamed to English
 * INSIDE v2; v1 (events/bridge.ts) keeps the kernel keys byte for byte. The Italian keys were measured at their kernel
 * emitters (agui-events.mjs runStarted/approvalRequested/approvalResolved/toolCallResult/eventoPerUsage, agent-service.mjs:182,
 * custom-task.mjs:169, workspace-context.mjs:113, chat-image-attachments.mjs:31, path-policy.mjs:351,
 * talosHarness.mjs creaRicevutaOperazione and conto.giri). Renames go by POSITION in a known payload, never by a global word
 * list, so a model's text or a tool argument is never rewritten; an English key already present wins over its Italian twin.
 */
type KeyRule=string|{readonly as?:string;readonly shape?:Shape;readonly values?:Readonly<Record<string,string>>};
type Shape={readonly [italian:string]:KeyRule};
function english(value:unknown,shape:Shape):unknown{
  if(Array.isArray(value))return value.map(item=>english(item,shape));
  const row=objectValue(value);if(!row)return value;
  const out:Record<string,unknown>={};
  for(const [key,item] of Object.entries(row)){
    const rule=shape[key];
    const name=rule===undefined?key:typeof rule==='string'?rule:rule.as??key;
    if(name!==key&&Object.hasOwn(row,name))continue;
    const values=typeof rule==='object'?rule.values:undefined;
    const mapped=typeof item==='string'&&values&&Object.hasOwn(values,item)?values[item]:item;
    out[name]=typeof rule==='object'&&rule.shape?english(mapped,rule.shape):mapped;
  }
  return out;
}
const USAGE_SHAPE:Shape={giri:'turns'};// E-03: the token counters stay (clean() allows them), the turn count reads `turns`
/* 0.6.15 T5: the person's copy of the message for the screen (bolla-della-persona.mjs `bollaValida`), with the device it came
   from when remote control sent it (origine-remota.mjs `{tipo:'telefono',nome}`, set only by the kernel's in-process call).
   On screen and in JSON it is a «device» (owner 22/10). */
const BUBBLE_SHAPE:Shape={testo:'text',
  allegati:{as:'attachments',shape:{tipo:'type',nome:'name',percorso:'path',daBrowser:'fromBrowser',caratteri:'characters'}},
  origine:{as:'origin',shape:{tipo:{as:'kind',values:{telefono:'device'}},nome:'name'}}};
const RUN_STARTED_SHAPE:Shape={
  input:{shape:{
    consegna:'prompt',consegnaCorta:'shortPrompt',progetto:'project',seguito:'followUp',reindirizzato:'redirected',
    immagini:{as:'images',shape:{tipo:{as:'type',values:{immagine:'image'}},nome:'name',byte:'bytes'}},
    bolla:{as:'bubble',shape:BUBBLE_SHAPE},
  }},
  contesto:{as:'context',shape:{progetto:'project',cartella:'folder',repoAnnidati:'nestedRepos',modello:'model',permessi:'permissions',
    /* 0.6.15 (0614b triage, R12): the operating mode (agent-service.mjs `modalitaOperativa`), the names of `origin.mode` */
    modalitaOperativa:{as:'mode',values:{normale:'normal',piano:'plan'}},
    /* review block 3 (Desktop, 26/10/2026): agent-service.mjs `cartellaBase` (where the chat's files are, when it is not the
       permissions' root) and `pianoConAttrezzo` (the plan is presented with the tool this turn) */
    cartellaBase:'baseFolder',pianoConAttrezzo:'planWithTool'}},
};
/* review block 3: the permission sentences of the kernel (talosHarness.mjs `fraseDiPermesso`: sentence, key and its parameters) */
const PHRASE_PARAMS:Shape={cartella:'folder',collegamento:'link',cosa:'what',linux:'linux',ospite:'host',percorso:'path',utente:'user'};
const PHRASE_SHAPE:Shape={frase:'sentence',fraseChiave:'sentenceKey',fraseParams:{as:'sentenceParams',shape:PHRASE_PARAMS}};
/* decision 155: `cancellazioneCritica.perche` (cancellazioni-critiche.mjs) → talosHarness.mjs CHIAVE_CRITICA, pinned by test/protocol/v2-critical-delete.test.ts */
const CRITICAL_DELETE_WHY:Readonly<Record<string,string>>={radice:'root','primo-livello':'topLevel',telefono:'phone',casa:'home',progetto:'project',
  'sopra-il-progetto':'aboveProject',sostituzione:'substitution','cartella-del-telefono':'phoneFolder','dati-dell-app':'appData',
  'tutti-i-progetti':'projectsFolder','troppo-annidato':'tooNested',
  /* 0.6.16 (desktop permissions repair, 36c386138): a command too complex to read before it runs */
  'troppo-complesso':'tooComplex'};
/* confine-dati.mjs LUOGHI and «altro»: the kind of place a suspicious text came from */
const PLACE_TYPES:Readonly<Record<string,string>>={file:'file',comando:'command',prove:'tests',ricercaFile:'fileSearch',pagina:'page',ricercaWeb:'webSearch',
  libreria:'library',rapporto:'report',conversazione:'conversation',strumento:'tool',cartella:'folder',progetto:'project',delega:'delegation',
  workflow:'workflow',automazione:'automation',altro:'other'};
const APPROVAL_REQUIRED_SHAPE:Shape={azione:{as:'action',shape:{
  tipo:'tool',percorso:'path',comando:'command',formato:'format',
  /* R-34 part 2: a local model's call written as text (talosHarness.mjs `verificaChiamataDalTesto`) */
  semprePersona:'alwaysPerson',nome:'name',
  /* 0.6.15 (0614b triage, R12): a write's texts before and proposed (talosHarness.mjs `contenutoPrima`/`contenutoProposto`) */
  contenutoPrima:'contentBefore',contenutoProposto:'proposedContent',
  /* twin repair of desktop 0.2.2 (0.6.15): the arguments of a connector, plugin or Tool Forge call, masked and cut by the kernel
     (talosHarness.mjs `argomentiPerLaCarta`), and how many values it cut. The NAMES inside stay the tool's own: never translated */
  argomenti:'arguments',argomentiTagliati:'argumentsCut',
  /* review block 3 (Desktop, 26/10/2026), the rest of the action's Italian keys, as talosHarness.mjs emits them:
     a write outside the session folder (:11044), content marked suspicious (:11041, :12585, confine-dati.mjs `luogoDellaFonte`),
     an agent start that needs the person (:10622), a command as root in WSL (:12242), a network path (:12505) */
  fuoriDalProgetto:{as:'outsideProject',shape:{cartella:'folder'}},
  contenutoSospetto:{as:'suspiciousContent',shape:{fonte:'source',motivi:'reasons',luogo:{as:'place',shape:{tipo:{as:'type',values:PLACE_TYPES},nome:'name'}}}},
  coordinazione:{as:'coordination',shape:{motivo:{as:'reason',values:{tetto:'cap',spenta:'off'}}}},
  wslRoot:{shape:{distro:'distro',utente:'user',nessunUtenteNormale:'noNormalUser',sceltoDalComando:'chosenByCommand',...PHRASE_SHAPE}},
  percorsoDiRete:{as:'networkPath',shape:{ospite:'host',via:{values:{stringa:'string',collegamento:'link',cartella:'folder'}},ambito:{as:'scope',values:{sessione:'session'}},collegamento:'link',...PHRASE_SHAPE}},
  /* 0.6.8: the class VALUE in English too (it leaked «segreto»), the same names as security/from-approval.ts */
  segreto:{as:'sensitive',shape:{classe:{as:'class',values:{segreto:'secret',portachiavi:'keychain','fuori-workspace-nascosto':'outside-hidden','fuori-workspace':'outside'}},percorso:'path',frase:'sentence',nascosto:'hidden',
    /* review block 3: path-policy.mjs:342 (the content looks like a key) and the computer's own login credential */
    contenuto:'content',credenzialeDellaCasa:'homeCredential',fraseChiave:'sentenceKey',fraseParams:{as:'sentenceParams',shape:PHRASE_PARAMS},
    /* candidate 04/11/2026 (path-policy.mjs CHIAVI_DELLA_FRASE, «il perché vince sulla classe»): why the guard asked, when it is not the file itself */
    perche:{as:'reason',values:{biglietti:'sign-in-link','troppo-complesso':'too-complex'}}}},
  /* 06/11 realignment (decision 155, kernel bb3c61b4d `cancellazioneCriticaDaDire`): the card of a critical deletion, the names
     security/from-approval.ts reads (`criticalDelete`, `path`, `why`); the reason's English is the kernel's own key tail
     (talosHarness.mjs CHIAVE_CRITICA, the one permission-engine.ts already reads as `tooNested`) */
  cancellazioneCritica:{as:'criticalDelete',shape:{percorso:'path',perche:{as:'why',values:CRITICAL_DELETE_WHY},...PHRASE_SHAPE}},
  /* decision 373: the card of a TALOS control file (session-registry.mjs `cancelloShellDelComputerUse`, the per-path gate), the name
     security/from-approval.ts reads */
  fileDiControllo:'controlFile',
  /* A5f: «always» is not enough on this card (session-registry.mjs, C2-a, C2b, `cartaPerFileDiControllo`), read by from-approval.ts */
  sempreNonBasta:'alwaysNotEnough',
  /* 0.6.15 T6: the devices' tool cards (session-registry.mjs `ospiteTelefoni`): the device, the folder, the file, remote control's state */
  telefono:{as:'device',shape:{idCorto:'shortId',nome:'name',piattaforma:'platform',inLinea:'online',ultimaVoltaAlle:'lastSeenAt'}},
  cartella:{as:'folder',shape:{cartellaId:'folderId',nome:'name',percorso:'path'}},
  file:{shape:{nome:'name',dimensione:'size',percorso:'path'}},
  acceso:'on',ponte:{as:'relay',values:{proprio:'own'}},ponteProposto:{as:'proposedRelay',values:{proprio:'own'}},
  telefoni:'devices',dispositivi:'devices',inLinea:'online',
}}};
const APPROVAL_RESOLVED_SHAPE:Shape={approvato:'approved'};
/* Stage 3 (registro 12): the questions are the kernel contract's English fields already (user-question-contract.mjs);
   the bookkeeping is the kernel's Italian, mapped value by value from what session-registry.mjs writes. */
const QUESTION_REQUIRED_SHAPE:Shape={
  origine:{as:'origin',shape:{modalita:{as:'mode',values:{normale:'normal',piano:'plan'}},agente:{as:'agent',values:{principale:'root'}}}},
  ripristinabile:'restorable',
};
const QUESTION_RESOLVED_SHAPE:Shape={
  da:{as:'by',values:{persona:'person',sistema:'system'}},
  motivo:{as:'reason',values:{'nessuna-interfaccia':'no-interface',interrotta:'interrupted','non-salvata':'not-saved',
    'nuovo-messaggio':'new-message',reindirizzamento:'redirected',fermato:'stopped'}},
};
/* Stage 3, the plan card (owner 02/10): plan-contract.mjs `talos.plan.v1`, the person's four decisions and the closes, in English. */
const PLAN_DECISIONS:Record<string,string>={'procedi-con-conferma':'ask-before-edits','procedi-accetta-modifiche':'accept-edits',
  'conversazione-pulita':'clean-conversation','continua-a-pianificare':'keep-planning'};
const PLAN_REASONS:Record<string,string>={'nuovo-messaggio':'new-message',reindirizzamento:'redirected',fermato:'stopped',interrotta:'interrupted'};
const PLAN_BY:Record<string,string>={persona:'person',sistema:'system'};
function planData(value:Record<string,unknown>){
  if(value.schema!=='talos.plan.v1'||typeof value.requestId!=='string'||!value.requestId)return null;
  const status=String(value.status??'');
  const text=(key:string)=>typeof value[key]==='string'&&value[key]?{[key]:value[key] as string}:{};
  const common={...text('planId'),...(Number.isSafeInteger(value.revision)?{revision:value.revision as number}:{}),requestId:value.requestId,...text('hash'),...text('toolCallId')};
  if(status==='proposed'){
    return{type:'plan.required' as const,data:{...common,...(typeof value.content==='string'?{content:value.content}:{}),
      ...(typeof value.ripristinabile==='boolean'?{restorable:value.ripristinabile}:{}),...text('at')}};
  }
  if(status!=='approved'&&status!=='changes-requested'&&status!=='cancelled')return null;
  const decision=PLAN_DECISIONS[String(value.decisione)],reason=PLAN_REASONS[String(value.motivo)],by=PLAN_BY[String(value.da)];
  return{type:'plan.resolved' as const,data:{...common,status,...(decision?{decision}:{}),...text('feedback'),
    ...(typeof value.nuovaSessionId==='string'&&value.nuovaSessionId?{newSessionId:value.nuovaSessionId}:{}),
    ...(by?{by}:{}),...(reason?{reason}:{}),...text('at')}};
}
/* Stage 3, pezzo 13c: the kernel's own mode changes (CUSTOM talos.impostazioni-sessione) in the CLI's mode words, the
   inverse of session-facade.ts registryPermission/registryOperatingMode; a permission the CLI never sends is not invented. */
const MODE_BY_PERMISSION:Record<string,string>={'On request':'default','Workspace write':'acceptEdits'};
const MODE_REASONS:Record<string,string>={'piano-richiesto-dal-modello':'model-requested','piano-approvato':'plan-approved'};
function sessionModeData(value:Record<string,unknown>){
  const mode=value.modalitaOperativa==='piano'?'plan':value.modalitaOperativa==='normale'?MODE_BY_PERMISSION[String(value.permessi)]:undefined;
  if(!mode)return null;
  const reason=MODE_REASONS[String(value.motivo)];
  const version=settingsVersion(value);
  return{mode,...(reason?{reason}:{}),...(version!==null?{version}:{})};
}
/*
 * Owner 27/10/2026 («da remoto il dispositivo collegato deve poter cambiare tutte le impostazioni e sul pc devono essere visibili
 * subito»; Desktop f573cdc93, the shape of Codex `thread/settings/updated`): the same CUSTOM now carries `istantanea`, the WHOLE
 * settings of the session with a `versione` that only grows. A change of settings, of the name or a provider switch is
 * `session.settings.changed` (additive); the plan's own changes stay `session.mode.changed`, now with the version, so a reader
 * drops a snapshot older than one it has from either.
 */
const SETTINGS_REASONS:Record<string,string>={impostazioni:'settings',nome:'name','cambio-fornitore':'provider-switch'};
function settingsVersion(value:Record<string,unknown>):number|null{
  const snapshot=objectValue(value.istantanea);const version=snapshot?.versione;
  return Number.isSafeInteger(version)&&(version as number)>=0?version as number:null;
}
function sessionSettingsData(value:Record<string,unknown>){
  const snapshot=objectValue(value.istantanea);const version=settingsVersion(value);
  const reason=SETTINGS_REASONS[String(value.motivo)];
  if(!snapshot||version===null||!reason)return null;
  const reasoning=snapshot.reasoning;
  const effort=typeof reasoning==='string'?reasoning:stringValue(objectValue(reasoning)?.effort);
  const mode=sessionModeData(value)?.mode;
  const origin=objectValue(value.origine);
  return{version,reason,model:stringValue(snapshot.modello),reasoningEffort:effort||null,...(mode?{mode}:{}),name:stringValue(snapshot.nome),
    origin:origin?.tipo==='dispositivo'&&stringValue(origin.dispositivoId)?{kind:'device',deviceId:origin.dispositivoId as string}
      /* Desktop block 11 (r4 6a4fc5e2b): `origine.tipo:'modello'` is a change the model asked for; never the person at the PC */
      :origin?.tipo==='modello'?{kind:'model'}:{kind:'computer'}};
}
/* Stage 3 (owner 02/10): the kernel's parent↔child dialogue, its fields already English (session-registry.mjs dialogueEvent). */
const DIALOGUE_DIRECTIONS=new Set(['child-to-parent','parent-to-child']);
const DIALOGUE_STATUSES=new Set(['requested','answered','cancelled']);
function agentDialogueData(value:Record<string,unknown>){
  if(value.version!==1||typeof value.requestId!=='string'||!value.requestId||typeof value.childId!=='string'||!value.childId)return null;
  if(!DIALOGUE_DIRECTIONS.has(String(value.direction))||!DIALOGUE_STATUSES.has(String(value.status))||typeof value.question!=='string')return null;
  const text=(key:string)=>typeof value[key]==='string'&&value[key]?{[key]:value[key] as string}:{};
  return{requestId:value.requestId,...text('parentId'),childId:value.childId,direction:value.direction as string,status:value.status as string,
    question:value.question,...text('answer'),...text('reason'),...text('at')};
}
const RUN_COMPLETED_SHAPE:Shape={
  outcome:{values:{concluso:'completed',fermato:'stopped'}},// session-registry.mjs:2677,2691
  result:{shape:{detto:'text',compattazioni:'compactions',premesseNegate:'deniedPremises',usage:{shape:USAGE_SHAPE}}},
};
const TOOL_DETAILS_SHAPE:Shape={durataMs:'durationMs',comando:'command'};
/* 0.6.15 (0614b F-L-001, R12): the receipt's Italian keys and values in English; `kernel-map.ts` holds the values, pinned to the kernel */
const RECEIPT_DETAILS_SHAPE:Shape={azione:'tool',percorso:'path',comando:'command',hashContenuto:'contentHash',
  postcondizione:{as:'postcondition',values:RECEIPT_POSTCONDITION},
  consentitoDa:{as:'allowedBy',shape:{tipo:{as:'kind',values:RECEIPT_ALLOWED_BY_KIND}}}};
function receiptVia(value:unknown){const via=stringValue(value);return via!==null&&Object.hasOwn(RECEIPT_VIA,via)?RECEIPT_VIA[via]!:via;}
function englishRecord(value:Record<string,unknown>,shape:Shape){return english(value,shape) as Record<string,unknown>;}
/** Gate §8: the approval names its tool twice — the kernel id (`tool`, a stable contract) and the English label. */
function approvalRequired(data:Record<string,unknown>){
  const out=englishRecord(data,APPROVAL_REQUIRED_SHAPE);
  const action=objectValue(out.action);const tool=stringValue(action?.tool);
  if(action&&tool&&action.displayName===undefined)out.action={...action,displayName:toolDisplay(tool).label};
  return out;
}

/*
 * Q-R2-4 (owner 2026-09-24): the v2 envelope carries what happened / what to do / where to look as fields, filled by lane E's
 * `describeError` (the one error describer, gate E6); `code`, `message` and the rest of the envelope stay as they were. The
 * words pass the same redactor as every v2 string. A describer that throws is reported as the failure message itself: an
 * error about an error must never lose the original failure (a guard that explodes is absent).
 */
function v2Error(source:unknown,failure:TalosFailure,redactText:(value:string)=>string):TalosV2Error{
  let view:ReturnType<typeof describeError>|null=null;
  try{view=describeError(source);}catch{view=null;}
  const text=(value:unknown)=>typeof value==='string'&&value.length>0?redactText(value):null;
  /* Owner decision 2026-09-24 (Q-R2-2 applied to JSON): `message` is the English headline, as on screen; the original
     (already redacted) message moves to `raw`, for diagnosis, and only when it says something else. */
  const what=text(view?.what)??failure.message;
  /* R5a lane R (Q-R5-6, additive): the HTTP status and the provider's requested wait travel as fields, so a later
     `describeError` of this v2 error (the TUI's) still tells 401 from 403 and names a known wait. */
  const row=source&&typeof source==='object'?source as Record<string,unknown>:null;
  const status=numberValue(row?.stato)??numberValue(row?.status);const retryAfterMs=numberValue(row?.retryAfterMs);const resetsAt=numberValue(row?.resetsAt);
  /* 0.6.13 (additive): a request too large for the model carries its four numbers, in English (runtime/request-too-large.ts) */
  const tooLarge=requestTooLargeOf(row);
  /* Z piece C (additive): «too long for this model» with the kernel's diagnosis, in English (runtime/context-full.ts) */
  const contextFull=contextFullOf(row);
  /* 0.6.13 Z review (23/10/2026, measured on the built CLI): the kernel's provider class (`classe:'contesto'`, `'credito'`…) was not on
     the v2 error, and the screen describes that error again (event-adapter.ts `run.failed`): a «too long for this model» read there
     as «the provider did not accept the request», and Z.AI's empty balance on HTTP 429 as a rate limit. It travels in English. */
  const providerClass=typeof row?.classe==='string'&&Object.hasOwn(KERNEL_CLASSES,row.classe)?KERNEL_CLASSES[row.classe]:null;
  return{message:what,...(failure.message&&failure.message!==what?{raw:failure.message}:{}),envelope:{...failure.envelope,what,todo:text(view?.todo),where:text(view?.where)},
    ...(status!==null?{status}:{}),...(retryAfterMs!==null?{retryAfterMs}:{}),...(resetsAt!==null?{resetsAt}:{}),...(tooLarge?{requestTooLarge:tooLarge}:{}),...(contextFull?{contextFull}:{}),...(providerClass?{providerClass}:{})};
}
function transient(type:TalosV2EventType){
  return type==='message.started'||type==='message.delta'||type==='message.completed'
    ||type==='reasoning.started'||type==='reasoning.delta'||type==='reasoning.completed'
    ||type==='tool.started'||type==='tool.args'||type==='tool.output'
    ||type==='usage.updated'||type==='warning'||type==='provider.attempt';
}
/*
 * R5a lane R (Q-R5-4/5/6, gate E3/E9, additive): the CUSTOM rows v2 now reads. v1 maps no CUSTOM row, so it is unchanged.
 * - `talos.cli.provider.attempt` / `talos.cli.context.compacted`: the CLI's own live facts (runtime/provider-attempts.ts);
 * - `talos.context` of kind `context.version.committed`: the Context Engine committed a compacted version
 *   (context-engine/src/node/sqlite-worker.mjs `activate`), persisted by the kernel, so it replays;
 * - `talos.cli.provider.failure`: folded into the next `run.failed` (status, requested wait), never an event of its own;
 * - `consumo-fornitore`: one model request's own usage and declared cost (runtime-owner-adapter.mjs:978), folded into the
 *   next `usage.updated` as `lastRequest` and `declaredCostUsd` (measured order: the row precedes its /usage delta).
 */
function countOrNull(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value):null;}
const FALLBACK_REASON_VALUES:ReadonlySet<string>=new Set(['target','brake','time','skipped','exhausted','refused']);
/* review 14 R14-1 of 0.6.13: journal `fine` rows that are not an in-turn compaction; each keeps its own words (/compact, end of turn, brake) */
const JOURNAL_NOT_IN_TURN:ReadonlySet<string>=new Set(['background','manuale','freno']);
function compactionData(value:Record<string,unknown>|null,engine:'kernel'|'context-engine'){
  const trigger=value?.trigger==='manual'||value?.trigger==='automatic'?value.trigger:null;
  return{engine,messagesSummarized:countOrNull(value?.messagesSummarized),tokensBefore:countOrNull(value?.tokensBefore),tokensAfter:countOrNull(value?.tokensAfter),
    ...(trigger?{trigger}:{}),...(value?.method==='tool-results'||value?.method==='images'||value?.method==='without-model'?{method:value.method}:{}),...(typeof value?.fallbackReason==='string'&&FALLBACK_REASON_VALUES.has(value.fallbackReason)?{fallbackReason:value.fallbackReason}:{}),...(countOrNull(value?.imagesReplaced)?{imagesReplaced:countOrNull(value?.imagesReplaced)}:{}),...(value?.afterRefusal===true?{afterRefusal:true}:{}),...(value?.emergency===true?{emergency:true,...(countOrNull(value?.emergencyThreshold)?{emergencyThreshold:countOrNull(value?.emergencyThreshold)}:{})}:{}),...(value?.causeUnknown===true&&value?.emergency!==true&&value?.afterRefusal!==true?{causeUnknown:true}:{}),...(typeof value?.at==='string'&&/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u.test(value.at)?{at:value.at}:{}),...(typeof value?.versionId==='string'?{versionId:value.versionId}:{})};
}
/*
 * Desktop CE fix 5f78b1316+4ceb232a5 (aligned 2026-09-25): after a refused or failed automatic compaction the engine waits
 * 60 s, then 300, then 900 before trying again, and says so ONCE per failed job (`context.compaction.cooling`, id
 * `cooling-<jobId>`, payload {code, attempts, waitSeconds, retryAfter}). A row without a readable time or code says nothing.
 */
function pausedFields(value:Record<string,unknown>|null){
  const payload=objectValue(value?.payload);const code=stringValue(payload?.code);const retryAfter=stringValue(payload?.retryAfter);
  if(!code||!retryAfter||!Number.isFinite(Date.parse(retryAfter)))return null;
  return{noticeId:stringValue(value?.id),code,attempts:countOrNull(payload?.attempts),waitSeconds:countOrNull(payload?.waitSeconds),retryAfter};
}
/*
 * ASYNC (owner 01/10): the kernel announces a delegated agent to its parent and every ancestor (session-registry.mjs
 * `annunciaAgenteAgliAntenati`, CUSTOM `talos.agenti` {childId, parentId, reason, agent, operation}). Only machine fields
 * leave here: the reason, the operation's kind and status, the child's short task and whether it ended — never the
 * kernel's Italian labels. A row without a child id says nothing.
 */
const AGENT_REASONS=new Set(['created','updated','completed']);
function agentChangedData(value:Record<string,unknown>|null){
  const childId=stringValue(value?.childId);if(!childId)return null;
  const agent=objectValue(value?.agent);const operation=objectValue(value?.operation);const reason=stringValue(value?.reason);
  return{childId,parentId:stringValue(value?.parentId),reason:reason&&AGENT_REASONS.has(reason)?reason:'updated',
    kind:stringValue(operation?.kind),status:stringValue(operation?.status),task:stringValue(agent?.taskCorto),
    /* 0.6.8 (owner 16/10/2026 L3-17, «un nome solo ovunque», r4 23206132c): the agent's NAME, the one it was born with — its
       task's short name, «-N» among sisters that share it (`nomeDiNascita`, session-registry.mjs); null for older delegations */
    name:stringValue(agent?.nome),
    /* ASYNC step 3: the tool the child is running (the kernel's name, mapped for display by the CLI), when it started, and
       whether the kernel stopped it (`interrotta`); a stopped child has ended. */
    tool:stringValue(operation?.toolName),startedAt:stringValue(agent?.avviataAlle),interrupted:agent?.interrotta===true||agent?.motivoChiusura==='fermata',
    /* the number of files a `files` step updated: the kernel says it only inside its label («2 file aggiornati») */
    count:operation?.kind==='files'?countOrNull(Number(/^(\d+)\b/u.exec(String(operation?.label??''))?.[1]??NaN)):null,
    ended:agent?.conclusa===true||agent?.interrotta===true||reason==='completed',
    /* Stage 6a: what the agents panel shows beside each child — the whole task, when it ended, its tokens (the session's
       prompt + completion, as the kernel's own conversation list counts them), its model, the approvals waiting on the person. */
    prompt:delegatedTask(stringValue(agent?.task)),endedAt:stringValue(agent?.conclusaAlle),
    tokens:agentTokens(objectValue(agent?.usageSessione)),model:stringValue(agent?.modello),
    approvalsPending:countOrNull(agent?.approvalPendingCount),
    /* Stage 6b: a question the child asks the person waits (kernel `questionPendingCount`, with the host's `domandeDeiFigli`). */
    questionsPending:countOrNull(agent?.questionPendingCount)};
}
/* g-q20 (registro 12): `task` is the child's whole prompt — the kernel's Italian preamble, then the delegated task after
   «Compito:» (subagent-orchestrator.mjs `compitoDaPromptDiDelega`, the same rule). Without the marker nothing is guessed: no
   prompt, and the panel shows the short task. */
function delegatedTask(prompt:string|null):string|null{
  if(!prompt)return null;
  const marker=/(?:^|[.\n])\s*Compito\s*:\s*/u.exec(prompt);
  const task=marker?prompt.slice(marker.index+marker[0].length).trim():'';
  return task||null;
}
function agentTokens(usage:Record<string,unknown>|null):number|null{
  if(!usage)return null;const prompt=countOrNull(usage.prompt_tokens),completion=countOrNull(usage.completion_tokens);
  return prompt===null&&completion===null?null:(prompt??0)+(completion??0);
}
function requestUsage(value:Record<string,unknown>|null){
  const usage=objectValue(value?.usage);if(!usage)return null;
  const details=objectValue(usage.prompt_tokens_details);
  const inputTokens=countOrNull(usage.prompt_tokens??usage.input_tokens),outputTokens=countOrNull(usage.completion_tokens??usage.output_tokens);
  if(inputTokens===null&&outputTokens===null)return null;
  return{provider:stringValue(value?.provider),model:stringValue(value?.model),inputTokens,outputTokens,cachedTokens:countOrNull(details?.cached_tokens??usage.cache_read_input_tokens??usage.prompt_cache_hit_tokens)};
}

/* F-Q1: a queued item as the protocol carries it. Only a person's own words travel as text; a sub-agent's result travels as its
   parsed fields (never the model-facing preface or JSON), a dialogue message as who sent it; a background command's exit and a
   workflow run's result as their origin only (the kernel's note is written for the model). */
function queueItemData(item:{id:string;text:string;images:number;origin:CliKernelQueueOrigin;childId?:string;bubble?:unknown},{summary=false}:{summary?:boolean}={}){
  const base={id:item.id,origin:item.origin,...(item.childId?{childId:item.childId}:{})};
  /* 0.6.15 T5: a person's queued message keeps its screen copy, so a message sent from a device says so when it is delivered */
  const bubble=item.origin==='person'?objectValue(item.bubble):null;
  if(item.origin==='person')return{...base,text:item.text,images:item.images,...(bubble?{bubble:englishRecord(bubble,BUBBLE_SHAPE)}:{})};
  if(item.origin==='delegation'){const result=parseDelegationResult(item.text,item.childId);return result?{...base,result:{status:result.status,task:result.task,name:result.name??null,...(summary?{summary:result.summary}:{})}}:base;}
  return base;
}

export function createV2EventBridge(
  sessionId:string,
  clock:()=>string=()=>new Date().toISOString(),
  secretValues:readonly string[]=[]
){
  let synthetic=0;
  const redactor=createRedactor(secretValues);
  const messageBuffers=new Map<string,string>();
  const reasoningBuffers=new Map<string,string>();
  /* R5a lane R: facts held for the next event of their run (see the CUSTOM rows above). */
  let pendingFailure:{status:number|null;retryAfterMs:number|null;resetsAt:number|null}|null=null;
  let lastRequest:ReturnType<typeof requestUsage>=null;let declaredCost:number|null=null;
  const compactionWarnings=createCompactionWarnings();
  /* review 14 R14-1 of 0.6.13: who named each in-turn compaction (its record's `at`): the CLI's live event, or the journal's durable row */
  const namedAt=new Map<string,'cli'|'journal'>();
  /* judge v1541, v1597: what each in-turn compaction's `inizio` row said (its `motivo` and `soglia`), read at its end by the same
     function as live (provider-attempts.ts compactionCauseOf) */
  const startedAt=new Map<unknown,{motivo:unknown;soglia:unknown}>();
  const nameAt=(at:string,by:'cli'|'journal')=>{namedAt.set(at,by);if(namedAt.size>512)namedAt.delete(namedAt.keys().next().value!);};
  const resetRun=()=>{pendingFailure=null;lastRequest=null;declaredCost=null;};
  return{
    translate(raw:unknown):TalosV2Event|null{
      if(!raw||typeof raw!=='object')return null;
      const original=raw as Record<string,unknown>;
      const r=clean(original,redactor.text) as Record<string,unknown>;
      const sequence=nativeSequence(original._sequenza);
      const next=(type:TalosV2EventType,data:Record<string,unknown>,durability:TalosV2Durability=transient(type)?'transient':'durable')=>
        baseEvent({sessionId,sequence,synthetic:++synthetic,clock,durability,type,data});
      const pausedData=(value:Record<string,unknown>|null)=>{const fields=pausedFields(value);return fields?next('context.compaction.paused',fields,'durable'):null;};
      switch(String(r.type)){
        case 'RunStarted':
          resetRun();
        {
          /* ASYNC step 2 (owner 01/10): a turn the kernel started to hand its parent the results of delegated agents
             (`origine: 'delega'`) is not the person's prompt: it carries the parsed results, never the model-facing text. */
          const results=delegationResultsOf(r.input);
          const data=englishRecord(withoutMeta(r,redactor.text),RUN_STARTED_SHAPE);
          if(results.length){
            const input=objectValue(data.input)??{};
            const {prompt:_prompt,shortPrompt:_short,...rest}=input as Record<string,unknown>;
            for(const key of ['origine','childIds','risultatiDelega'])delete (rest as Record<string,unknown>)[key];
            data.input={...rest,origin:'delegation',delegationResults:results};
          }
          /* A turn the kernel started to hand over a background command's exit (`origine: 'sfondo'`) or a workflow run's result
             (`origine: 'workflow'`): its prompt is the kernel's note for the model, never the person's words. */
          const handed=objectValue(data.input);const handedOrigin=queueOriginOf(handed?.origine);
          if(handed&&(handedOrigin==='background'||handedOrigin==='workflow')){
            const {prompt:_prompt,shortPrompt:_short,bubble:_bubble,origine:_origin,codaIds,risultatiSfondo:_bg,risultatiWorkflow:_wf,...rest}=handed;
            data.input={...rest,origin:handedOrigin,...(Array.isArray(codaIds)?{queueIds:codaIds}:{})};
          }
          return next('run.started',data,'durable');
        }
        case 'CUSTOM':{
          const name=String(r.name??'');const value=objectValue(r.value);
          if(name===CLI_EVENT.attempt){
            const attempt=countOrNull(value?.attempt),maxAttempts=countOrNull(value?.maxAttempts);
            return attempt===null||maxAttempts===null?null:next('provider.attempt',{attempt,maxAttempts,status:countOrNull(value?.status),retryAfterMs:countOrNull(value?.retryAfterMs),waitMs:countOrNull(value?.waitMs),...(value?.planLimit===true?{planLimit:true,resumesAt:countOrNull(value?.resumesAt)}:{})});
          }
          if(name===CLI_EVENT.compactionUndone&&typeof value?.at==='string')return next('context.compaction.undone',{at:value.at,reason:value?.reason==='turn-failed'?'turn-failed':'unknown'},'transient');
          if(name===CLI_EVENT.compacted){
            const at=typeof value?.at==='string'?value.at:null;if(at&&namedAt.get(at)==='journal')return null;if(at)nameAt(at,'cli');
            compactionWarnings.rearm();return next('context.compacted',compactionData(value,'kernel'),'transient');}
          if(name===CLI_EVENT.summaryRequested)return next('context.summary.requested',{},'transient');
          /* 0.6.9: a trusted MCP server that did not start keeps its code, its server and its reason (MCP_START_FAILED) */
          if(name===CLI_EVENT.notice&&typeof value?.message==='string')return next('warning',value?.code===MCP_START_FAILED&&typeof value?.serverId==='string'
            ?{code:MCP_START_FAILED,serverId:value.serverId,reason:typeof value?.reason==='string'?value.reason:'',message:value.message}:{message:value.message});
          /* 0.6.13: a compaction that did not happen is a durable warning (compactionFailureWarning above); `value` is already redacted */
          /* review 3 of 0.6.13 (S3-1, 22/10/2026): the registry's end-of-turn summary (`motivo:'background'`, session-registry.mjs) is a
             compaction the next turn starts from, and it was never named (owner Q-R5-4: «a compaction is named when it happens»).
             It is named here, from the kernel's durable event, so a replay names it again where it happened; the adapter's in-turn
             compactions and /compact are named by the CLI's own events (provider-attempts.ts `onCompaction`, `compactSession`). */
          /* review 10 R10-6 (with the kernel's cure): an end-of-turn row with no summary (`soloCoda`) is named as what it shortened, as
             the in-turn row is (provider-attempts.ts `onCompaction`), and is quiet when it shortened no tool output and no image */
          if(name==='talos.compattazione'&&value?.fase==='fine'&&value?.compattato===true&&value?.motivo==='background'&&value?.soloCoda===true){
            const trimmed=countOrNull(value.ridotti)??0,images=countOrNull(value.immagini)??0;if(trimmed===0&&images===0)return null;
            return next('context.compacted',compactionData({tokensBefore:value.tokenPrima,tokensAfter:value.tokenDopo,trigger:'automatic',method:trimmed>0?'tool-results':'images',...(images>0?{imagesReplaced:images}:{})},'kernel'),'durable');}
          if(name==='talos.compattazione'&&value?.fase==='fine'&&value?.compattato===true&&value?.motivo==='background'){compactionWarnings.rearm();return next('context.compacted',compactionData({tokensBefore:value.tokenPrima,tokensAfter:value.tokenDopo,trigger:'automatic'},'kernel'),'durable');}
          /* review 14 R14-1 of 0.6.13: an in-turn compaction (the desktop adapter's row, with its `giro`) is named live by the CLI's own event
             above, which comes first (talos-composition.ts reads `onGiro` before the kernel writes the row). After `--resume` only this
             durable row is left, and it was drawn as a bare «compacted by the kernel… summarized». It is named here from the row, by the
             same reading as live (provider-attempts.ts `compactionFactOf`), once: a row whose `at` the CLI already named says nothing
             more. Its annulment by a failed turn takes it back the same way. /compact, the end-of-turn rows and the brake keep theirs. */
          if(name==='talos.compattazione'&&value?.fase==='fine'&&value?.compattato===true&&Number.isSafeInteger(value?.giro)&&!JOURNAL_NOT_IN_TURN.has(String(value?.motivo))
            &&typeof value?.at==='string'&&!namedAt.has(value.at)){
            const fact=compactionFactOf(value,value,startedAt.get(value.giro));startedAt.delete(value.giro);
            if(fact?.at){compactionWarnings.warningFor(value);nameAt(fact.at,'journal');return next('context.compacted',compactionData({...fact},'kernel'),'durable');}
          }
          if(name==='talos.compattazione'&&value?.fase==='annullata'&&value?.motivo==='giro-fallito'&&typeof value?.at==='string'&&namedAt.get(value.at)==='journal')
            return next('context.compaction.undone',{at:value.at,reason:'turn-failed'},'durable');
          if(name==='talos.compattazione'&&value?.fase==='inizio'&&Number.isSafeInteger(value?.giro))startedAt.set(value.giro,{motivo:value.motivo,soglia:value.soglia});
          if(name==='talos.compattazione'){const warning=compactionWarnings.warningFor(value);return warning?next('warning',{...warning},'durable'):null;}
          /* Contract (a) of 22/10/2026: the kernel kept the person's request that did not fit the model as NOT SENT (durable CUSTOM
             `talos.richiesta-non-inviata {at, indice}`, `indice` its position in the raw history). Additive and durable, so a replay
             draws that request as not sent and never as a message the model received. */
          /* FE-049 (owner 01/11): the row under the answer, in the Desktop's words; a warning reaches the screen, the JSON and stderr, never stdout */
          /* A6 of the alignment: the kernel's beat while the model reasons (at most one every 5 s, never durable); the title is the model's text */
          if(name==='talos.ragionamento-in-corso'){const title=typeof value?.titolo==='string'?inertTerminalText(redactor.text(value.titolo)).trim():'';return next('reasoning.pulse',title?{title}:{},'transient');}
          if(name==='talos.riassunto-modello-inutilizzabile'){const model=typeof value?.modello==='string'&&value.modello?value.modello:t('screen.summaryModel.unnamed');
            return next('warning',{code:'SUMMARY_MODEL_UNUSABLE',message:t(SUMMARY_MODEL_WORDS[String(value?.motivo)]??'screen.summaryModel.other',{model})},'durable');}
          if(name==='talos.risultati-accorciati'){const count=countOrNull(value?.numero);return count?next('warning',{code:'RESULTS_SHORTENED',count,message:tn('screen.resultsShortened',count)},'durable'):null;}
          if(name==='talos.richiesta-non-inviata'){const index=countOrNull(value?.indice);return next('request.not_sent',{index,...(typeof value?.at==='string'&&value.at?{at:value.at}:{})},'durable');}
          if(name==='talos.context'&&value?.kind==='context.version.committed')return next('context.compacted',compactionData({versionId:value.versionId},'context-engine'),'durable');
          if(name==='talos.context'&&value?.kind==='context.compaction.cooling')return pausedData(value);
          if(name==='talos.agenti'){const data=agentChangedData(value);return data?next('agent.changed',data,'durable'):null;}
          if(name==='talos.coda'){const queue=kernelQueueOf(value);return next('queue.changed',{items:queue.items.map(item=>queueItemData(item)),paused:queue.paused},'durable');}
          if(name==='talos.agent-dialogue'&&value){const data=agentDialogueData(value);return data?next('agent.dialogue',data,'durable'):null;}
          if(name==='talos.impostazioni-sessione'&&value){
            const settings=sessionSettingsData(value);if(settings)return next('session.settings.changed',settings,'durable');
            const data=sessionModeData(value);return data?next('session.mode.changed',data,'durable'):null;
          }
          /* `value` is already redacted: translate cleans the whole record first */if(name==='talos.plan'&&value){const plan=planData(value);return plan?next(plan.type,plan.data,'durable'):null;}
          if(name===CLI_EVENT.failure){pendingFailure={status:countOrNull(value?.status),retryAfterMs:countOrNull(value?.retryAfterMs),resetsAt:countOrNull(value?.resetsAt)};return null;}
          if(name==='consumo-fornitore'){
            const request=requestUsage(value);if(request)lastRequest=request;
            const cost=numberValue(value?.costoDichiarato);if(cost!==null&&cost>=0)declaredCost=(declaredCost??0)+cost;
            return null;
          }
          return null;
        }
        case 'TextMessageStart':{
          const messageId=String(r.messageId??'assistant');messageBuffers.set(messageId,'');
          return next('message.started',{messageId,role:r.role==='user'?'user':'assistant'});
        }
        case 'TextMessageContent':{
          const messageId=String(r.messageId??'assistant');const delta=redactor.text(String(r.delta??''));
          messageBuffers.set(messageId,(messageBuffers.get(messageId)??'')+delta);
          return next('message.delta',{messageId,delta});
        }
        case 'TextMessageEnd':{
          const messageId=String(r.messageId??'assistant');const text=messageBuffers.get(messageId)??'';messageBuffers.delete(messageId);
          return next('message.completed',{messageId,text},'durable');
        }
        case 'ReasoningMessageStart':{
          const messageId=String(r.messageId??'reasoning');reasoningBuffers.set(messageId,'');
          return next('reasoning.started',{messageId});
        }
        case 'ReasoningMessageContent':{
          const messageId=String(r.messageId??'reasoning');const delta=redactor.text(String(r.delta??''));
          reasoningBuffers.set(messageId,(reasoningBuffers.get(messageId)??'')+delta);
          return next('reasoning.delta',{messageId,delta});
        }
        case 'ReasoningMessageEnd':{
          const messageId=String(r.messageId??'reasoning');const text=reasoningBuffers.get(messageId)??'';reasoningBuffers.delete(messageId);
          return next('reasoning.completed',{messageId,text},'durable');
        }
        case 'ToolCallStart':
          return next('tool.started',{toolCallId:String(r.toolCallId??''),toolName:String(r.toolCallName??r.name??'tool')});
        case 'ToolCallArgs':
          return next('tool.args',{toolCallId:String(r.toolCallId??''),delta:redactor.text(String(r.delta??''))});
        case 'ToolCallOutput':
          return next('tool.output',{toolCallId:String(r.toolCallId??''),delta:redactor.text(String(r.delta??''))});
        case 'ToolCallResult':{
          const result=toolResultFromNative(r);
          return result?next('tool.completed',result as unknown as Record<string,unknown>,'durable'):null;
        }
        case 'FileChanged':
          return next('file.changed',withoutMeta(r,redactor.text),'durable');
        case 'ApprovalRequested':
          return next('approval.required',approvalRequired(withoutMeta(r,redactor.text)),'durable');
        case 'ApprovalResolved':
          return next('approval.resolved',englishRecord(withoutMeta(r,redactor.text),APPROVAL_RESOLVED_SHAPE),'durable');
        /* Stage 3: MCP elicitation, already English except the bookkeeping (dominio ⇒ domain, da/motivo as the questions) */
        case 'McpElicitationRequested':{const d=withoutMeta(r,redactor.text);const {dominio,...rest}=d as Record<string,unknown>;return next('elicitation.required',{...rest,...(typeof dominio==='string'?{domain:dominio}:{})},'durable');}
        case 'McpElicitationResolved':
          return next('elicitation.resolved',englishRecord(withoutMeta(r,redactor.text),QUESTION_RESOLVED_SHAPE),'durable');
        case 'UserQuestionRequested':
          return next('question.required',englishRecord(withoutMeta(r,redactor.text),QUESTION_REQUIRED_SHAPE),'durable');
        case 'UserQuestionResolved':
          return next('question.resolved',englishRecord(withoutMeta(r,redactor.text),QUESTION_RESOLVED_SHAPE),'durable');
        case 'StateDelta':{
          const rows=Array.isArray(r.delta)?r.delta as Array<Record<string,unknown>>:[];
          const usage=rows.find(row=>row?.path==='/usage');
          return usage?next('usage.updated',{value:english(usage.value,USAGE_SHAPE),...(lastRequest?{lastRequest:{...lastRequest}}:{}),...(declaredCost!==null?{declaredCostUsd:declaredCost}:{})}):null;
        }
        case 'QueuedMessageDelivered':{
          const origin=queueOriginOf(r.origine);
          return next('queue.delivered',queueItemData({id:stringValue(r.codaId)??'',text:String(r.testo??''),images:Array.isArray(r.immagini)?r.immagini.length:0,origin,...(stringValue(r.childId)?{childId:stringValue(r.childId)!}:{}),bubble:r.bolla},{summary:true}),'durable');
        }
        case 'RuntimeFallback':
          return next('warning',{message:redactor.text(String(r.message??r.reason??'runtime fallback'))});
        /* Owner 11/10/2026: a hook that says no to a tool is shown with its name and reason (the kernel blocks the tools that
           change something; the tool's own row says REFUSED). A hook that allows stays silent. */
        case 'HookInvoked':{
          const esito=objectValue(r.esito);
          if(r.tipo!=='pre_tool_call'||esito?.consentito!==false)return null;
          const tool=stringValue(r.azione);const reason=stringValue(esito.motivo);
          return next('warning',{code:'HOOK_REFUSED',hookId:String(r.hookId??''),...(tool?{tool}:{}),message:redactor.text(hookRefusalText(String(r.hookId??''),tool?toolDisplay(tool).label:null,reason))});
        }
        case 'RunFinished':
          resetRun();
          return next('run.completed',englishRecord(withoutMeta(r,redactor.text),RUN_COMPLETED_SHAPE),'durable');
        case 'RunError':{
          const failureFacts=pendingFailure;pendingFailure=null;
          const traceId=stringValue(r.traceId);
          const failure=safeTalosFailure(r,{
            component:stringValue(r.component)??'runtime',
            retryable:typeof r.retryable==='boolean'?r.retryable:false,
            ...(traceId?{traceId}:{})
          },secretValues);
          const runId=stringValue(r.runId);
          const source=withoutMeta(r,redactor.text);
          /* R5a lane R: the kernel's RunError has no status (agent-service.mjs:1991); the run's own failure facts, announced just
             before it, are its status and requested wait. A field the kernel wrote is never replaced. */
          const facts=failureFacts?{...(failureFacts.status!==null&&source.stato===undefined?{stato:failureFacts.status}:{}),...(failureFacts.retryAfterMs!==null&&source.retryAfterMs===undefined?{retryAfterMs:failureFacts.retryAfterMs}:{}),...(failureFacts.resetsAt!==null&&source.resetsAt===undefined?{resetsAt:failureFacts.resetsAt}:{})}:{};
          lastRequest=null;declaredCost=null;
          return next('run.failed',{error:v2Error({...source,...facts},failure,redactor.text),...(runId?{runId}:{})},'durable');
        }
        case 'RunCancelled':{
          const runId=stringValue(r.runId);
          return next('run.cancelled',{reason:redactor.text(String(r.reason??r.message??'cancelled')),...(runId?{runId}:{})},'durable');
        }
        default:
          return null;
      }
    }
  };
}

export function createV2SyntheticEvent(input:{
  sessionId:string;
  eventId:string;
  type:TalosV2EventType;
  data?:Record<string,unknown>;
  durability?:TalosV2Durability;
  clock?:()=>string;
}):TalosV2Event{
  return{
    schema:'talos.cli.event.v2',
    version:2,
    sessionId:input.sessionId,
    eventId:input.eventId,
    cursor:null,
    ts:(input.clock??(()=>new Date().toISOString()))(),
    durability:input.durability??'transient',
    type:input.type,
    data:input.data??{},
  };
}

export function createV2FailureEvent(input:{
  sessionId:string;
  error:unknown;
  component?:string;
  retryable?:boolean;
  details?:Record<string,unknown>;
  secretValues?:readonly string[];
  clock?:()=>string;
}):TalosV2Event{
  const secrets=input.secretValues??[];
  const redactor=createRedactor(secrets);
  const safeDetails=input.details?clean(input.details,redactor.text) as Record<string,unknown>:undefined;
  const failure=safeTalosFailure(input.error,{
    component:input.component??'runtime',
    retryable:input.retryable??false,
  },secrets);
  return{
    schema:'talos.cli.event.v2',
    version:2,
    sessionId:input.sessionId,
    eventId:'talos:'+encodeURIComponent(input.sessionId||'none')+':failure:'+failure.envelope.traceId,
    cursor:null,
    ts:(input.clock??(()=>new Date().toISOString()))(),
    durability:'durable',
    type:'run.failed',
    data:{
      error:v2Error(input.error,failure,redactor.text),
      ...(safeDetails&&Object.keys(safeDetails).length?{details:safeDetails}:{}),
    },
  };
}

export function createV2SessionSnapshot(input:{
  summary:CliSessionSummary;
  context?:CliContextStatus|null;
  cursor:TalosV2Cursor;
  clock?:()=>string;
}):TalosV2Event{
  if(input.cursor.sessionId!==input.summary.sessionId)throw Object.assign(new Error('Replay cursor is bound to a different session'),{code:'PROTOCOL_CURSOR_SESSION_MISMATCH'});
  return{
    schema:'talos.cli.event.v2',
    version:2,
    sessionId:input.summary.sessionId,
    eventId:eventIdFor(input.summary.sessionId,input.cursor.sequence,0),
    cursor:{...input.cursor},
    ts:(input.clock??(()=>new Date().toISOString()))(),
    durability:'durable',
    type:'session.snapshot',
    data:{summary:input.summary,...(input.context!==undefined?{context:input.context}:{})},
  };
}

function toolResultFromEvent(event:TalosV2Event):TalosV2ToolResult|null{
  if(event.type!=='tool.completed')return null;
  const data=event.data as Partial<TalosV2ToolResult>;
  return typeof data.toolCallId==='string'&&typeof data.content==='string'&&typeof data.status==='string'&&data.receipt
    ?data as TalosV2ToolResult
    :null;
}

export function createV2RunResultAccumulator(){
  /* C4(c) of decision 245: `beforeMessage` is the text before the current message, so the answer that stopped for the context can be
     taken back out of the result (headless/result.ts `resumesAfterContextStop`); `cut` waits for another message's first text, so an
     empty resumption keeps that answer, as the kernel does (reviewer's R1 of A5c) */
  let text='';let lastMessage:string|null=null;let beforeMessage=0;let cut:{at:number;messageId:string|null}|null=null;
  const changed=new Set<string>();
  let usage:unknown=null;
  const warnings:string[]=[];
  const tools=new Map<string,TalosV2ToolResult>();
  let sessionId:string|null=null;
  let cursor:TalosV2Cursor|null=null;
  let outcome:TalosV2RunResult['outcome']='completed';
  let error:TalosV2RunResult['error']|undefined;
  const redactText=createRedactor([]).text;
  const denials:PermissionDenial[]=[];
  const stopped:BackgroundStop[]=[];
  const withDenials=(value:TalosV2RunResult):TalosV2RunResult=>{const next=denials.length?{...value,permissionDenials:[...denials]}:value;return stopped.length?{...next,backgroundStopped:[...stopped]}:next;};
  return{
    add(event:TalosV2Event){
      sessionId=event.sessionId||sessionId;
      if(event.cursor&&(!cursor||event.cursor.sequence>=cursor.sequence))cursor={...event.cursor};
      /* ASYNC step 6: a run that waited for its children has more turns; their answers are kept apart by a blank line. */
      if(event.type==='run.started'&&text&&!text.endsWith('\n\n'))text+=text.endsWith('\n')?'\n':'\n\n';
      if(event.type==='message.delta'){
        const id=typeof event.data.messageId==='string'?event.data.messageId:null;const delta=String(event.data.delta??'');
        if(delta){
          if(cut&&id!==cut.messageId){text=text.slice(0,cut.at);cut=null;}
          if(id&&id!==lastMessage){beforeMessage=text.length;lastMessage=id;}
          text+=delta;
        }
      }
      if(event.type==='file.changed'&&typeof event.data.path==='string')changed.add(event.data.path);
      if(event.type==='usage.updated')usage=event.data.value??event.data;
      if(event.type==='warning')warnings.push(String(event.data.message??'warning'));
      if(event.type==='warning'&&event.data.code===TOOL_PERMISSION_DENIED&&event.data.denial&&typeof event.data.denial==='object')denials.push(event.data.denial as PermissionDenial);
      if(event.type==='warning')stopped.push(...backgroundStopsOf(event.data));
      const tool=toolResultFromEvent(event);if(tool)tools.set(tool.toolCallId,tool);
      if(event.type==='run.failed'){
        outcome='failed';
        const candidate=objectValue(event.data.error);
        const envelope=objectValue(candidate?.envelope);
        /* 0.6.13: a request too large for the model keeps its numbers in the result too (`--json`), as in its event */
        if(candidate&&envelope&&typeof candidate.message==='string')error={message:candidate.message,...(typeof candidate.raw==='string'?{raw:candidate.raw}:{}),envelope:envelope as any,...(objectValue(candidate.requestTooLarge)?{requestTooLarge:candidate.requestTooLarge as any}:{}),...(objectValue(candidate.contextFull)?{contextFull:candidate.contextFull as any}:{}),
          /* review 10 R10-10: the result keeps what the event says (status, class, waits) */
          ...(typeof candidate.providerClass==='string'?{providerClass:candidate.providerClass}:{}),...(typeof candidate.status==='number'?{status:candidate.status}:{}),
          ...(typeof candidate.retryAfterMs==='number'?{retryAfterMs:candidate.retryAfterMs}:{}),...(typeof candidate.resetsAt==='number'?{resetsAt:candidate.resetsAt}:{})};
      }
      if(event.type==='run.cancelled'){
        outcome='cancelled';
        const reason=String(event.data.reason??'cancelled');
        /* R3 Q-R3-8: a stop the person asked for is INTERRUPTED (exit 130), not a generic cancel. */
        const source={code:event.data.interrupted===true?'INTERRUPTED':'CANCELLED',message:reason,component:'runtime',retryable:false};
        error=v2Error(source,safeTalosFailure(source,{component:'runtime'}),redactText);
      }
      if(event.type==='run.completed')outcome='completed';
    },
    /** C4(c): the kernel sent the model on after its last answer stopped for the context; that answer leaves the result's text when
     *  another message brings text (an empty resumption keeps it, as the kernel does). */
    resumedAfterContextStop(){cut={at:beforeMessage,messageId:lastMessage};},
    result():TalosV2RunResult{
      if(outcome==='failed'||outcome==='cancelled'){
        const fallback=error??(()=>{
          const code=outcome==='cancelled'?'CANCELLED':'AGENT_FAILED';
          const message=outcome==='cancelled'?'cancelled':'Agent run failed';
          const source={code,message,component:'runtime',retryable:false};
          return v2Error(source,safeTalosFailure(source,{component:'runtime'}),redactText);
        })();
        return withDenials({
          schema:'talos.cli.result.v2',version:2,ok:false,sessionId,cursor,outcome,error:fallback,
          warnings:[...warnings],toolResults:[...tools.values()]
        });
      }
      return withDenials({
        schema:'talos.cli.result.v2',version:2,ok:true,sessionId,cursor,outcome:'completed',
        result:{text,changedFiles:[...changed],usage},warnings:[...warnings],toolResults:[...tools.values()]
      });
    }
  };
}

export function withV2RunWarnings(result:TalosV2RunResult,warnings:string[]):TalosV2RunResult{
  return{...result,warnings:[...warnings]};
}
