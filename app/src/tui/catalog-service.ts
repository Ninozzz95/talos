/*
 * B1 slice 18 — provider first, then model.
 *
 * `listProviders` says, for each chat destination, whether a key is usable and where it would come from;
 * `providerModels` is the live list of ONE provider, or the list TALOS already knows marked not verified;
 * `setProviderKey` tests a key against its own provider and saves it only when the test passes;
 * `readiness` is what a send asks before anything leaves the machine.
 */
import type {EnvironmentKeyAnswer,EnvironmentKeyState} from '../provider/environment-keys.ts';
import {REASONING_EFFORTS,type ReasoningEffort} from '../config/types.ts';
import {providerOfModel} from '../provider/environment-keys.ts';
import type {ProviderControlPlane} from '../provider/control-plane.ts';
import type {ProviderReadinessDecision,ProviderRemediation} from '../provider/health.ts';
import {catalogSourceFromKernel,mergeModelRows,normalizeModelRows,type ModelCatalogRow,type ModelEvidenceSource} from '../provider/model-catalog.ts';

export type TuiProviderKeySource='saved'|'environment'|'environment-unanswered'|'environment-declined'|'missing'|'not-required';
/**
 * B1 slice 25 — a provider whose keys are stored but none can be used now: the kernel benched every one of them after a refusal
 * it classified (`provider-credential-store.mjs`, `mettiInPanchina`). `cause` in a person's words, `until` the earliest end of a
 * bench (epoch ms), `keys` how many are benched; either detail is `null` when the kernel's public row does not give it.
 */
export type TuiKeyBench={cause:string|null;until:number|null;keys:number};
export type TuiProvider={
  id:string;label:string;description:string;
  /** ⛔ A key usable NOW (the store's `getKey`, which skips a benched key), or no key needed. Never "a key is stored". */
  configured:boolean;requiresKey:boolean;
  authType:string;local:boolean;cloud:boolean;endpointHost:string|null;
  supportsEndpoint:boolean;supportsOAuth:boolean;execution:string;
  keySource:TuiProviderKeySource;environmentVariable:string|null;
  benched:TuiKeyBench|null;
};

export type TuiProviderReadinessCode=Extract<ProviderReadinessDecision,{ready:false}>['code'];
export type TuiProviderProbe={
  provider:string;state:'available'|'unavailable'|'unconfigured'|'unknown';detail:string;latencyMs:number|null;
  /** Transport only: this is the M5-A control-plane decision, never re-derived here. */
  remediation:ProviderRemediation|null;
  readinessCode:TuiProviderReadinessCode|null;
};

export type TuiModel=ModelCatalogRow;

export type TuiModelList={provider:string;label:string;rows:TuiModel[];verified:boolean;notice:string};

/**
 * ⛔ A key is saved ONLY on an affirmative acceptance (coordinator's correction of record, fix round of B1 slice 18):
 *   `valid` — the CLI's authenticated check answered 2xx, or the kernel probe answered `credenzialeVerificata === true`
 *   (B1 slice 25: the kernel's written contract, `harness-ui/src/provider-probe.mjs:225-235`; nothing else from the probe saves).
 *   Everything else is not saved and says why: 401 `invalid` · 403 `permission` · 429 `rate-limited` · 5xx `error` ·
 *   400, 404, any other status or a malformed 2xx `not-verified` · a redirect `redirected` · no response `unreachable` ·
 *   no way to check `unverifiable` · a key no provider issues `malformed`. `invalid` and `permission` are said only of a key the
 *   provider judged (`credenzialeVerificata === false` with `non-autorizzato`, or the CLI's own 401/403); a key nobody judged
 *   (`null`) could not be told apart and is never called wrong.
 * ⛔ Why 400/404/429 are not "accepted": the contract's first mapping came from Claude Code's Bedrock wizard, whose check names a
 *   model, so a 404 there answers for the model after authentication. Here the check is a model-list GET or a one-token request
 *   through whatever answers at the configured address, and a wrong path, a proxy or a rate limiter answers 400, 404 or 429
 *   without reading the key. The kernel says the same of its own probe (`harness-ui/src/provider-probe.mjs`, the HTTP 404
 *   reason: "La validità della chiave non è verificata da questa risposta").
 */
