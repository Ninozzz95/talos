/**
 * s70 — the Z.AI address, on the BUILT CLI (5a89308bf, 5deae0b47; owner 14/10/2026: «the Z.AI key goes ONLY to the address you
 * chose»). The real Z.AI hosts are never reached: TALOS runs behind the refusing sink (sink.ts, NODE_USE_ENV_PROXY), which records
 * and refuses every request that leaves the machine — an HTTPS request shows there as a CONNECT to its host. The fake model on
 * 127.0.0.1 is only there so the screen opens on a model.
 *   (a) on the screen, `/provider` → Z.AI asks the address first, the plan first and «(Recommended)»; Enter chooses it, the choice
 *       is said, and the key test goes to api.z.ai only (once), never to the China host;
 *   (b) the same with the China balance chosen: the key test goes to open.bigmodel.cn only, never to api.z.ai — the two hosts tell
 *       the addresses apart (the plan and the balance share api.z.ai; a CONNECT does not show the path);
 *   (c) `talos provider set-key zai` with piped stdin and no --address refuses with PROVIDER_ADDRESS_REQUIRED and sends nothing.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {after,before,test} from 'node:test';
import {startFakeProvider,type FakeProvider} from './fake-provider.ts';
import {FAKE_MODEL_ID,exitTalos,toComposer} from './harness.ts';
import {assertFreshBuild,createProfile,MAIN_JS,type Profile} from './profile.ts';
import {sinkEnv,startRefusingSink,type RefusingSink} from './sink.ts';
import {TerminalSession,type Screen} from './terminal.ts';

const KEY='sk-talos-acceptance-zai-not-a-real-key-0123456789';
let fake:FakeProvider;let sink:RefusingSink;
const profiles:Profile[]=[];const sessions:TerminalSession[]=[];
before(async()=>{assertFreshBuild();fake=await startFakeProvider();sink=await startRefusingSink();});
after(async()=>{for(const t of sessions)await t.close();await fake?.close();await sink?.close();for(const p of profiles)p.dispose();});

async function zaiProfile(name:string):Promise<Profile>{
  const profile=createProfile({name,files:{'README.md':'# demo\n'},providerUrl:fake.url,extraEnv:sinkEnv(sink)});profiles.push(profile);
  for(const args of [['model','use',FAKE_MODEL_ID,'--scope','user'],['project','trust','--include-nested']]){
    const r=await profile.talos(args);if(r.status!==0)throw new Error(`${args.join(' ')} failed (${r.status}): ${r.stdout}${r.stderr}`);
  }
  return profile;
}
const hostsOf=(from:number)=>sink.hits.slice(from).map(hit=>hit.method==='CONNECT'?hit.url:hit.host??hit.url);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

/** `/provider`, filtered to Z.AI, Enter: the address window. */
async function openZai(t:TerminalSession):Promise<Screen>{
  await t.submit('/provider');
  await t.waitFor('the provider sheet',x=>/── (?:Models|AI provider) /u.test(x.text),{timeout:20_000});
  t.send('/');t.send('glm models through the z.ai direct');
  await t.waitFor('the sheet filtered to Z.AI',x=>x.text.includes(' of ')&&/\bZ\.AI\b/u.test(x.text),{timeout:10_000});
  t.press('enter');await t.waitFor('the filter ended',x=>x.text.includes('enter use'),{timeout:10_000});
  t.press('enter');
  return t.waitFor('the address window',x=>x.text.includes('Which Z.AI address should your key go to?'),{timeout:20_000});
}
/** Types the key in the key window and sends it to its test; returns the screen once the test has answered. */
async function testKey(t:TerminalSession):Promise<Screen>{
  await t.waitFor('the key window',x=>x.text.includes('API key for Z.AI:')&&!x.text.includes('Which Z.AI address'),{timeout:20_000});
  t.send(KEY);await sleep(300);t.press('enter');
  /* measured 14/10/2026: «Z.AI could not be reached, so the key could not be tested. The key was not saved.» */
  return t.waitFor('the key test answered',x=>!x.text.includes('Testing the key with')&&x.text.replace(/\s+/gu,' ').includes('Z.AI could not be reached, so the key could not be tested. The key was not saved.'),{timeout:60_000});
}

