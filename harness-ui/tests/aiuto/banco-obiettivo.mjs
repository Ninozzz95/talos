/*
 * /goal — il banco delle prove dell'obiettivo sul REGISTRO VERO (giornale su disco), per i file che ne hanno bisogno in due.
 * Il kernel è finto: ogni giro si conclude quando la prova lo dice. Nessun watcher, nessun server: classe A di BC-09 (a fine
 * prova non resta niente di aperto; la rimozione passa dall'aiuto che ritenta e avvisa).
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { createSessionRegistry } from '../../src/session-registry.mjs';
import { attendiScritture } from '../../src/session-store.mjs';
import { EVENTO_OBIETTIVO } from '../../src/obiettivo/stato.mjs';
import { cartellaDiProva } from './cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './rimuovi-cartella-di-prova.mjs';

export const passo = () => new Promise((r) => setImmediate(r));

export function registroAGiri(cartellaStore, opzioni = {}) {
  const giri = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    obiettiviNellaChat: true, // come il server desktop (`server.mjs`); chi prova il verso spento lo passa a false
    /* /goal G5: il giudice chiama il modello della sessione — in una prova MAI la rete. Chi lo vuole lo passa nelle opzioni. */
    chiediAlModelloUnaVoltaFn: async () => { throw new Error('banco del /goal: nessuna chiamata di rete al modello'); },
    /* G5: il confutatore di serie è una figlia vera; nel banco il «fatto» regge, e chi prova il confutatore lo passa */
    confutaObiettivoFn: async () => ({ esito: 'regge', motivo: 'banco del /goal' }),
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    avviaSessioneFn: (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      const n = giri.length + 1;
      giri.push({ input, concludi: (messaggiFinali) => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${n}` }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali } }); },
        /* G4: un giro che il fornitore fa fallire, col suo codice */
        fallisci: (codiceErrore, messaggiFinali) => { input.onEvento({ type: 'RunError', message: 'boom', code: codiceErrore }); risolvi({ ok: false, codiceErrore, esito: { comeFinita: 'fallito', messaggiFinali } }); } });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${n}`, input: input.task });
      return attesa;
    },
    ...opzioni,
  });
  return { registro, giri };
}

export async function conStore(t, corpo, prefisso = 'talos-obiettivo-') {
  const cartellaStore = cartellaDiProva(prefisso);
  t.after(async () => { await attendiScritture({ cartellaStore }).catch(() => {}); rimuoviCartellaDiProva(cartellaStore); });
  return corpo(cartellaStore);
}

/** Una conversazione col primo giro concluso: ferma, come quando la persona guarda la risposta. */
export async function conversazioneFerma({ registro, giri }) {
  const { sessionId } = registro.avvia('task-vero');
  giri.at(-1).concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'r1' }]);
  await passo();
  return sessionId;
}

export const righeDelGiornale = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));
export const righeObiettivo = (cartellaStore, sessionId) => righeDelGiornale(cartellaStore, sessionId).filter((r) => r.tipo === 'obiettivo');

export function ascolta(registro, sessionId) {
  const annunci = [];
  registro.iscriviti(sessionId, (e) => { if (e.type === 'CUSTOM' && e.name === EVENTO_OBIETTIVO) annunci.push(e.value); });
  return annunci;
}

export async function riavvia(cartellaStore, opzioni) {
  await attendiScritture({ cartellaStore });
  const nuovo = registroAGiri(cartellaStore, opzioni);
  await nuovo.registro.ripristina();
  return nuovo;
}

/**
 * Una conversazione già conclusa scritta a mano sul disco, nella forma che `ripristina()` legge (come `bc03-delega-visibile`):
 * con `extra` diventa una figlia (`padreId`), un passo di Workflow (`workflow`) o una sessione con un altro permesso.
 * (La stessa forma di `obiettivo-registro.test.mjs`, che ne tiene ancora una copia sua.)
 */
export function scriviSessione(cartellaStore, sessionId, extra = {}) {
  const righe = [
    {
      tipo: 'intestazione', schema: 1, sessionId, taskId: extra.padreId ? `delega:${extra.padreId}` : 'libero:obiettivo', cartella: cartellaStore,
      task: { consegna: 'Compito: prova', consegnaCorta: 'prova' }, comandoProva: null, forkDa: null, avviataAlle: '2026-10-14T09:00:00.000Z',
      modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium', mobile: false, permessi: 'Full access', permessiPerAttrezzo: null,
      padreId: null, profonditaDelega: 0, provider: 'cloud', runtimeId: null, modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true,
      ...extra,
    },
    { type: 'RunStarted', _sequenza: 1, threadId: sessionId, runId: 'r1' },
    { type: 'RunFinished', _sequenza: 2, threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } },
  ];
  writeFileSync(join(cartellaStore, `${sessionId}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
}

/** Tre criteri, uno per tipo, come li proporrebbe un modello: senza `id`. */
export const TRE_CRITERI = Object.freeze([
  { testo: 'The auth tests pass', verifica: { tipo: 'comando', comando: 'node --test tests/auth' } },
  { testo: 'The changelog names the fix', verifica: { tipo: 'file', percorso: 'docs/CHANGELOG.md', fatto: 'contiene', testo: 'login loop' } },
  { testo: 'The error message is clear to a person who is not a developer', verifica: { tipo: 'giudizio' } },
]);

/**
 * OB-REV-01 (15/10/2026): un obiettivo ATTIVO scritto sul giornale da un altro processo (lo stesso archivio, l'affitto), aggiunto in
 * coda come lo scrive il registro. La porta della persona lo rifiuta in un host senza obiettivi o senza nessuno davanti: chi prova il
 * CICLO in quei casi lo fa nascere così, e lo rilegge con `ripristina({ soloSessioni, perRicarica: true })` (resta attivo, GOAL-REG-09).
 */
export async function obiettivoScrittoDaUnAltroProcesso(cartellaStore, sessionId, testo = 'make the tests pass', { stato = 'attivo', motivo = null } = {}) {
  await attendiScritture({ cartellaStore });
  const adesso = new Date().toISOString();
  const riga = { tipo: 'obiettivo', obiettivo: { schema: 'talos.obiettivo.v1', id: `ob-${randomUUID()}`, testo, stato, motivo, creatoAlle: adesso, aggiornatoAlle: adesso, revisione: 1 } };
  appendFileSync(join(cartellaStore, `${sessionId}.jsonl`), `${JSON.stringify(riga)}\n`, 'utf8');
}
