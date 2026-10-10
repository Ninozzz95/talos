import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {generaChiaviFirmaRicevute, talosLavora, verificaFirmaRicevuta} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';
import {avviaSessione} from '../src/agent-service.mjs';
import {elencaVoci, leggiVoce} from '../src/library-store.mjs';

const routes=[
  ['document_create','onDocumento'],['generate_image','onImmagine'],
  ['library_rename','onLibreriaRinomina'],['library_delete','onLibreriaElimina'],
  ['library_export','onLibreriaEsporta'],['library_context_policy_update','onLibreriaPolitica'],
  ['notes_create','onNoteCrea'],['notes_update','onNoteAggiorna'],['notes_delete','onNoteElimina'],
  ['tasks_create','onAttivitaCrea'],['tasks_complete','onAttivitaCompleta'],
  ['tasks_update','onAttivitaAggiorna'],['tasks_delete','onAttivitaElimina'],
  ['memory_write','onMemoriaScrivi'],['memory_update','onMemoriaAggiorna'],['memory_delete','onMemoriaElimina'],
  ['research_start','onRicercaAvvia'],['research_rename','onRicercaRinomina'],
  // C5 (10/10/2026): pause/resume/cancel arrivano da research_control con `action`; la ricevuta resta quella dell'azione
  ['research_control','onRicercaPausa',{action:'pause'}],['research_control','onRicercaRiprendi',{action:'resume'}],
  ['research_control','onRicercaAnnulla',{action:'cancel'}],['research_delete','onRicercaElimina'],
  ['tool_create','onForgeCrea'],
];
const keys=generaChiaviFirmaRicevute();

async function run(t, calls, callbacks, options={}, args={}){
  const root=mkdtempSync(join(tmpdir(),'talos-receipt25-'));
  t.after(()=>rimuoviCartellaDiProva(root));
  const events=[],sent=[];let turn=0;
  const tool_calls=calls.map((name,i)=>({id:`call-${i}`,type:'function',function:{name,arguments:JSON.stringify(args)}}));
  await talosLavora({
    cartella:root,task:{consegna:'Verify the requested tool result.'},modello:'fixture',chiave:'fixture',
    livelloAccesso:'accesso-pieno',strumentiEstesi:calls,firma:keys,chiediApprovazioneFn:async()=>true,...callbacks,...options,
    onGiro:e=>events.push(e),fetchDiRete:async(_url,input)=>{
      sent.push(JSON.parse(input.body));
      return{ok:true,status:200,json:async()=>({choices:[{message:turn++===0?{role:'assistant',content:null,tool_calls}:{role:'assistant',content:'Done.'}}],usage:{prompt_tokens:10,completion_tokens:5}})};
    },
  });
  return{events,sent};
}

function check(result,id,status,isError){
  const receipts=result.events.filter(e=>e.tipo==='ricevuta'&&e.ricevuta.toolCallId===id);
  assert.equal(receipts.length,1,'one signed receipt for one attempt');
  assert.equal(receipts[0].ricevuta.status,status);
  assert.equal(verificaFirmaRicevuta(receipts[0].ricevuta,keys.chiavePubblica),true,'status must be signed before delivery');
  const events=result.events.filter(e=>e.tipo==='tool-esito'&&e.toolCallId===id);
  assert.equal(events.length,1);assert.equal(events[0].isError,isError);
  const messages=result.sent[1].messages.filter(m=>m.tool_call_id===id);
  assert.equal(messages.length,1);
  assert.equal(messages[0].content,events[0].content,'provider and event preserve the same result');
  return receipts[0].ricevuta;
}

