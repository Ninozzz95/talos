import {t,tn,type MessageId} from '../i18n/index.ts';
import {missingKeyText} from './missing-key.ts';
export type ProviderAuthSource='saved'|'environment'|'environment-unanswered'|'environment-declined'|'missing'|'not-required';

/* `causeCode`: the kernel's bench class (INC503), so the remedy can tell a provider-side cause from a key-side one. */
export type ProviderCooldown={active:boolean;cause:string|null;until:number|null;keys:number;causeCode?:string|null};
export type ProviderHealthState='unknown'|'available'|'auth-failed'|'access-denied'|'unreachable'|'unconfigured'|'unprobeable'|'error';
export type ProviderHealthObservation={
  state:ProviderHealthState;
  detail:string;
  latencyMs:number|null;
  observedAt:number|null;
  httpStatus:number|null;
  /* Review of 0.6.2 (13/10/2026, B1): the probe's verdict on the KEY, when it gave one (the kernel's `credenzialeVerificata`,
     provider-probe.mjs CLI-REQ-06). `available` says the provider was reached; a public catalogue is reached with any key, and only
     this field says so (`false`). Absent when the probe judged nothing (no key to judge) or nobody probed. Additive: it is also in
     the profile `talos provider test --json` prints. */
  credentialVerified?:boolean;
  /* review of 0.6.4 (S5): the one probe code a remedy is chosen by — Z.AI with no address chosen is not «unreachable», nothing was sent */
  code?:'PROVIDER_ADDRESS_REQUIRED';
};

export type ProviderRemediationCode='none'|'add-key'|'sign-in'|'wait-or-add-key'|'replace-key'|'configure-provider'|'configure-endpoint'|'check-endpoint'|'retry'|'inspect-provider'|'choose-address';
export type ProviderRemediation={code:ProviderRemediationCode;message:string};

export type ProviderDecisionInput={
  id:string;
  label:string;
  /* `type`: the kernel's auth kind; `oauth-pkce` is a provider the person signs in to (the ChatGPT plan), where `configured` means signed in */
  auth:{required:boolean;configured:boolean;usable:boolean;source:ProviderAuthSource;type?:string};
  endpoint:{value:string|null;valid:boolean};
  runtimeConfigured:boolean;
  cooldown:ProviderCooldown;
  lastHealth:ProviderHealthObservation;
};

export type ProviderReadinessDecision=
 | {ready:true;provider:string;remediation:ProviderRemediation}
 | {ready:false;provider:string;code:'PROVIDER_KEY_MISSING'|'PROVIDER_SIGN_IN_REQUIRED'|'PROVIDER_KEY_BENCHED'|'PROVIDER_AUTH_FAILED'|'PROVIDER_NOT_CONFIGURED'|'PROVIDER_ENDPOINT_INVALID'|'PROVIDER_UNREACHABLE'|'PROVIDER_HEALTH_ERROR'|'PROVIDER_ADDRESS_REQUIRED';message:string;remediation:ProviderRemediation};

/*
 * R2 (gate E1): the bench causes the kernel classifies (`provider-credential-store.mjs`, `PANCHINE_PROVIDER_MS`), in a person's
 * words, from the dictionary (`key.bench.cause.<code>`). This is the one table: `tui/catalog-service.ts` had a second copy.
 * A cause not in the table is shown as no cause, never guessed.
 */
const BENCH_CAUSE_CODES=new Set(['traffico','credenziale','credito','rete','timeout-fornitore','guasto-fornitore','flusso-interrotto']);
export function benchCauseText(code:unknown):string|null{
  return typeof code==='string'&&BENCH_CAUSE_CODES.has(code)?t(`key.bench.cause.${code}` as MessageId):null;
}

export const UNKNOWN_PROVIDER_HEALTH:ProviderHealthObservation=Object.freeze({
  state:'unknown',detail:'',latencyMs:null,observedAt:null,httpStatus:null,
});

export function providerCooldownFromRow(row:any):ProviderCooldown{
  const pool:any[]=Array.isArray(row?.pool)?row.pool:[];
  const benched=pool.filter(entry=>entry?.stato==='in-panchina');
  const timed=benched.filter(entry=>Number.isFinite(entry?.inPanchinaFino)).sort((a,b)=>Number(a.inPanchinaFino)-Number(b.inPanchinaFino));
  const first=timed[0]??benched[0]??null;
  const cause=benchCauseText(first?.causa);
  return{
    active:benched.length>0,
    cause,
    ...(typeof first?.causa==='string'&&BENCH_CAUSE_CODES.has(first.causa)?{causeCode:first.causa}:{}),
    until:Number.isFinite(first?.inPanchinaFino)?Number(first.inPanchinaFino):null,
    keys:pool.length,
  };
}

