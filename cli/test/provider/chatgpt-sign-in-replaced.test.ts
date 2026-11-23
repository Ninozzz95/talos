/*
 * F-Y-003 (stress test of 0.6.4, S3): a second `provider login chatgpt` in ANOTHER TALOS left the first waiting on its own listener —
 * two sign-ins alive on one profile. The kernel's rule («un secondo accesso chiude il primo», chatgpt-accesso.mjs) holds inside one
 * process; across processes the sign-in under way is named in the data folder and the one it no longer names closes itself, as
 * Codex's login server is told to stop by the next login (`/cancel`, codex-rs/login/src/server.rs). Two plan objects on one data
 * folder stand for the two processes (each start takes its own random token; the pid is not what decides).
 */
import assert from 'node:assert/strict';
import {chmodSync,existsSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {REPO_ROOT} from './first-run-fixture.ts';
import {fakeOpenAi} from './chatgpt-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import {scopeCliKeyring} from '../../src/runtime/talos-composition.ts';
import {SIGN_IN_FILE,openChatgptPlan} from '../../src/provider/chatgpt-plan.ts';
import {chatgptFailureText} from '../../src/commands/provider-chatgpt.ts';

const portOf=(url:string)=>Number(new URL(new URL(url).searchParams.get('redirect_uri')!).port);
const listening=async(port:number)=>{try{await fetch(`http://127.0.0.1:${port}/favicon.ico`,{signal:AbortSignal.timeout(2000)});return true;}catch{return false;}};

test('a sign-in started in another TALOS closes the one already waiting; the newer one goes on, and the file goes with the last',async t=>{
  const dataRoot=mkdtempSync(path.join(tmpdir(),'talos-chatgpt-replace-'));t.after(()=>rmSync(dataRoot,{recursive:true,force:true}));
  const open=()=>openChatgptPlan({repoRoot:REPO_ROOT,keyring:scopeCliKeyring(createMemoryKeyring(dataRoot))!,dataRoot,fetchImpl:fakeOpenAi({now:()=>Date.now()}).fetchImpl});
  const first=(await open())!,second=(await open())!;
  const a=await first.start();t.after(()=>a.cancel());/* a failing check never leaves a listener open for ten minutes */
  assert.ok(existsSync(path.join(dataRoot,SIGN_IN_FILE)),'the sign-in under way is named in the data folder');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(path.join(dataRoot,SIGN_IN_FILE),'utf8'))).sort(),['at','pid','token'],'a pid, a random token and a time: no address, no state, no secret');
  assert.equal(await listening(portOf(a.url)),true,'the first one listens');
  const b=await second.start();t.after(()=>b.cancel());
  const outcome=await Promise.race([a.outcome,new Promise(resolve=>setTimeout(()=>resolve('still waiting'),3000))]);
  assert.deepEqual(outcome,{ok:false,code:'CHATGPT_SIGN_IN_REPLACED'},'the first sign-in is told it was replaced');
  assert.equal(await listening(portOf(a.url)),false,'its listener is closed');
  assert.ok(existsSync(path.join(dataRoot,SIGN_IN_FILE)),'the replaced sign-in leaves the file of the newer one where it is');
  assert.equal(await listening(portOf(b.url)),true,'the newer one still listens');
  assert.match(chatgptFailureText('CHATGPT_SIGN_IN_REPLACED'),/a newer ChatGPT sign-in started in another TALOS/u);
  b.cancel();assert.deepEqual(await b.outcome,{ok:false,code:'CHATGPT_ACCESSO_ANNULLATO'});
  assert.equal(existsSync(path.join(dataRoot,SIGN_IN_FILE)),false,'the last sign-in to end takes the file away');
});

test('a file left by a TALOS that died is overwritten, and a sign-in is never replaced by itself',async t=>{
  const dataRoot=mkdtempSync(path.join(tmpdir(),'talos-chatgpt-stale-'));t.after(()=>rmSync(dataRoot,{recursive:true,force:true}));
  writeFileSync(path.join(dataRoot,SIGN_IN_FILE),JSON.stringify({pid:999999,token:'left-behind',at:1}));
  const plan=(await openChatgptPlan({repoRoot:REPO_ROOT,keyring:scopeCliKeyring(createMemoryKeyring(dataRoot))!,dataRoot,fetchImpl:fakeOpenAi({now:()=>Date.now()}).fetchImpl}))!;
  const started=await plan.start();t.after(()=>started.cancel());
  const still=await Promise.race([started.outcome,new Promise(resolve=>setTimeout(()=>resolve('still waiting'),1500))]);
  assert.equal(still,'still waiting','three looks at the file later it is still the one under way');
  assert.notEqual(JSON.parse(readFileSync(path.join(dataRoot,SIGN_IN_FILE),'utf8')).token,'left-behind');
  started.cancel();await started.outcome;
});

/* the second review of 0.6.6 (N8): when the mark cannot be written (the other TALOS holds the file: EPERM on Windows, here a
   read-only file), the old mark stays readable — a watch would read it and close this, the NEWER sign-in. No mark, no watch. */
test('a sign-in whose mark cannot be written is not closed by the old mark, and leaves no temporary file',async t=>{
  const dataRoot=mkdtempSync(path.join(tmpdir(),'talos-chatgpt-unwritable-'));
  const file=path.join(dataRoot,SIGN_IN_FILE);
  t.after(()=>{try{chmodSync(file,0o666);}catch{/* gone */}rmSync(dataRoot,{recursive:true,force:true});});
  writeFileSync(file,JSON.stringify({pid:process.pid,token:'older-sign-in',at:1}));chmodSync(file,0o444);
  const plan=(await openChatgptPlan({repoRoot:REPO_ROOT,keyring:scopeCliKeyring(createMemoryKeyring(dataRoot))!,dataRoot,fetchImpl:fakeOpenAi({now:()=>Date.now()}).fetchImpl}))!;
  const started=await plan.start();t.after(()=>started.cancel());
  const still=await Promise.race([started.outcome,new Promise(resolve=>setTimeout(()=>resolve('still waiting'),1500))]);
  assert.equal(still,'still waiting','not closed by a mark it could not replace');
  assert.equal(JSON.parse(readFileSync(file,'utf8')).token,'older-sign-in','the file could not be written');
  assert.deepEqual(readdirSync(dataRoot).filter(name=>name.endsWith('.tmp')),[],'no temporary file left');
  started.cancel();await started.outcome;
});
