import {readdir,realpath,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import type {CliPaths} from '../paths.ts';
import {normalizeProjectRoot} from '../paths.ts';
import {createRedactor,redactObject,secretValuesFromEnvironment} from '../diagnostics/redact.ts';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';
import {fingerprintExecutableResourceContent} from '../security/project-trust.ts';
import {createTrustAuthority,type TrustAuthority,type TrustAuthoritySnapshot,type TrustQuarantineRecord} from '../security/trust-authority.ts';

export type HookExecutionEvidence={
  sessionId:string;
  sessionStartedAt:string|null;
  sequence:number;
  eventType:string;
  action:string|null;
  result:unknown;
  executedAt:null;
};
export type HookDryRunResult={
  realProcess:true;
  syntheticEvent:true;
  eventType:string;
  action:string|null;
  result:unknown;
};
export type HookView={
  id:string;
  events:string[];
  launch:{command:string};
  trust:{
    projectTrusted:boolean;
    state:'trusted'|'changed'|'added'|'removed';
    trusted:boolean;
    currentFingerprint:string|null;
    trustedFingerprint:string|null;
    changed:boolean;
  };
  quarantine:{active:boolean;reason:string|null;quarantinedAt:string|null;reviewedFingerprint:string|null};
  lastExecutions:HookExecutionEvidence[];
  lastDryRun:HookDryRunResult|null;
};

type HookRow={id:string;eventi:string[];comando:string;hash?:string};
type HookFacadeInput={projectRoot:string;repoRoot?:string;paths:CliPaths;env?:Record<string,string|undefined>};
export type HookFacadeDependencies={
  authority?:TrustAuthority;
  loadHooks?:()=>Promise<{hooks:HookRow[]}>;
  fingerprintHook?:(hook:HookRow,snapshot:TrustAuthoritySnapshot)=>Promise<string|null>;
  executeHook?:(input:{hook:HookRow;evento:Record<string,unknown>;cartella:string})=>Promise<unknown>;
  trustCompatibility?:(hook:HookRow)=>Promise<void>;
  untrustCompatibility?:(id:string)=>Promise<void>;
  listSessionIds?:()=>Promise<string[]>;
  readSession?:(id:string)=>Promise<any[]|null>;
};

const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/u;
const VALID_EVENTS=new Set(['pre_tool_call','post_tool_call','session_start','session_end']);
const MAX_HISTORY=50;
const MAX_SESSION_FILES=5000;
const MAX_SESSION_READS=200;

function fail(code:string,message=code):never{throw Object.assign(new Error(message),{code});}
function hookId(value:string){if(!ID.test(value)||value.includes('..'))fail('HOOK_ID_INVALID');return value;}
function text(value:unknown){return typeof value==='string'?value:null;}
function safeResult(value:unknown,secrets:readonly string[]){return redactObject(value,secrets);}
function configuredHook(value:any):HookRow{
  if(!value||typeof value!=='object')fail('HOOK_CONFIG_MALFORMED');
  const id=hookId(String(value.id??''));const eventi=value.eventi;
  if(!Array.isArray(eventi)||!eventi.length||!eventi.every((row:unknown)=>typeof row==='string'&&VALID_EVENTS.has(row))
    ||new Set(eventi).size!==eventi.length||typeof value.comando!=='string'||!value.comando.trim())fail('HOOK_CONFIG_MALFORMED');
  return{id,eventi:[...eventi],comando:value.comando,...(typeof value.hash==='string'?{hash:value.hash}:{})};
}

export function createHookFacade(input:HookFacadeInput,deps:HookFacadeDependencies={}){
  const authority=deps.authority??createTrustAuthority({projectRoot:input.projectRoot,trustRoot:input.paths.trust.projects});
  const secrets=secretValuesFromEnvironment(input.env??process.env);
  const redactor=createRedactor(secrets);
  const repoRoot=()=>input.repoRoot??findTalosRepoRoot(input.projectRoot);
  let registryPromise:Promise<any>|null=null;
  let storePromise:Promise<any>|null=null;
  const registry=()=>registryPromise??=(importTalosModule(repoRoot(),'hook-registry.mjs') as Promise<any>);
  const store=()=>storePromise??=(importTalosModule(repoRoot(),'session-store.mjs') as Promise<any>);

  async function defaultLoadHooks(){
    try{
      const loaded=await (await registry()).caricaHooks({cartella:input.projectRoot});
      if(!loaded||!Array.isArray(loaded.hooks))fail('HOOK_CONFIG_MALFORMED');
      return{hooks:loaded.hooks.map(configuredHook)};
    }catch(error){
      if((error as any)?.code==='HOOK_MALFORMED'||(error as any)?.code==='RESOURCE_CONFIG_MALFORMED')fail('HOOK_CONFIG_MALFORMED');
      throw error;
    }
  }
  const loadHooks=deps.loadHooks??defaultLoadHooks;

  async function compatibilityRoot(){return(await authority.compatibilityRoots()).hooks;}
  async function defaultUntrustCompatibility(id:string){await rm(join(await compatibilityRoot(),hookId(id)+'.json'),{force:true});}
  async function defaultTrustCompatibility(hook:HookRow){
    if(!hook.hash)fail('HOOK_COMPATIBILITY_HASH_MISSING');
    const root=await compatibilityRoot();
    await rm(join(root,hookId(hook.id)+'.json'),{force:true});
    await(await registry()).fidaHook({cartellaTrust:root,hookId:hook.id,hash:hook.hash});
  }
  const untrustCompatibility=deps.untrustCompatibility??defaultUntrustCompatibility;
  const trustCompatibility=deps.trustCompatibility??defaultTrustCompatibility;

  async function defaultFingerprintHook(hook:HookRow,snapshot:TrustAuthoritySnapshot){
    const resource=await fingerprintExecutableResourceContent({
      workspace:snapshot.workspace,kind:'hook',id:hook.id,
      path:join(snapshot.workspace.canonicalRoot,'.harness-ui-hooks.json'),
      content:JSON.stringify({eventi:hook.eventi,comando:hook.comando})
    });
    return resource.fingerprint;
  }
  const fingerprintHook=deps.fingerprintHook??defaultFingerprintHook;
  const executeHook=deps.executeHook??(async(input:{hook:HookRow;evento:Record<string,unknown>;cartella:string})=>(await registry()).eseguiHook(input));

  async function defaultListSessionIds(){
    try{
      const rows=(await readdir(input.paths.sessionsRoot,{withFileTypes:true}))
        .filter(row=>row.isFile()&&row.name.endsWith('.jsonl'))
        .map(row=>row.name.slice(0,-6))
        .slice(0,MAX_SESSION_FILES);
      const measured=await Promise.all(rows.map(async id=>{
        try{return{id,mtimeMs:(await stat(join(input.paths.sessionsRoot,id+'.jsonl'))).mtimeMs};}
        catch{return{id,mtimeMs:0};}
      }));
      return measured.sort((a,b)=>b.mtimeMs-a.mtimeMs||a.id.localeCompare(b.id)).slice(0,MAX_SESSION_READS).map(row=>row.id);
    }catch(error){
      if((error as NodeJS.ErrnoException).code==='ENOENT')return[];
      throw error;
    }
  }
  const listSessionIds=deps.listSessionIds??defaultListSessionIds;
  const readSession=deps.readSession??(async(id:string)=>(await store()).leggiRegistro({cartellaStore:input.paths.sessionsRoot,sessionId:id}));

  async function hooks(){
    try{
      const loaded=await loadHooks();if(!loaded||!Array.isArray(loaded.hooks))fail('HOOK_CONFIG_MALFORMED');
      const rows=loaded.hooks.map(configuredHook);const seen=new Set<string>();
      for(const hook of rows){if(seen.has(hook.id))fail('HOOK_CONFIG_MALFORMED');seen.add(hook.id);}
      return rows;
    }catch(error){
      if((error as any)?.code==='HOOK_MALFORMED'||(error as any)?.code==='RESOURCE_CONFIG_MALFORMED')fail('HOOK_CONFIG_MALFORMED');
      throw error;
    }
  }
  async function target(id:string){const wanted=hookId(id);const rows=await hooks();const row=rows.find(item=>item.id===wanted);if(!row)fail('HOOK_NOT_FOUND');return row;}
  function trustRow(snapshot:TrustAuthoritySnapshot,id:string){return snapshot.resources.find(row=>row.kind==='hook'&&row.id===id&&row.current);}
  async function assertLoadedFingerprint(hook:HookRow,snapshot:TrustAuthoritySnapshot){
    const row=trustRow(snapshot,hook.id);if(!row?.currentFingerprint)fail('HOOK_RESOURCE_NOT_FOUND');
    const loaded=await fingerprintHook(hook,snapshot);
    if(!loaded||loaded!==row.currentFingerprint)fail('HOOK_TRUST_INVALIDATED');
    return row;
  }
  async function quarantineOf(id:string):Promise<TrustQuarantineRecord|null>{return authority.quarantineStatus({kind:'hook',id});}

  async function historyFor(id:string,limit=8):Promise<HookExecutionEvidence[]>{
    const wanted=hookId(id);const snapshot=await authority.inspect();const canonical=normalizeProjectRoot(snapshot.workspace.canonicalRoot);
    const sessionIds=(await listSessionIds()).slice(0,MAX_SESSION_READS);
    const out:HookExecutionEvidence[]=[];
    for(const sessionId of sessionIds){
      let records:any[]|null=null;try{records=await readSession(sessionId);}catch{continue;}
      if(!Array.isArray(records)||!records.length)continue;
      const header=records.find(row=>row?.tipo==='intestazione');
      if(!header||typeof header.cartella!=='string')continue;
      let sessionRoot=normalizeProjectRoot(header.cartella);
      if(sessionRoot!==canonical){
        try{sessionRoot=normalizeProjectRoot(await realpath(header.cartella));}catch{continue;}
      }
      if(sessionRoot!==canonical)continue;
      const started=text(header.avviataAlle);
      for(const row of records){
        if(row?.type!=='HookInvoked'||row.hookId!==wanted||!Number.isSafeInteger(row._sequenza))continue;
        out.push({
          sessionId:String(header.sessionId??sessionId),sessionStartedAt:started,sequence:row._sequenza,
          eventType:String(row.tipo??''),action:text(row.azione),result:safeResult(row.esito,secrets),executedAt:null
        });
      }
    }
    out.sort((a,b)=>String(b.sessionStartedAt??'').localeCompare(String(a.sessionStartedAt??''))||b.sequence-a.sequence);
    return out.slice(0,Math.max(0,Math.min(MAX_HISTORY,limit)));
  }

  async function view(hook:HookRow,snapshot:TrustAuthoritySnapshot,history:HookExecutionEvidence[]):Promise<HookView>{
    const row=trustRow(snapshot,hook.id);const state=(row?.state??'added') as HookView['trust']['state'];const quarantine=await quarantineOf(hook.id);
    const current=row?.currentFingerprint??null;const trusted=row?.trustedFingerprint??null;
    return{
      id:hook.id,events:[...hook.eventi],launch:{command:redactor.text(hook.comando)},
      trust:{projectTrusted:snapshot.trusted,state,trusted:state==='trusted'&&!quarantine,currentFingerprint:current,trustedFingerprint:trusted,changed:state==='changed'||Boolean(current&&trusted&&current!==trusted)},
      quarantine:{active:Boolean(quarantine),reason:quarantine?.reason??null,quarantinedAt:quarantine?.quarantinedAt??null,reviewedFingerprint:quarantine?.reviewedFingerprint??null},
      lastExecutions:history,lastDryRun:null
    };
  }

  return{
    async list():Promise<HookView[]>{
      const [rows,snapshot]=await Promise.all([hooks(),authority.inspect()]);
      const histories=await Promise.all(rows.map(row=>historyFor(row.id,8)));
      return Promise.all(rows.map((row,index)=>view(row,snapshot,histories[index]??[])));
    },
    async history(id:string,options:{limit?:number}={}):Promise<HookExecutionEvidence[]>{
      await target(id);return historyFor(id,options.limit??8);
    },
    async dryRun(id:string,{eventType,action}:{eventType:string;action?:string|null}):Promise<HookDryRunResult>{
      const hook=await target(id);const snapshot=await authority.inspect();
      if(await quarantineOf(hook.id))fail('HOOK_QUARANTINED');
      if(!snapshot.trusted)fail('PROJECT_TRUST_REQUIRED');
      if(!await authority.verifyScope({kind:'hook',id:hook.id}))fail('HOOK_TRUST_REQUIRED');
      await assertLoadedFingerprint(hook,snapshot);
      if(!hook.eventi.includes(eventType))fail('HOOK_EVENT_NOT_DECLARED');
      const event={tipo:eventType,...(action?{azione:action}:{}),dryRun:true};
      const result=await executeHook({hook,evento:event,cartella:input.projectRoot});
      return{realProcess:true,syntheticEvent:true,eventType,action:action??null,result:safeResult(result,secrets)};
    },
    async trust(id:string){
      const hook=await target(id);const reviewed=await authority.inspect();await assertLoadedFingerprint(hook,reviewed);
      const result=await authority.trustScope({kind:'hook',id:hook.id},{expected:reviewed});
      await trustCompatibility(hook);
      return{ok:true,id:hook.id,changed:result.changed,snapshot:result.snapshot};
    },
    async untrust(id:string){
      const hook=await target(id);const result=await authority.untrustScope({kind:'hook',id:hook.id});
      await untrustCompatibility(hook.id);
      return{ok:true,id:hook.id,changed:result.changed,snapshot:result.snapshot};
    },
    async quarantine(id:string,reason:string|null=null){
      const hook=await target(id);const reviewed=await authority.inspect();await assertLoadedFingerprint(hook,reviewed);
      const result=await authority.quarantineScope({kind:'hook',id:hook.id},{reason,expected:reviewed});
      await untrustCompatibility(hook.id);
      return{ok:true,id:hook.id,changed:result.changed,record:result.record,snapshot:result.snapshot};
    },
    async releaseQuarantine(id:string){
      const hook=await target(id);const result=await authority.releaseQuarantine({kind:'hook',id:hook.id});
      await untrustCompatibility(hook.id);
      return{ok:true,id:hook.id,changed:result.changed};
    }
  };
}
