/* Startup stage (01/10): the CLI ships as one bundle, `dist/main.js`, so a module no longer sits two levels under the
   package (`dist/update/npm.js`). The package folder is the nearest folder up whose package.json is talos-code. */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {packageRootOf} from '../../src/update/npm.ts';
import {findPackageRoot} from '../../src/runtime/package-root.ts';

function tree(t:any){
  const base=mkdtempSync(join(tmpdir(),'talos-package-root-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const pkg=join(base,'node_modules','talos-code');
  for(const dir of [join(pkg,'dist','update'),join(pkg,'node_modules','ink','build')])mkdirSync(dir,{recursive:true});
  writeFileSync(join(pkg,'package.json'),JSON.stringify({name:'talos-code',version:'9.9.9'}));
  writeFileSync(join(pkg,'node_modules','ink','package.json'),JSON.stringify({name:'ink'}));
  writeFileSync(join(base,'package.json'),JSON.stringify({name:'someone-else'}));
  return{base,pkg,url:(...parts:string[])=>pathToFileURL(join(pkg,...parts)).href};
}

test('the package folder from the bundle (dist/main.js), from a module two levels down, and from a chunk',t=>{
  const {pkg,url}=tree(t);
  assert.equal(findPackageRoot(url('dist','main.js')),pkg);
  assert.equal(findPackageRoot(url('dist','update','npm.js')),pkg);
  assert.equal(findPackageRoot(url('dist','chunk-ABC.js')),pkg);
});

test('another package.json on the way up is not ours: a dependency inside, a project outside',t=>{
  const {pkg,base,url}=tree(t);
  assert.equal(findPackageRoot(url('node_modules','ink','build','index.js')),pkg,'ink\'s own package.json is skipped');
  assert.equal(findPackageRoot(pathToFileURL(join(base,'other','x.js')).href),null,'a folder outside talos-code has no package root');
});

test('update/npm.ts: packageRootOf finds the package from the bundle, so an npm install is still recognised',t=>{
  const {pkg,url}=tree(t);
  assert.equal(packageRootOf(url('dist','main.js')).replace(/[\\/]+$/u,''),pkg);
});
