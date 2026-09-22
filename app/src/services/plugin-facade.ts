import {createHash} from 'node:crypto';
import {readdir,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import type {CliPaths} from '../paths.ts';
import {createRedactor,redactObject,secretValuesFromEnvironment} from '../diagnostics/redact.ts';
import {listInstalledExtensions,type InstalledExtension} from '../extensions/installer.ts';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';
import {
  pluginReviewFromSnapshot,scanPluginPackage,
  type PluginGuardExpectedReview,type PluginGuardReport
} from '../security/plugin-guard.ts';
import {
  createTrustAuthority,type TrustAuthority,type TrustAuthoritySnapshot,type TrustQuarantineRecord
} from '../security/trust-authority.ts';

export type PluginRegistryState={
  state:'loaded'|'failed'|'missing';
  code:string|null;
  message:string|null;
};
export type PluginProvenance={
  kind:'managed-extension'|'unmanaged-project-plugin'|'managed-state-invalid';
  extension:{id:string;name:string;version:string}|null;
  packageCopy:string;
  packageCopyPresent:boolean;
  recordedSource:string|null;
  recordedSourceAvailable:boolean;
  recordedSourceAuthority:'advisory-only';
};
export type PluginFingerprintSummary={
  currentSetDigest:string|null;
  trustedSetDigest:string|null;
  changedPaths:string[];
  addedPaths:string[];
  removedPaths:string[];
};
export type PluginView={
  id:string;
  name:string|null;
  description:string|null;
  registry:PluginRegistryState;
  provenance:PluginProvenance;
  guard:PluginGuardReport|null;
  guardError:string|null;
  trust:{projectTrusted:boolean;scopeTrusted:boolean;effectiveTrusted:boolean};
  fingerprints:PluginFingerprintSummary;
  quarantine:{active:boolean;reason:string|null;quarantinedAt:string|null;reviewedFingerprint:string|null};
};

type PluginRow={
  id:string;nome?:string;descrizione?:string;tools?:any[];hooks?:any[];hash?:string;
};
type PluginFailure={pluginId:string;codice?:string;messaggio?:string;frase?:string};
export type PluginFacadeInput={
  projectRoot:string;
  repoRoot?:string;
  paths:CliPaths;
  env?:Record<string,string|undefined>;
};
export type PluginFacadeDependencies={
  authority?:TrustAuthority;
  loadPlugins?:()=>Promise<{plugin:PluginRow[];falliti?:PluginFailure[]}>;
  scanPlugin?:(plugin:PluginRow,review:PluginGuardExpectedReview)=>Promise<PluginGuardReport>;
  listInstalledPackages?:()=>Promise<InstalledExtension[]>;
  listManagedStateIds?:()=>Promise<string[]>;
  pathExists?:(path:string)=>Promise<boolean>;
  trustCompatibility?:(plugin:PluginRow)=>Promise<void>;
  untrustCompatibility?:(id:string)=>Promise<void>;
};

const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/u;
function fail(code:string,message=code,extra:Record<string,unknown>={}):never{throw Object.assign(new Error(message),{code,...extra});}
function pluginId(value:string){if(!ID.test(value)||value.includes('..'))fail('PLUGIN_ID_INVALID');return value;}
function asText(value:unknown):string|null{return typeof value==='string'&&value.length>0?value:null;}
function digest(rows:readonly {path:string;fingerprint:string}[]):string|null{
  if(!rows.length)return null;
  const hash=createHash('sha256').update('talos.cli.plugin-resource-set.v1\0');
  for(const row of [...rows].sort((a,b)=>a.path.localeCompare(b.path)||a.fingerprint.localeCompare(b.fingerprint))){
    hash.update(row.path).update('\0').update(row.fingerprint).update('\n');
  }
  return hash.digest('hex');
}
function resourceRows(snapshot:TrustAuthoritySnapshot,id:string){
  const prefix='.harness-ui-plugins/'+id+'/';
  return snapshot.resources.filter(row=>row.kind==='plugin'&&row.relativePath.startsWith(prefix));
}
function fingerprintSummary(snapshot:TrustAuthoritySnapshot,id:string):PluginFingerprintSummary{
  const rows=resourceRows(snapshot,id);
  const current=rows.flatMap(row=>row.currentFingerprint?[{path:row.relativePath,fingerprint:row.currentFingerprint}]:[]);
  const trusted=rows.flatMap(row=>row.trustedFingerprint?[{path:row.relativePath,fingerprint:row.trustedFingerprint}]:[]);
  return{
    currentSetDigest:digest(current),
    trustedSetDigest:digest(trusted),
    changedPaths:rows.filter(row=>row.state==='changed').map(row=>row.relativePath).sort(),
    addedPaths:rows.filter(row=>row.state==='added').map(row=>row.relativePath).sort(),
    removedPaths:rows.filter(row=>row.state==='removed').map(row=>row.relativePath).sort()
  };
}
function quarantineView(value:TrustQuarantineRecord|null):PluginView['quarantine']{
  return value?{
    active:true,reason:value.reason??null,quarantinedAt:value.quarantinedAt??null,reviewedFingerprint:value.reviewedFingerprint??null
  }:{active:false,reason:null,quarantinedAt:null,reviewedFingerprint:null};
}
function validInstalled(row:any,id:string):row is InstalledExtension{
  return Boolean(
    row&&typeof row==='object'&&row.id===id&&typeof row.name==='string'&&typeof row.version==='string'
    &&typeof row.source==='string'&&row.components&&typeof row.components==='object'
    &&row.components.plugin?.id===id
  );
}

export function createPluginFacade(input:PluginFacadeInput,deps:PluginFacadeDependencies={}){
  const authority=deps.authority??createTrustAuthority({projectRoot:input.projectRoot,trustRoot:input.paths.trust.projects});
  const repoRoot=()=>input.repoRoot??findTalosRepoRoot(input.projectRoot);
  const secrets=secretValuesFromEnvironment(input.env??process.env);
  const redactor=createRedactor(secrets);
  let registryPromise:Promise<any>|null=null;
  const registry=()=>registryPromise??=(importTalosModule(repoRoot(),'plugin-registry.mjs') as Promise<any>);

  const loadPlugins=deps.loadPlugins??(async()=>{
    const loaded=await(await registry()).caricaPlugin({cartella:input.projectRoot});
    return{plugin:Array.isArray(loaded?.plugin)?loaded.plugin:[],falliti:Array.isArray(loaded?.falliti)?loaded.falliti:[]};
  });
  const listPackages=deps.listInstalledPackages??(()=>listInstalledExtensions(input.projectRoot));
  const pathExists=deps.pathExists??(async(path:string)=>{
    try{await stat(path);return true;}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
  });
  const listManagedStateIds=deps.listManagedStateIds??(async()=>{
    const root=join(input.projectRoot,'.talos-cli','extensions');
    let entries:any[];
    try{entries=await readdir(root,{withFileTypes:true});}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return[];throw error;}
    const ids:string[]=[];
    for(const entry of entries){
      if(!entry.isDirectory())continue;
      let id:string;try{id=pluginId(entry.name);}catch{continue;}
      if(await pathExists(join(input.projectRoot,'.harness-ui-plugins',id)))ids.push(id);
    }
    return ids.sort();
  });

  async function compatibilityRoot(){return(await authority.compatibilityRoots()).plugins;}
  async function defaultUntrustCompatibility(id:string){await rm(join(await compatibilityRoot(),pluginId(id)+'.json'),{force:true});}
  async function defaultTrustCompatibility(plugin:PluginRow){
    if(!plugin.hash)fail('PLUGIN_COMPATIBILITY_HASH_MISSING');
    const root=await compatibilityRoot();
    await rm(join(root,pluginId(plugin.id)+'.json'),{force:true});
    await(await registry()).fidaPlugin({cartellaTrust:root,pluginId:plugin.id,hash:plugin.hash});
  }
  const untrustCompatibility=deps.untrustCompatibility??defaultUntrustCompatibility;
  const trustCompatibility=deps.trustCompatibility??defaultTrustCompatibility;
  const scanPlugin=deps.scanPlugin??((plugin:PluginRow,review:PluginGuardExpectedReview)=>
    scanPluginPackage({projectRoot:input.projectRoot,plugin:{id:plugin.id,tools:plugin.tools??[],hooks:plugin.hooks??[]},expectedReview:review})
  );

  async function loadedState(){
    const loaded=await loadPlugins();
    const plugin=Array.isArray(loaded?.plugin)?loaded.plugin.map(row=>({...row,id:pluginId(String(row.id??''))})):[];
    const falliti=Array.isArray(loaded?.falliti)?loaded.falliti.flatMap(row=>{
      const id=asText(row?.pluginId);if(!id)return[];
      try{return[{...row,pluginId:pluginId(id)}];}catch{return[];}
    }):[];
    return{plugin,falliti};
  }
  async function packageRecords(){
    try{
      const rows=await listPackages();
      return Array.isArray(rows)?rows:[];
    }catch(error){
      if(error instanceof TypeError)return[];
      throw error;
    }
  }
  async function provenance(id:string,packages:readonly InstalledExtension[]):Promise<PluginProvenance>{
    const stateDir=join(input.projectRoot,'.talos-cli','extensions',id);
    const packageCopyAbsolute=join(stateDir,'package');
    const packageCopy='.talos-cli/extensions/'+id+'/package';
    const candidate=(packages as any[]).find(row=>row?.id===id)??null;
    const [statePresent,copyPresent]=await Promise.all([pathExists(stateDir),pathExists(packageCopyAbsolute)]);
    if(candidate&&validInstalled(candidate,id)){
      const source=redactor.text(candidate.source);
      let sourceAvailable=false;
      try{sourceAvailable=await pathExists(candidate.source);}catch{sourceAvailable=false;}
      return{
        kind:'managed-extension',
        extension:{id:candidate.id,name:redactor.text(candidate.name),version:redactor.text(candidate.version)},
        packageCopy,packageCopyPresent:copyPresent,
        recordedSource:source,recordedSourceAvailable:sourceAvailable,recordedSourceAuthority:'advisory-only'
      };
    }
    if(candidate||statePresent){
      return{
        kind:'managed-state-invalid',extension:null,packageCopy,packageCopyPresent:copyPresent,
        recordedSource:null,recordedSourceAvailable:false,recordedSourceAuthority:'advisory-only'
      };
    }
    return{
      kind:'unmanaged-project-plugin',extension:null,packageCopy,packageCopyPresent:false,
      recordedSource:null,recordedSourceAvailable:false,recordedSourceAuthority:'advisory-only'
    };
  }

  async function knownState(){
    const [loaded,snapshot,packages,managedStateIds]=await Promise.all([loadedState(),authority.inspect(),packageRecords(),listManagedStateIds()]);
    const byId=new Map<string,{plugin:PluginRow|null;failure:PluginFailure|null}>();
    for(const row of loaded.plugin)byId.set(row.id,{plugin:row,failure:null});
    for(const failure of loaded.falliti){
      if(!byId.has(failure.pluginId))byId.set(failure.pluginId,{plugin:null,failure});
    }
    for(const row of packages as any[]){
      const id=asText(row?.components?.plugin?.id)??asText(row?.id);
      if(id){try{const clean=pluginId(id);if(!byId.has(clean))byId.set(clean,{plugin:null,failure:null});}catch{}}
    }
    for(const raw of managedStateIds){try{const id=pluginId(raw);if(!byId.has(id))byId.set(id,{plugin:null,failure:null});}catch{}}
    for(const resource of snapshot.resources){
      if(resource.kind!=='plugin')continue;
      const match=/^\.harness-ui-plugins\/([^/]+)\//u.exec(resource.relativePath);
      if(!match)continue;
      try{const id=pluginId(match[1]!);if(!byId.has(id))byId.set(id,{plugin:null,failure:null});}catch{}
    }
    return{loaded,snapshot,packages,byId};
  }

  async function view(id:string,state:Awaited<ReturnType<typeof knownState>>):Promise<PluginView>{
    const entry=state.byId.get(id)??{plugin:null,failure:null};
    const [quarantine,scopeTrusted,prov]=await Promise.all([
      authority.quarantineStatus({kind:'plugin',id}),
      authority.verifyScope({kind:'plugin',id}),
      provenance(id,state.packages)
    ]);
    let guard:PluginGuardReport|null=null;let guardError:string|null=null;
    if(entry.plugin){
      const review=pluginReviewFromSnapshot(state.snapshot,id);
      try{guard=redactObject(await scanPlugin(entry.plugin,review),secrets) as PluginGuardReport;}
      catch(error){guardError=redactor.text(error instanceof Error?error.message:String(error));}
    }
    const registryState:PluginRegistryState=entry.plugin
      ?{state:'loaded',code:null,message:null}
      :entry.failure
        ?{state:'failed',code:asText(entry.failure.codice),message:redactor.text(entry.failure.frase??entry.failure.messaggio??'plugin registry refused this package')}
        :{state:'missing',code:null,message:'Plugin package is not currently loadable from the runtime registry.'};
    return{
      id,
      name:entry.plugin?redactor.text(String(entry.plugin.nome??id)):prov.extension?.name??null,
      description:entry.plugin?redactor.text(String(entry.plugin.descrizione??'')):null,
      registry:registryState,
      provenance:prov,
      guard,guardError,
      trust:{
        projectTrusted:state.snapshot.trusted,
        scopeTrusted,
        effectiveTrusted:Boolean(entry.plugin&&guard&&guard.verdict!=='dangerous'&&scopeTrusted&&!quarantine)
      },
      fingerprints:fingerprintSummary(state.snapshot,id),
      quarantine:quarantineView(quarantine)
    };
  }
  async function targetLoaded(id:string){
    const clean=pluginId(id);const state=await loadedState();const plugin=state.plugin.find(row=>row.id===clean);
    if(!plugin){
      const failure=state.falliti.find(row=>row.pluginId===clean);
      if(failure)fail('PLUGIN_REGISTRY_FAILED',failure.frase??failure.messaggio??'PLUGIN_REGISTRY_FAILED',{registryFailure:failure});
      fail('PLUGIN_NOT_FOUND');
    }
    return plugin;
  }
  async function assertKnown(id:string){
    const clean=pluginId(id);const state=await knownState();
    if(!state.byId.has(clean))fail('PLUGIN_NOT_FOUND');
    return clean;
  }

  return{
    async list():Promise<PluginView[]>{
      const state=await knownState();
      return Promise.all([...state.byId.keys()].sort().map(id=>view(id,state)));
    },
    async trust(id:string){
      const plugin=await targetLoaded(id);
      const reviewed=await authority.inspect();
      const review=pluginReviewFromSnapshot(reviewed,plugin.id);
      const guard=await scanPlugin(plugin,review);
      if(guard.verdict==='dangerous')fail('PLUGIN_DANGEROUS','PLUGIN_DANGEROUS',{guard});
      const result=await authority.trustScope({kind:'plugin',id:plugin.id},{expected:reviewed});
      await trustCompatibility(plugin);
      return{ok:true,id:plugin.id,changed:result.changed,guard,snapshot:result.snapshot};
    },
    async untrust(id:string){
      const clean=await assertKnown(id);
      const result=await authority.untrustScope({kind:'plugin',id:clean});
      await untrustCompatibility(clean);
      return{ok:true,id:clean,changed:result.changed,snapshot:result.snapshot};
    },
    async quarantine(id:string,reason:string|null=null){
      const clean=await assertKnown(id);
      const reviewed=await authority.inspect();
      const result=await authority.quarantineScope({kind:'plugin',id:clean},{reason,expected:reviewed});
      await untrustCompatibility(clean);
      return{ok:true,id:clean,changed:result.changed,record:result.record,snapshot:result.snapshot};
    },
    async releaseQuarantine(id:string){
      const clean=await assertKnown(id);
      const result=await authority.releaseQuarantine({kind:'plugin',id:clean});
      await untrustCompatibility(clean);
      return{ok:true,id:clean,changed:result.changed};
    }
  };
}
