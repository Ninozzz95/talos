import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

/*
 * B1 slice 18 — a key found in the environment is known, not used.
 *
 * Owner decision 2026-09-17, after competitor research (ledger, "Owner requirement recorded 2026-09-17:
 * a clean first run"): Claude Code asks before using an environment ANTHROPIC_API_KEY, with "No" as the
 * recommended answer, and remembers approved keys by their last 20 characters; Hermes uses any environment
 * key silently; Codex pre-fills its key field. TALOS asks, with "No" preselected, and remembers the answer
 * WITHOUT any readable part of the key: an HMAC-SHA256 under a random local key, so the record says only
 * "this exact value was answered".
 *
 * ⛔ Non-interactive runs (`talos -p`, CI) use the environment key without asking; this module does not
 *   decide that, each entry point does, explicitly (`environmentKeyModeForEntry`), and the run states where the key came from.
 * ⛔ The record never holds a key, a suffix or a length. The HMAC key lives in a second file so that the
 *   record alone cannot be used to test a guess.
 */

export type ProviderRegistryRecord={etichetta?:string;chiaveObbligatoria?:boolean;auth?:{nomeVariabile?:readonly string[]|null}|null};
export type ProviderRegistry=Readonly<Record<string,ProviderRegistryRecord|undefined>>;
export type EnvironmentKeyAnswer='yes'|'no';
export type EnvironmentKeyState={provider:string;variable:string;state:'unanswered'|'approved'|'declined'};
export type EnvironmentKeyMode='use'|'consent';
export type Environment=Record<string,string|undefined>;

const RECORD_FILE='provider-consent.json';
const HASH_KEY_FILE='provider-consent.key';
const FINGERPRINT_PREFIX='hmac-sha256:';
const VARIABLE_NAME=/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u;
const PROVIDER_ID=/^[a-z0-9][a-z0-9-]{0,63}$/u;
/** The name rule of `diagnostics/redact.ts` (SECRET_KEY). A name that looks like a secret never reaches the store unapproved,
 *  even when the registry that would name it is missing: the filter closes on what it cannot identify. */
const SECRET_LOOKING_NAME=/^(?:.*(?:api[-_]?key|authorization|password|secret|token).*)$/iu;

export function keyVariablesFor(registry:ProviderRegistry,provider:string):string[]{
  const names=registry[provider]?.auth?.nomeVariabile;
  return Array.isArray(names)?names.filter(name=>typeof name==='string'&&VARIABLE_NAME.test(name)):[];
}

/** The credential store also reads `<first variable>_POOL`, a JSON list of keys. */
export function poolVariableFor(registry:ProviderRegistry,provider:string):string|null{
  const first=keyVariablesFor(registry,provider)[0];
  return first?`${first}_POOL`:null;
}

/** Every environment name through which the credential store can receive a provider key. */
export function credentialVariableNames(registry:ProviderRegistry):Set<string>{
  const names=new Set<string>();
  for(const provider of Object.keys(registry)){
    for(const name of keyVariablesFor(registry,provider))names.add(name);
    const pool=poolVariableFor(registry,provider);if(pool)names.add(pool);
  }
  return names;
}

/*
 * ⛔ B1 slice 18, fix round — condition 8. On win32 environment names are case-insensitive: `process.env.OPENROUTER_API_KEY` finds a
 *   variable spelled `OpenRouter_Api_Key`, but spreading `process.env` into a plain object keeps the spelling it was set with, and
 *   the credential store reads the canonical name from that plain object. Measured by the coordinator: the approval was recorded
 *   and the store saw no key. Every lookup here therefore folds case on win32, and the store receives the canonical name only.
 */
function foldName(name:string,platform:NodeJS.Platform){return platform==='win32'?name.toUpperCase():name;}
/** The value of `name` as this platform resolves it: the exact spelling first, then (win32 only) any case variant. */
function readVariable(env:Environment,name:string,platform:NodeJS.Platform):string|undefined{
  const exact=env[name];if(typeof exact==='string')return exact;
  if(platform!=='win32')return undefined;
  const wanted=foldName(name,platform);
  for(const [candidate,value] of Object.entries(env))if(typeof value==='string'&&foldName(candidate,platform)===wanted)return value;
  return undefined;
}

