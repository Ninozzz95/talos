import {randomUUID} from 'node:crypto';
import {redactObject,secretValuesFromEnvironment} from './diagnostics/redact.ts';
import {describeError,detailsWhere} from './i18n/error-view.ts';
import {t} from './i18n/index.ts';
import {requestTooLargeOf,type RequestTooLarge} from './runtime/request-too-large.ts';
import {contextFullOf,type ContextFull} from './runtime/context-full.ts';
import {KERNEL_CLASSES} from './i18n/kernel-map.ts';

export type TalosErrorEnvelope={code:string;component:string;retryable:boolean;cause?:{name:string;message:string;code?:string};hint?:string;docs?:string;traceId:string};
/** `requestTooLarge` (0.6.13, additive): the four numbers of a REQUEST_TOO_LARGE failure, so `-p` in text says them on stderr. */
export type TalosFailure={envelope:TalosErrorEnvelope;message:string;exitCode:number;requestTooLarge?:RequestTooLarge;contextFull?:ContextFull;
  /* review 10 R10-1 of 0.6.13 (additive): the kernel's class of a provider failure in English, and the HTTP status, so the failure
     `talos -p` renders in text is worded by its class (a context-full is not «the provider did not accept the request») */
  providerClass?:string;status?:number};
export type TalosFailureFormat='text'|'json'|'stream-json';
export type TalosFailureNotice={code:string;message:string};
export type TalosFailureFallback={component?:string;retryable?:boolean;traceId?:string};

function serializeCause(cause:unknown):TalosErrorEnvelope['cause']{
  if(cause instanceof Error)return{name:cause.name,message:cause.message,...(typeof (cause as any).code==='string'?{code:(cause as any).code}:{})};
  if(cause===undefined)return undefined;
  return{name:'Error',message:String(cause)};
}

export class TalosError extends Error{
  code:string;component:string;retryable:boolean;hint?:string;docs?:string;traceId:string;
  constructor(fields:Omit<TalosErrorEnvelope,'cause'>,cause?:unknown){
    super(fields.code,{cause});this.name='TalosError';this.code=fields.code;this.component=fields.component;this.retryable=fields.retryable;this.traceId=fields.traceId;
    if(fields.hint!==undefined)this.hint=fields.hint;if(fields.docs!==undefined)this.docs=fields.docs;
  }
}

