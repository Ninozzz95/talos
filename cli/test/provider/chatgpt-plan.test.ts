/*
 * «Continue with ChatGPT» in the CLI (owner 13/10/2026). The sign-in itself is the kernel's (harness-ui/src/chatgpt-accesso.mjs, tested
 * there); what the CLI adds is tested here, with a fake OpenAI and a memory keyring, never the real service:
 *  - its OWN custody (keyring service `talos-cli-chatgpt`), apart from the desktop's;
 *  - one renewal at a time ACROSS PROCESSES: the refresh token rotates at every use, so two TALOS renewing together would burn it and
 *    the loser would delete a session that is good. Hermes takes a cross-process lock and saves by compare-and-swap
 *    (hermes_cli/auth_codex.py:102-111, :227), Pi locks its auth file (packages/coding-agent/src/core/auth-storage.ts:69-102), Codex
 *    reloads the file another process may have renewed before renewing (codex-rs/login/src/auth/manager.rs:1855-1997).
 */
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,utimesSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {REPO_ROOT} from './first-run-fixture.ts';
import {fakeOpenAi,followSignIn,signIn} from './chatgpt-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import {scopeCliKeyring} from '../../src/runtime/talos-composition.ts';
import {CHATGPT_KEYRING_SERVICE,REFRESH_LOCK_FILE,openChatgptPlan} from '../../src/provider/chatgpt-plan.ts';

function world(t:{after:(fn:()=>void)=>void}){
  const dataRoot=mkdtempSync(path.join(tmpdir(),'talos-chatgpt-'));t.after(()=>rmSync(dataRoot,{recursive:true,force:true}));
  const raw=createMemoryKeyring(dataRoot);
  return{dataRoot,raw,keyring:scopeCliKeyring(raw)!};
}
test('the CLI signs in to the ChatGPT plan through the kernel\'s flow and keeps its own custody',async t=>{
  let clock=1_800_000_000_000;const now=()=>clock;
  const w=world(t);const fake=fakeOpenAi({now});
  const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,clock:now});
  assert.ok(plan,'with a keyring the plan can be connected');
  assert.deepEqual(plan.state(),{connected:false,email:null,planEnabled:false,signingIn:false,usageUrl:'https://chatgpt.com/settings/usage'});
  const {started,page,outcome}=await signIn(plan,fake);
  assert.match(started.url,/^https:\/\/auth\.openai\.com\/api\/accounts\/authorize\?/u);
  assert.match(new URL(started.url).searchParams.get('redirect_uri')!,/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/u,'the loopback is the IP literal on a port the system picked');
  assert.equal(page.status,200);
  assert.deepEqual(outcome,{ok:true,email:'nino@example.com',planEnabled:true});
  assert.deepEqual(plan.state(),{connected:true,email:'nino@example.com',planEnabled:true,signingIn:false,usageUrl:'https://chatgpt.com/settings/usage'});
  assert.equal(await plan.accessToken(),'ACCESS-1');
  assert.doesNotMatch(JSON.stringify(plan.state()),/ACCESS|REFRESH/u,'what the screen can know never carries a token');
  /* its own custody: the CLI's service, not the desktop's */
  assert.equal(CHATGPT_KEYRING_SERVICE,'talos-cli-chatgpt');
  assert.ok(w.raw.get('talos-cli-chatgpt','sessione:indice'),'the session is in the CLI\'s keyring service');
  assert.equal(w.raw.get('talos-harness-chatgpt','sessione:indice'),null,'nothing is written to the desktop\'s service');
  /* the plan's own model list, only what the service lists */
  const models=await plan.models();
  assert.deepEqual(models.map(model=>model.id),['chatgpt:gpt-5.5'],'only what the service lists, with the provider in the id');
  assert.equal(fake.calls.find(c=>c.url.endsWith('/v1/models'))?.authorization,'Bearer ACCESS-1');
  const out=await plan.signOut();
  assert.equal(out.revoked,true);
  assert.equal(plan.state().connected,false);
  await assert.rejects(plan.accessToken(),{code:'CHATGPT_NON_COLLEGATO'});
});

test('two TALOS that must renew at the same moment renew ONCE, and neither loses the session',async t=>{
  let clock=1_800_000_000_000;const now=()=>clock;
  const w=world(t);const fake=fakeOpenAi({now,slowRenewal:150});
  const open=()=>openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,clock:now});
  const first=await open();const second=await open();
  await signIn(first,fake);
  assert.equal(await second!.accessToken(),'ACCESS-1','the second process reads the session the first one stored');
  clock+=3_590_000;/* ten seconds before the hour: both must renew */
  const [a,b]=await Promise.all([first!.accessToken(),second!.accessToken()]);
  assert.equal(fake.renewals(),1,'one renewal for the two of them');
  assert.equal(a,'ACCESS-2');assert.equal(b,'ACCESS-2');
  assert.equal(first!.state().connected,true);assert.equal(second!.state().connected,true);
  assert.equal(existsSync(path.join(w.dataRoot,REFRESH_LOCK_FILE)),false,'the lock is released');
});

