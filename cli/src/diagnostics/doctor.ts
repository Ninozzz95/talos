import {t} from '../i18n/index.ts';
import {providerLabel} from '../provider/missing-key.ts';
export {redactObject} from './redact.ts';

export type DoctorDomainState='healthy'|'degraded'|'unavailable'|'unknown'|'verified'|'unverified'|'absent';
export type DoctorCheck={id:string;ok:boolean;detail?:string};

export async function runDoctor(d:any){
  const checks:DoctorCheck[]=[];
  async function c(id:string,fn:()=>Promise<boolean>){
    try{const ok=await fn();checks.push({id,ok});return ok;}
    catch(e){checks.push({id,ok:false,detail:e instanceof Error?e.message:String(e)});return false;}
  }
  await c('config-path',()=>d.fsAccess(d.paths.configRoot));
  await c('data-path',()=>d.fsAccess(d.paths.dataRoot));
  await c('cache-path',()=>d.fsAccess(d.paths.cacheRoot));
  await c('git',d.gitProbe);
  await c('keyring',d.keyringProbe);

  const probe=async(name:string,fn:undefined|(()=>Promise<any>))=>{
    if(typeof fn!=='function')return{state:'unknown',detail:name+' probe unavailable'};
    try{return await fn();}
    catch(error){return{state:'unavailable',detail:error instanceof Error?error.message:String(error)};}
  };
  const sections={
    terminal:await probe('terminal',d.terminalProbe),
    runtime:await probe('runtime',d.runtimeProbe),
    trust:await probe('trust',d.trustProbe),
    providers:await probe('providers',typeof d.providerProbe==='function'?()=>d.providerProbe({active:Boolean(d.profile)}):undefined),
    broker:await probe('broker',d.brokerProbe),
    context:await probe('context',d.contextProbe),
    sessions:await probe('sessions',d.sessionProbe),
    update:await probe('update',d.updateProbe),
    /* R2 (gate E13): the active credential store, read LAST so that `nativeModuleLoaded` covers every probe above (the providers
       probe composes a runtime, which opens the store). Wording only: `ok` still comes from the checks (Q-R2-9, R4). */
    credentials:await probe('credentials',d.credentialsProbe),
    /* R5b: models.dev on or off, and why (catalog.modelsDev, TALOS_MODELS_DEV). */
    catalog:await probe('catalog',d.catalogProbe),
  };
  const performance=Boolean(d.profile)&&typeof d.performanceProbe==='function'?await probe('performance',d.performanceProbe):null;
  return{schema:'talos.cli.doctor.v1',ok:checks.every(x=>x.ok),checks,sections,performance,profiled:Boolean(d.profile)};
}

/*
 * R4 (owner decision Q-R4-14 (a), gate E12): whether a turn could run now. `ok` keeps its meaning (the infrastructure checks);
 * `ready` is new and additive. A turn can run when the readiness a send asks before anything leaves the machine
 * (`catalog.readiness`: a provider chosen, a model of it chosen, its key usable or not needed) says so, and, for a local engine,
 * when that engine answers. The sandbox never blocks it: the default mode declares "No sandbox" (R0), which is a verdict.
 * Only the chosen local engine is checked, one request to its own address; a provider on the network is never contacted here
 * (active probes stay behind --profile, M11-A).
 */
export type DoctorReason={code:string;message:string};
export type TurnReadiness={ready:boolean;reasons:DoctorReason[]};
export async function turnReadiness({catalog,control,model}:{catalog:any;control:any;model:string|null}):Promise<TurnReadiness>{
  const unknown:TurnReadiness={ready:false,reasons:[{code:'RUNTIME_NOT_AVAILABLE',message:t('firstrun.doctor.unknown')}]};
  if(typeof catalog?.readiness!=='function')return unknown;
  let decision:any;
  try{decision=await catalog.readiness(model??'');}catch{return unknown;}
  if(!decision||typeof decision.ready!=='boolean')return unknown;
  if(!decision.ready){
    const code=String(decision.code??'RUNTIME_NOT_AVAILABLE');
    const message=code==='PROVIDER_NOT_CHOSEN'?t('firstrun.doctor.noProvider')
      :code==='MODEL_NOT_CHOSEN'&&decision.provider?t('firstrun.doctor.noModel',{provider:providerLabel(String(decision.provider))})
      :String(decision.message??t('firstrun.doctor.unknown'));
    return{ready:false,reasons:[{code,message}]};
  }
  const provider=String(decision.provider??'');
  let profile:any=null;try{profile=typeof control?.get==='function'?control.get(provider):null;}catch{profile=null;}
  if(profile?.local===true&&profile?.auth?.required!==true){
    let observed:any=null;try{observed=typeof control?.probe==='function'?await control.probe(provider):null;}catch{observed=null;}
    if(observed?.lastHealth?.state!=='available'){
      const address=typeof profile?.endpoint?.host==='string'&&profile.endpoint.host?profile.endpoint.host:null;
      return{ready:false,reasons:[{code:'PROVIDER_UNREACHABLE',message:t(address?'firstrun.doctor.localDown':'firstrun.doctor.localDownNoAddress',{provider:String(profile?.label??provider),address:address??''})}]};
    }
  }
  return{ready:true,reasons:[]};
}

/** The verdict a person reads first: `ready` only when the checks pass and a turn could run; otherwise the first reason. */
export function doctorVerdict({ok,checks,turn}:{ok:boolean;checks:readonly DoctorCheck[];turn:TurnReadiness}):{ready:boolean;status:'ready'|'needs attention';reasons:DoctorReason[];headline:string;exitCode:number}{
  const failed=checks.find(check=>!check.ok);
  const reasons=[...turn.reasons];
  const first=turn.reasons[0]?.message??(failed?t('firstrun.doctor.checkFailed',{check:failed.id}):null);
  const status=ok&&turn.ready?'ready':'needs attention';
  return{
    ready:turn.ready,status,reasons,
    headline:status==='ready'?t('firstrun.doctor.headlineReady'):t('firstrun.doctor.headlineAttention',{reason:first??t('firstrun.doctor.unknown')}),
    exitCode:!ok?70:!turn.ready?1:0,
  };
}
