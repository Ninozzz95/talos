import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creaLibraryRow,azioniLibreria,indirizzoFileLibreria,nomeLibreriaValido} from '../../src/components/libreria.js';

/*
 * ⛔⛔ 10/09/2026, owner: «ogni artefatto va salvato in libreria, con CRUD COMPLETO e azioni Windows».
 *
 * Misurato prima: la riga aveva DUE bottoni e UNO SOLO raggiungibile — «Apri» nasceva `hidden` con
 * `dataset.richiede='fase3'` ⇒ 0 azioni su 5. Qui si prova che le cinque ci sono E che si comportano
 * bene AL CONTRARIO: senza id nessun bottone, l'eliminazione chiede conferma, e un errore del server
 * si VEDE invece di sparire.
 *
 * Ricerca 10/09/2026 dietro le scelte provate qui: saasui.design «SaaS Destructive Actions &
 * Confirmation UX Patterns» (la conferma solo per ciò che non si annulla), nngroup.com
 * «Confirmation Dialogs Can Prevent User Errors», blog.logrocket.com «Modal UX design» (una
 * rinomina è un passo solo: in linea, non in una modale), W3C APG «Providing Accessible Names and
 * Descriptions» (il nome accessibile deve DISTINGUERE: dieci «Elimina» uguali non distinguono
 * niente), learn.microsoft.com «Naming Files, Paths, and Namespaces» (i caratteri riservati).
 */

/** Il DOM minimo che serve alla riga: nessun browser, nessuna dipendenza. Eventi e fuoco compresi. */
function documentoFinto(fuochi=[]){
 const crea=(tag)=>{
  const attributi=new Map();
  const nodo={
   tag,tagName:tag.toUpperCase(),classi:new Set(),dataset:{},figli:[],ascolti:[],testoProprio:'',hidden:false,disabled:false,value:'',
   get className(){return [...nodo.classi].join(' ');},
   set className(v){nodo.classi=new Set(String(v).split(/\s+/).filter(Boolean));},
   classList:{add:(...c)=>c.forEach(x=>nodo.classi.add(x)),remove:(...c)=>c.forEach(x=>nodo.classi.delete(x)),toggle:(c,forza)=>(forza?nodo.classi.add(c):nodo.classi.delete(c)),contains:c=>nodo.classi.has(c)},
   get textContent(){return nodo.testoProprio!==''?nodo.testoProprio:nodo.figli.map(f=>f.textContent??'').join('');},
   set textContent(v){nodo.testoProprio=String(v);},
   setAttribute:(k,v)=>attributi.set(k,String(v)),
   getAttribute:k=>(attributi.has(k)?attributi.get(k):null),
   append:(...x)=>nodo.figli.push(...x),
   addEventListener:(t,m)=>nodo.ascolti.push({t,m}),
   lancia:(t,e={})=>{for(const a of nodo.ascolti.filter(a=>a.t===t))a.m({type:t,preventDefault(){},...e});},
   focus:()=>fuochi.push(nodo),
   select:()=>{},
   /** Ricerca a mano: il finto non ha querySelector. */
   trova:(classe)=>(nodo.classi.has(classe)?nodo:nodo.figli.map(f=>f.trova?.(classe)).find(Boolean)||null),
   azione:(nome)=>(nodo.dataset.azione===nome?nodo:nodo.figli.map(f=>f.azione?.(nome)).find(Boolean)||null),
  };
  return nodo;
 };
 return {createElement:crea,createElementNS:(_ns,tag)=>crea(tag)};
}
const VOCE={id:'v-1',nome:'Contratto casa.md',fileType:'document',origine:'generated',aggiornatoIl:'2026-09-09T10:00:00.000Z'};
const attendi=()=>new Promise(r=>setTimeout(r,0));
/** Una risposta come quella di `fetch`, senza rete. */
const risposta=(ok,status=200,corpo='')=>({ok,status,text:async()=>corpo});

/*
 * ⛔ 10/09/2026, owner: «non mettere i pulsanti uno accanto all'altro, usa i tre puntini + dropdown…
 * e anche azioni tasto destro mouse». Le cinque azioni non stanno più NELLA riga: la riga porta un
 * solo bottone «⋯» e consegna le voci a chi disegna il menu (`vociMenu()`), che è lo stesso
 * `.ft-actions-menu` dell'albero dei file. Queste prove cercano lì.
 */
