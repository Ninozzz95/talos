import test from 'node:test';
import assert from 'node:assert/strict';
import { modalTabTarget } from '../../src/design-system/overlays/manager.ts';
for (const backward of [false,true]) test(`MODAL: no focusable targets (${backward})`,()=>assert.equal(modalTabTarget([],null,backward),null));
test('MODAL: forward Tab wraps only at the last control',()=>{
 assert.equal(modalTabTarget(['a','b','c'],'a',false),null);
 assert.equal(modalTabTarget(['a','b','c'],'b',false),null);
 assert.equal(modalTabTarget(['a','b','c'],'c',false),'a');
});
test('MODAL: backwards Tab wraps only at the first control',()=>{
 assert.equal(modalTabTarget(['a','b','c'],'a',true),'c');
 assert.equal(modalTabTarget(['a','b','c'],'b',true),null);
});
test('MODAL: a title or removed trigger enters the sequence in the requested direction',()=>{
 assert.equal(modalTabTarget(['a','b'],null,false),'a');
 assert.equal(modalTabTarget(['a','b'],'title',true),'b');
});
test('MODAL: a single control keeps both Tab directions inside',()=>{
 assert.equal(modalTabTarget(['a'],'a',false),'a'); assert.equal(modalTabTarget(['a'],'a',true),'a');
});