/** The variable the credential store would read for this provider: the first non-empty one, trimmed, as the store does. */
export function environmentKeyFor(env:Environment,registry:ProviderRegistry,provider:string,platform:NodeJS.Platform=process.platform):{variable:string;value:string}|null{
  for(const variable of keyVariablesFor(registry,provider)){
    const value=readVariable(env,variable,platform);
    if(typeof value==='string'&&value.trim()!=='')return{variable,value:value.trim()};
  }
  return null;
}

type ConsentRecord={version:1;chosenProvider:string|null;environmentKeys:Record<string,{fingerprint:string;answer:EnvironmentKeyAnswer}>};
function emptyRecord():ConsentRecord{return{version:1,chosenProvider:null,environmentKeys:{}};}

function readRecord(file:string):ConsentRecord{
  if(!existsSync(file))return emptyRecord();
  try{
    const parsed=JSON.parse(readFileSync(file,'utf8'));
    if(parsed?.version!==1||!parsed.environmentKeys||typeof parsed.environmentKeys!=='object'||Array.isArray(parsed.environmentKeys))return emptyRecord();
    const environmentKeys:ConsentRecord['environmentKeys']={};
    for(const [variable,row] of Object.entries(parsed.environmentKeys as Record<string,any>)){
      if(!VARIABLE_NAME.test(variable)||typeof row?.fingerprint!=='string'||!row.fingerprint.startsWith(FINGERPRINT_PREFIX)||(row.answer!=='yes'&&row.answer!=='no'))continue;
      environmentKeys[variable]={fingerprint:row.fingerprint,answer:row.answer};
    }
    const chosenProvider=typeof parsed.chosenProvider==='string'&&PROVIDER_ID.test(parsed.chosenProvider)?parsed.chosenProvider:null;
    return{version:1,chosenProvider,environmentKeys};
  }catch{return emptyRecord();}
}

