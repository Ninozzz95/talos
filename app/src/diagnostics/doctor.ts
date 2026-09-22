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
  };
  const performance=Boolean(d.profile)&&typeof d.performanceProbe==='function'?await probe('performance',d.performanceProbe):null;
  return{schema:'talos.cli.doctor.v1',ok:checks.every(x=>x.ok),checks,sections,performance,profiled:Boolean(d.profile)};
}
