/**
 * P21 (owner, 2026-09-26: OpenRouter OAuth "come fa l'applicazione desktop"; decisions the same day), on the BUILT CLI behind
 * the refusing sink. OpenRouter itself is out of reach here: the key exchange is attempted and refused by the sink (the only
 * request that may leave), which is how far a hermetic test can go; the exchange that succeeds is proven in-process
 * (test/provider/p21-openrouter-login.test.ts). The browser is played by a request from this test to the loopback address.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {exitTalos,stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
const s=stage({name:'s30',files:{'README.md':'# demo\n'},extraEnv:sinkEnv(sink)});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let t:TerminalSession;

/** The authorization address from the window: its lines, borders removed, joined until a line with a space. */
function authorizeUrl(screen:Screen):URL{
  const lines=screen.lines.map(line=>line.replace(/^\s*│/u,'').replace(/│\s*$/u,'').trim());
  const start=lines.findIndex(line=>line.startsWith('https://openrouter.ai/auth?'));
  assert.ok(start>=0,`no authorization address in the window:\n${screen.text}`);
  let url='';for(let i=start;i<lines.length&&!/\s/u.test(lines[i]!)&&lines[i]!.length;i++)url+=lines[i];
  return new URL(url);
}
async function openSignIn(){
  await t.submit('/provider');
  /* stage 7.10b: /provider is the mockup's sheet; / filters, Enter ends the filter, the next Enter chooses */
  await t.waitFor('the providers',x=>/── (?:Models|AI provider) /u.test(x.text),{timeout:15_000});
  await t.type('/openrouter');await sleep(400);t.press('enter');await sleep(200);t.press('enter');
  const choice=await t.waitFor('the sign-in choice',x=>/Sign in with OpenRouter \(browser\)/u.test(x.text),{timeout:20_000});
  assert.match(choice.text,/› Sign in with OpenRouter \(browser\)/u,'the browser sign-in is the highlighted way');
  assert.match(choice.text,/ Paste an API key/u);
  t.press('enter');
  return t.waitFor('the sign-in under way',x=>/Waiting for the browser \(10 min\)/u.test(x.text),{timeout:20_000});
}

test('s30 · OpenRouter: sign in in the browser; the callback on 127.0.0.1 leads to the key exchange',async()=>{
  t=s.launch([],{cols:110,rows:40});await toComposer(t);
  const waiting=await openSignIn();
  assert.match(waiting.text,/Open this address in your browser and sign in to OpenRouter:/u,'a test profile opens no browser, and says so');
  assert.match(waiting.text,/Sign in to OpenRouter at this address/u,'the address is also in the conversation, to copy');
  const url=authorizeUrl(waiting);
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  const callback=new URL(url.searchParams.get('callback_url')!);
  assert.equal(callback.hostname,'127.0.0.1');
  const page=await fetch(`${callback.href}?code=a-code-from-the-browser`);
  assert.equal(page.status,502,'the exchange could not reach OpenRouter (the sink), and the page says the sign-in did not complete');
  const failed=await t.waitFor('the failure',x=>/OpenRouter could not be reached\./u.test(x.text),{timeout:30_000});
  assert.match(failed.text,/Enter starts it again · Esc cancels/u);
  assert.doesNotMatch(failed.text,/Waiting for the browser/u);
  await assert.rejects(()=>fetch(`${callback.href}?code=again`),'the loopback port is closed once the sign-in is decided');
});

test('s30 · a pasted text that is not a code is explained; Esc cancels and closes the loopback port',async()=>{
  t.press('enter');
  const again=await t.waitFor('a new sign-in',x=>/Waiting for the browser \(10 min\)/u.test(x.text),{timeout:20_000});
  const callback=new URL(authorizeUrl(again).searchParams.get('callback_url')!);
  t.send('c');await t.waitFor('the paste field',x=>/Paste the code \(or the whole address\)/u.test(x.text),{timeout:5_000});
  await t.type('two words');await sleep(200);t.press('enter');
  await t.waitFor('not a code',x=>/That is not a code from OpenRouter/u.test(x.text),{timeout:10_000});
  t.press('esc');
  /* stage 7.10c: the sign-in is a step of the sheet («── AI provider OpenRouter»); its going is the cancellation done */
  await t.waitFor('the sign-in step closed',x=>!/── Models |── AI provider|Provider · OpenRouter/u.test(x.text)&&!/Waiting for the browser|Paste the code/u.test(x.text),{timeout:10_000});
  await assert.rejects(()=>fetch(`${callback.href}?code=late`),'a cancelled sign-in closes its port');
  await exitTalos(t);
});

test('s30 · `talos provider login openrouter` needs an interactive terminal',async()=>{
  const result=await s.profile.talos(['provider','login','openrouter']);
  assert.notEqual(result.status,0);
  assert.match(result.stdout+result.stderr,/LOGIN_REQUIRES_TTY|interactive/iu,`${result.stdout}${result.stderr}`);
});

test('s30 · the only request that left 127.0.0.1 is the key exchange with OpenRouter',()=>{
  assert.ok(sink.hits.length>=1);
  for(const hit of sink.hits)assert.equal(hit.url,'openrouter.ai:443',`an unexpected request: ${JSON.stringify(hit)}`);
});
test.after(async()=>{await sink.close();});