function writeAtomically(file:string,text:string){
  const temporary=`${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try{writeFileSync(temporary,text,{encoding:'utf8',mode:0o600});renameSync(temporary,file);}
  catch(error){try{if(existsSync(temporary))unlinkSync(temporary);}catch{/* best effort */}throw Object.assign(new Error('PROVIDER_CONSENT_UNAVAILABLE'),{code:'PROVIDER_CONSENT_UNAVAILABLE',cause:error});}
}

export function createEnvironmentKeyConsent({dataRoot,registry,env,platform=process.platform}:{dataRoot:string;registry:ProviderRegistry;env:Environment;platform?:NodeJS.Platform}){
  const recordFile=join(dataRoot,RECORD_FILE);
  const hashKeyFile=join(dataRoot,HASH_KEY_FILE);

  function readHashKey():Buffer|null{
    try{const text=readFileSync(hashKeyFile,'utf8').trim();return /^[a-f0-9]{64}$/u.test(text)?Buffer.from(text,'hex'):null;}catch{return null;}
  }
  function hashKey(create:boolean):Buffer|null{
    const existing=readHashKey();if(existing||!create)return existing;
    mkdirSync(dataRoot,{recursive:true,mode:0o700});
    const created=randomBytes(32);writeAtomically(hashKeyFile,`${created.toString('hex')}\n`);
    return created;
  }
  function fingerprint(value:string,key:Buffer){return `${FINGERPRINT_PREFIX}${createHmac('sha256',key).update(value,'utf8').digest('hex')}`;}
  function matches(expected:string,value:string,key:Buffer|null){
    if(!key)return false;const actual=Buffer.from(fingerprint(value,key));const wanted=Buffer.from(expected);
    return actual.length===wanted.length&&timingSafeEqual(actual,wanted);
  }
  function answerFor(variable:string,value:string,record=readRecord(recordFile),key=readHashKey()):EnvironmentKeyAnswer|null{
    const row=record.environmentKeys[variable];
    return row&&matches(row.fingerprint,value,key)?row.answer:null;
  }

  function stateFor(provider:string):EnvironmentKeyState|null{
    const found=environmentKeyFor(env,registry,provider,platform);if(!found)return null;
    const answer=answerFor(found.variable,found.value);
    return{provider,variable:found.variable,state:answer==='yes'?'approved':answer==='no'?'declined':'unanswered'};
  }

  function answer(provider:string,value:EnvironmentKeyAnswer):EnvironmentKeyState{
    if(value!=='yes'&&value!=='no')throw Object.assign(new Error('PROVIDER_CONSENT_ANSWER_INVALID'),{code:'PROVIDER_CONSENT_ANSWER_INVALID'});
    const found=environmentKeyFor(env,registry,provider,platform);
    if(!found)throw Object.assign(new Error('PROVIDER_ENVIRONMENT_KEY_NOT_FOUND'),{code:'PROVIDER_ENVIRONMENT_KEY_NOT_FOUND'});
    const key=hashKey(true)!;const record=readRecord(recordFile);
    record.environmentKeys[found.variable]={fingerprint:fingerprint(found.value,key),answer:value};
    mkdirSync(dataRoot,{recursive:true,mode:0o700});writeAtomically(recordFile,`${JSON.stringify(record,null,2)}\n`);
    return{provider,variable:found.variable,state:value==='yes'?'approved':'declined'};
  }

  function chosenProvider():string|null{return readRecord(recordFile).chosenProvider;}
  function chooseProvider(provider:string){
    if(typeof provider!=='string'||!PROVIDER_ID.test(provider)||!registry[provider])throw Object.assign(new Error('PROVIDER_INVALID'),{code:'PROVIDER_INVALID'});
    const record=readRecord(recordFile);record.chosenProvider=provider;
    mkdirSync(dataRoot,{recursive:true,mode:0o700});writeAtomically(recordFile,`${JSON.stringify(record,null,2)}\n`);
  }

  /**
   * The environment the credential store may see in an interactive run: every provider-key variable is
   * removed unless its CURRENT value was approved. Pool variables are never offered, so they never pass.
   * Any other variable whose NAME looks like a secret is removed too. Endpoints and paths pass unchanged.
   * ⛔ On win32 a provider-key or pool variable is recognised in ANY case, every spelling of it is removed, and an approved value
   *   is put back under the registry's canonical name, the one the credential store reads.
   */
  function environmentForStore():Environment{
    const record=readRecord(recordFile);const key=readHashKey();
    const keyNames=new Set(Object.keys(registry).flatMap(provider=>keyVariablesFor(registry,provider)));
    const credentialNames=new Set([...credentialVariableNames(registry)].map(name=>foldName(name,platform)));
    const out:Environment={};
    for(const [name,value] of Object.entries(env)){
      if(credentialNames.has(foldName(name,platform))||SECRET_LOOKING_NAME.test(name))continue;
      out[name]=value;
    }
    for(const name of keyNames){
      const value=readVariable(env,name,platform);
      if(typeof value==='string'&&value.trim()!==''&&answerFor(name,value.trim(),record,key)==='yes')out[name]=value;
    }
    return out;
  }

  return{stateFor,answer,chosenProvider,chooseProvider,environmentForStore,files:{record:recordFile,hashKey:hashKeyFile}};
}
export type EnvironmentKeyConsent=ReturnType<typeof createEnvironmentKeyConsent>;

export type KeyOrigin={provider:string;label:string;required:boolean;origin:'keyring'|'environment'|'none'|'not-required';variable:string|null;askedFirst:boolean};

export function providerOfModel(model:string):string|null{
  const index=typeof model==='string'?model.indexOf(':'):-1;
  return index>0?model.slice(0,index):null;
}

/** Where the key a run would use comes from, as the credential store sees it. Never the key itself. */
export function describeKeyOrigin({registry,provider,publicRow,storeEnv,mode}:{registry:ProviderRegistry;provider:string;publicRow:{requiresKey?:boolean;origineChiave?:string|null}|null|undefined;storeEnv:Environment;mode:EnvironmentKeyMode}):KeyOrigin|null{
  const record=registry[provider];if(!record)return null;
  const label=String(record.etichetta??provider);
  const required=typeof publicRow?.requiresKey==='boolean'?publicRow.requiresKey:record.chiaveObbligatoria===true;
  if(!required)return{provider,label,required,origin:'not-required',variable:null,askedFirst:false};
  if(publicRow?.origineChiave==='custodia')return{provider,label,required,origin:'keyring',variable:null,askedFirst:false};
  if(publicRow?.origineChiave==='ambiente')return{provider,label,required,origin:'environment',variable:environmentKeyFor(storeEnv,registry,provider)?.variable??null,askedFirst:mode==='consent'};
  return{provider,label,required,origin:'none',variable:null,askedFirst:false};
}

export function keyOriginNotice(origin:KeyOrigin):string|null{
  if(origin.origin==='keyring')return `Key for ${origin.label}: saved in the system keyring.`;
  if(origin.origin==='environment')return `Key for ${origin.label}: environment variable ${origin.variable??'(unknown)'}${origin.askedFirst?', approved earlier':', used without asking because this run is non-interactive'}.`;
  return null;
}

export function missingKeyMessage(origin:Pick<KeyOrigin,'label'|'provider'>):string{
  return `No ${origin.label} key is available, so nothing was sent to ${origin.label}. Add one with /provider, or run: talos provider set-key ${origin.provider}`;
}

/*
 * ⭐ B1 slice 18, fix round — condition 3: WHO decides whether an environment key is used without asking. The ENTRIES do,
 * explicitly: the interactive screen and `talos provider` ask (`consent`); `talos -p` and the one-shot commands that run a model
 * (`research start`, `automation run`, `automation serve`, `session resume`) use it and state where it came from (`use`).
 * The composition and the entry factories keep `consent` for a caller that forgets.
 * ⛔ Every child the screen spawns carries `TALOS_ENVIRONMENT_KEYS=consent`. An entry honours the variable ONLY to close: the value
 *   `consent` forces consent, and any other value, `use` included, is ignored. A variable can never open what an entry closed.
 */
export const ENVIRONMENT_KEYS_MARKER='TALOS_ENVIRONMENT_KEYS';
export function environmentKeyModeForEntry(requested:EnvironmentKeyMode,env:Environment=process.env):EnvironmentKeyMode{
  return env[ENVIRONMENT_KEYS_MARKER]==='consent'?'consent':requested;
}
/** The environment a child of the interactive screen runs with: the screen's own, closed. */
export function screenChildEnvironment(env:Environment=process.env):Environment{return{...env,[ENVIRONMENT_KEYS_MARKER]:'consent'};}

/**
 * For a one-shot command that runs a model, as `talos -p` does: the origin statement for that model's key, or null when the
 * runtime cannot tell. With `refuseMissing`, a provider that needs a key it does not have is refused BEFORE anything is sent,
 * with a coded error naming that provider (exit 11 through `exitCodeForError`).
 */
export function keyOriginForEntry(runtime:object,model:string,{refuseMissing}:{refuseMissing:boolean}):string|null{
  const origin=keyOriginForRun(runtime,model);if(!origin)return null;
  if(refuseMissing&&origin.required&&origin.origin==='none')throw Object.assign(new Error(missingKeyMessage(origin)),{code:'PROVIDER_KEY_MISSING',provider:origin.provider});
  return keyOriginNotice(origin);
}
/** States the origin the way the owner decided: one stderr line in text mode, a `warnings` entry in JSON. */
export function stateKeyOrigin(io:{writeErr(text:string):void},outputFormat:string,notice:string|null):{warnings?:string[]}{
  if(!notice)return{};
  if(outputFormat!=='json')io.writeErr(`${notice}\n`);
  return{warnings:[notice]};
}

const ORIGINS=new WeakMap<object,(model:string)=>KeyOrigin|null>();
/** Lets a run started through this runtime state its key origin without the runtime contract growing a field. */
export function attachKeyOrigin(runtime:object,resolve:(model:string)=>KeyOrigin|null){ORIGINS.set(runtime,resolve);}
export function keyOriginForRun(runtime:object,model:string):KeyOrigin|null{
  const resolve=ORIGINS.get(runtime);if(!resolve)return null;
  try{return resolve(model);}catch{return null;}
}