export type TuiKeyTestOutcome='valid'|'not-verified'|'rate-limited'|'redirected'|'invalid'|'permission'|'unreachable'|'unverifiable'|'malformed'|'error';
export type TuiKeyTest={provider:string;label:string;outcome:TuiKeyTestOutcome;passed:boolean;httpStatus:number|null;message:string};
export type TuiKeySave=TuiKeyTest&{saved:boolean};

export type TuiReadiness=
 | {ready:true;provider:string;model:string}
 | {ready:false;code:'PROVIDER_NOT_CHOSEN'|'MODEL_NOT_CHOSEN'|'PROVIDER_KEY_MISSING'|'PROVIDER_KEY_BENCHED'|'PROVIDER_AUTH_FAILED'|'PROVIDER_NOT_CONFIGURED'|'PROVIDER_ENDPOINT_INVALID'|'PROVIDER_UNREACHABLE'|'PROVIDER_HEALTH_ERROR';provider:string|null;message:string};

export interface TuiCatalogService{
  listProviders():Promise<TuiProvider[]>;
  probeProvider(id:string,signal?:AbortSignal):Promise<TuiProviderProbe>;
  listModels(input?:{provider?:string|undefined;signal?:AbortSignal|undefined;refresh?:boolean|undefined}):Promise<TuiModel[]>;
  providerModels(provider:string,signal?:AbortSignal):Promise<TuiModelList>;
  selectModel(id:string,scope:'project-user'):Promise<void>;
  testProviderKey(id:string,secret:string,signal?:AbortSignal):Promise<TuiKeyTest>;
  /** What must be said BEFORE the key test runs, when that test is a real one-token request; null otherwise. */
  keyTestNotice(id:string):string|null;
  setProviderKey(id:string,secret:string,signal?:AbortSignal):Promise<TuiKeySave>;
  clearProviderKey(id:string):Promise<void>;
  answerEnvironmentKey(id:string,answer:EnvironmentKeyAnswer):Promise<void>;
  chosenProvider():Promise<string|null>;
  chooseProvider(id:string):Promise<void>;
  readiness(model:string):Promise<TuiReadiness>;
}

export type TuiCatalogDeps={
  publicProviders:()=>any[];
  registry:Record<string,any>;
  runtimeFor:(id:string)=>any;
  /** ⛔ The key usable NOW (the store's `getKey`): a benched key is not returned, so it does not make a provider usable. */
  keyFor:(id:string)=>string|null;
  setKey:(id:string,secret:string)=>void;
  clearKey:(id:string)=>void;
  /** ⛔ Never called with `consentiGenerazione`: listing, probing and `talos provider test` do not generate. */
  createProbe:(signal?:AbortSignal)=>{prova:(id:string)=>Promise<any>;elencaModelli:(id:string)=>Promise<any>};
  persistModel:(id:string)=>Promise<void>;
  /** A probe that can read ONE candidate key, for ONE provider, and nothing from the store. The key test alone may pass
   *  `{consentiGenerazione:true}`, and only for a provider whose registry probe declares `richiestaMinima`. */
  createKeyProbe?:(provider:string,secret:string,signal?:AbortSignal)=>{prova:(id:string,options?:{consentiGenerazione?:boolean})=>Promise<any>};
  fetchImpl?:(url:string,init:RequestInit)=>Promise<Response>;
  environmentKey?:(id:string)=>EnvironmentKeyState|null;
  answerEnvironmentKey?:(id:string,answer:EnvironmentKeyAnswer)=>void;
  chosenProvider?:()=>string|null;
  chooseProvider?:(id:string)=>void;
  /** M5-A: one shared provider profile/health/readiness decision model. Optional for older test fixtures. */
  controlPlane?:ProviderControlPlane;
};

function collectReasoningEfforts(...sources:unknown[]):ReasoningEffort[]|null{
  let observed=false;const out:ReasoningEffort[]=[];
  for(const source of sources){
    if(!Array.isArray(source))continue;observed=true;
    for(const value of source){
      if(typeof value!=='string'||!(REASONING_EFFORTS as readonly string[]).includes(value))continue;
      const effort=value as ReasoningEffort;if(!out.includes(effort))out.push(effort);
    }
  }
  return observed?out:null;
}
export function normalizeModels(rows:readonly any[],provider:string,available:ModelEvidenceSource|'remote'):TuiModel[]{
  return normalizeModelRows(rows,provider,available==='remote'?'live':available);
}

