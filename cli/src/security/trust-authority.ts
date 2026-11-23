import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readdir,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {realpathTolerant as realpath} from './real-path.ts';
import {homedir} from 'node:os';
import path from 'node:path';
import {normalizeProjectRoot} from '../paths.ts';
import {createProjectTrustService,projectResourceKey,type ExecutableResourceIdentity,type ProjectResourceTrustInspection,type ProjectTrustState} from './project-trust.ts';
import {inventoryProjectResources} from './project-resource-inventory.ts';
import {findNestedRepositories,resolveWorkspaceIdentity,type NestedRepository,type WorkspaceIdentity} from './workspace-identity.ts';

export type TrustExecutableScope={kind:'hook'|'mcp'|'plugin';id:string};
export type TrustAuthorityResource=ProjectResourceTrustInspection;
export type TrustAuthoritySnapshot={
  trusted:boolean;
  reason:ProjectTrustState['reason']|'NO_PROJECT_RESOURCES';
  storeSchema:'v1'|'v2'|null;
  migrationRequired:boolean;
  rollbackAvailable:boolean;
  workspace:WorkspaceIdentity;
  resources:TrustAuthorityResource[];
  nestedRepositories:NestedRepository[];
};
export type TrustExpectation={workspaceIdentityHash:string;resources:readonly ExecutableResourceIdentity[];nestedRepositories:readonly NestedRepository[]};
export type TrustCompatibilityRoots={hooks:string;mcp:string;plugins:string};
export type TrustQuarantineRecord={
  schema:'talos.cli.trust-quarantine.v1';
  active:true;
  workspaceIdentityHash:string;
  kind:TrustExecutableScope['kind'];
  id:string;
  quarantinedAt:string;
  reason:string|null;
  reviewedFingerprint:string|null;
};
/**
 * R4 (owner decision Q-R4-1, gate E2): a decision about the FOLDER, kept apart from the per-file snapshot. Every folder
 * without one is asked once, with or without project files. `source` says where the decision comes from: a record for
 * this folder, a record for an enclosing folder ("Trust the parent folder"), or a project trust record written before
 * R4 (people who already trusted a project are not asked again). The home folder and a drive root are `sessionOnly`:
 * nothing is ever saved for them and a record found there decides nothing. `parent` is the folder "Trust the parent
 * folder" would save, or null when that choice is not offered (the parent is the home folder or a drive root).
 */
export type FolderTrustDecision={decided:boolean;source:'folder'|'parent'|'project'|null;path:string|null;sessionOnly:boolean;parent:string|null};
/** 'this' saves the decision for this folder, 'parent' for its parent, 'none' saves no folder decision (session only). */
export type FolderTrustTarget='this'|'parent'|'none';
export type TrustAuthority={
  inspect():Promise<TrustAuthoritySnapshot>;
  folderDecision(snapshot?:TrustAuthoritySnapshot):Promise<FolderTrustDecision>;
  /** `session` (R4 Q-R4-17): trust for this process only — nothing is written. The home folder and a drive root are always so. */
  trustProject(options?:{expected?:TrustAuthoritySnapshot|TrustExpectation;includeNested?:boolean;folder?:FolderTrustTarget;session?:boolean}):Promise<TrustAuthoritySnapshot>;
  revokeProject():Promise<TrustAuthoritySnapshot>;
  /** R4 Q-R4-17: true while this process trusts the project for this session only (nothing of it may be written). */
  sessionGrant():Promise<boolean>;
  /** R2-F1 (cure 208 bis, 06/11/2026): whether the folder is trusted NOW, read light (no inventory of the project's files), from
   *  the sources `folderDecision` reads: this process's session grant, the project's record, a record for this folder or an enclosing one. */
  folderTrusted():Promise<boolean>;
  trustScope(scope:TrustExecutableScope,options?:{expected?:TrustAuthoritySnapshot|TrustExpectation}):Promise<{changed:boolean;snapshot:TrustAuthoritySnapshot}>;
  untrustScope(scope:TrustExecutableScope):Promise<{changed:boolean;snapshot:TrustAuthoritySnapshot}>;
  verifyScope(scope:TrustExecutableScope):Promise<boolean>;
  quarantineScope(scope:TrustExecutableScope,options?:{reason?:string|null;expected?:TrustAuthoritySnapshot|TrustExpectation}):Promise<{changed:boolean;snapshot:TrustAuthoritySnapshot;record:TrustQuarantineRecord}>;
  releaseQuarantine(scope:TrustExecutableScope):Promise<{changed:boolean}>;
  quarantineStatus(scope:TrustExecutableScope):Promise<TrustQuarantineRecord|null>;
  migrateLegacy(options?:{includeNested?:boolean}):Promise<TrustAuthoritySnapshot>;
  rollbackMigration():Promise<TrustAuthoritySnapshot>;
  migrationBackupPath():Promise<string>;
  compatibilityRoots():Promise<TrustCompatibilityRoots>;
};

