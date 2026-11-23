/*
 * «Continue with ChatGPT» in the CLI (owner 13/10/2026), through the REAL composition: the provider's state, the sign-in from the
 * catalog the screen and the command use, the plan's model list, one turn the plan pays, and signing out. OpenAI is the fake of
 * `chatgpt-fixture.ts`; nothing here reaches the real service, and never the owner's plan.
 *
 * What the others do, read in the clones: Codex prints the address and "If your browser did not open, navigate to this URL", and
 * `codex logout` revokes (codex-rs/cli/src/login.rs:117-119, :128, clone of 24/09/2026); OpenCode says "Go to:", "Waiting for
 * authorization..." and "Login successful", and has `auth logout` (packages/opencode/src/cli/cmd/providers.ts:99-131, :532);
 * Hermes keeps its own session apart from the Codex CLI's (hermes_cli/auth_codex.py:945-975, clone of 07/10/2026).
 */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {hermetic,REPO_ROOT,type Hermetic} from './first-run-fixture.ts';
import {fakeOpenAi,followSignIn,installFakeOpenAi,PLAN_MODEL,SCOPES_WITHOUT_PLAN,type FakeOpenAi} from './chatgpt-fixture.ts';
import {runTurn} from '../runtime/r5a-r-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import {USAGE_FILE} from '../../src/provider/chatgpt-plan.ts';
import {runProviderCommand} from '../../src/commands/provider-cli.ts';
import {describeError,displayCode} from '../../src/i18n/error-view.ts';
import {collectHeadlessRun} from '../../src/headless/run.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';

const API_KEY='sk-THE-API-KEY-THAT-MUST-NOT-PAY';
async function compose(h:Hermetic,keyring:any=createMemoryKeyring(h.paths.dataRoot)):Promise<any>{
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:PLAN_MODEL,env:{...process.env},environmentKeys:'consent',keyring} as any);
  await context.tuiCatalog.chooseProvider('chatgpt');
  return context;
}
/** The hermetic profile with the fake OpenAI in front of the network, and the composition closed at the end. */
async function bench(fake:FakeOpenAi,fn:(h:Hermetic,open:(keyring?:any)=>Promise<any>)=>Promise<void>):Promise<void>{
  await hermetic(async h=>{
    const restore=installFakeOpenAi(fake);const opened:any[]=[];
    try{await fn(h,async keyring=>{const context=await compose(h,keyring);opened.push(context);return context;});}
    /* a test that fails with a sign-in under way must not leave its listener and its ten-minute wait behind (measured 13/10: the file never ended) */
    finally{for(const context of opened){await context.chatgptAccess?.esci?.().catch(()=>{});await context.runtime.close?.().catch(()=>{});}restore();}
  });
}
const chatgptRow=async(context:any)=>(await context.tuiCatalog.listProviders()).find((row:any)=>row.id==='chatgpt');
async function signInThroughCatalog(context:any,fake:FakeOpenAi,scope?:string){
  const login=await context.tuiCatalog.chatgpt.startLogin({open:()=>false});
  await followSignIn(login.url,fake,scope);
  return{login,outcome:await login.outcome};
}

