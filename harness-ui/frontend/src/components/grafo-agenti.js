/*
 * Il MODELLO degli agenti di una conversazione: chi c'è (la conversazione, i suoi agenti, i loro), in che stato, e chi ha avviato
 * chi. Lo usa il pannello Agenti (`app.js`, `agentiPerInspector`).
 * ⛔ Fino al 14/10/2026 questo file era anche la VISTA CLASSICA del diagramma delle deleghe (`montaGrafoAgenti`, col suo layout
 * dagre, la sua telemetria e la sua cronologia). È stata tolta: le deleghe stanno sul diagramma del Workflow (`grafo-workflow.js`
 * con l'adattatore `grafo/run-dalle-deleghe.js`), dove tutto ciò che la classica faceva è stato portato (owner 13/10/2026).
 */
import { t as tr } from './lingua.js';
import { nomeBreve, nomeDellAgente } from './grafo/run-dalle-deleghe.js'; // L3-17: il nome dell'agente, una funzione sola

const idValido = v => typeof v === 'string' && v.length > 0 && v.length <= 2048;
function stato(a) {
  if (a.interrotta === true || a.motivoChiusura === 'fermata') return 'interrupted';
  if (a.esitoDelega === 'in-pausa' || a.motivoChiusura === 'in-pausa') return 'paused'; // C3 tappa 4
  if (a.conclusa === true) return ['errore', 'error', 'fallito', 'failed', 'rifiutato'].includes(a.ultimoEsito || a.esitoDelega) ? 'error' : 'done';
  if (a.approvalPendingCount > 0 || a.inAttesaApprovazione > 0 || a.inAttesaApprovazione === true) return 'waiting';
  return a.conclusa === false ? 'active' : 'unknown';
}

/** Adapter TALOS: nessuna dipendenza o relazione ricavata dal testo del compito. */
export function modelloGrafoAgenti({ corrente = {}, sessioni = [], figli = [] } = {}, opzioni = {}) {
  const mappa = new Map();
  for (const a of sessioni) if (idValido(a?.sessionId)) mappa.set(a.sessionId, { ...a });
  if (idValido(corrente.sessionId)) mappa.set(corrente.sessionId, { ...mappa.get(corrente.sessionId), ...corrente });
  for (const a of figli) if (idValido(a?.sessionId) && a.sessionId !== corrente.sessionId) {
    mappa.set(a.sessionId, { ...mappa.get(a.sessionId), ...a, padreId: corrente.sessionId });
  }
  const archi = [];
  for (const a of mappa.values()) for (const [campo, tipo] of [['padreId', 'delega'], ['forkDa', 'ramo']]) {
    if (a[campo] !== a.sessionId && mappa.has(a[campo])) archi.push({ da: a[campo], a: a.sessionId, tipo });
  }
  const adiacenze = new Map();
  const numeroFigli = new Map();
  for (const a of archi) {
    if (!adiacenze.has(a.da)) adiacenze.set(a.da, []);
    adiacenze.get(a.da).push(a.a);
    numeroFigli.set(a.da, (numeroFigli.get(a.da) || 0) + 1);
  }
  const discendenti = radici => {
    const visitati = new Set(radici), coda = [...radici];
    for (let i = 0; i < coda.length; i++) for (const id of adiacenze.get(coda[i]) || []) {
      if (!visitati.has(id)) { visitati.add(id); coda.push(id); }
    }
    return visitati;
  };
  const inclusi = opzioni.ambito === 'workspace' && corrente.cartella
    ? new Set([...mappa.values()].filter(a => a.cartella === corrente.cartella).map(a => a.sessionId).concat([...discendenti([corrente.sessionId])]))
    : discendenti([corrente.sessionId]);
  const nascosti = new Set();
  for (const id of opzioni.collassati || []) for (const disc of discendenti([id])) if (disc !== id) nascosti.add(disc);
  const query = String(opzioni.query || '').trim().toLocaleLowerCase();
  const isolati = opzioni.isolato ? discendenti([opzioni.isolato]) : null;
  const filtrati = [...mappa.values()].filter(a => inclusi.has(a.sessionId) && !nascosti.has(a.sessionId) && (!isolati || isolati.has(a.sessionId))).map(a => ({
    id: a.sessionId, nome: nomeDellAgente(a) || nomeBreve(a.taskDelega || '') || tr('agenti.delegations.untitledSession'), // L3-17: una funzione sola
    stato: stato(a), dati: a, figli: numeroFigli.get(a.sessionId) || 0,
  })).filter(n => (!query || `${n.nome} ${n.dati.taskCorto || ''} ${n.dati.modello || ''}`.toLocaleLowerCase().includes(query)) && (!opzioni.stato || opzioni.stato === 'all' || n.stato === opzioni.stato));
  const offset = Number.isSafeInteger(opzioni.offset) && opzioni.offset > 0 ? opzioni.offset : 0;
  const limit = Number.isSafeInteger(opzioni.limit) && opzioni.limit > 0 ? Math.min(opzioni.limit, 100) : null;
  const nodi = limit == null ? filtrati : filtrati.slice(offset, offset + limit);
  const presenti = new Set(nodi.map(n => n.id));
  return { nodi, archi: archi.filter(a => presenti.has(a.da) && presenti.has(a.a)),
    totale: inclusi.size, totaleFiltrati: filtrati.length, offset, limit };
}