for(const[name,callback,args={}]of routes){
  const label=args.action?`${name}-${args.action}`:name;
  test(`RECEIPT25-${label}-FALSE: boolean failure cannot sign success`,async t=>{
    let calls=0;const text='The operation did not save its result.';
    const r=await run(t,[name],{[callback]:async()=>{calls++;return{ok:false,esito:text};}},{},args);
    const receipt=check(r,'call-0','failed',true);assert.equal(calls,1);
    assert.equal(receipt.error,text);
  });
  test(`RECEIPT25-${label}-THROW: callback exception is a failed attempt without retry`,async t=>{
    let calls=0;const r=await run(t,[name],{[callback]:async()=>{calls++;throw Error('store unavailable');}},{},args);
    check(r,'call-0','failed',true);assert.equal(calls,1);
    assert.match(r.sent[1].messages.find(m=>m.tool_call_id==='call-0').content,/store unavailable/);
  });
  test(`RECEIPT25-${label}-MISSING: unavailable channel does not sign success`,async t=>{
    const r=await run(t,[name],{},{},args);check(r,'call-0','failed',true);
    assert.match(r.sent[1].messages.find(m=>m.tool_call_id==='call-0').content,/not configured/);
  });
  test(`RECEIPT25-${label}-INVALID: absent or nonboolean ok never confirms execution`,async t=>{
    for(const value of [null,undefined,{},[],{ok:'true',esito:'created'},{ok:1,esito:'created'}]){
      let calls=0;const r=await run(t,[name],{[callback]:async()=>{calls++;return value;}},{},args);
      check(r,'call-0','failed',true);assert.equal(calls,1);
      assert.match(r.sent[1].messages.find(m=>m.tool_call_id==='call-0').content,/TOOL_RESULT_INVALID/);
    }
  });
  test(`RECEIPT25-${label}-SUCCESS: typed success survives error words in the payload`,async t=>{
    const text='Saved diagnostic: error ENOENT, failed assertions are quoted data.';
    let calls=0;const r=await run(t,[name],{[callback]:async()=>{calls++;return{ok:true,esito:text};}},{},args);
    check(r,'call-0','succeeded',false);assert.equal(calls,1);
    assert.equal(r.sent[1].messages.find(m=>m.tool_call_id==='call-0').content,text);
  });
  test(`RECEIPT25-${label}-DENIED: policy has precedence and never invokes the callback`,async t=>{
    let calls=0;const r=await run(t,[name],{[callback]:async()=>{calls++;return{ok:true,esito:'created'};}},{livelloAccesso:'lettura'},args);
    check(r,'call-0','denied',true);assert.equal(calls,0);
  });
}

test('RECEIPT25-MIXED: failure and success in one batch keep independent signed outcomes',async t=>{
  const r=await run(t,['document_create','notes_create'],{
    onDocumento:async()=>({ok:false,esito:'No document was saved.'}),
    onNoteCrea:async()=>({ok:true,esito:'Note saved.'}),
  });
  check(r,'call-0','failed',true);check(r,'call-1','succeeded',false);
});

test('RECEIPT25-REAL-DOCUMENT: a duplicate in the real workspace/store reaches AG-UI as an error without overwriting',async t=>{
  const root=mkdtempSync(join(tmpdir(),'talos-receipt25-real-'));t.after(()=>rimuoviCartellaDiProva(root));
  const events=[],sent=[];let turn=0;
  const tool_calls=[0,1].map(i=>({id:`document-${i}`,type:'function',function:{name:'document_create',arguments:JSON.stringify({format:'md',title:'RECEIPT25 durable',body:'ORIGINAL_RECEIPT25'})}}));
  await avviaSessione({cartella:root,cartellaCreazioni:root,cartellaDatiProgettoFn:()=>root,
    task:{consegna:'Create one document.'},modello:'fixture/receipt25',chiave:'fixture',
    livelloAccesso:'accesso-pieno',strumentiEstesi:['document_create'],firma:keys,onEvento:e=>events.push(e),
    talosLavoraFn:input=>talosLavora({...input,fetchDiRete:async(_url,opts)=>{
      const request=JSON.parse(opts.body);sent.push(request);assert.equal(request.stream,true);
      const first=turn++===0;
      const delta=first?{role:'assistant',tool_calls:tool_calls.map((call,index)=>({...call,index}))}:{role:'assistant',content:'Done.'};
      const packet={choices:[{index:0,delta,finish_reason:first?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:5}};
      return new Response(`data: ${JSON.stringify(packet)}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
    }}),
  });
  const results=events.filter(e=>e.type==='ToolCallResult');assert.equal(results.length,2,JSON.stringify(events.map(e=>({type:e.type,message:e.message}))));
  assert.equal(results[0].toolCallId,'document-0');assert.equal(results[0].isError,false);
  assert.equal(results[1].toolCallId,'document-1');assert.equal(results[1].isError,true);
  assert.match(results[1].content,/already exists/);assert.equal(sent.length,2);
  const docs=readdirSync(root).filter(n=>n.endsWith('.md'));assert.equal(docs.length,1);
  assert.match(readFileSync(join(root,docs[0]),'utf8'),/ORIGINAL_RECEIPT25/);
  const library=await elencaVoci({cartella:root});assert.equal(library.length,1);assert.equal(library[0].modello,'fixture/receipt25');
  const saved=await leggiVoce({cartella:root,id:library[0].id});assert.match(saved.testo,/ORIGINAL_RECEIPT25/);
});
