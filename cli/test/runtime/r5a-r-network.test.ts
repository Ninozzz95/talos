/*
 * R5a lane R — gate E7, the outbound requests R5 adds, registered in one place (no network allow-list existed in the CLI
 * before R5: `rg -i "allow-?list|egress|outbound" cli/src` names only the sandbox's own network policy):
 *   - https://models.dev/api.json — one GET, no key, no personal data, 4 h cache under the data root; OFF in test profiles
 *     (`provider/store.ts` isTestProfile) and with TALOS_MODELS_DEV=off;
 *   - a local Ollama's own `/api/show` and `/api/ps` (the engine's address the person configured; no key, no redirect,
 *     4 MiB, 3 s) — the same boundary as R4's `/api/tags`.
 * This file proves that a composed runtime running a turn in a test profile sends NOTHING anywhere but the fake provider.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {MODELS_DEV_URL,resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {dummyKey,hermetic,REPO_ROOT} from '../provider/first-run-fixture.ts';
import {composeWithFake,runTurn,startScriptedProvider} from './r5a-r-fixture.ts';

test.after(()=>resetModelProfiles());

test('the one catalogue address is the kernel adapter\'s own',()=>{
  const adapter=readFileSync(path.join(REPO_ROOT,'harness-ui','src','model-catalog-models-dev.mjs'),'utf8');
  assert.ok(adapter.includes(`const URL_PREDEFINITO = '${MODELS_DEV_URL}';`));
});

test('a composed runtime in a test profile contacts nothing but the fake provider, models.dev included',{timeout:120_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text',text:'OK'})});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId,raw}=await runTurn(context,h,'hello');
    assert.ok(raw.some(e=>e?.type==='RunFinished'));
    await context.runtime.contextStatus(sessionId);
    assert.deepEqual(h.network.blocked,[],'no request left 127.0.0.1');
  }finally{await context.runtime.close?.();await fake.close();}
}));
