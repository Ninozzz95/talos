import assert from 'node:assert/strict';
import test from 'node:test';
import {join} from 'node:path';
import {pathInstallationsCheck,talosInstallationsInPath} from '../../src/update/path-installations.ts';

/* B14 (owner's second machine, 09/10/2026): an old talos first in PATH hid the new one and `talos --version` kept saying
   0.5.0-beta.6. The fake folders below are that machine's layout. */
const NODE='C:\\Users\\u\\AppData\\Local\\Programs\\nodejs\\node-v24.18.0-win-x64';
const NPM='C:\\Users\\u\\AppData\\Roaming\\npm';
function fakeFs(files:Record<string,string>){
  const has=(f:string)=>Object.hasOwn(files,f);
  return{exists:has,read:(f:string)=>{if(!has(f))throw Object.assign(new Error('ENOENT'),{code:'ENOENT'});return files[f]!;},realpath:(f:string)=>f};
}
const pkg=(v:string)=>JSON.stringify({name:'talos-code',version:v});
const machine=fakeFs({
  [join(NODE,'talos.cmd')]:'',[join(NODE,'node_modules','talos-code','package.json')]:pkg('0.5.0-beta.6'),
  [join(NPM,'talos.cmd')]:'',[join(NPM,'node_modules','talos-code','package.json')]:pkg('0.5.2'),
});

test('B14: every talos in PATH is listed in PATH order with its version, the running one marked',()=>{
  const rows=talosInstallationsInPath({env:{PATH:`${NODE};C:\\Windows;${NPM}`},platform:'win32',runningRoot:join(NPM,'node_modules','talos-code'),fs:machine});
  assert.deepEqual(rows.map(r=>[r.dir,r.version,r.running]),[[NODE,'0.5.0-beta.6',false],[NPM,'0.5.2',true]]);
});

test('B14: an older talos first in PATH hiding this one is a problem, with the fix the owner used',()=>{
  const rows=talosInstallationsInPath({env:{PATH:`${NODE};${NPM}`},platform:'win32',runningRoot:join(NPM,'node_modules','talos-code'),fs:machine});
  const check=pathInstallationsCheck(rows,'0.5.2','win32')!;
  assert.equal(check.ok,false);
  assert.match(check.detail!,/"talos" runs 0\.5\.0-beta\.6 from .*nodejs.*, but 0\.5\.2 is in .*Roaming\\npm/u);
  assert.match(check.detail!,/npm i -g talos-code@0\.5\.2 --prefix ".*node-v24\.18\.0-win-x64"/u);
});

test('B14: the old one running still sees the newer one hidden behind it',()=>{
  const rows=talosInstallationsInPath({env:{PATH:`${NODE};${NPM}`},platform:'win32',runningRoot:join(NODE,'node_modules','talos-code'),fs:machine});
  const check=pathInstallationsCheck(rows,'0.5.0-beta.6','win32')!;
  assert.equal(check.ok,false);
  assert.match(check.detail!,/but 0\.5\.2 is in/u);
});

test('B14: one installation, or the newest first and running, is fine',()=>{
  const one=talosInstallationsInPath({env:{PATH:NPM},platform:'win32',runningRoot:join(NPM,'node_modules','talos-code'),fs:machine});
  assert.deepEqual(pathInstallationsCheck(one,'0.5.2','win32'),{id:'path',ok:true,installations:one});
  const both=talosInstallationsInPath({env:{PATH:`${NPM};${NODE}`},platform:'win32',runningRoot:join(NPM,'node_modules','talos-code'),fs:machine});
  assert.equal(pathInstallationsCheck(both,'0.5.2','win32')!.ok,true);
  assert.equal(pathInstallationsCheck([],'0.5.2','win32'),null,'not in PATH at all (npx, a direct path): no row');
});

test('B14: POSIX global layout, a bin link into lib/node_modules',()=>{
  const fs=fakeFs({'/usr/local/bin/talos':'','/usr/local/lib/node_modules/talos-code/package.json':pkg('0.5.2')});
  const posix={...fs,realpath:(f:string)=>f==='/usr/local/bin/talos'?'/usr/local/lib/node_modules/talos-code/dist/main.js':f};
  const rows=talosInstallationsInPath({env:{PATH:'/usr/bin:/usr/local/bin'},platform:'linux',runningRoot:'/usr/local/lib/node_modules/talos-code',fs:posix});
  assert.deepEqual(rows.map(r=>[r.dir,r.version,r.running]),[['/usr/local/bin','0.5.2',true]]);
});

test('B14: run from outside PATH (npx, a direct path, a test prefix), a global talos is listed but not a problem',()=>{
  const rows=talosInstallationsInPath({env:{PATH:`${NODE};${NPM}`},platform:'win32',runningRoot:'C:\\tmp\\prefix\\node_modules\\talos-code',fs:machine});
  assert.equal(rows.some(r=>r.running),false);
  assert.equal(pathInstallationsCheck(rows,'0.5.3','win32')!.ok,true);
});
