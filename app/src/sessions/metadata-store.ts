import {createHash,randomUUID} from 'node:crypto';
import {chmod,mkdir,open,readFile,rename,rm,stat} from 'node:fs/promises';
import path from 'node:path';

export const SESSION_METADATA_SCHEMA='talos.cli.session-metadata.v1';
export const SESSION_METADATA_MAX_TAGS=32;
export const SESSION_METADATA_TAG_MAX_BYTES=96;
export const SESSION_METADATA_STORE_MAX_BYTES=64*1024;

export type SessionMetadata={
  schema:typeof SESSION_METADATA_SCHEMA;
  sessionId:string;
  tags:string[];
  pinned:boolean;
  createdAt:string;
  updatedAt:string;
};

export class SessionMetadataError extends Error{
  code:string;
  constructor(code:string,message=code){super(message);this.name='SessionMetadataError';this.code=code;}
}

function fail(message='Session metadata is invalid.'):never{throw new SessionMetadataError('SESSION_METADATA_INVALID',message);}
function sessionId(value:unknown):string{
  if(typeof value!=='string'||!value.trim()||value.length>512||/[\0\r\n]/u.test(value))fail('Session id is invalid.');
  return value;
}
function tagValue(value:unknown):string{
  if(typeof value!=='string')fail('Tag is invalid.');
  const normalized=value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
  if(!normalized||/[\u0000-\u001f\u007f-\u009f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/u.test(normalized)||Buffer.byteLength(normalized,'utf8')>SESSION_METADATA_TAG_MAX_BYTES)fail('Tag is invalid.');
  return normalized;
}
function timestamp(value:unknown):value is string{return typeof value==='string'&&value.length<=64&&!Number.isNaN(Date.parse(value));}
function validate(value:unknown,expectedSessionId:string):SessionMetadata{
  if(!value||typeof value!=='object'||Array.isArray(value))fail();
  const row=value as Partial<SessionMetadata>;
  if(row.schema!==SESSION_METADATA_SCHEMA||row.sessionId!==expectedSessionId||typeof row.pinned!=='boolean'||!timestamp(row.createdAt)||!timestamp(row.updatedAt)||!Array.isArray(row.tags)||row.tags.length>SESSION_METADATA_MAX_TAGS)fail();
  const tags:string[]=[];const seen=new Set<string>();
  for(const raw of row.tags){const normalized=tagValue(raw);if(raw!==normalized||seen.has(normalized))fail();seen.add(normalized);tags.push(normalized);}
  return{schema:SESSION_METADATA_SCHEMA,sessionId:expectedSessionId,tags,pinned:row.pinned,createdAt:row.createdAt,updatedAt:row.updatedAt};
}
async function privateDir(dirname:string){await mkdir(dirname,{recursive:true,mode:0o700});try{await chmod(dirname,0o700);}catch(error){if(process.platform!=='win32')throw error;}}
async function syncDir(dirname:string){try{const handle=await open(dirname,'r');try{await handle.sync();}finally{await handle.close();}}catch(error){if(process.platform!=='win32')throw error;}}
async function atomicWrite(file:string,body:string){
  const dirname=path.dirname(file);await privateDir(dirname);const temp=path.join(dirname,`.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try{
    const handle=await open(temp,'wx',0o600);try{await handle.writeFile(body,'utf8');await handle.sync();}finally{await handle.close();}
    await rename(temp,file);try{await chmod(file,0o600);}catch(error){if(process.platform!=='win32')throw error;}await syncDir(dirname);
  }catch(error){await rm(temp,{force:true}).catch(()=>{});if(error instanceof SessionMetadataError)throw error;throw Object.assign(new SessionMetadataError('SESSION_METADATA_WRITE_FAILED','Session metadata could not be written atomically.'),{cause:error});}
}

export function sessionMetadataRoot(dataRoot:string){if(typeof dataRoot!=='string'||!dataRoot.trim())fail('Data root is invalid.');return path.join(dataRoot,'session-metadata');}

export function createSessionMetadataStore({rootDir}:{rootDir:string}){
  if(typeof rootDir!=='string'||!rootDir.trim())fail('Metadata root is invalid.');
  const fileForSession=(id:string)=>path.join(rootDir,`${createHash('sha256').update(sessionId(id)).digest('hex')}.json`);
  async function get(idValue:string):Promise<SessionMetadata|null>{
    const id=sessionId(idValue),file=fileForSession(id);let info;
    try{info=await stat(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw Object.assign(new SessionMetadataError('SESSION_METADATA_READ_FAILED'),{cause:error});}
    if(!info.isFile()||info.size>SESSION_METADATA_STORE_MAX_BYTES)fail();
    let parsed:unknown;try{parsed=JSON.parse(await readFile(file,'utf8'));}catch{fail('Session metadata is not valid JSON.');}
    return validate(parsed,id);
  }
  async function save(row:SessionMetadata):Promise<SessionMetadata>{
    const valid=validate(row,sessionId(row.sessionId));const body=`${JSON.stringify(valid)}\n`;
    if(Buffer.byteLength(body,'utf8')>SESSION_METADATA_STORE_MAX_BYTES)throw new SessionMetadataError('SESSION_METADATA_LIMIT','Session metadata exceeds its byte budget.');
    await atomicWrite(fileForSession(valid.sessionId),body);return valid;
  }
  async function mutate(idValue:string,change:(row:SessionMetadata)=>void):Promise<SessionMetadata>{
    const id=sessionId(idValue),current=await get(id),now=new Date().toISOString();
    const next:SessionMetadata=current?{...current,tags:[...current.tags]}:{schema:SESSION_METADATA_SCHEMA,sessionId:id,tags:[],pinned:false,createdAt:now,updatedAt:now};
    change(next);next.updatedAt=now;return save(next);
  }
  async function addTag(id:string,rawTag:string){const tag=tagValue(rawTag);return mutate(id,row=>{if(row.tags.includes(tag))return;if(row.tags.length>=SESSION_METADATA_MAX_TAGS)throw new SessionMetadataError('SESSION_METADATA_LIMIT',`A session can have at most ${SESSION_METADATA_MAX_TAGS} tags.`);row.tags.push(tag);});}
  async function removeTag(id:string,rawTag:string){const tag=tagValue(rawTag);return mutate(id,row=>{row.tags=row.tags.filter(value=>value!==tag);});}
  async function setPinned(id:string,pinned:boolean){if(typeof pinned!=='boolean')fail('Pin state is invalid.');return mutate(id,row=>{row.pinned=pinned;});}
  return{fileForSession,get,addTag,removeTag,setPinned};
}
