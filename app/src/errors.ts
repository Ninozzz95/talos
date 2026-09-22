import {randomUUID} from 'node:crypto';
import {redactObject,secretValuesFromEnvironment} from './diagnostics/redact.ts';

export type TalosErrorEnvelope={code:string;component:string;retryable:boolean;cause?:{name:string;message:string;code?:string};hint?:string;docs?:string;traceId:string};
export type TalosFailure={envelope:TalosErrorEnvelope;message:string;exitCode:number};
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
  if(/SESSION|RESEARCH_NOT_FOUND|AUTOMATION_NOT_FOUND/u.test(code))return 15;
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

function fixedFailure(component='cli'):TalosFailure{return{envelope:{code:'INTERNAL_ERROR',component,retryable:false,traceId:randomUUID()},message:'The failure could not be rendered safely',exitCode:70};}

export function safeTalosFailure(error:unknown,fallback:TalosFailureFallback={},secrets:Iterable<string>=secretValuesFromEnvironment(process.env)):TalosFailure{
  const traceId=fallback.traceId??traceIdForFailure();
  try{
    const envelope=toTalosErrorEnvelope(error,{...fallback,traceId});
    const raw:TalosFailure={envelope,message:messageForFailure(error,envelope),exitCode:exitCodeForEnvelope(envelope)};
    return redactObject(raw,secrets) as TalosFailure;
  }catch{return fixedFailure(fallback.component??'cli');}
}

/** C0, DEL, C1, bidi controls, zero-width controls, BOM and lone surrogates cannot drive the human terminal. */
const TERMINAL_CONTROL=/[\x00-\x1f\x7f-\x9f\u061c\u200b-\u200d\u202a-\u202e\u2028\u2029\u2066-\u2069\ufeff\ud800-\udfff]/gu;
export function inertTerminalText(value:unknown){return String(value).replace(TERMINAL_CONTROL,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);}
export function renderTalosFailureLine(failure:Pick<TalosFailure,'envelope'|'message'>){
  const {envelope,message}=failure;const code=inertTerminalText(envelope.code);const text=inertTerminalText(message);const head=text&&message!==envelope.code?`Error [${code}]: ${text}`:`Error [${code}]`;const hint=envelope.hint?`; hint: ${inertTerminalText(envelope.hint)}`:'';const marks=[`component ${inertTerminalText(envelope.component)}`,...(envelope.retryable?['retryable']:[]),`trace ${inertTerminalText(envelope.traceId)}`];return`${head}${hint} (${marks.join(', ')})\n`;
}

function renderTalosFailure(format:TalosFailureFormat,failure:TalosFailure,notices:readonly TalosFailureNotice[]){
  if(format==='json')return{toStderr:false,text:`${JSON.stringify({schema:'talos.cli.result.v1',ok:false,sessionId:null,error:{code:failure.envelope.code,message:failure.message,details:failure.envelope},warnings:notices.map(notice=>notice.message)})}\n`};
  if(format==='stream-json'){
    const events=[...notices.map((notice,index)=>({schema:'talos.cli.event.v1',seq:index+1,ts:new Date().toISOString(),sessionId:'',type:'warning',data:{code:notice.code,message:notice.message}})),{schema:'talos.cli.event.v1',seq:notices.length+1,ts:new Date().toISOString(),sessionId:'',type:'run.failed',data:{...failure.envelope,message:failure.message}}];
    return{toStderr:false,text:events.map(event=>`${JSON.stringify(event)}\n`).join('')};
  }
  return{toStderr:true,text:renderTalosFailureLine(failure)};
}

export function renderSafeTalosFailure(format:TalosFailureFormat,error:unknown,options:TalosFailureFallback&{notices?:readonly TalosFailureNotice[]}={}){
  const component=options.component??'cli';const secrets=secretValuesFromEnvironment(process.env);
  try{
    const failure=safeTalosFailure(error,{component,...(options.retryable!==undefined?{retryable:options.retryable}:{}),...(options.traceId!==undefined?{traceId:options.traceId}:{})},secrets);
    const notices=redactObject(options.notices??[],secrets) as TalosFailureNotice[];
    const rendered=renderTalosFailure(format,failure,notices);
    return{...rendered,failure,exitCode:failure.exitCode};
  }catch{
    const failure=fixedFailure(component);const rendered=renderTalosFailure(format,failure,[]);
    return{...rendered,failure,exitCode:failure.exitCode};
  }
}