export function availabilityFromCatalog(source:unknown,successfulCatalogBoundary=false):TuiModel['available']{
  return catalogSourceFromKernel(source,{successfulCatalogBoundary});
}

export function mergeModels(...groups:TuiModel[][]):TuiModel[]{
  return mergeModelRows(...groups.flat());
}

/**
 * Providers whose kernel probe cannot verify a key, measured 2026-09-17 against the provider's own documentation.
 * OpenRouter: `GET /api/v1/models` has no security block (public), so the kernel probe answers "connected" for any
 * key; `GET /api/v1/models/user` requires the bearer token (401 without it). Source: openrouterteam/docs
 * `openapi/openapi.yaml`, read through Context7 on 2026-09-17.
 */
const AUTHENTICATED_KEY_CHECK:Readonly<Record<string,{path:string}>>=Object.freeze({openrouter:{path:'/models/user'}});
/*
 * B1 slice 25 — slice 18's interim one-token table (`ONE_TOKEN_KEY_CHECK`) is gone. The kernel registry now declares the minimal
 * request of DeepInfra, Novita, Ollama Cloud and Hugging Face as it did for Z.ai's Anthropic port (CLI-REQ-06, desktop lane
 * `95716162`), and its probe sends it, reads the body under a 64 KiB cap, and states `credenzialeVerificata`. The key test asks the
 * kernel for every provider that declares it (`testProviderKey` below).
 */
/** Live lists this CLI fetches itself, because the kernel's direct catalog does not cover them. No key is sent. */
const PUBLIC_MODEL_LIST:Readonly<Record<string,{path:string}>>=Object.freeze({openrouter:{path:'/models'}});
const KEY_TEST_TIMEOUT_MS=30_000;
/**
 * B1 slice 25 — the bench causes the kernel classifies (`provider-credential-store.mjs`, `PANCHINE_PROVIDER_MS`), in a person's
 * words. A cause not in this table is shown as no cause, never guessed.
 */
const BENCH_CAUSES:Readonly<Record<string,string>>=Object.freeze({
  traffico:'rate limit',credenziale:'key refused',credito:'out of credit',rete:'network error',
  'timeout-fornitore':'provider timeout','guasto-fornitore':'provider error','flusso-interrotto':'interrupted stream',
});

/**
 * B1 slice 25 — what the kernel's public row says about a provider whose stored keys cannot be used now, or `null` when it stores
 * none. Read from `listPublic`'s pool entries (`stato`, `inPanchinaFino`, `causa`). ⛔ Call it only when the key usable now
 * (`getKey`) is absent: the pool is the description, `getKey` is the decision.
 */
export function keyBench(row:any):TuiKeyBench|null{
  const pool:any[]=Array.isArray(row?.pool)?row.pool:[];
  const benched=pool.filter(entry=>entry?.stato==='in-panchina');
  if(row?.keyConfigured!==true&&benched.length===0)return null;
  const timed=benched.filter(entry=>Number.isFinite(entry?.inPanchinaFino)).sort((a,b)=>a.inPanchinaFino-b.inPanchinaFino);
  const first=timed[0]??benched[0]??null;
  const cause=typeof first?.causa==='string'&&Object.hasOwn(BENCH_CAUSES,first.causa)?BENCH_CAUSES[first.causa]!:null;
  return{cause,until:Number.isFinite(first?.inPanchinaFino)?Number(first.inPanchinaFino):null,keys:Math.max(1,pool.length)};
}
/** "until when" as a person reads it: local HH:MM, with the local date in front when it is not today. */
export function benchClock(until:number,now:number=Date.now()):string{
  const at=new Date(until);const two=(n:number)=>String(n).padStart(2,'0');
  const time=`${two(at.getHours())}:${two(at.getMinutes())}`;
  return at.toDateString()===new Date(now).toDateString()?time:`${at.getFullYear()}-${two(at.getMonth()+1)}-${two(at.getDate())} ${time}`;
}
/** "The OpenRouter key is benched until 15:04 (rate limit)". */
export function benchedKeyText(label:string,bench:TuiKeyBench,now:number=Date.now()):string{
  const subject=bench.keys>1?`All ${bench.keys} ${label} keys are`:`The ${label} key is`;
  return `${subject} benched${bench.until!==null?` until ${benchClock(bench.until,now)}`:''}${bench.cause?` (${bench.cause})`:''}`;
}
/** The refusal of a send whose provider has no key usable now: missing, or stored and benched. */
export function unusableKeyRefusal(label:string,bench:TuiKeyBench|null,now:number=Date.now()):{code:'PROVIDER_KEY_MISSING'|'PROVIDER_KEY_BENCHED';message:string}{
  if(!bench)return{code:'PROVIDER_KEY_MISSING',message:`The ${label} key is missing, so nothing was sent to ${label}. Add it with /provider.`};
  return{code:'PROVIDER_KEY_BENCHED',message:`${benchedKeyText(label,bench,now)}, so nothing was sent to ${label}. ${bench.until!==null?'Wait until then':'Wait'}, or add another key with /provider.`};
}
/** ⛔ The only outcome that saves a key. */
const PASSED=new Set<TuiKeyTestOutcome>(['valid']);
/** A key as providers issue it, after trimming: printable ASCII 0x21-0x7E, no space, tab, line break, DEL or non-ASCII. */
const PRINTABLE_KEY=/^[\x21-\x7e]{1,4096}$/u;

