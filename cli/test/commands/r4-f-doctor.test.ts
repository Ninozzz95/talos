/*
 * R4 lane F — `talos doctor` says whether a turn could run now (owner decisions Q-R4-14, Q-R4-15; gate E12; R4-DOCTOR).
 * - JSON keeps `ok` with its meaning (infrastructure checks) and adds `ready`, `status` and `reasons`.
 * - The headline is `TALOS doctor: ready` or `TALOS doctor: needs attention — <first reason>`; never "ok" when a turn could
 *   not run now. Exit 70 when a check fails (as before), 1 when not ready, 0 when ready.
 * - Ready: a provider chosen, a model of it chosen, its key usable or not needed (the same readiness a send asks), and a
 *   local engine answering (only the chosen local engine is checked; no provider on the network is contacted).
 * - The system credential store is said to be shared by every TALOS of this Windows user; the JSON section is unchanged.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {resolveCliPaths} from '../../src/paths.ts';
import {runSystemCommand} from '../../src/commands/system-cli.ts';
import {credentialsLine} from '../../src/commands/system-cli.ts';

const sealed={resolve:()=>{throw Object.assign(new Error("Cannot find module '@napi-rs/keyring' (sealed by the test)"),{code:'MODULE_NOT_FOUND'});},load:()=>{throw new Error('the sealed test keyring never loads a module');}};
type Turn={ready:true;provider:string;model:string}|{ready:false;code:string;provider:string|null;message:string};
async function doctor({turn,local=false,answering=true,format='json' as 'json'|'text',brokenRuntime=false}:{turn:Turn;local?:boolean;answering?:boolean;format?:'json'|'text';brokenRuntime?:boolean}){
  const root=await mkdtemp(join(tmpdir(),'r4-f-doctor-'));
  const repo=join(root,'repo');await mkdir(join(repo,'harness-ui','src'),{recursive:true});
  if(!brokenRuntime)await writeFile(join(repo,'harness-ui','src','session-registry.mjs'),'export {};\n');
  const project=join(root,'project');await mkdir(project);
  const home=join(root,'home');const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home);
  for(const p of [paths.configRoot,paths.dataRoot,paths.cacheRoot,paths.logsRoot])await mkdir(p,{recursive:true});
  const probed:string[]=[];const out:string[]=[];
  const profile=(id:string)=>({id,label:id==='ollama'?'Ollama Local':'OpenAI',local,auth:{required:!local,usable:true,configured:true,source:local?'not-required':'saved'},endpoint:{host:local?'127.0.0.1:11434':'api.openai.com',configured:false,valid:true},lastHealth:{state:'unknown',latencyMs:null,observedAt:null,httpStatus:null},runtimeConfigured:true,cooldown:{active:false,cause:null,until:null,keys:0},ready:true});
  const ctx:any={invocation:{outputFormat:format},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:project,repoRoot:repo,paths,
    createRuntimeContext:async()=>({
      tuiCatalog:{readiness:async()=>turn},
      providerControlPlane:{list:()=>[],get:profile,readiness:()=>({ready:true}),probe:async(id:string)=>{probed.push(id);return{...profile(id),lastHealth:{state:answering?'available':'unavailable',latencyMs:1,observedAt:1,httpStatus:answering?200:null}};}},
      runtime:{close:async()=>{}},
    })};
  const saved=process.env.TALOS_CREDENTIAL_STORE;process.env.TALOS_CREDENTIAL_STORE='memory';
  try{const code=await runSystemCommand(ctx,'doctor',format==='json'?['--json']:[],{keyring:sealed});return{code,text:out.join(''),probed};}
  finally{if(saved===undefined)delete process.env.TALOS_CREDENTIAL_STORE;else process.env.TALOS_CREDENTIAL_STORE=saved;await rm(root,{recursive:true,force:true});}
}
const failing=(json:any)=>json.checks.filter((check:any)=>!check.ok).map((check:any)=>`${check.id}: ${check.detail??''}`).join('; ');

test('Q-R4-14: with no provider chosen doctor needs attention, exits 1, and keeps the JSON ok',async()=>{
  const {code,text}=await doctor({turn:{ready:false,code:'PROVIDER_NOT_CHOSEN',provider:null,message:'No provider has been chosen yet, so nothing was sent. Choose one with /provider.'}});
  const json=JSON.parse(text);
  assert.equal(json.ok,true,`the infrastructure checks pass here: ${failing(json)}`);
  assert.equal(json.schema,'talos.cli.doctor.v1');
  assert.equal(json.ready,false);assert.equal(json.status,'needs attention');
  assert.deepEqual(json.reasons.map((reason:any)=>reason.code),['PROVIDER_NOT_CHOSEN']);
  assert.equal(code,1);
  const human=await doctor({format:'text',turn:{ready:false,code:'PROVIDER_NOT_CHOSEN',provider:null,message:'x'}});
  assert.equal(human.text.split('\n')[0],'TALOS doctor: needs attention — no provider is chosen; choose one with /provider.');
  assert.equal(human.code,1);
});

test('Q-R4-14: a missing key is the one missing-key sentence; a model not chosen says /model',async()=>{
  const sentence='No API key for OpenAI. Set OPENAI_API_KEY or run `talos provider set-key openai`.';
  const key=await doctor({format:'text',turn:{ready:false,code:'PROVIDER_KEY_MISSING',provider:'openai',message:sentence}});
  assert.equal(key.text.split('\n')[0],`TALOS doctor: needs attention — ${sentence}`);
  const model=await doctor({format:'text',turn:{ready:false,code:'MODEL_NOT_CHOSEN',provider:'openai',message:'x'}});
  assert.match(model.text.split('\n')[0]!,/^TALOS doctor: needs attention — no model of \S+ is chosen; choose one with \/model\.$/u);
});

test('Q-R4-14: ready when a turn could run now: headline, exit 0, no network provider contacted',async()=>{
  const {code,text,probed}=await doctor({turn:{ready:true,provider:'openai',model:'openai:gpt-test'}});
  const json=JSON.parse(text);
  assert.equal(json.ready,true);assert.equal(json.status,'ready');assert.deepEqual(json.reasons,[]);assert.equal(code,0);
  assert.deepEqual(probed,[],'a provider on the network is never contacted by doctor without --profile');
  const human=await doctor({format:'text',turn:{ready:true,provider:'openai',model:'openai:gpt-test'}});
  assert.equal(human.text.split('\n')[0],'TALOS doctor: ready');
});

test('Q-R4-14: a chosen local engine must answer; only that engine is checked',async()=>{
  const down=await doctor({local:true,answering:false,turn:{ready:true,provider:'ollama',model:'ollama:qwen3'}});
  const json=JSON.parse(down.text);
  assert.equal(json.ready,false);assert.deepEqual(json.reasons.map((reason:any)=>reason.code),['PROVIDER_UNREACHABLE']);
  assert.match(json.reasons[0].message,/Ollama Local is not answering at 127\.0\.0\.1:11434/u);
  assert.equal(down.code,1);assert.deepEqual(down.probed,['ollama']);
  const up=await doctor({local:true,answering:true,turn:{ready:true,provider:'ollama',model:'ollama:qwen3'}});
  assert.equal(JSON.parse(up.text).ready,true);assert.equal(up.code,0);assert.deepEqual(up.probed,['ollama']);
});

test('E12: a failing check still exits 70, and the headline never says ready then',async()=>{
  const {code,text}=await doctor({format:'text',brokenRuntime:true,turn:{ready:true,provider:'openai',model:'openai:gpt-test'}});
  assert.equal(code,70);
  assert.match(text.split('\n')[0]!,/^TALOS doctor: needs attention — the talos-runtime check failed/u);
});

test('Q-R4-15: the system store is said to be shared by every TALOS of this Windows user; memory is unchanged',()=>{
  assert.equal(credentialsLine({state:'healthy',store:'system',source:'default'},'win32'),'Windows Credential Manager (default) — shared by every TALOS of this Windows user');
  assert.equal(credentialsLine({state:'healthy',store:'memory',source:'environment'},'win32'),'in memory, this process only (set by TALOS_CREDENTIAL_STORE)');
});
