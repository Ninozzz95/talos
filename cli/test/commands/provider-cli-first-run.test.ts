/*
 * B1 slice 18 — the command line follows the rules of /provider: a key is tested before it is saved, and an
 * environment key is used only after `talos provider env-key <id> --use`. Real subcommand dispatch, real composition
 * and kernel store; the keyring is in memory, the provider is on 127.0.0.1, every key is a dummy.
 */
import {providerLabelText} from '../../src/provider/provider-text.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {runSubcommand} from '../../src/subcommands.ts';
import {createCliRuntimeContext} from '../../src/runtime/create-runtime.ts';
import {dummyKey,fakeKeyring,filesContaining,hermetic,REPO_ROOT,startFakeProvider,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';

const REGISTRY=(await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href)).REGISTRO_FORNITORI as Record<string,any>;
/* R2 (D-05): the screen shows the English provider label, mapped by id (provider-text.ts). */
const label=(id:string)=>providerLabelText(id,String(REGISTRY[id].etichetta));

function invoke(h:Hermetic,keyring:ReturnType<typeof fakeKeyring>,positionals:string[],{json=true,secret}:{json?:boolean;secret?:string}={}){
  const out:string[]=[];const err:string[]=[];const prompts:string[]=[];
  const io:any={writeOut:(s:string)=>{out.push(s);},writeErr:(s:string)=>{err.push(s);},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>'',...(secret!==undefined?{readSecret:async(prompt:string)=>{prompts.push(prompt);return secret;}}:{})};
  const inv:any={command:'subcommand',interactive:false,outputFormat:json?'json':'text',verbose:false,color:false,project:h.project,positionals};
  return runSubcommand(inv,{io,repoRoot:REPO_ROOT,paths:h.paths,createRuntimeContext:(input:any)=>createCliRuntimeContext({...input,trustVerified:true,keyring})}).then(code=>({code,out:out.join(''),err:err.join(''),prompts}));
}

test('talos provider set-key refuses a wrong key without saving it and saves a key the provider accepts',async()=>hermetic(async h=>{
  const good=dummyKey('cli-good');const wrong=dummyKey('cli-wrong');
  const provider=await startFakeProvider({goodKey:good,models:[]});
  try{
    writeProviderRuntime(h.paths,{openrouter:`${provider.url}/api/v1`});
    const keyring=fakeKeyring();
    const refused=await invoke(h,keyring,['provider','set-key','openrouter'],{json:false,secret:wrong});
    assert.equal(refused.code,11);
    assert.equal(refused.out,`${label('openrouter')} refused the key (HTTP 401). The key was not saved.\n`);
    assert.deepEqual(refused.prompts,['Key for openrouter: '],'the key came from the hidden prompt');
    assert.equal(keyring.entries.size,0);
    const saved=await invoke(h,keyring,['provider','set-key','openrouter'],{secret:good});
    assert.equal(saved.code,0);
    assert.deepEqual(JSON.parse(saved.out),{ok:true,provider:'openrouter',outcome:'valid',httpStatus:200,saved:true});
    assert.ok([...keyring.entries.values()].includes(good));
    assert.deepEqual(provider.requests.map(r=>[r.path,r.authorizedAs]),[['/api/v1/models/user','other'],['/api/v1/models/user','good']]);
    for(const text of [refused.out,refused.err,saved.out,saved.err])for(const key of [good,wrong])assert.equal(text.includes(key),false);
    assert.deepEqual(filesContaining(h.root,good),[]);assert.deepEqual(filesContaining(h.root,wrong),[]);
  }finally{await provider.close();}
}));

test('talos provider env-key: unused until --use, a --decline is remembered, and list never shows the key',async()=>{
  const key=dummyKey('cli-env');
  await hermetic(async h=>{
    const keyring=fakeKeyring();
    const before=await invoke(h,keyring,['provider','env-key','openrouter'],{json:false});
    assert.equal(before.code,0);assert.equal(before.out,'OPENROUTER_API_KEY: not used until approved (talos provider env-key openrouter --use)\n');
    const listed=await invoke(h,keyring,['provider','list']);
    const row=JSON.parse(listed.out).find((entry:any)=>entry.id==='openrouter');
    // R0: since `1fce022b1` (M5-A) `provider list` prints the typed control-plane profile: `auth.{configured,usable,source,environmentVariable}`.
    assert.equal(row.auth.configured,false,'the store does not use it');assert.equal(row.auth.usable,false);
    assert.deepEqual([row.auth.environmentVariable,row.auth.source],['OPENROUTER_API_KEY','environment-unanswered']);
    assert.equal(listed.out.includes(key),false);
    const declined=await invoke(h,keyring,['provider','env-key','openrouter','--decline'],{json:false});
    assert.equal(declined.out,'OPENROUTER_API_KEY: declined, not used\n');
    const declinedRow=JSON.parse((await invoke(h,keyring,['provider','list'])).out).find((entry:any)=>entry.id==='openrouter');
    assert.deepEqual([declinedRow.auth.environmentVariable,declinedRow.auth.source,declinedRow.auth.usable],['OPENROUTER_API_KEY','environment-declined',false]);
    const used=await invoke(h,keyring,['provider','env-key','openrouter','--use'],{json:false});
    assert.equal(used.out,`OPENROUTER_API_KEY: used for ${label('openrouter')}\n`);
    const after=JSON.parse((await invoke(h,keyring,['provider','list'])).out).find((entry:any)=>entry.id==='openrouter');
    assert.equal(after.auth.configured,true);assert.equal(after.auth.usable,true);assert.equal(after.auth.source,'environment');
    assert.equal(fs.readFileSync(path.join(h.paths.dataRoot,'provider-consent.json'),'utf8').includes(key),false);
    const none=await invoke(h,keyring,['provider','env-key','anthropic','--use'],{json:false});
    assert.equal(none.code,2);assert.equal(none.out,`No key for ${label('anthropic')} was found in the environment (set ANTHROPIC_API_KEY).\n`);
    assert.equal(keyring.entries.size,0,'no environment key is copied into the keyring');
  },{processEnv:{OPENROUTER_API_KEY:key}});
});

/* 14/10/2026: «No key for Z.AI (Anthropic endpoint) was found in the environment.» said what was missing and not which variable to
   set — the registry names it (`auth.nomeVariabile`), every name the store reads, in its order. */
test('talos provider env-key without the variable names the variable to set (one, several, and in JSON)',async()=>hermetic(async h=>{
  const keyring=fakeKeyring();
  const zai=await invoke(h,keyring,['provider','env-key','zai-anthropic','--use'],{json:false});
  assert.equal(zai.code,2);
  assert.equal(zai.out,`No key for ${label('zai-anthropic')} was found in the environment (set ZAI_ANTHROPIC_API_KEY).\n`);
  const kimi=await invoke(h,keyring,['provider','env-key','kimi'],{json:false});
  assert.equal(kimi.code,0);
  assert.equal(kimi.out,`No key for ${label('kimi')} was found in the environment (set MOONSHOT_API_KEY or KIMI_API_KEY).\n`);
  const json=JSON.parse((await invoke(h,keyring,['provider','env-key','zai','--use'])).out);
  assert.deepEqual(json,{ok:false,provider:'zai',environmentKey:null,variables:['GLM_API_KEY','ZAI_API_KEY','Z_AI_API_KEY']});
  assert.equal(keyring.entries.size,0);
}));
