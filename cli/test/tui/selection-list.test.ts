import assert from 'node:assert/strict';
import test from 'node:test';
import {filterItems,moveSelection} from '../../src/tui/selection-list.ts';

test('fuzzy filter keeps provider grouping and navigates more than 100 models',()=>{
  const items=Array.from({length:140},(_,i)=>({id:`openai:m${i}`,label:`Model ${i}`,searchText:`openai model ${i}`,group:'openai',value:i}));
  assert.equal(filterItems(items,'opn mdl 139')[0]?.id,'openai:m139');
  let s={query:'',selected:0,pageSize:10};
  s=moveSelection(s,items.length,'end');
  assert.equal(s.selected,139);
  s=moveSelection(s,items.length,'page-up');
  assert.equal(s.selected,129);
});

test('prefix beats substring and ordered subsequence without truncating results',()=>{
  const items=[
    {id:'a',label:'Alpha',searchText:'alpha provider',value:1},
    {id:'b',label:'Beta',searchText:'x alpha provider',value:2},
    {id:'c',label:'Gamma',searchText:'a-l-p-h-a provider',value:3},
  ];
  assert.deepEqual(filterItems(items,'alpha').map(x=>x.id),['a','b','c']);
  assert.equal(filterItems(Array.from({length:150},(_,i)=>({id:String(i),label:String(i),searchText:'same',value:i})),'').length,150);
});
