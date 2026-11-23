/*
 * Adversarial review of 0.6.0 (bugfixer, 13/10/2026): «provider commands work from any folder» (29a4e1d6f) is proven in
 * provider-any-folder.test.ts with a `createRuntimeContext` that is a FAKE of the trust gate. Nothing ran the command through
 * the REAL entry (`runtime/create-runtime.ts` `createCliRuntimeContext`: the real gate, the real composition on the neutral
 * folder) — the same shape as the defect that escaped in 0.6.0, where every test handed the app something other than what the
 * program hands it. Here the two commands go through the real one, on a hermetic profile, with no network.
 *
 * Test 1 is a MEASURE (green on 13/10/2026): the real gate refuses the folder, the real composition is built on TALOS's own
 * folder, the folder's configuration is not read, nothing is written in either folder and no trust is recorded.
 * Test 2 was RED on 13/10/2026, cured in 0.6.1 (owner «Funziona ovunque»: `model list` goes through `providerRuntimeContext`).
 * The finding as it was in 0.6.0: after a sign-in from such a folder TALOS says «See its models with `talos model list --provider
 * chatgpt`» (i18n `key.chatgpt.login.next`, and the 0.6.0 changelog), and that command, in the same folder, was refused with
 * PROJECT_TRUST_REQUIRED. `model list` reads nothing of the project and writes nothing (`model use` is the one that writes a
 * choice, and it never asks the gate at all).
 * Tests 3 and 4 are from the review of 0.6.1 (13/10/2026; were RED that day, cured after 0.6.1): the `--json` form's notice, and
 * the neutral folder refused when something was planted in it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {hermetic,listFiles,type Hermetic} from '../provider/first-run-fixture.ts';
import {runModelCommand,runProviderCommand} from '../../src/commands/provider-cli.ts';
import {createCliRuntimeContext} from '../../src/runtime/create-runtime.ts';
import {assessProjectTrust} from '../../src/security/project-trust-gate.ts';

/** A folder the real gate refuses: it holds a project file nobody reviewed. That file would also choose the credential store. */
function untrusted(h:Hermetic){
  fs.mkdirSync(path.join(h.project,'.talos-cli'),{recursive:true});
  fs.writeFileSync(path.join(h.project,'.talos-cli','config.json'),JSON.stringify({version:1,credentials:{store:'memory'}})+'\n');
}
async function bench(h:Hermetic,run:(ctx:any)=>Promise<number>,{format='text'}:{format?:'text'|'json'}={}){
  const asked:any[]=[];const built:any[]=[];const out:string[]=[];const err:string[]=[];
  const ctx:any={invocation:{outputFormat:format},io:{writeOut:(text:string)=>out.push(text),writeErr:(text:string)=>err.push(text),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:h.project,paths:h.paths,repoRoot:undefined,
    createRuntimeContext:async(input:any)=>{asked.push(input);const {repoRoot:_none,...rest}=input;const context=await createCliRuntimeContext(rest);built.push(context);return context;}};
  try{return{code:await run(ctx),asked,built,out:out.join(''),err,errText:()=>err.join('')};}
  finally{for(const context of built)await context.runtime.close?.().catch(()=>{});}
}

test('through the real gate and the real composition: a provider command in a folder that is not trusted runs on TALOS\'s own folder and reads nothing of that one',{timeout:120_000},async()=>hermetic(async h=>{
  untrusted(h);const before=listFiles(h.project);
  await assert.rejects(createCliRuntimeContext({projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',environmentKeys:'consent'}),{code:'PROJECT_TRUST_REQUIRED'},'the real gate refuses this folder');
  const done=await bench(h,ctx=>runProviderCommand(ctx,['list']));
  assert.equal(done.code,0,done.out);
  assert.equal(done.asked.length,2);assert.equal(done.asked[0].projectRoot,h.project);assert.equal(done.asked[0].trustVerified,undefined);
  const neutral=path.join(h.paths.dataRoot,'no-project');
  assert.equal(done.asked[1].projectRoot,neutral);assert.equal(done.built.length,1,'only the neutral folder got a runtime');
  const plan=JSON.parse(done.out).find((row:any)=>row.id==='chatgpt');
  assert.equal(plan?.ready,false,'the real control plane answered');
  /* ⛔ Review of 0.6.1 (13/10/2026): this line cannot fail under the test runner — measured, the store's source is `test-profile`
     even when the same folder IS vouched for, so the planted `credentials.store` shows nothing either way. What proves that the
     folder's configuration is not read is above: the one runtime that was built was asked for TALOS's own folder, never this one. */
  assert.notEqual(done.built[0].credentialStore?.source,'config','the configuration of the folder that is not trusted chose the credential store');
  assert.deepEqual(listFiles(h.project),before,'nothing was written in the person\'s folder');
  assert.deepEqual(fs.readdirSync(neutral),[],'TALOS\'s own folder is still empty: the next command finds nothing of a project there either');
  assert.equal((await assessProjectTrust({projectRoot:h.project,trustRoot:h.paths.trust.projects})).trusted,false,'no trust was recorded for it');
  assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
}));

test('the command the sign-in tells the person to run next, `talos model list --provider chatgpt`, answers in the folder where the sign-in ran',{timeout:120_000},async()=>hermetic(async h=>{
  untrusted(h);
  const done=await bench(h,ctx=>runModelCommand(ctx,['list','--provider','chatgpt']));
  assert.equal(done.code,0);
  assert.match(done.out,/talos provider login chatgpt/u,'nobody signed in here: it says how, as it does in a trusted folder');
  assert.deepEqual(fs.readdirSync(path.join(h.paths.dataRoot,'no-project')),[],'and TALOS\'s own folder is still empty after it: the next command is not refused');
}));

test('`talos model list --provider chatgpt --json` with nobody signed in: stdout is `[]`, and stderr says how to sign in',{timeout:120_000},async()=>hermetic(async h=>{
  untrusted(h);
  const done=await bench(h,ctx=>runModelCommand(ctx,['list','--provider','chatgpt']),{format:'json'});
  assert.equal(done.code,0);
  assert.deepEqual(JSON.parse(done.out),[],'stdout is valid JSON: the rows, nothing else');
  assert.match(done.errText(),/talos provider login chatgpt/u,'the hint the text form gives is on stderr');
  assert.deepEqual(h.network.blocked,[]);
}));

test('through the real gate: a configuration planted in TALOS\'s own folder is not loaded as a trusted project\'s; the command is refused',{timeout:120_000},async()=>hermetic(async h=>{
  untrusted(h);
  const neutral=path.join(h.paths.dataRoot,'no-project');
  fs.mkdirSync(path.join(neutral,'.talos-cli'),{recursive:true});
  fs.writeFileSync(path.join(neutral,'.talos-cli','config.json'),JSON.stringify({version:1,credentials:{store:'memory'}})+'\n');
  const before=listFiles(neutral);
  for(const run of [(ctx:any)=>runProviderCommand(ctx,['list']),(ctx:any)=>runModelCommand(ctx,['list','--provider','chatgpt'])]){
    const asked:any[]=[];const built:any[]=[];const err:string[]=[];
    const ctx:any={invocation:{outputFormat:'text'},io:{writeOut(){},writeErr:(text:string)=>err.push(text),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
      projectRoot:h.project,paths:h.paths,repoRoot:undefined,
      createRuntimeContext:async(input:any)=>{asked.push(input);const {repoRoot:_none,...rest}=input;const context=await createCliRuntimeContext(rest);built.push(context);return context;}};
    try{
      await assert.rejects(run(ctx),{code:'PROVIDER_NEUTRAL_FOLDER_UNSAFE'});
      assert.equal(asked.length,1,'only the person\'s folder was tried, and refused by the gate');assert.equal(built.length,0,'no runtime was built on the planted folder');
      assert.ok(err.join('').includes(neutral),'the folder is named');
    }finally{for(const context of built)await context.runtime.close?.().catch(()=>{});}
  }
  assert.deepEqual(listFiles(neutral),before,'TALOS did not touch what it found there: the person looks at it');
  /* what the person reads */
  const {describeError}=await import('../../src/i18n/error-view.ts');
  const view=describeError(Object.assign(new Error('PROVIDER_NEUTRAL_FOLDER_UNSAFE'),{code:'PROVIDER_NEUTRAL_FOLDER_UNSAFE'}));
  assert.match(view.what,/no-project/u);assert.match(view.what,/link|has something in it/u);assert.match(view.todo??'',/trusted folder/u);
}));

/* The check above makes an entry in TALOS's own folder a refusal of the NEXT account command, so no account command may leave one
   there. Measured through the real composition for the commands that need no terminal and no network (a sign-in in the browser is
   not among them: chatgpt-cli.test.ts runs it in a trusted folder). A command may fail here for its own reasons; the folder is what
   is looked at. */
test('no account command leaves anything in TALOS\'s own folder, so the next one is not refused',{timeout:180_000},async()=>hermetic(async h=>{
  untrusted(h);const neutral=path.join(h.paths.dataRoot,'no-project');
  const commands:Array<[string,(ctx:any)=>Promise<number>]>=[
    ['provider list',ctx=>runProviderCommand(ctx,['list'])],['provider status chatgpt',ctx=>runProviderCommand(ctx,['status','chatgpt'])],
    ['provider logout chatgpt',ctx=>runProviderCommand(ctx,['logout','chatgpt'])],['provider exclusions',ctx=>runProviderCommand(ctx,['exclusions'])],
    ['provider env-key openai',ctx=>runProviderCommand(ctx,['env-key','openai'])],['provider test openai',ctx=>runProviderCommand(ctx,['test','openai'])],
    ['model list',ctx=>runModelCommand(ctx,['list'])],['model list --provider chatgpt',ctx=>runModelCommand(ctx,['list','--provider','chatgpt'])],
  ];
  for(const [name,run] of commands){
    let refused:unknown=null;
    try{await bench(h,run);}catch(error){refused=(error as any)?.code??String(error);}
    assert.notEqual(refused,'PROVIDER_NEUTRAL_FOLDER_UNSAFE',`${name}: refused because an earlier command left something behind`);
    assert.deepEqual(fs.readdirSync(neutral),[],`${name} left something in TALOS's own folder`);
  }
}));
