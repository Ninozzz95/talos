import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTalosSystemKeyring,keyringModuleAvailable} from '../../src/provider/system-keyring.ts';

test('keyring resolves from staged TALOS app node_modules above vendor runtime',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-keyring-'));
  const repoRoot=join(root,'app','vendor');
  await mkdir(join(repoRoot,'harness-ui'),{recursive:true});
  await writeFile(join(repoRoot,'harness-ui','package.json'),JSON.stringify({name:'harness'}));
  const moduleDir=join(root,'app','node_modules','@napi-rs','keyring');
  await mkdir(moduleDir,{recursive:true});
  await writeFile(join(moduleDir,'package.json'),JSON.stringify({name:'@napi-rs/keyring',version:'1.3.0',main:'index.cjs'}));
  await writeFile(join(moduleDir,'index.cjs'),`const values=new Map();exports.Entry=class Entry{constructor(s,a){this.k=s+':'+a}getPassword(){return values.get(this.k)||null}setPassword(v){values.set(this.k,v)}deletePassword(){values.delete(this.k)}};`);
  assert.equal(keyringModuleAvailable(repoRoot),true);
  const keyring=createTalosSystemKeyring(repoRoot);
  assert.ok(keyring);
  await keyring!.set('talos-cli-provider','openai','secret');
  assert.equal(await keyring!.get('talos-cli-provider','openai'),'secret');
  await keyring!.remove('talos-cli-provider','openai');
  assert.equal(await keyring!.get('talos-cli-provider','openai'),null);
});

test('keyring outside approved runtime roots is reported unavailable without throwing',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-keyring-missing-'));
  const repoRoot=join(root,'workspace','repo');
  await mkdir(join(repoRoot,'harness-ui'),{recursive:true});
  await writeFile(join(repoRoot,'harness-ui','package.json'),'{}');
  const outside=join(root,'node_modules','@napi-rs','keyring');
  await mkdir(outside,{recursive:true});
  await writeFile(join(outside,'package.json'),JSON.stringify({name:'@napi-rs/keyring',version:'1.3.0',main:'index.cjs'}));
  await writeFile(join(outside,'index.cjs'),'exports.Entry=class Entry{};');
  assert.equal(keyringModuleAvailable(repoRoot),false);
  assert.equal(createTalosSystemKeyring(repoRoot),null);
});

test('keyring doctor probe verifies a real temporary set get remove round trip',async()=>{
  const values=new Map<string,string>();const calls:string[]=[];
  const keyring={
    set(service:string,account:string,value:string){calls.push(`set:${service}:${account}`);values.set(`${service}:${account}`,value);},
    get(service:string,account:string){calls.push(`get:${service}:${account}`);return values.get(`${service}:${account}`)??null;},
    remove(service:string,account:string){calls.push(`remove:${service}:${account}`);values.delete(`${service}:${account}`);},
  };
  const {probeSystemKeyring}=await import('../../src/provider/system-keyring.ts');
  assert.equal(await probeSystemKeyring(keyring as any,'fixed-probe'),true);
  assert.deepEqual(calls,['set:talos-cli-doctor:fixed-probe','get:talos-cli-doctor:fixed-probe','remove:talos-cli-doctor:fixed-probe']);
  assert.equal(values.size,0);
});

test('keyring doctor probe cleans up and reports false when round trip fails',async()=>{
  let removed=false;
  const keyring={set(){},get(){return 'wrong';},remove(){removed=true;}};
  const {probeSystemKeyring}=await import('../../src/provider/system-keyring.ts');
  assert.equal(await probeSystemKeyring(keyring as any,'failed-probe'),false);
  assert.equal(removed,true);
});

/* P-F (owner 08/10/2026): the package ships the bundled kernel in `kernel/` beside `vendor/` (scripts/bundle-kernel.mjs); its package's node_modules is above it exactly as
   it is above vendor/, and a folder merely NAMED kernel anywhere else is still outside the approved roots. */
test('keyring resolves from the TALOS app node_modules above the bundled kernel/ runtime, as above vendor/',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-keyring-kernel-'));
  const repoRoot=join(root,'app','kernel');
  await mkdir(join(repoRoot,'harness-ui'),{recursive:true});
  await writeFile(join(repoRoot,'harness-ui','package.json'),JSON.stringify({name:'harness'}));
  const moduleDir=join(root,'app','node_modules','@napi-rs','keyring');
  await mkdir(moduleDir,{recursive:true});
  await writeFile(join(moduleDir,'package.json'),JSON.stringify({name:'@napi-rs/keyring',version:'1.3.0',main:'index.cjs'}));
  await writeFile(join(moduleDir,'index.cjs'),'const values=new Map();exports.Entry=class Entry{constructor(s,a){this.k=s+":"+a}getPassword(){return values.get(this.k)||null}setPassword(v){values.set(this.k,v)}deletePassword(){values.delete(this.k)}};');
  assert.equal(keyringModuleAvailable(repoRoot),true);
  const keyring=createTalosSystemKeyring(repoRoot);
  assert.ok(keyring);
  await keyring!.set('talos-cli-provider','openai','secret');
  assert.equal(await keyring!.get('talos-cli-provider','openai'),'secret');
});

test('keyring above some other folder name is still outside the approved roots',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-keyring-other-'));
  const repoRoot=join(root,'app','somewhere-else');
  await mkdir(join(repoRoot,'harness-ui'),{recursive:true});
  await writeFile(join(repoRoot,'harness-ui','package.json'),'{}');
  const outside=join(root,'app','node_modules','@napi-rs','keyring');
  await mkdir(outside,{recursive:true});
  await writeFile(join(outside,'package.json'),JSON.stringify({name:'@napi-rs/keyring',version:'1.3.0',main:'index.cjs'}));
  await writeFile(join(outside,'index.cjs'),'exports.Entry=class Entry{};');
  assert.equal(keyringModuleAvailable(repoRoot),false);
});
