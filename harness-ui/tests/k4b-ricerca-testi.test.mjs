import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { creaResearchOrchestrator, rileggiRapportoRecintato } from '../src/research-orchestrator.mjs';
import { rileggiRapportoMinimo } from '../src/research-store.mjs';
import server from '../frontend/src/i18n/testi/server.js';
const originali=JSON.parse(readFileSync(new URL('./fixtures/k4b-ricerca-it.json',import.meta.url),'utf8'));
function uguale(o,campo){
 const key=o[`${campo}Chiave`]?.replace(/^server\./u,'');
 assert.ok(key,`${campo} senza chiave`);
 const params={...(o[`${campo}Params`]??{})};
 for(const n of Object.keys(params))if(n.endsWith('Chiave'))params[n.slice(0,-6)]=server.en[params[n].replace(/^server\./u,'')];
 assert.equal(o[campo],server.en[key].replace(/\{(\w+)\}/gu,(m,n)=>n in params?String(params[n]):m));
 assert.equal(server.it[key],originali[key]);
}
test('K4B-RESEARCH-01 — stati e cause della ricerca: riserva inglese e chiave fino alla risposta di elenco',async()=>{
 const casi=[
 ['paused','paused'],['cancelled','cancelled'],['giri-esauriti','turnsExhausted'],['bloccata-dal-permesso','readOnly'],['failed','failed'],
 ['failed','failedDetail',{motivoDettaglio:'Detail $& $1'}],
 ['failed','uncertain',{motivoErrore:{classe:'esito-incerto',transitorio:false}}],
 ...['rete','timeout-fornitore','traffico','guasto-fornitore','flusso-interrotto'].map(classe=>['failed','interrupted',{motivoErrore:{classe,transitorio:true}}]),
 ];
 for(const [terminata,key,extra={}]of casi){
  const record={id:'r',domanda:'Domanda',terminata,...extra};
  const orch=creaResearchOrchestrator({sessioni:new Map(),elencaRicercheFn:async()=>[record]});
  const esito=await orch.elenca({cartella:'/prova'});
  const voce=esito.ricerche[0];
  assert.equal(voce.motivoChiave,`server.research.state.${key}`);
  uguale(voce,'motivo');
  if(key==='interrupted')assert.match(voce.motivoParams.causeChiave,/^server\.research\.cause\./u);
 }
});
test('K4B-RESEARCH-02 — motivi minimi e recintati: italiano identico estratto, inglese e chiave',()=>{
 for(const testo of ['','testo senza titolo','# Titolo\n','# Titolo\nLa frase contiene almeno una affermazione.']){
  uguale(rileggiRapportoMinimo(testo),'motivo');
 }
 for(const testo of ['', '# Titolo\nTesto'])uguale(rileggiRapportoRecintato(testo),'motivo');
});
test('K4B-RESEARCH-03 — un dettaglio italiano persistito prima della migrazione viene riconosciuto e tradotto come parametro',async()=>{
 const record={id:'r',domanda:'Domanda',terminata:'failed',motivoDettaglio:originali['research.report.noSources']};
 const orch=creaResearchOrchestrator({sessioni:new Map(),elencaRicercheFn:async()=>[record]});
 const voce=(await orch.elenca({cartella:'/prova'})).ricerche[0];
 assert.equal(voce.motivoParams.detailChiave,'server.research.report.noSources');
 uguale(voce,'motivo');
});
