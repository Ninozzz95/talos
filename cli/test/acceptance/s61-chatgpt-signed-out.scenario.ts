/**
 * «Continue with ChatGPT» (0.6.0), on the BUILT CLI behind the refusing sink, with NOBODY signed in: what a person sees, and
 * that nothing ever leaves toward OpenAI. ⛔ No sign-in is completed here and the real service is never reached (the owner's
 * rule, 13/10/2026): the browser is played by local requests to the loopback address with a state TALOS did not give, which
 * it must refuse without asking anybody. The signed-in paths are proven in-process against a fake OpenAI
 * (test/provider/chatgpt-plan.test.ts, chatgpt-cli.test.ts, test/tui/chatgpt-provider-screen.test.ts).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {exitTalos,stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s61',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let t:TerminalSession;

/** The authorization address from the window: its lines, borders removed, joined until a line with a space. */
function authorizeUrl(screen:Screen):URL{
  const lines=screen.lines.map(line=>line.replace(/^\s*│/u,'').replace(/│\s*$/u,'').trim());
  /* the window's copy is the LAST one on screen (the conversation holds a copy too) */
  let start=-1;for(let i=0;i<lines.length;i++)if(lines[i]!.startsWith('https://auth.openai.com/api/accounts/authorize?'))start=i;
  assert.ok(start>=0,`no authorization address in the window:\n${screen.text}`);
  let url='';for(let i=start;i<lines.length&&!/\s/u.test(lines[i]!)&&lines[i]!.length;i++)url+=lines[i];
  return new URL(url);
}
async function openPlanRow(){
  await t.submit('/provider');
  await t.waitFor('the providers',x=>/── (?:Models|AI provider) /u.test(x.text),{timeout:15_000});
  await t.type('/chatgpt');await sleep(400);t.press('enter');await sleep(200);
  return t.waitFor('the plan row',x=>/ChatGPT plan\s+not signed in/u.test(x.text),{timeout:10_000});
}

test('s61 · the command line, nobody signed in: not ready, how to sign in, never a word about a key',async()=>{
  const list=await s.profile.talos(['provider','list']);
  assert.equal(list.status,0,`${list.stdout}${list.stderr}`);
  const row=JSON.parse(list.stdout).find((profile:any)=>profile.id==='chatgpt');
  assert.ok(row,'the ChatGPT plan is a provider');
  assert.equal(row.ready,false);assert.equal(row.auth.usable,false);assert.equal(row.auth.source,'missing');
  assert.equal(row.remediation.code,'sign-in');assert.match(row.remediation.message,/talos provider login chatgpt/u);
  const status=await s.profile.talos(['provider','status','chatgpt']);
  assert.equal(status.status,0);assert.match(status.stdout,/ChatGPT plan is not connected\. Run `talos provider login chatgpt`/u);
  const login=await s.profile.talos(['provider','login','chatgpt']);
  assert.notEqual(login.status,0);assert.match(login.stdout+login.stderr,/interactive terminal/iu,'a script cannot sign in');
  const key=await s.profile.talos(['provider','set-key','chatgpt']);
  assert.notEqual(key.status,0);assert.match(key.stdout+key.stderr,/has no key: you sign in to it/u);
  const out=await s.profile.talos(['provider','logout','chatgpt']);
  assert.equal(out.status,0);assert.match(out.stdout,/No ChatGPT account is connected\./u);
  /* a turn on a plan model is refused before the network, with an English code and the way to sign in */
  const turn=await s.profile.talos(['-p','say hello','--model','chatgpt:gpt-anything']);
  assert.notEqual(turn.status,0);
  const said=turn.stdout+turn.stderr;
  assert.match(said,/No ChatGPT account is connected\./u,said);assert.match(said,/talos provider login chatgpt/u);
  assert.doesNotMatch(said,/API key|set-key|NON_COLLEGATO/u,`a key or an Italian code on screen:\n${said}`);
  assert.equal(s.fake.chatRequests().length,0,'no other provider was asked instead');
});

