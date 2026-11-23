import {redactObject} from './redact.ts';

/*
 * The conversation of ONE session inside `talos diagnostic bundle --session <id|last>` (owner, 08/10/2026: «si approvo» to an opt-in export of a session
 * journal with secrets masked and paths pseudonymised, for the audit that comes back to the engineer; until now `--include-content` was refused for good).
 *
 * What this module guarantees, in the order the work is done:
 *  1. every event and the session's own metadata go through the shared redactor (vendor-shaped keys, Bearer tokens, PEM blocks, `key=value` secrets, the
 *     exact secret values of the environment) and then the path pseudonymiser. A key NAMED like a secret masks its text value; a number or boolean under
 *     such a key is kept (`total_tokens`, `max_tokens` are not secrets and are what a compaction bug is diagnosed with);
 *  2. FAIL CLOSED: if the redaction of any event throws (a hostile, absurdly deep value), nothing is exported at all: `DIAGNOSTIC_REDACTION_FAILED`.
 *     Hermes' support redaction is built the same way (debug_redaction.py: "fail-closed redaction ... leaving debug/support flows");
 *  3. a second, independent check on the serialised text: no secret value of the environment (8 characters or more, raw or JSON-escaped) may survive,
 *     or the export fails the same way. Redaction is a net with holes (a studied limit of every redactor: detection is never 100%), so the check looks
 *     at the output, not at the intention;
 *  4. the size is bounded: the first event, then as many of the most recent events as fit, with a visible gap marker; a single event over the line cap is
 *     clipped to its head. Goose bounds its diagnostics the same way (session/diagnostics.rs: 2 MiB per log, 256 KiB of config), Codex caps attachments
 *     (feedback/src/lib.rs: 64 MiB each), Hermes 512,000 bytes per log (hermes_cli/debug.py).
 *
 * What it does NOT do, and the command says so to the person: names, code, file contents and anything typed or answered are not removed. The export is opt-in.
 */
export const SESSION_BUNDLE_MAX_BYTES=16*1024*1024;
export const SESSION_BUNDLE_MAX_LINE_BYTES=1024*1024;
const CLIPPED_HEAD_CHARS=4096;
const MIN_VERIFIED_SECRET_LENGTH=8;

export type SessionBundleSummary={sessionId:string;file:string;events:number;kept:number;omitted:number;clipped:number;truncated:boolean;bytes:number};
export type SessionBundleEntry={name:string;data:string;summary:SessionBundleSummary};

export function sessionBundleFileName(sessionId:string):string{
  const safe=String(sessionId).replace(/[^A-Za-z0-9-]/gu,'').slice(0,12);
  return `session-${safe||'unknown'}.jsonl`;
}

function redactionFailed(cause?:unknown):Error{
  return Object.assign(new Error('DIAGNOSTIC_REDACTION_FAILED'),{code:'DIAGNOSTIC_REDACTION_FAILED',...(cause===undefined?{}:{cause})});
}
const bytesOf=(text:string)=>Buffer.byteLength(text,'utf8');

export function buildSessionBundleEntry(input:{
  sessionId:string;payload:unknown;secrets:readonly string[];pseudonymize:(value:unknown)=>unknown;maxBytes?:number;maxLineBytes?:number;
}):SessionBundleEntry{
  const maxBytes=input.maxBytes??SESSION_BUNDLE_MAX_BYTES;const maxLineBytes=Math.min(input.maxLineBytes??SESSION_BUNDLE_MAX_LINE_BYTES,Math.floor(maxBytes/4));
  const payload=(input.payload&&typeof input.payload==='object'?input.payload:{}) as Record<string,unknown>;
  const events=Array.isArray(payload.eventi)?payload.eventi as unknown[]:[];
  const {eventi:_events,...meta}=payload;
  let lines:string[];let metaText:string;
  try{
    /* JSON.stringify(undefined) is undefined, not text: a hole in the event list is written as null instead of breaking the byte count below */
    const safe=(value:unknown):string=>JSON.stringify(input.pseudonymize(redactObject(value,input.secrets,{keepNumbers:true})))??'null';
    lines=events.map(safe);
    metaText=safe(meta);
  }catch(cause){throw redactionFailed(cause);}

  /* The independent check (3): the serialised text, as it will be written, holds no secret value of the environment. */
  const forms=input.secrets.filter(secret=>typeof secret==='string'&&secret.length>=MIN_VERIFIED_SECRET_LENGTH)
    .flatMap(secret=>[secret,JSON.stringify(secret).slice(1,-1)]);
  const survives=(text:string)=>forms.some(form=>form.length>0&&text.includes(form));
  if(survives(metaText)||lines.some(survives))throw redactionFailed();

  let clipped=0;
  lines=lines.map(line=>{
    if(bytesOf(line)<=maxLineBytes)return line;
    clipped+=1;
    return JSON.stringify({talosDiagnostic:'event-clipped',bytes:bytesOf(line),head:line.slice(0,CLIPPED_HEAD_CHARS)});
  });

  const total=lines.length;
  const headerOf=(kept:number,omitted:number)=>JSON.stringify({
    schema:'talos.cli.diagnostic.session.v1',sessionId:input.sessionId,events:total,kept,omitted,clipped,truncated:omitted>0,meta:JSON.parse(metaText),
  });
  const gapOf=(omitted:number)=>JSON.stringify({talosDiagnostic:'omitted',events:omitted});
  let body:string[]=lines;let omitted=0;
  const lineBytes=lines.map(line=>bytesOf(line)+1);
  const headerBytes=bytesOf(headerOf(total,total))+1;
  if(headerBytes+lineBytes.reduce((sum,size)=>sum+size,0)>maxBytes&&lines.length>1){
    /* The first event stays (how the session began), then the most recent events that fit; the gap is written where it is. Linear in the number of events. */
    let used=headerBytes+bytesOf(gapOf(total))+1+lineBytes[0]!;
    let from=lines.length;
    while(from>1&&used+lineBytes[from-1]!<=maxBytes){used+=lineBytes[from-1]!;from-=1;}
    omitted=from-1;
    if(omitted>0)body=[lines[0]!,gapOf(omitted),...lines.slice(from)];
  }
  const header=headerOf(lines.length-omitted,omitted);
  const data=`${header}\n${body.join('\n')}${body.length?'\n':''}`;
  const name=sessionBundleFileName(input.sessionId);
  return{name,data,summary:{sessionId:input.sessionId,file:name,events:total,kept:lines.length-omitted,omitted,clipped,truncated:omitted>0,bytes:bytesOf(data)}};
}
