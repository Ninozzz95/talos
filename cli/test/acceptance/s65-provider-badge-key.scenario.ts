/**
 * s65 — the status row's «<provider>: verified / not verified» for a provider that needs a KEY, on the BUILT CLI (review of 0.6.3,
 * 14/10/2026: s63 covered only the keyless fake Ollama). A fake Kimi (Moonshot) on 127.0.0.1 (the address set with `talos provider
 * configure kimi`) answers its model list to one key and refuses every other with 401 — the check the row makes is the kernel's
 * probe of that list with the key in use. The key comes from the environment (MOONSHOT_API_KEY), approved once with `talos provider
 * env-key kimi --use`, because the acceptance profile keeps saved keys in each process's memory only. Nothing leaves the machine
 * (the sink, checked at the end).
 * (c) found a defect on its first run: after «Remove it» on the /provider sheet the screen's keys went to a window nothing drew,
 * and Ctrl+C Ctrl+C did not end TALOS (cured in app.ts `removeProviderKey`).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {join} from 'node:path';
import {after,before,test} from 'node:test';
import {exitTalos,toComposer} from './harness.ts';
import {assertFreshBuild,createProfile,type Profile} from './profile.ts';
import {sinkEnv,startRefusingSink,type RefusingSink} from './sink.ts';
import {TerminalSession} from './terminal.ts';

const GOOD='sk-talos-acceptance-good-key-0123456789';
const BAD='sk-talos-acceptance-refused-key-0123456789';
const MODEL='kimi:kimi-k2.6';

type FakeKeyProvider={url:string;asked:Array<{path:string;key:string|null;at:number}>;answered:Array<{key:string|null;at:number}>;/** while above 0, every answer waits this long */holdMs:number;close:()=>Promise<void>};
async function startFakeKeyProvider():Promise<FakeKeyProvider>{
  const asked:FakeKeyProvider['asked']=[];const answered:FakeKeyProvider['answered']=[];
  const self={holdMs:0} as {holdMs:number};
  const server=http.createServer(async(req,res)=>{
    const key=/^Bearer (.+)$/u.exec(String(req.headers.authorization??''))?.[1]??null;
    asked.push({path:String(req.url??''),key,at:Date.now()});
    if(self.holdMs>0)await new Promise(resolve=>setTimeout(resolve,self.holdMs));
    res.on('finish',()=>answered.push({key,at:Date.now()}));
    if(key!==GOOD){res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Invalid Authentication',type:'invalid_authentication_error'}}));return;}
    if(req.method==='GET'&&/\/models$/u.test(String(req.url))){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({object:'list',data:[{id:'kimi-k2.6',object:'model',owned_by:'moonshot'}]}));return;}
    res.writeHead(404);res.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  return Object.assign(self,{url:`http://127.0.0.1:${(server.address() as AddressInfo).port}`,asked,answered,close:()=>new Promise<void>(resolve=>{server.closeAllConnections?.();server.close(()=>resolve());})}) as FakeKeyProvider;
}

let fake:FakeKeyProvider;let sink:RefusingSink;
const profiles:Profile[]=[];const sessions:TerminalSession[]=[];
before(async()=>{assertFreshBuild();fake=await startFakeKeyProvider();sink=await startRefusingSink();});
after(async()=>{for(const t of sessions)await t.close();await fake?.close();await sink?.close();for(const p of profiles)p.dispose();});

/** A profile whose model is the fake Moonshot's, with `key` in the environment and approved. */
async function keyProfile(name:string,key:string):Promise<Profile>{
  const profile=createProfile({name,files:{'README.md':'# demo\n'},extraEnv:{...sinkEnv(sink),MOONSHOT_API_KEY:key}});profiles.push(profile);
  for(const args of [['model','use',MODEL,'--scope','user'],['provider','configure','kimi','--endpoint',`${fake.url}/v1`],['provider','env-key','kimi','--use'],['project','trust','--include-nested']]){
    const r=await profile.talos(args);if(r.status!==0)throw new Error(`${args.join(' ')} failed (${r.status}): ${r.stdout}${r.stderr}`);
  }
  return profile;
}
const badge=(text:string)=>/\bkimi: (verified|not verified|checking…)/u.exec(text)?.[1]??null;
function launch(profile:Profile){const t=TerminalSession.launch(profile,[],{cols:120,rows:40});sessions.push(t);return t;}

test('s65 (a) · a key the provider accepts: the row reads «kimi: verified»',async()=>{
  const profile=await keyProfile('s65a',GOOD);
  const t=launch(profile);
  try{
    await toComposer(t);
    const seen=await t.waitFor('kimi: verified',x=>badge(x.text)==='verified',{timeout:30_000});
    assert.doesNotMatch(seen.text,/kimi: not verified/u);
    assert.ok(fake.asked.some(row=>row.key===GOOD&&/\/models$/u.test(row.path)),'the row says «verified» and the provider was never asked');
    assert.equal(await exitTalos(t),true);
  }finally{await t.close();}
});

test('s65 (b) · a key the provider refuses (401): the row reads «kimi: not verified», never «verified»',async()=>{
  const profile=await keyProfile('s65b',BAD);
  const t=launch(profile);
  try{
    await toComposer(t);
    /* the premise: the check was made, with that key, and refused */
    for(let waited=0;!fake.asked.some(row=>row.key===BAD)&&waited<20_000;waited+=100)await new Promise(resolve=>setTimeout(resolve,100));
    assert.ok(fake.asked.some(row=>row.key===BAD),'the refused key was never sent to the provider, so this run proves nothing');
    const seen=await t.waitFor('kimi: not verified',x=>badge(x.text)==='not verified',{timeout:20_000});
    /* and it stays so: no late answer turns it */
    await t.observe(2_500);
    assert.equal(badge(t.screen().text),'not verified',`the row changed after the refusal:\n${t.screen().text}`);
    assert.doesNotMatch(seen.text,/kimi: verified/u);
    assert.equal(await exitTalos(t),true);
  }finally{await t.close();}
});

/** `/provider`, filtered to kimi, its key's choices, «Remove it». */
async function removeKeyOnScreen(t:TerminalSession){
  await t.submit('/provider');
  await t.waitFor('the provider sheet',x=>/── (?:Models|AI provider) /u.test(x.text),{timeout:20_000});
  t.send('/');t.send('kimi');
  await t.waitFor('the sheet filtered to kimi',x=>x.text.includes('/ kimi')&&x.text.includes(' of '),{timeout:10_000});
  t.press('enter');await t.waitFor('the filter ended',x=>x.text.includes('enter use'),{timeout:10_000});
  t.press('enter');
  await t.waitFor('the key\'s choices',x=>x.text.includes('› Use it')&&x.text.includes('Remove it'),{timeout:20_000});
  t.press('down');t.press('down');
  await t.waitFor('«Remove it» chosen',x=>x.text.includes('› Remove it'),{timeout:10_000});
  t.press('enter');
  await t.waitFor('the removal said',x=>/The key for Kimi was removed|MOONSHOT_API_KEY/u.test(x.text)&&!x.text.includes('› Remove it'),{timeout:20_000});
  /* the sheet comes back (its whole list again); Esc closes it */
  await t.waitFor('the sheet again',x=>/── (?:Models|AI provider) /u.test(x.text)&&!x.text.includes('Remove it'),{timeout:20_000});
  t.press('esc');
  await t.waitFor('the sheet closed',x=>!/── (?:Models|AI provider) /u.test(x.text),{timeout:10_000});
}

test('s65 (c) · the key removed while the screen is open: the row follows, «verified» → «not verified»',async()=>{
  const profile=await keyProfile('s65c',GOOD);
  const t=launch(profile);
  try{
    await toComposer(t);
    await t.waitFor('kimi: verified',x=>badge(x.text)==='verified',{timeout:30_000});
    await removeKeyOnScreen(t);
    const after=await t.waitFor('kimi: not verified',x=>badge(x.text)==='not verified',{timeout:20_000});
    assert.doesNotMatch(after.text,/kimi: verified/u);
    /* the screen answers its keys again (found here, 14/10/2026: after «Remove it» the sheet's window stayed open with nothing
       drawn, and Ctrl+C Ctrl+C did nothing until an Esc pressed blind) */
    assert.equal(await exitTalos(t),true,'TALOS did not end with Ctrl+C Ctrl+C after the key was removed on the screen');
  }finally{await t.close();}
  /* and the next start does not read «verified» from the file either */
  const next=launch(profile);
  try{
    await toComposer(next);
    await next.waitFor('the badge at the next start',x=>badge(x.text)!==null&&badge(x.text)!=='checking…',{timeout:20_000});
    await next.observe(2_500);
    assert.equal(badge(next.screen().text),'not verified',`the next start read the removed key as checked:\n${next.screen().text}`);
    assert.equal(await exitTalos(next),true);
  }finally{await next.close();}
});

const snapshotOf=(profile:Profile)=>{
  try{return JSON.parse(readFileSync(join(profile.env.LOCALAPPDATA!,'TALOS-CLI','cache','provider-state.json'),'utf8')).providers?.kimi??null;}catch{return null;}
};

/*
 * Two screens on one profile (the third review of 0.6.2, S1 and S5): screen A's check is still out (the provider answers in 14 s)
 * when the key is removed on screen B. A's answer — «accepted», about the key that was there when A asked — lands after B's reset:
 * it must not be written over it, so neither A's row, nor the file every next screen reads, says «verified» again.
 */
test('s65 (d) · two screens on one profile: a check of the first that lands after the key was removed on the second brings nothing back',async()=>{
  const profile=await keyProfile('s65d',GOOD);
  const since=Date.now();const mine=<T extends {at:number;key:string|null}>(rows:T[])=>rows.filter(row=>row.at>=since&&row.key===GOOD);
  fake.holdMs=14_000;
  const a=launch(profile);let b:TerminalSession|null=null;
  try{
    await toComposer(a);
    for(let waited=0;mine(fake.asked).length===0&&waited<10_000;waited+=100)await new Promise(resolve=>setTimeout(resolve,100));
    const askedByA=mine(fake.asked)[0];
    assert.ok(askedByA,'the premise: screen A sent its check');
    b=launch(profile);
    await toComposer(b);
    await removeKeyOnScreen(b);
    const resetAt=Date.now();
    await b.waitFor('kimi: not verified on B',x=>badge(x.text)==='not verified',{timeout:20_000});
    assert.equal(mine(fake.answered).some(row=>row.at<=resetAt),false,'the premise: A\'s check was still out when the key was removed');
    /* A's answer lands */
    for(let waited=0;mine(fake.answered).length===0&&waited<20_000;waited+=100)await new Promise(resolve=>setTimeout(resolve,100));
    assert.ok(mine(fake.answered).length>0,'the premise: A\'s check was answered');
    await a.observe(1_500);await b.observe(500);
    const entry=snapshotOf(profile);
    assert.ok(!(entry?.state==='available'&&entry?.verified===true),`the late answer of A brought «verified» back into the file: ${JSON.stringify(entry)}`);
    assert.notEqual(badge(a.screen().text),'verified',`screen A reads «verified» for a key removed on B:\n${a.screen().text}`);
    assert.equal(badge(b.screen().text),'not verified',`screen B no longer reads «not verified»:\n${b.screen().text}`);
    fake.holdMs=0;
    assert.equal(await exitTalos(b),true);
    assert.equal(await exitTalos(a),true);
  }finally{fake.holdMs=0;await b?.close();await a.close();}
});

/*
 * Owner 14/10/2026: «the open screen updates by itself within a few seconds». The key is removed by ANOTHER process — a second
 * terminal's `talos provider remove-key kimi` — while the screen is open and nobody touches it: its row turns «not verified» within
 * the bound, and the screen asks the provider nothing for it (the file says what is known).
 */
const FOLLOW_BOUND_MS=5_000;
test('s65 (e) · the key removed by another process: the open screen\'s row follows by itself within a few seconds, and nothing is fetched',async t=>{
  const profile=await keyProfile('s65e',GOOD);
  const screen=launch(profile);
  try{
    await toComposer(screen);
    await screen.waitFor('kimi: verified',x=>badge(x.text)==='verified',{timeout:30_000});
    await screen.observe(1_500);
    const before=fake.asked.length;
    const removed=await profile.talos(['provider','remove-key','kimi']);
    assert.equal(removed.status,0,`remove-key failed: ${removed.stdout}${removed.stderr}`);
    const removedAt=Date.now();
    assert.equal(snapshotOf(profile)?.state,'unverified','the premise: the other process reset the entry on disk');
    const after=await screen.waitFor('kimi: not verified, by itself',x=>badge(x.text)==='not verified',{timeout:FOLLOW_BOUND_MS+5_000});
    const tookMs=Date.now()-removedAt;
    t.diagnostic(`the row followed ${tookMs} ms after the other process removed the key`);
    assert.ok(tookMs<=FOLLOW_BOUND_MS,`the row followed only after ${tookMs} ms (bound ${FOLLOW_BOUND_MS} ms)`);
    assert.doesNotMatch(after.text,/kimi: verified/u);
    await screen.observe(2_500);
    assert.equal(badge(screen.screen().text),'not verified','the row went back');
    assert.deepEqual(fake.asked.slice(before),[],'the open screen asked the provider something after the removal');
    assert.equal(await exitTalos(screen),true);
  }finally{await screen.close();}
});

test('s65 · nothing tried to leave the machine',()=>{
  assert.deepEqual(sink.hits,[],'a request went past the fake provider');
});