test('s70 (a) · /provider → Z.AI asks the address first (plan first, Recommended); the key test goes to the chosen host only',async()=>{
  const profile=await zaiProfile('s70a');
  const t=TerminalSession.launch(profile,[],{cols:120,rows:40});sessions.push(t);
  try{
    await toComposer(t);
    const from=sink.hits.length;
    const window=await openZai(t);
    const lines=window.lines.map(line=>line.trim());
    const first=lines.findIndex(line=>line.includes('GLM Coding Plan'));
    assert.ok(first>=0&&lines[first]!.startsWith('›')&&lines[first]!.includes('(Recommended)'),`the plan is first, chosen, and Recommended:\n${window.text}`);
    assert.ok(lines.findIndex(line=>line.includes('pay-as-you-go balance'))>first,'the balance comes after the plan');
    assert.deepEqual(hostsOf(from),[],'nothing was sent before the address was chosen');
    t.press('enter');
    const said=await t.waitFor('the choice said',x=>x.text.replace(/\s+/gu,' ').includes('Z.AI will use the GLM Coding Plan; your key is sent only there.'),{timeout:20_000});
    assert.ok(said);
    const tested=await testKey(t);
    const hosts=hostsOf(from);
    assert.ok(hosts.length>=1,`the premise: the key test tried to leave the machine:\n${tested.text}`);
    assert.ok(hosts.every(host=>host==='api.z.ai:443'),`the key went somewhere else than the chosen address: ${hosts.join(', ')}`);
    assert.equal(hosts.length,1,`one key test, one request: ${hosts.join(', ')}`);
    assert.doesNotMatch(tested.text,new RegExp(KEY,'u'),'the key is never shown');
    /* a pause after each Esc: an Esc and the next key within a few ms are one Alt+key to a terminal (ESC+key, VT) */
    t.press('esc');await sleep(300);t.press('esc');await sleep(300);
    await t.waitFor('the sheet closed',x=>!/── (?:Models|AI provider) /u.test(x.text)&&!x.text.includes('Provider · Z.AI'),{timeout:10_000});
    assert.equal(await exitTalos(t),true);
  }finally{await t.close();}
});

test('s70 (b) · the China balance chosen: the key test goes to open.bigmodel.cn only',async()=>{
  const profile=await zaiProfile('s70b');
  const t=TerminalSession.launch(profile,[],{cols:120,rows:40});sessions.push(t);
  try{
    await toComposer(t);
    const from=sink.hits.length;
    await openZai(t);
    t.press('down');t.press('down');t.press('down');
    await t.waitFor('the China balance chosen',x=>x.lines.some(line=>line.trim().startsWith('›')&&line.includes('pay-as-you-go balance (China)')),{timeout:10_000});
    t.press('enter');
    await t.waitFor('the choice said',x=>x.text.replace(/\s+/gu,' ').includes('Z.AI will use the pay-as-you-go balance (China); your key is sent only there.'),{timeout:20_000});
    await testKey(t);
    const hosts=hostsOf(from);
    assert.ok(hosts.length>=1,'the premise: the key test tried to leave the machine');
    assert.ok(hosts.every(host=>host==='open.bigmodel.cn:443'),`the key went somewhere else than the chosen address: ${hosts.join(', ')}`);
    /* a pause after each Esc: an Esc and the next key within a few ms are one Alt+key to a terminal (ESC+key, VT) */
    t.press('esc');await sleep(300);t.press('esc');await sleep(300);
    await t.waitFor('the sheet closed',x=>!/── (?:Models|AI provider) /u.test(x.text)&&!x.text.includes('Provider · Z.AI'),{timeout:10_000});
    assert.equal(await exitTalos(t),true);
  }finally{await t.close();}
});

test('s70 (c) · `talos provider set-key zai` with piped stdin and no --address refuses and sends nothing',async()=>{
  const profile=await zaiProfile('s70c');
  const from=sink.hits.length;
  const run=await new Promise<{status:number|null;stdout:string;stderr:string}>(done=>{
    const child=spawn(process.execPath,[MAIN_JS,'provider','set-key','zai'],{cwd:profile.project,env:profile.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='';let stderr='';child.stdout.setEncoding('utf8').on('data',d=>{stdout+=d;});child.stderr.setEncoding('utf8').on('data',d=>{stderr+=d;});
    const timer=setTimeout(()=>child.kill(),60_000);
    child.on('close',status=>{clearTimeout(timer);done({status,stdout,stderr});});
    child.stdin.end(`${KEY}\n`);
  });
  assert.notEqual(run.status,0,`set-key succeeded without an address: ${run.stdout}${run.stderr}`);
  assert.match(run.stdout+run.stderr,/PROVIDER_ADDRESS_REQUIRED/u,`the refusal names its code: ${run.stdout}${run.stderr}`);
  assert.match(run.stdout+run.stderr,/none is chosen yet, so nothing was sent/u);
  assert.equal((run.stdout+run.stderr).includes(KEY),false,'the key is never echoed');
  await sleep(500);
  assert.deepEqual(hostsOf(from),[],'set-key without an address sent something');
});

test('s70 · nothing but the key tests tried to leave the machine',()=>{
  const hosts=sink.hits.map(hit=>hit.method==='CONNECT'?hit.url:hit.host??hit.url);
  assert.ok(hosts.every(host=>host==='api.z.ai:443'||host==='open.bigmodel.cn:443'),`an unexpected request: ${hosts.join(', ')}`);
});
