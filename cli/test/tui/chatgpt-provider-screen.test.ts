/*
 * «Continue with ChatGPT» on the screen (owner 13/10/2026): `/provider` and `/setup` sign in to and out of the ChatGPT plan with the
 * windows the OpenRouter sign-in already has (the address always shown, waiting for the browser, try again after a failure, the
 * choices of a provider already in use). ⛔ The plan is never asked for a key, and no code is pasted: the browser comes back by
 * itself. OpenAI is the fake of `chatgpt-fixture.ts`; the browser is the test, never a real one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {ESC,flat,hermetic,KEYS,mountTui,REPO_ROOT,type Hermetic} from '../provider/first-run-fixture.ts';
import {fakeOpenAi,followSignIn,installFakeOpenAi,PLAN_MODEL,SCOPES_WITHOUT_PLAN,type FakeOpenAi} from '../provider/chatgpt-fixture.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';
import {providerKeySourceLabel,providerOAuthOverlay,providerPickerEnter,providerKeyActionsOverlay} from '../../src/tui/overlays/provider-picker.ts';

async function screen(fake:FakeOpenAi,fn:(tui:any,context:any,h:Hermetic)=>Promise<void>,{signedIn=false,scope}:{signedIn?:boolean;/** the scopes the first sign-in grants (without the plan's, the person is signed in and cannot send) */scope?:string}={}):Promise<void>{
  await hermetic(async h=>{
    const restore=installFakeOpenAi(fake);let context:any=null;let tui:any=null;
    try{
      const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
      context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:PLAN_MODEL,env:{...process.env},environmentKeys:'consent',keyring:createMemoryKeyring(h.paths.dataRoot)} as any);
      context.tuiCatalog.chatgpt.openBrowser=()=>false;
      /* the address of the sign-in under way, as the catalog started it (the screen's copy is wrapped at 80 columns) */
      const start=context.tuiCatalog.chatgpt.startLogin;
      context.tuiCatalog.chatgpt.startLogin=async(input?:any)=>{const login=await start(input);lastAddress.set(context,login.url);return login;};
      if(signedIn){const login=await context.tuiCatalog.chatgpt.startLogin();await followSignIn(login.url,fake,scope);assert.equal((await login.outcome).ok,true);lastAddress.delete(context);}
      tui=await mountTui({context,projectRoot:h.project,paths:h.paths,model:PLAN_MODEL});
      await fn(tui,context,h);
    /* a test that fails with a sign-in under way must not leave its listener and its ten-minute wait behind */
    }finally{tui?.unmount();await context?.chatgptAccess?.esci?.().catch(()=>{});await context?.runtime.close?.().catch(()=>{});restore();}
  });
}
async function openProvider(tui:any,id:string){
  await tui.typeAndEnter('/provider');
  await tui.until((f:string)=>/── (?:Models|AI provider) /u.test(f),'the provider sheet');
  tui.write('/');tui.write(id);
  await tui.until((f:string)=>f.includes(`/ ${id}`)&&f.includes(' of '),`the sheet filtered to ${id}`);
  tui.write(KEYS.enter);await tui.until((f:string)=>f.includes('enter use'),'the filter ended');
}
const lastAddress=new WeakMap<object,string>();
async function currentAddress(context:any):Promise<string>{
  for(let i=0;i<200&&!lastAddress.get(context);i++)await new Promise(resolve=>setTimeout(resolve,20));
  const url=lastAddress.get(context);assert.ok(url,'a sign-in was started');lastAddress.delete(context);return url!;
}

