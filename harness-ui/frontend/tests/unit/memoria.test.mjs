import test from 'node:test';
import assert from 'node:assert/strict';
import {genereMemoria,testiMemoria,filtraMemorie} from '../../src/components/memoria.js';
test('MEMORIA-GENERI: quattro generi veri, nessuno strato o privilegio inventato',()=>{
 assert.equal(genereMemoria('preference').testo,'Preferenza');assert.equal(genereMemoria('project_fact').testo,'Fatto');assert.equal(genereMemoria('procedure').testo,'Procedura');assert.equal(genereMemoria('policy_note').testo,'Regola');assert.equal(genereMemoria('semantic').testo,'Tipo non registrato');assert.equal(genereMemoria('__proto__').testo,'Tipo non registrato');
});
test('MEMORIA-TESTO-INTEGRO: conserva il contenuto e la vecchia anteprima, nessuna data finta',()=>{
 const contenuto='Prima riga.\n'+'Un fatto da conservare. '.repeat(10);const t=testiMemoria({titolo:'Preferenza',contenuto});assert.equal(t.contenuto,contenuto);assert.equal(t.anteprima.length,81);assert.equal(t.aggiornata,null);assert.equal(testiMemoria(null).titolo,'Ricordo senza titolo');
});
test('MEMORIA-RICERCA: titolo, contenuto intero, genere umano e intersezione',()=>{
 const dati=[{id:'a',titolo:'Preferenza',contenuto:'Risposte brevi',genere:'preference'},{id:'b',titolo:'Verifica',contenuto:'Controllare sempre le schermate',genere:'procedure'}];assert.deepEqual(filtraMemorie(dati,{query:' SCHERMATE '}).map(x=>x.id),['b']);assert.deepEqual(filtraMemorie(dati,{query:'procedura'}).map(x=>x.id),['b']);assert.deepEqual(filtraMemorie(dati,{query:'schermate',genere:'preference'}),[]);assert.equal(dati.length,2);
});