const vociDi=(riga)=>(typeof riga.vociMenu==='function'?riga.vociMenu():[]);
const azioneDi=(riga,chiave)=>vociDi(riga).find(v=>v.chiave===chiave)?.elemento||null;
const voceDi=(riga,chiave)=>vociDi(riga).find(v=>v.chiave===chiave)||null;

test('LIBRERIA-MENU: la riga porta UN bottone solo, e le cinque azioni stanno nel menu — ognuna nomina il file',()=>{
 const doc=documentoFinto();
 const riga=creaLibraryRow(VOCE,{document:doc,sessionId:'s-9',azioni:{rinomina:async()=>({ok:true}),elimina:async()=>({ok:true}),rivela:async()=>({ok:true}),apri:async()=>({ok:true})},onMenu:()=>{}});
 const gruppo=riga.trova('talos-list-row__azioni');
 assert.equal(gruppo.getAttribute('role'),'group');
 assert.equal(gruppo.getAttribute('aria-label'),'Azioni su Contratto casa.md');

 /* \u26d4 UN bottone, non cinque: \u00e8 la richiesta dell'owner, ed \u00e8 ci\u00f2 che questa prova difende. */
 const nellaRiga=[];
 (function raccogli(n){ if(n?.dataset?.azione)nellaRiga.push(n.dataset.azione); for(const f of n?.figli??[])if(typeof f==='object')raccogli(f); })(gruppo);
 assert.deepEqual(nellaRiga,['menu'],'nella riga resta il solo \u00ab\u22ef\u00bb');
 assert.equal(azioneDi(riga,'menu'),null,'e il bottone del menu non \u00e8 una voce del menu');
 const puntini=gruppo.azione('menu');
 assert.equal(puntini.getAttribute('aria-label'),'Azioni su Contratto casa.md');
 assert.equal(puntini.getAttribute('aria-haspopup'),'menu');

 for(const [chiave,etichetta,nome] of [
  ['apri','Apri','Apri Contratto casa.md con il programma predefinito'],
  ['scarica','Scarica','Scarica Contratto casa.md'],
  ['rinomina','Rinomina','Rinomina Contratto casa.md'],
  ['rivela','Mostra nella cartella','Mostra Contratto casa.md nella cartella'],
  ['elimina','Elimina','Elimina Contratto casa.md'],
 ]){
  const v=voceDi(riga,chiave);
  assert.ok(v,'manca la voce '+chiave);
  assert.equal(v.etichetta,etichetta);
  assert.equal(v.elemento.getAttribute('aria-label'),nome,'dieci righe non possono avere dieci \u00ab'+etichetta+'\u00bb indistinguibili (APG, 10/09/2026)');
 }
 assert.deepEqual(vociDi(riga).map(v=>v.chiave),['apri','scarica','rinomina','rivela','elimina'],'prima ci\u00f2 che si fa spesso, per ultima quella che non si rif\u00e0');
 assert.equal(voceDi(riga,'elimina').pericolo,true);
 assert.equal(voceDi(riga,'elimina').separaPrima,true,'\u26d4 staccata dalle altre: la distanza \u00e8 gi\u00e0 mezza difesa');
 assert.equal(azioneDi(riga,'scarica').tagName,'A','i byte li porta il browser, anche da dentro il menu');
 assert.equal(azioneDi(riga,'scarica').href,'/api/v1/sessions/s-9/library/v-1/file');
 assert.equal(azioneDi(riga,'apri').tagName,'BUTTON','\u26d4 \u00abApri\u00bb chiede al server: come ancora avrebbe scaricato una seconda copia');
});

