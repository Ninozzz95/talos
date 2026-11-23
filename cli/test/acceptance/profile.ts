/**
 * Hermetic profile for one acceptance scenario.
 *
 * Every scenario gets a fresh temporary home: APPDATA, LOCALAPPDATA, USERPROFILE and HOME point inside it, so the
 * real `%APPDATA%\TALOS-CLI` and `%LOCALAPPDATA%\TALOS-CLI` are never read or written. The child environment is the
 * parent's minus every name that looks like a credential (KEY|TOKEN|SECRET|PASSW|CRED|AUTH|PRIVATE), minus the CI
 * markers Ink reads (`CI`, `CONTINUOUS_INTEGRATION`: with them Ink renders non-interactively and defers every frame
 * until exit, gate E15) and minus `NO_COLOR`; `TERM` is `xterm-256color`. `OLLAMA_BASE_URL` points TALOS at the
 * scripted fake provider.
 *
 * R2 (gate E13, owner decision 10): the OS credential store (`@napi-rs/keyring`, Windows Credential Manager) is per Windows
 * user, not per APPDATA, so a temporary home does not isolate it. The profile therefore marks itself a test profile
 * (`TALOS_TEST_PROFILE=1`) and selects the in-memory store (`TALOS_CREDENTIAL_STORE=memory`): keys live in the child process
 * only, and a test profile that asks for the real store is refused before the native module loads (`provider/store.ts`).
 * s16 proves it through `talos doctor --json` (`sections.credentials`, `nativeModuleLoaded`).
 */
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const CLI_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
export const MAIN_JS=join(CLI_ROOT,'dist','main.js');
const SECRET_NAME=/(KEY|TOKEN|SECRET|PASSW|CRED|AUTH|PRIVATE)/iu;
const DROPPED=new Set(['CI','CONTINUOUS_INTEGRATION','NO_COLOR','FORCE_COLOR','TALOS_CLI_RUNTIME_ROOT','TALOS_CLI_DEV_LOG_DIR','TALOS_REDUCED_MOTION','OLLAMA_HOST','OLLAMA_BASE_URL','LMSTUDIO_BASE_URL','LM_BASE_URL']);
/* 21/10/2026: LM Studio's default address is 127.0.0.1:1234, and a model server on this computer answering there reached the
   subject's model lists (test/runtime/usable-models.test.ts saw `lmstudio:finto`). Closed by default, Ollama's too when the scenario
   has no fake provider (review 2 of 0.6.12, S4-2); a scenario opens either with extraEnv. */
const LOCAL_ENGINE_CLOSED='http://127.0.0.1:9';

export type Profile={home:string;project:string;env:Record<string,string>;talos:(args:string[],timeoutMs?:number)=>Promise<{status:number|null;stdout:string;stderr:string}>;dispose:()=>void};

/** Fail early, with the reason, when `dist/` is missing or older than `src/` (a stale build is a silent lie). */
export function assertFreshBuild(){
  if(!existsSync(MAIN_JS))throw new Error(`ACCEPTANCE_BUILD_MISSING: ${MAIN_JS} does not exist; run \`npm run build\` in cli/ first`);
  const built=statSync(MAIN_JS).mtimeMs;
  const newest=(dir:string):number=>readdirSync(dir,{withFileTypes:true}).reduce((max,entry)=>{
    const path=join(dir,entry.name);
    return Math.max(max,entry.isDirectory()?newest(path):entry.name.endsWith('.ts')?statSync(path).mtimeMs:0);
  },0);
  const source=newest(join(CLI_ROOT,'src'));
  if(source>built)throw new Error('ACCEPTANCE_BUILD_STALE: cli/src is newer than cli/dist/main.js; run `npm run build` in cli/ first');
}

export function childEnvironment(overrides:Record<string,string>={}):Record<string,string>{
  const env:Record<string,string>={};
  for(const [name,value] of Object.entries(process.env)){
    if(value===undefined||SECRET_NAME.test(name)||DROPPED.has(name.toUpperCase()))continue;
    env[name]=value;
  }
  return{...env,TERM:'xterm-256color',COLORTERM:'truecolor',...overrides};
}

export function createProfile({name,files={},providerUrl,extraEnv={}}:{name:string;files?:Record<string,string>;providerUrl?:string;extraEnv?:Record<string,string>}):Profile{
  const home=mkdtempSync(join(tmpdir(),`talos-acceptance-${name}-`));
  const dirs={appData:join(home,'appdata'),localAppData:join(home,'localappdata'),user:join(home,'user')};
  for(const dir of Object.values(dirs))mkdirSync(dir,{recursive:true});
  const project=join(home,'project');mkdirSync(project,{recursive:true});
  for(const [file,content] of Object.entries(files)){const path=join(project,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,content);}
  const env=childEnvironment({APPDATA:dirs.appData,LOCALAPPDATA:dirs.localAppData,USERPROFILE:dirs.user,HOME:dirs.user,TALOS_TEST_PROFILE:'1',TALOS_CREDENTIAL_STORE:'memory',TALOS_CLIPBOARD_FILE:join(home,'clipboard.txt'),/* 09/10/2026: TALOS retries a 429/5xx 10 times like Claude Code (~2.7 min of real waits); the scenarios keep the 3 they were written for (the kernel test covers 10) */TALOS_MAX_RETRIES:'3',LMSTUDIO_BASE_URL:LOCAL_ENGINE_CLOSED,OLLAMA_BASE_URL:providerUrl??LOCAL_ENGINE_CLOSED,...extraEnv});
  return{
    home,project,env,
    /* Asynchronous on purpose: the fake provider lives in this same process, and a synchronous spawn would block the
       event loop that has to answer TALOS's requests. */
    talos:(args,timeoutMs=60_000)=>new Promise(resolvePromise=>{
      const child=spawn(process.execPath,[MAIN_JS,...args],{cwd:project,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      let stdout='';let stderr='';child.stdout.setEncoding('utf8').on('data',d=>{stdout+=d;});child.stderr.setEncoding('utf8').on('data',d=>{stderr+=d;});
      const timer=setTimeout(()=>child.kill(),timeoutMs);
      child.on('close',status=>{clearTimeout(timer);resolvePromise({status,stdout,stderr});});
    }),
    dispose:()=>{try{rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{/* a still-open log handle must not fail the run; the folder is under the OS temp dir */}},
  };
}