function fail(code:string,message=code,extra:Record<string,unknown>={}):never{throw Object.assign(new Error(message),{code,...extra});}
function resourceSignature(resources:readonly ExecutableResourceIdentity[]){return JSON.stringify([...resources].map(row=>({key:projectResourceKey(row),path:row.relativePath,fingerprint:row.fingerprint})).sort((a,b)=>a.key.localeCompare(b.key)));}
function nestedSignature(entries:readonly NestedRepository[]){return JSON.stringify([...entries].map(row=>({relativePath:row.relativePath,resources:[...row.resources].sort()})).sort((a,b)=>a.relativePath.localeCompare(b.relativePath)));}
function expectationOf(value:TrustAuthoritySnapshot|TrustExpectation):TrustExpectation{
  if('workspaceIdentityHash'in value)return value;
  return{workspaceIdentityHash:value.workspace.identityHash,resources:value.resources.flatMap(row=>row.current?[row.current]:[]),nestedRepositories:value.nestedRepositories};
}
function nestedConsentFailure(snapshot:TrustAuthoritySnapshot):never{
  const crossing=snapshot.nestedRepositories.reduce((total,row)=>total+row.resources.length,0);
  const detail=snapshot.nestedRepositories.map(row=>`${row.relativePath} (${row.resources.slice(0,3).join(', ')}${row.resources.length>3?`, and ${row.resources.length-3} more`:''})`).join('; ');
  fail('PROJECT_TRUST_NESTED_REPOSITORY_CONSENT_REQUIRED',`PROJECT_TRUST_NESTED_REPOSITORY_CONSENT_REQUIRED: ${crossing} project resources cross nested repository boundaries: ${detail}. Re-run with --include-nested to trust them deliberately.`);
}
function scopeRows(snapshot:TrustAuthoritySnapshot,scope:TrustExecutableScope){
  if(scope.kind==='plugin'){
    const prefix=`.harness-ui-plugins/${scope.id}/`;
    return snapshot.resources.filter(row=>row.kind==='plugin'&&row.relativePath.startsWith(prefix));
  }
  return snapshot.resources.filter(row=>row.kind===scope.kind&&row.id===scope.id);
}
export function compatibilityTrustRoots(trustRoot:string,workspace:WorkspaceIdentity):TrustCompatibilityRoots{
  const base=path.join(trustRoot,'compat',workspace.identityHash);
  return{hooks:path.join(base,'hooks'),mcp:path.join(base,'mcp'),plugins:path.join(base,'plugins')};
}

