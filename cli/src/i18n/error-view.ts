/*
 * R2 CONTRACT (owner: lane E). Every error the screen shows goes through `describeError`: what happened · what to do ·
 * where to look, the code once and secondary (Q-R2-4, gate E6). Lanes other than E only CALL these functions.
 *
 * - Mapping is by CODE (gate E4): `envelope.code`; `PROVIDER_REQUEST_ERROR` × kernel `classe` × HTTP `stato`; the RunError
 *   outcome codes; the credential-store codes. The only text comparisons are the pinned kernel constants of kernel-map.ts.
 * - `detail` is English only and is what the third line shows; `raw` is the original text, in whatever language the kernel
 *   wrote it, for the expanded view and the log only (Q-R2-2). An unmapped code gets its family's sentence (E5).
 * - `describeError` never throws: it runs on failure paths, where a second failure would hide the first.
 */
import {codeForError} from '../errors.ts';
import {clockTime} from './clock-time.ts';
import {missingKeyText} from '../provider/missing-key.ts';
import {en,t,type MessageId} from './index.ts';
import {DISPLAY_CODES,KERNEL_CLASSES,KERNEL_NOTICES,KERNEL_PROVIDER_MESSAGES,KERNEL_REFUSAL_REASONS,KERNEL_REFUSAL_REASONS_EN,KERNEL_RUN_TEXT,isStoppedWithoutAnswer,REFUSAL_VIA,RUN_OUTCOMES,TRANSPORT_CODES,looksItalian,type ProviderClass} from './kernel-map.ts';
import {RETRY_AFTER_MAX_MS} from '../runtime/provider-attempts.ts';
import type {ToolDenial} from '../tui/tool-facts.ts';
import {REQUEST_TOO_LARGE,requestTooLargeOf} from '../runtime/request-too-large.ts';
import {contextFullOf,type ContextFull} from '../runtime/context-full.ts';

export type ErrorView={what:string;todo:string|null;where:string|null;code:string|null;detail:string|null;raw?:string|null};
/** Where the stop happened, from the CLI's own state (the kernel's stop point is Italian free text, gate E15). */
export type StopPoint={kind:'answering'}|{kind:'approval';tool:string}|{kind:'tool';tool:string}|null;
/** `screen`: the words are for the interactive screen, which offers «Send as attachment» itself (0.6.13); off, they are for `talos -p`. */
export type DescribeOptions={stopPoint?:StopPoint;screen?:boolean};

/* `providerClass`: the English class a v2 error carries (protocol/v2/events.ts v2Error), read when the kernel's own `classe` is absent */
type Facts={code:string;raw:string|null;hint:string|null;classe:string|null;providerClass:ProviderClass|null;stato:number|null;provider:string|null;retryAfterMs:number|null;resetsAt:number|null};

function field(value:unknown,key:string):unknown{try{return value&&typeof value==='object'?(value as any)[key]:undefined;}catch{return undefined;}}
function text(value:unknown):string|null{return typeof value==='string'&&value.trim().length>0?value:null;}
function finite(value:unknown):number|null{const n=typeof value==='string'&&/^\d+$/u.test(value)?Number(value):value;return typeof n==='number'&&Number.isFinite(n)?n:null;}
function facts(error:unknown):Facts{
  const envelope=field(error,'envelope');const source=error;
  /* review 10 R10-1 of 0.6.13: a failure (`safeTalosFailure`, what `talos -p` in text renders) keeps the kernel's facts only in
     `envelope.details`, and its class there is already English (events/bridge.ts F-L-002): both places and both languages are read */
  const details=field(envelope,'details');const either=(key:string)=>field(source,key)??field(details,key);
  let code='';
  try{code=text(field(envelope,'code'))??codeForError(error);}catch{code='INTERNAL_ERROR';}
  /* A v2 error (owner 2026-09-24) carries the English headline in `message` and the original, redacted text in `raw`:
     the kernel's own words are what identify its provider class, so `raw` wins whenever it is there. */
  const raw=typeof error==='string'?error:text(field(source,'raw'))??text(field(source,'message'))??text(field(field(envelope,'cause'),'message'));
  return{
    code:code||'INTERNAL_ERROR',raw,
    hint:text(field(envelope,'hint'))??text(field(source,'hint')),
    classe:text(either('classe')),
    providerClass:([field(source,'providerClass'),field(details,'providerClass'),field(source,'classe'),field(details,'classe')].find(value=>ENGLISH_CLASSES.has(String(value))) as ProviderClass|undefined)??null,
    stato:finite(field(source,'stato'))??finite(field(source,'status'))??finite(field(details,'stato'))??finite(field(details,'status')),
    provider:text(field(source,'provider')),
    retryAfterMs:finite(field(source,'retryAfterMs')),
    resetsAt:finite(field(source,'resetsAt')),
  };
}

