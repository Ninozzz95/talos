import test from 'node:test';
import assert from 'node:assert/strict';
import { creaCronologiaGrafo } from '../../src/components/cronologia-grafo.js';
const record = (seq, id='root', at=seq*1000) => ({schema:'talos.agent-timeline.v1',rootId:'root',seq,at:new Date(at).toISOString(),event:'ToolCallStart',node:{sessionId:id,padreId:id==='root'?null:'root',conclusa:false,attivita:{chiamate:seq}}});
test('RIPRESA-REPLAY-SEEK: prima nascita senza figli futuri, oltre120 e ritorno deterministico',()=>{
 const h=creaCronologiaGrafo('root');h.aggiungi([record(1),record(2,'child'),...Array.from({length:130},(_,i)=>record(i+3,'child'))]);
 assert.equal(h.length,132);assert.equal(h.frame(0).dati.sessioni.length,1);
 const last=h.frame(131); assert.equal(last.dati.sessioni.find(n=>n.sessionId==='child').attivita.chiamate,132);
 h.frame(0);assert.deepEqual(h.frame(131),last);assert.equal(h.frame(1).quando,2000);
});
test('RIPRESA-REPLAY-ORDINE: duplicati innocui, buchi dichiarati e pagina incoerente atomica',()=>{
 const h=creaCronologiaGrafo('root');h.aggiungi([record(1),record(2)]);h.aggiungi([record(1),record(2)]);assert.equal(h.length,2);
 assert.throws(()=>h.aggiungi([record(3),{...record(4),schema:'unknown'}]));assert.equal(h.length,2);
 h.aggiungi([record(4)]);assert.equal(h.partial,true);assert.equal(h.lastSeq,4);
 assert.throws(()=>h.aggiungi([{...record(4),node:{sessionId:'other'}}]));
});
test('RIPRESA-REPLAY-CLOCK: regressione ora di sistema non inverte il tempo del player',()=>{
 const h=creaCronologiaGrafo('root');h.aggiungi([record(1,'root',4000),record(2,'child',3000),record(3,'child',5000)]);
 assert.equal(h.frame(1).quando,4000);assert.equal(h.frame(2).quando,5000);
});

test('RIPRESA-REPLAY-PAGINE-CONTIGUE: una pagina successiva non è un buco',()=>{const h=creaCronologiaGrafo('root');h.aggiungi([record(1),record(2)]);h.aggiungi([record(3)]);assert.equal(h.partial,false);});
