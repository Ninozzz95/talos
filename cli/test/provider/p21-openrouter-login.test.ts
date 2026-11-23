/*
 * P21 (owner decisions 2026-09-26): OpenRouter sign-in from the CLI with the desktop's PKCE module (the real one, loaded from
 * the checkout), OpenRouter faked by an injected fetch, and the browser played by a real HTTP request to the loopback port.
 * No request leaves 127.0.0.1; no browser window opens.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {codeFromInput,loadOpenRouterOAuth,openInBrowser,startOpenRouterLogin} from '../../src/provider/openrouter-login.ts';
import {REPO_ROOT} from './first-run-fixture.ts';

const oauth=await loadOpenRouterOAuth(REPO_ROOT);
const realFetch=globalThis.fetch;
function fakeOpenRouter(answer:{status?:number;body?:unknown}={}){
  const calls:any[]=[];
  const fetchImpl=(async(input:any,init:any)=>{
    const url=String(input);
    assert.equal(url,'https://openrouter.ai/api/v1/auth/keys','only the key exchange is called');
    calls.push(JSON.parse(String(init.body)));
    const status=answer.status??200;
    return new Response(JSON.stringify(answer.body??{key:'sk-or-v1-test'}),{status,headers:{'content-type':'application/json'}});
  }) as typeof fetch;
  return{calls,fetchImpl};
}

test('P21: the browser way — a loopback callback on 127.0.0.1, S256, the code exchanged once, the port closed after',async()=>{
  const openRouter=fakeOpenRouter();let opened='';
  const login=await startOpenRouterLogin({oauth,env:{},fetchImpl:openRouter.fetchImpl,open:url=>{opened=url;return true;}});
  assert.equal(login.mode,'browser');assert.equal(login.opened,true);assert.equal(opened,login.url);
  const authorize=new URL(login.url);
  assert.equal(authorize.origin+authorize.pathname,'https://openrouter.ai/auth');
  assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');
  const callback=new URL(authorize.searchParams.get('callback_url')!);
  assert.equal(callback.hostname,'127.0.0.1','RFC 8252 §8.3: the IP literal, not localhost');
  assert.match(callback.pathname,/^\/openrouter\/callback\/[A-Za-z0-9_-]{43}$/u,'the state rides in the path');
  const wrong=await realFetch(`${callback.origin}/openrouter/callback/other?code=x`);
  assert.equal(wrong.status,404,'another path never reaches the exchange');
  const page=await realFetch(`${callback.href}?code=the-code`);
  assert.equal(page.status,200);assert.match(await page.text(),/Signed in to OpenRouter/u);
  assert.equal(await login.key,'sk-or-v1-test');
  assert.equal(openRouter.calls.length,1);
  assert.equal(openRouter.calls[0].code,'the-code');assert.equal(openRouter.calls[0].code_challenge_method,'S256');
  assert.match(openRouter.calls[0].code_verifier,/^[A-Za-z0-9_-]{43}$/u);
  await assert.rejects(()=>realFetch(`${callback.href}?code=again`),'the port is closed once the key is in');
});

test('P21: a pasted code or address is raced against the browser; a remote session goes to the code OpenRouter shows',async()=>{
  const openRouter=fakeOpenRouter();
  const login=await startOpenRouterLogin({oauth,env:{},fetchImpl:openRouter.fetchImpl,open:()=>false});
  assert.equal(await login.submit('http://127.0.0.1:1/openrouter/callback/x?code=pasted-code'),'sk-or-v1-test');
  assert.equal(openRouter.calls[0].code,'pasted-code');
  const remote=await startOpenRouterLogin({oauth,env:{SSH_CONNECTION:'10.0.0.2 22 10.0.0.1 22'},fetchImpl:fakeOpenRouter().fetchImpl,open:()=>{throw new Error('a remote session opens no browser');}});
  assert.equal(remote.mode,'paste');assert.equal(remote.opened,false);
  const url=new URL(remote.url);
  assert.equal(url.searchParams.get('callback_url'),null);assert.equal(url.searchParams.get('key_label'),'TALOS CLI');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256','PKCE is there in the no-callback mode too');
  await assert.rejects(()=>remote.submit('not a code'),(error:any)=>error.code==='OAUTH_CODE_MISSING');
  assert.equal(await remote.submit('shown-code'),'sk-or-v1-test');
});

test('P21: a refusal keeps its HTTP status and no body; a timeout and a cancel say so; the port closes',async()=>{
  const refused=await startOpenRouterLogin({oauth,env:{},paste:true,fetchImpl:fakeOpenRouter({status:403,body:{error:'secret detail'}}).fetchImpl});
  await assert.rejects(()=>refused.submit('old-code'),(error:any)=>error.code==='OAUTH_SCAMBIO_RIFIUTATO'&&error.status===403&&!/secret detail/u.test(error.message));
  const slow=await startOpenRouterLogin({oauth,env:{},paste:true,timeoutMs:20,fetchImpl:fakeOpenRouter().fetchImpl});
  await assert.rejects(()=>slow.key,(error:any)=>error.code==='OAUTH_TIMEOUT');
  const cancelled=await startOpenRouterLogin({oauth,env:{},fetchImpl:fakeOpenRouter().fetchImpl,open:()=>false});
  const callback=new URL(new URL(cancelled.url).searchParams.get('callback_url')!);
  cancelled.cancel();
  await assert.rejects(()=>cancelled.key,(error:any)=>error.code==='OAUTH_CANCELLED');
  await assert.rejects(()=>realFetch(`${callback.href}?code=late`),'a cancelled sign-in closes its port');
});

test('P21: the code in what was pasted, and the browser opened without a shell, never in a test profile',()=>{
  assert.equal(codeFromInput('  abc123  '),'abc123');
  assert.equal(codeFromInput('http://127.0.0.1:5/openrouter/callback/s?code=xyz'),'xyz');
  assert.equal(codeFromInput('?code=q1&x=2'),'q1');
  assert.equal(codeFromInput(''),null);assert.equal(codeFromInput('two words'),null);
  const spawned:any[]=[];
  const spawnImpl=((command:string,args:string[],options:any)=>{spawned.push({command,args,options});return{on(){return this;},unref(){}};}) as any;
  const url='https://openrouter.ai/auth?callback_url=x&code_challenge=y&code_challenge_method=S256';
  assert.equal(openInBrowser(url,{env:{TALOS_TEST_PROFILE:'1'},platform:'win32',spawnImpl}),false);assert.equal(spawned.length,0,'a test profile opens no window');
  assert.equal(openInBrowser(url,{env:{},platform:'win32',spawnImpl}),true);
  assert.deepEqual(spawned[0].args,['url.dll,FileProtocolHandler',url],'the whole address, & included, as one argument');
  assert.equal(spawned[0].options.shell,undefined,'no shell');
  assert.equal(openInBrowser('file:///etc/passwd',{env:{},platform:'linux',spawnImpl}),false,'only an https address');
});
