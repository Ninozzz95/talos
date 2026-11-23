/*
 * R6 (owner decisions 2026-09-25): the kernel is copied into the CLI package at build, never committed, without editing a
 * file of the desktop or mobile lane. scripts/pack-vendor.mjs copies `harness-ui/src`, `context-engine/src` and their
 * `package.json` into `cli/vendor/` (the layout runtime/repo.ts looks for next to `dist/`), byte for byte, with a SHA-256
 * per file; it never copies `node_modules`, and it never empties a folder it did not make (the first draft did: cli/vendor
 * once held Hermes's Ink fork, B2). Hermetic: a fake repository in a temporary folder.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {delimiter,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {packVendor} from '../../scripts/pack-vendor.mjs';

async function fakeRepo(t:any){
  const root=await mkdtemp(join(tmpdir(),'r6-pack-vendor-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(path:string,text:string)=>{const full=join(root,...path.split('/'));await mkdir(join(full,'..'),{recursive:true});await writeFile(full,text);};
  await put('harness-ui/src/session-registry.mjs','export const x=1;\n');
  await put('harness-ui/src/kernel/talosHarness.mjs','export const k=2;\n');
  await put('harness-ui/src/node_modules/junk/index.js','never copied\n');
  /* R7: the kernel's own tests are not runtime (the first publish attempt listed talosHarness.test.mjs, 451 kB). */
  await put('harness-ui/src/kernel/talosHarness.test.mjs','never copied\n');
  await put('harness-ui/package.json','{"name":"talos-harness-ui"}\n');
  await put('harness-ui/aiuto/index.json','{"versione":1,"pagine":[]}\n');
  await put('harness-ui/server.mjs','desktop only\n');
  await put('context-engine/src/engine.mjs','export const e=3;\n');
  await put('context-engine/package.json','{"name":"context-engine"}\n');
  await put('LICENSE','AGPL text\n');
  await mkdir(join(root,'cli'),{recursive:true});
  return root;
}
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');

test('R6: the kernel trees are copied byte for byte into cli/vendor with a hash per file, never node_modules or the desktop server',async t=>{
  const root=await fakeRepo(t);const out=join(root,'cli','vendor');
  const manifest=await packVendor({repoRoot:root,out});
  assert.equal(manifest.schema,'talos.cli.vendor.v1');
  assert.deepEqual(Object.keys(manifest.sha256).sort(),['context-engine/package.json','context-engine/src/engine.mjs','harness-ui/aiuto/index.json','harness-ui/package.json','harness-ui/src/kernel/talosHarness.mjs','harness-ui/src/session-registry.mjs']);
  assert.equal(manifest.sha256['harness-ui/src/session-registry.mjs'],sha('export const x=1;\n'));
  assert.equal(await readFile(join(out,'harness-ui','src','kernel','talosHarness.mjs'),'utf8'),'export const k=2;\n');
  await assert.rejects(readFile(join(out,'harness-ui','server.mjs')),'the desktop server is not part of the kernel copy');
  const again=await packVendor({repoRoot:root,out});assert.equal(again.files,6,'its own folder is refreshed');
});

test('R6: a folder the script did not make is never emptied',async t=>{
  const root=await fakeRepo(t);const out=join(root,'cli','vendor');
  await mkdir(out,{recursive:true});await writeFile(join(out,'someone-elses.txt'),'keep me');
  await assert.rejects(packVendor({repoRoot:root,out}),(error:any)=>error?.code==='VENDOR_OUT_NOT_OURS');
  assert.equal(await readFile(join(out,'someone-elses.txt'),'utf8'),'keep me');
  await assert.rejects(packVendor({repoRoot:root,out:join(root,'elsewhere')}),(error:any)=>error?.code==='VENDOR_OUT_OUTSIDE_CLI');
});

