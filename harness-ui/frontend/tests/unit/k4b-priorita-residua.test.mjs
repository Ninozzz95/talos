import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {testoDelCampo} from '../../src/components/testo-server.js';
import {impostaLingua} from '../../src/components/lingua.js';
import server from '../../src/i18n/testi/server.js';
const originali=JSON.parse(readFileSync(new URL('../../../tests/fixtures/k4b-priorita-residua-it.json',import.meta.url),'utf8'));
test('K4B-PRIORITA-UI-01 — motivi e avvisi dopo replay, italiano originale e valori con dollari',()=>{
 for(const [key,it] of Object.entries(originali)){
  const params={provider:'P $&',nextProvider:'N $1',model:'M $$'};
  const data=JSON.parse(JSON.stringify({supportReason:server.en[key],supportReasonChiave:'server.'+key,supportReasonParams:params}));
  for(const l of ['it','en']){impostaLingua(l);assert.equal(testoDelCampo(data,'supportReason'),(l==='it'?it:server.en[key]).replace(/\{(\w+)\}/gu,(m,n)=>n in params?params[n]:m));}
 }
 impostaLingua('it');
 assert.equal(testoDelCampo({supportReason:'Motivo del modello $&'},'supportReason'),'Motivo del modello $&');
});
test('K4B-PRIORITA-UI-02 — il lettore delle affermazioni usa supportReasonChiave',()=>{
 const src=readFileSync(new URL('../../src/components/ricerca-dettaglio.js',import.meta.url),'utf8');
 assert.ok(src.includes("testoDelCampo(entrata.checks, 'supportReason')"));
});