test('nobody signed in: the ChatGPT plan is not ready, says how to sign in, and nothing goes to OpenAI',async()=>{
  const fake=fakeOpenAi();
  await bench(fake,async(h,open)=>{
    const context=await open();
    const row=await chatgptRow(context);
    assert.equal(row.authType,'oauth-pkce');assert.equal(row.configured,false,'nobody signed in is not "configured"');assert.equal(row.keySource,'missing');
    const readiness=await context.tuiCatalog.readiness(PLAN_MODEL);
    assert.equal(readiness.ready,false);assert.equal(readiness.code,'PROVIDER_SIGN_IN_REQUIRED','not "key missing": there is no key to add');
    assert.match(readiness.message,/talos provider login chatgpt/u);assert.doesNotMatch(readiness.message,/API key|set-key/u);
    assert.deepEqual(await context.tuiCatalog.chatgpt.state(),{connected:false,email:null,planEnabled:false,signingIn:false,usageUrl:'https://chatgpt.com/settings/usage'});
    const list=await context.tuiCatalog.providerModels('chatgpt');
    assert.deepEqual(list.rows,[]);assert.equal(list.verified,false);assert.match(list.notice,/talos provider login chatgpt/u);assert.equal(list.listing,'signed-out');
    assert.deepEqual(fake.calls,[],'no request before a sign-in');assert.deepEqual(h.network.blocked,[]);
    /* a turn on a plan model: refused with the plan's own code, and the API key is not tried instead */
    context.providerStore.setKey('openai',API_KEY);
    const turn=await runTurn(context,h,'Say hello.',{model:PLAN_MODEL,timeoutMs:30_000});
    const failed=turn.raw.find((event:any)=>event?.type==='RunError');
    assert.ok(failed,`the run fails: ${JSON.stringify(turn.raw.map((event:any)=>event?.type))}`);
    assert.equal(failed.code,'CHATGPT_NON_COLLEGATO','the code of the kernel, refused before the network');
    /* what the person reads for it: an English code, and how to sign in here */
    assert.equal(displayCode(failed.code),'CHATGPT_NOT_CONNECTED');
    assert.match(describeError(Object.assign(new Error(failed.message),{code:failed.code})).todo??'',/talos provider login chatgpt/u);
    /* `-p`: the same refusal, with an English code and how to sign in */
    const headless=await collectHeadlessRun(createRuntimeSupervisor({initialRuntime:context.runtime,runtimeFactory:()=>context.runtime}),{projectRoot:h.project,checkpointsRoot:h.paths.checkpointsRoot,model:PLAN_MODEL,permissionMode:'bypassPermissions',prompt:'Say hello.',protocolVersion:'v2'});
    const said=JSON.stringify(headless);
    /* the envelope keeps the kernel's code (the machine contract, as for every kernel code) and says it in English */
    assert.match(said,/"what":"No ChatGPT account is connected\."/u);assert.match(said,/Sign in with `talos provider login chatgpt`/u);
    assert.deepEqual(fake.sent(),[],'nothing was sent');assert.doesNotMatch(JSON.stringify(fake.calls),new RegExp(API_KEY,'u'));
  });
});

