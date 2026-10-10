/*
 * ⭐ C3b (owner 09/10/2026 sera, `decisioni-owner-c3b-avvio-automatico-09-10`) — l'AVVIO DA SOLO di un Workflow proposto dal modello,
 *   quando la Coordinazione della sessione è accesa. Il registro decide SE (Coordinazione `sempre`, non in Piano, i passi nel
 *   tetto dei 20); qui si FA, con la STESSA porta della persona: `approveWorkflowProposal` (congela versione e impronta, F3
 *   decisione 5) e poi `startWorkflowRun` (il comando d'avvio, durevole e idempotente), poi si sveglia lo scheduler — la sequenza
 *   esatta della rotta HTTP di «Avvia» (`http-app.mjs`, «lo scheduler lavora DOPO la risposta»). Nessuna regola di dominio nuova.
 * Come Hermes: un task creato da un agente nasce `ready` e il dispatcher lo fa partire (`hermes_cli/kanban_db.py:1272`); la
 *   revisione umana è l'eccezione (`triage`, `tools/kanban_tools_schemas.py:431`), qui la Coordinazione spenta.
 */
import { randomUUID } from 'node:crypto';
import { approveWorkflowProposal } from './planning-control.mjs';
import { startWorkflowRun } from './run-control.mjs';
import { readDefinition } from './store.mjs';

/**
 * @param {{ store: object, sessionExistsFn: (id: string) => boolean, runtimeFn: () => ({ scheduler: { sveglia: (runId: string) => void } } | null) }} deps
 * @returns {(input: { sessionId: string, workflowId: string, version: number, definitionHash: string, prenota: (passi: number) => boolean })
 *   => Promise<{ avviato: true, runId: string, passi: number } | { avviato: false, motivo: string, passi?: number }>}
 */
export function creaAvvioDaSolo({ store, sessionExistsFn, runtimeFn, commandIdFn = randomUUID } = {}) {
  return async function avviaDaSolo({ sessionId, workflowId, version, definitionHash, prenota } = {}) {
    const runtime = typeof runtimeFn === 'function' ? runtimeFn() : null;
    // un run avviato che nessuno esegue sarebbe un avvio finto (la stessa regola del 503 della rotta «Avvia»)
    if (!runtime?.scheduler) return { avviato: false, motivo: 'runtime' };
    const record = await readDefinition(store, { workflowId, version });
    if (record.proposal?.initiatingSessionId !== sessionId) return { avviato: false, motivo: 'non-della-sessione' };
    const passi = Array.isArray(record.core?.nodes) ? record.core.nodes.length : 0;
    if (passi < 1 || typeof prenota !== 'function' || !prenota(passi)) return { avviato: false, motivo: 'tetto', passi };
    await approveWorkflowProposal(store, { workflowId, version, definitionHash, commandId: commandIdFn() }, { sessionExistsFn });
    const avvio = await startWorkflowRun(store, { workflowId, version, definitionHash, commandId: commandIdFn() },
      { sessionExistsFn, supportedNodeKinds: ['agent'] });
    runtime.scheduler.sveglia(avvio.runId);
    return { avviato: true, runId: avvio.runId, passi };
  };
}