test('LIBRERIA-MENU: il tasto destro apre lo STESSO menu, alle coordinate del puntatore',()=>{
 const doc=documentoFinto();
 const chiamate=[];
 const riga=creaLibraryRow(VOCE,{document:doc,sessionId:'s-9',azioni:{rinomina:async()=>({ok:true}),elimina:async()=>({ok:true}),rivela:async()=>({ok:true}),apri:async()=>({ok:true})},onMenu:(voci,dove)=>chiamate.push({voci:voci.map(v=>v.chiave),dove})});

 riga.trova('talos-list-row__azioni').azione('menu').lancia('click',{stopPropagation(){}});
 assert.equal(chiamate.length,1);
 assert.ok(chiamate[0].dove.ancoraEl,'dal bottone: il menu si ancora al bottone');

 let impedito=false;
 riga.lancia('contextmenu',{clientX:120,clientY:340,preventDefault:()=>{impedito=true;}});
 assert.equal(chiamate.length,2,'\u26d4 il tasto destro deve aprire il menu, non il menu del browser');
 assert.equal(impedito,true,'e il menu del sistema non compare');
 assert.deepEqual(chiamate[1].dove,{x:120,y:340});
 assert.deepEqual(chiamate[0].voci,chiamate[1].voci,'due strade, una lista sola');
});

test('LIBRERIA-AZIONI AL CONTRARIO: senza sessione (o senza id) NON compare un solo bottone che fingerebbe',()=>{
 const senzaSessione=creaLibraryRow(VOCE,{document:documentoFinto()});
 const gruppo=senzaSessione.trova('talos-list-row__azioni');
 assert.equal(gruppo.figli.length,0,'niente sessione, niente indirizzo, niente servizio: la riga resta ai soli Dettagli');
 for(const azione of ['apri','scarica','rinomina','rivela','elimina'])assert.equal(gruppo.azione(azione),null);
 assert.ok(senzaSessione.azione('dettagli'),'«Dettagli» resta: non dipende dal server');
 // e con la sessione ma senza id della voce: stessa cosa, perché l'indirizzo non esiste
 const senzaId=creaLibraryRow({...VOCE,id:''},{document:documentoFinto(),sessionId:'s-9'});
 assert.equal(senzaId.trova('talos-list-row__azioni').figli.length,0);
 assert.equal(indirizzoFileLibreria('s-9',''),'');
 assert.equal(indirizzoFileLibreria('','v-1'),'');
});

test('LIBRERIA-ELIMINA: il primo clic NON cancella niente — chiede conferma, e la via d’uscita prende il fuoco',async()=>{
 const fuochi=[],chiamate=[];
 const doc=documentoFinto(fuochi);
 let ricaricata=0;
 const riga=creaLibraryRow(VOCE,{document:doc,sessionId:'s-9',onCambiata:()=>{ricaricata+=1;},
  azioni:{rinomina:async()=>({ok:true}),elimina:async(id)=>{chiamate.push(id);return {ok:true};},rivela:async()=>({ok:true})}});
 azioneDi(riga,'elimina').lancia('click');
 assert.deepEqual(chiamate,[],'⛔ un clic solo non deve distruggere un file (saasui.design/NN-g, 10/09/2026)');
 const conferma=riga.trova('talos-list-row__conferma');
 assert.equal(conferma.hidden,false);
 assert.equal(riga.trova('talos-list-row__azioni').hidden,true,'le cinque spariscono mentre si conferma: niente doppio bersaglio');
 assert.match(conferma.textContent,/Non si torna indietro/,'la conseguenza è scritta, non è un «Sei sicuro?»');
 assert.equal(conferma.azione('elimina-conferma').getAttribute('aria-label'),'Elimina definitivamente Contratto casa.md: non si torna indietro');
 assert.equal(fuochi.at(-1),conferma.azione('elimina-annulla'),'⛔ il fuoco va sulla via d’uscita, non sul bottone che cancella');
 conferma.azione('elimina-conferma').lancia('click');
 await attendi();
 assert.deepEqual(chiamate,['v-1']);
 assert.equal(ricaricata,1,'dopo un’eliminazione riuscita l’elenco si rilegge dal server');
 const messaggio=riga.trova('talos-list-row__messaggio');
 assert.equal(messaggio.textContent,'File eliminato.');
 assert.equal(messaggio.getAttribute('role'),'status');
 assert.equal(riga.dataset.modo,'eliminata');
});