test('a renewal lock left by a TALOS that died is taken over, and a live one is waited for',async t=>{
  let clock=1_800_000_000_000;const now=()=>clock;
  const w=world(t);const fake=fakeOpenAi({now});
  const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,clock:now,lock:{staleMs:200,retryMs:20,timeoutMs:3000}});
  await signIn(plan,fake);
  clock+=3_590_000;
  /* a lock whose writer is gone: a process id that is not running, written long ago */
  writeFileSync(path.join(w.dataRoot,REFRESH_LOCK_FILE),JSON.stringify({pid:2_147_483_000,at:Date.now()-60_000}));
  assert.equal(await plan!.accessToken(),'ACCESS-2');
  assert.equal(existsSync(path.join(w.dataRoot,REFRESH_LOCK_FILE)),false);
  /* a lock nobody releases in time: the renewal says so and does not delete the session */
  clock+=3_590_000;
  writeFileSync(path.join(w.dataRoot,REFRESH_LOCK_FILE),JSON.stringify({pid:process.pid,at:Date.now()}));
  const stuck=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,clock:now,lock:{staleMs:60_000,retryMs:20,timeoutMs:200}});
  await assert.rejects(stuck!.accessToken(),{code:'CHATGPT_RINNOVO_FALLITO'});
  assert.equal(stuck!.state().connected,true,'a renewal that could not start does not throw the session away');
  assert.equal(fake.renewals(),1);
});

test('without a keyring the plan cannot be connected, and says so',async t=>{
  const w=world(t);
  assert.equal(await openChatgptPlan({repoRoot:REPO_ROOT,keyring:null,dataRoot:w.dataRoot}),null);
});

/* ── bugfixer review of 13/10/2026 ───────────────────────────────────────────────────────────────────────────────────────────── */
const JWT_SHAPE=/eyJ[A-Za-z0-9_-]{10,}\./u;
const soon=<T>(promise:Promise<T>,ms=1500):Promise<T|'still waiting'>=>Promise.race([promise,new Promise<'still waiting'>(resolve=>setTimeout(()=>resolve('still waiting'),ms))]);

test('finding 1: a sign-in started while signed in never carries the previous identity token in its address',async t=>{
  const w=world(t);const fake=fakeOpenAi();
  const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl});
  await signIn(plan,fake);
  const again=await plan!.start();
  const asked=new URL(again.url).searchParams;
  assert.equal(asked.get('id_token_hint'),null,'the address is printed and shown: no token in it');
  assert.doesNotMatch(again.url,JWT_SHAPE);
  assert.equal(asked.get('login_hint'),'nino@example.com','who signs in again is still suggested');
  await followSignIn(again.url,fake);
  assert.deepEqual(await again.outcome,{ok:true,email:'nino@example.com',planEnabled:true},'the sign-in still completes');
});

test('finding 2a: a lock held by a TALOS that is alive is never taken over on a minute of age',async t=>{
  let clock=1_800_000_000_000;const now=()=>clock;
  const w=world(t);const fake=fakeOpenAi({now});
  const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,clock:now,lock:{retryMs:20,timeoutMs:200}});
  await signIn(plan,fake);clock+=3_590_000;
  const held=JSON.stringify({pid:process.pid,at:Date.now()-120_000,token:'the-other-talos'});
  writeFileSync(path.join(w.dataRoot,REFRESH_LOCK_FILE),held);
  await assert.rejects(plan!.accessToken(),{code:'CHATGPT_RINNOVO_FALLITO'});
  assert.equal(fake.renewals(),0,'nothing was sent with a refresh token another TALOS may be using');
  assert.equal(readFileSync(path.join(w.dataRoot,REFRESH_LOCK_FILE),'utf8'),held,'its lock is left alone');
});

test('finding 2b: a takeover is done by one TALOS at a time',async t=>{
  let clock=1_800_000_000_000;const now=()=>clock;
  const w=world(t);const fake=fakeOpenAi({now});
  const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,clock:now,lock:{retryMs:20,timeoutMs:200}});
  await signIn(plan,fake);clock+=3_590_000;
  const dead=JSON.stringify({pid:2_147_483_000,at:Date.now()-60_000});
  writeFileSync(path.join(w.dataRoot,REFRESH_LOCK_FILE),dead);
  /* another TALOS is in the middle of taking that lock over */
  writeFileSync(path.join(w.dataRoot,`${REFRESH_LOCK_FILE}.takeover`),JSON.stringify({pid:process.pid,at:Date.now()}));
  await assert.rejects(plan!.accessToken(),{code:'CHATGPT_RINNOVO_FALLITO'});
  assert.equal(readFileSync(path.join(w.dataRoot,REFRESH_LOCK_FILE),'utf8'),dead,'the lock is not removed under the other one');
  assert.equal(fake.renewals(),0);
  /* the other one is done: the takeover goes through */
  rmSync(path.join(w.dataRoot,`${REFRESH_LOCK_FILE}.takeover`));
  assert.equal(await plan!.accessToken(),'ACCESS-2');
  assert.equal(existsSync(path.join(w.dataRoot,`${REFRESH_LOCK_FILE}.takeover`)),false,'nothing is left behind');
});