test('REV-BUILD-VENDOR-STALE: the normal build refreshes the kernel selected by the packaged runtime',async t=>{
  const root=await fakeRepo(t);const cli=join(root,'cli');
  const sourceCli=fileURLToPath(new URL('../../',import.meta.url));
  const pkg=JSON.parse(await readFile(join(sourceCli,'package.json'),'utf8'));
  await packVendor({repoRoot:root,out:join(cli,'vendor')});
  await writeFile(join(root,'harness-ui/src/session-registry.mjs'),'export const x=4;\n');
  await mkdir(join(cli,'scripts'),{recursive:true});
  await writeFile(join(cli,'scripts/pack-vendor.mjs'),await readFile(join(sourceCli,'scripts/pack-vendor.mjs')));
  await writeFile(join(cli,'scripts/clean-dist.mjs'),await readFile(join(sourceCli,'scripts/clean-dist.mjs')));
  /* Startup stage (01/10): the build bundles with esbuild (scripts/bundle.mjs, its own test in test/build/bundle.test.ts).
     Here a stand-in writes dist/main.js: what this test proves is that the normal build also refreshes the kernel. */
  await writeFile(join(cli,'scripts/bundle.mjs'),"import {mkdirSync,writeFileSync} from 'node:fs';mkdirSync('dist',{recursive:true});writeFileSync('dist/main.js','export const built = true;');\n");
  await writeFile(join(cli,'scripts/pack-documents.mjs'),'/* stand-in: the document libraries have their own test (test/packaging/document-libraries.test.ts) */\n');
  /* P-F (08/10): the last step builds kernel/ FROM vendor/. The stand-in only records which vendored registry it saw: the freshly copied one, i.e. it ran after pack-vendor */
  await writeFile(join(cli,'scripts/bundle-kernel.mjs'),"import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';mkdirSync('kernel',{recursive:true});writeFileSync('kernel/seen-registry.txt',readFileSync('vendor/harness-ui/src/session-registry.mjs','utf8'));\n");
  await writeFile(join(cli,'package.json'),JSON.stringify({type:'module',scripts:{build:pkg.scripts.build}}));
  const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{
    cwd:cli,encoding:'utf8',windowsHide:true,shell:process.platform==='win32',timeout:30000,
    env:{...process.env,PATH:resolve(sourceCli,'node_modules/.bin')+delimiter+(process.env.PATH??'')},
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(await readFile(join(cli,'dist/main.js'),'utf8'),/built/);
  const actual=await readFile(join(cli,'vendor/harness-ui/src/session-registry.mjs'),'utf8');
  assert.equal(actual,'export const x=4;\n','the CLI must load the kernel that was just built');
  const manifest=JSON.parse(await readFile(join(cli,'vendor/manifest.json'),'utf8'));
  assert.equal(manifest.sha256['harness-ui/src/session-registry.mjs'],sha(actual));
  assert.equal(await readFile(join(cli,'kernel/seen-registry.txt'),'utf8'),'export const x=4;\n','the kernel bundle is built from the vendored copy that was just refreshed, never from a stale one');
});

/* review 14 R14-4 of 0.6.13 (0.6.14): the manifest named HEAD even when the kernel trees had changes not committed yet, so a build
   made before the commit said a commit whose files it did not carry. It now says whether the copied trees were clean. */
test('R14-4: the manifest says when the copied kernel trees had uncommitted changes',async t=>{
  const {execFileSync}=await import('node:child_process');
  const root=await fakeRepo(t);const out=join(root,'cli','vendor');
  const git=(...args:string[])=>execFileSync('git',['-c','user.email=t@t','-c','user.name=t','-c','commit.gpgsign=false',...args],{cwd:root,encoding:'utf8'});
  git('init','-q');git('add','-A');git('commit','-q','-m','base');
  const clean=await packVendor({repoRoot:root,out});
  assert.match(String(clean.sourceCommit),/^[0-9a-f]{40}$/u);assert.equal(clean.sourceDirty,false);
  await writeFile(join(root,'harness-ui','src','session-registry.mjs'),'export const x=2;\n');
  const dirty=await packVendor({repoRoot:root,out});
  assert.equal(dirty.sourceCommit,clean.sourceCommit);assert.equal(dirty.sourceDirty,true,'a change in a copied tree is said');
  git('checkout','-q','--','harness-ui/src/session-registry.mjs');await writeFile(join(root,'harness-ui','server.mjs'),'changed, not copied\n');
  assert.equal((await packVendor({repoRoot:root,out})).sourceDirty,false,'a change outside the copied trees is not');
});
