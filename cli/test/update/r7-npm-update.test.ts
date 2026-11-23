/*
 * R7 (owner, 2026-09-25): the first public release is `talos-code@0.1.0` on npm. `talos update` of an npm install asks the
 * registry which version is current and says the npm command; it downloads and changes nothing. Before this, every
 * install asked GitHub for a `talos-cli-v*` release and downloaded the Windows package, the wrong path for npm.
 * No test here reaches the network: the registry is a fake fetch.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {resolveCliPaths} from '../../src/paths.ts';
import {runSystemCommand} from '../../src/commands/system-cli.ts';
import {CLI_VERSION} from '../../src/version.ts';
import {NPM_DIST_TAGS_URL,checkNpmRegistry,installedWithNpm,npmUpdateCommand} from '../../src/update/npm.ts';

const registry=(body:unknown,status=200)=>{const calls:string[]=[];const fetchFn=(async(url:string)=>{calls.push(String(url));return new Response(JSON.stringify(body),{status});}) as unknown as typeof fetch;return{calls,fetchFn};};

/* 0.2.0 (2026-09-26): the version is no longer pinned here (a pin failed at every release, a change-detector); the
   contract is that package.json, the lockfile and src/version.ts say the same valid version. */
test('R7: the package is talos-code, public, with the talos binary, and the CLI says the same version',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.name,'talos-code');
  assert.match(pkg.version,/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
  assert.equal(pkg.private,undefined,'"private" blocks npm publish');
  assert.deepEqual(pkg.bin,{talos:'dist/main.js'});
  assert.equal(CLI_VERSION,pkg.version,'src/version.ts and package.json must say the same version');
  const lock=JSON.parse(readFileSync(new URL('../../package-lock.json',import.meta.url),'utf8'));
  assert.equal(lock.name,'talos-code');assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].name,'talos-code');assert.equal(lock.packages[''].version,pkg.version);
});

test('R7: an npm install is recognised by the node_modules folder above talos-code, on every layout',()=>{
  assert.equal(installedWithNpm('/usr/local/lib/node_modules/talos-code/'),true);
  assert.equal(installedWithNpm('C:\\Users\\a\\AppData\\Roaming\\npm\\node_modules\\talos-code\\'),true);
  /* Review C (06/10): production passes what `findPackageRoot` returns — WITHOUT a trailing separator; both layouts are
     asserted as bare literals so the host platform cannot hide a broken branch. */
  assert.equal(installedWithNpm('/usr/local/lib/node_modules/talos-code'),true);
  assert.equal(installedWithNpm('C:\\Users\\a\\AppData\\Roaming\\npm\\node_modules\\talos-code'),true);
  assert.equal(installedWithNpm('C:\\Users\\a\\AppData\\Local\\Programs\\TALOS CLI\\app\\'),false,'the Windows installer');
  assert.equal(installedWithNpm('C:\\src\\AVM\\cli\\'),false,'a checkout');
  assert.equal(installedWithNpm('/usr/local/lib/node_modules/talos-cli/'),false,'a third-party package with the same binary');
});

test('R7: the registry check reads the dist-tag, compares versions, and names the npm command',async()=>{
  const newer=registry({latest:'0.2.0',next:'0.3.0-beta.1'});
  const stable=await checkNpmRegistry({currentVersion:'0.1.0',channel:'stable',fetchFn:newer.fetchFn});
  assert.deepEqual(stable,{source:'npm',available:true,version:'0.2.0',currentVersion:'0.1.0',channel:'stable',command:'npm i -g talos-code@latest'});
  assert.deepEqual(newer.calls,[NPM_DIST_TAGS_URL]);
  assert.equal(NPM_DIST_TAGS_URL,'https://registry.npmjs.org/-/package/talos-code/dist-tags');
  const preview=await checkNpmRegistry({currentVersion:'0.1.0',channel:'preview',fetchFn:newer.fetchFn});
  assert.equal(preview.version,'0.3.0-beta.1');assert.equal(preview.command,npmUpdateCommand('preview'));assert.equal(preview.command,'npm i -g talos-code@next');
  assert.equal((await checkNpmRegistry({currentVersion:'0.1.0',channel:'stable',fetchFn:registry({latest:'0.1.0'}).fetchFn})).available,false);
  assert.equal((await checkNpmRegistry({currentVersion:'0.2.0',channel:'stable',fetchFn:registry({latest:'0.1.0'}).fetchFn})).available,false,'an older registry version is not an update');
  await assert.rejects(()=>checkNpmRegistry({currentVersion:'0.1.0',channel:'preview',fetchFn:registry({latest:'0.1.0'}).fetchFn}),(e:any)=>e?.code==='UPDATE_RELEASE_NOT_FOUND');
  await assert.rejects(()=>checkNpmRegistry({currentVersion:'0.1.0',channel:'stable',fetchFn:registry({},503).fetchFn}),(e:any)=>e?.code==='UPDATE_HTTP_ERROR'&&e.status===503);
});

test('R7: `talos update` of an npm install says the npm command, asks only the registry, and downloads nothing',async()=>{
  const home=await mkdtemp(join(tmpdir(),'talos-r7-'));
  const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home);
  for(const p of [paths.configRoot,paths.dataRoot,paths.cacheRoot,paths.logsRoot])await mkdir(p,{recursive:true});
  const run=async(format:'json'|'text',body:unknown)=>{
    const out:string[]=[];const fake=registry(body);
    const ctx={invocation:{outputFormat:format} as any,io:{writeOut:(s:string)=>out.push(s),writeErr:()=>{},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:home,repoRoot:home,paths,createRuntimeContext:async()=>({})} as any;
    const code=await runSystemCommand(ctx,'update',[],{update:{packageRoot:join(home,'node_modules','talos-code'),fetchFn:fake.fetchFn}});
    return{code,text:out.join(''),calls:fake.calls};
  };
  const newer=await run('text',{latest:'9.0.0'});
  assert.equal(newer.code,0);
  assert.equal(newer.text,`TALOS CLI 9.0.0 is available (this is ${CLI_VERSION}). Update with: npm i -g talos-code@latest\n`);
  assert.deepEqual(newer.calls,[NPM_DIST_TAGS_URL],'only the registry, no GitHub, no download');
  const same=await run('json',{latest:CLI_VERSION});
  assert.deepEqual(JSON.parse(same.text),{source:'npm',available:false,version:CLI_VERSION,currentVersion:CLI_VERSION,channel:'stable',command:'npm i -g talos-code@latest'});
});
