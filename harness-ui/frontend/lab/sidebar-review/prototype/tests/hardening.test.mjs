import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce, createStore } from '../src/inspector-state.mjs';
import { compileFileQuery, validateFileName, uniqueCopyName, virtualRange } from '../src/explorer-model.mjs';
for (const value of ['', '..', '.', '../a.js', 'CON.txt', 'a/b', 'a\\b', '__proto__', 'constructor', 'prototype', 'x'.repeat(241), 'a?.js', 'file.']) {
 test(`reject invalid name ${JSON.stringify(value.slice(0,30))}`, () => assert.equal(validateFileName(value, []).ok, false));
}
test('names preserve case, reject case-insensitive collision',()=>{
 assert.equal(validateFileName('Review.ts',['readme.md']).name,'Review.ts');
 assert.equal(validateFileName('README.md',['readme.md']).ok,false);
 assert.equal(validateFileName('readme.md',['readme.md'],'readme.md').ok,true);
});
test('copy names are deterministic and collision-safe',()=>assert.equal(uniqueCopyName('a.js',['copia-1-a.js','copia-2-a.js']),'copia-3-a.js'));
for (const q of ['/(a+)+$/','/a{10000000}/','/a.*.*b/','/[/']) test('unsafe/invalid regex reports an error: '+q,()=>assert.ok(compileFileQuery(q).error));
test('query limit',()=>assert.ok(compileFileQuery('x'.repeat(129)).error));
test('supported search modes',()=>{
 const file={id:'Index.CSS'},path='src/styles/Index.CSS',body='--talos-background:gray';
 for(const q of ['index','/^src\\/styles/','ext:css','~idxcss','testo:talos'])assert.ok(compileFileQuery(q).test(file,path,body),q);
});
test('virtual range conserves geometry and handles end scroll',()=>{
 for(const height of [32,36])for(const scroll of [0,100,25000,999999]){
  const r=virtualRange(1013,scroll,700,height);assert.ok(r.start>=0&&r.end<=1013);assert.equal(r.before+(r.end-r.start)*height+r.after,1013*height);assert.ok(r.end-r.start<=30);
 }
});
test('empty virtual range',()=>assert.deepEqual(virtualRange(0,200,700,36),{start:0,end:0,before:0,after:0}));
test('terminal review states cannot apply or discard again',()=>{
 for(const reviewStatus of ['applied','discarded']){const s={...initialState(),reviewStatus};assert.equal(reduce(s,{type:'APPLY'}),s);assert.equal(reduce(s,{type:'DISCARD'}),s);}
});
test('session state restores selection filters and detail section',()=>{
 let s={...initialState(),selectedFiles:['a.js'],selectedFile:'a.js',fileFilter:'favorites',detailSection:'events'};
 s=reduce(s,{type:'SESSION',id:'docs'});assert.deepEqual(s.selectedFiles,[]);assert.equal(s.fileFilter,'all');
 s=reduce(s,{type:'SESSION',id:'sidebar'});assert.deepEqual(s.selectedFiles,['a.js']);assert.equal(s.fileFilter,'favorites');assert.equal(s.detailSection,'events');
});
test('same session is a no-op',()=>{const s=initialState();assert.equal(reduce(s,{type:'SESSION',id:'sidebar'}),s);});
test('unknown action does not notify subscribers',()=>{let count=0;const s=createStore();s.subscribe(()=>count++);s.dispatch({type:'UNKNOWN'});assert.equal(count,0);});
