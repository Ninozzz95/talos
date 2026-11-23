/* Stage 5 (owner decision 02/10): s11 tolerates ConPTY's late colour reset after a frame — and nothing else. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {CONPTY_TAIL_MS,assertIdleQuiet,withoutConptyTail} from './checks.ts';
import type {OutputCount} from './terminal.ts';

const quiet:OutputCount={ms:5000,bytes:0,chunks:0,bsu:0,esu:0,eraseDisplay:0,eraseScrollback:0,mouseEnables:[],mouseDisables:[],frameAt:[],focusEnables:0,focusDisables:0,progress:[],bells:0,sample:'',chunkAt:[]};
const seen=(data:string,at:number,extra:Partial<OutputCount>={}):OutputCount=>({...quiet,bytes:Buffer.byteLength(data),chunks:1,sample:JSON.stringify(data).slice(1,-1),chunkAt:[at],...extra});

test('the late ESC[m alone, early in the window, is ConPTY\'s tail',()=>{
  assert.equal(withoutConptyTail(seen('\u001b[m',3)).bytes,0);
  assert.doesNotThrow(()=>assertIdleQuiet(seen('\u001b[m',CONPTY_TAIL_MS),quiet));
});

test('anything else stays red: later, longer, another sequence, two chunks, a frame',()=>{
  assert.throws(()=>assertIdleQuiet(seen('\u001b[m',CONPTY_TAIL_MS+1),quiet),/R1-IDLE/u,'too late');
  assert.throws(()=>assertIdleQuiet(seen('\u001b[0m',3),quiet),/R1-IDLE/u,'another sequence');
  assert.throws(()=>assertIdleQuiet(seen('\u001b[mX',3),quiet),/R1-IDLE/u,'more than the tail');
  assert.throws(()=>assertIdleQuiet({...seen('\u001b[m',3),chunks:2,bytes:6,chunkAt:[3,40],sample:'\\u001b[m\\u001b[m'},quiet),/R1-IDLE/u,'twice');
  assert.throws(()=>assertIdleQuiet({...seen('\u001b[m',3),bsu:1,esu:1},quiet),/R1-IDLE/u,'a frame');
});
