import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {talosResearchVerify} from '../src/research/verification.mjs';
import {talosResearchParseReport} from '../src/research/report.mjs';
import {componiRapportoRicerca} from '../src/research-orchestrator.mjs';
import {creaFetchMultiProvider} from '../src/runtime-owner-adapter.mjs';
import {createProviderCredentialStore} from '../src/provider-credential-store.mjs';
import {chiamaConRitenta} from '../src/kernel/talosHarness.mjs';
import {avviaSessione} from '../src/agent-service.mjs';
import server from '../frontend/src/i18n/testi/server.js';
const it=JSON.parse(readFileSync(new URL('./fixtures/k4b-priorita-residua-it.json',import.meta.url),'utf8'));
function contratto(o,campo,key){
 assert.equal(o[campo+'Chiave'],'server.'+key);
 const params=o[campo+'Params']??{};
 assert.equal(o[campo],server.en[key].replace(/\{(\w+)\}/gu,(m,n)=>n in params?String(params[n]):m));
 assert.equal(server.it[key],it[key]);
}
const claim={text:'Fact',quote:'Source $&',sourceIndex:1};
const source={url:'https://example.test',title:'Title',obtained:'page',text:'Source $&'};
test('K4B-REASON-01 — cinque motivi fissi della verifica mantengono chiavi nel record e distinguono il testo del giudice',async()=>{
 const judge={id:'j',provider:'local',model:'m'};
 const cases=[
  ['noSource',{judge},[]],['noQuote',{judge},[{...source,text:'Other'}]],['noJudge',{judge:null},[source]],
  ['noVerdict',{judge,ask:async()=>'? ',at:()=>null},[source]],
  ['noResponse',{judge,ask:async()=>{throw 'guasto';},at:()=>null},[source]],
 ];
 for(const [key,deps,sources] of cases){
  const [result]=await talosResearchVerify(deps,[claim],sources);
  contratto(JSON.parse(JSON.stringify(result.checks)),'supportReason','research.reason.'+key);
 }
 const [generated]=await talosResearchVerify({judge,ask:async()=>'SI — Motivo $& originale',at:()=>null},[claim],[source]);
 assert.equal(generated.checks.supportReason,'Motivo $& originale');
 assert.equal(generated.checks.supportReasonChiave,undefined);
});
test('K4B-REASON-02 — il deposito non giudicato persiste supportReasonChiave nel recinto verificabile',()=>{
 const result=componiRapportoRicerca({testo:'# Titolo\nSintesi $&',affermazioni:[{testo:'Fact',fonte:'https://example.test',passaggio:'Source $&'}],fonti:[{url:'https://example.test',titolo:'Title'}]},'Question');
 assert.equal(result.ok,true);
 const record=talosResearchParseReport(result.documento??result.testo??result.contenuto);
 assert.ok(record);
 contratto(record.claims[0].checks,'supportReason','research.reason.modelDeposited');
});
test('K4B-RUNTIME-01 — la riprova locale emette un avviso bilingue una volta e conserva la risposta del modello',async()=>{
 const notices=[];let calls=0;
 const f=creaFetchMultiProvider(async()=>++calls===1?new Response('unsupported tools',{status:400}):new Response('Model $&',{status:200}),{
  dipendenze:{},risolvi:()=>({fonte:'ollama',modelloRemoto:'m',url:'https://example.test/chat/completions',headers:{}}),onAvviso:e=>notices.push(e),
 });
 const body=JSON.stringify({model:'ollama:m',messages:[],tools:[{type:'function',function:{name:'read',parameters:{type:'object'}}}]});
 assert.equal(await (await f('https://example.test/chat/completions',{body})).text(),'Model $&');
 assert.equal(notices.length,1);contratto(notices[0],'testo','runtime.notice.noTools');
});
for(const status of [401,429,503])test(`K4B-RUNTIME-02 — HTTP ${status}: avviso effettivo, inglese e metadati`,async()=>{
 const values=new Map(),store=createProviderCredentialStore({env:{DEEPSEEK_API_KEY:'fake',ZAI_API_KEY:'fake'},keyring:{get:(s,p)=>values.get(s+p)??null,set:(s,p,v)=>values.set(s+p,v),remove:(s,p)=>values.delete(s+p)}});
 const notices=[],changes=[];
 const f=creaFetchMultiProvider(async(url)=>String(url).includes('deepseek')?new Response('upstream error',{status}):Response.json({choices:[{message:{content:'Done'}}]}),{
  providerStore:store,dipendenze:{leggiChiave:p=>store.getKey(p),leggiRuntime:p=>store.getRuntime(p)},fallbackProviders:[{provider:'zai',model:'glm-4.7-flash'}],onAvviso:e=>notices.push(e),onCambioFornitore:e=>changes.push(e),onConsumoFornitore:()=>{},
 });
 const input={modello:'deepseek:deepseek-chat',chiave:'fake',messaggi:[{role:'user',content:'Hello'}],attrezzi:[],dormi:async()=>{},caso:()=>0};
 const run=()=>f.eseguiConFallback(extra=>chiamaConRitenta({...input,...extra}),input);
 if(status===401){await assert.rejects(run());assert.equal(changes.length,0);contratto(notices[0],'testo','runtime.notice.keyRejected');}
 else{await run();assert.equal(changes.length,1);contratto(changes[0],'messaggio','runtime.notice.'+(status===429?'trafficFallback':'unavailableFallback'));}
});
test('K4B-RUNTIME-03 — la chiave del cambio fornitore attraversa agent-service e il replay del delta',async()=>{
 const events=[],notice={tipo:'cambio-fornitore',messaggio:'Provider P is limiting traffic: continuing with N · model $&',messaggioChiave:'server.runtime.notice.trafficFallback',messaggioParams:{provider:'P',nextProvider:'N',model:'$&'}};
 await avviaSessione({cartella:tmpdir(),task:{consegna:'Hello'},modello:'m',chiave:'k',onEvento:e=>events.push(e),onCambioFornitore:()=>{},talosLavoraFn:async input=>{await input.onCambioFornitore(notice);return {comeFinita:'concluso',detto:'done'};}});
 const event=JSON.parse(JSON.stringify(events.find(e=>e.delta===notice.messaggio)));
 contratto(event,'delta','runtime.notice.trafficFallback');
});
