import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {esitoDellaLettura, leggiTestoLimitato, talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function fixture(t, content='') {
  const root=mkdtempSync(join(tmpdir(),'talos-read29-'));
  t.after(()=>rimuoviCartellaDiProva(root));
  writeFileSync(join(root,'empty.txt'),content);
  return root;
}
function verifyEmpty(message) {
  assert.match(message,/0 bytes.*at open|at open.*0 bytes/);
  assert.match(message,/EOF/);
  assert.match(message,/may change/);
  assert.doesNotMatch(message,/error:|REFUSED|not found|ENOENT/i);
}

test('READ29-EMPTY: a real zero-byte file has an explicit successful read outcome',async t=>{
  const root=fixture(t),file=join(root,'empty.txt');
  const read=await leggiTestoLimitato(root,'empty.txt');
  assert.equal(read.letti,0);assert.equal(read.byteSulDisco,0);assert.equal(read.troncato,false);
  verifyEmpty(esitoDellaLettura(read,'empty.txt'));
  assert.equal(readFileSync(file).length,0);
});

for(const serial of [false,true])test(`READ29-KERNEL-${serial?'SERIAL':'PREFETCH'}: the model receives a visible outcome and no error`,async t=>{
  const root=fixture(t),requests=[],events=[];let turn=0;
  const tool={id:'read29',type:'function',function:{name:'leggi',arguments:JSON.stringify({percorso:'empty.txt'})}};
  const tool_calls=[...(serial?[{id:'barrier',type:'function',function:{name:'unknown_read29',arguments:'{}'}}]:[]),tool];
  const fetchDiRete=async(_url,options)=>{
    requests.push(JSON.parse(options.body));
    return {ok:true,status:200,json:async()=>({choices:[{message:turn++===0?{role:'assistant',content:null,tool_calls}:{role:'assistant',content:'done'}}],usage:{prompt_tokens:10,completion_tokens:5}})};
  };
  await talosLavora({cartella:root,task:{consegna:'Read the empty file'},modello:'read29-fixture',chiave:'fixture',fetchDiRete,onGiro:e=>events.push(e)});
  const result=requests[1].messages.find(m=>m.role==='tool'&&m.tool_call_id==='read29');
  assert.ok(result);verifyEmpty(result.content);
  const event=events.find(e=>e.tipo==='tool-esito'&&e.toolCallId==='read29');
  assert.ok(event);assert.notEqual(event.isError,true);
  assert.equal(readFileSync(join(root,'empty.txt')).length,0);
});

test('READ29-NONEMPTY: ordinary content and BOM decoding remain byte-for-byte unchanged',async t=>{
  for(const content of ['testo €🦋\n','\uFEFFtesto']){
    const root=fixture(t,content),read=await leggiTestoLimitato(root,'empty.txt');
    assert.equal(esitoDellaLettura(read,'empty.txt'),content.replace(/^\uFEFF/,''));
    assert.equal(readFileSync(join(root,'empty.txt')).toString('utf8'),content);
  }
});

test('READ29-GROW: zero size at open cannot hide bytes actually read',async t=>{
  for(const content of ['grew','\uFEFF']){
    const root=fixture(t,content);
    const apriFn=async(...args)=>{const h=await open(...args);return {stat:async()=>({size:0}),read:(...a)=>h.read(...a),close:()=>h.close()};};
    const read=await leggiTestoLimitato(root,'empty.txt',{apriFn});
    assert.equal(read.byteSulDisco,0);assert.equal(read.letti,Buffer.byteLength(content));
    assert.equal(esitoDellaLettura(read,'empty.txt'),content.replace(/^\uFEFF/,''));
  }
});

test('READ29-SHRINK: EOF after a nonzero stat must not claim a zero-byte file',async t=>{
  const root=fixture(t);
  const apriFn=async(...args)=>{const h=await open(...args);return {stat:async()=>({size:5}),read:(...a)=>h.read(...a),close:()=>h.close()};};
  const read=await leggiTestoLimitato(root,'empty.txt',{apriFn});
  assert.equal(read.byteSulDisco,5);assert.equal(read.letti,0);
  assert.equal(esitoDellaLettura(read,'empty.txt'),'');
});

/* LEGGI IBRIDA (owner 30/09): in testo offset/limit sono RIGHE, quindi una pagina esplicita di un file vuoto dà l'esito
   esplicito del file vuoto; l'intestazione a byte resta dell'esadecimale, invariata. */
test('READ29-EOFHEX: explicit line pages of an empty file stay explicit; hex keeps its byte header',async t=>{
  const root=fixture(t);
  verifyEmpty(esitoDellaLettura(await leggiTestoLimitato(root,'empty.txt',{offset:1,limit:4}),'empty.txt'));
  const hex=esitoDellaLettura(await leggiTestoLimitato(root,'empty.txt',{format:'hex',offset:0,limit:4}),'empty.txt');
  assert.match(hex,/byte range \[0, 0\)/);assert.match(hex,/EOF was reached/);assert.match(hex,/HEX byte inspection/);
});

test('READ29-ERROR: nonexistent files, read failures and Stop remain errors',async t=>{
  const root=fixture(t);
  await assert.rejects(leggiTestoLimitato(root,'missing.txt'),{code:'ENOENT'});
  let closed=0;
  const apriFn=async()=>({stat:async()=>({size:0}),read:async()=>{throw Object.assign(Error('read failure'),{code:'EIO'});},close:async()=>{closed++;}});
  await assert.rejects(leggiTestoLimitato(root,'empty.txt',{apriFn}),{code:'EIO'});assert.equal(closed,1);
  const controller=new AbortController();controller.abort();
  await assert.rejects(leggiTestoLimitato(root,'empty.txt',{segnale:controller.signal}),{name:'AbortError'});
});
