import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statoToolForgiato,capacitaToolForgiato,testiToolForgiato,filtraOfficina} from '../../src/components/officina.js';
test('FORGE-STATO: stato e azione opposti, nessun booleano implicito',()=>{
 assert.equal(statoToolForgiato(true).testo,'Abilitato');assert.equal(statoToolForgiato(true).azione,'Disabilita');assert.equal(statoToolForgiato(false).azione,'Abilita');assert.equal(statoToolForgiato(false).prossimo,true);
 for(const s of [null,undefined,'false',0]){assert.equal(statoToolForgiato(s).prossimo,null);assert.equal(statoToolForgiato(s).testo,'Stato non registrato');}
});
test('FORGE-CAPACITA: le otto capacità usano nomi umani, mancanti e sconosciute esplicite',()=>{
 assert.deepEqual(capacitaToolForgiato(['tasks.list','tasks.create','tasks.setStatus','notes.list','notes.create','notes.update','memory.search','memory.create']),['elenco delle attività','creazione di un’attività','modifica di un’attività','elenco delle note','scrittura di una nota','modifica di una nota','ricerca nella memoria','scrittura in memoria']);
 assert.deepEqual(capacitaToolForgiato([]),['Nessuna capacità dichiarata']);assert.deepEqual(capacitaToolForgiato(null),['Capacità non registrate']);assert.deepEqual(capacitaToolForgiato(['shell']),['Capacità non riconosciuta']);
});
test('FORGE-METADATI: descrizione intera, data e rischio solo se disponibili',()=>{
 const v={titolo:'Riepilogo',descrizione:'Descrizione completa e leggibile.',installatoAlle:'2026-09-04T16:00:00Z',rischio:'R2'};
 assert.equal(testiToolForgiato(v).descrizione,v.descrizione);assert.equal(testiToolForgiato(v).installato,new Date(v.installatoAlle).toLocaleString('it-IT'));assert.equal(testiToolForgiato(v).rischio,'R2');
 assert.deepEqual(testiToolForgiato({}),{titolo:'Attrezzo senza titolo',descrizione:'Descrizione non disponibile',installato:'Data non registrata',rischio:'Rischio non registrato'});
});
test('FORGE-FILTRO: cerca anche id e capacità tecniche senza usarle come titolo',()=>{
 const a={id:'riepilogo-attivita',titolo:'Riepilogo',descrizione:'Elenca quello che resta da fare',capacita:['tasks.list'],abilitato:true},b={id:'salva-nota',titolo:'Annota',descrizione:'Aggiunge un promemoria',capacita:['notes.create'],abilitato:false};
 assert.deepEqual(filtraOfficina([a,b],{query:'  TASKS.LIST '}),[a]);assert.deepEqual(filtraOfficina([a,b],{query:'scrittura di una nota',stato:'disabilitati'}),[b]);assert.deepEqual(filtraOfficina([a,b],{query:'resta da fare',stato:'abilitati'}),[a]);assert.deepEqual(filtraOfficina([a,b],{query:'salva-nota'}),[b]);assert.deepEqual(filtraOfficina([a,b]),[a,b]);
});
