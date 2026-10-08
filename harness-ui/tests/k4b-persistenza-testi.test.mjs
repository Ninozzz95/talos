import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSessionRegistry} from '../src/session-registry.mjs';
import server from '../frontend/src/i18n/testi/server.js';
import {testoDelCampo} from '../frontend/src/components/testo-server.js';
import {impostaLingua} from '../frontend/src/components/lingua.js';
import {cartellaDiProva} from './aiuto/cartelle-di-prova.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/k4b-persistenza-it.json',import.meta.url),'utf8'));
test('K4B-PERSIST-01 — scrittura reale del giro rifiutata: chiave e diagnosi arrivano nel replay',async(t)=>{
 const cartellaStore=cartellaDiProva('talos-k4b-persistenza-');t.after(()=>rimuoviCartellaDiProva(cartellaStore));
 let input,resolve;const result=new Promise(r=>resolve=r),detail='ENOSPC $& $1';
 const write=({record})=>{if(['checkpoint','messaggi-delta','messaggi-finali'].includes(record.tipo))throw new Error(detail);};
 const registry=createSessionRegistry({cartellaStore,guardaWorkspaceFn:()=>()=>{},modello:'m',chiave:'k',
  preparaEsecuzioneFn:()=>({cartella:'/tmp/x',comandoProva:'node --version',task:{id:'t',consegna:'test'}}),
  registraRigaSyncFn:write,registraRigaConfermataFn:async p=>write(p),
  avviaSessioneFn:p=>{input=p;p.onEvento({type:'RunStarted',threadId:'t',runId:'r'});return result;}});
 const {sessionId}=registry.avvia('t'),events=[];registry.iscriviti(sessionId,e=>events.push(e));
 input.onEvento({type:'RunFinished',threadId:'t',runId:'r'});
 resolve({ok:true,esito:{comeFinita:'concluso',messaggiFinali:[{role:'user',content:'test'},{role:'assistant',content:'answer'}]}});
 await registry.attendiAssestamento(sessionId);
 const event=events.find(e=>e.type==='RunError'&&e.code==='SESSION_STORE_WRITE_FAILED');assert.ok(event);
 const key='sessionPersistence.historyNotSaved';assert.equal(event.messageChiave,'server.'+key);assert.deepEqual(event.messageParams,{detail});
 const replay=JSON.parse(JSON.stringify(event));
 for(const l of ['it','en']){impostaLingua(l);assert.equal(testoDelCampo(replay,'message'),server[l][key].replace('{detail}',()=>detail));}
 impostaLingua('it');await registry.chiudi();
});
test('K4B-PERSIST-02 — cinque italiani identici e inglese con gli stessi segnaposto',()=>{
 for(const [key,it]of Object.entries(fixture)){
  assert.equal(server.it[key],it);assert.equal(typeof server.en[key],'string');
  assert.deepEqual([...it.matchAll(/\{(\w+)\}/gu)].map(m=>m[1]),[...server.en[key].matchAll(/\{(\w+)\}/gu)].map(m=>m[1]));
 }
});
