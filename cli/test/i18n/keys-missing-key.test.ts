/*
 * R2 lane K — gate E8 / Q-R2-7: ONE missing-key sentence, "No API key for {Provider}. Set {ENV} or run
 * `talos provider set-key {id}`.", with the provider label and the FIRST environment variable of the kernel's registry
 * (`REGISTRO_FORNITORI[id].auth.nomeVariabile[0]`: measured, the CLI's `ProviderDefinition.env` in `provider/store.ts` is used by
 * no production path). The four paths are rendered here and must print the same string: the screen's refusal, `-p` (text and
 * JSON `message`), `talos provider test` and `talos doctor`. Every path carries the code `PROVIDER_KEY_MISSING`, through which
 * lane E maps the kernel's eight Italian wordings.
 * ⛔ Hermetic: no network, no real keyring (doctor gets a sealed loader), dummy ids only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';
import {environmentKeyNotFoundText,missingKeyText,providerLabel,useProviderRegistry} from '../../src/provider/missing-key.ts';
import {unusableKeyRefusal} from '../../src/tui/catalog-service.ts';
import {providerReadinessDecision,remediationForProvider,UNKNOWN_PROVIDER_HEALTH,type ProviderDecisionInput} from '../../src/provider/health.ts';
import {attachKeyOrigin,keyOriginForEntry} from '../../src/provider/environment-keys.ts';
import {collectHeadlessRun} from '../../src/headless/run.ts';
import {runProviderCommand} from '../../src/commands/provider-cli.ts';
import {runSystemCommand} from '../../src/commands/system-cli.ts';
import {resolveCliPaths} from '../../src/paths.ts';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';

const REGISTRY=(await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href)).REGISTRO_FORNITORI as Record<string,any>;
useProviderRegistry(REGISTRY);
const SENTENCE='No API key for OpenAI. Set OPENAI_API_KEY or run `talos provider set-key openai`.';

function missingInput(id:string):ProviderDecisionInput{
  return{id,label:String(REGISTRY[id].etichetta),auth:{required:true,configured:false,usable:false,source:'missing'},endpoint:{value:'https://provider.invalid',valid:true},runtimeConfigured:true,cooldown:{active:false,cause:null,until:null,keys:0},lastHealth:UNKNOWN_PROVIDER_HEALTH};
}

test('E8: the sentence names the label, the first registry variable and the command, by id or by label',()=>{
  assert.equal(missingKeyText('openai'),SENTENCE);
  assert.equal(missingKeyText('OpenAI'),SENTENCE,'a caller that only has the label gets the same sentence');
  assert.equal(missingKeyText('kimi'),`No API key for ${REGISTRY.kimi.etichetta}. Set MOONSHOT_API_KEY or run \`talos provider set-key kimi\`.`,'the FIRST variable, not a guess');
  assert.equal(missingKeyText('no-such-provider'),'No API key for no-such-provider. Run `talos provider set-key no-such-provider`.','an unknown provider gets no invented variable');
  assert.equal(providerLabel('openai'),'OpenAI');
});

test('E8: the four paths print the same sentence with the code PROVIDER_KEY_MISSING',async()=>{
  const rendered:Record<string,string>={};

  // 1. The screen: the catalog's refusal and the control plane's readiness (the two sources the TUI shows).
  const refusal=unusableKeyRefusal('openai',null);
  assert.equal(refusal.code,'PROVIDER_KEY_MISSING');rendered.tui=refusal.message;
  const decision=providerReadinessDecision(missingInput('openai'));
  assert.equal(decision.ready,false);assert.equal(!decision.ready&&decision.code,'PROVIDER_KEY_MISSING');
  rendered.readiness=!decision.ready?decision.message:'';

  // 2. `-p`: v1 and v2 JSON messages, and the throw a one-shot command raises.
  const runtime:any={start:async()=>{throw new Error('nothing may start');}};
  attachKeyOrigin(runtime,()=>({provider:'openai',label:'OpenAI',required:true,origin:'none',variable:null,askedFirst:false}));
  const v1=await collectHeadlessRun(runtime,{projectRoot:process.cwd(),model:'openai:gpt-test',permissionMode:'default',prompt:'hi'});
  assert.equal(v1.result.error?.code,'PROVIDER_KEY_MISSING');rendered.headlessV1=String(v1.result.error?.message);
  const v2:any=await collectHeadlessRun(runtime,{projectRoot:process.cwd(),model:'openai:gpt-test',permissionMode:'default',prompt:'hi',protocolVersion:'v2'});
  assert.equal(v2.result.error?.envelope?.code,'PROVIDER_KEY_MISSING');rendered.headlessV2=String(v2.result.error?.message);
  let thrown:any=null;try{keyOriginForEntry(runtime,'openai:gpt-test',{refuseMissing:true});}catch(error){thrown=error;}
  assert.equal(thrown?.code,'PROVIDER_KEY_MISSING');rendered.entry=String(thrown?.message);

  // 3. `talos provider test openai`, human text: the sentence is a line of its own, and the kernel's Italian reason is not printed.
  const out:string[]=[];
  const profile={id:'openai',label:'OpenAI',lastHealth:{state:'unprobeable',detail:'Nessuna chiave salvata per OpenAI.',latencyMs:null,observedAt:1,httpStatus:null},remediation:remediationForProvider(missingInput('openai'))};
  const ctx:any={invocation:{outputFormat:'text'},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:'/p',paths:{},repoRoot:'/repo',createRuntimeContext:async()=>({providerControlPlane:{probe:async()=>profile},providerStore:{},tuiCatalog:{}})};
  assert.equal(await runProviderCommand(ctx,['test','openai']),11);
  const testLines=out.join('').split('\n');
  rendered.providerTest=testLines.find(line=>line.startsWith('No API key'))??'';
  assert.doesNotMatch(out.join(''),/Nessuna chiave/u,'the kernel reason is mapped by code, never printed');
  out.length=0;ctx.invocation.outputFormat='json';
  assert.equal(await runProviderCommand(ctx,['test','openai']),11);
  const tested=JSON.parse(out.join(''));
  assert.equal(tested.code,'PROVIDER_KEY_MISSING','the JSON carries the code lane E maps');rendered.providerTestJson=tested.remediation.message;

  // 4. `talos doctor` with the active model on a provider without a key.
  const root=await mkdtemp(join(tmpdir(),'talos-r2-k-doctor-'));
  try{
    const home=join(root,'home');const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home);
    for(const p of [paths.configRoot,paths.dataRoot,paths.cacheRoot,paths.logsRoot])await mkdir(p,{recursive:true});
    const doctorOut:string[]=[];
    const sealed={resolve:()=>{throw Object.assign(new Error('sealed by the test'),{code:'MODULE_NOT_FOUND'});},load:()=>{throw new Error('the sealed test keyring never loads a module');}};
    const control={list:()=>[],get:()=>({id:'openai'}),readiness:(id:string)=>providerReadinessDecision(missingInput(id))};
    const doctorCtx:any={invocation:{outputFormat:'text',model:'openai:gpt-test'},io:{writeOut:(s:string)=>doctorOut.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:root,repoRoot:root,paths,createRuntimeContext:async()=>({providerControlPlane:control,runtime:{close:async()=>{}}})};
    await runSystemCommand(doctorCtx,'doctor',[],{keyring:sealed});
    const line=doctorOut.join('').split('\n').find(row=>row.includes('No API key'))??'';
    rendered.doctor=line.replace(/^INFO provider: /u,'');
    assert.match(line,/^INFO provider: /u,'doctor states it as information: the `ok` semantics are R4\'s (Q-R2-9)');
  }finally{await rm(root,{recursive:true,force:true});}

  for(const [path,text] of Object.entries(rendered))assert.equal(text,SENTENCE,`${path} prints the one sentence`);
});

/* «Continue with ChatGPT» (13/10/2026): a provider the person signs in to has no key to set; the one sentence says how to sign in. */
test('E8: the ChatGPT plan is "not connected", with the sign-in command, never "No API key … set-key"',()=>{
  assert.equal(REGISTRY.chatgpt?.auth?.tipo,'oauth-pkce','the kernel registry still marks the plan as a sign-in provider');
  const sentence='ChatGPT plan is not connected. Run `talos provider login chatgpt` to sign in, or pick it in /provider.';
  assert.equal(missingKeyText('chatgpt'),sentence);
  assert.equal(missingKeyText('ChatGPT plan'),sentence,'by label too');
  assert.equal(missingKeyText('openai'),SENTENCE,'a key provider keeps its sentence');
});

/* 14/10/2026: `talos provider env-key <id>` with nothing set names the variable to set — for EVERY provider the registry gives one,
   every name the store reads, in its order; a provider with none keeps the bare sentence (no invented name). */
test('env-key with nothing set: every provider with a variable names all of them, in the registry order',()=>{
  let named=0;
  for(const [id,record] of Object.entries(REGISTRY)){
    const names=Array.isArray(record?.auth?.nomeVariabile)?record.auth.nomeVariabile as string[]:[];
    const text=environmentKeyNotFoundText(id,'X');
    if(names.length){named++;assert.equal(text,`No key for X was found in the environment (set ${names.join(' or ')}).`,id);}
    else assert.equal(text,'No key for X was found in the environment.',id);
  }
  assert.ok(named>20,`the premise: most providers name a variable (${named})`);
  assert.equal(environmentKeyNotFoundText('zai-anthropic'),`No key for ${providerLabel('zai-anthropic')} was found in the environment (set ZAI_ANTHROPIC_API_KEY).`);
  assert.equal(environmentKeyNotFoundText('no-such-provider'),'No key for no-such-provider was found in the environment.');
});
