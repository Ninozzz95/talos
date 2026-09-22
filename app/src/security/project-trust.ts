import {createHash} from 'node:crypto';
import {mkdir,open,readFile,realpath,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {WorkspaceIdentity} from './workspace-identity.ts';
import {isPathInsideWorkspace} from './workspace-identity.ts';

export type ExecutableResourceIdentity={
  workspaceIdentityHash:string;
  kind:'command'|'hook'|'plugin'|'mcp'|'context';
  id:string;
  relativePath:string;
  fingerprint:string;
  legacyFingerprint?:string;
};

export type ProjectTrustState={
  trusted:boolean;
  reason:'PROJECT_UNTRUSTED'|'PROJECT_TRUSTED'|'RESOURCE_TRUSTED'|'RESOURCE_NOT_TRUSTED'|'RESOURCE_SET_CHANGED'|'RESOURCE_FINGERPRINT_CHANGED'|'RESOURCE_IDENTITY_MISMATCH'|'NESTED_REPOSITORY_BOUNDARY_CHANGED';
};

type TrustedResourceV1={fingerprint:string;relativePath:string};
type TrustedResourceV2={kind:ExecutableResourceIdentity['kind'];id:string;fingerprint:string;relativePath:string;trustedAt:string};
type TrustRecordV1={
  schema:'talos.cli.project-trust.v1';
  identityHash:string;
  canonicalRoot:string;
  trustedAt:string;
  resources:Record<string,TrustedResourceV1>;
};
type TrustRecordV2={
  schema:'talos.cli.project-trust.v2';
  identityHash:string;
  canonicalRoot:string;
  trustedAt:string;
  updatedAt:string;
  rollbackValid?:boolean;
  nestedRepositories?:string[];
  resources:Record<string,TrustedResourceV2>;
};
type TrustRecord=TrustRecordV1|TrustRecordV2;

export type ProjectResourceTrustState='trusted'|'added'|'changed'|'removed';
export type ProjectResourceTrustInspection={
  key:string;
  kind:ExecutableResourceIdentity['kind'];
  id:string;
  relativePath:string;
  state:ProjectResourceTrustState;
  current?:ExecutableResourceIdentity;
  currentFingerprint?:string;
  trustedFingerprint?:string;
};
export type ProjectTrustInspection={
  state:ProjectTrustState;
  storeSchema:'v1'|'v2'|null;
  migrationRequired:boolean;
  resources:ProjectResourceTrustInspection[];
};

export type ProjectTrustService={
  status(workspace:WorkspaceIdentity):Promise<ProjectTrustState>;
  trust(workspace:WorkspaceIdentity,resources:readonly ExecutableResourceIdentity[],nestedRepositories?:readonly string[]):Promise<void>;
  revoke(workspace:WorkspaceIdentity):Promise<void>;
  verifyResource(workspace:WorkspaceIdentity,resource:ExecutableResourceIdentity):Promise<ProjectTrustState>;
  verifySnapshot(workspace:WorkspaceIdentity,resources:readonly ExecutableResourceIdentity[],nestedRepositories?:readonly string[]):Promise<ProjectTrustState>;
  inspectSnapshot(workspace:WorkspaceIdentity,resources:readonly ExecutableResourceIdentity[],nestedRepositories?:readonly string[]):Promise<ProjectTrustInspection>;
  reconcile(workspace:WorkspaceIdentity,resources:readonly ExecutableResourceIdentity[],keys:readonly string[],nestedRepositories?:readonly string[]):Promise<boolean>;
  untrustResources(workspace:WorkspaceIdentity,resources:readonly ExecutableResourceIdentity[],keys:readonly string[],nestedRepositories?:readonly string[]):Promise<boolean>;
  migrate(workspace:WorkspaceIdentity,resources:readonly ExecutableResourceIdentity[],nestedRepositories?:readonly string[]):Promise<boolean>;
  rollbackMigration(workspace:WorkspaceIdentity):Promise<boolean>;
  rollbackAvailable(workspace:WorkspaceIdentity):Promise<boolean>;
  migrationBackupPath(workspace:WorkspaceIdentity):string;
};

function fail(code:string):never{throw Object.assign(new Error(code),{code});}
export function projectResourceKey(resource:Pick<ExecutableResourceIdentity,'kind'|'id'>){return `${resource.kind}:${resource.id}`;}
function recordPath(trustRoot:string,workspace:WorkspaceIdentity){return path.join(trustRoot,`${workspace.identityHash}.json`);}
function backupPath(trustRoot:string,workspace:WorkspaceIdentity){return `${recordPath(trustRoot,workspace)}.v1.bak`;}
function parseResourceKey(key:string):{kind:ExecutableResourceIdentity['kind'];id:string}{
  const colon=key.indexOf(':');const kind=key.slice(0,colon) as ExecutableResourceIdentity['kind'];const id=key.slice(colon+1);
  if(colon<=0||!['command','hook','plugin','mcp','context'].includes(kind)||!id)fail('PROJECT_TRUST_STORE_INVALID');
  return{kind,id};
}
function trustedEntry(record:TrustRecord,key:string):TrustedResourceV1|TrustedResourceV2|undefined{return record.resources[key];}
function normalizeNestedRepositories(values:readonly string[]=[]):string[]{
  const out=[...new Set(values)].sort();
  for(const value of out){
    if(typeof value!=='string'||!value||value.includes('\\')||path.posix.isAbsolute(value)||value.split('/').some(part=>part===''||part==='.'||part==='..'))fail('PROJECT_TRUST_STORE_INVALID');
  }
  return out;
}
function sameNestedRepositories(left:readonly string[],right:readonly string[]){const a=normalizeNestedRepositories(left),b=normalizeNestedRepositories(right);return a.length===b.length&&a.every((value,index)=>value===b[index]);}
function validBase(value:any,workspace:WorkspaceIdentity){
  return value&&value.identityHash===workspace.identityHash&&value.canonicalRoot===workspace.canonicalRoot&&value.resources&&typeof value.resources==='object';
}
function validateRecord(value:any,workspace:WorkspaceIdentity):TrustRecord{
  if(!validBase(value,workspace))fail('PROJECT_TRUST_STORE_INVALID');
  if(value.schema==='talos.cli.project-trust.v1'){
    for(const [key,row] of Object.entries(value.resources as Record<string,any>)){parseResourceKey(key);if(typeof row?.fingerprint!=='string'||typeof row?.relativePath!=='string')fail('PROJECT_TRUST_STORE_INVALID');}
    if(typeof value.trustedAt!=='string')fail('PROJECT_TRUST_STORE_INVALID');
    return value as TrustRecordV1;
  }
  if(value.schema==='talos.cli.project-trust.v2'){
    for(const [key,row] of Object.entries(value.resources as Record<string,any>)){
      const parsed=parseResourceKey(key);
      if(row?.kind!==parsed.kind||row?.id!==parsed.id||typeof row?.fingerprint!=='string'||typeof row?.relativePath!=='string'||typeof row?.trustedAt!=='string')fail('PROJECT_TRUST_STORE_INVALID');
    }
    if(typeof value.trustedAt!=='string'||typeof value.updatedAt!=='string'||(value.rollbackValid!==undefined&&typeof value.rollbackValid!=='boolean'))fail('PROJECT_TRUST_STORE_INVALID');
    if(value.nestedRepositories!==undefined){if(!Array.isArray(value.nestedRepositories)||value.nestedRepositories.some((item:unknown)=>typeof item!=='string'))fail('PROJECT_TRUST_STORE_INVALID');normalizeNestedRepositories(value.nestedRepositories);}
    return value as TrustRecordV2;
  }
  fail('PROJECT_TRUST_STORE_INVALID');
}

async function readRecordWithText(trustRoot:string,workspace:WorkspaceIdentity):Promise<{record:TrustRecord;text:string}|null>{
  try{const text=await readFile(recordPath(trustRoot,workspace),'utf8');return{record:validateRecord(JSON.parse(text),workspace),text};}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}
async function readRecord(trustRoot:string,workspace:WorkspaceIdentity):Promise<TrustRecord|null>{return (await readRecordWithText(trustRoot,workspace))?.record??null;}

async function atomicWriteText(file:string,text:string):Promise<void>{
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=`${file}.tmp-${process.pid}-${Date.now()}`;
  try{
    await writeFile(temporary,text,{encoding:'utf8',mode:0o600});
    const handle=await open(temporary,'r+');try{await handle.sync();}finally{await handle.close();}
    await rename(temporary,file);
  }catch(error){await rm(temporary,{force:true});throw error;}
}
async function atomicWrite(file:string,value:TrustRecord):Promise<void>{return atomicWriteText(file,`${JSON.stringify(value,null,2)}\n`);}

function v2Resources(resources:readonly ExecutableResourceIdentity[],trustedAt:string):Record<string,TrustedResourceV2>{
  const entries=resources.map(resource=>[projectResourceKey(resource),{kind:resource.kind,id:resource.id,fingerprint:resource.fingerprint,relativePath:resource.relativePath,trustedAt}] as const).sort(([a],[b])=>a.localeCompare(b));
  return Object.fromEntries(entries);
}
function convertV1(record:TrustRecordV1,updatedAt:string,nestedRepositories:readonly string[]=[]):TrustRecordV2{
  const resources:Record<string,TrustedResourceV2>={};
  for(const key of Object.keys(record.resources).sort()){
    const parsed=parseResourceKey(key);const row=record.resources[key]!;
    resources[key]={...parsed,fingerprint:row.fingerprint,relativePath:row.relativePath,trustedAt:record.trustedAt};
  }
  return{schema:'talos.cli.project-trust.v2',identityHash:record.identityHash,canonicalRoot:record.canonicalRoot,trustedAt:record.trustedAt,updatedAt,rollbackValid:true,nestedRepositories:normalizeNestedRepositories(nestedRepositories),resources};
}
async function preserveLegacyBackup(trustRoot:string,workspace:WorkspaceIdentity,text:string){
  const backup=backupPath(trustRoot,workspace);
  try{await writeFile(backup,text,{encoding:'utf8',mode:0o600,flag:'wx'});}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const existing=await readFile(backup,'utf8');if(existing!==text)fail('TRUST_MIGRATION_BACKUP_CONFLICT');}
}

