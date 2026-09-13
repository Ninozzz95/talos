import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inventory,assertPinnedClean} from '../lib/inventory.mjs';
const exec=promisify(execFile);
async function fixture(fn) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'audit-fixture-'));
 try {
  await fs.mkdir(path.join(dir,'harness-ui/desktop'),{recursive:true});await fs.mkdir(path.join(dir,'mobile'),{recursive:true});
  await fs.writeFile(path.join(dir,'harness-ui/package.json'),'{}');await fs.writeFile(path.join(dir,'harness-ui/desktop/package.json'),'{}');
  await fs.writeFile(path.join(dir,'harness-ui/server.mjs'),'// TEST FIXTURE - NOT TALOS\n');await fs.writeFile(path.join(dir,'mobile/private.txt'),'do not inspect');
  await exec('git',['init',dir]);await exec('git',['-C',dir,'add','.']);
  await exec('git',['-C',dir,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);
  await fn(dir);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
}
test('directory-scoped inventory excludes mobile source',()=>fixture(async d=>{const i=await inventory(d);assert.equal(i.files.length,3);assert.ok(i.files.every(f=>!f.path.startsWith('mobile')));assert.equal(i.desktop_execution_verified,false);}));
test('full commit and clean required files pass identity gate only',()=>fixture(async d=>{const i=await inventory(d);assert.equal(assertPinnedClean(i,i.commit),true);assert.equal(i.app_build_verified,false);}));
test('missing required desktop source blocks gate',()=>fixture(async d=>{await fs.unlink(path.join(d,'harness-ui/server.mjs'));const i=await inventory(d);assert.equal(i.required_files_missing.length,1);assert.throws(()=>assertPinnedClean(i,i.commit));}));
test('changes to desktop files are captured',()=>fixture(async d=>{await fs.appendFile(path.join(d,'harness-ui/server.mjs'),'// changed');const i=await inventory(d);assert.equal(i.worktree_dirty,true);assert.throws(()=>assertPinnedClean(i,i.commit),/Dirty/);}));
test('untracked desktop files prevent a clean claim',()=>fixture(async d=>{await fs.writeFile(path.join(d,'harness-ui/extra.txt'),'x');const i=await inventory(d);assert.equal(i.worktree_dirty,true);}));
test('unrelated mobile modifications do not enter desktop inventory',()=>fixture(async d=>{await fs.appendFile(path.join(d,'mobile/private.txt'),'x');const i=await inventory(d);assert.equal(i.worktree_dirty,false);}));
test('commit mismatch blocks gate',()=>fixture(async d=>{const i=await inventory(d);assert.throws(()=>assertPinnedClean(i,'0'.repeat(40)),/mismatch/);}));
test('short hash cannot pin a campaign',()=>fixture(async d=>{const i=await inventory(d);assert.throws(()=>assertPinnedClean(i,i.commit.slice(0,7)),/full/);}));
test('repository subdirectory is rejected',()=>fixture(async d=>{await assert.rejects(inventory(path.join(d,'harness-ui')),/repository root/);}));
test('tracked symlink is not followed', {skip:process.platform==='win32'},()=>fixture(async d=>{await fs.symlink('../mobile/private.txt',path.join(d,'harness-ui/link'));await exec('git',['-C',d,'add','harness-ui/link']);const i=await inventory(d);assert.equal(i.files.find(f=>f.path==='harness-ui/link').status,'symlink_not_followed');assert.equal(i.skipped_count,1);}));
