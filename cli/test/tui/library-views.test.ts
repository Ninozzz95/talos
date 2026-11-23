/*
 * Stage 7.23 (mockup library «2.4 MB · PDF · …»; owner 03/10): the library's files as /library shows them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fileKind,libraryRows} from '../../src/tui/library-views.ts';
import type {LibraryPreview,LibraryView} from '../../src/services/library-facade.ts';

const view=(over:Partial<LibraryView>):LibraryView=>({id:'x',name:'x.txt',mediaType:'text/plain',fileType:'document',origin:'uploaded',creator:{type:'persona',model:null,provider:null},session:null,createdAt:null,updatedAt:null,context:{token:null,mode:'explicit-visible-reference',autoAttach:false,autoSubmit:false,persistence:'composer-only-until-send'},...over});
const preview=(over:Partial<LibraryPreview>):LibraryPreview=>({id:'x',name:'x',mediaType:'text/plain',size:0,mode:'text',text:'',truncated:false,reason:null,...over});

test('size, kind and lines; made by TALOS; the first lines, an ellipsis when there are more',()=>{
  const rows=libraryRows([
    view({id:'a',name:'checkout-flows.md',mediaType:'text/markdown'}),
    view({id:'b',name:'design-tokens.json',mediaType:'application/json',origin:'generated'}),
    view({id:'c',name:'shot.png',mediaType:'image/png',fileType:'image'}),
    view({id:'d',name:'big.log',mediaType:'text/plain'}),
  ],new Map([
    ['a',preview({size:6*1024,text:'## Guest checkout\n1. Cart\n2. Address\n3. Pay\n4. Done\n'})],
    ['b',preview({size:14*1024,text:'{\n  "a": 1\n}\n'})],
    ['c',preview({size:2.4*1024*1024,mode:'metadata',text:null,reason:'image'})],
    ['d',null],
  ]));
  assert.deepEqual(rows.map(row=>[row.name,row.meta,row.desc]),[
    ['checkout-flows.md','6 KB','Markdown · 5 lines'],['design-tokens.json','14 KB','JSON · 3 lines · made by TALOS'],['shot.png','2.4 MB','PNG · image'],['big.log','','LOG']]);
  assert.deepEqual(rows[0]!.preview,['## Guest checkout','1. Cart','2. Address','3. Pay','…']);
  assert.deepEqual(rows[1]!.preview,['{','  "a": 1','}']);
  assert.deepEqual(rows[2]!.preview,['(no preview for this kind of file)']);
  assert.equal(fileKind('README','text/plain'),'PLAIN');
});

test('FE-048: a file not read yet says it is loading; one with no text says it has no preview',()=>{
  const row={id:'a',name:'a.png',mediaType:'image/png',fileType:'image',origin:'uploaded'} as any;
  assert.deepEqual(libraryRows([row],new Map())[0]!.preview,['Loading preview']);
  assert.deepEqual(libraryRows([row],new Map([['a',null]]))[0]!.preview,['(no preview for this kind of file)']);
});