function trustedForResource(record:TrustRecord,resource:ExecutableResourceIdentity,consumedLegacy?:Set<string>){
  const direct=trustedEntry(record,projectResourceKey(resource));if(direct)return direct;
  if(record.schema==='talos.cli.project-trust.v1'&&resource.legacyFingerprint){
    const legacyKey=`${resource.kind}:${resource.relativePath}`;const legacy=record.resources[legacyKey];
    if(legacy&&legacy.fingerprint===resource.legacyFingerprint&&legacy.relativePath===resource.relativePath){consumedLegacy?.add(legacyKey);return legacy;}
  }
  return undefined;
}
function inspectRecord(record:TrustRecord|null,resources:readonly ExecutableResourceIdentity[],nestedRepositories:readonly string[]=[]):ProjectTrustInspection{
  const current=new Map(resources.map(resource=>[projectResourceKey(resource),resource] as const));const consumedLegacy=new Set<string>();
  const rows:ProjectResourceTrustInspection[]=[];
  for(const resource of resources){
    const key=projectResourceKey(resource);const trusted=record?trustedForResource(record,resource,consumedLegacy):undefined;
    const direct=record?trustedEntry(record,key):undefined;
    const state:ProjectResourceTrustState=!trusted?'added':direct?(direct.fingerprint===resource.fingerprint&&direct.relativePath===resource.relativePath?'trusted':'changed'):'trusted';
    rows.push({key,kind:resource.kind,id:resource.id,relativePath:resource.relativePath,state,current:resource,currentFingerprint:resource.fingerprint,...(trusted?{trustedFingerprint:trusted.fingerprint}:{})});
  }
  if(record)for(const key of Object.keys(record.resources).sort())if(!current.has(key)&&!consumedLegacy.has(key)){
    const parsed=parseResourceKey(key);const trusted=record.resources[key]!;
    rows.push({key,...parsed,relativePath:trusted.relativePath,state:'removed',trustedFingerprint:trusted.fingerprint});
  }
  rows.sort((a,b)=>a.relativePath.localeCompare(b.relativePath)||a.key.localeCompare(b.key));
  let state:ProjectTrustState;
  if(!record)state={trusted:false,reason:'PROJECT_UNTRUSTED'};
  else if(record.schema==='talos.cli.project-trust.v1'&&normalizeNestedRepositories(nestedRepositories).length>0)state={trusted:false,reason:'NESTED_REPOSITORY_BOUNDARY_CHANGED'};
  else if(record.schema==='talos.cli.project-trust.v2'&&!sameNestedRepositories(record.nestedRepositories??[],nestedRepositories))state={trusted:false,reason:'NESTED_REPOSITORY_BOUNDARY_CHANGED'};
  else if(rows.some(row=>row.state==='added'||row.state==='removed'))state={trusted:false,reason:'RESOURCE_SET_CHANGED'};
  else if(rows.some(row=>row.state==='changed'))state={trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED'};
  else state={trusted:true,reason:'PROJECT_TRUSTED'};
  return{state,storeSchema:record?.schema==='talos.cli.project-trust.v1'?'v1':record?'v2':null,migrationRequired:record?.schema==='talos.cli.project-trust.v1',resources:rows};
}

async function resourceLocation(workspace:WorkspaceIdentity,resourcePath:string){
  const canonicalPath=await realpath(path.resolve(resourcePath));if(!isPathInsideWorkspace(workspace,canonicalPath))fail('RESOURCE_OUTSIDE_WORKSPACE');
  return{canonicalPath,relativePath:path.relative(workspace.canonicalRoot,canonicalPath).split(path.sep).join('/')};
}
function fingerprintResource(workspace:WorkspaceIdentity,kind:ExecutableResourceIdentity['kind'],id:string,relativePath:string,content:string|Buffer,domain:string):ExecutableResourceIdentity{
  const fingerprint=createHash('sha256').update(domain).update('\0').update(kind).update('\0').update(id).update('\0').update(relativePath).update('\0').update(content).digest('hex');
  return{workspaceIdentityHash:workspace.identityHash,kind,id,relativePath,fingerprint};
}
export async function fingerprintExecutableResource({workspace,kind,id,path:resourcePath}:{workspace:WorkspaceIdentity;kind:ExecutableResourceIdentity['kind'];id:string;path:string}):Promise<ExecutableResourceIdentity>{
  const {canonicalPath,relativePath}=await resourceLocation(workspace,resourcePath);return fingerprintResource(workspace,kind,id,relativePath,await readFile(canonicalPath),'talos-executable-resource-v1');
}
export async function fingerprintExecutableResourceContent({workspace,kind,id,path:resourcePath,content,legacyFingerprint}:{workspace:WorkspaceIdentity;kind:ExecutableResourceIdentity['kind'];id:string;path:string;content:string|Buffer;legacyFingerprint?:string}):Promise<ExecutableResourceIdentity>{
  const {relativePath}=await resourceLocation(workspace,resourcePath);return{...fingerprintResource(workspace,kind,id,relativePath,content,'talos-executable-resource-semantic-v2'),...(legacyFingerprint?{legacyFingerprint}:{})};
}

export function createProjectTrustService({trustRoot,clock=()=>new Date().toISOString()}:{trustRoot:string;clock?:()=>string}):ProjectTrustService{
  async function ensureV2(workspace:WorkspaceIdentity,resources:readonly ExecutableResourceIdentity[],nestedRepositories:readonly string[]=[]):Promise<TrustRecordV2>{
    const current=await readRecordWithText(trustRoot,workspace);if(!current)fail('PROJECT_TRUST_REQUIRED');
    if(current.record.schema==='talos.cli.project-trust.v2')return current.record;
    await preserveLegacyBackup(trustRoot,workspace,current.text);
    const now=clock();const inspection=inspectRecord(current.record,resources);
    const trustedCurrent=inspection.resources.filter(row=>row.state==='trusted'&&row.current).map(row=>row.current!);
    return{schema:'talos.cli.project-trust.v2',identityHash:workspace.identityHash,canonicalRoot:workspace.canonicalRoot,trustedAt:current.record.trustedAt,updatedAt:now,rollbackValid:true,nestedRepositories:normalizeNestedRepositories(nestedRepositories),resources:v2Resources(trustedCurrent,current.record.trustedAt)};
  }
  return{
    async status(workspace){return await readRecord(trustRoot,workspace)?{trusted:true,reason:'PROJECT_TRUSTED'}:{trusted:false,reason:'PROJECT_UNTRUSTED'};},
    async trust(workspace,resources,nestedRepositories=[]){
      for(const resource of resources)if(resource.workspaceIdentityHash!==workspace.identityHash)fail('RESOURCE_IDENTITY_MISMATCH');
      const existing=await readRecordWithText(trustRoot,workspace);const fromV1=existing?.record.schema==='talos.cli.project-trust.v1';
      if(fromV1)await preserveLegacyBackup(trustRoot,workspace,existing.text);
      const now=clock();const record:TrustRecordV2={schema:'talos.cli.project-trust.v2',identityHash:workspace.identityHash,canonicalRoot:workspace.canonicalRoot,trustedAt:existing?.record.trustedAt??now,updatedAt:now,rollbackValid:fromV1,nestedRepositories:normalizeNestedRepositories(nestedRepositories),resources:v2Resources(resources,now)};
      await atomicWrite(recordPath(trustRoot,workspace),record);
    },
    async revoke(workspace){await Promise.all([rm(recordPath(trustRoot,workspace),{force:true}),rm(backupPath(trustRoot,workspace),{force:true})]);},
    async verifyResource(workspace,resource){
      const record=await readRecord(trustRoot,workspace);if(!record)return{trusted:false,reason:'PROJECT_UNTRUSTED'};
      if(resource.workspaceIdentityHash!==workspace.identityHash)return{trusted:false,reason:'RESOURCE_IDENTITY_MISMATCH'};
      const direct=trustedEntry(record,projectResourceKey(resource));const trusted=trustedForResource(record,resource);if(!trusted)return{trusted:false,reason:'RESOURCE_NOT_TRUSTED'};
      if(direct&&(direct.fingerprint!==resource.fingerprint||direct.relativePath!==resource.relativePath))return{trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED'};
      return{trusted:true,reason:'RESOURCE_TRUSTED'};
    },
    async verifySnapshot(workspace,resources,nestedRepositories=[]){return (await this.inspectSnapshot(workspace,resources,nestedRepositories)).state;},
    async inspectSnapshot(workspace,resources,nestedRepositories=[]){for(const resource of resources)if(resource.workspaceIdentityHash!==workspace.identityHash)return{state:{trusted:false,reason:'RESOURCE_IDENTITY_MISMATCH'},storeSchema:null,migrationRequired:false,resources:[]};return inspectRecord(await readRecord(trustRoot,workspace),resources,nestedRepositories);},
    async reconcile(workspace,resources,keys,nestedRepositories=[]){
      const requested=[...new Set(keys)].sort();if(!requested.length)return false;
      for(const resource of resources)if(resource.workspaceIdentityHash!==workspace.identityHash)fail('RESOURCE_IDENTITY_MISMATCH');
      const record=await ensureV2(workspace,resources,nestedRepositories);const current=new Map(resources.map(resource=>[projectResourceKey(resource),resource] as const));const now=clock();let changed=false;
      for(const key of requested){const resource=current.get(key);if(resource){const previous=record.resources[key];const next={kind:resource.kind,id:resource.id,fingerprint:resource.fingerprint,relativePath:resource.relativePath,trustedAt:now};if(!previous||previous.fingerprint!==next.fingerprint||previous.relativePath!==next.relativePath){record.resources[key]=next;changed=true;}}else if(record.resources[key]){delete record.resources[key];changed=true;}}
      if(changed){record.updatedAt=now;record.rollbackValid=false;await atomicWrite(recordPath(trustRoot,workspace),record);}return changed;
    },
    async untrustResources(workspace,resources,keys,nestedRepositories=[]){
      const requested=[...new Set(keys)].sort();if(!requested.length)return false;
      const existing=await readRecord(trustRoot,workspace);if(!existing)return false;
      const record=await ensureV2(workspace,resources,nestedRepositories);let changed=false;for(const key of requested)if(record.resources[key]){delete record.resources[key];changed=true;}
      if(changed){record.updatedAt=clock();record.rollbackValid=false;await atomicWrite(recordPath(trustRoot,workspace),record);}return changed;
    },
    async migrate(workspace,resources,nestedRepositories=[]){
      const existing=await readRecordWithText(trustRoot,workspace);if(!existing)return false;if(existing.record.schema==='talos.cli.project-trust.v2')return false;
      const inspection=inspectRecord(existing.record,resources,[]);if(!inspection.state.trusted)fail('TRUST_MIGRATION_SNAPSHOT_CHANGED');
      await preserveLegacyBackup(trustRoot,workspace,existing.text);const now=clock();const record:TrustRecordV2={schema:'talos.cli.project-trust.v2',identityHash:workspace.identityHash,canonicalRoot:workspace.canonicalRoot,trustedAt:existing.record.trustedAt,updatedAt:now,rollbackValid:true,nestedRepositories:normalizeNestedRepositories(nestedRepositories),resources:v2Resources(resources,existing.record.trustedAt)};await atomicWrite(recordPath(trustRoot,workspace),record);return true;
    },
    async rollbackMigration(workspace){
      const backup=backupPath(trustRoot,workspace);let text:string;try{text=await readFile(backup,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')fail('TRUST_MIGRATION_ROLLBACK_UNAVAILABLE');throw error;}
      const current=await readRecord(trustRoot,workspace);if(!current||current.schema!=='talos.cli.project-trust.v2')fail('TRUST_MIGRATION_ROLLBACK_INVALID');
      if(current.rollbackValid!==true)fail('TRUST_MIGRATION_ROLLBACK_STALE');
      const parsed=validateRecord(JSON.parse(text),workspace);if(parsed.schema!=='talos.cli.project-trust.v1')fail('TRUST_MIGRATION_BACKUP_INVALID');
      await atomicWriteText(recordPath(trustRoot,workspace),text);await rm(backup,{force:true});return true;
    },
    async rollbackAvailable(workspace){
      const current=await readRecord(trustRoot,workspace);if(!current||current.schema!=='talos.cli.project-trust.v2'||current.rollbackValid!==true)return false;
      try{const text=await readFile(backupPath(trustRoot,workspace),'utf8');const parsed=validateRecord(JSON.parse(text),workspace);return parsed.schema==='talos.cli.project-trust.v1';}
      catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
    },
    migrationBackupPath(workspace){return backupPath(trustRoot,workspace);}
  };
}
