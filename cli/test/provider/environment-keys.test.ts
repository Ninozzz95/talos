/*
 * B1 slice 18 — the environment-key consent record and the environment the credential store may see.
 * The fingerprint is checked against an independent HMAC computation; names come from the kernel's registry.
 */
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {createEnvironmentKeyConsent,credentialVariableNames,describeKeyOrigin,environmentKeyFor,keyOriginNotice} from '../../src/provider/environment-keys.ts';
import {dummyKey,hermetic,REPO_ROOT} from './first-run-fixture.ts';

const REGISTRY=(await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href)).REGISTRO_FORNITORI as Record<string,any>;

test('the store sees no provider key, pool or secret-looking variable until the current value is approved',async()=>hermetic(async h=>{
  const openrouter=dummyKey('or');const anthropic=dummyKey('an');
  const env={OPENROUTER_API_KEY:openrouter,ANTHROPIC_API_KEY:anthropic,OPENROUTER_API_KEY_POOL:JSON.stringify([dummyKey('pool')]),SOME_SERVICE_TOKEN:dummyKey('tok'),OLLAMA_BASE_URL:'http://127.0.0.1:11434',PATH:'C:\\Windows'};
  const consent=createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env});
  const before=consent.environmentForStore();
  for(const name of ['OPENROUTER_API_KEY','ANTHROPIC_API_KEY','OPENROUTER_API_KEY_POOL','SOME_SERVICE_TOKEN'])assert.equal(Object.hasOwn(before,name),false,`${name} is withheld`);
  assert.equal(before.OLLAMA_BASE_URL,env.OLLAMA_BASE_URL,'an endpoint is not a secret and passes');
  assert.equal(before.PATH,env.PATH);
  // Every key variable the registry names is covered by the filter.
  for(const id of Object.keys(REGISTRY))for(const name of REGISTRY[id].auth?.nomeVariabile??[])assert.ok(credentialVariableNames(REGISTRY).has(name),`${name} (${id}) is a credential variable`);

  assert.deepEqual(consent.stateFor('openrouter'),{provider:'openrouter',variable:'OPENROUTER_API_KEY',state:'unanswered'});
  consent.answer('openrouter','yes');
  const after=consent.environmentForStore();
  assert.equal(after.OPENROUTER_API_KEY,openrouter,'the approved value passes');
  assert.equal(Object.hasOwn(after,'ANTHROPIC_API_KEY'),false,'approval is per variable');
  assert.equal(Object.hasOwn(after,'OPENROUTER_API_KEY_POOL'),false,'a pool is never offered and never passes');

  // The same variable with a different value is a different key: the approval does not carry over.
  const rotated=createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env:{...env,OPENROUTER_API_KEY:dummyKey('rotated')}});
  assert.equal(rotated.stateFor('openrouter')?.state,'unanswered');
  assert.equal(Object.hasOwn(rotated.environmentForStore(),'OPENROUTER_API_KEY'),false);
}));

test('the record holds a keyed hash and no readable part of the key',async()=>hermetic(async h=>{
  const key=dummyKey('anthropic');
  const consent=createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env:{ANTHROPIC_API_KEY:`  ${key}  `}});
  assert.deepEqual(consent.answer('anthropic','no'),{provider:'anthropic',variable:'ANTHROPIC_API_KEY',state:'declined'});
  const text=fs.readFileSync(consent.files.record,'utf8');
  const hashKey=Buffer.from(fs.readFileSync(consent.files.hashKey,'utf8').trim(),'hex');
  assert.equal(hashKey.length,32);
  // The store trims the value it reads; the fingerprint is of that same trimmed value.
  assert.equal(JSON.parse(text).environmentKeys.ANTHROPIC_API_KEY.fingerprint,`hmac-sha256:${createHmac('sha256',hashKey).update(key).digest('hex')}`);
  for(let size=4;size<=key.length;size++){assert.equal(text.includes(key.slice(-size)),false,`suffix of ${size}`);assert.equal(text.includes(key.slice(0,size)),false,`prefix of ${size}`);}
  // Without the hash key the record proves nothing: a deleted hash key makes every answer unanswered again.
  fs.rmSync(consent.files.hashKey);
  assert.equal(consent.stateFor('anthropic')?.state,'unanswered');
}));

test('a chosen provider must be a registry id, and a damaged record reads as a clean one',async()=>hermetic(async h=>{
  const consent=createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env:{}});
  assert.equal(consent.chosenProvider(),null);
  assert.throws(()=>consent.chooseProvider('not-a-provider'),{code:'PROVIDER_INVALID'});
  assert.throws(()=>consent.chooseProvider('../openrouter'),{code:'PROVIDER_INVALID'});
  consent.chooseProvider('openrouter');assert.equal(consent.chosenProvider(),'openrouter');
  fs.writeFileSync(consent.files.record,'{broken');
  assert.equal(consent.chosenProvider(),null);
  assert.throws(()=>consent.answer('openrouter','yes'),{code:'PROVIDER_ENVIRONMENT_KEY_NOT_FOUND'});
}));

