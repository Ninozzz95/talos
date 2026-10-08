import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { controlliDoctor } from '../../src/components/doctor.js';
import { impostaLingua } from '../../src/components/lingua.js';
import server from '../../src/i18n/testi/server.js';
const originali=JSON.parse(readFileSync(new URL('../../../tests/fixtures/k4b-sessioni-it.json',import.meta.url),'utf8'));
test('K4B-STORE-UI-01 — Doctor traduce motivo e dettaglio in entrambe le lingue, anche dopo replay',()=>{
 const scarto={sessionId:'sess-$&',motivo:'corrotta',motivoChiave:'server.sessionStore.reason.corrotta',dettaglio:'English fallback',dettaglioChiave:'server.sessionStore.corrupt',dettaglioParams:{sessionId:'sess-$&'}};
 try{
  for(const lingua of ['it','en']){
   impostaLingua(lingua);
   const data=JSON.parse(JSON.stringify({chiaveApi:true,shell:'desktop',git:true,naviga:true,sessioniPersistenza:{corrotte:['sess-$&'],scartate:[scarto],perMotivo:{corrotta:1},dettaglio:'0 restored, 1 discarded out of 1: 1 corrotta.',dettaglioChiave:'server.doctor.sessions.restoredSome',dettaglioParams:{restored:0,discarded:1,total:1,reasons:'1 corrotta'}}}));
   const righe=controlliDoctor(data).find(v=>v.id==='sessioni').righe;
   assert.ok(righe.includes('sess-$& · '+server[lingua]['sessionStore.reason.corrotta']+' · '+server[lingua]['sessionStore.corrupt'].replace('{sessionId}',()=> 'sess-$&')));
   assert.ok(righe[0].includes('1 '+server[lingua]['sessionStore.reason.corrotta']));
   for(const [chiave,it] of Object.entries(originali))assert.equal(server.it[chiave.slice(7)],it);
  }
  impostaLingua('it');
  const legacy=controlliDoctor({chiaveApi:true,shell:'desktop',git:true,naviga:true,sessioniPersistenza:{corrotte:[],scartate:[{sessionId:'old',motivo:'old reason',dettaglio:'old detail'}]}});
  assert.ok(legacy.find(v=>v.id==='sessioni').righe.includes('old · old reason · old detail'));
 }finally{impostaLingua('it');}
});
