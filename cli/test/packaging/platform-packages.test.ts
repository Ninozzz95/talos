/*
 * Installation, platform packages (owner 02/10: «Stesso nome, come Codex», «Solo i 2 Windows»; registro 12). The Windows
 * sandbox (`@microsoft/mxc-sdk` with the programs for x64, arm64, Linux and Mac: 65 MB) and `node-pty` (27 MB, 19.8 MB of
 * `.pdb` debug files, two Windows architectures) were installed on every machine, although the CLI uses them only on
 * Windows (security/execution-backends.ts). Like Codex (`npm:@openai/codex@<ver>-win32-x64`), esbuild and Biome, they now
 * travel in one package per Windows architecture, an optional dependency that npm installs only on the matching machine
 * (`os`/`cpu`), with no install script (pnpm 10 and Yarn skip them; vestige PR #278), and the main package names them
 * with exact versions. Built from the real node_modules, into a temporary folder.
 */
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,relative,sep} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {PLATFORMS,packPlatform,platformDependencies} from '../../scripts/pack-platforms.mjs';

const CLI=fileURLToPath(new URL('../../',import.meta.url));
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]);
const inside=(root:string,file:string)=>!relative(root,file).startsWith('..');

async function packed(t:any,platform:string){
  const out=await mkdtemp(join(tmpdir(),'platform-package-'));t.after(()=>rm(out,{recursive:true,force:true}));
  const dir=await packPlatform({cliRoot:CLI,platform,out,version:'9.8.7'});
  return dir as string;
}

test('only the two Windows architectures get a platform package',()=>{
  assert.deepEqual(Object.keys(PLATFORMS).sort(),['win32-arm64','win32-x64']);
});

test('the main package names each platform package by alias at the exact same version, like Codex',()=>{
  assert.deepEqual(platformDependencies('0.5.0-beta.1'),{
    'talos-code-win32-arm64':'npm:talos-code@0.5.0-beta.1-win32-arm64',
    'talos-code-win32-x64':'npm:talos-code@0.5.0-beta.1-win32-x64',
  });
});

test('the published package.json names the platform packages and carries no build script (scripts/stage-release.mjs)',async()=>{
  const {releaseManifest}=await import('../../scripts/stage-release.mjs');
  const pkg=JSON.parse(readFileSync(join(CLI,'package.json'),'utf8'));
  const published=releaseManifest(pkg);
  assert.equal(published.scripts,undefined,'prepack would build again on `npm pack` of the staged folder');
  assert.deepEqual(published.optionalDependencies,platformDependencies(pkg.version));
  assert.deepEqual(published.dependencies,pkg.dependencies);assert.equal(published.version,pkg.version);assert.deepEqual(published.bin,pkg.bin);
  assert.equal(pkg.optionalDependencies?.['talos-code-win32-x64'],undefined,'the checkout never names a version that is not published yet');
});

test('the sandbox and node-pty are no longer installed on every machine',()=>{
  const pkg=JSON.parse(readFileSync(join(CLI,'package.json'),'utf8'));
  for(const name of ['@microsoft/mxc-sdk','node-pty'])assert.equal(pkg.dependencies?.[name],undefined,`${name} travels in the platform package`);
  assert.ok(pkg.devDependencies?.['@microsoft/mxc-sdk'],'the build still needs it to make the platform packages');
});

test('win32-x64: npm installs it only on Windows x64, with no script, and it carries only that machine\'s programs',async t=>{
  const dir=await packed(t,'win32-x64');
  const pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  assert.equal(pkg.name,'talos-code');assert.equal(pkg.version,'9.8.7-win32-x64');
  assert.deepEqual(pkg.os,['win32']);assert.deepEqual(pkg.cpu,['x64']);
  assert.equal(pkg.scripts,undefined,'no install script');
  assert.equal(pkg.dependencies,undefined,'nothing more to install');
  const all=files(dir).map(file=>relative(dir,file).split(sep).join('/'));
  const sdk='vendor/node_modules/@microsoft/mxc-sdk';
  for(const need of [`${sdk}/package.json`,`${sdk}/LICENSE.md`,`${sdk}/dist/index.js`,`${sdk}/bin/x64/wxc-exec.exe`,`${sdk}/bin/x64/wxc-test-proxy.exe`,`${sdk}/bin/x64/wslcsdk.dll`,
    'vendor/node_modules/node-pty/package.json','vendor/node_modules/node-pty/LICENSE','vendor/node_modules/node-pty/lib/index.js',
    'vendor/node_modules/node-pty/prebuilds/win32-x64/conpty.node','vendor/node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe',
    'vendor/node_modules/semver/package.json','vendor/node_modules/semver/LICENSE','LICENSE'])assert.ok(all.includes(need),`missing ${need}`);
  assert.deepEqual(all.filter(file=>/\.pdb$/u.test(file)),[],'no debug files');
  assert.deepEqual(all.filter(file=>/\/bin\/arm64\/|prebuilds\/(?!win32-x64\/)/u.test(file)),[],'no other architecture');
  assert.deepEqual(all.filter(file=>/\/(lxc-exec|mxc-exec-mac|unix-test-proxy)$/u.test(file)),[],'no Linux or Mac program');
  assert.deepEqual(all.filter(file=>/\.(d\.ts|map)$/u.test(file)),[],'no type or source map files');
  const ptyPkg=JSON.parse(readFileSync(join(dir,'vendor/node_modules/node-pty/package.json'),'utf8'));
  assert.equal(ptyPkg.scripts?.install,undefined,'node-pty would rebuild itself with node-gyp');
  const bytes=files(dir).reduce((sum,file)=>sum+statSync(file).size,0);
  assert.ok(bytes<45*1024*1024,`win32-x64 package is ${Math.round(bytes/1024/1024)} MB`);
});

test('win32-x64: the sandbox finds node-pty, semver and its own programs inside the platform package',async t=>{
  const dir=await packed(t,'win32-x64');
  const sdkRequire=createRequire(join(dir,'vendor/node_modules/@microsoft/mxc-sdk/dist/sandbox.js'));
  for(const name of ['node-pty','semver','@microsoft/mxc-sdk/package.json'])assert.ok(inside(dir,sdkRequire.resolve(name)),`${name} resolved outside: ${sdkRequire.resolve(name)}`);
  if(process.platform==='win32'&&process.arch==='x64'){
    const pty=sdkRequire('node-pty');
    assert.equal(typeof pty.spawn,'function','node-pty loads its native part from the platform package');
  }
});

test('win32-arm64 carries the arm64 programs only',async t=>{
  const dir=await packed(t,'win32-arm64');
  const pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  assert.deepEqual(pkg.cpu,['arm64']);assert.equal(pkg.version,'9.8.7-win32-arm64');
  const all=files(dir).map(file=>relative(dir,file).split(sep).join('/'));
  assert.ok(all.includes('vendor/node_modules/@microsoft/mxc-sdk/bin/arm64/wxc-exec.exe'));
  assert.ok(all.includes('vendor/node_modules/node-pty/prebuilds/win32-arm64/conpty.node'));
  assert.deepEqual(all.filter(file=>/\/bin\/x64\/|prebuilds\/(?!win32-arm64\/)/u.test(file)),[]);
});

test('an unknown platform is refused, never a package with the wrong programs',async()=>{
  await assert.rejects(packPlatform({cliRoot:CLI,platform:'linux-x64',out:tmpdir(),version:'1.0.0'}),(error:any)=>error?.code==='PLATFORM_UNKNOWN');
});
