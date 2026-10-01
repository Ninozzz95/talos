import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {ATTREZZI_OPENAI, esitoDellaLettura, leggiTestoLimitato, talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';
function fixture(t,bytes){const root=mkdtempSync(join(tmpdir(),'talos-read24-'));t.after(()=>rimuoviCartellaDiProva(root));writeFileSync(join(root,'data.bin'),bytes);return root;}

test('READ24-ROUNDTRIP: explicit hex preserves every byte, BOM, NUL and malformed UTF8 across pages',async t=>{
  const bytes=Buffer.concat([Buffer.from('efbbbffeff008280','hex'),Buffer.from(Array.from({length:12000},(_,i)=>i%256))]);
  const root=fixture(t,bytes);let offset=0;const parts=[];
  do{const p=await leggiTestoLimitato(root,'data.bin',{format:'hex',offset});assert.equal(p.format,'hex');assert.equal(p.testo.length,p.letti*2);parts.push(Buffer.from(p.testo,'hex'));offset=p.nextOffset;}while(offset!==null);
  assert.deepEqual(Buffer.concat(parts),bytes);assert.deepEqual(readFileSync(join(root,'data.bin')),bytes);
  const tail=await leggiTestoLimitato(root,'data.bin',{format:'hex',offset:3,limit:4});assert.equal(tail.testo,bytes.subarray(3,7).toString('hex'));
  const shown=esitoDellaLettura(tail,'data.bin');assert.match(shown,/HEX byte inspection/);assert.match(shown,/not text or media analysis/);assert.match(shown,/byte range \[3, 7\)/);
});

test('READ24-CAP: a seek reads only 4096+1 bytes, without a binary sample or decoding',async t=>{
  const root=fixture(t,Buffer.alloc(2*1024*1024,255));let bytesRead=0,opened=0,closed=0;const positions=[];
  const apriFn=async(...args)=>{const h=await open(...args);opened++;return{stat:()=>h.stat(),read:async(...args)=>{positions.push(args[3]);const r=await h.read(...args);bytesRead+=r.bytesRead;return r;},close:async()=>{closed++;await h.close();}};};
  const page=await leggiTestoLimitato(root,'data.bin',{format:'hex',offset:20000,apriFn});
  assert.equal(page.letti,4096);assert.equal(page.testo,'ff'.repeat(4096));assert.equal(page.nextOffset,24096);
  assert.ok(bytesRead<=4097);assert.equal(positions[0],20000);assert.deepEqual([opened,closed],[1,1]);
});

test('READ24-INVALID: unknown format and oversize hex ranges fail before opening',async()=>{
  let opened=0;const apriFn=async()=>{opened++;throw Error('must not open');};
  for(const format of [null,'binary','HEX',1,{},[]])await assert.rejects(leggiTestoLimitato('unused','unused',{format,apriFn}),{code:'READ_INVALID_FORMAT'});
  for(const limit of [0,3,4097,'4'])await assert.rejects(leggiTestoLimitato('unused','unused',{format:'hex',limit,apriFn}),{code:'READ_INVALID_RANGE'});
  assert.equal(opened,0);
});

test('READ24-TEXT-COMPAT: binary text is still refused and offers explicit inspection, never an automatic fallback',async t=>{
  const root=fixture(t,Buffer.from([0,255,0x82,65]));
  const r=await leggiTestoLimitato(root,'data.bin');assert.equal(r.binario,true);assert.equal(r.testo,null);
  const shown=esitoDellaLettura(r,'data.bin');assert.match(shown,/its content was not read/);assert.match(shown,/format:"hex"/);
  writeFileSync(join(root,'data.bin'),'\uFEFFordinary text');
  assert.equal(esitoDellaLettura(await leggiTestoLimitato(root,'data.bin',{format:'text'}),'data.bin'),'ordinary text');
});

test('READ24-STOP: Stop and read error close the handle before returning any hex page',async t=>{
  const root=fixture(t,Buffer.alloc(10000,0));const stop=new AbortController();let closed=0;
  const adapter=async(error)=>{const h=await open(join(root,'data.bin'));return{stat:()=>h.stat(),read:async(...args)=>{if(error)throw Object.assign(Error('io'),{code:'EIO'});const r=await h.read(...args);stop.abort();return r;},close:async()=>{closed++;await h.close();}};};
  await assert.rejects(leggiTestoLimitato(root,'data.bin',{format:'hex',segnale:stop.signal,apriFn:()=>adapter(false)}),{name:'AbortError'});
  await assert.rejects(leggiTestoLimitato(root,'data.bin',{format:'hex',apriFn:()=>adapter(true)}),{code:'EIO'});assert.equal(closed,2);
});

test('READ24-MUTATION: a new read reflects file changes and never pretends to be the previous snapshot',async t=>{
  const root=fixture(t,Buffer.from([1,2,3,4,5,6]));const first=await leggiTestoLimitato(root,'data.bin',{format:'hex',limit:4});
  writeFileSync(join(root,'data.bin'),Buffer.from([9,8,7,6,5]));const next=await leggiTestoLimitato(root,'data.bin',{format:'hex',offset:first.nextOffset,limit:4});
  assert.equal(next.testo,'05');assert.equal(next.byteSulDisco,5);assert.equal(next.nextOffset,null);
  assert.match(esitoDellaLettura(next,'data.bin'),/may change between reads/);
});

test('READ24-KERNEL: both prefetched and serial routes deliver only the requested byte inspection',async t=>{
  const schema=ATTREZZI_OPENAI.find(x=>x.function.name==='leggi').function.parameters;
  assert.deepEqual(schema.properties.format?.enum,['text','hex']);assert.equal(schema.required.includes('format'),false);
  const root=fixture(t,Buffer.from([0,255,0x82,65,66,67,68,69]));
  for(const serial of [false,true]){
    let turn=0;const sent=[];
    const tool_calls=[...(serial?[{id:'barrier',type:'function',function:{name:'unknown_read24',arguments:'{}'}}]:[]),
      {id:'bytes',type:'function',function:{name:'leggi',arguments:JSON.stringify({percorso:'data.bin',format:'hex',offset:1,limit:4})}},
      {id:'bytes-tail',type:'function',function:{name:'leggi',arguments:JSON.stringify({percorso:'data.bin',format:'hex',offset:4,limit:4})}}];
    const fetchDiRete=async(_url,opts)=>{sent.push(JSON.parse(opts.body));return{ok:true,status:200,json:async()=>({choices:[{message:turn++===0?{role:'assistant',content:null,tool_calls}:{role:'assistant',content:'done'}}],usage:{prompt_tokens:10,completion_tokens:5}})};};
    await talosLavora({cartella:root,task:{consegna:'inspect the requested bytes'},modello:'x',chiave:'fixture',fetchDiRete});
    for(const [id,hex,range] of [['bytes','ff824142','[1, 5)'],['bytes-tail','42434445','[4, 8)']]){
      const results=sent[1].messages.filter(x=>x.tool_call_id===id);
      assert.equal(results.length,1);assert.match(results[0].content,/HEX byte inspection/);
      assert.ok(results[0].content.includes(`byte range ${range}`));assert.ok(results[0].content.endsWith(`\n${hex}`));
    }
  }
});