test('the row of a sign-in provider says signed in or not, never "no key"',()=>{
  const row=(over:Record<string,unknown>)=>({keySource:'missing',environmentVariable:null,authType:'oauth-pkce',configured:false,...over}) as any;
  assert.equal(providerKeySourceLabel(row({})),'not signed in');
  assert.equal(providerKeySourceLabel(row({keySource:'saved',configured:true})),'signed in');
  assert.equal(providerKeySourceLabel(row({keySource:'saved',configured:false})),'signed in · plan not enabled');
  assert.equal(providerKeySourceLabel({keySource:'missing',environmentVariable:null} as any),'no key','a key provider reads as before');
  /* a sign-in that is missing goes to the sign-in step, not to a remediation line */
  const probe={provider:'chatgpt',state:'unconfigured',detail:'',latencyMs:null,remediation:{code:'sign-in',message:'x'},readinessCode:'PROVIDER_SIGN_IN_REQUIRED'} as any;
  assert.equal(providerPickerEnter({selectedProvider:'chatgpt',configured:false,requiresKey:true,keySource:'missing',probe}).kind,'provider-setup');
});
test('the sign-in window of the plan: its own first line, no code to paste; the choices of a signed-in plan say "Sign out"',()=>{
  const waiting=providerOAuthOverlay({label:'ChatGPT plan',url:'https://auth.openai.com/x',mode:'browser',opened:false,phase:'waiting',masked:'',message:null,intro:'Open this address in your browser and sign in to ChatGPT:',pasteable:false});
  const text=JSON.stringify(waiting);
  assert.match(text,/Open this address in your browser and sign in to ChatGPT:/u);assert.match(text,/https:\/\/auth\.openai\.com\/x/u);
  assert.match(text,/Waiting for the browser \(10 min\) · Esc cancels/u);assert.doesNotMatch(text,/paste a code/u);
  const openrouter=JSON.stringify(providerOAuthOverlay({label:'OpenRouter',url:'u',mode:'browser',opened:true,phase:'waiting',masked:'',message:null}));
  assert.match(openrouter,/C paste a code instead/u,'the OpenRouter window is as it was');
  const actions=JSON.stringify(providerKeyActionsOverlay({label:'ChatGPT plan',source:'signed in',choice:'use',browserSignIn:true,signInOnly:true}));
  assert.match(actions,/Use it/u);assert.match(actions,/Sign in again with ChatGPT/u);assert.match(actions,/Sign out/u);assert.doesNotMatch(actions,/key/u);
});

test('/provider, nobody signed in: Enter on the ChatGPT plan opens the sign-in (never a key prompt); the browser comes back and its models open',async()=>{
  const fake=fakeOpenAi();
  await screen(fake,async(tui,context)=>{
    await openProvider(tui,'chatgpt');
    assert.match(flat(tui.last()),/ChatGPT plan[^│]*not signed in/u);
    tui.write(KEYS.enter);
    const waiting=await tui.until((f:string)=>f.includes('sign in to ChatGPT:')&&f.includes('Waiting for the browser (10 min) · Esc cancels'),'the sign-in window');
    assert.doesNotMatch(waiting,/API key|paste a code|Paste an API key/u,'the plan has no key and no code to paste');
    const state=await context.tuiCatalog.chatgpt.state();assert.equal(state.signingIn,true);
    /* the address is on screen and in the conversation; the test's browser follows the one TALOS is waiting for */
    assert.ok(tui.frames.some((frame:string)=>frame.includes('https://auth.openai.com/api/accounts/authorize?')),'the address is shown');
    await followSignIn(await currentAddress(context),fake);
    await tui.until((f:string)=>f.includes('Signed in to ChatGPT as nino@example.com'),'who signed in');
    await tui.until((f:string)=>f.includes('GPT-5.5')||f.includes('gpt-5.5'),'the models of the plan');
    assert.equal(await context.tuiCatalog.chosenProvider(),'chatgpt');
    assert.equal(tui.frames.some((frame:string)=>/ACCESS-1|REFRESH-1/u.test(frame)),false,'no token ever reaches the screen');
  });
});