test('finding 2c: a renewal releases only its own lock',async t=>{
  let clock=1_800_000_000_000;const now=()=>clock;
  const w=world(t);const fake=fakeOpenAi({now,slowRenewal:200});
  const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,clock:now});
  await signIn(plan,fake);clock+=3_590_000;
  const file=path.join(w.dataRoot,REFRESH_LOCK_FILE);
  const renewing=plan!.accessToken();
  for(let i=0;i<100&&!existsSync(file);i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(existsSync(file),true,'the renewal holds the lock');
  /* the lock changed hands while the renewal was in flight */
  const other=JSON.stringify({pid:process.pid,at:Date.now(),token:'the-other-talos'});
  writeFileSync(file,other);
  assert.equal(await renewing,'ACCESS-2');
  assert.equal(existsSync(file)&&readFileSync(file,'utf8'),other,'the lock of the other TALOS is still there');
});

test('finding 3: an empty lock file left behind is taken over once it is old, and a fresh one is waited for',async t=>{
  let clock=1_800_000_000_000;const now=()=>clock;
  const w=world(t);const fake=fakeOpenAi({now});
  const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,clock:now,lock:{retryMs:20,timeoutMs:300}});
  await signIn(plan,fake);clock+=3_590_000;
  const file=path.join(w.dataRoot,REFRESH_LOCK_FILE);
  writeFileSync(file,'');
  await assert.rejects(plan!.accessToken(),{code:'CHATGPT_RINNOVO_FALLITO'},'just created: it may be being written');
  const old=new Date(Date.now()-60_000);utimesSync(file,old,old);
  assert.equal(await plan!.accessToken(),'ACCESS-2');
  assert.equal(existsSync(file),false);
});

test('a sign-in always ends: cancelled, replaced by a second one, or out of time',async t=>{
  const w=world(t);const fake=fakeOpenAi();
  const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,signInTimeoutMs:300});
  const first=await plan!.start();
  plan!.cancel();
  assert.deepEqual(await soon(first.outcome),{ok:false,code:'CHATGPT_ACCESSO_ANNULLATO'},'cancel ends the outcome');
  assert.equal(plan!.state().signingIn,false);
  const second=await plan!.start();const third=await plan!.start();
  assert.deepEqual(await soon(second.outcome),{ok:false,code:'CHATGPT_ACCESSO_ANNULLATO'},'a second start tells the first');
  assert.deepEqual(await soon(third.outcome,2500),{ok:false,code:'CHATGPT_TENTATIVO_SCADUTO'},'nobody came back: it says so (the kernel’s own code since r4 dbae665ea; on screen CHATGPT_SIGN_IN_TIMEOUT)');
  assert.equal(plan!.state().signingIn,false);
});

test('finding 7: two sign-ins started together leave ONE listener, and the first is told at once',async t=>{
  const w=world(t);const fake=fakeOpenAi();
  const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,signInTimeoutMs:5000});
  const [a,b]=await Promise.all([plan!.start(),plan!.start()]);
  assert.deepEqual(await soon(a.outcome),{ok:false,code:'CHATGPT_ACCESSO_ANNULLATO'});
  await assert.rejects(fetch(new URL(a.url).searchParams.get('redirect_uri')!),'the first local address is closed');
  await followSignIn(b.url,fake);
  assert.deepEqual(await b.outcome,{ok:true,email:'nino@example.com',planEnabled:true});
});

test('finding 8 and 9: signing out ends a sign-in under way; a sign-in cancels itself, never a newer one',async t=>{
  const w=world(t);const fake=fakeOpenAi();
  const plan=await openChatgptPlan({repoRoot:REPO_ROOT,keyring:w.keyring,dataRoot:w.dataRoot,fetchImpl:fake.fetchImpl,signInTimeoutMs:5000});
  const pending=await plan!.start();
  await plan!.signOut();
  assert.deepEqual(await soon(pending.outcome),{ok:false,code:'CHATGPT_ACCESSO_ANNULLATO'});
  const older=await plan!.start();const newer=await plan!.start();
  (older as any).cancel?.();
  assert.equal(plan!.state().signingIn,true,'the newer sign-in is still waiting');
  await followSignIn(newer.url,fake);
  assert.deepEqual(await newer.outcome,{ok:true,email:'nino@example.com',planEnabled:true});
  const own=await plan!.start();assert.equal(typeof (own as any).cancel,'function','a sign-in has its own cancel');(own as any).cancel();
  assert.deepEqual(await soon(own.outcome),{ok:false,code:'CHATGPT_ACCESSO_ANNULLATO'});assert.equal(plan!.state().signingIn,false);
});
