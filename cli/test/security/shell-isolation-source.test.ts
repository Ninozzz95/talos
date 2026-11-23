/*
 * R0 (2026-09-23): the auto classifier receives the real sandbox state (owner: "collegalo adesso in R0").
 * The source answers verified only when the backend the broker uses is available; everything else is not verified.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {cliShellIsolation} from '../../src/security/execution-backends.ts';
import {createLocalAutoClassifier} from '../../src/security/auto-classifier.ts';

test('off Windows the shell is never reported as verified, and auto asks for npm test',async()=>{
  const source=cliShellIsolation({paths:{cacheRoot:'/unused'},platform:'linux'});
  const state=await source();
  assert.equal(state.verified,false);
  assert.match(String(state.reason),/linux/u);
  const classify=createLocalAutoClassifier({shellIsolation:source});
  assert.equal(await classify({action:{tool:'Bash',command:'npm test'},projectRoot:process.cwd()} as any),'ask');
});

test('a backend that cannot load its SDK is not verified, with its reason, and never throws',async()=>{
  const source=cliShellIsolation({paths:{cacheRoot:'/unused'},platform:'win32',sdkLoader:async()=>{throw new Error('sdk missing (test)');}});
  const state=await source();
  assert.equal(state.verified,false);
  assert.match(String(state.reason),/sdk missing \(test\)/u);
});
