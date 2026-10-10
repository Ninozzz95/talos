/*
 * READ22 (Codex, 30/09/2026) ADATTATA a LEGGI IBRIDA (owner, 30/09 sera: «Tutte e due»). READ22 aveva offset/limit in BYTE;
 * ora `offset`/`limit` sono RIGHE e i byte vivono in `byteOffset` (dentro una riga troppo lunga). Ogni garanzia di READ22 resta,
 * spostata sulla modalità che adesso la porta:
 *   · ricostruzione integrale di una riga enorme, confini UTF-8 e BOM interno  → byteOffset;
 *   · rifiuto prima di aprire, campione binario non scavalcabile, un solo handle, Stop ed EIO chiudono → righe e byteOffset;
 *   · UTF-8 rigoroso sulle pagine a byte, lettura normale lossy come readFile → byteOffset / righe;
 *   · offset oltre la fine non è un file vuoto riuscito → righe e byteOffset;
 *   · i due percorsi del kernel (lettura anticipata e in serie) rispettano davvero gli argomenti.
 * Il resto del contratto nuovo è in tests/rev-read-lines.test.mjs.
 */
import assert from 'node:assert/strict';
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {ATTREZZI_OPENAI, BYTE_CAMPIONE_BINARIO, MAX_BYTE_LEGGI, esitoDellaLettura, leggiTestoLimitato, talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function fixture(t, bytes) {
  const root=mkdtempSync(join(tmpdir(),'talos-read22-'));
  t.after(()=>rimuoviCartellaDiProva(root));
  writeFileSync(join(root,'file.txt'),bytes);
  return root;
}
function meter({afterRead, size, failAt}={}) {
  const stats={open:0,close:0,bytes:0,positions:[]};
  return {stats,apriFn:async(path,flags)=>{
    const h=await open(path,flags);stats.open++;
    return {stat:async()=>size===undefined?h.stat():{size},read:async(...args)=>{
      if(stats.positions.length===failAt)throw Object.assign(new Error('read failure'),{code:'EIO'});
      stats.positions.push(args[3]);const r=await h.read(...args);stats.bytes+=r.bytesRead;afterRead?.(stats);return r;
    },close:async()=>{stats.close++;await h.close();}};
  }};
}

test('READ22-ROUNDTRIP: a single line far beyond one page is recovered byte for byte through byteOffset',async t=>{
  const riga='€🦋'.repeat(90_000)+'no-newline-'.repeat(10_000);
  const root=fixture(t,'﻿'+riga);
  const prima=await leggiTestoLimitato(root,'file.txt');
  const marcatore=/\[… line 1 continues: \d+ more bytes; continue inside it with leggi byteOffset=(\d+)\]$/u.exec(prima.testo);
  assert.ok(marcatore,'the first page ends the long line with its byteOffset');
  let text=prima.testo.slice(0,marcatore.index),byteOffset=Number(marcatore[1]),calls=0;
  while(byteOffset!==null){
    const page=await leggiTestoLimitato(root,'file.txt',{byteOffset});
    assert.equal(page.offset,byteOffset);assert.ok(page.endOffset-page.offset<=MAX_BYTE_LEGGI);
    assert.ok(page.nextByteOffset===null||page.nextByteOffset>byteOffset,'continuation makes progress');
    assert.doesNotMatch(page.testo,/�/);text+=page.testo;byteOffset=page.nextByteOffset;
    assert.ok(++calls<100,'bounded number of pages; no repeating first page');
  }
  assert.equal(text,riga);assert.ok(calls>2);
});

test('READ22-BOUNDARY: a byte page never splits a character and preserves an internal BOM',async t=>{
  const root=fixture(t,'ab€🦋﻿z');
  const first=await leggiTestoLimitato(root,'file.txt',{byteOffset:0,tetto:4});
  assert.equal(first.testo,'ab');assert.equal(first.nextByteOffset,2);
  const second=await leggiTestoLimitato(root,'file.txt',{byteOffset:first.nextByteOffset,tetto:4});
  assert.equal(second.testo,'€');assert.equal(second.nextByteOffset,5);
  let offset=second.nextByteOffset,rest='';
  while(offset!==null){const p=await leggiTestoLimitato(root,'file.txt',{byteOffset:offset,tetto:4});rest+=p.testo;offset=p.nextByteOffset;}
  assert.equal(rest,'🦋﻿z','the internal BOM is text, not a file-start BOM');
});

test('READ22-INVALID: malformed offset/limit/byteOffset are rejected before opening a file',async()=>{
  let opened=0;
  const apriFn=async()=>{opened++;throw Error('must not open');};
  for(const args of [{offset:null},{offset:-1},{offset:0.5},{offset:'0'},{offset:Infinity},{limit:0},{limit:'4'},{limit:NaN},
    /* F-026 (owner 02/10/2026): con byteOffset `limit` sono byte, 4..102400 — fuori da lì si rifiuta come prima */
    {byteOffset:-1},{byteOffset:'3'},{byteOffset:4,offset:1}, /* C1 09/10: byteOffset 0 con offset vale assente (F026-ZERO-ASSENTE) */{byteOffset:0,limit:3},{byteOffset:0,limit:102401},{format:'hex',limit:3},{format:'hex',limit:4097},{format:'hex',byteOffset:0}]){
    await assert.rejects(leggiTestoLimitato('unused','unused',{...args,apriFn}),(e)=>e.code==='READ_INVALID_RANGE',JSON.stringify(args));
  }
  assert.equal(opened,0);
});

test('READ22-BINARY: neither a line jump nor a byteOffset bypasses the initial binary sample',async t=>{
  const root=fixture(t,Buffer.concat([Buffer.from([0,1,2]),Buffer.alloc(20000,65)]));
  for(const args of [{offset:3,limit:5},{byteOffset:10000}]){
    const m=meter();const r=await leggiTestoLimitato(root,'file.txt',{...args,apriFn:m.apriFn});
    assert.equal(r.binario,true);assert.equal(r.testo,null);
    assert.equal(m.stats.positions[0],0);assert.ok(m.stats.bytes<=BYTE_CAMPIONE_BINARIO);assert.equal(m.stats.close,1);
    assert.doesNotMatch(esitoDellaLettura(r,'file.txt'),/AAAA/);
  }
});

test('READ22-HANDLE: a byte page uses one handle, a bounded read and the stat taken at open',async t=>{
  const root=fixture(t,'A'.repeat(20000));const m=meter({size:12000});
  const r=await leggiTestoLimitato(root,'file.txt',{byteOffset:10000,tetto:1000,apriFn:m.apriFn});
  assert.equal(r.testo,'A'.repeat(1000));assert.equal(r.byteSulDisco,12000);assert.equal(r.nextByteOffset,11000);
  assert.deepEqual([m.stats.open,m.stats.close],[1,1]);
  /* F-026 (owner 02/10/2026, «dice quanti byte restano in quella riga»): dopo la pagina si cerca dove finisce la riga, a
     blocchi da 64 KB fermandosi all'a capo — qui il resto del file, 9.000 byte. Il limite resta finito: un blocco in più. */
  assert.ok(m.stats.bytes<=BYTE_CAMPIONE_BINARIO+10000+1001+64*1024,'sample, newline count before the offset, the page, then the scan to the end of the line');
  assert.equal(r.restanoNellaRiga,9000);
  assert.ok(m.stats.positions.includes(10000));
});

test('READ22-STOP-ERROR: abort during the initial sample and EIO after it close the handle',async t=>{
  const root=fixture(t,'a'.repeat(30000));
  for(const args of [{byteOffset:10000},{offset:2}]){
    const controller=new AbortController();
    const m=meter({afterRead:()=>controller.abort()});
    await assert.rejects(leggiTestoLimitato(root,'file.txt',{...args,apriFn:m.apriFn,segnale:controller.signal}),{name:'AbortError'});
    assert.equal(m.stats.close,1);assert.deepEqual(m.stats.positions,[0]);
    const broken=meter({failAt:1});
    await assert.rejects(leggiTestoLimitato(root,'file.txt',{...args,apriFn:broken.apriFn}),{code:'EIO'});
    assert.equal(broken.stats.close,1);
  }
});

test('READ22-UTF8-ERROR: byte pages refuse malformed UTF8; the normal line read stays lossy like readFile',async t=>{
  const bytes=Buffer.from([97,255,98,0xe2,0x82,99]);const root=fixture(t,bytes);
  await assert.rejects(leggiTestoLimitato(root,'file.txt',{byteOffset:0}),{code:'READ_INVALID_UTF8'});
  assert.equal((await leggiTestoLimitato(root,'file.txt')).testo,bytes.toString('utf8'));
  const rotto=fixture(t,'a€b');
  await assert.rejects(leggiTestoLimitato(rotto,'file.txt',{byteOffset:2}),{code:'READ_INVALID_UTF8'},'an offset inside a character is refused, never lossy');
});

test('READ22-EOF-LINE: offsets beyond the end are errors, never a successful empty file',async t=>{
  const root=fixture(t,'uno\ndue\ntre\n');
  await assert.rejects(leggiTestoLimitato(root,'file.txt',{offset:9,limit:2}),{code:'READ_OFFSET_OUT_OF_RANGE'});
  await assert.rejects(leggiTestoLimitato(root,'file.txt',{byteOffset:100}),{code:'READ_OFFSET_OUT_OF_RANGE'});
  const ultima=esitoDellaLettura(await leggiTestoLimitato(root,'file.txt',{offset:3,limit:5}),'file.txt');
  assert.match(ultima,/lines 3-3 of 3/);assert.match(ultima,/EOF reached/);assert.ok(ultima.endsWith('\ntre\n'));
  const fine=esitoDellaLettura(await leggiTestoLimitato(root,'file.txt',{byteOffset:8}),'file.txt');
  assert.match(fine,/inside line 3/);assert.match(fine,/line ends here; EOF reached|line ends here; next line/);
});

test('READ22-KERNEL: schema and both prefetched/serial dispatch honor lines and byteOffset',async t=>{
  const schema=ATTREZZI_OPENAI.find(t=>t.function.name==='leggi').function.parameters;
  assert.equal(schema.properties.offset.type,'integer');assert.equal(schema.properties.byteOffset.type,'integer');
  const root=fixture(t,'riga1\nriga2\nriga3\nriga4\n'+'L'.repeat(3000)+'\nfine\n');
  for(const serial of [false,true]) {
    const messages=[];let turns=0;
    const call=(id,argomenti)=>({id,type:'function',function:{name:'leggi',arguments:JSON.stringify({percorso:'file.txt',...argomenti})}});
    const tool_calls=[...(serial?[{id:'barrier',type:'function',function:{name:'unknown_read22',arguments:'{}'}}]:[]),call('one',{offset:2,limit:2}),call('two',{byteOffset:24+2000})];
    const fetchDiRete=async(_url,opts)=>{messages.push(JSON.parse(opts.body));return{ok:true,status:200,json:async()=>({choices:[{message:turns++===0?{role:'assistant',content:null,tool_calls}:{role:'assistant',content:'done'}}],usage:{prompt_tokens:10,completion_tokens:5}})};};
    await talosLavora({cartella:root,task:{consegna:'read exact file parts'},modello:'x',chiave:'fixture',fetchDiRete});
    const outs=messages[1].messages.filter(m=>m.role==='tool');
    const uno=togliConfiniDati(outs.find(m=>m.tool_call_id==='one').content),due=togliConfiniDati(outs.find(m=>m.tool_call_id==='two').content);
    assert.match(uno,/lines 2-3 of 6/);assert.ok(uno.endsWith('\nriga2\nriga3\n'),uno);
    assert.match(due,/inside line 5/);assert.ok(due.endsWith('\n'+'L'.repeat(1000)),due.slice(0,200));
  }
});
