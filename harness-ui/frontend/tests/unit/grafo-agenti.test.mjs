import test from 'node:test';
import assert from 'node:assert/strict';
import { modelloGrafoAgenti, layoutGrafoAgenti, telemetriaGrafoAgenti, attivitaNodoGrafo } from '../../src/components/grafo-agenti.js';

const scena = { corrente: { sessionId: 'madre', nome: 'Sessione', cartella: '/progetto', conclusa: false }, sessioni: [
  { sessionId: 'figlia', padreId: 'madre', nome: 'Prima delega', conclusa: false, cartella: '/progetto' },
  { sessionId: 'nipote', padreId: 'figlia', nome: 'Seconda delega', conclusa: true, cartella: '/progetto' },
  { sessionId: 'ramo', forkDa: 'madre', nome: 'Ramo', conclusa: true, cartella: '/progetto' },
  { sessionId: 'altro', nome: 'Altro progetto', cartella: '/altro' },
], figli: [{ sessionId: 'figlia', taskCorto: 'Titolo aggiornato', conclusa: true }] };

test('RIPRESA-GRAFO-DATI — identità, relazioni e snapshot children prevalgono senza fixture implicite', () => {
  const g = modelloGrafoAgenti(scena);
  assert.deepEqual(g.nodi.map(n => n.id).sort(), ['figlia', 'madre', 'nipote', 'ramo']);
  assert.equal(g.nodi.find(n => n.id === 'figlia').nome, 'Titolo aggiornato');
  assert.equal(g.nodi.find(n => n.id === 'figlia').stato, 'done');
  assert.deepEqual(g.archi.map(e => [e.da, e.a, e.tipo]), [['madre', 'figlia', 'delega'], ['figlia', 'nipote', 'delega'], ['madre', 'ramo', 'ramo']]);
});
test('RIPRESA-GRAFO-CONFINI — workspace, filtri e collasso non inventano collegamenti', () => {
  assert.equal(modelloGrafoAgenti(scena, { ambito: 'workspace' }).nodi.some(n => n.id === 'altro'), false);
  assert.deepEqual(modelloGrafoAgenti(scena, { query: 'seconda' }).nodi.map(n => n.id), ['nipote']);
  assert.equal(modelloGrafoAgenti(scena, { query: 'seconda' }).archi.length, 0);
  assert.deepEqual(modelloGrafoAgenti(scena, { collassati: ['figlia'] }).nodi.map(n => n.id).sort(), ['figlia', 'madre', 'ramo']);
});
test('RIPRESA-GRAFO-CICLI — dati ripetuti, cicli e parent assente non bloccano il layout', () => {
  const g = modelloGrafoAgenti({ corrente: { sessionId: 'a' }, sessioni: [{ sessionId: 'b', padreId: 'a' }, { sessionId: 'a', padreId: 'b' }, { sessionId: 'b', padreId: 'a' }, { sessionId: '', padreId: 'a' }, null] });
  assert.equal(g.nodi.length, 2);
  const l = layoutGrafoAgenti(g);
  assert.equal(l.nodi.length, 2);
  assert.ok(l.nodi.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
});
test('RIPRESA-GRAFO-DAGRE — upstream reale dispone 200 nodi senza sovrapposizioni', () => {
  const figli = Array.from({ length: 199 }, (_, i) => ({ sessionId: `n${i}`, taskCorto: `Agente ${i}`, conclusa: true }));
  const l = layoutGrafoAgenti(modelloGrafoAgenti({ corrente: { sessionId: 'root' }, figli }));
  assert.equal(l.nodi.length, 200);
  assert.equal(l.archi.length, 199);
  for (let i = 0; i < l.nodi.length; i++) for (let j = i + 1; j < l.nodi.length; j++) {
    const a = l.nodi[i], b = l.nodi[j];
    assert.ok(Math.abs(a.x - b.x) >= a.width || Math.abs(a.y - b.y) >= a.height, `sovrapposti ${a.id}, ${b.id}`);
  }
});

test('R4-GRAPH-5000-BOUNDED: a visible page stays small while the total remains truthful', () => {
  const figli = Array.from({ length: 4_999 }, (_, i) => ({
    sessionId: `agent-${i}`, taskCorto: `Agente ${i}`, conclusa: i % 2 === 0,
  }));
  const data = { corrente: { sessionId: 'root', conclusa: false }, figli };
  const first = modelloGrafoAgenti(data, { offset: 0, limit: 14 });
  const second = modelloGrafoAgenti(data, { offset: 14, limit: 14 });
  assert.equal(first.totale, 5_000);
  assert.equal(first.totaleFiltrati, 5_000);
  assert.equal(first.nodi.length, 14);
  assert.equal(second.nodi.length, 14);
  assert.notEqual(first.nodi[0].id, second.nodi[0].id);
  assert.ok(first.archi.length <= 13);
});

test('RIPRESA-GRAFO-TELEMETRIA — misure reali, copertura parziale e file distinti', () => {
 const dati = { corrente: { sessionId:'p', conclusa:false }, figli:[
 {sessionId:'a',conclusa:false,attivita:{chiamate:4,file:[{percorso:'src/a',scritto:true}],fileTagliati:2,passi:[]}},
 {sessionId:'b',conclusa:true,attivita:{chiamate:2,file:[{percorso:'src/a',scritto:true},{percorso:'src/b',letto:true}],passi:[]}},
 ] };
 const t=telemetriaGrafoAgenti(modelloGrafoAgenti(dati));
 assert.equal(t.totale,3); assert.equal(t.active,2); assert.equal(t.done,1);
 assert.equal(t.chiamate,6);assert.equal(t.copertura,2);assert.equal(t.file,2);assert.equal(t.scritti,1);assert.equal(t.parziale,true);
 assert.equal(telemetriaGrafoAgenti(modelloGrafoAgenti({corrente:{sessionId:'x'}})).chiamate,null);
});
test('RIPRESA-GRAFO-ATTESA — approvazione e fallimento non diventano lavoro o successo',()=>{
 const g=modelloGrafoAgenti({corrente:{sessionId:'p'},figli:[{sessionId:'a',conclusa:false,inAttesaApprovazione:1},{sessionId:'b',conclusa:true,ultimoEsito:'errore'}]});
 assert.equal(g.nodi.find(n=>n.id==='a').stato,'waiting');assert.equal(g.nodi.find(n=>n.id==='b').stato,'error');
});
test('RIPRESA-GRAFO-TEMPI — durata conclusa stabile e timestamp assente mai inventato',()=>{
 const a={conclusa:true,avviataAlle:'2026-09-19T10:00:00Z',attivita:{chiamate:1,file:[],passi:[{tipo:'fine',quando:'2026-09-19T10:01:00Z'}]}};
 assert.equal(attivitaNodoGrafo(a,Date.parse('2026-09-19T12:00:00Z')).durataMs,60000);
 assert.equal(attivitaNodoGrafo({...a,attivita:null}).durataMs,null);
 assert.equal(attivitaNodoGrafo({conclusa:false,avviataAlle:'domani'}).durataMs,null);
});

test('RIPRESA-GRAFO-CONSUMO — somma sessioni senza inventare campi mancanti o costi',()=>{
 const g=modelloGrafoAgenti({corrente:{sessionId:'p',usageSessione:{prompt_tokens:100,completion_tokens:20}},figli:[{sessionId:'a',usageSessione:null},{sessionId:'b',usageSessione:{prompt_tokens:50,completion_tokens:10}}]});
 const t=telemetriaGrafoAgenti(g);assert.equal(t.token,180);assert.equal(t.coperturaToken,2);assert.equal(t.costo,null);
 const n=attivitaNodoGrafo({usageSessione:{prompt_tokens:3}});assert.equal(n.token,null);
});

test('RIPRESA-GRAFO-ESITO — narrazione non e stato, stop non e errore',()=>{
 const g=modelloGrafoAgenti({corrente:{sessionId:'p'},figli:[{sessionId:'a',conclusa:true,esitoDelega:'Nessun errore nei test'},{sessionId:'b',conclusa:true,ultimoEsito:'errore',motivoChiusura:'fermata'}]});
 assert.equal(g.nodi.find(n=>n.id==='a').stato,'done');assert.equal(g.nodi.find(n=>n.id==='b').stato,'interrupted');
});

test('RIPRESA-GRAFO-OPERAZIONE — fase reale tipizzata senza testo esterno',()=>{
 assert.equal(attivitaNodoGrafo({conclusa:false,operazioneCorrente:{kind:'reasoning',status:'running',label:'falso'}}).operazione,'Ragionamento in corso');
 assert.equal(attivitaNodoGrafo({conclusa:false,operazioneCorrente:{kind:'response',status:'running'}}).operazione,'Risposta in corso');
 assert.equal(attivitaNodoGrafo({conclusa:true,operazioneCorrente:{kind:'response',status:'running'}}).operazione,null);
 assert.equal(attivitaNodoGrafo({conclusa:false,operazioneCorrente:{kind:'response',status:'completed'}}).operazione,null);
});

/* 02/10/2026 — un record di attrezzo della cronologia porta i soli contatori: il nodo dice quanti file, la sintesi lo dichiara parziale. */
test('GRAFO-NODO-COMPATTO: contatori senza elenco ⇒ numero di file nel nodo, sintesi dei file parziale', () => {
  const compatto = { sessionId: 'figlia', avviataAlle: '2026-10-02T08:00:00Z', attivita: { compatta: true, chiamate: 70, numeroFile: 70, attrezzoCorrente: null,
    passi: [{ tipo: 'attrezzo', attrezzo: 'leggi', percorso: 'src/f69.mjs', quando: '2026-10-02T08:05:00Z' }], passiTagliati: 140 } };
  const a = attivitaNodoGrafo(compatto, Date.parse('2026-10-02T08:06:00Z'));
  assert.equal(a.file, null);
  assert.equal(a.numeroFile, 70);
  assert.equal(a.chiamate, 70);
  assert.equal(a.ultimo.percorso, 'src/f69.mjs');
  const t = telemetriaGrafoAgenti({ nodi: [{ stato: 'active', dati: compatto }] });
  assert.equal(t.chiamate, 70);
  assert.equal(t.file, null, 'senza elenchi la sintesi non inventa un conteggio di file unici');
  assert.equal(t.parziale, true);
});

// C3 tappa 4 (owner 09/10): una figlia in pausa chiude il turno con un RunError «in-pausa» (`ultimoEsito:'errore'`): nel diagramma
// è «paused», mai «error» né «done»; e al contrario una fallita vera resta «error».
test('C3-GRAFO-PAUSA — paused is its own state, never error or done', () => {
  const g = modelloGrafoAgenti({ corrente: { sessionId: 'p' }, figli: [
    { sessionId: 'a', conclusa: true, ultimoEsito: 'errore', esitoDelega: 'in-pausa', motivoChiusura: 'in-pausa' },
    { sessionId: 'b', conclusa: true, ultimoEsito: 'errore', esitoDelega: 'fallito', motivoChiusura: 'errore' },
  ] });
  assert.equal(g.nodi.find((n) => n.id === 'a').stato, 'paused');
  assert.equal(g.nodi.find((n) => n.id === 'b').stato, 'error');
});
