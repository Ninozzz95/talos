/*
 * The lockfile check of the release (owner 09/10/2026: the release robot runs `node cli/scripts/verify-lock.mjs`). A dependency pinned to an exact
 * version must be locked at that version; a dependency given as a tarball URL (xlsx comes from cdn.sheetjs.com, not from the registry) is locked by
 * that URL — npm records it as the row's `resolved` (docs.npmjs.com/cli/configuring-npm/package-lock-json: "resolved: the place where the package was
 * actually resolved from") with an `integrity` hash, and its `version` is the package's own number, never the URL. Until 09/10 the check compared the
 * URL with the version and failed on the real files since 25/09 (12bc6b83e): the robot would have stopped at its first run.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {verifyLock} from '../../scripts/verify-lock.mjs';

const URL_SPEC='https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz';
const lockOf=(rows:Record<string,unknown>,root:Record<string,unknown>)=>({lockfileVersion:3,packages:{'':root,...rows}});

test('the real package.json and package-lock.json pass',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
  const lock=JSON.parse(readFileSync(new URL('../../package-lock.json',import.meta.url),'utf8'));
  assert.doesNotThrow(()=>verifyLock(pkg,lock));
});

test('a tarball URL is locked by its resolved URL and an integrity hash, an exact version by its version',()=>{
  const pkg={dependencies:{a:'1.2.3'},devDependencies:{xlsx:URL_SPEC}};
  const root={dependencies:{a:'1.2.3'},devDependencies:{xlsx:URL_SPEC}};
  const good={'node_modules/a':{version:'1.2.3'},'node_modules/xlsx':{version:'0.20.3',resolved:URL_SPEC,integrity:'sha512-abc'}};
  assert.doesNotThrow(()=>verifyLock(pkg,lockOf(good,root)));
  assert.throws(()=>verifyLock(pkg,lockOf({...good,'node_modules/xlsx':{version:'0.20.3',resolved:'https://evil.example/xlsx.tgz',integrity:'sha512-abc'}},root)),/CLI_LOCKFILE_PACKAGE_MISMATCH:xlsx/u);
  assert.throws(()=>verifyLock(pkg,lockOf({...good,'node_modules/xlsx':{version:'0.20.3',resolved:URL_SPEC}},root)),/CLI_LOCKFILE_INTEGRITY_MISSING:xlsx/u);
  assert.throws(()=>verifyLock(pkg,lockOf({...good,'node_modules/a':{version:'1.2.4'}},root)),/CLI_LOCKFILE_PACKAGE_MISMATCH:a/u);
  assert.throws(()=>verifyLock({...pkg,dependencies:{a:'^1.2.3'}},lockOf(good,{...root,dependencies:{a:'^1.2.3'}})),/CLI_DEPENDENCY_NOT_PINNED:a/u);
  assert.throws(()=>verifyLock({...pkg,devDependencies:{xlsx:'http://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz'}},lockOf(good,root)),/CLI_DEPENDENCY_NOT_PINNED:xlsx/u,'only https');
});
