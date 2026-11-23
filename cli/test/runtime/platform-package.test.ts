/*
 * Installation, platform packages (owner 02/10, registro 12): on Windows the sandbox comes from the optional package of
 * this machine (`talos-code-win32-x64`, an alias of `talos-code@<ver>-win32-x64`, like Codex). The CLI looks there first;
 * in a checkout it is not installed and the build dependency answers; when neither is there (npm told to skip optional
 * dependencies, a failed download) the error says which package is missing and how to reinstall, as Codex and Claude
 * Code do. A fake package tree in a temporary folder.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {importFromPlatformPackage,platformPackageOf} from '../../src/runtime/platform-package.ts';

function tree(t:any,{installed}:{installed:boolean}){
  const base=mkdtempSync(join(tmpdir(),'talos-platform-package-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const root=join(base,'node_modules','talos-code');mkdirSync(join(root,'dist'),{recursive:true});
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'talos-code',version:'9.9.9'}));
  if(installed){
    const platform=join(root,'node_modules','talos-code-win32-x64');
    const sdk=join(platform,'vendor','node_modules','@microsoft','mxc-sdk');mkdirSync(join(sdk,'dist'),{recursive:true});
    writeFileSync(join(platform,'package.json'),JSON.stringify({name:'talos-code',version:'9.9.9-win32-x64',os:['win32'],cpu:['x64']}));
    writeFileSync(join(sdk,'package.json'),JSON.stringify({name:'@microsoft/mxc-sdk',type:'module',exports:{'.':{types:'./dist/index.d.ts',import:'./dist/index.js'}}}));
    writeFileSync(join(sdk,'dist','index.js'),'export const from = "platform package";\n');
  }
  return root;
}

test('the platform package of this machine: only Windows x64 and arm64 have one',()=>{
  assert.equal(platformPackageOf('win32','x64'),'talos-code-win32-x64');
  assert.equal(platformPackageOf('win32','arm64'),'talos-code-win32-arm64');
  assert.equal(platformPackageOf('linux','x64'),null);
  assert.equal(platformPackageOf('darwin','arm64'),null);
  assert.equal(platformPackageOf('win32','ia32'),null);
});

test('installed: the sandbox comes from the platform package, not from anywhere else',async t=>{
  const packageRoot=tree(t,{installed:true});
  let fellBack=false;
  const sdk:any=await importFromPlatformPackage('@microsoft/mxc-sdk',{packageRoot,platform:'win32',arch:'x64',fallback:async()=>{fellBack=true;return{from:'elsewhere'};}});
  assert.equal(sdk.from,'platform package');assert.equal(fellBack,false);
});

test('a checkout: no platform package, the build dependency answers',async t=>{
  const packageRoot=tree(t,{installed:false});
  const sdk:any=await importFromPlatformPackage('@microsoft/mxc-sdk',{packageRoot,platform:'win32',arch:'x64',fallback:async()=>({from:'build dependency'})});
  assert.equal(sdk.from,'build dependency');
});

test('missing everywhere: the error names the package and the command that brings it back',async t=>{
  const packageRoot=tree(t,{installed:false});
  await assert.rejects(
    importFromPlatformPackage('@microsoft/mxc-sdk',{packageRoot,platform:'win32',arch:'x64',version:'9.9.9',fallback:async()=>{throw Object.assign(new Error('Cannot find package'),{code:'ERR_MODULE_NOT_FOUND'});}}),
    (error:any)=>error?.code==='PLATFORM_PACKAGE_MISSING'&&/talos-code-win32-x64/u.test(error.message)&&/npm install -g talos-code@9\.9\.9/u.test(error.message)&&error.cause?.code==='ERR_MODULE_NOT_FOUND',
  );
});

test('a machine with no platform package goes straight to the ordinary import',async t=>{
  const packageRoot=tree(t,{installed:true});
  const sdk:any=await importFromPlatformPackage('@microsoft/mxc-sdk',{packageRoot,platform:'linux',arch:'x64',fallback:async()=>({from:'ordinary'})});
  assert.equal(sdk.from,'ordinary');
});
