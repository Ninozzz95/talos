import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,writeFileSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { leggiRegistro } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { diagnosi } from '../src/doctor.mjs';
import server from '../frontend/src/i18n/testi/server.js';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
const originali=JSON.parse(readFileSync(new URL('./fixtures/k4b-sessioni-it.json',import.meta.url),'utf8'));
function contratto(o,campo){
 const chiave=o[campo+'Chiave'];assert.ok(chiave,`${campo} senza chiave`);
 const key=chiave.replace(/^server\./u,''),params=o[campo+'Params']??{};
 assert.equal(o[campo],server.en[key].replace(/\{(\w+)\}/gu,(m,n)=>n in params?String(params[n]):m));
 assert.equal(server.it[key],originali[chiave]);
}
test('K4B-STORE-01 — riga corrotta e errore di lettura portano chiave, valori e inglese',async()=>{
 const cartellaStore=mkdtempSync(join(tmpdir(),'k4b-store-'));
 try{
  const sessionId='sess-$&-1';
  writeFileSync(join(cartellaStore,sessionId+'.jsonl'),'{}\nCORROTTA\n{}\n');
  await assert.rejects(leggiRegistro({cartellaStore,sessionId}),errore=>{
   contratto({testo:errore.message,testoChiave:errore.chiave,testoParams:errore.params},'testo');
   assert.equal(errore.code,'SESSION_STORE_CORRUPT');return true;
  });
  writeFileSync(join(cartellaStore,sessionId+'.jsonl'),'{}\n');
  await assert.rejects(leggiRegistro({cartellaStore,sessionId},{createReadStreamFn:()=>{
   const s=new PassThrough();
   // Esercita l'handler del lettore senza il forward di readline, che oggi emette un error non gestito.
   queueMicrotask(()=>{s.listeners('error').at(-1)(new Error('Detail $& $1'));s.destroy();});
   return s;
  }}),errore=>{
   contratto({testo:errore.message,testoChiave:errore.chiave,testoParams:errore.params},'testo');
   assert.equal(errore.params.detail,'Detail $& $1');return true;
  });
 }finally{await rimuoviCartellaDiProvaAttesa(cartellaStore);}
});
test('K4B-STORE-02 — ripristino vero copia le chiavi fino allo stato letto dal Doctor',async()=>{
 const cartellaStore=mkdtempSync(join(tmpdir(),'k4b-restore-'));
 try{
  writeFileSync(join(cartellaStore,'sess-corrotta.jsonl'),'{}\nCORROTTA\n{}\n');
  writeFileSync(join(cartellaStore,'sess-senza-header.jsonl'),'{}\n');
  writeFileSync(join(cartellaStore,'sess-vuota.jsonl'),'');
  const registro=createSessionRegistry({cartellaStore,modello:'m',chiave:'k'});
  const prima=readFileSync(join(cartellaStore,'sess-corrotta.jsonl'),'utf8');
  await registro.ripristina();
  const doctor=await diagnosi({sessioniPersistenza:registro.statoPersistenza(),eseguiComandoSandboxatoFn:async()=>({enforcement:'desktop'}),spawnSyncFn:()=>({status:0})});
  const scartate=JSON.parse(JSON.stringify(doctor)).sessioniPersistenza.scartate;
  assert.equal(scartate.length,3);
  for(const v of scartate){
   assert.equal(v.motivoChiave,'server.sessionStore.reason.'+v.motivo.replace(/-([a-z])/gu,(_,c)=>c.toUpperCase()));
   assert.equal(server.it[v.motivoChiave.slice(7)],v.motivo);
   if(v.dettaglio)contratto(v,'dettaglio');
  }
  assert.equal(readFileSync(join(cartellaStore,'sess-corrotta.jsonl'),'utf8'),prima);
 }finally{await rimuoviCartellaDiProvaAttesa(cartellaStore);}
});
