import {randomUUID} from 'node:crypto';
import {chmod,mkdir,open,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {createRedactor,redactObject} from '../diagnostics/redact.ts';
import type {SessionMetadata} from './metadata-store.ts';

export const SESSION_SHARE_SCHEMA='talos.cli.session-share.v1';
export const SESSION_SHARE_MAX_BYTES=64*1024*1024;
export type SafeSessionShare={
  schema:typeof SESSION_SHARE_SCHEMA;
  redacted:true;
  createdAt:string;
  session:{
    id:string;name:string|null;project:string|null;model:string|null;
    parentId:string|null;depth:number;delegatedTask:string|null;forkedFrom:string|null;
    startedAt:string|null;updatedAt:string|null;endedAt:string|null;outcome:string;interrupted:boolean;
    usage:unknown;delegationOutcome:unknown;delegationEvidence:unknown;
    tags:string[];pinned:boolean;
  };
  events:Array<Record<string,unknown>>;
};

function coded(code:string,message=code){return Object.assign(new Error(message),{code});}
function textOrNull(value:unknown):string|null{return typeof value==='string'&&value.trim()?value.trim():null;}
const WINDOWS_DRIVE_ABSOLUTE=/(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]/u;
const WINDOWS_UNC_ABSOLUTE=/(?:^|[^\\])\\\\[^\\\r\n]+\\[^\\\r\n]+/u;
const FILE_URI_ABSOLUTE=/\bfile:\/\/\//iu;
const POSIX_ABSOLUTE=/(?<![A-Za-z0-9:/])\/(?!\/)[^/\s]/u;
function hasAbsolutePath(value:string){return WINDOWS_DRIVE_ABSOLUTE.test(value)||WINDOWS_UNC_ABSOLUTE.test(value)||FILE_URI_ABSOLUTE.test(value)||POSIX_ABSOLUTE.test(value);}
function redactPathText(value:string){return hasAbsolutePath(value)?'[REDACTED_PATH]':value;}
function redactPaths(value:unknown):unknown{
  if(Array.isArray(value))return value.map(redactPaths);
  if(value&&typeof value==='object'){const out:Record<string,unknown>={};for(const[k,v]of Object.entries(value as Record<string,unknown>))out[k]=redactPaths(v);return out;}
  return typeof value==='string'?redactPathText(value):value;
}
function safeEvents(payload:any,secrets:Iterable<string>):Array<Record<string,unknown>>{
  const raw=payload?.eventi??payload?.events??[];if(!Array.isArray(raw))throw coded('SESSION_SHARE_INVALID','Session events are invalid.');
  return raw.filter((event:any)=>event&&typeof event==='object'&&!Array.isArray(event)&&event.type!=='ApprovalRequested').map((event:any)=>redactPaths(redactObject(event,secrets)) as Record<string,unknown>);
}
const SESSION_FIELDS=new Set(['id','name','project','model','parentId','depth','delegatedTask','forkedFrom','startedAt','updatedAt','endedAt','outcome','interrupted','usage','delegationOutcome','delegationEvidence','tags','pinned']);
function containsAbsolutePath(value:unknown):boolean{
  if(typeof value==='string')return hasAbsolutePath(value);
  if(Array.isArray(value))return value.some(containsAbsolutePath);
  return Boolean(value&&typeof value==='object'&&Object.values(value as Record<string,unknown>).some(containsAbsolutePath));
}
function validateShare(value:SafeSessionShare):SafeSessionShare{
  if(!value||value.schema!==SESSION_SHARE_SCHEMA||value.redacted!==true||!value.session||typeof value.session!=='object'||Array.isArray(value.session)||!Array.isArray(value.events))throw coded('SESSION_SHARE_INVALID');
  const top=Object.keys(value).sort().join(',');if(top!=='createdAt,events,redacted,schema,session'||typeof value.createdAt!=='string'||Number.isNaN(Date.parse(value.createdAt)))throw coded('SESSION_SHARE_INVALID');
  const session=value.session as any,keys=Object.keys(session);if(keys.length!==SESSION_FIELDS.size||keys.some(key=>!SESSION_FIELDS.has(key)))throw coded('SESSION_SHARE_INVALID');
  if(typeof session.id!=='string'||!session.id||!Number.isSafeInteger(session.depth)||session.depth<0||typeof session.outcome!=='string'||!session.outcome||typeof session.interrupted!=='boolean'||!Array.isArray(session.tags)||session.tags.some((tag:unknown)=>typeof tag!=='string')||typeof session.pinned!=='boolean')throw coded('SESSION_SHARE_INVALID');
  for(const key of ['name','project','model','parentId','delegatedTask','forkedFrom','startedAt','updatedAt','endedAt'])if(session[key]!==null&&typeof session[key]!=='string')throw coded('SESSION_SHARE_INVALID');
  if(value.events.some((event:any)=>!event||typeof event!=='object'||Array.isArray(event)||event.type==='ApprovalRequested')||containsAbsolutePath(value))throw coded('SESSION_SHARE_INVALID');
  return value;
}
export function buildSafeSessionShare({summary,metadata,payload,secrets=[]}:{summary:any;metadata?:SessionMetadata|null;payload:any;secrets?:Iterable<string>}):SafeSessionShare{
  if(!summary||typeof summary!=='object')throw coded('SESSION_SHARE_INVALID');
  const id=textOrNull(summary.id??summary.sessionId);if(!id)throw coded('SESSION_SHARE_INVALID');
  const redactor=createRedactor(secrets);
  const safeText=(value:unknown)=>{const text=textOrNull(value);return text===null?null:redactPathText(redactor.text(text));};
  const share:SafeSessionShare={
    schema:SESSION_SHARE_SCHEMA,redacted:true,createdAt:new Date().toISOString(),
    session:{
      id,name:safeText(summary.name),project:safeText(summary.project),model:safeText(summary.model),
      parentId:safeText(summary.parentId),depth:Number.isSafeInteger(summary.depth)&&summary.depth>=0?summary.depth:0,delegatedTask:safeText(summary.delegatedTask),forkedFrom:safeText(summary.forkedFrom),
      startedAt:safeText(summary.startedAt),updatedAt:safeText(summary.updatedAt),endedAt:safeText(summary.endedAt),outcome:safeText(summary.outcome)??'unknown',interrupted:summary.interrupted===true,
      usage:redactPaths(summary.usage??null),delegationOutcome:redactPaths(summary.delegationOutcome??null),delegationEvidence:redactPaths(summary.delegationEvidence??null),
      tags:(metadata?.tags??[]).map(tag=>redactPathText(redactor.text(tag))),pinned:metadata?.pinned===true,
    },
    events:safeEvents(payload,secrets),
  };
  return validateShare(share);
}
async function syncDir(dirname:string){try{const handle=await open(dirname,'r');try{await handle.sync();}finally{await handle.close();}}catch(error){if(process.platform!=='win32')throw error;}}
export async function writeSafeSessionShare(file:string,share:SafeSessionShare){
  const valid=validateShare(share),body=`${JSON.stringify(valid,null,2)}\n`;if(Buffer.byteLength(body,'utf8')>SESSION_SHARE_MAX_BYTES)throw coded('SESSION_SHARE_LIMIT');
  const dirname=path.dirname(path.resolve(file));await mkdir(dirname,{recursive:true,mode:0o700});const target=path.resolve(file),temp=path.join(dirname,`.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try{const handle=await open(temp,'wx',0o600);try{await handle.writeFile(body,'utf8');await handle.sync();}finally{await handle.close();}await rename(temp,target);try{await chmod(target,0o600);}catch(error){if(process.platform!=='win32')throw error;}await syncDir(dirname);}
  catch(error){await rm(temp,{force:true}).catch(()=>{});throw error;}
}
