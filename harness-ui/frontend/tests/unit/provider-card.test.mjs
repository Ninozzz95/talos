import {test} from 'node:test';import assert from 'node:assert/strict';import {statoProvider,etichettaIndirizzo} from '../../src/components/provider-card.js';
test('PROV-SONDA: presenza chiave non certifica accesso né esecuzione',()=>{assert.equal(statoProvider({keyConfigured:true},null).prova,'Mai provato');assert.equal(statoProvider({id:'openrouter'},{esito:'collegato',modelli:0}).prova,'Servizio raggiunto · 0 modelli');assert.equal(statoProvider({id:'huggingface'},{esito:'collegato',modelli:0}).prova,'Profilo raggiunto');});
test('PROV-CAPACITA: HF senza timeout, token facoltativo; Anthropic con timeout',()=>{assert.equal(statoProvider({id:'huggingface',requiresKey:false},null).tempo,false);assert.equal(statoProvider({id:'anthropic',requiresKey:true},null).tempo,true);assert.equal(statoProvider({id:'huggingface',requiresKey:false},null).chiave,'Chiave facoltativa');});
test('PROV-ESITI: errore ignoto non diventa riuscito',()=>{assert.equal(statoProvider({},{esito:'non-autorizzato'}).prova,'Credenziale rifiutata');assert.equal(statoProvider({},{esito:'sconosciuto'}).prova,'Prova non riuscita');assert.equal(statoProvider({},{esito:'in-corso'}).occupato,true);});

// 12/09, review P-K: un fornitore senza indirizzo predefinito (Azure, Vertex, Bedrock) non può dire «Indirizzo predefinito» con l'indirizzo vuoto.
test('BADGE-INDIRIZZO — vuoto ⇒ «Indirizzo da impostare»; con un predefinito ⇒ «Indirizzo predefinito»; personalizzato ⇒ «Indirizzo personalizzato»; senza indirizzo ⇒ nessun badge', () => {
  assert.equal(etichettaIndirizzo({ supportsEndpoint: true, endpoint: '', endpointConfigured: false }), 'Indirizzo da impostare');
  assert.equal(etichettaIndirizzo({ supportsEndpoint: true, endpoint: 'https://api.deepseek.com', endpointConfigured: false }), 'Indirizzo predefinito');
  assert.equal(etichettaIndirizzo({ supportsEndpoint: true, endpoint: 'https://mia.openai.azure.com/openai/v1', endpointConfigured: true }), 'Indirizzo personalizzato');
  assert.equal(etichettaIndirizzo({ supportsEndpoint: false }), null);
});

// 08/10 (bugfixer, foto del collega sul 4174): OpenRouter salvato con l'indirizzo DI SERIE diceva «Indirizzo personalizzato».
test('BADGE-INDIRIZZO-SERIE — salvato ma uguale al predefinito ⇒ «Indirizzo predefinito»; AL CONTRARIO, diverso ⇒ «personalizzato»', () => {
  assert.equal(etichettaIndirizzo({ supportsEndpoint: true, endpoint: 'https://openrouter.ai/api/v1', endpointConfigured: true, endpointPredefinito: true }), 'Indirizzo predefinito');
  assert.equal(etichettaIndirizzo({ supportsEndpoint: true, endpoint: 'https://proxy.esempio.test/v1', endpointConfigured: true, endpointPredefinito: false }), 'Indirizzo personalizzato');
  // un server di prima (senza il campo) resta com'era
  assert.equal(etichettaIndirizzo({ supportsEndpoint: true, endpoint: 'https://proxy.esempio.test/v1', endpointConfigured: true }), 'Indirizzo personalizzato');
});