function codeOf(error:unknown){const code=(error as any)?.code;return typeof code==='string'&&/^[A-Z0-9_]{1,64}$/u.test(code)?code:'UNAVAILABLE';}
function joinPath(endpoint:string,path:string){return `${String(endpoint).replace(/\/+$/u,'')}${path}`;}

export function keyTestMessage(outcome:TuiKeyTestOutcome,label:string,httpStatus:number|null):string{
  const status=httpStatus===null?'':` (HTTP ${httpStatus})`;
  const notVerified='The key was not verified.';
  switch(outcome){
    case 'valid':return `${label} accepted the key${status}.`;
    case 'invalid':return `${label} refused the key${status}.`;
    case 'permission':return `${label} recognised the key but denied permission${status}.`;
    case 'rate-limited':return `${label} answered HTTP ${httpStatus??429}: rate-limited; try again shortly. ${notVerified}`;
    case 'not-verified':return httpStatus!==null&&httpStatus>=200&&httpStatus<300
      ?`${label} answered HTTP ${httpStatus} without a well-formed response. ${notVerified}`
      :httpStatus!==null?`${label} answered HTTP ${httpStatus}, which does not show that the key is valid. ${notVerified}`
      :`${label} did not give an answer that shows the key is valid. ${notVerified}`;
    case 'redirected':return `${label} answered with a redirect, and TALOS does not send a key on to another address. ${notVerified}`;
    case 'unreachable':return `${label} could not be reached, so the key could not be tested.`;
    case 'unverifiable':return `TALOS has no way to verify a ${label} key.`;
    case 'malformed':return 'The key is empty or contains a character no provider issues (only printable ASCII without spaces is accepted). Nothing was sent.';
    default:return httpStatus!==null&&httpStatus>=500?`${label} answered HTTP ${httpStatus}, a server error. ${notVerified}`:`${label} answered with an error${status}. ${notVerified}`;
  }
}

/** An HTTP status that is not an affirmative acceptance. 2xx is decided by the caller, which knows whether the body was checked. */
function refusedStatus(httpStatus:number):TuiKeyTestOutcome{
  if(httpStatus===401)return 'invalid';
  if(httpStatus===403)return 'permission';
  if(httpStatus===429)return 'rate-limited';
  if(httpStatus>=500)return 'error';
  return 'not-verified';
}

/**
 * The kernel probe's answer about a candidate key, read by its written contract (`provider-probe.mjs:225-235`):
 * - `credenzialeVerificata === true` → `valid`, the only answer that saves;
 * - `false` → judged, not confirmed: `non-autorizzato` is a refusal naming its status (401 `invalid`, 403 `permission`),
 *   `collegato` reached a public catalogue that says nothing of this key (`unverifiable`), any other is `not-verified`;
 * - anything else (`null`, and off contract `undefined` or a non-boolean) → not judged, "could not tell": unreachable, no way to
 *   probe, or the status that answered without reading the key. ⛔ Never `invalid` or `permission`, whatever the status.
 */