/** The code once: a message that repeats its own code as a `CODE:` prefix loses it (s02 D-06 printed it twice). */
function withoutCodePrefix(raw:string,code:string){return raw.startsWith(code)?raw.slice(code.length).replace(/^\s*:\s*/u,'').trim():raw.trim();}
function englishDetail(raw:string|null,code:string,what:string):string|null{
  if(!raw)return null;
  const rest=withoutCodePrefix(raw,code);
  return rest&&rest!==code&&rest!==what&&!looksItalian(rest)?rest:null;
}

const ENGLISH_CLASSES:ReadonlySet<string>=new Set(Object.values(KERNEL_CLASSES));
type Family='internal'|'permission'|'key'|'provider'|'extension'|'timeout'|'session'|'update'|'usage'|'interrupted';
/* The words' family. Not the exit-code taxonomy (`exitCodeForEnvelope`), whose `/KEY/` also catches CONFIG_UNKNOWN_KEY:
   the order here puts configuration before keys, so a bad setting is never worded as a rejected API key. */
const FAMILIES:ReadonlyArray<[RegExp,Family]>=[
  [/^(?:INTERRUPTED|CANCELLED|ABORT_ERR)$/u,'interrupted'],
  [/CONFIG|USAGE|ERR_PARSE_ARGS|STDIN|QUERY|UNKNOWN_OPTION|SECRET_FIELD/u,'usage'],
  [/PERMISSION|APPROVAL|DENIED|SANDBOX|PATH_NOT_ALLOWED|PLAN_MODE|TRUST/u,'permission'],
  [/PROVIDER_KEY|API_KEY|AUTH|CREDENTIAL|KEYRING|PROVIDER_STORE/u,'key'],
  [/PROVIDER|MODEL|OPENROUTER|OLLAMA|GEMINI|ANTHROPIC|OPENAI|CATALOG/u,'provider'],
  [/MCP|HOOK|PLUGIN|EXTENSION|TOOL|FORGE|ACP_/u,'extension'],
  [/TIMEOUT/u,'timeout'],
  [/SESSION|RESEARCH_NOT_FOUND|AUTOMATION_NOT_FOUND/u,'session'],
  [/UPDATE/u,'update'],
  [/REQUIRED|INVALID|UNKNOWN|TALOS_RUNTIME_NOT_FOUND/u,'usage'],
];
function family(code:string):Family{for(const [pattern,name] of FAMILIES)if(pattern.test(code))return name;return'internal';}
const FAMILY_WHERE:Record<Family,MessageId|null>={
  internal:'error.generic.where',permission:'error.family.permission.where',key:'error.family.key.where',provider:'error.where.providerList',
  extension:'error.where.doctor',timeout:'error.where.doctor',session:'error.family.session.where',update:'error.where.doctor',usage:'error.family.usage.where',interrupted:null,
};
function providerWhere(provider:string|null){return provider?t('error.where.providerTest',{id:provider}):t('error.where.providerList');}