function quarantinePath(trustRoot:string,workspace:WorkspaceIdentity,scope:TrustExecutableScope){
  const digest=createHash('sha256').update(scope.kind+'\0'+scope.id).digest('hex');
  return path.join(trustRoot,'quarantine',workspace.identityHash,digest+'.json');
}
function scopeReviewedFingerprint(rows:readonly TrustAuthorityResource[]){
  const fingerprints=rows.flatMap(row=>row.currentFingerprint?[row.currentFingerprint]:[]).sort();
  if(!fingerprints.length)return null;
  return fingerprints.length===1?fingerprints[0]!:createHash('sha256').update(fingerprints.join('\n')).digest('hex');
}
function validateQuarantineRecord(value:any,workspace:WorkspaceIdentity,scope:TrustExecutableScope):TrustQuarantineRecord{
  if(!value||value.schema!=='talos.cli.trust-quarantine.v1'||value.active!==true
    ||value.workspaceIdentityHash!==workspace.identityHash||value.kind!==scope.kind||value.id!==scope.id
    ||typeof value.quarantinedAt!=='string'||(value.reason!==null&&typeof value.reason!=='string')
    ||(value.reviewedFingerprint!==null&&typeof value.reviewedFingerprint!=='string')){
    fail('TRUST_QUARANTINE_STORE_INVALID');
  }
  return value as TrustQuarantineRecord;
}
async function readQuarantineRecord(trustRoot:string,workspace:WorkspaceIdentity,scope:TrustExecutableScope):Promise<TrustQuarantineRecord|null>{
  try{
    const text=await readFile(quarantinePath(trustRoot,workspace,scope),'utf8');
    return validateQuarantineRecord(JSON.parse(text),workspace,scope);
  }catch(error){
    if((error as NodeJS.ErrnoException).code==='ENOENT')return null;
    if(error instanceof SyntaxError)fail('TRUST_QUARANTINE_STORE_INVALID');
    throw error;
  }
}
async function writeQuarantineRecord(trustRoot:string,workspace:WorkspaceIdentity,scope:TrustExecutableScope,record:TrustQuarantineRecord){
  const target=quarantinePath(trustRoot,workspace,scope);
  await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  const temporary=target+'.tmp-'+process.pid+'-'+randomUUID();
  try{
    await writeFile(temporary,JSON.stringify(record,null,2)+'\n',{encoding:'utf8',mode:0o600});
    await rename(temporary,target);
  }finally{await rm(temporary,{force:true}).catch(()=>{});}
}

/* Folder decisions (R4). One small file per folder under `<trustRoot>/folders/`, named by a hash of the normalized
   canonical path (the same normalization as the workspace identity), written through a temporary file and a rename. A
   record that cannot be read or does not name its own folder decides nothing: the folder is asked again (fail closed). */