export function classifyKeyTest(result:any):{outcome:TuiKeyTestOutcome;httpStatus:number|null}{
  const httpStatus=Number.isInteger(result?.httpStatus)?Number(result.httpStatus):null;
  const verdict=result?.credenzialeVerificata;
  if(verdict===true)return{outcome:result?.esito==='collegato'?'valid':'not-verified',httpStatus};
  if(verdict===false){
    if(result?.esito==='non-autorizzato')return{outcome:httpStatus===403?'permission':'invalid',httpStatus};
    return{outcome:result?.esito==='collegato'?'unverifiable':'not-verified',httpStatus};
  }
  if(result?.esito==='irraggiungibile')return{outcome:'unreachable',httpStatus};
  if(result?.esito==='non-sondabile'||result?.esito==='non-provabile')return{outcome:'unverifiable',httpStatus};
  if(httpStatus===429)return{outcome:'rate-limited',httpStatus};
  if(httpStatus!==null&&httpStatus>=500)return{outcome:'error',httpStatus};
  return{outcome:httpStatus!==null||result?.esito==='collegato'?'not-verified':'error',httpStatus};
}

/** Node's fetch with `redirect:'error'` rejects with this cause (measured on Node 24.18: TypeError "fetch failed", cause "unexpected redirect"). */
function isRefusedRedirect(error:unknown){return /unexpected redirect/u.test(String((error as any)?.cause?.message??''));}

