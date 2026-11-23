import assert from 'node:assert/strict';
import test from 'node:test';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {findTalosRepoRoot} from '../../src/runtime/repo.ts';

const root=(name:string)=>resolve('.talos-runtime-test',name);
const marker=(runtimeRoot:string)=>join(runtimeRoot,'harness-ui','src','session-registry.mjs');
const fakeModule=(installRoot:string)=>pathToFileURL(join(installRoot,'app','dist','runtime','repo.js')).href;
const inertModule=()=>pathToFileURL(join(root('none'),'repo.js')).href;

test('finds TALOS root by CWD ancestor only as the final developer fallback',()=>{
  const runtime=root('cwd-runtime');
  assert.equal(findTalosRepoRoot(join(runtime,'x','y'),{exists:p=>p===marker(runtime),execPath:join(root('none'),'node'),moduleUrl:inertModule(),env:{}}),runtime);
});

test('finds packaged TALOS vendor root from bundled node compatibility layout',()=>{
  const install=root('bundled-install');
  const vendor=join(install,'app','vendor');
  assert.equal(findTalosRepoRoot(root('elsewhere'),{exists:p=>p===marker(vendor),execPath:join(install,'runtime','node.exe'),moduleUrl:inertModule(),env:{}}),vendor);
});

test('running module resolves its packaged vendor before CWD and advanced override',()=>{
  const install=root('module-install');
  const vendor=join(install,'app','vendor');
  const cwd=root('decoy-cwd');
  const override=root('override');
  const valid=new Set([marker(vendor),marker(cwd),marker(override)]);
  const got=findTalosRepoRoot(cwd,{exists:p=>valid.has(p),execPath:join(root('system'),'node'),moduleUrl:fakeModule(install),env:{TALOS_CLI_RUNTIME_ROOT:override}});
  assert.equal(got,vendor);
});

test('running module finds a source checkout by walking from its own location',()=>{
  const source=root('source-checkout');
  const moduleUrl=pathToFileURL(join(source,'cli','dist','runtime','repo.js')).href;
  assert.equal(findTalosRepoRoot(root('elsewhere'),{exists:p=>p===marker(source),execPath:join(root('system'),'node'),moduleUrl,env:{}}),source);
});

test('TALOS_CLI_ROOT resolves the launcher installation without a manual runtime override',()=>{
  const install=root('launcher-install');
  const vendor=join(install,'app','vendor');
  const got=findTalosRepoRoot(root('elsewhere'),{exists:p=>p===marker(vendor),execPath:join(root('system'),'node'),moduleUrl:inertModule(),env:{TALOS_CLI_ROOT:install}});
  assert.equal(got,vendor);
});

test('uses TALOS_CLI_RUNTIME_ROOT only when no stable installation layout exists',()=>{
  const override=root('advanced-override');
  const got=findTalosRepoRoot(root('elsewhere'),{exists:p=>p===marker(override),execPath:join(root('system'),'node'),moduleUrl:inertModule(),env:{TALOS_CLI_RUNTIME_ROOT:override}});
  assert.equal(got,override);
});

test('an explicitly invalid advanced override fails instead of falling through to CWD',()=>{
  const cwd=root('valid-cwd');
  assert.throws(()=>findTalosRepoRoot(cwd,{exists:p=>p===marker(cwd),execPath:join(root('system'),'node'),moduleUrl:inertModule(),env:{TALOS_CLI_RUNTIME_ROOT:root('missing')}}),/TALOS_RUNTIME_ROOT_INVALID/u);
});

/* Startup stage (01/10): the CLI ships as one bundle, `dist/main.js`, one level under the package instead of two
   (`dist/runtime/repo.js`). The packaged vendor must still be found from the bundle's own location. */
test('the bundled CLI (dist/main.js) finds the packaged vendor next to dist',()=>{
  const install=root('bundle-install');
  const vendor=join(install,'app','vendor');
  const cwd=root('decoy-cwd-2');
  const got=findTalosRepoRoot(cwd,{exists:p=>p===marker(vendor)||p===marker(cwd),execPath:join(root('system'),'node'),moduleUrl:pathToFileURL(join(install,'app','dist','main.js')).href,env:{}});
  assert.equal(got,vendor);
});

test('the bundled CLI installed by npm (node_modules/talos-code/dist/main.js) finds its vendor',()=>{
  const pkg=join(root('npm-prefix'),'node_modules','talos-code');
  const vendor=join(pkg,'vendor');
  const got=findTalosRepoRoot(root('elsewhere'),{exists:p=>p===marker(vendor),execPath:join(root('system'),'node'),moduleUrl:pathToFileURL(join(pkg,'dist','main.js')).href,env:{}});
  assert.equal(got,vendor);
});

/* P-F (owner 08/10/2026): the package ships the bundled kernel in kernel/ (scripts/bundle-kernel.mjs), the same layout as vendor/. The BUNDLED CLI prefers it
   and falls back to the loose files of vendor/ when the bundle is missing; the sources (unit tests, a checkout) keep reading vendor/, the byte-for-byte copy. */
test('P-F the bundled CLI prefers the bundled kernel over the loose vendored files, in every installed layout',()=>{
  const install=root('pf-install');
  const kernel=join(install,'app','kernel'),vendor=join(install,'app','vendor');
  const both=new Set([marker(kernel),marker(vendor)]);
  const viaModule=findTalosRepoRoot(root('elsewhere'),{exists:p=>both.has(p),execPath:join(root('system'),'node'),moduleUrl:pathToFileURL(join(install,'app','dist','main.js')).href,env:{},bundled:true});
  assert.equal(viaModule,kernel);
  const viaLauncher=findTalosRepoRoot(root('elsewhere'),{exists:p=>both.has(p),execPath:join(root('system'),'node'),moduleUrl:inertModule(),env:{TALOS_CLI_ROOT:install},bundled:true});
  assert.equal(viaLauncher,kernel);
  const viaNodeLayout=findTalosRepoRoot(root('elsewhere'),{exists:p=>both.has(p),execPath:join(install,'runtime','node.exe'),moduleUrl:inertModule(),env:{},bundled:true});
  assert.equal(viaNodeLayout,kernel);
});

test('P-F without the bundled kernel the bundled CLI falls back to the loose vendored files',()=>{
  const install=root('pf-fallback');
  const vendor=join(install,'app','vendor');
  const got=findTalosRepoRoot(root('elsewhere'),{exists:p=>p===marker(vendor),execPath:join(root('system'),'node'),moduleUrl:pathToFileURL(join(install,'app','dist','main.js')).href,env:{},bundled:true});
  assert.equal(got,vendor);
});

test('P-F the sources (not bundled) keep reading vendor/ even when a bundled kernel sits beside it',()=>{
  const checkout=root('pf-sources');
  const kernel=join(checkout,'kernel'),vendor=join(checkout,'vendor');
  const both=new Set([marker(kernel),marker(vendor)]);
  const moduleUrl=pathToFileURL(join(checkout,'src','runtime','repo.ts')).href;
  const got=findTalosRepoRoot(root('elsewhere'),{exists:p=>both.has(p),execPath:join(root('system'),'node'),moduleUrl,env:{},bundled:false});
  assert.equal(got,vendor);
});
