import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {erroreEsitoProviderIncerto,erroreEsitoProviderIncertoEsaurito} from '../src/provider-retry.mjs';
import {SilenzioDelFornitoreError} from '../src/generation-idle.mjs';
import server from '../frontend/src/i18n/testi/server.js';
import {testoDelCampo} from '../frontend/src/components/testo-server.js';
import {impostaLingua} from '../frontend/src/components/lingua.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/k4b-guasti-provider-it.json',import.meta.url),'utf8'));
for(const code of ['PROVIDER_SILENCE','PROVIDER_STREAM_ERROR'])test('K4B-OUTCOME-'+code+' — diagnosi bilingue conserva costo e trasporto',()=>{
 const cause={code,usage:{prompt_tokens:42,cost:0.25},parziale:'Testo del modello $&'};
 const error=erroreEsitoProviderIncerto(cause),key='providerOutcome.'+(code==='PROVIDER_SILENCE'?'silence':'interrupted');
 assert.equal(error.chiave,'server.'+key);assert.equal(error.message,server.en[key]);assert.equal(error.code,'PROVIDER_OUTCOME_UNKNOWN');
 assert.equal(error.transitorio,false);assert.equal(error.esitoIncerto,true);assert.deepEqual(error.usage,cause.usage);assert.equal(error.parziale,cause.parziale);
 assert.equal(server.it[key],fixture[key]);
 for(const l of ['it','en']){impostaLingua(l);assert.equal(testoDelCampo(JSON.parse(JSON.stringify({message:error.message,messageChiave:error.chiave})),'message'),server[l][key]);}impostaLingua('it');
});
test('K4B-OUTCOME-IDLE — la guardia espone i minuti con chiave e mantiene il timeout',()=>{
 const error=new SilenzioDelFornitoreError(120000),key='providerOutcome.noData';
 assert.equal(error.chiave,'server.'+key);assert.deepEqual(error.params,{minutes:2});assert.equal(error.limiteMs,120000);assert.equal(error.code,'PROVIDER_SILENCE');
 assert.equal(error.message,server.en[key].replace('{minutes}',()=> '2'));assert.equal(server.it[key],fixture[key]);
});
/* Riserva F1 del bugfixer (07/10/2026): l'esaurito nasce dal caso base, che ha già la SUA chiave (`interrupted`/`silence`);
   se non la sovrascrive, a schermo e nella trascrizione manca «dopo N reinvii automatici». */
for(const code of ['PROVIDER_SILENCE','PROVIDER_STREAM_ERROR'])test('K4B-OUTCOME-EXHAUSTED-'+code+' — la chiave dell esaurito porta il numero, nelle due lingue e al singolare',()=>{
 const resa=(error,l)=>{impostaLingua(l);return testoDelCampo(JSON.parse(JSON.stringify({message:error.message,messageChiave:error.chiave,messageParams:error.params})),'message');};
 const dieci=erroreEsitoProviderIncertoEsaurito({code},10);
 assert.equal(dieci.chiave,'server.providerOutcome.exhausted');assert.deepEqual(dieci.params,{n:10});assert.equal(dieci.code,'PROVIDER_OUTCOME_UNKNOWN_ESAURITO');
 assert.equal(dieci.message,server.en['providerOutcome.exhaustedMany'].replace('{n}',()=> '10'),'il testo del server e la voce inglese sono la stessa frase');
 assert.equal(resa(dieci,'en'),dieci.message);
 assert.equal(resa(dieci,'it'),fixture['providerOutcome.exhausted.10'],'in italiano la persona legge la frase di prima di K4b');
 const uno=erroreEsitoProviderIncertoEsaurito({code},1);
 assert.equal(uno.message,server.en['providerOutcome.exhaustedOne'].replace('{n}',()=> '1'));assert.equal(resa(uno,'en'),uno.message);
 assert.match(resa(uno,'it'),/dopo 1 reinvio automatico senza/u);
 // AL CONTRARIO: il caso NON esaurito resta con la sua chiave, senza numero
 assert.match(erroreEsitoProviderIncerto({code}).chiave,/^server\.providerOutcome\.(silence|interrupted)$/u);
 impostaLingua('it');
});
