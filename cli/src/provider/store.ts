import {mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {loadTalosSystemKeyring,systemKeyringAdapter,type KeyringLoaderDeps,type KeyringProblem} from './system-keyring.ts';
import {t} from '../i18n/index.ts';
import {CliRuntimeError} from '../runtime/types.ts';
import {CREDENTIAL_STORES,type CredentialStoreKind} from '../config/types.ts';
export type {CredentialStoreKind};
export type KeyringAdapter={get(service:string,account:string):Promise<string|null>|string|null;set(service:string,account:string,value:string):Promise<void>|void;remove(service:string,account:string):Promise<void>|void};
export type ProviderDefinition={env:string[];requiresKey:boolean;label?:string};
const SERVICE='talos-cli-provider';
function cleanKey(v:string):string{const x=v.trim();if(!x||x.length>4096||/[\r\n\0]/u.test(x))throw new Error('PROVIDER_KEY_INVALID');return x;}
export function createCliProviderStore({env,keyring,definitions}:{env:Record<string,string|undefined>;keyring:KeyringAdapter;definitions:Record<string,ProviderDefinition>}){
 const def=(id:string)=>{const d=definitions[id];if(!d)throw new Error('PROVIDER_INVALID');return d;};
 const envKey=(id:string)=>{for(const n of def(id).env){const v=env[n];if(v?.trim())return cleanKey(v);}return null;};
 return{
  async getKey(id:string){const e=envKey(id);if(e)return e;const v=await keyring.get(SERVICE,id);return v?cleanKey(v):null;},
  async setKey(id:string,value:string){def(id);await keyring.set(SERVICE,id,cleanKey(value));},
  async removeKey(id:string){def(id);await keyring.remove(SERVICE,id);},
  async listPublic(){const rows=[];for(const [id,d] of Object.entries(definitions)){rows.push({id,label:d.label??id,requiresKey:d.requiresKey,configured:d.requiresKey?Boolean(await this.getKey(id)):true});}return rows;},
 };
}

/*
 * ⭐ R2 (gate E13, Q-R2-5, owner decision 10) — ONE RESOLVER FOR THE CREDENTIAL STORE.
 *
 * `system` (default: the OS store through `@napi-rs/keyring`, safer than a plaintext file) or `memory` (a `Map` in this process,
 * gone at exit: Codex `cli_auth_credentials_store = "ephemeral"`, `codex-rs/login/src/auth/storage.rs:459-528` at 2026-08-24; Pi
 * `AuthStorage.inMemory()`). Chosen by `TALOS_CREDENTIAL_STORE` or the config key `credentials.store`; the variable wins, because
 * the acceptance profile uses it and people use the config (Q-R2-5 (c)). Everything that opens a store comes through here: the
 * composition (`talos-composition.ts`), `createSystemKeyring` below and `doctor` (`commands/system-cli.ts`).
 *
 * ⛔ THE TEST GUARD (Hermes `hermes_state.py:196-226` `_ensure_test_isolation`, 2026-09-23: it RAISES when a test would open the
 *   production state). A test profile is `TALOS_TEST_PROFILE=1` (set by `test/acceptance/profile.ts`) or `NODE_TEST_CONTEXT`
 *   (measured on Node 24.18.0: `node --test` sets it to `child-v8` in every test-file process, and a child spawned with that
 *   environment inherits it; `--test-isolation=none` does not set it, and `cli/scripts/run-tests.mjs` uses the default isolation).
 *   - A test profile that chooses nothing gets `memory` (the redirect: Hermes' conftest moves HERMES_HOME to a temp dir).
 *   - A test profile that chooses `system` is REFUSED with `CREDENTIAL_STORE_REAL_IN_TEST`, before the module is resolved or
 *     loaded, so the refusal holds even when the store would have opened.
 *   - The one exception is a test that hands its own module loader (`loader.load`, injectable for tests only, never in
 *     production): what it loads is its own fake, so the loader's own tests keep exercising `system`.
 * ⛔ A value TALOS does not know is refused (`CREDENTIAL_STORE_INVALID`): a guard that cannot read the choice denies.
 */
export type CredentialStoreSource='environment'|'config'|'test-profile'|'default';
export type CredentialStoreChoice={kind:CredentialStoreKind;source:CredentialStoreSource;testProfile:boolean};
export type CredentialStoreConfig={credentials?:{store?:CredentialStoreKind}};
export const CREDENTIAL_STORE_VARIABLE='TALOS_CREDENTIAL_STORE';
export const TEST_PROFILE_VARIABLE='TALOS_TEST_PROFILE';
type Env=Record<string,string|undefined>;

export function isTestProfile(env:Env):boolean{
  return env[TEST_PROFILE_VARIABLE]==='1'||(typeof env.NODE_TEST_CONTEXT==='string'&&env.NODE_TEST_CONTEXT!=='');
}

export function chooseCredentialStore({env,config,ownLoader=false}:{env:Env;config?:CredentialStoreConfig|null;ownLoader?:boolean}):CredentialStoreChoice{
  const testProfile=isTestProfile(env);
  const raw=env[CREDENTIAL_STORE_VARIABLE];
  if(typeof raw==='string'&&raw.trim()!==''){
    const kind=raw.trim().toLowerCase();
    if(!(CREDENTIAL_STORES as readonly string[]).includes(kind))throw new CliRuntimeError('CREDENTIAL_STORE_INVALID',t('store.invalid',{value:raw.trim(),variable:CREDENTIAL_STORE_VARIABLE}),{variable:CREDENTIAL_STORE_VARIABLE});
    /* owner 27/10/2026 (development mode, «non posso stare qui a babysittarti»): keys in a plain file only where nothing real lives */
    if(kind==='file'&&!testProfile)throw new CliRuntimeError('CREDENTIAL_STORE_FILE_OUTSIDE_TEST',t('store.fileOutsideTest',{variable:CREDENTIAL_STORE_VARIABLE}),{variable:CREDENTIAL_STORE_VARIABLE});
    return{kind:kind as CredentialStoreKind,source:'environment',testProfile};
  }
  const configured=config?.credentials?.store;
  if(configured==='system'||configured==='memory')return{kind:configured,source:'config',testProfile};
  return testProfile&&!ownLoader?{kind:'memory',source:'test-profile',testProfile}:{kind:'system',source:'default',testProfile};
}

/** The name `doctor` and the refusal give the store: the OS store's own name on this platform. */
export function credentialStoreName(kind:CredentialStoreKind,platform:NodeJS.Platform=process.platform):string{
  if(kind==='memory')return t('store.name.memory');
  if(kind==='file')return t('store.name.file');
  return t(platform==='win32'?'store.name.system.win32':platform==='darwin'?'store.name.system.darwin':'store.name.system.other');
}
export function credentialStoreSourceText(choice:Pick<CredentialStoreChoice,'source'>):string{
  return choice.source==='environment'?t('store.source.environment',{variable:CREDENTIAL_STORE_VARIABLE})
    :choice.source==='config'?t('store.source.config'):choice.source==='test-profile'?t('store.source.testProfile'):t('store.source.default');
}

/* Per profile (Codex keys its ephemeral store by `compute_store_key(codex_home)`): a runtime rebuilt in the same process (the
   supervisor's restart) still sees a key saved a minute ago, and two profiles in one test process do not share keys. */
const MEMORY_STORES=new Map<string,Map<string,string>>();
export function createMemoryKeyring(scope:string):KeyringAdapter{
  let values=MEMORY_STORES.get(scope);if(!values){values=new Map();MEMORY_STORES.set(scope,values);}
  const map=values;const key=(service:string,account:string)=>`${service}\u0000${account}`;
  return{get:(service,account)=>map.get(key(service,account))??null,set:(service,account,value)=>{map.set(key(service,account),value);},remove:(service,account)=>{map.delete(key(service,account));}};
}

/*
 * The test profile's keyring FILE (owner 27/10/2026: development mode must run the remote end to end without the owner). An in-memory
 * keyring gives the PC a new remote identity in every process, so a device paired in one `talos remote` could never reach the next;
 * the real keyring is the owner's real identity. This file lives in the test profile's data root, is read and written synchronously
 * (the kernel's remote keyring is synchronous: host.ts REMOTE_KEYRING_ASYNC), replaced atomically, mode 0600. It holds only what
 * TALOS stores itself: nothing is copied in from the environment (the Desktop's 4178 file keychain is SEEDED from env keys, and its
 * start script must strip them first; here `getKey` reads the environment without ever writing it). Codex offers the same choice
 * (`cli_auth_credentials_store = "file"`, auth.json in CODEX_HOME); here it is refused outside a test profile.
 */
export const TEST_KEYRING_FILE='test-keyring.json';
export function createFileKeyring(file:string):KeyringAdapter{
  const key=(service:string,account:string)=>`${service}\u0000${account}`;
  const read=():Record<string,string>=>{try{const data=JSON.parse(readFileSync(file,'utf8'));return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return{};}};
  const write=(values:Record<string,string>)=>{mkdirSync(dirname(file),{recursive:true});const temp=`${file}.${process.pid}.tmp`;writeFileSync(temp,JSON.stringify(values),{mode:0o600});renameSync(temp,file);};
  return{
    get:(service,account)=>{const v=read()[key(service,account)];return typeof v==='string'?v:null;},
    set:(service,account,value)=>{const values=read();values[key(service,account)]=value;write(values);},
    remove:(service,account)=>{const values=read();if(key(service,account) in values){delete values[key(service,account)];write(values);}},
  };
}

let active:CredentialStoreChoice|null=null;
/** The store the last resolution in this process chose (for the sentences that name it), or null before any. */
export function activeCredentialStore():CredentialStoreChoice|null{return active;}
/** What `/provider` says after a key passed its test and was saved: where it now lives. */
export function keySavedText():string{return t(active?.kind==='memory'?'store.saved.memory':active?.kind==='file'?'store.saved.file':'store.saved.system');}

export type OpenedCredentialStore=CredentialStoreChoice&{keyring:KeyringAdapter|null;problem:KeyringProblem|null};
/**
 * Resolves and opens the store. `scope` separates memory stores (the profile's data root). Throws `CREDENTIAL_STORE_INVALID` or
 * `CREDENTIAL_STORE_REAL_IN_TEST`; a system store that cannot be loaded is `keyring: null` with its `problem`, as before R2.
 */
export function openCredentialStore({repoRoot,scope,env=process.env,config,loader}:{repoRoot:string;scope:string;env?:Env;config?:CredentialStoreConfig|null;loader?:KeyringLoaderDeps}):OpenedCredentialStore{
  const ownLoader=typeof loader?.load==='function';
  const choice=chooseCredentialStore({env,config:config??null,ownLoader});
  if(choice.kind==='system'&&choice.testProfile&&!ownLoader){
    throw new CliRuntimeError('CREDENTIAL_STORE_REAL_IN_TEST',t('store.refusedInTest',{store:credentialStoreName('system'),variable:CREDENTIAL_STORE_VARIABLE}),{store:'system',source:choice.source});
  }
  active=choice;
  if(choice.kind==='memory')return{...choice,keyring:createMemoryKeyring(scope),problem:null};
  if(choice.kind==='file')return{...choice,keyring:createFileKeyring(join(scope,TEST_KEYRING_FILE)),problem:null};
  const loaded=loadTalosSystemKeyring(repoRoot,loader??{});
  return loaded.ok?{...choice,keyring:systemKeyringAdapter(loaded.Entry),problem:null}:{...choice,keyring:null,problem:loaded};
}

/** R2 (E13): through the resolver, so a test profile never reaches the OS store from here either. */
export async function createSystemKeyring(repoRoot:string,{scope=repoRoot,env=process.env,config}:{scope?:string;env?:Env;config?:CredentialStoreConfig|null}={}):Promise<KeyringAdapter>{
  const opened=openCredentialStore({repoRoot,scope,env,config:config??null});
  if(!opened.keyring)throw new Error('PROVIDER_STORE_UNAVAILABLE');
  return opened.keyring;
}