function providerClass(f:Facts):ProviderClass|null{
  if(TRANSPORT_CODES[f.code])return TRANSPORT_CODES[f.code]!;
  if(f.code!=='PROVIDER_REQUEST_ERROR'&&!f.code.startsWith('PROVIDER_HTTP'))return null;
  /* 09/10/2026: Z.AI answers an empty balance with HTTP 429 (Hermes error_classifier.py, Codex api_bridge.rs do the same
     check): the kernel read the body, so its credit class wins over the status. */
  const kernelClass=f.classe&&KERNEL_CLASSES[f.classe]?KERNEL_CLASSES[f.classe]!:f.providerClass??(f.raw&&KERNEL_PROVIDER_MESSAGES[f.raw.trim()]?KERNEL_PROVIDER_MESSAGES[f.raw.trim()]!:null);
  if(kernelClass==='credit')return'credit';
  if(f.stato===429)return'rate-limited';
  if(f.stato!==null&&f.stato>=500)return'server-error';
  if(f.classe&&KERNEL_CLASSES[f.classe])return KERNEL_CLASSES[f.classe]!;
  if(f.providerClass)return f.providerClass;
  if(f.raw&&KERNEL_PROVIDER_MESSAGES[f.raw.trim()])return KERNEL_PROVIDER_MESSAGES[f.raw.trim()]!;
  return'not-accepted';
}
/** `TALOS_MAX_RETRIES=0`: the kernel sends a 429 or a 5xx once and stops (an unreadable or negative value means its default 10). */
function retriesTurnedOff(env:Record<string,string|undefined>=process.env):boolean{
  const raw=env.TALOS_MAX_RETRIES;
  return raw!==undefined&&String(raw).trim()!==''&&Number(raw)===0;
}
function describeProvider(cls:ProviderClass,f:Facts,full:ContextFull|null=null):Pick<ErrorView,'what'|'todo'>{
  const id=f.provider??'<id>';
  if(cls==='credential'||cls==='not-accepted'){
    // The status, when the error still carries it, splits the kernel's lumped classes (E7: 403 is never "the key is wrong").
    if(f.stato===401)return{what:t('error.provider.unauthorized.what'),todo:t('error.provider.unauthorized.todo',{id})};
    if(f.stato===403)return{what:t('error.provider.forbidden.what'),todo:t('error.provider.forbidden.todo')};
    if(f.stato===404)return{what:t('error.provider.notFound.what'),todo:t('error.provider.notFound.todo')};
  }
  switch(cls){
    case'rate-limited':{
      // A wait is given only when it is known (E7); a keyless provider's Retry-After never reaches the CLI (E15).
      const seconds=f.retryAfterMs!==null&&f.retryAfterMs>0?Math.ceil(f.retryAfterMs/1000):null;
      /* R5a lane R (Q-R5-6): a requested wait above the 60 s TALOS takes by itself ended the retries at once (the kernel
         amendment), so "TALOS retried" would be false. */
      /* 0.6.7 (stress test of 0.6.6, S-OBS-4): with TALOS_MAX_RETRIES=0 nothing is retried, and "TALOS retried" was false. The
         kernel reads the same variable the same way (talosHarness.mjs `ritentativiDiSerie`). */
      const what=seconds!==null&&f.retryAfterMs!>RETRY_AFTER_MAX_MS?t('error.provider.rateLimited.whatLongWait',{seconds})
        :retriesTurnedOff()?t('error.provider.rateLimited.whatNoRetries'):t('error.provider.rateLimited.what');
      return{what,todo:seconds?t('error.provider.rateLimited.todoKnown',{seconds}):t('error.provider.rateLimited.todo')};
    }
    case'credential':return{what:t('error.provider.credential.what'),todo:t('error.provider.credential.todo')};
    case'credit':return{what:t('error.provider.credit.what'),todo:t('error.provider.credit.todo')};
    case'network':return{what:t('error.provider.network.what'),todo:t('error.provider.network.todo')};
    case'timeout':return{what:t('error.provider.timeout.what'),todo:t('error.provider.timeout.todo')};
    case'server-error':return{what:t('error.provider.serverError.what'),todo:t('error.provider.serverError.todo')};
    case'stream-cut':return{what:t('error.provider.streamCut.what'),todo:t('error.provider.streamCut.todo')};
    /* Z piece C (r4 8b8d1133c): with the kernel's diagnosis, «even after shortening» once it was shortened (R10-8 below); the
       provider's numbers when its refusal said them. Without it, the words of before. */
    case'context':{
      if(!full)return{what:t('error.provider.context.what'),todo:t('error.provider.context.todo')};
      const number=(value:number)=>value.toLocaleString('en-US');
      /* review 10 R10-8: a step past 0 means the kernel shortened and sent again (the diagnosis is written at each refusal); only
         step 0 without `exhausted` (the frame alone over the window) was never shortened */
      const shortened=full.exhausted===true||full.step>=1;
      const what=full.numbers?t(shortened?'error.provider.contextFull.whatExhaustedNumbers':'error.provider.contextFull.whatNumbers',{requested:number(full.numbers.requested),maximum:number(full.numbers.maximum)})
        :t(shortened?'error.provider.contextFull.whatExhausted':'error.provider.context.what');
      return{what,todo:t('error.provider.contextFull.todo')};
    }
    default:return{what:t('error.provider.notAccepted.what'),todo:t('error.provider.notAccepted.todo')};
  }
}