test('the origin statement names the variable, never the value',()=>{
  const env={OPENROUTER_API_KEY:dummyKey('origin')};
  assert.deepEqual(environmentKeyFor(env,REGISTRY,'openrouter'),{variable:'OPENROUTER_API_KEY',value:env.OPENROUTER_API_KEY});
  const origin=describeKeyOrigin({registry:REGISTRY,provider:'openrouter',publicRow:{requiresKey:true,origineChiave:'ambiente'},storeEnv:env,mode:'use'})!;
  const label=String(REGISTRY.openrouter.etichetta);
  assert.equal(keyOriginNotice(origin),`Key for ${label}: environment variable OPENROUTER_API_KEY, used without asking because this run is non-interactive.`);
  assert.equal(keyOriginNotice(describeKeyOrigin({registry:REGISTRY,provider:'openrouter',publicRow:{requiresKey:true,origineChiave:'custodia'},storeEnv:env,mode:'use'})!),`Key for ${label}: saved in the system keyring.`);
  assert.equal(describeKeyOrigin({registry:REGISTRY,provider:'openrouter',publicRow:{requiresKey:true,origineChiave:null},storeEnv:{},mode:'use'})?.origin,'none');
  assert.equal(describeKeyOrigin({registry:REGISTRY,provider:'ollama',publicRow:{requiresKey:false},storeEnv:{},mode:'use'})?.origin,'not-required');
});

/*
 * B1 slice 18, fix round — condition 8, measured on Windows by the coordinator: `OpenRouter_Api_Key` set in `process.env` is found
 * by `stateFor` (Windows looks names up case-insensitively) and recorded as approved, but the store saw NO key, because the
 * filter compared names case-sensitively. The screen then said the key "will be used" and at once "still has no usable key".
 */
test('win32: an approved key whose variable name differs in case reaches the store under the canonical name; unapproved variants are removed',{skip:process.platform!=='win32'?'Windows environment names are case-insensitive only on win32':false},async()=>{
  const approved=dummyKey('case-openrouter');const unapproved=dummyKey('case-anthropic');const pool=JSON.stringify([dummyKey('case-pool')]);
  await hermetic(async h=>{
    const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
    const {fakeKeyring}=await import('./first-run-fixture.ts');
    assert.equal(process.env.OPENROUTER_API_KEY,approved,'precondition: Windows finds the variable under the canonical name');
    const consent=createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env:process.env});
    assert.deepEqual(consent.stateFor('openrouter'),{provider:'openrouter',variable:'OPENROUTER_API_KEY',state:'unanswered'});
    consent.answer('openrouter','yes');
    const store=consent.environmentForStore();
    assert.equal(store.OPENROUTER_API_KEY,approved,'the approved value, under the registry\'s canonical name');
    const upper=Object.keys(store).map(name=>name.toUpperCase());
    assert.equal(upper.filter(name=>name==='OPENROUTER_API_KEY').length,1,'one spelling only');
    assert.equal(upper.includes('ANTHROPIC_API_KEY'),false,'an unapproved provider key, in any case, is removed');
    assert.equal(upper.includes('OPENROUTER_API_KEY_POOL'),false,'a pool, in any case, is removed');
    // A plain copy of the environment (what the screen's tests and any `{...process.env}` caller hand over) keeps the spelling it
    // was set with and has no case-insensitive lookup of its own: the same answer must come out of it.
    const copied=createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env:{...process.env}});
    assert.deepEqual(copied.stateFor('openrouter'),{provider:'openrouter',variable:'OPENROUTER_API_KEY',state:'approved'},'a plain copy finds the variant too');
    const fromCopy=copied.environmentForStore();
    assert.equal(fromCopy.OPENROUTER_API_KEY,approved,'and hands the store the canonical name');
    assert.deepEqual(Object.keys(fromCopy).filter(name=>/^(OPENROUTER_API_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY_POOL)$/iu.test(name)),['OPENROUTER_API_KEY'],'no other spelling of a key or pool survives');

    const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openrouter:x',env:process.env,environmentKeys:'consent',keyring:fakeKeyring()} as any);
    assert.equal(context.providerStore.getKey('openrouter'),approved,'the store sees the approved key');
    assert.equal(context.providerStore.getKey('anthropic'),null,'and not the unapproved one');
    const row=(await context.tuiCatalog.listProviders()).find((entry:any)=>entry.id==='openrouter');
    assert.equal(row.configured,true);assert.equal(row.keySource,'environment');
  },{processEnv:{OpenRouter_Api_Key:approved,Anthropic_Api_Key:unapproved,openrouter_api_key_pool:pool}});
});

test('F-H-001: the non-interactive environment keeps everything but a declined key (and its pool), in any spelling',async()=>hermetic(async h=>{
  const declined=dummyKey('declined');const approved=dummyKey('approved');
  const env={OpenRouter_Api_Key:declined,OPENROUTER_API_KEY_POOL:JSON.stringify([dummyKey('pool')]),ANTHROPIC_API_KEY:approved,DEEPSEEK_API_KEY:dummyKey('unanswered'),PATH:'C:\Windows'};
  const consent=createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env,platform:'win32'});
  assert.deepEqual(consent.environmentForUse(),env,'nothing declined: the whole environment, as before');
  consent.answer('openrouter','no');consent.answer('anthropic','yes');
  const out=consent.environmentForUse();
  assert.equal(Object.keys(out).some(name=>name.toUpperCase()==='OPENROUTER_API_KEY'),false,'the declined variable is gone in every spelling');
  assert.equal(Object.hasOwn(out,'OPENROUTER_API_KEY_POOL'),false,'and its pool with it');
  assert.equal(out.ANTHROPIC_API_KEY,approved);assert.equal(typeof out.DEEPSEEK_API_KEY,'string','unanswered stays usable without asking');
  assert.equal(out.PATH,env.PATH);
}));
