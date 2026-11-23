import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {createMouseFilter,installMouseFilter} from '../../src/tui/mouse.ts';
import {installFocusFilter} from '../../src/tui/focus.ts';
const E='\u001b';

test('REV-INPUT-UTF8 the actual mouse-then-focus chain preserves byte-fragmented multilingual input',()=>{
 const input=Buffer.from('caffè 中文 👩🏽‍💻'),chunks=Array.from(input,byte=>Buffer.from([byte]));
 const stdin=new EventEmitter() as any;stdin.read=()=>chunks.shift()??null;const original=stdin.read;
 const mouse=installMouseFilter(stdin,()=>{}),focus=installFocusFilter(stdin,()=>{});
 try{const output:Buffer[]=[];let chunk;while((chunk=stdin.read())!==null)output.push(chunk);assert.equal(Buffer.concat(output).toString(),input.toString());}
 finally{focus();mouse();assert.equal(stdin.read,original);}
});

test('REV-INPUT-PASTE mouse-shaped pasted bytes stay literal and never scroll',()=>{
 const text=`${E}[200~log ${E}[<64;2;3M and ${E}[O${E}[201~`;
 for(let split=1;split<text.length;split++){
  const wheel:number[]=[];const filter=createMouseFilter(delta=>wheel.push(delta));
  assert.equal(filter.take(text.slice(0,split))+filter.take(text.slice(split)),text,`split ${split}`);
  assert.deepEqual(wheel,[],`paste split ${split} never scrolls`);
  assert.equal(filter.take(`${E}[<65;2;3M`),'');assert.deepEqual(wheel,[1]);
 }
});

test('REV-INPUT-SPLIT every SGR report boundary is retained until the report is complete',()=>{
 const report=`${E}[<64;20;5M`;
 for(let split=2;split<report.length;split++){
  const wheel:number[]=[];const filter=createMouseFilter(delta=>wheel.push(delta));
  assert.equal(filter.take('a'+report.slice(0,split)),'a',`prefix ${split}`);
  assert.equal(filter.take(report.slice(split)+'b'),'b');assert.deepEqual(wheel,[-1]);
 }
 /* split=1 (the report's bare ESC alone in the first chunk) is the REV-ESC-PTY trade-off: the Esc
    passes through at once (never held) and the filter, armed, still takes the rest of the report
    out whole — the bytes never leak; only the Esc key itself may merge with the next key at
    Ink's parser (the same ambiguity every VT parser has for ESC-then-key). */
 const wheel:number[]=[];const filter=createMouseFilter(delta=>wheel.push(delta));
 assert.equal(filter.take('a'+report.slice(0,1)),'a'+E);
 assert.equal(filter.take(report.slice(1)+'b'),'b');assert.deepEqual(wheel,[-1]);
});

test('REV-INPUT-ESC isolated Esc traverses both filters and cleanup restores stdin',async()=>{
 const stdin=new EventEmitter() as any,chunks=[Buffer.from(E)];stdin.read=()=>chunks.shift()??null;const original=stdin.read;
 const mouse=installMouseFilter(stdin,()=>{}),focus=installFocusFilter(stdin,()=>{});
 try{
  const output:Buffer[]=[];const read=()=>{let chunk;while((chunk=stdin.read())!==null)if(chunk.length)output.push(chunk);};
  stdin.on('readable',read);read();await new Promise(resolve=>setTimeout(resolve,95));
  assert.equal(Buffer.concat(output).toString(),E);stdin.removeListener('readable',read);
 }finally{focus();mouse();assert.equal(stdin.read,original);}
});