const CODE_TOKEN=/^(?:([A-Z][A-Z0-9_]*)$|([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+):)/u;
function isCliUsageMessage(message:string){
  return /^(?:Unsupported\b|Invalid\b|Unknown option:)/u.test(message)
    || /(?:must be a positive integer|mutually exclusive)$/u.test(message)
    || message==='Subcommand required'
    || message==='A prompt is required for headless mode';
}

/** A stable code is assigned before exit-code classification. Free-form prose stays INTERNAL_ERROR;
 * CLI usage prose receives CLI_USAGE_ERROR so the envelope and process exit can no longer disagree. */
export function codeForError(error:unknown):string{
  const declared=(error as any)?.code;if(typeof declared==='string'&&declared.length>0)return declared;
  const message=error instanceof Error?error.message:typeof (error as any)?.message==='string'?(error as any).message:'';
  const token=CODE_TOKEN.exec(message);if(token?.[1]||token?.[2])return token[1]??token[2]!;
  if(isCliUsageMessage(message))return'CLI_USAGE_ERROR';
  return'INTERNAL_ERROR';
}

function stringField(record:Record<string,unknown>|null,key:string):string|undefined{const value=record?.[key];return typeof value==='string'&&value.length>0?value:undefined;}
export function toTalosErrorEnvelope(error:unknown,fallback:TalosFailureFallback={}):TalosErrorEnvelope{
  if(error instanceof TalosError){const cause=serializeCause(error.cause);return{code:error.code,component:error.component,retryable:error.retryable,...(cause?{cause}:{}),...(error.hint!==undefined?{hint:error.hint}:{}),...(error.docs!==undefined?{docs:error.docs}:{}),traceId:error.traceId};}
  const record=error&&typeof error==='object'?error as Record<string,unknown>:null;
  const cause=error instanceof Error?serializeCause(error):(record?.cause!==undefined?serializeCause(record.cause):undefined);
  const component=stringField(record,'component')??fallback.component??'cli';
  const retryable=typeof record?.retryable==='boolean'?record.retryable:fallback.retryable??false;
  const hint=stringField(record,'hint');const docs=stringField(record,'docs');
  const traceId=stringField(record,'traceId')??fallback.traceId??'untraced';
  return{code:codeForError(error),component,retryable,...(cause?{cause}:{}),...(hint?{hint}:{}),...(docs?{docs}:{}),traceId};
}

export function exitCodeForEnvelope(envelope:Pick<TalosErrorEnvelope,'code'>):number{
  const code=String(envelope.code??'');
  if(code==='INTERRUPTED'||code==='CANCELLED'||code==='ABORT_ERR')return 130;
  if(/PERMISSION|APPROVAL|DENIED|SANDBOX|PATH_NOT_ALLOWED|PLAN_MODE_READ_ONLY/u.test(code))return 10;
  if(/KEY|AUTH|CREDENTIAL/u.test(code))return 11;
  if(/PROVIDER|MODEL_DESTINATION|OPENROUTER|OLLAMA|GEMINI|ANTHROPIC|OPENAI/u.test(code))return 12;
  if(/MCP|HOOK|PLUGIN|EXTENSION|TOOL/u.test(code))return 13;
  if(/TIMEOUT/u.test(code))return 14;
  if(/SESSION|RESEARCH_NOT_FOUND|AUTOMATION_NOT_FOUND|CHECKPOINT_NOT_FOUND/u.test(code))return 15;
  if(/UPDATE/u.test(code))return 16;
  if(/CLI_USAGE_ERROR|ERR_PARSE_ARGS|REQUIRED|INVALID|UNKNOWN|CONFIG|QUERY|USAGE|STDIN|TALOS_RUNTIME_NOT_FOUND/u.test(code))return 2;
  return 70;
}

export function exitCodeForError(error:unknown):number{return exitCodeForEnvelope(toTalosErrorEnvelope(error));}

const INHERITED_TRACE_ID=/^[\x21-\x7e]{1,128}$/u;
export function traceIdForFailure(env:Record<string,string|undefined>=process.env){const inherited=env.TALOS_TRACE_ID;return inherited!==undefined&&INHERITED_TRACE_ID.test(inherited)?inherited:randomUUID();}

function messageForFailure(error:unknown,envelope:TalosErrorEnvelope){
  if(error instanceof TalosError)return envelope.cause?.message??envelope.code;
  if(error instanceof Error)return error.message;
  if(error&&typeof error==='object'&&typeof (error as any).message==='string')return String((error as any).message);
  return envelope.code;
}

function englishSourceValues(details:unknown){
  for(const row of [details,(details as any)?.details,(details as any)?.messageParams,(details as any)?.dati,(details as any)?.details?.messageParams]){
    if(!row||typeof row!=='object')continue;const facts=row as Record<string,unknown>;
    if(facts.fonte==='stima')facts.fonte='estimate';else if(facts.fonte==='fornitore')facts.fonte='provider';
  }
}
function fixedFailure(component='cli'):TalosFailure{return{envelope:{code:'INTERNAL_ERROR',component,retryable:false,traceId:randomUUID()},message:'The failure could not be rendered safely',exitCode:70};}

export function safeTalosFailure(error:unknown,fallback:TalosFailureFallback={},secrets:Iterable<string>=secretValuesFromEnvironment(process.env)):TalosFailure{
  const traceId=fallback.traceId??traceIdForFailure();
  try{
    const envelope=toTalosErrorEnvelope(error,{...fallback,traceId});
    /* review 9 F8 of 0.6.13: the kernel's VALUE `fonte` ("stima"/"fornitore") in the envelope's details goes out in English, as the
       event bridge does (F-L-002's rule; key names are F-L-001, deferred by the owner) */
    englishSourceValues(envelope);
    /* 0.6.13: the numbers of a request too large for the model ride with the failure (numbers only; the envelope is unchanged) */
    const tooLarge=requestTooLargeOf(error);
    /* Z piece C: the context-full diagnosis rides with the failure the same way */
    const contextFull=contextFullOf(error);
    const facts=error&&typeof error==='object'?error as Record<string,unknown>:{};
    const kernelClass=typeof facts.classe==='string'?facts.classe:null;
    const englishClasses=new Set<string>(Object.values(KERNEL_CLASSES));
    const providerClass=kernelClass&&Object.hasOwn(KERNEL_CLASSES,kernelClass)?KERNEL_CLASSES[kernelClass]:kernelClass&&englishClasses.has(kernelClass)?kernelClass
      :typeof facts.providerClass==='string'&&englishClasses.has(facts.providerClass)?facts.providerClass:null;
    const statusValue=[facts.stato,facts.status].find(value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=100&&value<=599) as number|undefined;
    const raw:TalosFailure={envelope,message:messageForFailure(error,envelope),exitCode:exitCodeForEnvelope(envelope),...(tooLarge?{requestTooLarge:tooLarge}:{}),...(contextFull?{contextFull}:{}),...(providerClass?{providerClass}:{}),...(statusValue!==undefined?{status:statusValue}:{})};
    return redactObject(raw,secrets) as TalosFailure;
  }catch{return fixedFailure(fallback.component??'cli');}
}

/** C0, DEL, C1, bidi controls, zero-width controls, BOM and lone surrogates cannot drive the human terminal. */
const TERMINAL_CONTROL=/[\x00-\x1f\x7f-\x9f\u061c\u200b-\u200d\u202a-\u202e\u2028\u2029\u2066-\u2069\ufeff\ud800-\udfff]/gu;
export function inertTerminalText(value:unknown){return String(value).replace(TERMINAL_CONTROL,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);}
/*
 * R2 lane E (Q-R2-4, gate E6): the human failure is three lines — what happened · what to do · "Details: <cause> (CODE) ·
 * where to look" — worded by `describeError` from the CODE, so the code appears once and the kernel's Italian never does
 * (Q-R2-2). Trace id and component are for JSON and `verbose` only. Every field is inert: no value can forge a line.
 * Before R2 this was one line, `Error [CODE]: message; hint (component, trace)`, and a `CODE: prose` message printed the
 * code twice (review D-06, s02).
 */
export function renderTalosFailureLine(failure:Pick<TalosFailure,'envelope'|'message'>,options:{verbose?:boolean}={}){
  const {envelope}=failure;const view=describeError(failure);
  const details=[view.detail,view.code?`(${view.code})`:null,detailsWhere(view.where)/* UI Phase 0 D26 */].filter(Boolean).map(inertTerminalText).join(' · ');
  const rows=[`${t('error.prefix')}: ${inertTerminalText(view.what)}`,...(view.todo?[inertTerminalText(view.todo)]:[]),...(details?[`${t('common.details')}: ${details}`]:[])];
  if(options.verbose)rows.push(t('error.trace',{trace:inertTerminalText(envelope.traceId),component:inertTerminalText(envelope.component)}));
  return`${rows.join('\n')}\n`;
}

/* Stress test 0.5.4, F-B-004: a message that is only the code (`TITLE_REQUIRED`) gives the machine reader nothing a person can be
   shown; it becomes the screen's sentence, and the next step travels as `todo`. A message that is already a sentence is kept. */
function readableFailure(failure:TalosFailure,withTodo:boolean):{message:string;todo?:string}{
  const view=describeError(failure);
  const message=failure.message===failure.envelope.code?view.what:failure.message;
  return{message,...(withTodo&&view.todo?{todo:view.todo}:{})};
}
function renderTalosFailure(format:TalosFailureFormat,failure:TalosFailure,notices:readonly TalosFailureNotice[],verbose=false){
  if(format==='json')return{toStderr:false,text:`${JSON.stringify({schema:'talos.cli.result.v1',ok:false,sessionId:null,error:{code:failure.envelope.code,...readableFailure(failure,true),details:failure.envelope},warnings:notices.map(notice=>notice.message)})}\n`};
  if(format==='stream-json'){
    const events=[...notices.map((notice,index)=>({schema:'talos.cli.event.v1',seq:index+1,ts:new Date().toISOString(),sessionId:'',type:'warning',data:{code:notice.code,message:notice.message}})),{schema:'talos.cli.event.v1',seq:notices.length+1,ts:new Date().toISOString(),sessionId:'',type:'run.failed',data:{...failure.envelope,...readableFailure(failure,false)/* the event is the envelope, field for field: no `todo` here */}}];
    return{toStderr:false,text:events.map(event=>`${JSON.stringify(event)}\n`).join('')};
  }
  return{toStderr:true,text:renderTalosFailureLine(failure,{verbose})};
}

export function renderSafeTalosFailure(format:TalosFailureFormat,error:unknown,options:TalosFailureFallback&{notices?:readonly TalosFailureNotice[];verbose?:boolean}={}){
  const component=options.component??'cli';const secrets=secretValuesFromEnvironment(process.env);
  try{
    const failure=safeTalosFailure(error,{component,...(options.retryable!==undefined?{retryable:options.retryable}:{}),...(options.traceId!==undefined?{traceId:options.traceId}:{})},secrets);
    const notices=redactObject(options.notices??[],secrets) as TalosFailureNotice[];
    const rendered=renderTalosFailure(format,failure,notices,options.verbose===true);
    return{...rendered,failure,exitCode:failure.exitCode};
  }catch{
    const failure=fixedFailure(component);const rendered=renderTalosFailure(format,failure,[]);
    return{...rendered,failure,exitCode:failure.exitCode};
  }
}