test('signed in: the plan lists its models, pays the turn with its own token (never the API key), counts it, and signs out',async()=>{
  const fake=fakeOpenAi({responseHeaders:{'x-codex-primary-used-percent':'12'}});
  await bench(fake,async(h,open)=>{
    const keyring=createMemoryKeyring(h.paths.dataRoot);
    const context=await open(keyring);
    context.providerStore.setKey('openai',API_KEY);
    /* a test of the provider before anybody signed in: what it learnt must not outlive the sign-in */
    const before=await context.tuiCatalog.probeProvider('chatgpt');
    assert.equal(before.readinessCode,'PROVIDER_SIGN_IN_REQUIRED');assert.deepEqual(fake.calls,[],'testing a plan nobody signed in to sends nothing');
    await assert.rejects(context.tuiCatalog.setProviderKey('chatgpt','sk-not-for-the-plan'),{code:'PROVIDER_SIGN_IN_ONLY'},'the plan is never given a key');
    const {login,outcome}=await signInThroughCatalog(context,fake);
    assert.match(login.url,/^https:\/\/auth\.openai\.com\/api\/accounts\/authorize\?/u);assert.equal(login.opened,false);
    assert.deepEqual(outcome,{ok:true,email:'nino@example.com',planEnabled:true});
    const row=await chatgptRow(context);
    assert.equal(row.configured,true);assert.equal(row.keySource,'saved');
    assert.deepEqual(await context.tuiCatalog.readiness(PLAN_MODEL),{ready:true,provider:'chatgpt',model:PLAN_MODEL});
    const list=await context.tuiCatalog.providerModels('chatgpt');
    assert.deepEqual(list.rows.map((model:any)=>model.id),[PLAN_MODEL],'what the account lists, nothing written by hand');assert.equal(list.verified,true);assert.equal(list.listing,'live');
    /* the turn */
    const turn=await runTurn(context,h,'Say hello.',{model:PLAN_MODEL,timeoutMs:30_000});
    assert.match(JSON.stringify(turn.raw),/Done by the plan\./u,JSON.stringify(turn.raw.filter((event:any)=>event?.type==='RunError')));
    const sent=fake.sent();assert.equal(sent.length,1);
    assert.equal(sent[0]!.authorization,'Bearer ACCESS-1','the plan\'s token pays');
    assert.doesNotMatch(JSON.stringify(fake.calls),new RegExp(API_KEY,'u'),'the API key never travels on the plan path');
    assert.equal(JSON.parse(sent[0]!.body!).model,'gpt-5.5');
    /* `-p` on the same profile: the plan pays it too */
    const headless=await collectHeadlessRun(createRuntimeSupervisor({initialRuntime:context.runtime,runtimeFactory:()=>context.runtime}),{projectRoot:h.project,checkpointsRoot:h.paths.checkpointsRoot,model:PLAN_MODEL,permissionMode:'bypassPermissions',prompt:'Say hello again.',protocolVersion:'v2'});
    assert.match(JSON.stringify(headless.result),/Done by the plan\./u);assert.equal(fake.sent().length,2);assert.equal(fake.sent()[1]!.authorization,'Bearer ACCESS-1');
    /* counted, on disk, with no token in the file */
    await context.registry.attendiAssestamento(turn.sessionId);
    const usage=context.tuiCatalog.chatgpt.usage();
    assert.equal(usage.cinqueOre.richieste,2);
    const file=path.join(h.paths.dataRoot,USAGE_FILE);assert.equal(existsSync(file),true);
    assert.doesNotMatch(readFileSync(file,'utf8'),/ACCESS-|REFRESH-/u);
    /* a second TALOS on the same profile finds the session: signed in once, not once per window */
    const second=await open(keyring);
    assert.equal(second.providerControlPlane.get('chatgpt').auth.usable,true,'known at start, before any screen asks: `talos provider list` reads this');
    assert.equal((await chatgptRow(second)).configured,true,'the session is read at start');
    assert.equal((await second.tuiCatalog.chatgpt.state()).email,'nino@example.com');
    /* signing out revokes, and the provider is not ready again */
    assert.deepEqual(await context.tuiCatalog.chatgpt.signOut(),{signedOut:true,revoked:true});
    assert.equal((await chatgptRow(context)).configured,false);
    assert.equal((await context.tuiCatalog.readiness(PLAN_MODEL)).ready,false);
    assert.deepEqual(await context.tuiCatalog.chatgpt.signOut(),{signedOut:false,revoked:false},'nothing to sign out of');
    assert.deepEqual(h.network.blocked,[]);
  });
});

test('signed in without the plan: kept, not ready, and the next sign-in asks for the plan',async()=>{
  let scope=SCOPES_WITHOUT_PLAN;const fake=fakeOpenAi({scope:()=>scope});
  await bench(fake,async(_h,open)=>{
    const context=await open();
    const first=await signInThroughCatalog(context,fake,SCOPES_WITHOUT_PLAN);
    assert.deepEqual(first.outcome,{ok:true,email:'nino@example.com',planEnabled:false});
    const row=await chatgptRow(context);assert.equal(row.configured,false,'signed in is not enough to send');assert.equal(row.keySource,'saved');
    const readiness=await context.tuiCatalog.readiness(PLAN_MODEL);
    assert.equal(readiness.ready,false);assert.equal(readiness.code,'PROVIDER_SIGN_IN_REQUIRED');assert.match(readiness.message,/not enabled/u);
    scope=`${SCOPES_WITHOUT_PLAN} resource.invoke chatgpt.tokens.use.direct`;
    assert.equal(new URL(first.login.url).searchParams.get('prompt'),null,'a first sign-in never forces the consent page');
    const again=await context.tuiCatalog.chatgpt.startLogin({open:()=>false});
    assert.equal(new URL(again.url).searchParams.get('prompt'),'consent','signed in without the plan: this one asks for it');
    assert.match(new URL(again.url).searchParams.get('client_id')??'',/^oaiapp_/u,'the second sign-in is the registered client asking for the plan');
    await followSignIn(again.url,fake,scope);
    assert.deepEqual(await again.outcome,{ok:true,email:'nino@example.com',planEnabled:true});
    assert.equal((await context.tuiCatalog.readiness(PLAN_MODEL)).ready,true);
  });
});

