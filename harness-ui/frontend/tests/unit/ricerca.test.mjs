import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statoRicerca,testiRicerca,riepilogoRicerche,filtraRicerche} from '../../src/components/ricerca.js';
test('RICERCA-STATO: cinque stati reali distinti e valore sconosciuto esplicito',()=>{
 assert.deepEqual(['running','paused','done','cancelled','failed'].map(s=>statoRicerca(s).testo),['In corso','In pausa','Conclusa','Annullata','Non riuscita']);
 assert.equal(statoRicerca('nuovo').testo,'Stato non registrato');assert.equal(statoRicerca('nuovo').tono,'');
});
test('RICERCA-SEMANTICA: conclusa non significa fonti verificate',()=>{
 assert.deepEqual(statoRicerca('done'),{testo:'Conclusa',tono:'success'});assert.equal(statoRicerca('failed').tono,'danger');
 assert.ok(!/fonti|verificat|applicata|decisione/i.test(Object.values(statoRicerca('done')).join(' ')));
});
test('RICERCA-TITOLO-DATA: titolo intero, data valida completa, metadati mancanti espliciti',()=>{
 const titolo='Confronto dettagliato dei permessi, delle autorizzazioni e del recupero dopo una ricerca interrotta';const t=testiRicerca({titolo,avviataAlle:'2026-09-04T16:42:00Z'});
 assert.equal(t.titolo,titolo);/* 11/09 (L7): la data non porta più i SECONDI — «04/09/2026, 18:42:00» in una riga di elenco è un
    numero che non dice niente. La pretesa segue la forma nuova, dichiarata campo per campo. */
 assert.equal(t.avviata,new Date('2026-09-04T16:42:00Z').toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}));
 assert.ok(!/d{2}:d{2}:d{2}/.test(t.avviata),'niente secondi');assert.match(t.dataBreve,/04\/09\/2026/);
 assert.deepEqual(testiRicerca({titolo:' ',avviataAlle:'non-data'}),{titolo:'Ricerca senza titolo',avviata:null,dataBreve:'Data non registrata'});
});
test('RICERCA-FILTRO: titolo completo, stato leggibile, stato reale e ordine conservato',()=>{
 const a={id:'a',titolo:'Ricerca su permessi e recupero dopo interruzione',stato:'paused'},b={id:'b',titolo:'Altra ricerca',stato:'done'};
 assert.deepEqual(filtraRicerche([a,b],{query:' DOPO INTERRUZIONE ',stato:'paused'}),[a]);assert.deepEqual(filtraRicerche([a,b],{query:'conclusa'}),[b]);assert.deepEqual(filtraRicerche([a,b],{query:'ricerca',stato:'failed'}),[]);assert.deepEqual(filtraRicerche([a,b]),[a,b]);
});
test('RICERCA-ELENCO-PARZIALE: conta le voci restituite senza inventare il totale',()=>{
 assert.equal(riepilogoRicerche([]),'0 ricerche elencate');assert.equal(riepilogoRicerche([{}]),'1 ricerca elencata');assert.equal(riepilogoRicerche(Array.from({length:20},()=>({}))),'20 ricerche elencate');
});