function stopPhrase(point:StopPoint|undefined):string|null{
  if(!point)return null;
  if(point.kind==='answering')return t('error.run.while.answering');
  if(point.kind==='approval')return t('error.run.while.approval',{tool:point.tool});
  return t('error.run.while.tool',{tool:point.tool});
}
/* FE-051: the common sentence is the kernel's; the way out is the CLI's own: /model on the screen, --model in -p */
const refusalTodo=(options:DescribeOptions)=>t(options.screen?'error.run.modelRefused.todoScreen':'error.run.modelRefused.todo');
function describeOutcome(code:keyof typeof RUN_OUTCOMES,f:Facts,options:DescribeOptions):Pick<ErrorView,'what'|'todo'|'where'>{
  const outcome=RUN_OUTCOMES[code];
  if(outcome==='stopped'){
    if(isStoppedWithoutAnswer(f.raw))return{what:t('error.run.noAnswer.what'),todo:t('error.run.noAnswer.todo'),where:null};
    const phrase=stopPhrase(options.stopPoint);
    return{what:phrase?t('error.run.interruptedWhile.what',{while:phrase}):t('error.run.interrupted.what'),todo:null,where:null};
  }
  if(outcome==='turns-exhausted')return{what:t('error.run.turnsExhausted.what'),todo:t('error.run.turnsExhausted.todo'),where:null};
  if(outcome==='repetition')return{what:t('error.run.repetition.what'),todo:t('error.run.repetition.todo'),where:null};
  if(outcome==='output-limit')return{what:t('error.run.outputLimit.what'),todo:t('error.run.outputLimit.todo'),where:null};
  if(outcome==='model-refused')return{what:t('error.run.modelRefused.what'),todo:refusalTodo(options),where:null};
  return{what:t('error.run.premiseDenied.what'),todo:t('error.run.premiseDenied.todo'),where:null};
}