test('the model\'s own tool says how to sign in HERE, not where the desktop app has it',async()=>{
  const fake=fakeOpenAi();
  await bench(fake,async(h,open)=>{
    const context=await open();
    const {providerExclusionsHost}=await import('../../src/runtime/talos-composition.ts');
    const host=(await providerExclusionsHost(REPO_ROOT,context.providerStore,context.chatgptAccess))!({});
    const said=await host('chatgpt_account',{action:'status'},{fase:'esegui'});
    assert.equal(said.ok,true);assert.match(said.testo,/^No ChatGPT account is connected\./u);assert.match(said.testo,/talos provider login chatgpt/u);assert.doesNotMatch(said.testo,/Settings|Model laboratory/u);
    await signInThroughCatalog(context,fake);
    const connected=await host('chatgpt_account',{action:'status'},{fase:'esegui'});
    assert.match(connected.testo,/nino@example\.com/u);assert.doesNotMatch(connected.testo,/ACCESS-|REFRESH-/u);
    assert.deepEqual(h.network.blocked,[]);
  });
});

test('without a keyring the plan cannot be connected: it says so, and no token is kept anywhere else',async()=>{
  const fake=fakeOpenAi();
  await bench(fake,async(h,open)=>{
    const context=await open(null);
    assert.equal(await context.tuiCatalog.chatgpt.state(),null);
    assert.equal((await chatgptRow(context)).configured,false);
    await assert.rejects(context.tuiCatalog.chatgpt.startLogin({open:()=>false}),{code:'CHATGPT_UNAVAILABLE'});
    assert.deepEqual(fake.calls,[]);assert.equal(existsSync(path.join(h.paths.dataRoot,USAGE_FILE)),false);
  });
});