test('LIBRERIA-ELIMINA-ANNULLA: «Annulla» non chiama niente e riporta il fuoco su «Elimina»',()=>{
 const fuochi=[],chiamate=[];
 const riga=creaLibraryRow(VOCE,{document:documentoFinto(fuochi),sessionId:'s-9',
  azioni:{rinomina:async()=>({ok:true}),elimina:async()=>{chiamate.push('!');return {ok:true};},rivela:async()=>({ok:true})}});
 azioneDi(riga,'elimina').lancia('click');
 riga.trova('talos-list-row__conferma').azione('elimina-annulla').lancia('click');
 assert.deepEqual(chiamate,[]);
 assert.equal(riga.trova('talos-list-row__conferma').hidden,true);
 assert.equal(riga.trova('talos-list-row__azioni').hidden,false);
 assert.equal(fuochi.at(-1),azioneDi(riga,'elimina'),'chi ha aperto la conferma se la ritrova sotto il dito');
});

test('LIBRERIA-ERRORE VISIBILE: una rotta che non c’è ancora si LEGGE, col numero — non sparisce e non finge',async()=>{
 const doc=documentoFinto();
 // il server lo scrive un'altra sessione, adesso: la rotta può non esserci ancora
 const rete=async()=>risposta(false,404,'{"errore":"rotta non registrata"}');
 const riga=creaLibraryRow(VOCE,{document:doc,sessionId:'s-9',azioni:azioniLibreria({sessionId:'s-9',fetch:rete})});
 azioneDi(riga,'rivela').lancia('click');
 await attendi();
 const messaggio=riga.trova('talos-list-row__messaggio');
 assert.equal(messaggio.hidden,false);
 assert.equal(messaggio.getAttribute('role'),'alert');
 assert.match(messaggio.textContent,/non è ancora disponibile sul server \(HTTP 404\)/);
 assert.match(messaggio.textContent,/rotta non registrata/,'il perché del server arriva a schermo, non solo il numero');
 assert.equal(riga.dataset.modo,'normale','un errore non lascia la riga in uno stato a metà');
});

test('LIBRERIA-ERRORE DI RETE: se la fetch lancia, il bottone non finge — lo dice',async()=>{
 const rete=async()=>{throw new Error('connessione rifiutata');};
 const riga=creaLibraryRow(VOCE,{document:documentoFinto(),sessionId:'s-9',azioni:azioniLibreria({sessionId:'s-9',fetch:rete})});
 azioneDi(riga,'rivela').lancia('click');
 await attendi();
 assert.match(riga.trova('talos-list-row__messaggio').textContent,/Il server non ha risposto: connessione rifiutata/);
});

test('LIBRERIA-RINOMINA: in linea, e il nome col percorso viene fermato PRIMA di scomodare il server',async()=>{
 const fuochi=[],corpi=[];
 const doc=documentoFinto(fuochi);
 const rete=async(url,opzioni)=>{corpi.push({url,...opzioni});return risposta(true);};
 let ricaricata=0;
 const riga=creaLibraryRow(VOCE,{document:doc,sessionId:'s-9',onCambiata:()=>{ricaricata+=1;},azioni:azioniLibreria({sessionId:'s-9',fetch:rete})});
 azioneDi(riga,'rinomina').lancia('click');
 const forma=riga.trova('talos-list-row__rinomina');
 const campo=riga.trova('talos-list-row__nome');
 assert.equal(forma.hidden,false);
 assert.equal(riga.trova('talos-list-row__title').hidden,true,'il titolo cede il posto al campo: niente modale per un passo solo');
 assert.equal(campo.value,'Contratto casa.md');
 assert.equal(campo.getAttribute('aria-label'),'Nuovo nome per Contratto casa.md');
 assert.equal(fuochi.at(-1),campo,'chi rinomina scrive subito, senza cercare il campo');

 campo.value='sotto/cartella.md';
 forma.lancia('submit');
 await attendi();
 assert.deepEqual(corpi,[],'⛔ una barra fa un NOME un PERCORSO: si ferma qui, non dopo un giro sul server');
 assert.equal(riga.trova('talos-list-row__messaggio').getAttribute('role'),'alert');

 campo.value='  Contratto nuovo.md  ';
 forma.lancia('submit');
 await attendi();
 assert.equal(corpi.length,1);
 assert.equal(corpi[0].method,'PATCH');
 assert.equal(corpi[0].url,'/api/v1/sessions/s-9/library/v-1');
 assert.deepEqual(JSON.parse(corpi[0].body),{nome:'Contratto nuovo.md'},'gli spazi ai bordi si tolgono: il nome è quello, non quello con la spaziatura');
 assert.equal(ricaricata,1);
 assert.equal(riga.trova('talos-list-row__rinomina').hidden,true);
 assert.equal(riga.trova('talos-list-row__messaggio').textContent,'Rinominato in Contratto nuovo.md.');
});

