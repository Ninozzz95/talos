import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statoAutomazione,testiAutomazione,filtraAutomazioni,riepilogoAutomazioni,creaAutomationRow} from '../../src/components/automazioni.js';
import {AUTOMAZIONI,ADESSO} from '../../lab/fixtures/automazioni.js';
test('AUT-STATO: booleani veri, stato ignoto non abilita',()=>{assert.deepEqual(statoAutomazione(true),{testo:'Attiva',tono:'success',prossimo:false});assert.deepEqual(statoAutomazione(false),{testo:'In pausa',tono:'',prossimo:true});assert.equal(statoAutomazione('false').prossimo,null);});
test('AUT-CONTEGGIO-UTC: giornata precedente azzera la lettura, limite raggiunto non promette avvio',()=>{assert.equal(testiAutomazione(AUTOMAZIONI[0],ADESSO).conteggio,'2 di 3');assert.equal(testiAutomazione({...AUTOMAZIONI[0],giornoContatore:'2026-09-04'},ADESSO).conteggio,'0 di 3');assert.equal(testiAutomazione(AUTOMAZIONI[2],ADESSO).prossima,'Limite giornaliero raggiunto');assert.equal(testiAutomazione({...AUTOMAZIONI[2],giornoContatore:'2026-09-06'},ADESSO).conteggio,'0 di 1');});
test('AUT-DATE: avvio registrato non è successo, dati assenti restano espliciti',()=>{const t=testiAutomazione(AUTOMAZIONI[1],ADESSO);assert.equal(t.ultima,'Nessun avvio registrato');assert.equal(t.prossima,'In pausa');assert.equal(t.nome,AUTOMAZIONI[1].nome);assert.equal(testiAutomazione({...AUTOMAZIONI[0],prossimaEsecuzione:'errore'},ADESSO).prossima,'Data non registrata');});
test('AUT-FILTRO: nome completo e task, stato senza perdere query',()=>{assert.equal(filtraAutomazioni(AUTOMAZIONI,{query:'promemoria',stato:'pausa'}).length,1);assert.equal(filtraAutomazioni(AUTOMAZIONI,{query:'promemoria',stato:'attive'}).length,0);assert.equal(filtraAutomazioni(AUTOMAZIONI,{query:'verifica-catalogo'}).length,1);});
test('AUT-RIEPILOGO: nessun numero di esiti inventato',()=>{assert.equal(riepilogoAutomazioni(AUTOMAZIONI),'3 automazioni · 2 attive');assert.equal(riepilogoAutomazioni([]),'0 automazioni · 0 attive');});
// 24/09/2026, decisione owner («come il mobile, subito»): la riga dice con quale modello gira l'automazione.
test('AUT-MODELLO: il modello salvato col suo nome leggibile; senza modello, il predefinito del server detto a parole',()=>{assert.equal(testiAutomazione({...AUTOMAZIONI[0],modello:'z-ai/glm-5.3-flash'},ADESSO).modello,'glm-5.3-flash');assert.equal(testiAutomazione({...AUTOMAZIONI[0],modello:null},ADESSO).modello,'Predefinito del server');assert.equal(testiAutomazione({...AUTOMAZIONI[0],modello:'   '},ADESSO).modello,'Predefinito del server');assert.doesNotMatch(testiAutomazione({...AUTOMAZIONI[0],modello:'local:Qwen-Qwen3-0-6B-GGUF-Q8-0-gguf'},ADESSO).modello,/^local:/u);});
// 24/09/2026: la voce «Modello» sta nei Dettagli della riga vera, non solo nel testo calcolato.
function docFinto(){const crea=(tag)=>{const n={tag,children:[],dataset:{},attributes:new Map(),hidden:false,_t:null,append(...c){this.children.push(...c);},setAttribute(k,v){this.attributes.set(k,String(v));},addEventListener(){},set textContent(v){this._t=String(v);},get textContent(){return this._t??this.children.map(c=>c.textContent).join('');}};return n;};return {createElement:crea};}
test('AUT-MODELLO-RIGA: i Dettagli della riga dicono il modello, prima dell’ultimo avvio',()=>{const riga=creaAutomationRow({...AUTOMAZIONI[0],modello:'z-ai/glm-5.3-flash'},{document:docFinto(),adesso:ADESSO});const pannello=riga.children.find(n=>n.dataset.autoDettaglio==='');assert.ok(pannello,'il pannello dei dettagli esiste');const voci=pannello.children.map(n=>n.children.map(c=>c.textContent));assert.deepEqual(voci[0],['Modello','glm-5.3-flash']);});
// C2b «Coordinazione» (owner 08/10/2026 notte, «Interruttore nella scheda, ora»): nel dettaglio, l'interruttore con la parola
// dello stato e la nota col tetto; spenta di serie e per le automazioni di prima; il clic chiede il valore OPPOSTO.
function docConAscoltatori(){const crea=(tag)=>{const n={tag,children:[],dataset:{},attributes:new Map(),hidden:false,disabled:false,_t:null,_click:[],append(...c){this.children.push(...c);},setAttribute(k,v){this.attributes.set(k,String(v));},addEventListener(tipo,fn){if(tipo==='click')this._click.push(fn);},set textContent(v){this._t=String(v);},get textContent(){return this._t??this.children.map(c=>c.textContent).join('');}};return n;};return {createElement:crea};}
const cerca=(n,prova)=>prova(n)?n:(n.children||[]).map(c=>cerca(c,prova)).find(Boolean)??null;
test('AUT-COORD-RIGA: il dettaglio ha l’interruttore di Coordinazione, la parola dello stato, la nota col tetto; il clic chiede l’opposto',()=>{
 for(const [valore,acceso,parola] of [[true,'true','Accesa'],[false,'false','Spenta'],[undefined,'false','Spenta']]){
  const chiesti=[];
  const riga=creaAutomationRow({...AUTOMAZIONI[0],coordinazione:valore},{document:docConAscoltatori(),adesso:ADESSO,onCoordinazione:(a,v)=>chiesti.push(v)});
  const interruttore=cerca(riga,n=>n.dataset?.autoCoordinazione==='');
  assert.ok(interruttore,'l’interruttore esiste');
  assert.equal(interruttore.attributes.get('role'),'switch');
  assert.equal(interruttore.attributes.get('aria-checked'),acceso,String(valore));
  assert.equal(interruttore.attributes.get('aria-label'),`Coordinazione per ${AUTOMAZIONI[0].nome}`);
  assert.equal(cerca(riga,n=>n.dataset?.autoCoordinazioneStato==='').textContent,parola);
  interruttore._click.forEach(fn=>fn());
  assert.deepEqual(chiesti,[valore!==true],'il clic chiede il valore opposto');
 }
 const testo=creaAutomationRow(AUTOMAZIONI[0],{document:docConAscoltatori(),adesso:ADESSO}).children.find(n=>n.dataset.autoDettaglio==='').textContent;
 assert.match(testo,/al massimo 20 per esecuzione/u,'la nota dice il tetto');
 const inSalvataggio=cerca(creaAutomationRow(AUTOMAZIONI[0],{document:docConAscoltatori(),adesso:ADESSO,salvataggio:true}),n=>n.dataset?.autoCoordinazione==='');
 assert.equal(inSalvataggio.disabled,true,'mentre salva non si tocca');
});