/* ── the command ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function commandBench(h:Hermetic,context:any,{tty=true,format='text'}:{tty?:boolean;format?:'text'|'json'}={}){
  const out:string[]=[];const err:string[]=[];
  const ctx:any={invocation:{outputFormat:format},io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:tty,stdoutIsTTY:tty,readStdin:async()=>''},
    projectRoot:h.project,paths:h.paths,repoRoot:REPO_ROOT,createRuntimeContext:async()=>context};
  return{ctx,out,err};
}
test('`talos provider login chatgpt` prints the address, waits for the browser, and says who signed in; `logout` signs out',async()=>{
  const fake=fakeOpenAi();
  await bench(fake,async(h,open)=>{
    const context=await open();
    /* the browser is the test: the command is told not to open one, and the test follows the printed address */
    context.tuiCatalog.chatgpt.openBrowser=()=>false;
    const b=commandBench(h,context);
    const running=runProviderCommand(b.ctx,['login','chatgpt']);
    let url='';for(let i=0;i<200&&!url;i++){url=b.err.join('').match(/https:\/\/auth\.openai\.com\/\S+/u)?.[0]??'';if(!url)await new Promise(resolve=>setTimeout(resolve,20));}
    assert.ok(url,`the address is printed: ${b.err.join('')}`);
    assert.match(b.err.join(''),/Open this address in your browser and sign in to ChatGPT/u);
    assert.match(b.err.join(''),/Waiting for the browser/u);
    await followSignIn(url,fake);
    assert.equal(await running,0);
    assert.match(b.out.join(''),/Signed in to ChatGPT as nino@example\.com\./u);
    assert.match(b.out.join(''),/talos model list --provider chatgpt/u,'the next step is said');
    assert.doesNotMatch(b.out.join('')+b.err.join(''),/ACCESS-|REFRESH-/u,'no token is ever printed');
    /* list says it */
    const listed=commandBench(h,context,{format:'json'});assert.equal(await runProviderCommand(listed.ctx,['list']),0);
    const row=JSON.parse(listed.out.join('')).find((profile:any)=>profile.id==='chatgpt');
    assert.equal(row.auth.usable,true);assert.equal(row.ready,true);
    /* status: who, and what this TALOS sent (its own count), never a token */
    const status=commandBench(h,context);assert.equal(await runProviderCommand(status.ctx,['status','chatgpt']),0);
    assert.match(status.out.join(''),/ChatGPT plan: signed in as nino@example\.com\./u);assert.match(status.out.join(''),/Sent by this TALOS · last 5 hours: requests 0, tokens 0 · last 7 days: requests 0, tokens 0/u);
    assert.match(status.out.join(''),/https:\/\/chatgpt\.com\/settings\/usage/u);assert.doesNotMatch(status.out.join(''),/ACCESS-|REFRESH-/u);
    const statusJson=commandBench(h,context,{format:'json'});await runProviderCommand(statusJson.ctx,['status','chatgpt']);
    assert.deepEqual(JSON.parse(statusJson.out.join('')),{provider:'chatgpt',available:true,connected:true,email:'nino@example.com',planEnabled:true,
      usage:{fiveHours:{requests:0,tokens:0,unmeasured:0},sevenDays:{requests:0,tokens:0,unmeasured:0}},usageUrl:'https://chatgpt.com/settings/usage'});
    await assert.rejects(runProviderCommand(commandBench(h,context).ctx,['logout','openai']),{code:'PROVIDER_LOGOUT_UNSUPPORTED'});
    /* logout */
    const leaving=commandBench(h,context);
    assert.equal(await runProviderCommand(leaving.ctx,['logout','chatgpt']),0);
    assert.match(leaving.out.join(''),/Signed out of ChatGPT\./u);
    const nothing=commandBench(h,context);
    assert.equal(await runProviderCommand(nothing.ctx,['logout','chatgpt']),0);
    assert.match(nothing.out.join(''),/No ChatGPT account is connected\./u);
    const none=commandBench(h,context);assert.equal(await runProviderCommand(none.ctx,['status','chatgpt']),0);
    assert.match(none.out.join(''),/ChatGPT plan is not connected\. Run `talos provider login chatgpt`/u);
  });
});
test('`talos provider login chatgpt` in a script is refused before anything opens, and a sign-in that fails says why',async()=>{
  const fake=fakeOpenAi();
  await bench(fake,async(h,open)=>{
    const context=await open();context.tuiCatalog.chatgpt.openBrowser=()=>false;
    await assert.rejects(runProviderCommand(commandBench(h,context,{tty:false}).ctx,['login','chatgpt']),{code:'LOGIN_REQUIRES_TTY'});
    assert.deepEqual(fake.calls,[]);
    await assert.rejects(runProviderCommand(commandBench(h,context).ctx,['set-key','chatgpt']),{code:'PROVIDER_SIGN_IN_ONLY'},'the plan has no key to set');
    /* the browser comes back with a refusal */
    const b=commandBench(h,context);const running=runProviderCommand(b.ctx,['login','chatgpt']);
    let url='';for(let i=0;i<200&&!url;i++){url=b.err.join('').match(/https:\/\/auth\.openai\.com\/\S+/u)?.[0]??'';if(!url)await new Promise(resolve=>setTimeout(resolve,20));}
    const asked=new URL(url).searchParams;const back=new URL(asked.get('redirect_uri')!);
    back.search=new URLSearchParams({state:asked.get('state')!,error:'access_denied'}).toString();
    await (await fetch(back)).text();
    assert.equal(await running,11);
    assert.match(b.out.join(''),/ChatGPT sign-in did not complete: .+ \(CHATGPT_[A-Z_]+\)/u);
    assert.doesNotMatch(b.out.join(''),/CHATGPT_ERROR\b|NEGATO|RIFIUTATA/u,'the reason OpenAI gave, with an English code');
    assert.equal((await chatgptRow(context)).configured,false);
  });
});