/** Codes with their own words: `error.code.<CODE>.what` / `.todo`, and where to look. */
const CODE_WHERE:Readonly<Record<string,MessageId>>={
  PROJECT_TRUST_REQUIRED:'error.code.PROJECT_TRUST.where',PROJECT_TRUST_INVALIDATED:'error.code.PROJECT_TRUST.where',
  CREDENTIAL_STORE_INVALID:'error.where.doctor',CREDENTIAL_STORE_REAL_IN_TEST:'error.where.doctor',CONFIG_INVALID_CREDENTIAL_STORE:'error.code.config.where',CONFIG_INVALID_CREDENTIALS:'error.code.config.where',
  SANDBOX_REQUIRED_UNAVAILABLE:'error.where.doctor',MXC_BACKEND_UNAVAILABLE:'error.where.doctor',PROVIDER_STORE_UNAVAILABLE:'error.where.doctor',
  RULE_COMMAND_UNSUPPORTED:'error.family.permission.where',RULE_COMPOUND_COMMAND:'error.family.permission.where',RULE_UNREADABLE:'error.family.permission.where',
  RULE_MATCHES_NOTHING:'error.family.permission.where',RULE_STORE_INVALID:'error.code.config.where',KEYMAP_INVALID:'error.code.config.where',
  FORGE_PACKAGE_SCHEMA_INVALID:'error.generic.where',PROVIDER_KEY_REQUIRED:'error.where.providerList',PROVIDER_KEY_INVALID:'error.where.providerList',
  PROVIDER_KEY_NOT_FOUND:'error.where.providerList',PROVIDER_POOL_FULL:'error.where.providerList',PROVIDER_RUNTIME_INVALID:'error.where.providerList',
  PROVIDER_RUNTIME_UNAVAILABLE:'error.where.doctor',PROVIDER_KEY_MISSING:'error.where.providerList',MODEL_IMAGE_NOT_SUPPORTED:'error.where.providerList',
  LOCAL_RUNTIME_NOT_READY:'error.where.doctor',PATH_NOT_ALLOWED:'error.family.permission.where',PLAN_MODE_READ_ONLY:'error.family.permission.where',
  SESSION_NOT_FOUND:'error.family.session.where',EXECUTION_BACKEND_UNAVAILABLE:'error.where.doctor',RUN_TIMEOUT:'error.generic.where',RUNTIME_NOT_AVAILABLE:'error.where.providerList',NOT_FOUND:'error.family.session.where',
  TALOS_RUNTIME_NOT_FOUND:'error.where.doctor',PERMISSION_RULE_INVALID:'error.family.permission.where',CLI_USAGE_ERROR:'error.family.usage.where',PROVIDER_FALLBACK_BUSY:'error.generic.where',
  /* R5a lane R: the R5 configuration keys. */
  CONFIG_INVALID_MODELS:'error.code.config.where',CONFIG_INVALID_MODEL_WINDOW:'error.code.config.where',CONFIG_INVALID_MODEL_ROUTING:'error.code.config.where',CONFIG_INVALID_BUSY_INPUT:'error.code.config.where',CONFIG_INVALID_QUESTION_TIMEOUT:'error.code.config.where',
  CONFIG_INVALID_REASONING_DISPLAY:'error.code.config.where',
  /* R5b (R5a open 4): the Context Engine's failures point at /context. */
  CTX_CONTEXT_OVERFLOW:'error.where.context',CTX_TRUNCATED_SUMMARY:'error.where.context',CTX_SUMMARY_RESPONSE_INVALID:'error.where.context',CTX_SEGMENT_TOO_LARGE:'error.where.context',
  CTX_INVALID_SUMMARY:'error.where.context',CTX_EMPTY_SUMMARY:'error.where.context',CTX_NO_REDUCTION:'error.where.context',CTX_NOTHING_TO_COMPACT:'error.where.context',
  CTX_CONTEXT_TOO_SMALL:'error.where.context',CTX_COMPACTION_FAILED:'error.where.context',CTX_SUMMARY_REFUSED:'error.where.context',CTX_PROVIDER_CONTEXT_INVALID:'error.where.context',CTX_MODEL_INVALID:'error.where.context',CTX_STALE_REVISION:'error.where.context',CTX_PERSISTENCE_FAILED:'error.where.context',CTX_SUMMARY_HTTP:'error.where.context',CTX_JOB_INTERRUPTED:'error.where.context',CTX_HISTORY_DIVERGED:'error.where.context',
};
function familyTodo(fam:Family):MessageId|null{return fam==='interrupted'?null:`error.family.${fam}.todo` as MessageId;}
const RULE_CODES=new Set(['RULE_COMMAND_UNSUPPORTED','RULE_COMPOUND_COMMAND','RULE_UNREADABLE','RULE_MATCHES_NOTHING']);
function mapped(id:string):MessageId|null{return Object.hasOwn(en,id)?id as MessageId:null;}
export function hasEnglishFor(code:string):boolean{
  if(DISPLAY_CODES[code]&&!(code in RUN_OUTCOMES))return hasEnglishFor(DISPLAY_CODES[code]!);
  return Boolean(mapped(`error.code.${code}.what`))||code in RUN_OUTCOMES||Boolean(TRANSPORT_CODES[code])||code==='PROVIDER_REQUEST_ERROR';
}
/** The code the screen prints for a kernel code (an Italian-spelled one gets its English name, D-05). */
export function displayCode(code:string):string{return DISPLAY_CODES[code]??code;}

