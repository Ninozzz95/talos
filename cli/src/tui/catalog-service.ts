/*
 * B1 slice 18 — provider first, then model.
 *
 * `listProviders` says, for each chat destination, whether a key is usable and where it would come from;
 * `providerModels` is the live list of ONE provider, or the list TALOS already knows marked not verified;
 * `setProviderKey` tests a key against its own provider and saves it only when the test passes;
 * `readiness` is what a send asks before anything leaves the machine.
 */
import {providerDescriptionText,providerLabelText} from '../provider/provider-text.ts';
import {unwatchFile,watchFile,type Stats} from 'node:fs';
import type {OpenRouterLogin} from '../provider/openrouter-login.ts';
/* types only: the plan's module and the browser opener are loaded when somebody signs in, not at start */
import type {ChatgptPlan,ChatgptPlanHandle,ChatgptPlanState,ChatgptSignInOutcome} from '../provider/chatgpt-plan.ts';
import type {EnvironmentKeyAnswer,EnvironmentKeyState} from '../provider/environment-keys.ts';
import {REASONING_EFFORTS,type ReasoningEffort} from '../config/types.ts';
import {providerOfModel} from '../provider/environment-keys.ts';
import type {ProviderControlPlane} from '../provider/control-plane.ts';
import type {ProviderReadinessDecision,ProviderRemediation} from '../provider/health.ts';
import {ZAI_PROVIDER,zaiAddressChosen,zaiAddressOf} from '../provider/zai-addresses.ts';
import {benchCauseText,benchedKeyRefusal} from '../provider/health.ts';
import {missingKeyText,providerLabel} from '../provider/missing-key.ts';
import {catalogSourceFromKernel,mergeModelRows,normalizeModelRows,type ModelCatalogRow,type ModelEvidenceSource} from '../provider/model-catalog.ts';
import {t,tn} from '../i18n/index.ts';
import {kernelProbeDetail,looksItalian} from '../i18n/kernel-map.ts';
/* R5a lane R, S2 (Q-R5-3): a live list that carries a model's window or output limit feeds its profile. */
import {rememberProviderModelRows} from '../runtime/model-profile.ts';
/* C1R — the provider-readiness snapshot (stale-while-revalidate): the resume reads it instead of awaiting the probe. */
import {DEFAULT_PROVIDER_STATE_TTL_MS,isProviderStateFresh,providerStateFromHealth,providerStateFromProbe,providerStateVouches,readProviderStateSnapshot,writeProviderStateSnapshot,type ProviderStateEntry,type ProviderStateValue} from '../provider/provider-state-snapshot.ts';

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
  /** Z.AI only (14/10/2026, owner: the key only to the chosen address): an address is chosen, and its name; absent elsewhere. */
  addressChosen?:boolean;address?:string|null;
};

export type TuiProviderReadinessCode=Extract<ProviderReadinessDecision,{ready:false}>['code'];
export type TuiProviderProbe={
  provider:string;state:'available'|'unavailable'|'unconfigured'|'unknown';detail:string;latencyMs:number|null;
  /** Transport only: this is the M5-A control-plane decision, never re-derived here. */
  remediation:ProviderRemediation|null;
  readinessCode:TuiProviderReadinessCode|null;
};

export type TuiModel=ModelCatalogRow;

/* P17: engine: a local engine that did not answer (down) or answered without a list (unreadable). */
/* `listing` (13/10/2026, additive): what kind of list this is, for a machine (runtime/usable-models.ts decides from it; the screen
   reads `notice`). `live`: the provider, the account or the engine answered now (the rows it listed are `availabilityVerified`);
   `known-only`: this provider has no live list at all, its rows are the documented or configured ones; `unreachable`: it has
   one and could not be read now; `signed-out`: a plan nobody is signed in to, or not enabled; `engine-down`: a local engine
   that did not answer, or not with a list. */
export type TuiModelListing='live'|'known-only'|'unreachable'|'signed-out'|'engine-down';
export type TuiModelList={provider:string;label:string;rows:TuiModel[];verified:boolean;notice:string;engine?:'down'|'unreadable';listing?:TuiModelListing};

/** C1R — what the session-side code reads about a provider's readiness without ever waiting on the network. */
export type TuiProviderStateReport={id:string;state:ProviderStateValue;verified:boolean|null;checkedAt:number|null;ageMs:number|null;fresh:boolean;
  /** Third review of 0.6.2: when this answer stops being one that may read «verified» (its `checkedAt` plus the hour), for a screen
   *  that stays open past it; null or absent when the answer does not vouch now. */
  vouchesUntil?:number|null};
/**
 * Third review of 0.6.2 (13/10/2026, nit): the providers no background check is ever made for, by id — for the one reader that must
 * know BEFORE the kernel is loaded: the status row, whose stand-in catalog has no registry yet, and which said «<agent>: checking…»
 * until the registry arrived and then nothing. The rule itself is the registry's (`startsProcess`: wire `acp`, the probe starts
 * the agent's process); one provider has that wire (harness-ui/src/provider-registry.mjs), and a test holds this list to the
 * registry (test/tui/review-062c-badge-nits.test.ts).
 */
export const PROVIDERS_NEVER_CHECKED:ReadonlySet<string>=new Set(['esterno']);

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
 | {ready:false;code:'PROVIDER_NOT_CHOSEN'|'MODEL_NOT_CHOSEN'|'PROVIDER_KEY_MISSING'|'PROVIDER_ADDRESS_REQUIRED'|'PROVIDER_SIGN_IN_REQUIRED'|'PROVIDER_KEY_BENCHED'|'PROVIDER_AUTH_FAILED'|'PROVIDER_NOT_CONFIGURED'|'PROVIDER_ENDPOINT_INVALID'|'PROVIDER_UNREACHABLE'|'PROVIDER_HEALTH_ERROR';provider:string|null;message:string};

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
  /** Z.AI (14/10/2026): one of its four addresses (provider/zai-addresses.ts), chosen by the person before a key is sent. */
  chooseProviderAddress(id:string,endpoint:string):Promise<void>;
  readiness(model:string):Promise<TuiReadiness>;
  /** C1R: the provider's readiness as the local snapshot holds it — synchronous, no network, a declared «unverified» when nothing is known. */
  providerState?(id:string):TuiProviderStateReport|null;
  /** C1R: stale-while-revalidate — a fresh snapshot that VOUCHES («verified») answers at once with no probe; a stale or missing
   *  one, and a «not verified» this start has not checked yet, probes ONCE, bounded by the budget, and persists the answer for the
   *  next resume. The boot never awaits it. */
  refreshProviderState?(id:string):Promise<TuiProviderStateReport|null>;
  /** Review of 0.6.2 (13/10/2026, B2): called with the provider's id when what the check knew was reset by a change of its key or
   *  sign-in (set, removed, an environment key answered, a sign-out) — the screen reads the row again and checks again. Returns
   *  the unsubscribe. Owner 14/10/2026: also when another process changed what the snapshot file holds of `id` (a key removed in a
   *  second terminal), with the cause `file` — that is read, not checked again. */
  onProviderStateChanged?(listener:(id:string,cause?:'file')=>void):()=>void;
  /** Gate red of 13/10/2026 (s52, «TALOS did not exit 10 s after Ctrl+C Ctrl+C»): ends every background check still in flight, and
   *  nothing of them is written. The screen calls it as it leaves: a request nobody waits for must not keep the process alive. */
  stopProviderChecks?():void;
  /** P21: OpenRouter sign-in in the browser (or a pasted code); absent where the kernel's PKCE module is not reachable. */
  startOpenRouterLogin?(input?:{paste?:boolean}):Promise<OpenRouterLogin>;
  /** «Continue with ChatGPT» (13/10/2026): the person's ChatGPT plan as a provider. Absent on a composition that has no plan handle. */
  chatgpt?:TuiChatgpt;
}
const CHATGPT_PROVIDER='chatgpt';
const CHATGPT_USAGE_URL='https://chatgpt.com/settings/usage';
export type TuiChatgptLogin={url:string;expiresInMs:number;opened:boolean;remote:boolean;outcome:Promise<ChatgptSignInOutcome>;cancel():void};
export type TuiChatgpt={
  /** What a screen may know (never a token); null where the plan cannot be connected (no keyring). */
  state():Promise<ChatgptPlanState|null>;
  /** Opens a sign-in in the system browser and waits on the loopback. Already signed in without the plan: this one asks for the plan. */
  startLogin(input?:{open?:(url:string)=>boolean}):Promise<TuiChatgptLogin>;
  signOut():Promise<{signedOut:boolean;revoked:boolean}>;
  usage():ReturnType<ChatgptPlan['usage']>;
  /** Replaces the system browser opener (tests; a host with its own). */
  openBrowser?:(url:string)=>boolean;
};