test('s61 · /provider: Enter on the plan opens the sign-in, with its address and no key field; a callback TALOS did not ask for is refused',async()=>{
  t=s.launch([],{cols:110,rows:44});await toComposer(t);
  const row=await openPlanRow();
  assert.match(row.text,/press enter to sign in/u);
  t.send('k');
  const noKey=await t.waitFor('k says there is no key',x=>/ChatGPT plan has no key: press enter to sign in/u.test(x.text),{timeout:10_000});
  assert.doesNotMatch(noKey.text,/Key for ChatGPT|API key ▍/u,'no key is ever asked for the plan');
  t.press('enter');
  const waiting=await t.waitFor('the sign-in under way',x=>/Waiting for the browser \(10 min\) · Esc cancels/u.test(x.text),{timeout:30_000});
  assert.match(waiting.text,/Open this address in your browser and sign in to ChatGPT:/u,'a test profile opens no browser, and says so');
  assert.doesNotMatch(waiting.text,/paste a code|Paste an API key|Code:/u,'the plan has no code to paste and no key');
  assert.doesNotMatch(waiting.text,/eyJ[A-Za-z0-9_-]{10,}\./u,'no token-shaped text on screen');
  const url=authorizeUrl(waiting);
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.ok(url.searchParams.get('state')&&url.searchParams.get('nonce')&&url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.get('id_token_hint'),null);
  const callback=new URL(url.searchParams.get('redirect_uri')!);
  assert.equal(callback.hostname,'127.0.0.1');assert.equal(callback.pathname,'/auth/callback');
  /* the "browser" comes back with a state TALOS did not give: refused at once, nothing asked to OpenAI */
  const page=await fetch(`${callback.origin}${callback.pathname}?state=not-the-state&code=a-code`);
  assert.equal(page.status,400);
  const body=await page.text();assert.doesNotMatch(body,/eyJ|ACCESS|REFRESH|at file:|\.mjs:\d+/u,'the answer page holds no token and no stack trace');
  const failed=await t.waitFor('the refusal on screen',x=>/Enter starts it again · Esc cancels/u.test(x.text),{timeout:30_000});
  assert.doesNotMatch(failed.text,/Waiting for the browser/u);
  assert.doesNotMatch(failed.text,/STATO_DIVERSO|RITORNO|undefined|\[object/u,`an Italian code or a raw value on screen:\n${failed.text}`);
  await assert.rejects(()=>fetch(`${callback.origin}${callback.pathname}?state=late`),'the loopback port is closed once the sign-in is decided');
});

test('s61 · Esc while waiting cancels and closes the port; the plan is still not signed in',async()=>{
  t.press('enter');
  const again=await t.waitFor('a new sign-in',x=>/Waiting for the browser \(10 min\) · Esc cancels/u.test(x.text),{timeout:30_000});
  const callback=new URL(authorizeUrl(again).searchParams.get('redirect_uri')!);
  t.send('c');await sleep(400);
  assert.doesNotMatch(t.screen().text,/Paste the code|Code:/u,'C opens no code field for the plan');
  t.press('esc');
  await t.waitFor('the sign-in step closed',x=>!/Waiting for the browser/u.test(x.text),{timeout:10_000});
  await assert.rejects(()=>fetch(`${callback.origin}${callback.pathname}?state=late`),'a cancelled sign-in closes its port');
  await exitTalos(t);
  const list=await s.profile.talos(['provider','list']);
  assert.equal(JSON.parse(list.stdout).find((profile:any)=>profile.id==='chatgpt').auth.usable,false);
});

test('s61 · /setup: the Key tab of the plan offers the browser sign-in and never a key field',async()=>{
  t=s.launch([],{cols:110,rows:44});await toComposer(t);
  await t.submit('/setup');
  await t.waitFor('the setup sheet',x=>/── Setup provider, key, model/u.test(x.text),{timeout:15_000});
  /* the setup list has no filter: down to the plan's row */
  for(let i=0;i<60&&!/› [○●] ChatGPT plan/u.test(t.screen().text);i++){t.press('down');await sleep(80);}
  assert.match(t.screen().text,/› [○●] ChatGPT plan/u,'the plan is in the setup list');
  t.press('enter');
  const key=await t.waitFor('the Key tab of the plan',x=>/Sign in with the browser/u.test(x.text),{timeout:15_000});
  assert.match(key.text,/ChatGPT plan has no key: sign in with ChatGPT in the browser\./u);
  assert.doesNotMatch(key.text,/API key|Code:/u,'no key and no code is asked for the plan');
  t.press('enter');
  const waiting=await t.waitFor('the sign-in under way',x=>/Waiting for the browser \(10 min\) · Esc cancels/u.test(x.text),{timeout:30_000});
  assert.match(waiting.text,/sign in to ChatGPT:/u);
  assert.doesNotMatch(waiting.text,/eyJ[A-Za-z0-9_-]{10,}\./u);
  t.press('esc');
  await t.waitFor('the sheet closed',x=>!/── Setup provider, key, model/u.test(x.text),{timeout:10_000});
  await exitTalos(t);
});

test('s61 · nothing ever left 127.0.0.1 toward OpenAI or anywhere else',()=>{
  assert.deepEqual(sink.hits.filter(hit=>/openai|chatgpt/iu.test(String(hit.url))),[],JSON.stringify(sink.hits));
});
test.after(async()=>{await sink.close();});