test('LIBRERIA-RINOMINA-ESC: Esc esce senza chiamare niente e restituisce il fuoco',()=>{
 const fuochi=[],corpi=[];
 const rete=async(url,o)=>{corpi.push(url);return risposta(true);};
 const riga=creaLibraryRow(VOCE,{document:documentoFinto(fuochi),sessionId:'s-9',azioni:azioniLibreria({sessionId:'s-9',fetch:rete})});
 azioneDi(riga,'rinomina').lancia('click');
 riga.trova('talos-list-row__nome').lancia('keydown',{key:'Escape'});
 assert.deepEqual(corpi,[]);
 assert.equal(riga.trova('talos-list-row__rinomina').hidden,true);
 assert.equal(fuochi.at(-1),azioneDi(riga,'rinomina'));
});

test('LIBRERIA-NOME: uno spazio è legittimo, una barra e i riservati di Windows no',()=>{
 assert.deepEqual(nomeLibreriaValido('  Foto casa.png  '),{ok:true,nome:'Foto casa.png'});
 assert.equal(nomeLibreriaValido('Contratto-2026_v2 (finale).md').ok,true,'trattino, parentesi e underscore sono nomi normali');
 assert.equal(nomeLibreriaValido('').ok,false);
 assert.equal(nomeLibreriaValido('   ').ok,false);
 assert.equal(nomeLibreriaValido('a/b.md').ok,false);
 assert.equal(nomeLibreriaValido('a\\b.md').ok,false);
 assert.equal(nomeLibreriaValido('..').ok,false);
 assert.equal(nomeLibreriaValido('rapporto:2026.md').ok,false); // learn.microsoft.com, 10/09/2026
 assert.equal(nomeLibreriaValido('quale?.md').ok,false);
 assert.equal(nomeLibreriaValido('A'.repeat(256)).ok,false);
 assert.equal(nomeLibreriaValido('A'.repeat(255)).ok,true);
});

test('LIBRERIA-AZIONI-SERVIZIO: senza sessione non si costruisce nessun servizio (nessuna rotta inventata)',async()=>{
 assert.equal(azioniLibreria({sessionId:''}),null);
 assert.equal(azioniLibreria({sessionId:'s-9',fetch:null}),null);
 const visti=[];
 const s=azioniLibreria({sessionId:'s 9/strana',fetch:async(url,o)=>{visti.push([url,o?.method]);return risposta(true);}});
 await s.elimina('v/1');
 await s.rivela('v/1');
 assert.deepEqual(visti,[['/api/v1/sessions/s%209%2Fstrana/library/v%2F1','DELETE'],['/api/v1/sessions/s%209%2Fstrana/library/v%2F1/rivela','POST']],'id e sessione passano per encodeURIComponent: una barra in un id non deve diventare un altro percorso');
});

test('LIBRERIA-BUSTA VERA: il messaggio del server arriva a schermo dalla busta {ok,error} che http-app.mjs manda davvero',async()=>{
 // letta nel server il 10/09/2026 (`errorEnvelope`): {ok:false, error:{code, message, ...}}
 const rete=async()=>risposta(false,409,'{"ok":false,"error":{"code":"CONFLICT","message":"Esiste gia un file con questo nome"},"meta":{}}');
 const riga=creaLibraryRow(VOCE,{document:documentoFinto(),sessionId:'s-9',azioni:azioniLibreria({sessionId:'s-9',fetch:rete})});
 azioneDi(riga,'rinomina').lancia('click');
 riga.trova('talos-list-row__nome').value='Altro nome.md';
 riga.trova('talos-list-row__rinomina').lancia('submit');
 await attendi();
 const messaggio=riga.trova('talos-list-row__messaggio');
 assert.equal(messaggio.getAttribute('role'),'alert');
 assert.match(messaggio.textContent,/HTTP 409: Esiste gia un file con questo nome/);
 assert.equal(riga.dataset.modo,'rinomina','⛔ dopo un rifiuto il campo RESTA aperto col nome digitato: non si perde quello che si stava scrivendo');
});
