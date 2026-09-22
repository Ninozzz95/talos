export type ProviderAuthSource='saved'|'environment'|'environment-unanswered'|'environment-declined'|'missing'|'not-required';

export type ProviderCooldown={active:boolean;cause:string|null;until:number|null;keys:number};
export type ProviderHealthState='unknown'|'available'|'auth-failed'|'unreachable'|'unconfigured'|'unprobeable'|'error';
export type ProviderHealthObservation={
  state:ProviderHealthState;
  detail:string;
  latencyMs:number|null;
  observedAt:number|null;
  httpStatus:number|null;
};

export type ProviderRemediationCode='none'|'add-key'|'wait-or-add-key'|'replace-key'|'configure-provider'|'configure-endpoint'|'check-endpoint'|'retry'|'inspect-provider';
export type ProviderRemediation={code:ProviderRemediationCode;message:string};

export type ProviderDecisionInput={
  id:string;
  label:string;
  auth:{required:boolean;configured:boolean;usable:boolean;source:ProviderAuthSource};
  endpoint:{value:string|null;valid:boolean};
  runtimeConfigured:boolean;
  cooldown:ProviderCooldown;
  lastHealth:ProviderHealthObservation;
};

export type ProviderReadinessDecision=
 | {ready:true;provider:string;remediation:ProviderRemediation}
 | {ready:false;provider:string;code:'PROVIDER_KEY_MISSING'|'PROVIDER_KEY_BENCHED'|'PROVIDER_AUTH_FAILED'|'PROVIDER_NOT_CONFIGURED'|'PROVIDER_ENDPOINT_INVALID'|'PROVIDER_UNREACHABLE'|'PROVIDER_HEALTH_ERROR';message:string;remediation:ProviderRemediation};

const BENCH_CAUSES:Readonly<Record<string,string>>=Object.freeze({
  traffico:'rate limit',
  credenziale:'key refused',
  credito:'out of credit',
  rete:'network error',
  'timeout-fornitore':'provider timeout',
  'guasto-fornitore':'provider error',
  'flusso-interrotto':'interrupted stream',
});

export const UNKNOWN_PROVIDER_HEALTH:ProviderHealthObservation=Object.freeze({
  state:'unknown',detail:'',latencyMs:null,observedAt:null,httpStatus:null,
});

export function providerCooldownFromRow(row:any):ProviderCooldown{
  const pool:any[]=Array.isArray(row?.pool)?row.pool:[];
  const benched=pool.filter(entry=>entry?.stato==='in-panchina');
  const timed=benched.filter(entry=>Number.isFinite(entry?.inPanchinaFino)).sort((a,b)=>Number(a.inPanchinaFino)-Number(b.inPanchinaFino));
  const first=timed[0]??benched[0]??null;
  const cause=typeof first?.causa==='string'&&Object.hasOwn(BENCH_CAUSES,first.causa)?BENCH_CAUSES[first.causa]!:null;
  return{
    active:benched.length>0,
    cause,
    until:Number.isFinite(first?.inPanchinaFino)?Number(first.inPanchinaFino):null,
    keys:pool.length,
  };
}

export function providerHealthFromProbe(result:any,observedAt:number):ProviderHealthObservation{
  const esito=String(result?.esito??'');
  const code=typeof result?.codice==='string'?result.codice:null;
  const state:ProviderHealthState=
    esito==='collegato'?'available':
    esito==='non-autorizzato'?'auth-failed':
    esito==='irraggiungibile'?'unreachable':
    esito==='non-sondabile'?'unprobeable':
    esito==='non-provabile'?(code==='PROVIDER_RUNTIME_INVALID'||code==='CATALOG_CONFIGURATION_REQUIRED'||code==='PROVIDER_KEY_MISSING'?'unconfigured':'unprobeable'):
    esito==='errore'?'error':'unknown';
  return{
    state,
    detail:String(result?.motivo??esito),
    latencyMs:Number.isFinite(result?.millisecondi)?Number(result.millisecondi):null,
    observedAt:Number.isFinite(observedAt)?observedAt:null,
    httpStatus:Number.isInteger(result?.httpStatus)?Number(result.httpStatus):null,
  };
}

export function remediationForProvider(input:ProviderDecisionInput):ProviderRemediation{
  if(input.auth.required&&!input.auth.usable){
    if(input.cooldown.active){
      const until=input.cooldown.until===null?'':` until ${new Date(input.cooldown.until).toISOString()}`;
      return{code:'wait-or-add-key',message:`${input.label} has no credential usable now. Wait${until}, or add another key.`};
    }
    return{code:'add-key',message:`Add a ${input.label} key before using this provider.`};
  }
  if(input.lastHealth.state==='auth-failed')return{code:'replace-key',message:`${input.label} rejected the current credential. Replace or re-authorize the key.`};
  if(!input.runtimeConfigured)return{code:'configure-provider',message:`Configure ${input.label} before using this provider.`};
  if(!input.endpoint.valid)return{code:'configure-endpoint',message:`Configure a valid ${input.label} endpoint.`};
  if(input.lastHealth.state==='unreachable')return{code:'check-endpoint',message:`${input.label} could not be reached. Check the endpoint and network, then retry.`};
  if(input.lastHealth.state==='error')return{code:'retry',message:`${input.label} returned an error. Retry after checking provider status and configuration.`};
  if(input.lastHealth.state==='unconfigured')return{code:'configure-endpoint',message:`Complete the ${input.label} provider configuration before using it.`};
  if(input.lastHealth.state==='unprobeable')return{code:'inspect-provider',message:`TALOS cannot verify ${input.label} with a normal health probe; inspect its configuration before relying on the connection state.`};
  return{code:'none',message:''};
}

export function providerReadinessDecision(input:ProviderDecisionInput):ProviderReadinessDecision{
  const remediation=remediationForProvider(input);
  if(input.auth.required&&!input.auth.usable){
    const code=input.cooldown.active?'PROVIDER_KEY_BENCHED':'PROVIDER_KEY_MISSING';
    return{ready:false,provider:input.id,code,message:remediation.message,remediation};
  }
  if(input.lastHealth.state==='auth-failed')return{ready:false,provider:input.id,code:'PROVIDER_AUTH_FAILED',message:remediation.message,remediation};
  if(!input.runtimeConfigured)return{ready:false,provider:input.id,code:'PROVIDER_NOT_CONFIGURED',message:remediation.message,remediation};
  if(!input.endpoint.valid)return{ready:false,provider:input.id,code:'PROVIDER_ENDPOINT_INVALID',message:remediation.message,remediation};
  if(input.lastHealth.state==='unreachable')return{ready:false,provider:input.id,code:'PROVIDER_UNREACHABLE',message:remediation.message,remediation};
  if(input.lastHealth.state==='error'||input.lastHealth.state==='unconfigured')return{ready:false,provider:input.id,code:'PROVIDER_HEALTH_ERROR',message:remediation.message,remediation};
  return{ready:true,provider:input.id,remediation};
}