function describe(error:unknown,options:DescribeOptions):ErrorView{
  const f=facts(error);const code=f.code;
  const base=(parts:Pick<ErrorView,'what'|'todo'|'where'>):ErrorView=>{
    const view:ErrorView={...parts,code,detail:englishDetail(f.raw,code,parts.what),raw:f.raw};
    // The envelope's hint is the thrower's own advice for THIS failure: more specific than any table, so it wins when it is
    // English (a kernel hint in Italian stays off the screen, Q-R2-2).
    if(f.hint&&!looksItalian(f.hint))view.todo=f.hint;
    return view;
  };
  if(code in RUN_OUTCOMES){
    const view=base(describeOutcome(code as keyof typeof RUN_OUTCOMES,f,options));
    const noAnswer=code==='fermato'&&isStoppedWithoutAnswer(f.raw);
    // The person's own stop is not an error: no code and no "Details" line (the kernel code stays in the JSON envelope).
    if(code==='fermato'&&!noAnswer)return{...view,code:null,detail:null};
    return{...view,code:noAnswer?'NO_ANSWER':DISPLAY_CODES[code]??null,detail:null};
  }
  // A lowercase kernel code (`internal-error`) is shown as its English code; the facts travel, the envelope does not.
  if(DISPLAY_CODES[code])return describe({message:f.raw??undefined,code:DISPLAY_CODES[code],hint:f.hint??undefined,provider:f.provider??undefined,...(f.resetsAt!==null?{resetsAt:f.resetsAt}:{})},options);
  /* 0.6.13 (owner 22/10/2026): the newest message alone does not fit the model. The numbers are said when the failure carries
     them («about» for TALOS's estimate, the provider's own count otherwise); the kernel's sentence is not repeated as a detail and
     there is nowhere to look: the message is what to change. The screen's todo names its dialog, `-p`'s names the flag. */
  if(code===REQUEST_TOO_LARGE){
    const tooLarge=requestTooLargeOf(error);const number=(value:number)=>value.toLocaleString('en-US');
    const provider=tooLarge?.source==='provider',reserve=tooLarge?.reserve;
    const what=tooLarge?t(reserve?(provider?'error.code.REQUEST_TOO_LARGE.whatProviderReserve':'error.code.REQUEST_TOO_LARGE.whatEstimateReserve'):(provider?'error.code.REQUEST_TOO_LARGE.whatProvider':'error.code.REQUEST_TOO_LARGE.whatEstimate'),
      {request:number(tooLarge.request),frame:number(tooLarge.frame),window:number(tooLarge.window),...(reserve?{reserve:number(reserve)}:{})}):t('error.code.REQUEST_TOO_LARGE.what');
    /* review 9 F3 of 0.6.13: when not even the attachment fits (`allegabile:false`, images too), the flag or the dialog's action would
       fail the same way; the todo says what is left */
    const todo=tooLarge?.attachable===false?(options.screen?'error.code.REQUEST_TOO_LARGE.todoNotAttachableScreen':'error.code.REQUEST_TOO_LARGE.todoNotAttachable'):options.screen?'error.code.REQUEST_TOO_LARGE.todoScreen':'error.code.REQUEST_TOO_LARGE.todo';
    return{what,todo:t(todo),where:null,code,detail:null,raw:f.raw};
  }
  /* 0.6.6 (owner 14/10): the plan's limit says when it comes back, when the service said (Codex: «Try again at 3:05 PM») */
  if(code==='CHATGPT_PLAN_LIMIT'&&f.resetsAt!==null&&f.resetsAt>0)return base({what:t('error.code.CHATGPT_PLAN_LIMIT.whatAt',{time:clockTime(f.resetsAt)}),todo:t('error.code.CHATGPT_PLAN_LIMIT.todo'),where:t('error.generic.where')});
  /* OWN-01 (09/10/2026): the exhausted uncertain outcome whose cause is a provider that never started answering says so. */
  const noFirst=code==='PROVIDER_OUTCOME_UNKNOWN_ESAURITO'&&f.raw?/^The provider did not start answering within the time limit, even after (\d+) automatic resends?\./u.exec(f.raw):null;
  if(noFirst)return{...base({what:t('error.code.PROVIDER_NO_FIRST_RESPONSE.what',{count:Number(noFirst[1])}),todo:t('error.code.PROVIDER_NO_FIRST_RESPONSE.todo'),where:providerWhere(f.provider)}),detail:null};
  if(code==='PROVIDER_EMPTY_RESPONSE'&&f.classe==='rifiuto-del-modello')return{...base({what:t('error.modelRefused.what'),todo:refusalTodo(options),where:null}),detail:null};
  if(code==='PROVIDER_KEY_MISSING'&&f.provider)return{...base({what:missingKeyText(f.provider),todo:null,where:t('error.where.providerList')}),detail:null};
  const cls=providerClass(f);
  if(cls){const parts=describeProvider(cls,f,cls==='context'?contextFullOf(error):null);return{...base({...parts,where:providerWhere(f.provider)}),detail:f.stato?`HTTP ${f.stato}`:null};}
  const own=mapped(`error.code.${code}.what`);
  if(own){
    const todoId=mapped(`error.code.${code}.todo`)??(RULE_CODES.has(code)?'error.code.RULE.todo':null)??familyTodo(family(code));
    const where=CODE_WHERE[code]?t(CODE_WHERE[code]!):family(code)==='provider'?providerWhere(f.provider):t('error.generic.where');
    return base({what:t(own),todo:todoId?t(todoId):null,where});
  }
  const fam=family(code);
  /* F-B-004: a missing value names what is missing ("The command is missing its title"); the thrower's usage line, when it has one, is the todo */
  const missing=fam==='usage'?/^([A-Z][A-Z0-9_]*?)_REQUIRED$/u.exec(code):null;
  if(missing)return base({what:t('error.code.REQUIRED.what',{name:missing[1]!.toLowerCase().replaceAll('_',' ')}),todo:t('error.code.REQUIRED.todo'),where:t('error.family.usage.where')});
  if(fam==='interrupted')return base({what:t('error.family.interrupted.what'),todo:null,where:null});
  const whereId=fam==='provider'?null:FAMILY_WHERE[fam];
  return base({what:t(`error.family.${fam}.what` as MessageId),todo:t(`error.family.${fam}.todo` as MessageId),where:whereId?t(whereId):providerWhere(f.provider)});
}

