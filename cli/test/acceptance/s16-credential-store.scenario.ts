/**
 * s16 — the credential store of a test profile (gate E13, owner decision 10) and the one missing-key sentence (gate E8), in
 * real TALOS children started from the acceptance profile (`TALOS_TEST_PROFILE=1`, `TALOS_CREDENTIAL_STORE=memory`).
 *
 * The observable that the OS store was never opened is measured, not assumed: `talos doctor --json` reports
 * `sections.credentials.nativeModuleLoaded`, whether that doctor run attempted to load `@napi-rs/keyring` (a counter in
 * `provider/system-keyring.ts`, bumped right before the module's code would run), read after every other doctor probe,
 * including the one that composes a runtime. `test/provider/r2-credential-store.test.ts` proves it can say yes (a fake module).
 * ⛔ No network: `openai` has no key in the profile, so `-p` and `provider test` refuse before anything is sent.
 */
import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {assertFreshBuild,createProfile,type Profile} from './profile.ts';

const SENTENCE='No API key for OpenAI. Set OPENAI_API_KEY or run `talos provider set-key openai`.';
let profile:Profile;
before(()=>{assertFreshBuild();profile=createProfile({name:'s16',files:{'README.md':'# demo\n'}});});
after(()=>{profile?.dispose();});

/** Runs TALOS with `extra` added to the profile's environment for this one child. */
async function talos(args:string[],extra:Record<string,string>={}){
  const saved=Object.fromEntries(Object.keys(extra).map(name=>[name,profile.env[name]]));
  Object.assign(profile.env,extra);
  try{return await profile.talos(args,60_000);}
  finally{for(const [name,value] of Object.entries(saved)){if(value===undefined)delete profile.env[name];else profile.env[name]=value;}}
}
/* Judge v1534/v1579 («one line», step 3): `-p` runs the folder's code, so in a folder nobody decided it stops on trust
   (PROJECT_TRUST_REQUIRED, cure b) before it reaches the credential store or the key; doctor and `provider test` do not. Each `-p`
   below runs after the folder is decided, as a person would; `talos project trust` says «already trusted» the second time. */
async function decided(){const r=await profile.talos(['project','trust','--include-nested'],60_000);assert.equal(r.status,0,`project trust failed: ${r.stdout}${r.stderr}`);}
function json(stdout:string){try{return JSON.parse(stdout);}catch{throw new Error(`not JSON: ${stdout.slice(0,400)}`);}}

test('s16 · the acceptance profile is a test profile on the memory store',()=>{
  assert.equal(profile.env.TALOS_TEST_PROFILE,'1');
  assert.equal(profile.env.TALOS_CREDENTIAL_STORE,'memory');
});

test('s16 · E13 doctor names the memory store and the real store was never opened',async()=>{
  const run=await talos(['doctor','--json']);
  const report=json(run.stdout);
  assert.deepEqual(report.sections.credentials,{state:'healthy',store:'memory',source:'environment',nativeModuleLoaded:false},run.stdout);
  /* v1534: doctor runs in the folder nobody decided, leaves its settings out, and says so in one line */
  assert.equal(run.stderr.split(/\r?\n/u).filter(line=>line.startsWith('This folder was never trusted:')).length,1,run.stderr);
  assert.deepEqual(report.checks.find((check:any)=>check.id==='keyring'),{id:'keyring',ok:true});
  const text=await talos(['doctor']);
  assert.match(text.stdout,/^INFO credentials: in memory, this process only \(set by TALOS_CREDENTIAL_STORE\)$/mu);
});

test('s16 · E13 a test profile that asks for the real store is refused before the native module loads',async()=>{
  const asked={TALOS_CREDENTIAL_STORE:'system'};
  const report=json((await talos(['doctor','--json'],asked)).stdout);
  assert.equal(report.sections.credentials.code,'CREDENTIAL_STORE_REAL_IN_TEST');
  assert.equal(report.sections.credentials.nativeModuleLoaded,false,'refused before resolution: nothing loaded');
  assert.equal(report.checks.find((check:any)=>check.id==='keyring')?.ok,false);
  await decided();
  const run=await talos(['-p','hello','--model','openai:gpt-test','--json'],asked);
  assert.notEqual(run.status,0);
  assert.equal(json(run.stdout).error?.code,'CREDENTIAL_STORE_REAL_IN_TEST',run.stdout+run.stderr);
});

test('s16 · E8 -p, provider test and doctor print the same missing-key sentence',async()=>{
  await decided();
  const headless=await talos(['-p','hello','--model','openai:gpt-test','--json']);
  const result=json(headless.stdout);
  assert.equal(result.error?.code,'PROVIDER_KEY_MISSING',headless.stdout);
  const tested=await talos(['provider','test','openai']);
  const doctor=await talos(['--model','openai:gpt-test','doctor']);
  const rendered={headless:String(result.error?.message),providerTest:tested.stdout.split(/\r?\n/u).find(line=>line.startsWith('No API key'))??tested.stdout,doctor:(doctor.stdout.split(/\r?\n/u).find(line=>line.startsWith('INFO provider: '))??doctor.stdout).replace(/^INFO provider: /u,'')};
  for(const [path,text] of Object.entries(rendered))assert.equal(text,SENTENCE,`${path} prints the one sentence`);
});
