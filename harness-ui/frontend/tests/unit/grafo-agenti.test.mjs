import test from 'node:test';
import assert from 'node:assert/strict';
import { modelloGrafoAgenti } from '../../src/components/grafo-agenti.js';

/* 14/10/2026 — la vista classica del diagramma delle deleghe è stata tolta: qui restano le prove del MODELLO (lo usa il pannello
   Agenti). Layout, telemetria e attività del nodo erano della vista: i loro fatti sul diagramma nuovo li provano
   `grafo-attivita.test.mjs` (che cosa fa adesso, conti, totali coi file distinti) e `run-dalle-deleghe.test.mjs` (stati, durate). */

const scena = { corrente: { sessionId: 'madre', nome: 'Sessione', cartella: '/progetto', conclusa: false }, sessioni: [
  { sessionId: 'figlia', padreId: 'madre', nome: 'Prima delega', conclusa: false, cartella: '/progetto' },
  { sessionId: 'nipote', padreId: 'figlia', nome: 'Seconda delega', conclusa: true, cartella: '/progetto' },
  { sessionId: 'ramo', forkDa: 'madre', nome: 'Ramo', conclusa: true, cartella: '/progetto' },
  { sessionId: 'altro', nome: 'Altro progetto', cartella: '/altro' },
], figli: [{ sessionId: 'figlia', taskCorto: 'Titolo aggiornato', conclusa: true }] };

test('RIPRESA-GRAFO-DATI — identità, relazioni e snapshot children prevalgono senza fixture implicite', () => {
  const g = modelloGrafoAgenti(scena);
  assert.deepEqual(g.nodi.map(n => n.id).sort(), ['figlia', 'madre', 'nipote', 'ramo']);
  // L3-17 (owner 16/10/2026, «un nome solo ovunque»): il nome è quello della BARRA, non il compito di `children`
  assert.equal(g.nodi.find(n => n.id === 'figlia').nome, 'Prima delega');
  // e quando `children` porta il suo `nome` (il server dal 16/10), vince quello
  const conNome = modelloGrafoAgenti({ ...scena, figli: [{ sessionId: 'figlia', nome: 'Prima delega-2', taskCorto: 'Titolo aggiornato', conclusa: true }] });
  assert.equal(conNome.nodi.find(n => n.id === 'figlia').nome, 'Prima delega-2');
  assert.equal(g.nodi.find(n => n.id === 'figlia').stato, 'done');
  assert.deepEqual(g.archi.map(e => [e.da, e.a, e.tipo]), [['madre', 'figlia', 'delega'], ['figlia', 'nipote', 'delega'], ['madre', 'ramo', 'ramo']]);
});
test('RIPRESA-GRAFO-CONFINI — workspace, filtri e collasso non inventano collegamenti', () => {
  assert.equal(modelloGrafoAgenti(scena, { ambito: 'workspace' }).nodi.some(n => n.id === 'altro'), false);
  assert.deepEqual(modelloGrafoAgenti(scena, { query: 'seconda' }).nodi.map(n => n.id), ['nipote']);
  assert.equal(modelloGrafoAgenti(scena, { query: 'seconda' }).archi.length, 0);
  assert.deepEqual(modelloGrafoAgenti(scena, { collassati: ['figlia'] }).nodi.map(n => n.id).sort(), ['figlia', 'madre', 'ramo']);
});
test('RIPRESA-GRAFO-CICLI — dati ripetuti, cicli e parent assente non rompono il modello', () => {
  const g = modelloGrafoAgenti({ corrente: { sessionId: 'a' }, sessioni: [{ sessionId: 'b', padreId: 'a' }, { sessionId: 'a', padreId: 'b' }, { sessionId: 'b', padreId: 'a' }, { sessionId: '', padreId: 'a' }, null] });
  assert.equal(g.nodi.length, 2);
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

test('RIPRESA-GRAFO-ATTESA — approvazione e fallimento non diventano lavoro o successo',()=>{
 const g=modelloGrafoAgenti({corrente:{sessionId:'p'},figli:[{sessionId:'a',conclusa:false,inAttesaApprovazione:1},{sessionId:'b',conclusa:true,ultimoEsito:'errore'}]});
 assert.equal(g.nodi.find(n=>n.id==='a').stato,'waiting');assert.equal(g.nodi.find(n=>n.id==='b').stato,'error');
});
test('RIPRESA-GRAFO-ESITO — narrazione non e stato, stop non e errore',()=>{
 const g=modelloGrafoAgenti({corrente:{sessionId:'p'},figli:[{sessionId:'a',conclusa:true,esitoDelega:'Nessun errore nei test'},{sessionId:'b',conclusa:true,ultimoEsito:'errore',motivoChiusura:'fermata'}]});
 assert.equal(g.nodi.find(n=>n.id==='a').stato,'done');assert.equal(g.nodi.find(n=>n.id==='b').stato,'interrupted');
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