export function describeError(error:unknown,options:DescribeOptions={}):ErrorView{
  try{return describe(error,options);}
  catch{return{what:t('error.generic.what'),todo:t('error.family.internal.todo'),where:t('error.generic.where'),code:'INTERNAL_ERROR',detail:null,raw:null};}
}

/* UI Phase 0 D26 (owner 27/09): a command at the end of the details says what to do with it ("see talos provider list");
   a where that is already a sentence stays as it is. The one rule for the screen (below) and the CLI's stderr (errors.ts). */
export function detailsWhere(where:string|null|undefined):string|null{
  if(!where)return null;
  return /^talos\s/u.test(where)?t('error.where.see',{where}):where;
}
/** The three screen lines for a view (headline · what to do · dim "Details: … (CODE) · where"), without colour codes.
 *  `raw` is never printed here (Q-R2-2). */
export function errorViewLines(view:ErrorView):string[]{
  const details=[view.detail,view.code?`(${view.code})`:null,detailsWhere(view.where)].filter(Boolean).join(' · ');
  return[view.what,...(view.todo?[view.todo]:[]),...(details?[`${t('common.details')}: ${details}`]:[])];
}

/** A kernel notice sent as a whole chat message, in English; `null` when the text is not one of the kernel's templates. */
export function describeKernelNotice(text:string):string|null{
  for(const notice of KERNEL_NOTICES){const m=notice.pattern.exec(text);if(m)return t(notice.id,{...m.groups});}
  return null;
}

/*
 * R3 Q-R3-8 (R3-INT). The kernel ends a tool result it stopped with one of these sentences, as a whole paragraph
 * (talosHarness.mjs:4040, 4806-4808, 4947; `annullaAnnunciate` :684). The model reads them unchanged (R2 E2); the screen
 * shows the English of the EXACT sentence, compared as a whole line, so a command's own output is never rewritten.
 * Pinned against the kernel source by test/tui/r3-sp-tool-stop-markers.test.ts.
 */
export const KERNEL_TOOL_STOP=Object.freeze({
  commandWhileRunning:'⛔ Fermato su richiesta: il comando e stato interrotto mentre girava.',
  testWhileRunning:'⛔ Fermato su richiesta: la prova e stata interrotta mentre girava.',
  notRun:'⛔ Fermato su richiesta: non riesco a eseguirlo, la sessione e stata interrotta prima. Questo attrezzo non e stato eseguito.',
  timedOut:/^⛔ Fermato allo scadere dei (?<seconds>\d+) secondi: non ha finito da solo\.$/u,
});
/* K3 (desktop 03/10): the same sentences in the kernel's English. A reader keeps both forms for good: the conversations saved
   before K3 carry the Italian ones (parallel change: the readers widen first, the writers switch after). */
