import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,rename,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {validateCliAttachments,type CliAttachment} from '../runtime/attachments.ts';

export const QUEUE_SCHEMA='talos.cli.queue.v1';
export const QUEUE_MAX_ENTRIES=64;
export const QUEUE_TEXT_MAX_BYTES=1024*1024;
export const QUEUE_STORE_MAX_BYTES=64*1024*1024;
export type QueueDeliveryStatus='pending'|'dispatching';
export type QueueStoreEntry={id:string;kind:'prompt'|'command';text:string;status:QueueDeliveryStatus;attachments?:CliAttachment[]};

export class QueueStoreError extends Error{
  code:string;
  constructor(code:string,message=code){super(message);this.name='QueueStoreError';this.code=code;}
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function session(value:string){if(typeof value!=='string'||!value.trim()||value.length>512||/[\0\r\n]/u.test(value))throw new QueueStoreError('QUEUE_STORE_INVALID','Session id is invalid.');return value;}
function cloneEntry(entry:QueueStoreEntry):QueueStoreEntry{return{...entry,...(entry.attachments?{attachments:entry.attachments.map(row=>({...row}))}:{})};}
function validateEntry(value:unknown):QueueStoreEntry{
  if(!value||typeof value!=='object')throw new QueueStoreError('QUEUE_STORE_INVALID','Queue entry is invalid.');
  const row=value as Partial<QueueStoreEntry>;
  if(typeof row.id!=='string'||!UUID.test(row.id)||!(row.kind==='prompt'||row.kind==='command')||!(row.status==='pending'||row.status==='dispatching')||typeof row.text!=='string')throw new QueueStoreError('QUEUE_STORE_INVALID','Queue entry shape is invalid.');
  if(!row.text.trim()||Buffer.byteLength(row.text,'utf8')>QUEUE_TEXT_MAX_BYTES)throw new QueueStoreError('QUEUE_STORE_INVALID','Queue entry text is invalid.');
  if(row.kind==='command'&&row.attachments!==undefined)throw new QueueStoreError('QUEUE_STORE_INVALID','Commands cannot carry attachments.');
  let attachments:CliAttachment[]|undefined;
  if(row.attachments!==undefined){try{attachments=validateCliAttachments(row.attachments);}catch{throw new QueueStoreError('QUEUE_STORE_INVALID','Queue attachment snapshot is invalid.');}}
  return{id:row.id,kind:row.kind,text:row.text,status:row.status,...(attachments?.length?{attachments}:{})};
}
function validated(entries:readonly QueueStoreEntry[]):QueueStoreEntry[]{
  if(!Array.isArray(entries)||entries.length>QUEUE_MAX_ENTRIES)throw new QueueStoreError('QUEUE_STORE_LIMIT',`A session queue can retain at most ${QUEUE_MAX_ENTRIES} entries.`);
  return entries.map(validateEntry);
}

export function createQueueStore({rootDir}:{rootDir:string}){
  if(typeof rootDir!=='string'||!rootDir.trim())throw new QueueStoreError('QUEUE_STORE_INVALID','Queue root is required.');
  const fileForSession=(sessionId:string)=>path.join(rootDir,createHash('sha256').update(session(sessionId)).digest('hex')+'.json');
  async function syncDirectory(){try{const handle=await open(rootDir,'r');try{await handle.sync();}finally{await handle.close();}}catch{/* Not available on every platform. */}}
  async function save(sessionId:string,entries:readonly QueueStoreEntry[]){
    const id=session(sessionId),rows=validated(entries).map(cloneEntry);
    const body=JSON.stringify({schema:QUEUE_SCHEMA,sessionId:id,entries:rows})+'\n';
    if(Buffer.byteLength(body,'utf8')>QUEUE_STORE_MAX_BYTES)throw new QueueStoreError('QUEUE_STORE_LIMIT','Queue store exceeds its byte budget.');
    await mkdir(rootDir,{recursive:true,mode:0o700});
    const file=fileForSession(id),temp=path.join(rootDir,'.'+path.basename(file)+'.'+process.pid+'.'+randomUUID()+'.tmp');
    let handle:Awaited<ReturnType<typeof open>>|null=null;
    try{
      handle=await open(temp,'wx',0o600);await handle.writeFile(body,'utf8');await handle.sync();await handle.close();handle=null;
      await rename(temp,file);await syncDirectory();
    }catch(error){
      try{await handle?.close();}catch{}
      await rm(temp,{force:true}).catch(()=>{});
      if(error instanceof QueueStoreError)throw error;
      throw Object.assign(new QueueStoreError('QUEUE_STORE_WRITE_FAILED','Queue state could not be written atomically.'),{cause:error});
    }
  }
  async function load(sessionId:string):Promise<QueueStoreEntry[]>{
    const id=session(sessionId),file=fileForSession(id);
    let info;try{info=await stat(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return[];throw Object.assign(new QueueStoreError('QUEUE_STORE_READ_FAILED'),{cause:error});}
    if(!info.isFile()||info.size>QUEUE_STORE_MAX_BYTES)throw new QueueStoreError('QUEUE_STORE_INVALID','Queue store file is invalid.');
    let parsed:any;try{parsed=JSON.parse(await readFile(file,'utf8'));}catch{throw new QueueStoreError('QUEUE_STORE_INVALID','Queue store is not valid JSON.');}
    if(parsed?.schema!==QUEUE_SCHEMA||parsed?.sessionId!==id||!Array.isArray(parsed?.entries))throw new QueueStoreError('QUEUE_STORE_INVALID','Queue store schema/session mismatch.');
    return validated(parsed.entries).map(cloneEntry);
  }
  return{fileForSession,save,load};
}