/* ── bugfixer review of 13/10/2026 ───────────────────────────────────────────────────────────────────────────────────────────── */
const JWT_SHAPE=/eyJ[A-Za-z0-9_-]{10,}\./u;
const printedAddress=async(err:string[])=>{let url='';for(let i=0;i<200&&!url;i++){url=err.join('').match(/https:\/\/auth\.openai\.com\/\S+/u)?.[0]??'';if(!url)await new Promise(resolve=>setTimeout(resolve,20));}return url;};
test('finding 1: signing in again prints an address with no identity token in it, and nothing the command says carries one',async()=>{
  const fake=fakeOpenAi();
  await bench(fake,async(h,open)=>{
    const context=await open();context.tuiCatalog.chatgpt.openBrowser=()=>false;
    await signInThroughCatalog(context,fake);
    const b=commandBench(h,context,{format:'json'});const running=runProviderCommand(b.ctx,['login','chatgpt']);
    const url=await printedAddress(b.err);assert.ok(url,'the address is printed');
    assert.equal(new URL(url).searchParams.get('id_token_hint'),null);
    await followSignIn(url,fake);assert.equal(await running,0);
    const status=commandBench(h,context,{format:'json'});await runProviderCommand(status.ctx,['status','chatgpt']);
    for(const said of [b.out,b.err,status.out,status.err])assert.doesNotMatch(said.join(''),JWT_SHAPE,'no token of any kind, the identity one included');
    assert.doesNotMatch([...b.out,...b.err,...status.out].join(''),/ACCESS-|REFRESH-/u);
  });
});

test('finding 4: with the memory credential store the one-shot login refuses before anything opens or is sent',async()=>{
  const fake=fakeOpenAi();
  await bench(fake,async(h,open)=>{
    const context=await open();context.tuiCatalog.chatgpt.openBrowser=()=>false;
    /* what the composition reports when the person chose `credentials.store: memory` (a test profile is the other way to be here) */
    context.credentialStore={kind:'memory',source:'config',testProfile:false};
    const b=commandBench(h,context);
    const ended=await Promise.race([runProviderCommand(b.ctx,['login','chatgpt']).then(code=>({code}),error=>({error})),new Promise<'still waiting'>(resolve=>setTimeout(()=>resolve('still waiting'),1500))]);
    assert.equal((ended as any)?.error?.code,'CHATGPT_STORE_NOT_KEPT',`refused, not started: ${JSON.stringify(ended)} ${b.err.join('')}`);
    assert.deepEqual(fake.calls,[]);assert.doesNotMatch(b.err.join(''),/auth\.openai\.com/u,'no address was printed');
    assert.equal((await context.tuiCatalog.chatgpt.state()).signingIn,false,'nothing is listening');
    const said=describeError(Object.assign(new Error('CHATGPT_STORE_NOT_KEPT'),{code:'CHATGPT_STORE_NOT_KEPT'}));
    assert.match(said.what,/memory/u);assert.match(said.todo??'',/\/provider/u,'where it can be done instead');
    /* on the screen the sign-in is kept for as long as TALOS is open, and the note says so */
    const words:any=await import('../../src/commands/provider-chatgpt.ts');
    assert.equal(typeof words.chatgptSignedInNote,'function');
    assert.match(words.chatgptSignedInNote(' as nino@example.com','memory'),/Signed in to ChatGPT as nino@example\.com.*\n.*until TALOS closes/su);
    assert.doesNotMatch(words.chatgptSignedInNote('', 'system'),/until TALOS closes/u);
  });
});

test('finding 12: the model\'s own disconnect leaves what the screen\'s sign-out leaves',async()=>{
  const fake=fakeOpenAi();
  await bench(fake,async(_h,open)=>{
    const context=await open();
    await signInThroughCatalog(context,fake);
    assert.equal((await context.tuiCatalog.probeProvider('chatgpt')).state,'available');
    assert.equal(context.tuiCatalog.providerState('chatgpt').state,'available','the snapshot the next resume reads');
    assert.equal(context.providerControlPlane.get('chatgpt').lastHealth.state,'available');
    const {providerExclusionsHost}=await import('../../src/runtime/talos-composition.ts');
    const host=(await providerExclusionsHost(REPO_ROOT,context.providerStore,context.chatgptAccess))!({});
    const done=await host('chatgpt_account',{action:'disconnect'},{fase:'esegui'});
    assert.equal(done.ok,true);assert.match(done.testo,/disconnected/iu);
    assert.equal((await context.tuiCatalog.chatgpt.state()).connected,false);
    assert.equal(context.tuiCatalog.providerState('chatgpt').state,'unverified','not "available" for the next resume');
    assert.equal(context.providerControlPlane.get('chatgpt').lastHealth.state,'unknown','what the test learnt does not outlive the session');
  });
});