export function providerHealthFromProbe(result:any,observedAt:number):ProviderHealthObservation{
  const esito=String(result?.esito??'');
  const code=typeof result?.codice==='string'?result.codice:null;
  const state:ProviderHealthState=
    esito==='collegato'?'available':
    esito==='non-autorizzato'?(result?.credenzialeVerificata===null?'access-denied':'auth-failed'):
    esito==='irraggiungibile'?'unreachable':
    esito==='non-sondabile'?'unprobeable':
    esito==='non-provabile'?(code==='PROVIDER_ADDRESS_REQUIRED'||code==='PROVIDER_RUNTIME_INVALID'||code==='CATALOG_CONFIGURATION_REQUIRED'||code==='PROVIDER_KEY_MISSING'?'unconfigured':'unprobeable'):
    esito==='errore'?'error':'unknown';
  return{
    state,
    detail:String(result?.motivo??esito),
    latencyMs:Number.isFinite(result?.millisecondi)?Number(result.millisecondi):null,
    observedAt:Number.isFinite(observedAt)?observedAt:null,
    httpStatus:Number.isInteger(result?.httpStatus)?Number(result.httpStatus):null,
    ...(typeof result?.credenzialeVerificata==='boolean'?{credentialVerified:result.credenzialeVerificata as boolean}:{}),
    ...(code==='PROVIDER_ADDRESS_REQUIRED'?{code}:{}),
  };
}

/*
 * ⛔ R0 (forensics B row 6): ONE sentence for a benched key, on every path. `4ba3024a8` gave the control plane its own wording
 *   ("…has no credential usable now. Wait until <UTC ISO>…") while the session runtime kept the B1 slice 25 sentence, so the screen
 *   and the runtime disagreed and the screen lost the cause, the local time and `/provider`. These builders were moved here from
 *   `tui/catalog-service.ts` (which re-exports them) so that the provider layer and the screen share them.
 */
type Bench=Pick<ProviderCooldown,'cause'|'until'|'keys'|'causeCode'>;
/** "until when" as a person reads it: local HH:MM, with the local date in front when it is not today. */
export function benchClock(until:number,now:number=Date.now()):string{
  const at=new Date(until);const two=(n:number)=>String(n).padStart(2,'0');
  const time=`${two(at.getHours())}:${two(at.getMinutes())}`;
  return at.toDateString()===new Date(now).toDateString()?time:`${at.getFullYear()}-${two(at.getMonth()+1)}-${two(at.getDate())} ${time}`;
}
/** "The OpenRouter key is benched until 15:04 (rate limit)". */
export function benchedKeyText(label:string,bench:Bench,now:number=Date.now()):string{
  let state=tn('key.benched',bench.keys>1?bench.keys:1,{provider:label});
  if(bench.until!==null)state=t('key.benched.until',{state,time:benchClock(bench.until,now)});
  if(bench.cause)state=t('key.benched.because',{state,cause:bench.cause});
  return state;
}
/*
 * INC503 (owner 30/09): a provider-side cause (OpenRouter 503 = no provider for the model or its routing, a timeout, the
 * network, a broken stream) is not fixed by another key: the remedy is to wait or to change model. Another key is offered only
 * where it can help (rate limit, refused key, credit) or when the cause is not known.
 */
const PROVIDER_SIDE_CAUSES=new Set(['guasto-fornitore','timeout-fornitore','rete','flusso-interrotto']);
function benchedKeyRemedy(bench:Bench):string{
  if(bench.causeCode&&PROVIDER_SIDE_CAUSES.has(bench.causeCode))return t(bench.until!==null?'key.benched.remedy.provider.until':'key.benched.remedy.provider');
  return t(bench.until!==null?'key.benched.remedy.until':'key.benched.remedy');
}
/** The refusal of a send whose only keys are benched: the same sentence from the screen's readiness and from the session runtime. */
export function benchedKeyRefusal(label:string,bench:Bench,now:number=Date.now()):string{
  return t('key.benched.refusal',{state:benchedKeyText(label,bench,now),provider:label,remedy:benchedKeyRemedy(bench)});
}

