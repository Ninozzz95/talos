/** Independent CLI integration review of the supplied kernel; real Node handles, no model credentials. */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,open,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {leggiTestoLimitato,esitoDellaLettura,MAX_BYTE_LEGGI,RIGHE_PER_PAGINA_LEGGI} from '../../../harness-ui/src/kernel/talosHarness.mjs';
import {LEGGI_HEADER} from '../../src/runtime/output-store.ts';
/* G02: the unified kernel reads LINES (owner decision D1, 30/09: 2000 lines or 100 KB per page, over-long lines cut at 2000
   characters, `byteOffset` to continue inside one, binary judged on the first 8000 bytes). These reviews keep their intent
   — exact ceilings, short reads, a late NUL never reaching the model — on that contract. */

async function fixture(t:any){
 const dir=await mkdtemp(join(tmpdir(),'talos-cli-read-review-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));return dir;
}
test('REV-READ-CLI-EOF: exact ceilings (lines and bytes) are complete; one more line is explicitly incomplete',async t=>{
 const dir=await fixture(t);
 for(const extra of [0,1]){
  const lines='x\n'.repeat(RIGHE_PER_PAGINA_LEGGI+extra);
  await writeFile(join(dir,'a.txt'),lines);
  const r=await leggiTestoLimitato(dir,'a.txt');const text=esitoDellaLettura(r,'a.txt');
  assert.equal(r.troncato,extra===1);assert.equal(r.nextOffset,extra===1?RIGHE_PER_PAGINA_LEGGI+1:null);
  assert.equal(r.testo,'x\n'.repeat(RIGHE_PER_PAGINA_LEGGI));
  if(extra)assert.ok(text.startsWith(`[TALOS read lines 1-${RIGHE_PER_PAGINA_LEGGI} of ${RIGHE_PER_PAGINA_LEGGI+1} in "a.txt"; continue with leggi offset=${RIGHE_PER_PAGINA_LEGGI+1}`),text.slice(0,160));
  else assert.equal(text,lines,'a complete read is the clean text, no header');
  const line=`${'y'.repeat(99)}\n`;const count=MAX_BYTE_LEGGI/Buffer.byteLength(line);
  await writeFile(join(dir,'b.txt'),line.repeat(count+extra));
  const b=await leggiTestoLimitato(dir,'b.txt');const bText=esitoDellaLettura(b,'b.txt');
  assert.equal(b.troncato,extra===1);assert.equal(Buffer.byteLength(b.testo),MAX_BYTE_LEGGI,'the page holds exactly the ceiling');
  assert.equal(bText.includes('page capped at 100 KB'),extra===1,bText.slice(0,200));
 }
});
test('REV-READ-CLI-SHORT: partial reads preserve Unicode and find NUL at the end of the sample',async t=>{
 const dir=await fixture(t);let bytes=0;let closes=0;
 const apriFn=async(path:string,flags:string)=>{
  const h=await open(path,flags);
  return {stat:()=>h.stat(),close:async()=>{closes++;await h.close();},read:async(b:Buffer,o:number,n:number,p:number)=>{
   const result=await h.read(b,o,Math.min(n,127),p);bytes+=result.bytesRead;return result;
  }};
 };
 /* lines of multi-byte characters, a BOM inside each (only a BOM at byte 0 is dropped, T-01), cut by 127-byte reads */
 const text='é🌍漢字\uFEFF\n'.repeat(1700);
 await writeFile(join(dir,'a.txt'),text);
 assert.equal((await leggiTestoLimitato(dir,'a.txt',{apriFn})).testo,text);
 assert.equal(bytes,Buffer.byteLength(text));assert.equal(closes,1);
 bytes=0;await writeFile(join(dir,'a.txt'),Buffer.concat([Buffer.alloc(7999,65),Buffer.alloc(20000)]));
 const binary=await leggiTestoLimitato(dir,'a.txt',{apriFn});
 assert.equal(binary.binario,true);assert.equal(binary.testo,null);assert.equal(bytes,8000);assert.equal(closes,2);
});
test('REV-READ-CLI-STAT: stat failure closes the successfully opened handle',async t=>{
 const dir=await fixture(t);await writeFile(join(dir,'a.txt'),'ok');let closed=0;
 const apriFn=async(path:string,flags:string)=>{const h=await open(path,flags);return{
  stat:async()=>{throw Object.assign(new Error('stat failed'),{code:'EIO'});},
  close:async()=>{closed++;await h.close();},read:h.read.bind(h),
 };};
 await assert.rejects(leggiTestoLimitato(dir,'a.txt',{apriFn}),{code:'EIO'});assert.equal(closed,1);
});
test('REV-READ-CLI-PRESTOP: a cancelled read never opens the file',async()=>{
 let opened=0;const controller=new AbortController();controller.abort();
 await assert.rejects(leggiTestoLimitato(tmpdir(),'unused',{segnale:controller.signal,apriFn:async()=>{opened++;throw new Error('opened');}}),{name:'AbortError'});
 assert.equal(opened,0);
});
test('REV-READ-CLI-LATE-NUL: NUL after the sample is still never returned to the model',async t=>{
 const dir=await fixture(t);
 /* on a later line of the page: the page is refused as binary, with the size on disk */
 await writeFile(join(dir,'a.dat'),Buffer.concat([Buffer.alloc(8500,65),Buffer.from('\nxx'),Buffer.from([0]),Buffer.from('yy\n')]));
 const result=esitoDellaLettura(await leggiTestoLimitato(dir,'a.dat'),'a.dat');
 assert.match(result,/8507 bytes on disk/u);assert.doesNotMatch(result,/\u0000|\uFFFD|AAAA/u);
 /* inside one over-long line: the page shows the text before it, and reading on inside the line refuses instead of
    returning the bytes (strict decoder, READ22) */
 await writeFile(join(dir,'b.dat'),Buffer.concat([Buffer.alloc(9000,65),Buffer.from([0,255])]));
 const page=esitoDellaLettura(await leggiTestoLimitato(dir,'b.dat'),'b.dat');
 assert.doesNotMatch(page,/\u0000|\uFFFD/u);
 const next=Number(/byteOffset=(\d+)/u.exec(page)?.[1]);assert.ok(Number.isSafeInteger(next),page.slice(0,200));
 await assert.rejects(leggiTestoLimitato(dir,'b.dat',{byteOffset:next}),{message:/READ_INVALID_UTF8/u});
});
test('G02: the CLI reads the line total from the kernel\'s own leggi header (LEGGI_HEADER, the read row)',async t=>{
 const dir=await fixture(t);
 await writeFile(join(dir,'big.txt'),Array.from({length:3000},(_,i)=>`line ${i+1}`).join('\n')+'\n');
 const text=esitoDellaLettura(await leggiTestoLimitato(dir,'big.txt'),'big.txt');
 assert.equal(LEGGI_HEADER.exec(text)?.groups?.total,'3000',text.slice(0,160));
});
