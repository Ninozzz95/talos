/*
 * R3 (2026-09-24, lane SP disclosure): tests that call main() resolve the TALOS profile from APPDATA/LOCALAPPDATA (win32) or
 * XDG_* and write there. scripts/run-tests.mjs — the runner behind `npm test`, `test:tui` and `test:acceptance` — gives every
 * run a private profile inside its private temp and drops secret-looking variables. This proves it from inside a run: the
 * profile TALOS would resolve is under the runner's private profile, and no variable that looks like a secret reached the
 * tests. Outside the runner (a bare `node --test`) there is nothing to prove, so the test says so and is skipped.
 */
import assert from 'node:assert/strict';
import {homedir} from 'node:os';
import {relative,resolve,isAbsolute} from 'node:path';
import {test} from 'node:test';
import {resolveCliPaths} from '../src/paths.ts';

const root=process.env.TALOS_TEST_RUNNER_PROFILE;
const inside=(path:string)=>{const rel=relative(resolve(root!),resolve(path));return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));};

test('the test runner gives every run a private TALOS profile and no secret-looking variable',{skip:root?false:'not run through scripts/run-tests.mjs'},()=>{
  for(const name of ['APPDATA','LOCALAPPDATA','HOME','XDG_CONFIG_HOME','XDG_STATE_HOME','XDG_CACHE_HOME'])
    assert.ok(process.env[name]&&inside(process.env[name]!),`${name} is outside the private profile: ${process.env[name]}`);
  const paths=resolveCliPaths(process.env,process.platform,homedir());
  for(const [name,path] of Object.entries({configRoot:paths.configRoot,dataRoot:paths.dataRoot,cacheRoot:paths.cacheRoot,logsRoot:paths.logsRoot,sessionsRoot:paths.sessionsRoot}))
    assert.ok(inside(path),`the TALOS ${name} a test would write to is outside the private profile: ${path}`);
  const secrets=Object.keys(process.env).filter(name=>/(KEY|TOKEN|SECRET|PASSW|CRED|AUTH|PRIVATE)/iu.test(name));
  assert.deepEqual(secrets,[],'secret-looking variables reached the tests');
});