export function remediationForProvider(input:ProviderDecisionInput):ProviderRemediation{
  const provider=input.label;
  if(input.auth.required&&!input.auth.usable){
    if(input.cooldown.active){
      /* The state and the remedy; nothing was attempted yet, so the remediation does not say "nothing was sent". */
      return{code:'wait-or-add-key',message:t('key.benched.status',{state:benchedKeyText(provider,input.cooldown),remedy:benchedKeyRemedy(input.cooldown)})};
    }
    /* «Continue with ChatGPT» (13/10/2026): nothing to add, the person signs in; signed in without the plan says that instead */
    if(input.auth.type==='oauth-pkce')return{code:'sign-in',message:t(input.auth.configured?'key.remedy.planNotEnabled':'key.missing.signIn',{provider,id:input.id})};
    /* R2 (E8 / Q-R2-7): the one missing-key sentence, the same on the screen, `-p`, `provider test` and `doctor`. */
    return{code:'add-key',message:missingKeyText(input.id)};
  }
  if(input.lastHealth.state==='auth-failed')return{code:'replace-key',message:t('key.remedy.replaceKey',{provider})};
  if(input.lastHealth.state==='access-denied')return input.lastHealth.httpStatus===401
    ?{code:'check-endpoint',message:t('key.remedy.localAuthRequired',{provider})}
    :{code:'inspect-provider',message:t('key.remedy.localAccessDenied',{provider})};
  if(input.lastHealth.code==='PROVIDER_ADDRESS_REQUIRED')return{code:'choose-address',message:t('key.zai.addressRequired')};
  if(!input.runtimeConfigured)return{code:'configure-provider',message:t('key.remedy.configureProvider',{provider})};
  if(!input.endpoint.valid)return{code:'configure-endpoint',message:t('key.remedy.configureEndpoint',{provider})};
  if(input.lastHealth.state==='unreachable')return{code:'check-endpoint',message:t('key.remedy.checkEndpoint',{provider})};
  if(input.lastHealth.state==='error')return{code:'retry',message:t('key.remedy.retry',{provider})};
  if(input.lastHealth.state==='unconfigured')return{code:'configure-endpoint',message:t('key.remedy.completeConfiguration',{provider})};
  if(input.lastHealth.state==='unprobeable')return{code:'inspect-provider',message:t('key.remedy.inspect',{provider})};
  return{code:'none',message:''};
}

export function providerReadinessDecision(input:ProviderDecisionInput):ProviderReadinessDecision{
  const remediation=remediationForProvider(input);
  if(input.auth.required&&!input.auth.usable){
    if(input.cooldown.active)return{ready:false,provider:input.id,code:'PROVIDER_KEY_BENCHED',message:benchedKeyRefusal(input.label,input.cooldown),remediation};
    /* «Continue with ChatGPT»: its own code, so no surface answers it by asking for a key */
    if(input.auth.type==='oauth-pkce')return{ready:false,provider:input.id,code:'PROVIDER_SIGN_IN_REQUIRED',message:remediation.message,remediation};
    return{ready:false,provider:input.id,code:'PROVIDER_KEY_MISSING',message:remediation.message,remediation};
  }
  if(input.lastHealth.state==='auth-failed')return{ready:false,provider:input.id,code:'PROVIDER_AUTH_FAILED',message:remediation.message,remediation};
  if(input.lastHealth.state==='access-denied')return{ready:false,provider:input.id,code:'PROVIDER_HEALTH_ERROR',message:remediation.message,remediation};
  if(input.lastHealth.code==='PROVIDER_ADDRESS_REQUIRED')return{ready:false,provider:input.id,code:'PROVIDER_ADDRESS_REQUIRED',message:remediation.message,remediation};
  if(!input.runtimeConfigured)return{ready:false,provider:input.id,code:'PROVIDER_NOT_CONFIGURED',message:remediation.message,remediation};
  if(!input.endpoint.valid)return{ready:false,provider:input.id,code:'PROVIDER_ENDPOINT_INVALID',message:remediation.message,remediation};
  if(input.lastHealth.state==='unreachable')return{ready:false,provider:input.id,code:'PROVIDER_UNREACHABLE',message:remediation.message,remediation};
  if(input.lastHealth.state==='error'||input.lastHealth.state==='unconfigured')return{ready:false,provider:input.id,code:'PROVIDER_HEALTH_ERROR',message:remediation.message,remediation};
  return{ready:true,provider:input.id,remediation};
}