test('/provider, Esc while waiting cancels the sign-in and closes the local address',async()=>{
  const fake=fakeOpenAi();
  await screen(fake,async(tui,context)=>{
    await openProvider(tui,'chatgpt');tui.write(KEYS.enter);
    await tui.until((f:string)=>f.includes('Waiting for the browser (10 min) · Esc cancels'),'the sign-in window');
    tui.write('c');await new Promise(resolve=>setTimeout(resolve,150));
    assert.doesNotMatch(flat(tui.last()),/Code:/u,'C does not open a code field for the plan');
    tui.write(ESC);
    await tui.until((f:string)=>!f.includes('Waiting for the browser'),'the window closed');
    for(let i=0;i<100&&(await context.tuiCatalog.chatgpt.state()).signingIn;i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal((await context.tuiCatalog.chatgpt.state()).signingIn,false,'nothing is left listening');
    assert.equal((await context.tuiCatalog.chatgpt.state()).connected,false);
  });
});

test('/provider, signed in: Enter offers use it, sign in again, sign out; signing out says so and the row is "not signed in" again',async()=>{
  const fake=fakeOpenAi();
  await screen(fake,async(tui,context)=>{
    await openProvider(tui,'chatgpt');
    assert.match(flat(tui.last()),/ChatGPT plan[^│]*signed in/u);assert.doesNotMatch(flat(tui.last()),/ChatGPT plan[^│]*not signed in/u);
    tui.write(KEYS.enter);
    const choices=await tui.until((f:string)=>f.includes('› Use it')&&f.includes('Sign out'),'the choices of a signed-in plan');
    assert.match(choices,/Sign in again with ChatGPT/u);assert.doesNotMatch(choices,/Remove it|new key/u);
    tui.write(KEYS.down);tui.write(KEYS.down);
    await tui.until((f:string)=>f.includes('› Sign out'),'sign out selected');
    tui.write(KEYS.enter);
    await tui.until((f:string)=>f.includes('Signed out of ChatGPT.'),'the sign-out said');
    assert.equal((await context.tuiCatalog.chatgpt.state()).connected,false);
    /* the sheet comes back, alone (no second window over it), with the row as it is now */
    const back=await tui.until((f:string)=>/── (?:Models|AI provider) /u.test(f)&&/ChatGPT plan\s+not signed in/u.test(f),'the sheet again');
    assert.doesNotMatch(back,/search: — · Enter chooses/u,'the old picker is not left open over the sheet');
  },{signedIn:true});
});

test('/setup, Key tab: the plan offers "Sign in with the browser", never a key field; signed in, it says who',async()=>{
  const fake=fakeOpenAi();
  await screen(fake,async(tui,context)=>{
    await tui.typeAndEnter('/setup');
    await tui.until((f:string)=>f.includes('── Setup')||f.includes('Setup'),'the setup sheet');
    /* the setup list has no filter: down to the plan's row */
    for(let i=0;i<60&&!/› ○ ChatGPT plan/u.test(tui.last());i++){tui.write(KEYS.down);await new Promise(resolve=>setTimeout(resolve,40));}
    assert.match(tui.last(),/› ○ ChatGPT plan/u,'the plan is in the list');
    tui.write(KEYS.enter);
    const key=await tui.until((f:string)=>f.includes('Sign in with the browser'),'the Key tab of the plan');
    assert.match(flat(key),/ChatGPT plan has no key: sign in with ChatGPT in the browser\./u);assert.doesNotMatch(key,/API key|Code/u);
    tui.write(KEYS.enter);
    await tui.until((f:string)=>f.includes('sign in to ChatGPT:')&&f.includes('Waiting for the browser (10 min) · Esc cancels'),'the sign-in under way');
    await followSignIn(await currentAddress(context),fake);
    await tui.until((f:string)=>f.includes('Signed in to ChatGPT as nino@example.com'),'who signed in');
    await tui.until((f:string)=>f.includes('GPT-5.5')||f.includes('gpt-5.5'),'the models of the plan');
  });
});

/* ── bugfixer review of 13/10/2026 ───────────────────────────────────────────────────────────────────────────────────────────── */
test('finding 10: a sign-in that could not start says why, and does not tell the person to open an address that is not there',()=>{
  const failed=JSON.stringify(providerOAuthOverlay({label:'ChatGPT plan',url:'',mode:'browser',opened:false,phase:'failed',masked:'',message:'A ChatGPT account cannot be connected on this computer: the system keyring is not available.',intro:'',pasteable:false}));
  assert.match(failed,/cannot be connected on this computer/u);assert.match(failed,/Enter starts it again · Esc cancels/u);
  assert.doesNotMatch(failed,/Open this address|use this address/u);
  /* one that failed after it started keeps its address: the person may still want it */
  const later=JSON.stringify(providerOAuthOverlay({label:'OpenRouter',url:'https://openrouter.ai/auth?x',mode:'browser',opened:false,phase:'failed',masked:'',message:'no'}));
  assert.match(later,/Open this address in your browser/u);assert.match(later,/openrouter\.ai\/auth/u);
});

test('finding 5 and 11: signed in without the plan, the row says "plan not enabled" and Enter offers to allow the plan or to sign out',async()=>{
  const fake=fakeOpenAi({scope:SCOPES_WITHOUT_PLAN});
  await screen(fake,async(tui,context)=>{
    assert.deepEqual({...(await context.tuiCatalog.chatgpt.state()),email:null},{connected:true,email:null,planEnabled:false,signingIn:false,usageUrl:'https://chatgpt.com/settings/usage'});
    await openProvider(tui,'chatgpt');
    assert.match(flat(tui.last()),/ChatGPT plan\s+plan not enabled/u,'its own badge');
    assert.doesNotMatch(flat(tui.last()),/ChatGPT plan\s+not signed in/u,'the person IS signed in');
    tui.write(KEYS.enter);
    const choices=await tui.until((f:string)=>f.includes('Allow the plan')&&f.includes('Sign out'),'the choices of a sign-in without the plan',5000);
    assert.doesNotMatch(choices,/Use it/u,'there is nothing to use yet');assert.match(choices,/› Allow the plan \(browser\)/u);
    assert.equal((await context.tuiCatalog.chatgpt.state()).signingIn,false,'no browser before the person chose');
    tui.write(KEYS.up);await new Promise(resolve=>setTimeout(resolve,100));
    assert.match(flat(tui.last()),/› Allow the plan/u,'the list has two rows: up stays on the first');
    tui.write(KEYS.down);
    await tui.until((f:string)=>f.includes('› Sign out'),'sign out selected');
    tui.write(KEYS.enter);
    await tui.until((f:string)=>f.includes('Signed out of ChatGPT.'),'the sign-out said');
    assert.equal((await context.tuiCatalog.chatgpt.state()).connected,false,'no token is left in the keyring');
    await tui.until((f:string)=>/── (?:Models|AI provider) /u.test(f)&&/ChatGPT plan\s+not signed in/u.test(f),'the sheet again');
  },{signedIn:true,scope:SCOPES_WITHOUT_PLAN});
});

test('finding 5: "Allow the plan" opens the sign-in that asks for it',async()=>{
  const fake=fakeOpenAi({scope:SCOPES_WITHOUT_PLAN});
  await screen(fake,async(tui,context)=>{
    await openProvider(tui,'chatgpt');tui.write(KEYS.enter);
    await tui.until((f:string)=>f.includes('› Allow the plan'),'the choices',5000);
    tui.write(KEYS.enter);
    await tui.until((f:string)=>f.includes('Waiting for the browser (10 min) · Esc cancels'),'the sign-in window');
    const url=await currentAddress(context);
    assert.equal(new URL(url).searchParams.get('prompt'),'consent');
    assert.equal(tui.frames.some((frame:string)=>/eyJ[A-Za-z0-9_-]{10,}\./u.test(flat(frame))),false,'no identity token on the screen (finding 1)');
    tui.write(ESC);
    await tui.until((f:string)=>!f.includes('Waiting for the browser'),'the window closed');
  },{signedIn:true,scope:SCOPES_WITHOUT_PLAN});
});

test('finding 6: Esc while the sign-in is still being opened leaves nothing waiting, and the window does not come back',async()=>{
  const fake=fakeOpenAi();
  await screen(fake,async(tui,context)=>{
    /* the sign-in takes a moment to open (the first time it loads the kernel's modules and opens the local address) */
    const start=context.tuiCatalog.chatgpt.startLogin;let asked=false;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    context.tuiCatalog.chatgpt.startLogin=async(input?:any)=>{asked=true;await gate;return start(input);};
    await openProvider(tui,'chatgpt');tui.write(KEYS.enter);
    for(let i=0;i<200&&!asked;i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(asked,true,'the sign-in was asked for');
    tui.write(ESC);await new Promise(resolve=>setTimeout(resolve,300));
    release();await new Promise(resolve=>setTimeout(resolve,600));
    assert.equal((await context.tuiCatalog.chatgpt.state()).signingIn,false,'nothing is left listening after Esc');
    assert.doesNotMatch(flat(tui.last()),/Waiting for the browser/u);
  });
});
