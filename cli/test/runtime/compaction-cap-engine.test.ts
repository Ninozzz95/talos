/*
 * 14/10/2026, owner: «Tetto di serie, regolabile». Through the REAL composition, kernel and Context Engine on a fake provider
 * (r5a-r-fixture): a model whose window is 1,000,000 tokens is summarised at 200,000 at the latest, not at half its limit; with
 * `context.compactAtTokens: null` the 50 % rule of before; a normal window is untouched.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {composeWithFake,runTurn,startScriptedProvider} from './r5a-r-fixture.ts';
import {pathToFileURL} from 'node:url';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

/* What the ENGINE holds for the conversation (its own store), not what /context computes: the engine decides when to summarise. */
async function engineSettings(h:any,sessionId:string){
  const storeModule:any=await import(pathToFileURL(path.join(REPO_ROOT,'context-engine','src','node','sqlite-store.mjs')).href);
  const store=storeModule.createSqliteContextStore({databasePath:path.join(h.paths.dataRoot,'context','context.sqlite')});
  try{return (await store.readContextSnapshot({sessionId}))?.settings;}finally{await store.close();}
}

test.after(()=>resetModelProfiles());
const writeConfig=(h:any,value:Record<string,unknown>)=>writeFileSync(path.join(h.paths.configRoot,'config.json'),JSON.stringify({version:1,...value}));

async function statusFor(h:any,config:Record<string,unknown>){
  const key=dummyKey('deepseek');
  writeConfig(h,config);
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text' as const,text:'Done.'})});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId,raw}=await runTurn(context,h,'hello');
    assert.ok(raw.some(e=>e?.type==='RunFinished'),'the turn completed');
    const status=await context.runtime.contextStatus(sessionId);
    await context.runtime.close?.();
    return{...status,engine:await engineSettings(h,sessionId)};
  }finally{await context.runtime.close?.();await fake.close();}
}

test('a 1M window is summarised at 200,000 tokens at the latest',{timeout:180_000},async()=>hermetic(async h=>{
  const status=await statusFor(h,{models:{'deepseek:deepseek-flash':{contextWindow:1_000_000}}});
  assert.equal(status.available,true);
  assert.ok(status.autoCompaction.triggerRatio<0.5,String(status.autoCompaction.triggerRatio));
  assert.ok(status.budget.triggerTokens<=200_000&&status.budget.triggerTokens>199_000,String(status.budget.triggerTokens));
  assert.equal(status.engine?.triggerRatio,status.autoCompaction.triggerRatio,'the engine holds the capped trigger');
  assert.ok(status.engine?.targetRatio<status.engine?.triggerRatio);
}));

test('context.compactAtTokens: null keeps the 50 % rule; a normal window is untouched',{timeout:240_000},async()=>hermetic(async h=>{
  const off=await statusFor(h,{models:{'deepseek:deepseek-flash':{contextWindow:1_000_000}},context:{compactAtTokens:null}});
  assert.equal(off.autoCompaction.triggerRatio,0.5);
  const normal=await statusFor(h,{models:{'deepseek:deepseek-flash':{contextWindow:65_536}}});
  assert.equal(normal.autoCompaction.triggerRatio,0.5);
}));
