/*
 * K4b — gli avvisi del traduttore compatibile. ⛔ Riscritto il 07/10/2026 sul contratto dell'integrazione: dopo BUG-18
 *   (05/10, owner) le frasi di normalizzazione del ragionamento (livelli adattati, campi non inviati) sono NOTE di
 *   telemetria — al journal come CUSTOM `avviso-fornitore`, mai in chat — e quindi classe L: inglese semplice, SENZA
 *   chiave. Resta un solo avviso per la persona (classe P, con chiave): la temperatura gestita dal modello.
 *   La versione del 04/10 provava nove chiavi che nessuno nomina più (K4A-S02: «voce morta»).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preparaRichiestaCompatibile} from '../src/openai-compatible-runtime.mjs';
import {REGISTRO_FORNITORI} from '../src/provider-registry.mjs';
import {creaFetchMultiProvider} from '../src/runtime-owner-adapter.mjs';
import {createProviderCredentialStore} from '../src/provider-credential-store.mjs';
import server from '../frontend/src/i18n/testi/server.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/k4b-avvisi-compatibili-it.json',import.meta.url),'utf8'));
const ITALIANO=/[àèéìòù«»]|\b(il|non|ragionamento|inviato|livello|modello)\b/u;
test('K4B-COMPAT-01 — profili reali: avvisi P con chiave parallela, note L in inglese senza chiave, corpo invariato',()=>{
 const seen=new Set(),variants=[{reasoning:{enabled:false}},{reasoning:{effort:'xhigh'}},{reasoning:{enabled:true}},{reasoning:{effort:'low',extra:true}},{thinking:{type:'disabled'},reasoning_effort:'high'},{reasoning_effort:'none'},{reasoning_effort:'low'},{reasoning_effort:'medium'},{thinking:{type:'disabled'}},{reasoning:{enabled:false},reasoning_effort:'none'}];
 let note=0;
 for(const [provider,record]of Object.entries(REGISTRO_FORNITORI)){
  const models=new Set(['test-model',...(record.modelliNoti??[]).map(m=>m.id),...(record.modelliDiRiserva??[]).map(m=>m.id),...Object.keys(record.richiestaCompatibile?.modelli??{})]);
  for(const model of models)for(const variant of variants){
   const input={model,messages:[{role:'user',content:'model text $&'}],stream:true,temperature:0.5,...variant};let adapted;
   try{adapted=preparaRichiestaCompatibile(provider,input);}catch{continue;}
   assert.deepEqual(adapted.corpo.messages,input.messages);
   for(const n of adapted.note??[]){note+=1;assert.equal(typeof n,'string',`${provider} ${model}: una nota è testo semplice, senza chiave`);assert.doesNotMatch(n,ITALIANO,`${provider} ${model}: nota L in inglese`);}
   assert.equal(Object.hasOwn(adapted.corpo,'frasiAvvisi'),false);
   if(!adapted.avvisi.length)continue;
   assert.equal(adapted.frasiAvvisi?.length,adapted.avvisi.length,provider+' '+model);
   adapted.frasiAvvisi.forEach((f,i)=>{const key=f.testoChiave.slice(7);seen.add(key);assert.equal(f.testo,adapted.avvisi[i]);assert.equal(server.it[key],fixture[key]);assert.equal(f.testo,server.en[key].replace(/\{(\w+)\}/gu,(_m,p)=>String(f.testoParams[p])));});
  }
 }
 assert.ok(note>0,'premessa: il giro sui profili produce davvero delle note');
 assert.deepEqual([...seen].sort(),Object.keys(fixture).sort());
});
test('K4B-COMPAT-02 — il callback di produzione riceve la CHIAVE per l\'avviso della persona, e una nota inglese senza chiave per la telemetria',async()=>{
 const store=createProviderCredentialStore({env:{MOONSHOT_API_KEY:'fixture-not-real',GLM_API_KEY:'fixture-not-real'}});
 const giro=async(corpo)=>{const notices=[];let sent;
  const fetch=creaFetchMultiProvider(async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[{message:{content:'answer'},finish_reason:'stop'}]});},
   {dipendenze:{leggiChiave:p=>store.getKey(p),leggiRuntime:p=>store.getRuntime(p)},onAvviso:(n,o={})=>notices.push({n,o})});
  await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'hi'}],...corpo})});
  return {notices,sent};};
 const kimi=await giro({model:'kimi:kimi-k2.6',temperature:0.5});
 assert.equal(kimi.notices.length,1);
 assert.equal(kimi.notices[0].o.nota,undefined,'la temperatura è un avviso per la persona, non una nota');
 assert.equal(kimi.notices[0].n.testoChiave,'server.compatibleNotice.temperatureIgnored');
 assert.deepEqual(kimi.notices[0].n.testoParams,{provider:'Kimi'});
 assert.equal(kimi.sent.temperature,undefined);assert.equal(kimi.sent.frasiAvvisi,undefined);
 const glm=await giro({model:'zai:glm-5.3-flash',reasoning_effort:'medium'});
 assert.equal(glm.notices.length,1);
 assert.equal(glm.notices[0].o.nota,true,'BUG-18: la normalizzazione va al journal, mai in chat');
 assert.equal(typeof glm.notices[0].n,'string');assert.match(glm.notices[0].n,/sent "low", the nearest/u);
 assert.equal(glm.sent.reasoning_effort,'low');assert.equal(glm.sent.frasiAvvisi,undefined);
});