export type TuiCatalogDeps={
  openRouterLogin?:(input?:{paste?:boolean})=>Promise<OpenRouterLogin>;
  /** The ChatGPT plan of this profile, opened when first needed (`provider/chatgpt-plan.ts`). */
  chatgpt?:ChatgptPlanHandle;
  publicProviders:()=>any[];
  registry:Record<string,any>;
  runtimeFor:(id:string)=>any;
  /** ⛔ The key usable NOW (the store's `getKey`): a benched key is not returned, so it does not make a provider usable. */
  keyFor:(id:string)=>string|null;
  setKey:(id:string,secret:string)=>void;
  /** The person's address for a provider (the store's `setRuntime`, which marks it chosen); 14/10/2026, Z.AI. */
  setEndpoint?:(id:string,endpoint:string)=>void;
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
  /** C1R: the snapshot file the resume reads; absent → the revalidation stays in memory only. */
  providerStateFile?:string;
  providerStateTtlMs?:number;
  providerStateBudgetMs?:number;
  /** How often the snapshot file is looked at while a screen listens (a stat, no read unless it changed); 0 = never. */
  providerStateWatchMs?:number;
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
/*
 * R4 Q-R4-10 (gate E10): the models a LOCAL engine has installed, read by this CLI. The kernel's direct catalogue leaves local
 * engines out, so before R4 the model picker for Ollama said "could not be reached" while Ollama was running. The registry
 * declares where each engine lists its models (`catalogo: {fonte:'runtime-locale', forma, percorso}`); the rows are read the way
 * the kernel's own local runtime reads them (`harness-ui/src/openai-compatible-runtime.mjs`, normalizeOllamaModel and
 * normalizeLmModel). No key is sent, a redirect is refused, the answer is capped and the wait is short: it is this computer.
 */
const LOCAL_LIST_TIMEOUT_MS=3_000;
const LOCAL_LIST_MAX_BYTES=4*1024*1024;
type LocalCatalog={forma:'ollama-tags'|'lmstudio-models';percorso:string};
type LocalList={kind:'ok';rows:TuiModel[]}|{kind:'down'|'unreadable';address:string};
function localCatalogOf(record:any):LocalCatalog|null{
  const catalog=record?.catalogo;
  return catalog?.fonte==='runtime-locale'&&(catalog.forma==='ollama-tags'||catalog.forma==='lmstudio-models')&&typeof catalog.percorso==='string'&&catalog.percorso.startsWith('/')?{forma:catalog.forma,percorso:catalog.percorso}:null;
}
/* The engine's own root: an address saved for its OpenAI port (`…/v1`) lists models at the root, as the engines document. */
function engineRoot(endpoint:string){return endpoint.trim().replace(/\/+$/u,'').replace(/\/v1$/u,'');}
/* The address as the person reads it: scheme, host and path, never a user name or password. */
function shownAddress(root:string){try{const url=new URL(root);return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/u,'')}`;}catch{return root;}}
function ollamaRows(body:any):any[]|null{
  if(!Array.isArray(body?.models))return null;
  return body.models.flatMap((raw:any)=>{
    const id=typeof raw?.name==='string'&&raw.name.trim()?raw.name:'';if(!id)return[];
    const details=raw.details??{};const families=Array.isArray(details.families)?details.families:null;
    return[{id,name:id,
      ...(Number.isSafeInteger(details.context_length)&&details.context_length>0?{contextLength:details.context_length}:{}),
      ...(families?{inputModalities:families.some((family:unknown)=>/(?:clip|vision|llava)/iu.test(String(family)))?['text','image']:['text']}:{})}];
  });
}
function lmstudioRows(body:any):any[]|null{
  if(!Array.isArray(body?.models))return null;
  return body.models.flatMap((raw:any)=>{
    if(raw?.type!=='llm'||typeof raw.key!=='string'||raw.key.trim()==='')return[];
    const caps=raw.capabilities??{};const allowed=Array.isArray(caps.reasoning?.allowed_options)?caps.reasoning.allowed_options:[];
    return[{id:raw.key,name:typeof raw.display_name==='string'&&raw.display_name?raw.display_name:raw.key,
      ...(Number.isSafeInteger(raw.max_context_length)&&raw.max_context_length>0?{contextLength:raw.max_context_length}:{}),
      ...(typeof caps.trained_for_tool_use==='boolean'?{toolCalling:caps.trained_for_tool_use}:{}),
      ...(typeof caps.vision==='boolean'?{inputModalities:caps.vision?['text','image']:['text']}:{}),
      reasoning:allowed.length>0,...(allowed.length?{reasoningEfforts:allowed}:{})}];
  });
}
/* R4 Q-R4-16 (a): the probe's detail reaches the screen (the provider list falls back to it) in English: the kernel's sentence
   by its pinned template, an English detail as it is, and an Italian sentence no template matches not at all. */
function probeDetailText(detail:unknown,label:string):string{
  const text=String(detail??'');
  return kernelProbeDetail(text,{label})??(looksItalian(text)?'':text);
}
/* Reads at most `cap` bytes of a body; null when it is longer (the rest is not read). */
async function readCapped(response:Response,cap:number):Promise<string|null>{
  if(!response.body)return'';
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>cap)return null;chunks.push(value);}
  }finally{await reader.cancel().catch(()=>{});}
  return new TextDecoder().decode(Buffer.concat(chunks));
}
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
  /* R2 (E1): the one bench-cause table, in the dictionary through `provider/health.ts`. */
  const cause=benchCauseText(first?.causa);
  return{cause,until:Number.isFinite(first?.inPanchinaFino)?Number(first.inPanchinaFino):null,keys:Math.max(1,pool.length)};
}
/* `benchClock` and `benchedKeyText` live in `provider/health.ts` since R0 (one benched-key sentence for every path); re-exported here. */
export {benchClock,benchedKeyText} from '../provider/health.ts';
/**
 * The refusal of a send whose provider has no key usable now: missing, or stored and benched.
 * R2 (E8 / Q-R2-7): `provider` is the provider id (a label is still understood, for callers that only hold a row's label); a
 * missing key is the one sentence of `missingKeyText`, the same as `-p`, `provider test` and `doctor`.
 */
export function unusableKeyRefusal(provider:string,bench:TuiKeyBench|null,now:number=Date.now()):{code:'PROVIDER_KEY_MISSING'|'PROVIDER_KEY_BENCHED';message:string}{
  if(!bench)return{code:'PROVIDER_KEY_MISSING',message:missingKeyText(provider)};
  return{code:'PROVIDER_KEY_BENCHED',message:benchedKeyRefusal(providerLabel(provider),bench,now)};
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
  const labelOf=(id:string)=>providerLabelText(id,String(deps.registry[id]?.etichetta??id));
  const signInProvider=(id:string)=>deps.registry[id]?.auth?.tipo==='oauth-pkce';
  /* A session another TALOS stored since this one started is read before the plan's state is said (one keyring read otherwise). */
  const plan=async():Promise<ChatgptPlan|null>=>{const handle=deps.chatgpt;if(!handle)return null;if(handle.loaded())return handle.loaded();if(!handle.stored())return null;try{return await handle.load();}catch{return null;}};
  const unavailable=()=>Object.assign(new Error(t('key.chatgpt.tool.unavailable')),{code:'CHATGPT_UNAVAILABLE'});
  const chatgpt:TuiChatgpt|null=deps.chatgpt?{
    async state(){if(!deps.chatgpt!.available)return null;const opened=await plan();return opened?opened.state():{connected:false,email:null,planEnabled:false,signingIn:false,usageUrl:CHATGPT_USAGE_URL};},
    async startLogin(input={}){
      if(!deps.chatgpt!.available)throw unavailable();
      let opened:ChatgptPlan|null;try{opened=await deps.chatgpt!.load();}catch{opened=null;}
      if(!opened)throw unavailable();
      const before=opened.state();
      /* signed in, plan not granted: the next sign-in is the one that asks for it (the kernel sends `prompt=consent` only then) */
      const started=await opened.start({consent:before.connected&&!before.planEnabled});
      const {isRemoteSession,openInBrowser}=await import('../provider/openrouter-login.ts');
      const remote=isRemoteSession();
      /* the loopback is on THIS machine: over SSH a browser elsewhere could not come back to it, so nothing is opened and it is said */
      const openedBrowser=remote?false:(input.open??chatgpt!.openBrowser??openInBrowser)(started.url);
      /* review of 0.6.2 (B2): a sign-in that ends changes whose plan the check speaks of, like a key that is set — what was known is reset and the screen checks again */
      const outcome=started.outcome.then(result=>{deps.controlPlane?.invalidate(CHATGPT_PROVIDER);if(result?.ok===true)credentialChanged(CHATGPT_PROVIDER);return result;});
      /* its own cancel (finding 9, 13/10/2026): a window that closes late must not cancel a newer sign-in */
      return{url:started.url,expiresInMs:started.expiresInMs,opened:openedBrowser,remote,outcome,cancel:()=>started.cancel()};
    },
    async signOut(){
      const opened=await plan();
      if(!opened||!opened.state().connected)return{signedOut:false,revoked:false};
      /* what a sign-out leaves behind is said in ONE place, below (`onSignedOut`): the model's own disconnect leaves the same */
      const done=await deps.chatgpt!.signOut();
      return{signedOut:true,revoked:done?.revoked===true};
    },
    usage:()=>deps.chatgpt!.loaded()?.usage()??null,
  }:null;
  /* Finding 12 (13/10/2026): after ANY sign-out — this catalog's, the command's, the model's `chatgpt_account` disconnect — what a
     test learnt is forgotten and the snapshot the next resume reads says "unverified", not "available". */
  deps.chatgpt?.onSignedOut(()=>{
    try{deps.controlPlane?.invalidate(CHATGPT_PROVIDER);}catch{/* a registry without the plan */}
    credentialChanged(CHATGPT_PROVIDER);
  });
  const addressFields=(id:string):{addressChosen?:boolean;address?:string|null}=>{
    if(id!==ZAI_PROVIDER)return{};
    let runtime:any=null;try{runtime=deps.runtimeFor(id);}catch{runtime=null;}
    const chosen=zaiAddressChosen(runtime);
    return{addressChosen:chosen,address:chosen?zaiAddressOf(runtime?.endpoint)?.label??String(runtime?.endpoint??''):null};
  };
  const listProviders=async():Promise<TuiProvider[]>=>{
    if(deps.chatgpt)await plan();
    if(deps.controlPlane){
      return deps.controlPlane.list().map(profile=>({
        id:profile.id,label:profile.label,description:profile.description,
        configured:profile.auth.required?profile.auth.usable:profile.id==='esterno'?profile.execution==='configurato':true,
        requiresKey:profile.auth.required,authType:profile.auth.type,local:profile.local,cloud:profile.cloud,
        endpointHost:profile.endpoint.host,supportsEndpoint:profile.endpoint.supportsCustom,supportsOAuth:profile.supportsOAuth,
        execution:profile.execution,keySource:profile.auth.source,environmentVariable:profile.auth.environmentVariable,
        benched:profile.cooldown.active?{cause:profile.cooldown.cause,until:profile.cooldown.until,keys:Math.max(1,profile.cooldown.keys)}:null,
        ...addressFields(profile.id),
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
        id:String(record.id),label:providerLabelText(String(record.id),String(row.label??record.etichetta??record.id)),description:providerDescriptionText(String(record.id),String(record.descrizione??'')),configured,requiresKey,
        authType:String(record.auth?.tipo??(requiresKey?'key':'none')),local,cloud:Boolean(record.cloud),endpointHost,
        supportsEndpoint:row.supportsEndpoint===true||record.indirizzoModificabile===true,supportsOAuth:row.supportsOAuth===true||Boolean(record.oauth),execution,
        keySource,environmentVariable:environment?.variable??null,benched,
        ...addressFields(String(record.id)),
      };
    });
  };

  const enrichRegistryReasoning=(provider:string,row:TuiModel):TuiModel=>{
    const bare=row.id.startsWith(`${provider}:`)?row.id.slice(provider.length+1):row.id;
    const record=deps.registry[provider]??{};
    const compatible=record?.richiestaCompatibile?.modelli?.[bare];
    const known=Array.isArray(record?.modelliNoti)?record.modelliNoti.find((entry:any)=>String(entry?.id??'')===bare):null;
    /* F-B-002 (stress test, 09/10/2026): a port that declares its levels ONCE for the provider (zai-anthropic,
       docs.z.ai/devpack/latest-model) affirms them for the models that same record lists, never for an unknown id. */
    const listed=Array.isArray(record?.modelliDiRiserva)&&record.modelliDiRiserva.some((entry:any)=>String(entry?.id??'')===bare);
    const portLevels=listed?record?.ragionamento?.livelli:undefined;
    const observed=collectReasoningEfforts(compatible?.livelliRagionamento,known?.ragionamento?.livelli)??collectReasoningEfforts(portLevels);
    if(observed===null)return row;
    const fromPort=collectReasoningEfforts(compatible?.livelliRagionamento,known?.ragionamento?.livelli)===null;
    const evidenceUrl=fromPort&&typeof record?.ragionamento?.fonte==='string'?record.ragionamento.fonte:typeof record?.richiestaCompatibile?.fonte==='string'?record.richiestaCompatibile.fonte:typeof known?.fonte==='string'?known.fonte:null;
    const evidenceDate=fromPort&&typeof record?.ragionamento?.data==='string'?record.ragionamento.data:typeof record?.richiestaCompatibile?.data==='string'?record.richiestaCompatibile.data:typeof known?.data==='string'?known.data:null;
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

  async function localModels(provider:string,catalog:LocalCatalog,signal?:AbortSignal):Promise<LocalList>{
    const root=engineRoot(endpointOf(provider));const address=shownAddress(root);
    if(!/^https?:\/\//iu.test(root)||!deps.fetchImpl)return{kind:'down',address};
    const timeout=AbortSignal.timeout(LOCAL_LIST_TIMEOUT_MS);
    let response:Response;
    try{response=await deps.fetchImpl(root+catalog.percorso,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout});}
    catch(error){if(signal?.aborted)throw error;return{kind:isRefusedRedirect(error)?'unreadable':'down',address};}
    if(!response.ok){try{await response.body?.cancel();}catch{/* not read */}return{kind:'unreadable',address};}
    let text:string|null;
    try{text=await readCapped(response,LOCAL_LIST_MAX_BYTES);}catch(error){if(signal?.aborted)throw error;return{kind:'unreadable',address};}
    let body:unknown=null;try{body=text===null?null:JSON.parse(text);}catch{body=null;}
    const raw=catalog.forma==='ollama-tags'?ollamaRows(body):lmstudioRows(body);
    if(!raw)return{kind:'unreadable',address};
    return{kind:'ok',rows:normalizeModels(raw,provider,'live')};
  }
  async function liveModels(provider:string,signal?:AbortSignal):Promise<TuiModel[]|null>{
    if(signInProvider(provider)){
      /* the account says which models the plan has: asked with the plan's token, and only when somebody is signed in */
      /* `providerModels` already answered for nobody signed in; a plan that cannot be opened has no list either */
      const opened=await plan();if(!opened)return null;
      /* second review of 0.6.2 (13/10/2026, S4): the sign-in this answer speaks of is the one in use when the list was ASKED. A
         sign-out while it was away (the account's answer landing after it) wrote «available» for a session that was gone; it is
         written through the same guard as every other observation now. The picker's signal travels with the request (B1). */
      const epoch=epochOf(provider);
      const rows=await opened.models({reload:true,...(signal?{signal}:{})});
      rememberProviderModelRows(provider,rows);
      /* the account just answered with the plan's token: the provider accepted the credential (N3: stated, as `signInProbe` states it) */
      rememberObservedState(provider,{state:'available',verified:true,checkedAt:Date.now(),latencyMs:null},epoch);
      return normalizeModels(rows,provider,'live');
    }
    const own=PUBLIC_MODEL_LIST[provider];
    if(own){
      if(!deps.fetchImpl)throw Object.assign(new Error('PROVIDER_CATALOG_UNAVAILABLE'),{code:'PROVIDER_CATALOG_UNAVAILABLE'});
      let response:Response;
      try{response=await deps.fetchImpl(joinPath(endpointOf(provider),own.path),{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:timeoutSignal(signal)});}
      catch(error){if((error as any)?.name==='AbortError'&&signal?.aborted)throw error;throw Object.assign(new Error('CATALOG_UNREACHABLE'),{code:'CATALOG_UNREACHABLE'});}
      if(!response.ok)throw Object.assign(new Error('CATALOG_UPSTREAM_ERROR'),{code:'CATALOG_UPSTREAM_ERROR',httpStatus:response.status});
      const body:any=await response.json().catch(()=>null);
      if(!Array.isArray(body?.data))throw Object.assign(new Error('CATALOG_UPSTREAM_ERROR'),{code:'CATALOG_UPSTREAM_ERROR'});
      rememberProviderModelRows(provider,body.data);
      return normalizeModels(body.data,provider,'live');
    }
    const remote=await deps.createProbe(signal).elencaModelli(provider);
    const source=catalogSourceFromKernel(remote?.fonte,{successfulCatalogBoundary:true});
    if(source==='documented'||source==='configured')return null;
    rememberProviderModelRows(provider,remote?.modelli??[]);
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
    /* 14/10/2026 (owner): a Z.AI key is sent only to the address the person chose — the key test is a request with the key */
    if(id===ZAI_PROVIDER&&!zaiAddressChosen(deps.runtimeFor(id)))throw Object.assign(new Error(t('key.zai.addressRequired')),{code:'PROVIDER_ADDRESS_REQUIRED',provider:id});
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

  /*
   * C1R — provider readiness out of the resume's critical path (RICERCA-5x5x5x5-OTTIMIZZAZIONE-CLI-2026-10-05, cure C1R;
   * RED R2, R3, R4). The session reads `providerState` (synchronous, from the snapshot on disk, read once and cached);
   * `refreshProviderState` revalidates stale-while-revalidate: a fresh snapshot answers with NO probe, a stale or missing
   * one probes ONCE within an explicit budget and persists the answer — and the boot never awaits it. No key material
   * ever reaches the snapshot: the probe answer is reduced by `providerStateFromProbe` to four fields.
   *
   * Review of 0.6.2 (13/10/2026), what the badge on the real screen needed and the cache did not do:
   *   B3  only an entry that VOUCHES (`providerStateVouches`: reached, and the key not left unjudged) is kept for its hour. A fresh
   *       «not verified» or «unavailable» read from the file is checked again, once per start (`checkedThisStart`): a key added
   *       since, a provider that came back, were otherwise called «not verified» for an hour.
   *   B2  a change of the key (set, removed, an environment key answered, a sign-in or sign-out) resets what was known to
   *       «unverified», opens the next check, and tells whoever listens. `credentialEpochs` keeps the answer of a check that was
   *       sent BEFORE the change from being written after it: it speaks of the key that was there then.
   */
  const stateFile=deps.providerStateFile??null;
  const stateTtlMs=deps.providerStateTtlMs??DEFAULT_PROVIDER_STATE_TTL_MS;
  /* An explicit budget for the revalidation itself: a provider that never answers cannot hold the refresh past it. */
  const stateBudgetMs=deps.providerStateBudgetMs??2_000;
  const stateEntries=new Map<string,ProviderStateEntry>();
  let stateRead=false;
  const checkedThisStart=new Set<string>();
  const credentialEpochs=new Map<string,number>();
  const epochOf=(id:string)=>credentialEpochs.get(id)??0;
  const stateListeners=new Set<(id:string,cause?:'file')=>void>();
  /*
   * Gate red of 13/10/2026 on 1de5f84af (acceptance s52: the screen was gone and the process stayed, then «one TALOS at a time»).
   * Measured the same day on the built CLI with a provider that accepts the connection and never answers: Ctrl+C Ctrl+C right
   * after the composer -> the process ended 31 s later, one connection open; with the check not made -> 1.5 s, none. The check's
   * request carried no signal, so the budget below stopped WAITING for it and nothing ever stopped IT: the process lived until the
   * kernel probe's own timeout. (Not the early raw mode of run.ts, which was the suspect.) Every check has its own controller now;
   * `stopProviderChecks` ends them all when the screen leaves.
   */
  const stateChecks=new Set<AbortController>();
  /*
   * Second review of 0.6.2 (13/10/2026), what the first cures left open in this cache:
   *   S1  the file was read ONCE and every write put the whole in-memory map back: a key removed in another terminal came back as
   *       «verified» at the open screen's next write of any provider. The file is read again before each write and before each
   *       check (`adoptSnapshot`), and what it holds stands for every provider but the one being written.
   *   S2  the external agent's probe starts its process (provider-probe.mjs: `connettiAgenteAcp`, no signal, the agent's own
   *       timeout): no background check is made for it and its row says nothing (`startsProcess`).
   *   S3  the four public-catalogue providers (DeepInfra, Novita, Ollama Cloud, Hugging Face): their key is judged only by the
   *       key test's one-token generation, which spends credit and is therefore never sent in the background. A key that passed
   *       it reads «verified» for its hour; what a reached catalogue says meanwhile (a `/provider` test) adds nothing against
   *       that and is not written over it (`leavesKeyUnjudged`). After the hour nobody re-judged the key: «not verified».
   *   N3  fail-closed again: «reached» with NO verdict on the credential, from a provider that needs one, is «not verified»
   *       (`failClosed`). A keyless local engine has nothing to judge and keeps reading «verified».
   *   N5  an answer that lands after the budget tells the screen, so the row does not stay «not verified» for the session.
   */
  const startsProcess=(id:string)=>deps.registry[id]?.wire==='acp';
  const needsCredential=(id:string)=>signInProvider(id)||deps.registry[id]?.chiaveObbligatoria===true;
  const failClosed=<T extends ProviderStateEntry|null>(id:string,entry:T):T=>entry&&entry.state==='available'&&entry.verified===null&&needsCredential(id)?{...entry,state:'unverified'}:entry;
  const leavesKeyUnjudged=(entry:ProviderStateEntry)=>entry.state==='unverified'&&entry.verified===false;
  const tellListeners=(id:string,cause?:'file'):void=>{for(const listener of [...stateListeners]){try{if(cause)listener(id,cause);else listener(id);}catch{/* a listener's own failure */}}};
  /*
   * Third review of 0.6.2 (13/10/2026, S2): an entry speaks of the key that was in use when the check was made, by whoever made it.
   * Nothing asked whether THIS process has one — a key that went away by a door that did not reset the file (an environment key
   * not set in this shell, a key removed in the system's credential manager or by an older TALOS, a reset whose write failed)
   * kept «verified» for its hour, and no check was made. Here an entry does not vouch when the provider needs a credential and
   * none is usable in this process: no key in use (`keyFor`, the key usable now), nobody signed in. Only this reading changes:
   * the file is left as it is (another terminal, where the key is set, is right to trust it), and nothing is written.
   * A sign-in whose session is stored and not read yet counts as present (its own check says the rest); a composition that gave
   * no plan handle cannot be asked, and is left to its control plane's probe as before.
   */
  const hasCredential=(id:string):boolean=>{
    if(!needsCredential(id))return true;
    if(signInProvider(id)){
      const handle=deps.chatgpt;
      if(!handle||id!==CHATGPT_PROVIDER||typeof handle.signedIn!=='function')return true;
      try{
        if(handle.available===false)return false;
        const known=handle.signedIn();
        return known?known.connected===true:handle.stored();
      }catch{return false;}
    }
    try{return Boolean(deps.keyFor(id));}catch{return false;}
  };
  const localView=<T extends ProviderStateEntry|null>(id:string,read:T):T=>{
    const entry=failClosed(id,read);
    return entry&&providerStateVouches(entry)&&!hasCredential(id)?{...entry,state:'unverified',verified:null}:entry;
  };
  const reportOf=(id:string,read:ProviderStateEntry|null,now:number):TuiProviderStateReport=>{
    const entry=localView(id,read);
    const fresh=isProviderStateFresh(entry,now,stateTtlMs);
    return{id,state:entry?.state??'unverified',verified:entry?.verified??null,checkedAt:entry?.checkedAt??null,
      ageMs:entry&&Number.isFinite(entry.checkedAt)?now-entry.checkedAt:null,fresh,
      vouchesUntil:entry&&fresh&&providerStateVouches(entry)?entry.checkedAt+stateTtlMs:null};
  };
  /* S1: what the file holds NOW is what is known, for every provider: another TALOS (a second terminal, `talos provider
     remove-key`) may have written it since this one read it. The reading stays fail-closed (a file that is missing or cannot be
     read brings nothing, and nothing is invented); an entry of this process newer than the file's — a write that failed — stays. */
  const adoptSnapshot=():void=>{
    if(!stateFile)return;
    stateRead=true;
    const snapshot=readProviderStateSnapshot({file:stateFile});
    for(const [id,entry] of Object.entries(snapshot.providers)){
      const mine=stateEntries.get(id);
      if(!mine||mine.checkedAt<=entry.checkedAt)stateEntries.set(id,entry);
    }
  };
  const ensureStateSnapshot=():void=>{if(!stateRead)adoptSnapshot();};
  /*
   * Owner 14/10/2026 («the open screen updates by itself within a few seconds»). A key removed by another process (a second
   * terminal's `talos provider remove-key`, another screen) resets its entry in the file, and this screen read the file only when it
   * wrote or checked: «kimi: verified» stayed until something happened here. While somebody listens, the file is looked at every
   * `providerStateWatchMs` (1 s): `fs.watchFile`, a stat by PATH — the snapshot is replaced by a rename (temp file + rename), which an
   * inode-bound `fs.watch` loses on Linux and macOS and reports unevenly on Windows; one stat a second costs nothing and no network.
   * `persistent:false`: it never holds the process. It stops when the last listener leaves and with `stopProviderChecks`.
   * An entry that changed is told with the cause `file`: the screen reads its row again and checks NOTHING — the file says what is
   * known, and a check here would ask with the key this process loaded at its start. What changed is measured against what the
   * file held when last looked at (`fileSeen`), not against this process's memory: an entry another path of this process adopted
   * silently meanwhile (`adoptSnapshot` before a write) is still told. A write of this process updates `fileSeen` for the entry it
   * wrote, so its own write tells nobody.
   */
  const stateWatchMs=deps.providerStateWatchMs??1_000;
  let watching:((current:Stats,previous:Stats)=>void)|null=null;
  let fileSeen:Map<string,ProviderStateEntry>|null=null;
  const sameEntry=(a:ProviderStateEntry|undefined,b:ProviderStateEntry|undefined)=>a===b||Boolean(a&&b&&a.state===b.state&&a.verified===b.verified&&a.checkedAt===b.checkedAt&&a.latencyMs===b.latencyMs);
  const readChangedFile=():void=>{
    if(!stateFile||!fileSeen)return;
    const now=readProviderStateSnapshot({file:stateFile}).providers;
    const seen=fileSeen;fileSeen=new Map(Object.entries(now));
    const changed=Object.keys(now).filter(id=>!sameEntry(seen.get(id),now[id]));
    if(!changed.length)return;
    adoptSnapshot();
    for(const id of changed)tellListeners(id,'file');
  };
  const startWatch=():void=>{
    if(watching||!stateFile||!(stateWatchMs>0))return;
    ensureStateSnapshot();
    fileSeen=new Map(Object.entries(readProviderStateSnapshot({file:stateFile}).providers));
    const onStat=(current:Stats,previous:Stats)=>{
      if(current.mtimeMs===previous.mtimeMs&&current.size===previous.size&&current.ino===previous.ino)return;
      try{readChangedFile();}catch{/* a file that cannot be read brings nothing (readProviderStateSnapshot is fail-closed) */}
    };
    try{watchFile(stateFile,{persistent:false,interval:stateWatchMs},onStat);watching=onStat;}catch{watching=null;fileSeen=null;}
  };
  const stopWatch=():void=>{
    const onStat=watching;watching=null;fileSeen=null;
    if(onStat&&stateFile){try{unwatchFile(stateFile,onStat);}catch{/* already gone */}}
  };
  /** True when the entry was written (it is then what is known of `id`). */
  const rememberProbedState=(id:string,entry:ProviderStateEntry|null,{reset=false}:{reset?:boolean}={}):boolean=>{
    if(!entry)return false;
    /* the file is read before anything is written back to it: a write made before any reading (a `talos provider test`, a key
       change, a sign-out, in a process that never drew the status row) dropped every other provider's entry (review of 0.6.2);
       and it is read AGAIN at every write (S1), so only the entry being written is this process's word */
    adoptSnapshot();
    /* Review V6: two concurrent refreshes can land out of order — an older observation must never
       overwrite a newer one (the newer one is the fresher verdict for the badge). A reset after a key change is not an
       observation: it always replaces what was known (a `checkedAt` ahead of this clock must not keep the old verdict). */
    const current=stateEntries.get(id)??null;
    if(!reset&&current&&current.checkedAt>entry.checkedAt)return false;
    /* S3: «reached, the key not judged» says nothing against a key the provider accepted within the hour */
    if(!reset&&leavesKeyUnjudged(entry)&&current?.state==='available'&&current.verified===true&&isProviderStateFresh(current,Date.now(),stateTtlMs))return false;
    stateEntries.set(id,entry);
    if(!stateFile)return true;
    /* Atomic (temp file + rename): the other providers' entries are the ones just read from the file. */
    if(writeProviderStateSnapshot({file:stateFile,now:Date.now(),providers:Object.fromEntries(stateEntries)}))fileSeen?.set(id,entry);
    return true;
  };
  /* B2 (see above). `known`: what the change itself proved — a key that passed its test and was saved IS the check, so the row
     reads «verified» with no second request; anything else is «unverified» until the next check. The listeners are told last, and
     one that throws stops nothing. */
  const credentialChanged=(id:string,known:ProviderStateEntry|null=null):void=>{
    credentialEpochs.set(id,epochOf(id)+1);
    checkedThisStart.delete(id);
    rememberProbedState(id,known??{state:'unverified',verified:null,checkedAt:Date.now(),latencyMs:null},{reset:true});
    tellListeners(id);
  };
  /*
   * Review of 0.6.2 (13/10/2026, B1, found while curing it): a provider of `AUTHENTICATED_KEY_CHECK` (OpenRouter) lists its models
   * to anyone, and the kernel registry does not mark that list public — its probe answers `credenzialeVerificata:true` for a key
   * the provider would refuse, and the row read «openrouter: verified». The check asks what the key test asks: the endpoint
   * that needs the key (a GET, no tokens), with the key in use. No key: nothing is sent. 2xx: accepted. 401/403: the provider
   * judged the key and refused it. Anything else (429, 5xx, a redirect, no answer): not reached, nobody judged.
   * A test by hand (`probeProvider`) still reads the public list through the kernel, so for these providers its answer is not
   * written over what this check knows (`rememberTestedState`). ⛔ The kernel side belongs to harness-ui: mark OpenRouter's probe
   * `catalogoPubblico`, or point it at `/models/user`.
   */
  const checksKeyItself=(id:string)=>Boolean(AUTHENTICATED_KEY_CHECK[id]&&deps.fetchImpl);
  const authenticatedState=async(id:string,signal:AbortSignal):Promise<ProviderStateEntry|null>=>{
    const at=(state:ProviderStateValue,verified:boolean|null,latencyMs:number|null=null):ProviderStateEntry=>({state,verified,checkedAt:Date.now(),latencyMs});
    let key:string|null=null;try{key=deps.keyFor(id);}catch{key=null;}
    if(!key)return at('unverified',null);
    const started=Date.now();
    let response:Response;
    try{response=await deps.fetchImpl!(joinPath(endpointOf(id),AUTHENTICATED_KEY_CHECK[id]!.path),{method:'GET',headers:{Accept:'application/json',Authorization:`Bearer ${key}`},redirect:'error',signal:timeoutSignal(signal)});}
    catch{return signal.aborted?null:at('unavailable',null);}
    finally{key=null;}
    try{await response.body?.cancel();}catch{/* the body is never read: it could echo the request */}
    const latency=Date.now()-started;
    if(response.status>=200&&response.status<300)return at('available',true,latency);
    return at('unavailable',response.status===401||response.status===403?false:null,latency);
  };
  const rememberTestedState=(id:string,entry:ProviderStateEntry|null,epoch:number):void=>{
    if(checksKeyItself(id))return;
    rememberObservedState(id,entry,epoch);checkedThisStart.add(id);
  };
  /* An observation is written only if the key it speaks of is still the one in use (B2). */
  const rememberObservedState=(id:string,entry:ProviderStateEntry|null,epoch:number):boolean=>epochOf(id)===epoch&&rememberProbedState(id,failClosed(id,entry));
  const probeProviderState=async(id:string,epoch:number):Promise<ProviderStateEntry|null>=>{
    /* a sign-in provider is tested by the control plane's own probe (the kernel's does not know it); with nobody signed in that
       probe sends nothing (talos-composition.ts `signInProbe`). Review of 0.6.2: it was awaited OUTSIDE the budget below, so a
       plan whose list was slow held «checking…» until the screen gave up; it races the same budget now, and lands late the same way. */
    const controlPlane=deps.controlPlane;
    if(signInProvider(id)&&!controlPlane)return null;
    const check=new AbortController();stateChecks.add(check);
    /* Third review of 0.6.2 (S5): the answer is stamped with the moment the check was ASKED — it speaks of the key in use then.
       Stamped when it landed, the late answer of this terminal was «newer» than the reset another terminal wrote meanwhile (a
       key removed there), and brought «verified» back over it; asked before the reset, it now loses the comparison in
       `rememberProbedState`. In this process the epoch already drops it. */
    const asked=Date.now();
    const askedThen=(entry:ProviderStateEntry|null):ProviderStateEntry|null=>entry?{...entry,checkedAt:asked}:entry;
    let probePromise:Promise<ProviderStateEntry|null>;
    try{
      probePromise=signInProvider(id)
        ?Promise.resolve(controlPlane!.probe(id,check.signal)).then(profile=>providerStateFromHealth(profile.lastHealth,Date.now()))
        :checksKeyItself(id)?authenticatedState(id,check.signal)
        :Promise.resolve(deps.createProbe(check.signal).prova(id)).then(result=>providerStateFromProbe(result,Date.now()));
    }catch{stateChecks.delete(check);return null;}
    /* a check that was stopped has no answer: what the probe makes of its own abort («unreachable») is not an observation */
    const answered=probePromise.catch(()=>null).then(entry=>{stateChecks.delete(check);return check.signal.aborted?null:askedThen(failClosed(id,entry));});
    let timer:ReturnType<typeof setTimeout>|undefined;
    const BUDGET=Symbol('budget');
    const budget=new Promise<typeof BUDGET>(resolve=>{timer=setTimeout(()=>resolve(BUDGET),stateBudgetMs);});
    try{
      const settled=await Promise.race([answered,budget]);
      if(settled!==BUDGET)return settled;
      /* Review A4: the probe that lands after the budget still converges — it writes through for the
         next resume instead of re-paying a lost race on every boot (the 5-57 s providers of the dossier).
         The winning path's answer is written by `refreshProviderState`; the monotonic guard above makes
         the late write harmless if it lands after a newer observation, and the epoch drops it after a key change. */
      /* N5: and the screen is told — the row that gave up at the budget reads the answer now, not at the next start */
      void answered.then(late=>{if(late&&rememberObservedState(id,late,epoch))tellListeners(id);});
      return null;
    }finally{
      if(timer!==undefined)clearTimeout(timer);
    }
  };

  return{
    listProviders,
    async probeProvider(id,signal){
      const epoch=epochOf(id);
      if(deps.controlPlane){
        const profile=await deps.controlPlane.probe(id,signal);const health=profile.lastHealth;
        const decision=deps.controlPlane.readiness(id);
        const state:TuiProviderProbe['state']=health.state==='available'?'available':health.state==='unconfigured'?'unconfigured':health.state==='unknown'||health.state==='unprobeable'?'unknown':'unavailable';
        /* C1R write-through: a user-triggered probe IS a revalidation of the snapshot for the next resume. A test the person
           stopped is not one: what the probe makes of its own abort («unreachable») is not an observation. */
        if(!signal?.aborted)rememberTestedState(id,providerStateFromHealth(health,Date.now()),epoch);
        return{provider:id,state,detail:probeDetailText(health.detail,profile.label??labelOf(id)),latencyMs:health.latencyMs,remediation:profile.remediation,readinessCode:decision.ready?null:decision.code};
      }
      const result=await deps.createProbe(signal).prova(id);
      const state:TuiProviderProbe['state']=result?.esito==='collegato'?'available':result?.codice==='PROVIDER_KEY_MISSING'?'unconfigured':result?.esito==='non-provabile'||result?.esito==='non-sondabile'?'unknown':'unavailable';
      /* C1R write-through, legacy probe path: the same answer is reduced and persisted (never the `motivo` text). */
      if(!signal?.aborted)rememberTestedState(id,providerStateFromProbe(result,Date.now()),epoch);
      return{provider:id,state,detail:probeDetailText(result?.motivo??result?.esito,labelOf(id)),latencyMs:Number.isFinite(result?.millisecondi)?Number(result.millisecondi):null,remediation:null,readinessCode:null};
    },
    async listModels(input={}){
      if(input.provider&&input.refresh){const remote=await deps.createProbe(input.signal).elencaModelli(input.provider);const source=availabilityFromCatalog(remote?.fonte,true);return normalizeModels(remote?.modelli??[],input.provider,source).map(row=>enrichRegistryReasoning(input.provider!,row));}
      const providers=await listProviders();
      return (await Promise.all(providers.filter(p=>!input.provider||p.id===input.provider).map(p=>knownModels(p.id)))).flat();
    },
    async providerModels(provider,signal){
      if(!deps.registry[provider])throw Object.assign(new Error('PROVIDER_INVALID'),{code:'PROVIDER_INVALID'});
      const label=labelOf(provider);const known=await knownModels(provider);
      const local=localCatalogOf(deps.registry[provider]);
      if(local){
        /* R4 Q-R4-10: what the engine has installed; the models configured for it are kept, marked when it does not have them. */
        const result=await localModels(provider,local,signal);
        if(result.kind!=='ok'){
          const said=t(result.kind==='down'?'firstrun.models.down':'firstrun.models.unreadable',{label,address:result.address});
          return{provider,label,rows:known,verified:false,notice:known.length?`${said} ${t('firstrun.models.knownOnly')}`:said,engine:result.kind,listing:'engine-down'};
        }
        const rows=mergeModels(result.rows,known);const installed=result.rows.length;const missing=rows.filter(row=>!row.availabilityVerified).length;
        const said=installed?tn('firstrun.models.live',installed,{label}):t('firstrun.models.empty',{label});
        return{provider,label,rows,verified:missing===0,notice:missing?`${said} ${tn('firstrun.models.notInstalled',missing,{label})}`:said,listing:'live'};
      }
      if(signInProvider(provider)){
        const opened=await plan();const state=opened?.state()??null;
        if(!state?.connected)return{provider,label,rows:[],verified:false,notice:t('key.missing.signIn',{provider:label,id:provider}),listing:'signed-out'};
        if(!state.planEnabled)return{provider,label,rows:[],verified:false,notice:t('key.remedy.planNotEnabled',{provider:label,id:provider}),listing:'signed-out'};
      }
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
          return{provider,label,rows,verified,notice,listing:'live'};
        }
        return{provider,label,rows:known,verified:false,notice:`${label} did not return a live list; these are the models TALOS already knows. Not verified.`,
          /* `null` = this provider has no live list at all (the kernel answered from its documentation or from what is configured);
             a plan that cannot be opened has nobody signed in; an empty answer is a live list with nothing in it */
          listing:live?'live':signInProvider(provider)?'signed-out':'known-only'};
      }catch(error){
        if((error as any)?.name==='AbortError'&&signal?.aborted)throw error;
        return{provider,label,rows:known,verified:false,notice:`${label} could not be reached (${codeOf(error)}); these are the models TALOS already knows. Not verified.`,listing:'unreachable'};
      }
    },
    async selectModel(id,scope){if(scope!=='project-user')throw Object.assign(new Error('CONFIG_SCOPE_INVALID'),{code:'CONFIG_SCOPE_INVALID'});await deps.persistModel(id);},
    testProviderKey,
    keyTestNotice,
    ...(deps.openRouterLogin?{startOpenRouterLogin:(input?:{paste?:boolean})=>deps.openRouterLogin!(input)}:{}),
    ...(chatgpt?{chatgpt}:{}),
    async setProviderKey(id,secret,signal){
      if(signInProvider(id))throw Object.assign(new Error('PROVIDER_SIGN_IN_ONLY'),{code:'PROVIDER_SIGN_IN_ONLY',provider:id});
      const test=await testProviderKey(id,secret,signal);
      if(!test.passed)return{...test,saved:false};
      /* ⛔ A key that passed but could not be stored says so, by code only: store errors are never echoed as text. */
      try{deps.setKey(id,String(secret).trim());}
      catch(error){return{...test,saved:false,message:`${test.message} It could not be saved (${codeOf(error)}).`};}
      deps.controlPlane?.invalidate(id);
      /* review of 0.6.2 (B2, B3): the key in use is now the one that just passed its test — that IS the check. Remembered as
         verified (the only outcome that saves is `valid`: the provider accepted a request made with this key), so the row does
         not say «not verified» of a key accepted a moment ago, and the re-check the screen asks for costs no request. */
      credentialChanged(id,{state:'available',verified:true,checkedAt:Date.now(),latencyMs:null});
      return{...test,saved:true};
    },
    /* review of 0.6.2 (B2): what the check knew spoke of the key that is now gone (the row kept «verified» for up to an hour, here
       and at the next start) */
    async clearProviderKey(id){deps.clearKey(id);deps.controlPlane?.invalidate(id);credentialChanged(id);},
    async answerEnvironmentKey(id,answer){
      if(!deps.answerEnvironmentKey)throw Object.assign(new Error('PROVIDER_CONSENT_UNAVAILABLE'),{code:'PROVIDER_CONSENT_UNAVAILABLE'});
      deps.answerEnvironmentKey(id,answer);
      deps.controlPlane?.invalidate(id);
      /* an environment key approved or taken back changes the key in use like a saved one (B2) */
      credentialChanged(id);
    },
    async chosenProvider(){return deps.chosenProvider?.()??null;},
    async chooseProviderAddress(id,endpoint){
      const address=id===ZAI_PROVIDER?zaiAddressOf(endpoint):null;
      if(!address)throw Object.assign(new Error('PROVIDER_ADDRESS_INVALID'),{code:'PROVIDER_ADDRESS_INVALID',provider:id});
      if(!deps.setEndpoint)throw Object.assign(new Error('PROVIDER_STORE_UNAVAILABLE'),{code:'PROVIDER_STORE_UNAVAILABLE'});
      deps.setEndpoint(id,address.endpoint);deps.controlPlane?.invalidate(id);credentialChanged(id);
    },
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
      /* review of 0.6.4 (064b-4): a Z.AI turn with no address chosen is refused by every run (prontoFn): `talos doctor` and the screen
         say so instead of «ready» (after the key: the order prontoFn answers in) */
      const addressFirst=()=>provider===ZAI_PROVIDER&&!zaiAddressChosen(deps.runtimeFor(provider))?{ready:false as const,code:'PROVIDER_ADDRESS_REQUIRED' as const,provider,message:t('key.zai.addressRequired')}:null;
      if(deps.controlPlane){
        const decision=deps.controlPlane.readiness(provider);
        if(!decision.ready)return{ready:false,code:decision.code,provider,message:decision.message};
        return addressFirst()??{ready:true,provider,model};
      }
      /*
       * ⛔ Same predicate as `listProviders` (the key usable now), so the screen never calls ready what the runtime will refuse.
       * B1 slice 25: slice 18's `RUNTIME_OPENROUTER_KEY_REQUIRED` step is gone. The session registry no longer asks every session
       *   for an OpenRouter key: it asks the composition whether the session's own model is usable (`prontoFn`, CLI-REQ-05,
       *   `harness-ui/src/session-registry.mjs:2859-2876`).
       */
      if(row.requiresKey&&!row.configured){const refusal=unusableKeyRefusal(row.id,row.benched);return{ready:false,code:refusal.code,provider,message:refusal.message};}
      return addressFirst()??{ready:true,provider,model};
    },
    providerState:(id)=>{
      /* S2: nothing is checked for a provider whose probe starts a process, so nothing is said of it */
      if(startsProcess(id))return null;
      ensureStateSnapshot();
      return reportOf(id,stateEntries.get(id)??null,Date.now());
    },
    refreshProviderState:async(id)=>{
      if(startsProcess(id))return null;
      /* S1: read again — the screen asks after a change (a key, a sign-in, another model's provider), and another TALOS may have written */
      adoptSnapshot();
      const now=Date.now();
      /* S2 (third review): with no credential in this process there is nothing a check could judge — nothing is sent, nothing is
         written, and the row reads what `reportOf` makes of it: «not verified» */
      if(!hasCredential(id))return reportOf(id,stateEntries.get(id)??null,now);
      const current=failClosed(id,stateEntries.get(id)??null);
      /* B3: kept for its hour only when it vouches; a fresh «not verified» is checked again, once per start */
      if(isProviderStateFresh(current,now,stateTtlMs)&&(providerStateVouches(current)||checkedThisStart.has(id)))return reportOf(id,current,now);
      const epoch=epochOf(id);
      checkedThisStart.add(id);
      const entry=await probeProviderState(id,epoch);
      /* B2: the key changed while this check was away — its answer speaks of the old key; what is known now is what the change left */
      if(epochOf(id)!==epoch)return reportOf(id,stateEntries.get(id)??null,Date.now());
      /* an answer that was not written (S3, or a newer one landed first) leaves what is known as it was */
      if(entry&&!rememberProbedState(id,entry))return reportOf(id,stateEntries.get(id)??entry,Date.now());
      return reportOf(id,entry,Date.now());
    },
    onProviderStateChanged:listener=>{stateListeners.add(listener);startWatch();return()=>{stateListeners.delete(listener);if(!stateListeners.size)stopWatch();};},
    /* second review of 0.6.2 (B1): and the plan's reads that came with no signal of their own (a window asked at the start of a turn) */
    stopProviderChecks:()=>{
      /* owner 14/10/2026: the screen leaves, so does the watch of the snapshot */
      stopWatch();
      for(const check of [...stateChecks]){stateChecks.delete(check);try{check.abort();}catch{/* already ended */}}
      try{deps.chatgpt?.stopRequests?.();}catch{/* a plan that was never opened */}
    },
  };
}
