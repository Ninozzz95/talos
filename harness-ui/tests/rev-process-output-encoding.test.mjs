/*
 * OEM36 (ledger Codex `Downloads/handoff-talos-2026-09-27/LEDGER-OEM36-2026-09-30.md`, owner 30/09 sera: «sì» a
 * iconv-lite@0.7.3), tappa 1: la LETTURA dell'output conservato con una codifica scelta ESPLICITAMENTE da chi chiama.
 * I programmi Windows scrivono spesso nella code page OEM (cp850 in Italia): i byte restano quelli originali nel deposito,
 * e questa pagina li può interpretare su richiesta, mai indovinando la codifica.
 * ⛔ I byte attesi NON sono una tabella scritta a mano: li ha prodotti .NET (`System.Text.Encoding.GetEncoding`) il
 *   30/09/2026 con `scratchpad/oracolo-codepage.ps1`; accanto c'è lo stesso testo in UTF-8.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {readProcessOutputPage,formatProcessOutputPage} from '../src/process-output-access.mjs';
import {PROCESS_OUTPUT_ENCODINGS} from '../src/process-output-encoding.mjs';
import {ATTREZZI_ESTESI_OPENAI,ATTREZZI_OPENAI} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

async function fixture(t,stdout){
  const root=mkdtempSync(join(tmpdir(),'talos-oem36-'));
  const store=await createProcessOutputStore({databasePath:join(root,'output.sqlite'),maxOutputBytes:1_000_000});
  t.after(async()=>{await store.close();rimuoviCartellaDiProva(root);});
  const id={sessionId:'s36',outputId:randomUUID(),runId:'r36',toolCallId:'t36'};
  await store.begin(id);
  await store.append({...id,stream:'stdout',sequence:0,bytes:stdout});
  await store.finish({...id,sequence:1,termination:'exited',exitCode:0});
  return{store,id:{sessionId:id.sessionId,outputId:id.outputId}};
}
const ORACOLO=[
  ['cp437','4574853a20706997208720a4','4574c3a03a207069c3b920c3a720c3b1'],
  ['cp850','4574853a20706997208a2099','4574c3a03a207069c3b920c3a820c396'],
  ['cp852','5072a16c69e720a76c759c6f759f6bec','5072c3ad6c69c5a120c5be6c75c5a56f75c48d6bc3bd'],
  ['cp866','8fe0a8a2a5e2203432','d09fd180d0b8d0b2d0b5d182203432'],
  ['windows-1251','cff0e8e2e5f2203432','d09fd180d0b8d0b2d0b5d182203432'],
  ['windows-1252','8020e0e820936f6b94','e282ac20c3a0c3a820e2809c6f6be2809d'],
];

test('OEM36-CODEPAGES: an explicit encoding recovers the text .NET wrote for each code page',async t=>{
  assert.deepEqual([...PROCESS_OUTPUT_ENCODINGS],['utf-8','cp437','cp850','cp852','cp866','windows-1251','windows-1252']);
  for(const [encoding,cpHex,utf8Hex] of ORACOLO){
    const f=await fixture(t,Buffer.from(cpHex,'hex'));
    const legacy=await readProcessOutputPage(f.store,f.id);
    assert.equal(legacy.text,null,`${encoding}: without an explicit encoding nothing is guessed`);
    const page=await readProcessOutputPage(f.store,{...f.id,encoding});
    assert.equal(page.text,Buffer.from(utf8Hex,'hex').toString('utf8'),encoding);
    assert.equal(page.encoding,encoding);assert.equal(page.requestedEncoding,encoding);assert.equal(page.encodingSource,'caller-selected');
    assert.equal(page.bytes,cpHex.length/2,'sizes stay raw bytes');
  }
});

test('OEM36-PAGES: single-byte pages accept any byte offset and count raw bytes',async t=>{
  const cp=Buffer.from('4574853a20706997208a2099','hex');
  const f=await fixture(t,cp);
  let offset=0,testo='';
  do{const p=await readProcessOutputPage(f.store,{...f.id,encoding:'cp850',offset,limit:5});assert.ok(p.bytes<=5);testo+=p.text;offset=p.nextOffset;}while(offset!==null);
  assert.equal(testo,Buffer.from('4574c3a03a207069c3b920c3a820c396','hex').toString('utf8'));
});

test('OEM36-DEFAULT: without encoding the page is identical to before and the note offers an explicit encoding',async t=>{
  const f=await fixture(t,Buffer.from('4574853a','hex'));
  const page=await readProcessOutputPage(f.store,f.id);
  assert.equal(page.encoding,'binary-or-invalid-utf8');assert.equal(page.text,null);
  assert.equal('requestedEncoding' in page,false);assert.equal('encodingSource' in page,false);
  const nota=formatProcessOutputPage(page);
  assert.match(nota,/binary or invalid UTF-8/);
  assert.match(nota,/encoding/);assert.match(nota,/cp850/);
  assert.doesNotMatch(nota,/rerun|re-run the command/i);
  const utf8=await fixture(t,Buffer.from('ciao è','utf8'));
  assert.deepEqual(await readProcessOutputPage(utf8.store,{...utf8.id,encoding:'utf-8'}).then(p=>[p.text,p.encoding]),['ciao è','utf-8']);
});

test('OEM36-NUL: an explicit code page never turns NUL bytes into fake text',async t=>{
  const f=await fixture(t,Buffer.from([0x41,0x00,0x42]));
  const page=await readProcessOutputPage(f.store,{...f.id,encoding:'cp850'});
  assert.equal(page.text,null);assert.equal(page.encoding,'binary-or-invalid-encoding');
});

test('OEM36-INVALID: unknown, null or raw-mixed encodings are refused before reading',async t=>{
  const f=await fixture(t,Buffer.from('x'));
  for(const args of [{encoding:'latin1'},{encoding:null},{encoding:850},{encoding:'CP850'},{encoding:'cp850',format:'raw'}]){
    await assert.rejects(readProcessOutputPage(f.store,{...f.id,...args}),e=>e.code==='OUTPUT_INVALID_INPUT',JSON.stringify(args));
  }
});

test('OEM36-KERNEL-SCHEMA: process_output offers the same allowlist as an optional enum',()=>{
  const tool=[...ATTREZZI_OPENAI,...ATTREZZI_ESTESI_OPENAI].map(a=>a.function??a).find(f=>f.name==='process_output');
  assert.ok(tool,'process_output must be offered');
  const p=(tool.parameters??tool.input_schema);
  assert.deepEqual(p.properties.encoding.enum,[...PROCESS_OUTPUT_ENCODINGS]);
  assert.equal((p.required??[]).includes('encoding'),false);
  assert.match(p.properties.encoding.description??tool.description,/explicit|known/i);
});

for(const [caso,argomenti,attesoLetto] of [['OK',{encoding:'cp850'},true],['REFUSED',{encoding:'latin1'},false]])test(`OEM36-KERNEL-DISPATCH-${caso}: the real kernel forwards a listed encoding and refuses an unlisted one before reading`,async()=>{
  const {talosLavora}=await import('../src/kernel/talosHarness.mjs');
  const {tmpdir}=await import('node:os');
  let calls=0,letti=[];const eventi=[];
  const outputId='15743007-0583-4e50-b99a-a77e33d97136';
  await talosLavora({cartella:tmpdir(),task:{consegna:'Leggi.'},modello:'fixture',chiave:'fixture',
    messaggiIniziali:[{role:'user',content:'Leggi.'}],strumentiEstesi:['process_output'],livelloAccesso:'lettura',
    _giriMassimiInterno:3,onGiro:e=>eventi.push(e),
    readProcessOutputFn:async args=>{letti.push(args);return 'PAGINA36';},
    fetchDiRete:async()=>{
      const message=calls++===0?{role:'assistant',content:'',tool_calls:[{id:'read36',type:'function',function:{name:'process_output',arguments:JSON.stringify({outputId,...argomenti})}}]}:{role:'assistant',content:'Letto.'};
      return Response.json({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]});
    },
  });
  const esito=eventi.find(e=>e.tipo==='tool-esito').content;
  if(attesoLetto){assert.equal(letti.length,1);assert.equal(letti[0].encoding,'cp850');assert.equal(esito,'PAGINA36');}
  else{assert.equal(letti.length,0,'an unlisted encoding never reaches the reader');assert.match(esito,/^OUTPUT_INVALID_INPUT: .*cp850/);}
});

// Revisione avversaria (Claude, 30/09 sera): un byte NON definito nella code page non diventa mai «�» inventato. In
// windows-1251 il byte 0x98 torna identico dall'andata e ritorno di iconv-lite (misurato): serve anche il controllo di U+FFFD.
test('OEM36-UNDEFINED: a byte undefined in the code page yields no text, never an invented replacement character',async t=>{
  for(const [encoding,byte] of [['windows-1252',[0x41,0x81,0x42]],['windows-1251',[0x41,0x98,0x42]]]){
    const f=await fixture(t,Buffer.from(byte));
    const page=await readProcessOutputPage(f.store,{...f.id,encoding});
    assert.equal(page.text,null,encoding);assert.equal(page.encoding,'binary-or-invalid-encoding',encoding);
  }
});

test('OEM36-NOTE-CONDITIONAL: the hint says an encoding is only for a program KNOWN to write it',async t=>{
  const f=await fixture(t,Buffer.from('4574853a','hex'));
  const nota=formatProcessOutputPage(await readProcessOutputPage(f.store,f.id));
  assert.match(nota,/If the program is known to write a Windows code page/);
  assert.match(nota,/process_output encoding:"cp850"/);
});
