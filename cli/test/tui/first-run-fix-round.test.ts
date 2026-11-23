/*
 * B1 slice 18, fix round — what the interactive screen shows and hands on.
 *
 * - Condition 2c: before a one-token key test is sent, the key step STATES it (no further question), only for the providers that
 *   get that test.
 * - Condition 3: every child command the screen spawns runs with `TALOS_ENVIRONMENT_KEYS=consent` in its environment. The child
 *   here is a real process: `process.argv[1]` points at a small script that prints what it received, so the assertion reads the
 *   environment the child actually got, not an argument list.
 * Real TuiApp, real composition in consent mode; in-memory keyring, temporary profile, dummy keys, providers on 127.0.0.1.
 */
import {providerLabelText} from '../../src/provider/provider-text.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {dummyKey,ESC,fakeKeyring,hermetic,KEYS,mountTui,REPO_ROOT,startFakeProvider,startOneTokenProvider,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';

const REGISTRY=(await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href)).REGISTRO_FORNITORI as Record<string,any>;
/* R2 (D-05): the screen shows the English provider label, mapped by id (provider-text.ts). */
const label=(id:string)=>providerLabelText(id,String(REGISTRY[id].etichetta));
const statement=(id:string)=>`One message with a one-token limit is sent to ${label(id)} to test the key and may use a small amount of credit.`;

async function compose(h:Hermetic,endpoints:Record<string,string>){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,endpoints);
  const keyring=fakeKeyring();
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env:{...process.env},environmentKeys:'consent',keyring} as any);
  return{context,keyring};
}

/* P21 (owner decisions 2026-09-26): OpenRouter's key step offers the browser sign-in first; these tests paste a key. */
async function pasteKeyWay(tui:any,id:string){
  if(id!=='openrouter')return;
  await tui.until((f:string)=>f.includes('Sign in with OpenRouter (browser)'),'the sign-in choice');
  tui.write(KEYS.down);
  await tui.until((f:string)=>f.includes('› Paste an API key'),'the pasted key chosen');
  tui.write(KEYS.enter);
}
async function openKeyEntry(tui:any,id:string){
  /* stage 7.10b: /provider is the mockup's sheet; / filters, Enter ends the filter, the next Enter chooses */
  await tui.typeAndEnter('/provider');
  await tui.until((f:string)=>/── (?:Models|AI provider) /u.test(f),'the provider sheet');
  tui.write('/');tui.write(id);
  await tui.until((f:string)=>f.includes(`/ ${id}`)&&f.includes(' of '),`the sheet filtered to ${id}`);
  tui.write(KEYS.enter);await tui.until((f:string)=>f.includes('enter use'),'the filter ended');
  tui.write(KEYS.enter);
  await pasteKeyWay(tui,id);
  return tui.until((f:string)=>f.includes(`API key for ${label(id)}:`),`${id} key entry`);
}

test('the key step states the one-token request before sending it, and only for the providers that get it',async()=>hermetic(async h=>{
  const good=dummyKey('zai-screen');
  const zai=await startOneTokenProvider({goodKey:good,shape:'anthropic-messages'});
  const openrouter=await startFakeProvider({goodKey:dummyKey('unused'),models:[]});
  try{
    const {context,keyring}=await compose(h,{'zai-anthropic':`${zai.url}/v1`,openrouter:`${openrouter.url}/api/v1`});
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths});
    try{
      const entry=await openKeyEntry(tui,'zai-anthropic');
      assert.ok(entry.includes(statement('zai-anthropic')),`the statement is on the key step: ${entry.slice(-600)}`);
      assert.equal(zai.requests.length,0,'stated before anything is sent');
      assert.equal(/\(y\/n\)|Continue\?|Use it for/u.test(entry),false,'no further question is asked');
      tui.write(good);
      await tui.until(f=>f.includes('•'.repeat(good.length)),'the masked key');
      tui.write(KEYS.enter);
      /* stage 7.10b: a choice made on the /provider sheet ends in the provider's /model sheet */
      await tui.until(f=>f.includes(`── Model ${label('zai-anthropic')}`),'the model sheet after the key was saved',30000);
      assert.equal(zai.requests.filter(r=>r.method==='POST').length,1,'one POST');
      assert.ok([...keyring.entries.values()].includes(good),'the owner\'s provider key is saved once the provider accepted it');
      tui.write(ESC);
      await tui.until(f=>!f.includes(`── Model ${label('zai-anthropic')}`),'the model sheet closed');
      const other=await openKeyEntry(tui,'openrouter');
      assert.equal(other.includes('one-token'),false,'no statement for a provider whose key test is an authenticated read');
    }finally{tui.unmount();}
  }finally{await zai.close();await openrouter.close();}
}));

test('a child command the screen spawns receives TALOS_ENVIRONMENT_KEYS=consent, whatever the screen\'s own environment says',async()=>hermetic(async h=>{
  const {context}=await compose(h,{});
  const probe=path.join(h.root,'child-probe.mjs');
  /* FE-048 C8 (01/11): /doctor is a page that reads the child's JSON; the child writes what it received to a file, and prints an empty report */
  const report=path.join(h.root,'child-report.txt');
  fs.writeFileSync(probe,"import {writeFileSync} from 'node:fs';writeFileSync("+JSON.stringify(report)+",'child marker='+String(process.env.TALOS_ENVIRONMENT_KEYS)+' args='+process.argv.slice(2).join(' '));process.stdout.write('{}');\n");
  const entry=process.argv[1];
  process.argv[1]=probe;
  try{
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths});
    try{
      // R0: since `5d7112f24` (M9-B) `/notes` opens the in-process Notes Center; `/doctor` is a command the screen still runs as a child.
      await tui.typeAndEnter('/doctor');
      await tui.until(f=>f.includes('── Doctor'),'the Doctor page',30000);
      for(let i=0;i<300&&!fs.existsSync(report);i++)await new Promise(resolve=>setTimeout(resolve,100));
      const frame=fs.readFileSync(report,'utf8');
      assert.ok(frame.includes('child marker=consent'),`the child received the marker: ${frame}`);
      assert.match(frame,/child marker=consent args=.* doctor/u,'and it was the doctor command');
      /* suite 01/11: the child printed {} — not a report: the page says the check could not run, never fails as a whole */
      const page=await tui.until(f=>f.includes('── Doctor')&&f.includes('The check could not run'),'the Doctor page says so',15000);
      assert.doesNotMatch(page,/\/doctor failed/u);
    }finally{tui.unmount();}
  }finally{process.argv[1]=entry!;}
},{processEnv:{TALOS_ENVIRONMENT_KEYS:'use'}}));