const FOLDER_SCHEMA='talos.cli.folder-trust.v1';
function folderKey(folder:string){return normalizeProjectRoot(path.resolve(folder));}
function folderRecordPath(trustRoot:string,folder:string){
  const digest=createHash('sha256').update('talos-folder-trust-v1\0'+folderKey(folder)).digest('hex');
  return path.join(trustRoot,'folders',digest+'.json');
}
async function hasFolderRecord(trustRoot:string,folder:string):Promise<boolean>{
  try{
    const value=JSON.parse(await readFile(folderRecordPath(trustRoot,folder),'utf8'));
    return value?.schema===FOLDER_SCHEMA&&typeof value.canonicalRoot==='string'&&folderKey(value.canonicalRoot)===folderKey(folder)&&typeof value.decidedAt==='string';
  }catch{return false;}
}
async function writeFolderRecord(trustRoot:string,folder:string,decidedAt:string){
  const target=folderRecordPath(trustRoot,folder);
  await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  const temporary=target+'.tmp-'+process.pid+'-'+randomUUID();
  try{
    await writeFile(temporary,JSON.stringify({schema:FOLDER_SCHEMA,canonicalRoot:folder,decidedAt},null,2)+'\n',{encoding:'utf8',mode:0o600});
    await rename(temporary,target);
  }finally{await rm(temporary,{force:true}).catch(()=>{});}
}
/** The folders the person trusted, the latest first: what New session can offer, since sessions are kept per folder. An unreadable record is left out; nothing here decides trust. */
export async function listTrustedFolders(trustRoot:string,{limit=50,exists=(folder:string)=>stat(folder).then(row=>row.isDirectory(),()=>false)}:{limit?:number;/* a folder that is gone is no choice */exists?:(folder:string)=>Promise<boolean>}={}):Promise<{path:string;decidedAt:string}[]>{
  const directory=path.join(trustRoot,'folders');let names:string[]=[];
  try{names=(await readdir(directory)).filter(name=>name.endsWith('.json'));}catch{return[];}
  const rows=await Promise.all(names.map(async name=>{
    try{const value=JSON.parse(await readFile(path.join(directory,name),'utf8'));return value?.schema===FOLDER_SCHEMA&&typeof value.canonicalRoot==='string'&&typeof value.decidedAt==='string'?{path:value.canonicalRoot as string,decidedAt:value.decidedAt as string}:null;}
    catch{return null;}
  }));
  const known=rows.filter((row):row is {path:string;decidedAt:string}=>row!==null).sort((a,b)=>b.decidedAt.localeCompare(a.decidedAt)).slice(0,limit);
  const there=await Promise.all(known.map(row=>exists(row.path)));
  return known.filter((_,index)=>there[index]);
}
async function canonicalHome(homeDir:string|undefined){const raw=homeDir??homedir();try{return await realpath(raw);}catch{return path.resolve(raw);}}

/** The home folder and a drive root count for the session only (owner Q-R4-1; Claude Code treats the home directory so).
 *  «One line», step 3 (judge v1483, owner decision 11/11 16:35): so does every folder ABOVE the home folder, as on the PC and as
 *  Hermes, «a repo at or above $HOME never counts» (agent/lsp/workspace.py:160). A folder whose name only starts like the home
 *  folder is not above it (compared by path segments, never by text prefix). */
export function isSessionOnlyFolder(folder:string,{home=homedir()}:{home?:string}={}):boolean{
  const resolved=path.resolve(folder);const key=folderKey(resolved);
  if(key===folderKey(path.parse(resolved).root)||key===folderKey(home))return true;
  const below=path.relative(key,folderKey(path.resolve(home)));
  return below!==''&&!below.startsWith('..')&&!path.isAbsolute(below);
}