export function createTuiCatalogService(deps:TuiCatalogDeps):TuiCatalogService{
  const labelOf=(id:string)=>String(deps.registry[id]?.etichetta??id);
  const listProviders=async():Promise<TuiProvider[]>=>{
    if(deps.controlPlane){
      return deps.controlPlane.list().map(profile=>({
        id:profile.id,label:profile.label,description:profile.description,
        configured:profile.auth.required?profile.auth.usable:profile.id==='esterno'?profile.execution==='configurato':true,
        requiresKey:profile.auth.required,authType:profile.auth.type,local:profile.local,cloud:profile.cloud,
        endpointHost:profile.endpoint.host,supportsEndpoint:profile.endpoint.supportsCustom,supportsOAuth:profile.supportsOAuth,
        execution:profile.execution,keySource:profile.auth.source,environmentVariable:profile.auth.environmentVariable,
        benched:profile.cooldown.active?{cause:profile.cooldown.cause,until:profile.cooldown.until,keys:Math.max(1,profile.cooldown.keys)}:null,
      }));
    }
    const publicRows=deps.publicProviders()??[];const byId=new Map(publicRows.map(row=>[String(row?.id??''),row]));
    return Object.values(deps.registry).filter((record:any)=>record?.destinazioneChat===true).map((record:any)=>{
      const row:any=byId.get(record.id)??{};const runtime=deps.runtimeFor(record.id)??{};const endpoint=row.endpoint??runtime.endpoint??record.baseUrl??null;
      let endpointHost:string|null=null;try{endpointHost=endpoint?new URL(String(endpoint)).host:null;}catch{endpointHost=null;}
      const requiresKey=typeof row.requiresKey==='boolean'?row.requiresKey:record.chiaveObbligatoria===true;
      const execution=String(row.execution??record.esecuzione??'unknown');
      /* ⛔ B1 slice 25: usable means the key usable NOW (`getKey`). The kernel's `keyConfigured` is `hasKey`, which counts a benched
         key too; it says only that a key is stored, which decides where the key comes from and whether it is benched. */
      const usable=Boolean(deps.keyFor(record.id));
      const stored=usable||row.keyConfigured===true;
      const configured=record.id==='esterno'?execution==='configurato':requiresKey?usable:true;
      const benched=requiresKey&&!usable?keyBench(row):null;
      const local=record.wire==='locale'||record.catalogo?.fonte==='runtime-locale'||/locale/u.test(String(record.esecuzione??''));
      const environment=requiresKey?deps.environmentKey?.(record.id)??null:null;
      const keySource:TuiProviderKeySource=!requiresKey?'not-required'
        :row.origineChiave==='custodia'?'saved'
        :stored?'environment'
        :environment?.state==='unanswered'?'environment-unanswered'
        :environment?.state==='declined'?'environment-declined'
        :'missing';
      return{
        id:String(record.id),label:String(row.label??record.etichetta??record.id),description:String(record.descrizione??''),configured,requiresKey,
        authType:String(record.auth?.tipo??(requiresKey?'key':'none')),local,cloud:Boolean(record.cloud),endpointHost,
        supportsEndpoint:row.supportsEndpoint===true||record.indirizzoModificabile===true,supportsOAuth:row.supportsOAuth===true||Boolean(record.oauth),execution,
        keySource,environmentVariable:environment?.variable??null,benched,
      };
    });
  };

  const enrichRegistryReasoning=(provider:string,row:TuiModel):TuiModel=>{
    const bare=row.id.startsWith(`${provider}:`)?row.id.slice(provider.length+1):row.id;
    const record=deps.registry[provider]??{};
    const compatible=record?.richiestaCompatibile?.modelli?.[bare];
    const known=Array.isArray(record?.modelliNoti)?record.modelliNoti.find((entry:any)=>String(entry?.id??'')===bare):null;
    const observed=collectReasoningEfforts(compatible?.livelliRagionamento,known?.ragionamento?.livelli);
    if(observed===null)return row;
    const evidenceUrl=typeof record?.richiestaCompatibile?.fonte==='string'?record.richiestaCompatibile.fonte:typeof known?.fonte==='string'?known.fonte:null;
    const evidenceDate=typeof record?.richiestaCompatibile?.data==='string'?record.richiestaCompatibile.data:typeof known?.data==='string'?known.data:null;
    const [documented]=normalizeModels([{
      id:row.id,name:row.name,reasoning:true,reasoningEfforts:observed,
      ...(evidenceUrl?{fonteMetadati:evidenceUrl}:{}),...(evidenceDate?{dataMetadati:evidenceDate}:{}),
    }],provider,'documented');
    return documented?mergeModels([row],[documented])[0]??row:row;
  };
  const knownModels=async(provider:string):Promise<TuiModel[]>=>{
    const publicRows=deps.publicProviders()??[];
    const pub=publicRows.find(x=>x?.id===provider);const configured=deps.runtimeFor(provider)?.modelli??[];const fallback=pub?.modelliDiRiserva??deps.registry[provider]?.modelliDiRiserva??[];
    return mergeModels(normalizeModels(configured,provider,'configured'),normalizeModels(fallback,provider,'documented')).map(row=>enrichRegistryReasoning(provider,row));
  };

  const endpointOf=(provider:string)=>{const runtime=deps.runtimeFor(provider)??{};return String(runtime.endpoint??deps.registry[provider]?.baseUrl??'');};
  const timeoutSignal=(signal?:AbortSignal)=>signal?AbortSignal.any([signal,AbortSignal.timeout(KEY_TEST_TIMEOUT_MS)]):AbortSignal.timeout(KEY_TEST_TIMEOUT_MS);

  async function liveModels(provider:string,signal?:AbortSignal):Promise<TuiModel[]|null>{
    const own=PUBLIC_MODEL_LIST[provider];
    if(own){
      if(!deps.fetchImpl)throw Object.assign(new Error('PROVIDER_CATALOG_UNAVAILABLE'),{code:'PROVIDER_CATALOG_UNAVAILABLE'});
      let response:Response;
      try{response=await deps.fetchImpl(joinPath(endpointOf(provider),own.path),{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:timeoutSignal(signal)});}
      catch(error){if((error as any)?.name==='AbortError'&&signal?.aborted)throw error;throw Object.assign(new Error('CATALOG_UNREACHABLE'),{code:'CATALOG_UNREACHABLE'});}
      if(!response.ok)throw Object.assign(new Error('CATALOG_UPSTREAM_ERROR'),{code:'CATALOG_UPSTREAM_ERROR',httpStatus:response.status});
      const body:any=await response.json().catch(()=>null);
      if(!Array.isArray(body?.data))throw Object.assign(new Error('CATALOG_UPSTREAM_ERROR'),{code:'CATALOG_UPSTREAM_ERROR'});
      return normalizeModels(body.data,provider,'live');
    }
    const remote=await deps.createProbe(signal).elencaModelli(provider);
    const source=catalogSourceFromKernel(remote?.fonte,{successfulCatalogBoundary:true});
    if(source==='documented'||source==='configured')return null;
    return normalizeModels(remote?.modelli??[],provider,source);
  }

  /** The kernel declares a minimal generation for this provider: only the key test may ask the probe to send it. */
  const declaresMinimalRequest=(id:string)=>Boolean(deps.registry[id]?.sonda?.richiestaMinima);
  function keyTestNotice(id:string):string|null{
    if(!deps.registry[id]||!declaresMinimalRequest(id))return null;
    return `One message with a one-token limit is sent to ${labelOf(id)} to test the key and may use a small amount of credit.`;
  }

  async function testProviderKey(id:string,secret:string,signal?:AbortSignal):Promise<TuiKeyTest>{
    const record=deps.registry[id];if(!record)throw Object.assign(new Error('PROVIDER_INVALID'),{code:'PROVIDER_INVALID'});
    const label=labelOf(id);
    const candidate=typeof secret==='string'?secret.trim():'';
    const done=(outcome:TuiKeyTestOutcome,httpStatus:number|null):TuiKeyTest=>({provider:id,label,outcome,passed:PASSED.has(outcome),httpStatus,message:keyTestMessage(outcome,label,httpStatus)});
    /* ⛔ Measured with Node's fetch: `€` or DEL make fetch throw before sending, while a tab, a non-breaking space, `é` or an inner
       space are sent as they are. No provider issues such a key, so nothing is sent for it. */
    if(!PRINTABLE_KEY.test(candidate))return done('malformed',null);
    const fetchFailure=(error:unknown):TuiKeyTest=>{
      if((error as any)?.name==='AbortError'&&signal?.aborted)throw error;
      return done(isRefusedRedirect(error)?'redirected':'unreachable',null);
    };
    const own=AUTHENTICATED_KEY_CHECK[id];
    if(own){
      if(!deps.fetchImpl)return done('unverifiable',null);
      let response:Response;
      try{response=await deps.fetchImpl(joinPath(endpointOf(id),own.path),{method:'GET',headers:{Accept:'application/json',Authorization:`Bearer ${candidate}`},redirect:'error',signal:timeoutSignal(signal)});}
      catch(error){return fetchFailure(error);}
      try{await response.body?.cancel();}catch{/* the body is never read: it could echo the request */}
      if(response.status>=200&&response.status<300)return done('valid',response.status);
      return done(refusedStatus(response.status),response.status);
    }
    if(!deps.createKeyProbe)return done('unverifiable',null);
    const probe=deps.createKeyProbe(id,candidate,signal);
    /* ⛔ The ONLY call in this CLI that lets the kernel probe generate: the key test, for a provider that declares its minimal request. */
    const result=declaresMinimalRequest(id)?await probe.prova(id,{consentiGenerazione:true}):await probe.prova(id);
    /* ⛔ B1 slice 25: saved only on `credenzialeVerificata === true` (`classifyKeyTest` gives `valid` for nothing else). */
    const classified=classifyKeyTest(result);
    return done(classified.outcome,classified.httpStatus);
  }

  return{
    listProviders,
    async probeProvider(id,signal){
      if(deps.controlPlane){
        const profile=await deps.controlPlane.probe(id,signal);const health=profile.lastHealth;
        const decision=deps.controlPlane.readiness(id);
        const state:TuiProviderProbe['state']=health.state==='available'?'available':health.state==='unconfigured'?'unconfigured':health.state==='unknown'||health.state==='unprobeable'?'unknown':'unavailable';
        return{provider:id,state,detail:health.detail,latencyMs:health.latencyMs,remediation:profile.remediation,readinessCode:decision.ready?null:decision.code};
      }
      const result=await deps.createProbe(signal).prova(id);
      const state:TuiProviderProbe['state']=result?.esito==='collegato'?'available':result?.codice==='PROVIDER_KEY_MISSING'?'unconfigured':result?.esito==='non-provabile'||result?.esito==='non-sondabile'?'unknown':'unavailable';
      return{provider:id,state,detail:String(result?.motivo??result?.esito??''),latencyMs:Number.isFinite(result?.millisecondi)?Number(result.millisecondi):null,remediation:null,readinessCode:null};
    },
    async listModels(input={}){
      if(input.provider&&input.refresh){const remote=await deps.createProbe(input.signal).elencaModelli(input.provider);const source=availabilityFromCatalog(remote?.fonte,true);return normalizeModels(remote?.modelli??[],input.provider,source).map(row=>enrichRegistryReasoning(input.provider!,row));}
      const providers=await listProviders();
      return (await Promise.all(providers.filter(p=>!input.provider||p.id===input.provider).map(p=>knownModels(p.id)))).flat();
    },
    async providerModels(provider,signal){
      if(!deps.registry[provider])throw Object.assign(new Error('PROVIDER_INVALID'),{code:'PROVIDER_INVALID'});
      const label=labelOf(provider);const known=await knownModels(provider);
      try{
        const live=await liveModels(provider,signal);
        if(live&&live.length){
          const rows=mergeModels(live,known);
          const liveVerified=rows.filter(row=>row.availabilityVerified).length;
          const unverified=rows.length-liveVerified;
          const verified=unverified===0&&rows.length>0;
          const notice=verified
            ?`Live list from ${label}: ${rows.length} models.`
            :`Catalog from ${label}: ${liveVerified} live-verified; ${unverified} configured/documented/unknown model${unverified===1?' is':'s are'} not verified as currently available.`;
          return{provider,label,rows,verified,notice};
        }
        return{provider,label,rows:known,verified:false,notice:`${label} did not return a live list; these are the models TALOS already knows. Not verified.`};
      }catch(error){
        if((error as any)?.name==='AbortError'&&signal?.aborted)throw error;
        return{provider,label,rows:known,verified:false,notice:`${label} could not be reached (${codeOf(error)}); these are the models TALOS already knows. Not verified.`};
      }
    },
    async selectModel(id,scope){if(scope!=='project-user')throw Object.assign(new Error('CONFIG_SCOPE_INVALID'),{code:'CONFIG_SCOPE_INVALID'});await deps.persistModel(id);},
    testProviderKey,
    keyTestNotice,
    async setProviderKey(id,secret,signal){
      const test=await testProviderKey(id,secret,signal);
      if(!test.passed)return{...test,saved:false};
      /* ⛔ A key that passed but could not be stored says so, by code only: store errors are never echoed as text. */
      try{deps.setKey(id,String(secret).trim());}
      catch(error){return{...test,saved:false,message:`${test.message} It could not be saved (${codeOf(error)}).`};}
      deps.controlPlane?.invalidate(id);
      return{...test,saved:true};
    },
    async clearProviderKey(id){deps.clearKey(id);deps.controlPlane?.invalidate(id);},
    async answerEnvironmentKey(id,answer){
      if(!deps.answerEnvironmentKey)throw Object.assign(new Error('PROVIDER_CONSENT_UNAVAILABLE'),{code:'PROVIDER_CONSENT_UNAVAILABLE'});
      deps.answerEnvironmentKey(id,answer);
      deps.controlPlane?.invalidate(id);
    },
    async chosenProvider(){return deps.chosenProvider?.()??null;},
    async chooseProvider(id){
      if(!deps.registry[id]||deps.registry[id]?.destinazioneChat!==true)throw Object.assign(new Error('PROVIDER_INVALID'),{code:'PROVIDER_INVALID'});
      if(!deps.chooseProvider)throw Object.assign(new Error('PROVIDER_CONSENT_UNAVAILABLE'),{code:'PROVIDER_CONSENT_UNAVAILABLE'});
      deps.chooseProvider(id);
    },
    async readiness(model){
      const chosen=deps.chosenProvider?.()??null;
      if(!chosen)return{ready:false,code:'PROVIDER_NOT_CHOSEN',provider:null,message:'No provider has been chosen yet, so nothing was sent. Choose one with /provider.'};
      const provider=providerOfModel(model);
      if(provider!==chosen)return{ready:false,code:'MODEL_NOT_CHOSEN',provider:chosen,message:`No ${labelOf(chosen)} model has been chosen yet, so nothing was sent. Choose one with /model.`};
      const row=(await listProviders()).find(entry=>entry.id===provider);
      if(!row)return{ready:false,code:'MODEL_NOT_CHOSEN',provider,message:`${provider} is not a provider TALOS can send to. Choose one with /provider.`};
      if(deps.controlPlane){
        const decision=deps.controlPlane.readiness(provider);
        if(!decision.ready)return{ready:false,code:decision.code,provider,message:decision.message};
        return{ready:true,provider,model};
      }
      /*
       * ⛔ Same predicate as `listProviders` (the key usable now), so the screen never calls ready what the runtime will refuse.
       * B1 slice 25: slice 18's `RUNTIME_OPENROUTER_KEY_REQUIRED` step is gone. The session registry no longer asks every session
       *   for an OpenRouter key: it asks the composition whether the session's own model is usable (`prontoFn`, CLI-REQ-05,
       *   `harness-ui/src/session-registry.mjs:2859-2876`).
       */
      if(row.requiresKey&&!row.configured){const refusal=unusableKeyRefusal(row.label,row.benched);return{ready:false,code:refusal.code,provider,message:refusal.message};}
      return{ready:true,provider,model};
    },
  };
}