export const KERNEL_TOOL_STOP_EN=Object.freeze({
  commandWhileRunning:'⛔ Stopped on request: the command was stopped while it ran.',
  testWhileRunning:'⛔ Stopped on request: the test was stopped while it ran.',
  notRun:'⛔ Stopped on request: it could not run, the session was stopped first. This tool did not run.',
  timedOut:/^⛔ Stopped when the (?<seconds>\d+) seconds ran out: it did not finish on its own\.$/u,
});
const STOP_FORMS=[KERNEL_TOOL_STOP,KERNEL_TOOL_STOP_EN];
/** A tool result's display text with the kernel's stop sentences in English; `stopped` = the person stopped it. */
export function describeKernelToolText(text:string):{text:string;stopped:boolean}{
  if(!text.includes('⛔ Fermato')&&!text.includes('⛔ Stopped'))return{text,stopped:false};
  let stopped=false;
  const lines=text.split('\n').map(line=>{
    if(STOP_FORMS.some(form=>line===form.commandWhileRunning||line===form.testWhileRunning)){stopped=true;return t('error.toolStop.whileRunning');}
    if(STOP_FORMS.some(form=>line===form.notRun)){stopped=true;return t('error.toolStop.notRun');}
    const timeout=KERNEL_TOOL_STOP.timedOut.exec(line)??KERNEL_TOOL_STOP_EN.timedOut.exec(line);
    return timeout?t('error.toolStop.timedOut',{seconds:timeout.groups!.seconds!}):line;
  });
  return{text:lines.join('\n'),stopped};
}

/**
 * A refused tool, worded from the receipt's permission `via` (the kernel's `motivo` is Italian; it stays in the receipt).
 * R5a lane R (S10, gate finding 15): with the tool's `denial` fact, the words name who decided — the person only when the
 * person was asked and said no; a rule by its text, the policy or the mode by their reason — instead of the via, which says
 * "you did not approve it" for every "asked" via, even when the engine answered alone.
 */
export function describeRefusal(receipt:{via?:string|null;allowed?:boolean|null},denial?:ToolDenial|null):string{
  if(denial)return describeDenial(denial);
  const key=receipt.via?REFUSAL_VIA[receipt.via]:undefined;
  return t(key?`error.refused.${key}` as MessageId:'error.refused.generic');
}
/** The one sentence of a denial fact (`ToolDenial`, tui/tool-facts.ts). */
export function describeDenial(denial:ToolDenial):string{
  if(denial.by==='person')return t('error.denial.person');
  if(denial.by==='rule')return denial.rule?(denial.scope?t('error.denial.ruleScoped',{rule:denial.rule,scope:denial.scope}):t('error.denial.rule',{rule:denial.rule})):t('error.denial.ruleUnnamed');
  return denial.reason?t('error.denial.because',{reason:denial.reason}):t('error.refused.generic');
}
/**
 * R5a lane R (S10): the kernel's refusal sentence (a receipt's `motivo`) in English, matched whole against the kernel's
 * constants (kernel-map.ts `KERNEL_REFUSAL_REASONS`); `null` when it is not one of them. `toolLabel` names a kernel tool id in
 * the screen's words. Display only: the receipt and the model keep the kernel's text.
 */
export function describeKernelRefusalReason(text:string,{toolLabel=(id:string)=>id}:{toolLabel?:(id:string)=>string}={}):string|null{
  const value=String(text??'').trim();
  for(const row of [...KERNEL_REFUSAL_REASONS,...KERNEL_REFUSAL_REASONS_EN]){
    const match=row.pattern.exec(value);if(!match)continue;
    const groups=match.groups??{};
    /* The kernel writes `(nessun percorso)`, after K3 `(no path)`, when the action named no path (talosHarness.mjs, research branch). */
    const path=groups.path===undefined?undefined:!groups.path||groups.path==='(nessun percorso)'||groups.path==='(no path)'?t('error.refusalReason.noPath'):groups.path;
    return t(row.id,{...(groups.tool?{tool:toolLabel(groups.tool)}:{}),...(path!==undefined?{path}:{})});
  }
  return null;
}
