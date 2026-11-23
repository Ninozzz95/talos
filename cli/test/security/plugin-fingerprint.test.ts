import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {PLUGIN_PACKAGE_MAX_FILES,inventoryProjectResources} from '../../src/security/project-resource-inventory.ts';
import {createProjectTrustService} from '../../src/security/project-trust.ts';
import {resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';

async function project(){
  const parent=await mkdtemp(join(tmpdir(),'talos-plugin-fingerprint-'));
  const projectRoot=join(parent,'project');
  await mkdir(join(projectRoot,'.talos-cli'),{recursive:true});
  await writeFile(join(projectRoot,'.talos-cli','config.json'),'{}\n','utf8');
  return{parent,projectRoot,trustRoot:join(parent,'trust')};
}
async function pkg(projectRoot:string,id='demo'){
  const packageRoot=join(projectRoot,'.harness-ui-plugins',id);
  await mkdir(packageRoot,{recursive:true});
  await writeFile(join(packageRoot,'plugin.json'),`{"id":"${id}","entry":"run.js"}\n`,'utf8');
  await writeFile(join(packageRoot,'run.js'),'export function run(){return 1;}\n','utf8');
  return packageRoot;
}
async function trusted(f:{projectRoot:string;trustRoot:string}){
  const workspace=await resolveWorkspaceIdentity({projectRoot:f.projectRoot});
  const service=createProjectTrustService({trustRoot:f.trustRoot});
  await service.trust(workspace,await inventoryProjectResources(workspace));
  return{workspace,service,verdict:async()=>await service.verifySnapshot(workspace,await inventoryProjectResources(workspace))};
}

test('editing an executable file inside a trusted plugin package invalidates the snapshot',async()=>{
  const f=await project();const packageRoot=await pkg(f.projectRoot);
  const t=await trusted(f);
  assert.deepEqual(await t.verdict(),{trusted:true,reason:'PROJECT_TRUSTED'});
  await writeFile(join(packageRoot,'run.js'),'export function run(){return 2;}\n','utf8');
  assert.deepEqual(await t.verdict(),{trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED'},'editing run.js beside a trusted plugin.json must be noticed');
  await writeFile(join(packageRoot,'run.js'),'export function run(){return 1;}\n','utf8');
  assert.deepEqual(await t.verdict(),{trusted:true,reason:'PROJECT_TRUSTED'},'restoring the exact bytes must restore the verdict');
  await writeFile(join(packageRoot,'plugin.json'),'{"id":"demo","entry":"other.js"}\n','utf8');
  assert.deepEqual(await t.verdict(),{trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED'},'the manifest must still be covered');
});

test('a nested executable file inside a trusted plugin package is covered too',async()=>{
  const f=await project();const packageRoot=await pkg(f.projectRoot);
  await mkdir(join(packageRoot,'lib','deep'),{recursive:true});
  await writeFile(join(packageRoot,'lib','deep','worker.js'),'export const step=1;\n','utf8');
  const t=await trusted(f);
  assert.deepEqual(await t.verdict(),{trusted:true,reason:'PROJECT_TRUSTED'});
  await writeFile(join(packageRoot,'lib','deep','worker.js'),'export const step=2;\n','utf8');
  assert.deepEqual(await t.verdict(),{trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED'});
});

test('adding a file to a trusted plugin package, and deleting one, both change the resource set',async()=>{
  const f=await project();const packageRoot=await pkg(f.projectRoot);
  const t=await trusted(f);
  await writeFile(join(packageRoot,'smuggled.js'),'export const payload=1;\n','utf8');
  assert.deepEqual(await t.verdict(),{trusted:false,reason:'RESOURCE_SET_CHANGED'},'an added executable file must change the set');
  await rm(join(packageRoot,'smuggled.js'));
  assert.deepEqual(await t.verdict(),{trusted:true,reason:'PROJECT_TRUSTED'});
  await rm(join(packageRoot,'run.js'));
  assert.deepEqual(await t.verdict(),{trusted:false,reason:'RESOURCE_SET_CHANGED'},'a deleted executable file must be detected, not silently tolerated');
});

test('a junction inside a plugin package neither escapes the package walk nor hides a file from fingerprinting',async()=>{
  const f=await project();const packageRoot=await pkg(f.projectRoot);
  const outside=join(f.parent,'outside');
  await mkdir(outside,{recursive:true});
  await writeFile(join(outside,'escaped.js'),'export const escaped=1;\n','utf8');
  const workspace=await resolveWorkspaceIdentity({projectRoot:f.projectRoot});
  const clean=await inventoryProjectResources(workspace);
  assert.deepEqual(clean.map(x=>x.relativePath).sort(),['.harness-ui-plugins/demo/plugin.json','.harness-ui-plugins/demo/run.js','.talos-cli/config.json']);
  await symlink(outside,join(packageRoot,'vendor'),'junction');
  await assert.rejects(()=>inventoryProjectResources(workspace),(error:any)=>error?.code==='RESOURCE_DIRECTORY_SYMLINK_UNSUPPORTED','a junction nested inside the package must be refused, not followed and not skipped');
  await rm(join(packageRoot,'vendor'),{recursive:true,force:true});
  const after=await inventoryProjectResources(workspace);
  assert.equal(after.some(x=>x.relativePath.includes('escaped')||x.relativePath.startsWith('..')),false,'no resource may come from outside the package');
});

test('a file symlink inside a plugin package is refused rather than followed or skipped',async t=>{
  const f=await project();const packageRoot=await pkg(f.projectRoot);
  const outside=join(f.parent,'outside');
  await mkdir(outside,{recursive:true});
  await writeFile(join(outside,'escaped.js'),'export const escaped=1;\n','utf8');
  try{await symlink(join(outside,'escaped.js'),join(packageRoot,'escaped.js'),'file');}
  catch(error:any){if(error?.code==='EPERM'){t.skip('file symlinks need Developer Mode or elevation on this host (EPERM): the file-symlink branch is NOT exercised here');return;}throw error;}
  const workspace=await resolveWorkspaceIdentity({projectRoot:f.projectRoot});
  await assert.rejects(()=>inventoryProjectResources(workspace),(error:any)=>error?.code==='RESOURCE_DIRECTORY_SYMLINK_UNSUPPORTED','a file symlink must not smuggle unfingerprinted content into the package');
});

test('a project with no plugin packages keeps the inventory it had, at a bounded cost',async()=>{
  const f=await project();
  await writeFile(join(f.projectRoot,'AGENTS.md'),'rules\n','utf8');
  await mkdir(join(f.projectRoot,'.talos-cli','commands'),{recursive:true});
  await writeFile(join(f.projectRoot,'.talos-cli','commands','review.md'),'review\n','utf8');
  const workspace=await resolveWorkspaceIdentity({projectRoot:f.projectRoot});
  await inventoryProjectResources(workspace);
  const started=performance.now();
  const resources=await inventoryProjectResources(workspace);
  const elapsed=performance.now()-started;
  assert.deepEqual(resources.map(x=>x.relativePath).sort(),['.talos-cli/commands/review.md','.talos-cli/config.json','AGENTS.md']);
  assert.ok(elapsed<250,`plugin-free inventory must stay cheap, took ${elapsed.toFixed(1)} ms`);
});

// Bound, measured on this host at 10 000 files: walk ~98 ms, fingerprint at concurrency 32 ~370 ms,
// total ~470 ms warm. Unbounded Promise.all over the same set dies with EMFILE, so the concurrency
// bound is load bearing, not cosmetic. The file cap fails CLOSED: truncating the walk instead would
// reopen exactly the hole this slice closes.
test('a plugin package carrying a node_modules tree stays inside a declared bound',async()=>{
  assert.equal(PLUGIN_PACKAGE_MAX_FILES,10_000,'the bound is declared, not implicit');
  const f=await project();const packageRoot=await pkg(f.projectRoot);
  const writes:Promise<unknown>[]=[];
  for(let p=0;p<60;p++){
    const dir=join(packageRoot,'node_modules',`dep-${p}`,'lib');
    await mkdir(dir,{recursive:true});
    for(let m=0;m<20;m++)writes.push(writeFile(join(dir,`m${m}.js`),`export const v=${p*100+m};\n`,'utf8'));
  }
  await Promise.all(writes);
  const workspace=await resolveWorkspaceIdentity({projectRoot:f.projectRoot});
  await inventoryProjectResources(workspace);
  const started=performance.now();
  const resources=await inventoryProjectResources(workspace);
  const elapsed=performance.now()-started;
  assert.equal(resources.filter(x=>x.kind==='plugin').length,1202,'every file in the package is fingerprinted, node_modules included');
  assert.ok(elapsed<5_000,`a trust check on a 1202 file package must not stall, took ${elapsed.toFixed(1)} ms`);
  const service=createProjectTrustService({trustRoot:f.trustRoot});
  await service.trust(workspace,resources);
  await writeFile(join(packageRoot,'node_modules','dep-7','lib','m3.js'),'export const v=999999;\n','utf8');
  assert.deepEqual(await service.verifySnapshot(workspace,await inventoryProjectResources(workspace)),{trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED'},'code hidden in node_modules is covered as well');
});

test('a plugin package above the declared file bound is refused, never silently truncated',async()=>{
  const f=await project();const packageRoot=await pkg(f.projectRoot);
  const writes:Promise<unknown>[]=[];
  for(let m=0;m<40;m++)writes.push(writeFile(join(packageRoot,`m${m}.js`),`export const v=${m};\n`,'utf8'));
  await Promise.all(writes);
  const workspace=await resolveWorkspaceIdentity({projectRoot:f.projectRoot});
  await assert.doesNotReject(()=>inventoryProjectResources(workspace,{maxPackageFiles:42}),'42 files is exactly the bound');
  await assert.rejects(()=>inventoryProjectResources(workspace,{maxPackageFiles:41}),(error:any)=>error?.code==='RESOURCE_PACKAGE_TOO_LARGE','one file over the bound must fail closed');
  const raised=await inventoryProjectResources(workspace,{maxPackageFiles:Number.MAX_SAFE_INTEGER});
  assert.equal(raised.filter(x=>x.kind==='plugin').length,42,'a caller may lower the bound but never raise it above the declared default');
});

// C1. The concurrency bound is observed on the real call path, not inferred from a host's descriptor
// limit: EMFILE depends on that limit and would pass vacuously where it is large.
test('fingerprinting runs concurrently but never holds more than 32 reads in flight',async()=>{
  const f=await project();const packageRoot=await pkg(f.projectRoot);
  await Promise.all(Array.from({length:198},(_,m)=>writeFile(join(packageRoot,`m${m}.js`),`export const v=${m};\n`,'utf8')));
  const workspace=await resolveWorkspaceIdentity({projectRoot:f.projectRoot});
  const fsp=createRequire(import.meta.url)('node:fs/promises') as {readFile:(...args:unknown[])=>Promise<unknown>};
  const original=fsp.readFile;let inFlight=0;let peak=0;
  fsp.readFile=async(...args:unknown[])=>{inFlight++;peak=Math.max(peak,inFlight);try{return await original(...args);}finally{inFlight--;}};
  syncBuiltinESMExports();
  let resources;
  try{resources=await inventoryProjectResources(workspace);}
  finally{fsp.readFile=original;syncBuiltinESMExports();}
  assert.equal(resources.filter(x=>x.kind==='plugin').length,200);
  assert.ok(peak>1,`hashing must go through readFile and run concurrently, observed peak ${peak}`);
  assert.ok(peak<=32,`at most 32 reads may be in flight, observed peak ${peak}`);
});

// C2. The DEFAULT cap is crossed for real, with nothing injected: asserting the constant is not
// asserting that it is enforced, and a caller must not be able to raise it.
test('a real 10 001 file package is refused at the default cap, and the cap cannot be raised',async()=>{
  const f=await project();
  try{
    const packageRoot=await pkg(f.projectRoot);
    for(let d=0;d<100;d++){
      const dir=join(packageRoot,'node_modules',`dep-${d}`);
      await mkdir(dir,{recursive:true});
      const count=d===99?99:100;
      await Promise.all(Array.from({length:count},(_,m)=>writeFile(join(dir,`m${m}.js`),'x','utf8')));
    }
    const workspace=await resolveWorkspaceIdentity({projectRoot:f.projectRoot});
    await assert.rejects(()=>inventoryProjectResources(workspace),(error:any)=>error?.code==='RESOURCE_PACKAGE_TOO_LARGE','10 001 files with no option passed must fail closed at the default cap');
    await assert.rejects(()=>inventoryProjectResources(workspace,{maxPackageFiles:Number.MAX_SAFE_INTEGER}),(error:any)=>error?.code==='RESOURCE_PACKAGE_TOO_LARGE','a caller asking for a larger cap must still be refused');
  }finally{await rm(f.parent,{recursive:true,force:true});}
});

// C3. No extension allow-list and no dot-directory skip: each of these files can be loaded or run,
// so swapping any ONE of them alone must be noticed.
test('every file kind in a trusted plugin package is covered: .mjs, .cjs, extension-less, dot-directory',async()=>{
  const f=await project();const packageRoot=await pkg(f.projectRoot);
  const files:Record<string,string>={
    'run.mjs':'export default function run(){return 1;}\n',
    'helper.cjs':'module.exports=()=>1;\n',
    'launch':'#!/usr/bin/env node\nconsole.log(1);\n',
    '.hidden/x.js':'export const hidden=1;\n'
  };
  for(const [name,content] of Object.entries(files)){await mkdir(join(packageRoot,name,'..'),{recursive:true});await writeFile(join(packageRoot,name),content,'utf8');}
  const t=await trusted(f);
  assert.deepEqual(await t.verdict(),{trusted:true,reason:'PROJECT_TRUSTED'});
  for(const [name,content] of Object.entries(files)){
    await writeFile(join(packageRoot,name),content.replace('1','2'),'utf8');
    assert.deepEqual(await t.verdict(),{trusted:false,reason:'RESOURCE_FINGERPRINT_CHANGED'},`swapping ${name} alone must be noticed`);
    await writeFile(join(packageRoot,name),content,'utf8');
    assert.deepEqual(await t.verdict(),{trusted:true,reason:'PROJECT_TRUSTED'},`restoring ${name} must restore the verdict`);
  }
});

// C4. The id is part of the saved record key, so its format is pinned: forward slashes, with the
// .harness-ui-plugins prefix, on every platform.
test('plugin resource ids are workspace-relative with forward slashes, in memory and in the saved record',async()=>{
  const f=await project();await pkg(f.projectRoot);
  const workspace=await resolveWorkspaceIdentity({projectRoot:f.projectRoot});
  const resources=await inventoryProjectResources(workspace);
  const run=resources.find(x=>x.relativePath==='.harness-ui-plugins/demo/run.js');
  assert.ok(run,'run.js must be inventoried');
  assert.equal(run.id,'.harness-ui-plugins/demo/run.js');
  assert.deepEqual(resources.filter(x=>x.kind==='plugin').map(x=>x.id),['.harness-ui-plugins/demo/plugin.json','.harness-ui-plugins/demo/run.js']);
  await createProjectTrustService({trustRoot:f.trustRoot}).trust(workspace,resources);
  const record=JSON.parse(await readFile(join(f.trustRoot,`${workspace.identityHash}.json`),'utf8'));
  assert.deepEqual(Object.keys(record.resources).filter((key:string)=>key.startsWith('plugin:')),['plugin:.harness-ui-plugins/demo/plugin.json','plugin:.harness-ui-plugins/demo/run.js']);
});