export function createTrustAuthority({projectRoot,trustRoot,clock,homeDir}:{projectRoot:string;trustRoot:string;clock?:()=>string;homeDir?:string}):TrustAuthority{
  const service=createProjectTrustService({trustRoot,...(clock?{clock}:{})});
  const now=clock??(()=>new Date().toISOString());
  async function folderDecision(snapshot?:TrustAuthoritySnapshot):Promise<FolderTrustDecision>{
    const fresh=snapshot??await current();const folder=fresh.workspace.canonicalRoot;const home=await canonicalHome(homeDir);
    if(isSessionOnlyFolder(folder,{home}))return{decided:false,source:null,path:null,sessionOnly:true,parent:null};
    const above=path.dirname(folder);const parent=above!==folder&&!isSessionOnlyFolder(above,{home})?above:null;
    if(await hasFolderRecord(trustRoot,folder))return{decided:true,source:'folder',path:folder,sessionOnly:false,parent};
    if(fresh.storeSchema!==null)return{decided:true,source:'project',path:folder,sessionOnly:false,parent};
    for(let cursor=above;;){
      if(!isSessionOnlyFolder(cursor,{home})&&await hasFolderRecord(trustRoot,cursor))return{decided:true,source:'parent',path:cursor,sessionOnly:false,parent};
      const next=path.dirname(cursor);if(next===cursor)break;cursor=next;
    }
    return{decided:false,source:null,path:null,sessionOnly:false,parent};
  }
  /* Which folder a grant saves, decided before anything is written. Omitted: this folder, or nothing for a session-only one. */
  async function folderTarget(fresh:TrustAuthoritySnapshot,want:FolderTrustTarget|undefined):Promise<string|null>{
    const folder=fresh.workspace.canonicalRoot;const home=await canonicalHome(homeDir);const sessionOnly=isSessionOnlyFolder(folder,{home});
    const target=want??(sessionOnly?'none':'this');
    if(target==='none')return null;
    if(target==='this'){
      if(sessionOnly)fail('PROJECT_TRUST_REQUIRED','The home folder and a drive root are trusted for one session only; TALOS never saves that decision.');
      return folder;
    }
    const above=path.dirname(folder);
    if(sessionOnly||above===folder||isSessionOnlyFolder(above,{home}))fail('PROJECT_TRUST_REQUIRED','The parent folder is the home folder or a drive root, and TALOS never saves trust for those.');
    return above;
  }
  async function current(){
    const workspace=await resolveWorkspaceIdentity({projectRoot});const resources=await inventoryProjectResources(workspace);
    const nestedRepositories=await findNestedRepositories(workspace,[...new Set(resources.map(resource=>resource.relativePath))]);
    const inspection=await service.inspectSnapshot(workspace,resources,nestedRepositories.map(row=>row.relativePath));
    const noResources=resources.length===0&&inspection.storeSchema===null;
    const rollbackAvailable=await service.rollbackAvailable(workspace);
    return{
      trusted:noResources?true:inspection.state.trusted,
      reason:noResources?'NO_PROJECT_RESOURCES':inspection.state.reason,
      storeSchema:inspection.storeSchema,
      migrationRequired:inspection.migrationRequired,
      rollbackAvailable,
      workspace,resources:inspection.resources,nestedRepositories
    } as TrustAuthoritySnapshot;
  }
  async function exactExpected(expected:TrustAuthoritySnapshot|TrustExpectation,fresh:TrustAuthoritySnapshot){
    const want=expectationOf(expected);
    const currentResources=fresh.resources.flatMap(row=>row.current?[row.current]:[]);
    if(want.workspaceIdentityHash!==fresh.workspace.identityHash||resourceSignature(want.resources)!==resourceSignature(currentResources)){
      fail('PROJECT_TRUST_INVALIDATED','PROJECT_TRUST_INVALIDATED: project resources changed while trust was being reviewed.',{reason:'TRUST_REVIEW_CHANGED'});
    }
    if(nestedSignature(want.nestedRepositories)!==nestedSignature(fresh.nestedRepositories)){
      fail('PROJECT_TRUST_INVALIDATED','PROJECT_TRUST_INVALIDATED: nested repository boundaries changed while trust was being reviewed.',{reason:'NESTED_REPOSITORY_BOUNDARY_CHANGED'});
    }
  }
  return{
    inspect:current,
    folderDecision,
    async trustProject(options={}){
      const fresh=await current();const expected=options.expected?expectationOf(options.expected):null;
      const home=await canonicalHome(homeDir);
      /* Q-R4-17: a session-only folder never gets anything on disk, whoever asks; the flag makes the question's answer explicit. */
      const session=options.session===true||isSessionOnlyFolder(fresh.workspace.canonicalRoot,{home});
      const target=session&&options.folder===undefined?null:await folderTarget(fresh,options.folder);
      if(expected&&expected.workspaceIdentityHash!==fresh.workspace.identityHash)fail('PROJECT_TRUST_INVALIDATED','PROJECT_TRUST_INVALIDATED: workspace identity changed while trust was being reviewed.',{reason:'RESOURCE_IDENTITY_MISMATCH'});
      const reviewedNested=expected?.nestedRepositories??fresh.nestedRepositories;
      if(reviewedNested.length&&!options.includeNested)nestedConsentFailure({...fresh,nestedRepositories:[...reviewedNested]});
      const reviewedResources=expected?.resources??fresh.resources.flatMap(row=>row.current?[row.current]:[]);
      if(reviewedResources.length)await service.trust(fresh.workspace,reviewedResources,reviewedNested.map(row=>row.relativePath),{session});
      const verified=await current();
      if(expected&&resourceSignature(expected.resources)!==resourceSignature(verified.resources.flatMap(row=>row.current?[row.current]:[]))){
        fail('PROJECT_TRUST_INVALIDATED',`PROJECT_TRUST_INVALIDATED: the trusted project snapshot changed (${verified.reason}). TALOS did not load the changed snapshot.`,{reason:verified.reason,projectIdentity:verified.workspace.identityHash});
      }
      if(expected&&nestedSignature(expected.nestedRepositories)!==nestedSignature(verified.nestedRepositories)){
        if(session)service.forgetSession(fresh.workspace);else await service.revoke(fresh.workspace);
        fail('PROJECT_TRUST_INVALIDATED','PROJECT_TRUST_INVALIDATED: nested repository boundaries changed while trust was being confirmed. TALOS revoked the new grant.',{reason:'NESTED_REPOSITORY_BOUNDARY_CHANGED',projectIdentity:verified.workspace.identityHash});
      }
      if(target!==null&&!session)await writeFolderRecord(trustRoot,target,now());
      return verified;
    },
    async sessionGrant(){return service.hasSession(await resolveWorkspaceIdentity({projectRoot}));},
    async folderTrusted(){
      const workspace=await resolveWorkspaceIdentity({projectRoot});
      if(service.hasSession(workspace)||(await service.status(workspace)).trusted)return true;
      const home=await canonicalHome(homeDir);
      for(let cursor=workspace.canonicalRoot;;){
        if(!isSessionOnlyFolder(cursor,{home})&&await hasFolderRecord(trustRoot,cursor))return true;
        const next=path.dirname(cursor);if(next===cursor)return false;cursor=next;
      }
    },
    async revokeProject(){const before=await current();await service.revoke(before.workspace);await rm(folderRecordPath(trustRoot,before.workspace.canonicalRoot),{force:true});await rm(path.join(trustRoot,'compat',before.workspace.identityHash),{recursive:true,force:true});return current();},
    async trustScope(scope,options={}){
      const before=await current();if(options.expected)await exactExpected(options.expected,before);
      if(await readQuarantineRecord(trustRoot,before.workspace,scope))fail('TRUST_SCOPE_QUARANTINED','TRUST_SCOPE_QUARANTINED: release quarantine before trusting this executable scope.');
      if(before.storeSchema===null)fail('PROJECT_TRUST_REQUIRED');
      if(before.storeSchema==='v1')fail('TRUST_MIGRATION_REQUIRED','TRUST_MIGRATION_REQUIRED: migrate the legacy project trust store before changing individual resource trust.');
      if(before.reason==='NESTED_REPOSITORY_BOUNDARY_CHANGED')nestedConsentFailure(before);
      const rows=scopeRows(before,scope);if(!rows.length)fail('RESOURCE_NOT_FOUND');
      const keys=rows.map(row=>row.key);const allTrusted=rows.every(row=>row.state==='trusted');
      const resources=before.resources.flatMap(row=>row.current?[row.current]:[]);
      const changed=allTrusted?false:await service.reconcile(before.workspace,resources,keys,before.nestedRepositories.map(row=>row.relativePath));
      return{changed,snapshot:await current()};
    },
    async untrustScope(scope){
      const before=await current();if(before.storeSchema===null)return{changed:false,snapshot:before};
      if(before.storeSchema==='v1')fail('TRUST_MIGRATION_REQUIRED','TRUST_MIGRATION_REQUIRED: migrate the legacy project trust store before changing individual resource trust.');
      const rows=scopeRows(before,scope);if(!rows.length)return{changed:false,snapshot:before};
      const resources=before.resources.flatMap(row=>row.current?[row.current]:[]);const changed=await service.untrustResources(before.workspace,resources,rows.map(row=>row.key),before.nestedRepositories.map(row=>row.relativePath));return{changed,snapshot:await current()};
    },
    async verifyScope(scope){
      const snapshot=await current();
      if(await readQuarantineRecord(trustRoot,snapshot.workspace,scope))return false;
      const rows=scopeRows(snapshot,scope).filter(row=>row.current);
      return rows.length>0&&rows.every(row=>row.state==='trusted');
    },
    async quarantineScope(scope,options={}){
      const before=await current();if(options.expected)await exactExpected(options.expected,before);
      const rows=scopeRows(before,scope).filter(row=>row.current);if(!rows.length)fail('RESOURCE_NOT_FOUND');
      const existing=await readQuarantineRecord(trustRoot,before.workspace,scope);
      const record:TrustQuarantineRecord={
        schema:'talos.cli.trust-quarantine.v1',active:true,workspaceIdentityHash:before.workspace.identityHash,
        kind:scope.kind,id:scope.id,quarantinedAt:existing?.quarantinedAt??now(),
        reason:options.reason??existing?.reason??null,
        reviewedFingerprint:scopeReviewedFingerprint(rows)
      };
      const markerChanged=!existing||JSON.stringify(existing)!==JSON.stringify(record);
      if(markerChanged)await writeQuarantineRecord(trustRoot,before.workspace,scope,record);
      let trustChanged=false;
      if(before.storeSchema==='v2'){
        const resources=before.resources.flatMap(row=>row.current?[row.current]:[]);
        trustChanged=await service.untrustResources(before.workspace,resources,rows.map(row=>row.key),before.nestedRepositories.map(row=>row.relativePath));
      }
      return{changed:markerChanged||trustChanged,snapshot:await current(),record};
    },
    async releaseQuarantine(scope){
      const snapshot=await current();const existing=await readQuarantineRecord(trustRoot,snapshot.workspace,scope);
      if(!existing)return{changed:false};
      const rows=scopeRows(snapshot,scope).filter(row=>row.current);
      if(snapshot.storeSchema==='v1')fail('TRUST_MIGRATION_REQUIRED','TRUST_MIGRATION_REQUIRED: migrate the legacy project trust store before releasing quarantine.');
      if(snapshot.storeSchema==='v2'&&rows.length){
        const resources=snapshot.resources.flatMap(row=>row.current?[row.current]:[]);
        await service.untrustResources(snapshot.workspace,resources,rows.map(row=>row.key),snapshot.nestedRepositories.map(row=>row.relativePath));
      }
      await rm(quarantinePath(trustRoot,snapshot.workspace,scope),{force:true});
      return{changed:true};
    },
    async quarantineStatus(scope){
      const snapshot=await current();
      return readQuarantineRecord(trustRoot,snapshot.workspace,scope);
    },
    async migrateLegacy(options={}){
      const before=await current();if(before.storeSchema!=='v1')return before;
      const resourcesClean=before.resources.every(row=>row.state==='trusted');
      if(!resourcesClean)fail('TRUST_MIGRATION_SNAPSHOT_CHANGED');
      if(before.nestedRepositories.length&&!options.includeNested)nestedConsentFailure(before);
      const resources=before.resources.flatMap(row=>row.current?[row.current]:[]);
      await service.migrate(before.workspace,resources,before.nestedRepositories.map(row=>row.relativePath));
      return current();
    },
    async rollbackMigration(){const before=await current();await service.rollbackMigration(before.workspace);return current();},
    async migrationBackupPath(){const snapshot=await current();return service.migrationBackupPath(snapshot.workspace);},
    async compatibilityRoots(){const snapshot=await current();return compatibilityTrustRoots(trustRoot,snapshot.workspace);}
  };
}
