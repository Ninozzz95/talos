import test from 'node:test';
import assert from 'node:assert/strict';
import { statoBoard, tempoBoard, testiBoard, cartellaDaExport, selezionaSessioniBoard } from '../../src/components/board.js';

test('B3-STATO-PRECEDENZA: attesa, interruzione, errore, esito assente', () => {
 assert.equal(statoBoard({conclusa:false,inAttesaApprovazione:true}).chiave,'attesa');
 assert.equal(statoBoard({conclusa:true,interrotta:true,ultimoEsito:'errore'}).chiave,'interrotto');
 assert.equal(statoBoard({conclusa:true,ultimoEsito:'errore'}).chiave,'errore');
 assert.equal(statoBoard({conclusa:true}).testo,'Conclusa · esito non registrato');
});
test('B3-METRICHE-ONESTE: giri della sessione, token totali, assenza diversa da zero', () => {
 const s={usage:{giri:9,prompt_tokens:89470,completion_tokens:2635}};
 const m={giri:1,cache:{percentuale:83},primoToken:{ms:null,motivoAssente:'Orario non registrato'},chiusura:{motivo:'fine-lavoro'}};
 const t=testiBoard(s,m);
 assert.equal(t.giri,'9'); assert.equal(t.token,'92,1k'); assert.equal(t.cache,'83%'); assert.equal(t.primo,'—'); assert.equal(t.chiusura,'fine lavoro');
 assert.equal(testiBoard({},{}).token,'—'); assert.equal(testiBoard({usage:{giri:0,prompt_tokens:0,completion_tokens:0}},{primoToken:{ms:0},cache:{percentuale:0}}).primo,'0,0 s');
 assert.equal(testiBoard({usage:{prompt_tokens:2}},{}).token,'—');
});
test('B3-FILTRI-ORDINE: intersezione e ordinamento numerico stabile senza mutazione',()=>{
 const s=[{sessionId:'a',nome:'Zeta',conclusa:true,ultimoEsito:'successo',usage:{prompt_tokens:20,completion_tokens:3},avviataAlle:'2026-09-01'}, {sessionId:'b',nome:'Alfa',conclusa:false,usage:{prompt_tokens:100,completion_tokens:2},avviataAlle:'2026-09-02'}, {sessionId:'c',nome:'Beta',conclusa:true,ultimoEsito:'errore'}];
 const cartelle={a:'C:/AVM',b:'C:/Altro'};
 assert.deepEqual(selezionaSessioniBoard(s,{stato:'successo',cartella:'C:/AVM',cartelle}).map(x=>x.sessionId),['a']);
 assert.deepEqual(selezionaSessioniBoard(s,{ordine:'token'}).map(x=>x.sessionId),['b','a','c']);
 assert.deepEqual(selezionaSessioniBoard(s,{ordine:'nome'}).map(x=>x.sessionId),['b','c','a']);
 assert.deepEqual(selezionaSessioniBoard(s,{cartella:'@assente',cartelle}).map(x=>x.sessionId),['c']);
 assert.deepEqual(s.map(x=>x.sessionId),['a','b','c']);
});
test('B3-CARTELLA-EXPORT: solo contesto RunStarted, ultimo dichiarato, nessun testo interpretato',()=>{
 assert.equal(cartellaDaExport({eventi:[{type:'RunStarted',contesto:{cartella:'C:/AVM'}},{type:'TextDelta',text:'cartella C:/FALSA'},{type:'RunStarted',contesto:{cartella:'C:/Altro'}}]}),'C:/Altro');
 assert.equal(cartellaDaExport({eventi:[{type:'RunStarted',contesto:{cartella:{path:'falso'}}}]}),null);
 assert.equal(cartellaDaExport(null),null);
});
test('B3-TEMPO: assenza, futuro, minuti, ieri e giorni, orologio esplicito',()=>{
 const ora=new Date('2026-09-04T18:11:00');
 assert.equal(tempoBoard(null,ora),'—'); assert.equal(tempoBoard('non-data',ora),'—');
 assert.equal(tempoBoard('2026-09-04T18:09:00',ora),'2 min fa');
 assert.equal(tempoBoard('2026-09-04T18:12:00',ora),'—');
 assert.equal(tempoBoard('2026-09-03T18:09:00',ora),'ieri');
 assert.equal(tempoBoard('2026-09-02T18:09:00',ora),'2 giorni fa');
});

test('B3-CACHE-COPERTURA: il conteggio originale resta visibile anche senza percentuale',()=>{
 const s={usage:{cached_tokens:74240}};
 assert.equal(testiBoard(s,{cache:{percentuale:83}}).cache,'83% · 74,2k');
 assert.equal(testiBoard(s,{}).cache,'— · 74,2k');
});
