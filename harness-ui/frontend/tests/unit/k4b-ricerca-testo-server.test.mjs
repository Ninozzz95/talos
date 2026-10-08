import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { frasiVoce } from '../../src/components/ricerca-dettaglio.js';
import { impostaLingua } from '../../src/components/lingua.js';
import server from '../../src/i18n/testi/server.js';
const originali=JSON.parse(readFileSync(new URL('../../../tests/fixtures/k4b-ricerca-it.json',import.meta.url),'utf8'));
test('K4B-RESEARCH-UI-01 — il componente reale traduce il motivo e la clausola annidata dopo replay, in entrambe le lingue',()=>{
 const data={stato:'failed',motivo:'Research was interrupted midway: the connection to the model provider dropped. Work already done is preserved and can resume from there.',motivoChiave:'server.research.state.interrupted',motivoParams:{cause:server.en['research.cause.network'],causeChiave:'server.research.cause.network'}};
 for(const lingua of ['it','en']){
  impostaLingua(lingua);
  const copia=JSON.parse(JSON.stringify(data));
  const expected=(lingua==='it'?originali:server.en)['research.state.interrupted'].replace('{cause}',()=>(lingua==='it'?originali:server.en)['research.cause.network']);
  assert.equal(frasiVoce(copia).spiegazione,expected);
 }
 impostaLingua('it');
 assert.equal(frasiVoce({stato:'failed',motivo:'Vecchio motivo $&'}).spiegazione,'Vecchio motivo $&');
});
test('K4B-RESEARCH-UI-02 — la riverifica reale legge avvertenzaChiave',()=>{
 const s=readFileSync(new URL('../../src/components/ricerca-dettaglio.js',import.meta.url),'utf8');
 assert.match(s,/nodo\(doc, 'p', 'td-subtle', testoDelCampo\(esito, 'avvertenza'\)\)/u);
});
