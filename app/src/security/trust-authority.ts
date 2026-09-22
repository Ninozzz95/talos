import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
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
export type TrustAuthority={
  inspect():Promise<TrustAuthoritySnapshot>;
  trustProject(options?:{expected?:TrustAuthoritySnapshot|TrustExpectation;includeNested?:boolean}):Promise<TrustAuthoritySnapshot>;
  revokeProject():Promise<TrustAuthoritySnapshot>;
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

export function createTrustAuthority({projectRoot,trustRoot,clock}:{projectRoot:string;trustRoot:string;clock?:()=>string}):TrustAuthority{
  const service=createProjectTrustService({trustRoot,...(clock?{clock}:{})});
  const now=clock??(()=>new Date().toISOString());
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
    async trustProject(options={}){
      const fresh=await current();const expected=options.expected?expectationOf(options.expected):null;
      if(expected&&expected.workspaceIdentityHash!==fresh.workspace.identityHash)fail('PROJECT_TRUST_INVALIDATED','PROJECT_TRUST_INVALIDATED: workspace identity changed while trust was being reviewed.',{reason:'RESOURCE_IDENTITY_MISMATCH'});
      const reviewedNested=expected?.nestedRepositories??fresh.nestedRepositories;
      if(reviewedNested.length&&!options.includeNested)nestedConsentFailure({...fresh,nestedRepositories:[...reviewedNested]});
      const reviewedResources=expected?.resources??fresh.resources.flatMap(row=>row.current?[row.current]:[]);
      if(reviewedResources.length)await service.trust(fresh.workspace,reviewedResources,reviewedNested.map(row=>row.relativePath));
      const verified=await current();
      if(expected&&resourceSignature(expected.resources)!==resourceSignature(verified.resources.flatMap(row=>row.current?[row.current]:[]))){
        fail('PROJECT_TRUST_INVALIDATED',`PROJECT_TRUST_INVALIDATED: the trusted project snapshot changed (${verified.reason}). TALOS did not load the changed snapshot.`,{reason:verified.reason,projectIdentity:verified.workspace.identityHash});
      }
      if(expected&&nestedSignature(expected.nestedRepositories)!==nestedSignature(verified.nestedRepositories)){
        await service.revoke(fresh.workspace);
        fail('PROJECT_TRUST_INVALIDATED','PROJECT_TRUST_INVALIDATED: nested repository boundaries changed while trust was being confirmed. TALOS revoked the new grant.',{reason:'NESTED_REPOSITORY_BOUNDARY_CHANGED',projectIdentity:verified.workspace.identityHash});
      }
      return verified;
    },
    async revokeProject(){const before=await current();await service.revoke(before.workspace);await rm(path.join(trustRoot,'compat',before.workspace.identityHash),{recursive:true,force:true});return current();},
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
