import { createHash } from 'node:crypto';

import { separaFonteModello } from '../../model-destination.mjs';

/*
 * ⭐ F3-32 (25/09/2026) — l'ADATTATORE dei passi agente di un Workflow: un passo diventa una sessione TALOS in sola lettura,
 *   legata alla sua attività. Contratto: `.claude/LEDGER-F3-32-CONTRATTO-SESSIONI-ATTIVITA-2026-09-25.md`.
 *
 * - execute: consegna = il compito del passo più i risultati dei passi da cui dipende (decisione owner «Sì, come Hermes»:
 *   Hermes `hermes_cli/kanban_db.py:4110-4150`, «Parent task results», istantanee con l'età e l'invito a riverificare);
 *   la sessione nasce da `avviaSessioneDiPasso` (sola lettura, nessuna domanda, cartella scelta dalla madre); i fatti
 *   `agent_session_created` e `agent_session_finished` vanno nel giornale del Workflow; l'esito si restituisce solo quando
 *   il terminale della sessione è nel suo file (la promessa `fine` del registro).
 * - reconcile (dopo un crollo): la sessione si ritrova per il legame nell'intestazione. Finita bene ma coi risultati non
 *   ancora pubblicati nel registro del Workflow ⇒ `still_unknown`, non «completato senza risultato»: la risposta non c'è,
 *   e un passo in sola lettura si può rifare (lo decide lo scheduler, F3-41). Nessuna sessione ⇒ `proved_not_performed`.
 * - cancel: ferma la sessione e aspetta la sua fine.
 * Il consumo misura sette dimensioni (RP §8.7): token, richieste e attrezzi dai fatti persistiti della sessione, il tempo
 *   col cronometro dell'adattatore; il costo è ignoto (`null`) se una richiesta non lo dichiara, mai zero.
 */
export const AGENT_SESSION_ADAPTER_ID = 'talos.agent-session.v1';
const SUMMARY_MAX = 4_096;

function sha256(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/**
 * La consegna di un passo: il compito approvato e, se il passo dipende da altri, i loro risultati
 * come istantanee. `runId` (F-014, piano 0.1.19 §1.6) serve alla FRASE del moncone: quando il
 * risultato è troncato, il figlio non vede solo il taglio — vede la STRADA per l'output intero
 * (`workflow_output(runId, nodeId)`). Assente (prove, contesti senza run): la riga resta quella di
 * sempre, byte per byte.
 */
export function consegnaDelPasso(step, predecessors = { items: [], omitted: 0 }, { runId = null } = {}) {
  const righe = [String(step.instructions ?? step.label ?? '').trim()];
  const items = Array.isArray(predecessors?.items) ? predecessors.items : [];
  if (items.length > 0) {
    righe.push('', '## Results of the steps this one depends on',
      '_Snapshots taken when each step finished. They are not live state: if one drives your work and is not recent, verify it against the source first._');
    for (const item of items) {
      righe.push('', `### ${item.label} (${item.nodeId})${item.completedAt ? ` — finished ${item.completedAt}` : ''}`);
      if (item.state !== 'succeeded') righe.push(`(this step did not succeed: ${item.state})`);
      else if (!item.results?.length) righe.push('(no result recorded)');
      for (const result of item.results ?? []) {
        righe.push(result.summary);
        if (result.truncated) {
          righe.push(runId
            ? `[truncated: the full result is ${result.bytes} bytes — read it with workflow_output(${JSON.stringify(runId)}, ${JSON.stringify(item.nodeId)})]`
            : `[truncated: the full result is ${result.bytes} bytes]`);
        }
      }
    }
    if (predecessors.omitted > 0) righe.push('', `(${predecessors.omitted} more steps this one depends on are not shown.)`);
  }
  return righe.join('\n');
}

/*
 * ⭐ F3-41a (25/09/2026) — la CLASSE del guasto di una sessione nel vocabolario del catalogo (`activity_failed.errorClass`,
 *   WORKFLOW-EVENT-CATALOG §6, contract.mjs:993) e se il passo si può rifare. Le classi sono quelle del kernel
 *   (`classificaErroreDiCorsa`, research-orchestrator.mjs:812), portate nel `RunError` da agent-service.
 *   - ritentabili solo i guasti TRANSITORI del fornitore o della rete: traffico (429), guasto del fornitore (5xx), rete,
 *     flusso interrotto, timeout del fornitore — quest'ultimo è `transient_network`: l'enum di `activity_failed` non ha
 *     `timeout`, che in `RETRY_REASONS` è la scadenza dell'ATTIVITÀ, un'altra cosa;
 *   - `PROVIDER_NETWORK_ERROR` porta un messaggio italiano che la tabella non riconosce: si legge dal codice;
 *   - credenziale, credito, contesto, richiesta non valida: non si ritentano (rifarli dà lo stesso errore, e il credito costa);
 *   - tutto il resto (`giri-esauriti`, `ignoto`…) è `internal`, non ritentabile: si comporta come prima di F3-41a.
 */
const CLASSI_DEL_GUASTO = Object.freeze({
  traffico: ['rate_limit', true],
  'guasto-fornitore': ['provider_5xx', true],
  rete: ['transient_network', true],
  'flusso-interrotto': ['transient_network', true],
  'timeout-fornitore': ['transient_network', true],
  credenziale: ['auth', false],
  credito: ['quota_hard', false],
  contesto: ['context_overflow', false],
  'richiesta-non-valida': ['model_invalid', false],
  /* ⛔ 25/09/2026 notte — la risposta vuota ARRIVA dopo la scala del kernel (una spinta, due ritentativi): rifare il passo
     ripagherebbe lo stesso vuoto. Detta esplicita: prima finiva qui come `flusso-interrotto`, cioè ritentabile per errore. */
  'risposta-vuota': ['internal', false],
});

export function classeDelFallimento({ classeErrore = null, codiceErrore = null } = {}) {
  if (codiceErrore === 'PROVIDER_NETWORK_ERROR') return { errorClass: 'transient_network', retryable: true };
  const [errorClass, retryable] = CLASSI_DEL_GUASTO[classeErrore] ?? ['internal', false];
  return { errorClass, retryable };
}

function legameDa(ctx) {
  return { runId: ctx.runId, nodeId: ctx.nodeId, activityExecutionId: ctx.activityExecutionId, attempt: ctx.attempt,
    leaseId: ctx.leaseId, leaseEpoch: ctx.leaseEpoch };
}

function fornitoreDi(modello) {
  try { return separaFonteModello(modello)?.fonte ?? null; } catch { return null; }
}

/**
 * @param {{sessions: {avviaSessioneDiPasso: Function, leggiEsitoSessioneDiPasso: Function, trovaSessioneDiPasso: Function, ferma: Function},
 *   nowMsFn?: Function}} deps
 */
export function createAgentSessionAdapter({ sessions, nowMsFn = () => Date.now() } = {}) {
  if (!sessions || typeof sessions.avviaSessioneDiPasso !== 'function' || typeof sessions.leggiEsitoSessioneDiPasso !== 'function'
    || typeof sessions.trovaSessioneDiPasso !== 'function' || typeof sessions.ferma !== 'function') {
    throw Object.assign(new Error('agent-session adapter needs the session registry bridge'), { code: 'WORKFLOW_ADAPTER_INVALID' });
  }
  const attivi = new Map();

  function forme(v2) {
    return {
      fallito: (errorClass, receiptRef = null, actualUsage = null, retryable = false) => ({ status: 'failed', errorClass, retryable,
        evidenceResultIds: [], ...(v2 ? { receiptRef, actualUsage } : {}) }),
      incerto: (reasonClass, observedReceiptRef = null) => ({ status: 'uncertain', reasonClass, observedReceiptRef,
        ...(v2 ? { actualUsage: null } : {}) }),
    };
  }

  async function execute(ctx) {
    const v2 = ctx.outcomeSchemaVersion === 2;
    const { fallito, incerto } = forme(v2);
    const step = ctx.step;
    if (step?.kind !== 'agent' || step.capabilityProfile !== 'read') return fallito('validation');
    const modelloChiesto = step.modelPolicy?.mode === 'explicit' ? step.modelPolicy.model : (ctx.run?.sessionModel ?? null);
    const consegna = consegnaDelPasso(step, ctx.predecessors, { runId: ctx.run?.runId ?? null }); // F-014 (§1.6): la FRASE del moncone nomina il run
    const inizio = nowMsFn();
    const avvio = sessions.avviaSessioneDiPasso({ legame: legameDa(ctx), rootSessionId: ctx.run?.rootSessionId ?? null,
      consegna, titolo: step.label, modello: modelloChiesto });
    if (!avvio || avvio.erroreAvvio) {
      return fallito(avvio?.code === 'WORKFLOW_ROOT_SESSION_NOT_FOUND' || avvio?.code === 'QUERY_INVALID' ? 'validation' : 'internal');
    }
    const { sessionId } = avvio;
    attivi.set(ctx.activityExecutionId, { sessionId, fine: avvio.fine });
    try {
      const modello = avvio.modello ?? modelloChiesto;
      await ctx.recordSessionFact('agent_session_created', {
        sessionId, provider: fornitoreDi(modello), model: modello, capabilityProfile: 'read', workspaceLeaseId: null,
      });
      let esito;
      try { esito = await avvio.fine; }
      catch { return incerto('receipt_missing', `talos-session:${sessionId}`); }
      const receiptRef = `talos-session:${sessionId}#${esito.sequenzaTerminale}`;
      const actualUsage = v2 ? {
        promptTokens: esito.consumo.promptTokens, completionTokens: esito.consumo.completionTokens,
        wallMs: Math.max(0, Math.round(nowMsFn() - inizio)), agentSeconds: Math.max(0, Math.ceil((nowMsFn() - inizio) / 1000)),
        toolCalls: esito.consumo.toolCalls, modelRequests: esito.consumo.modelRequests, knownCostUsd: esito.consumo.knownCostUsd,
      } : undefined;
      await ctx.recordSessionFact('agent_session_finished', { sessionId, outcome: esito.esito, resultIds: [] });
      if (esito.esito === 'cancelled') return fallito('cancelled', receiptRef, actualUsage ?? null);
      // ⛔ il codice da solo non dice la classe (PROVIDER_REQUEST_ERROR copre anche il 429): la dice la classe del kernel (F3-41a)
      if (esito.esito !== 'succeeded') {
        const { errorClass, retryable } = classeDelFallimento(esito);
        return fallito(errorClass, receiptRef, actualUsage ?? null, retryable);
      }
      const bytes = Buffer.from(esito.testoFinale, 'utf8');
      return {
        status: 'completed', receiptRef,
        results: [{
          kind: 'text', contentType: 'text/markdown', bytes: new Uint8Array(bytes),
          // una risposta di modello non verificata (`untrusted`), nata leggendo lo spazio di lavoro (`workspace`)
          summary: esito.testoFinale.slice(0, SUMMARY_MAX), trust: 'untrusted', sensitivity: 'workspace',
          eligibleForIntegration: false,
          provenance: { workspaceBaselineHash: null, inputHash: sha256(consegna), model: modello, provider: fornitoreDi(modello), toolVersions: {} },
        }],
        ...(v2 ? { actualUsage } : {}),
      };
    } finally {
      attivi.delete(ctx.activityExecutionId);
    }
  }

  async function reconcile(ctx) {
    const v2 = ctx.outcomeSchemaVersion === 2;
    const esitoRiconciliazione = (outcome, receiptRef = null) => ({ outcome, receiptRef, resultIds: [], ...(v2 ? { actualUsage: null } : {}) });
    const sessionId = sessions.trovaSessioneDiPasso({ activityExecutionId: ctx.activityExecutionId });
    if (!sessionId) return esitoRiconciliazione('proved_not_performed');
    const esito = await sessions.leggiEsitoSessioneDiPasso({ sessionId });
    const ricevuta = `talos-session:${sessionId}${esito?.sequenzaTerminale != null ? `#${esito.sequenzaTerminale}` : ''}`;
    /*
     * ⭐ F3-41c (25/09/2026), decisione owner «i token del tentativo interrotto contano»: una sessione che NON è più viva (dopo un
     *   riavvio nessuna lo è: il registro le ripristina interrotte) e la cui risposta non è un risultato registrato nel Workflow
     *   è un tentativo PROVATO interrotto — col consumo misurato dal suo file (token, richieste, attrezzi, costo se ogni richiesta
     *   lo dichiara). Il tempo del tentativo non sta nei fatti della sessione: 0, un limite inferiore dichiarato. Una sessione
     *   ancora viva resta `still_unknown` (può ancora finire): quella la decide una persona.
     */
    if (v2 && esito && esito.esito !== 'in-corso') {
      return {
        outcome: 'proved_interrupted', receiptRef: ricevuta, resultIds: [],
        actualUsage: { promptTokens: esito.consumo.promptTokens, completionTokens: esito.consumo.completionTokens, wallMs: 0, agentSeconds: 0,
          toolCalls: esito.consumo.toolCalls, modelRequests: esito.consumo.modelRequests, knownCostUsd: esito.consumo.knownCostUsd },
      };
    }
    return esitoRiconciliazione('still_unknown', esito?.sequenzaTerminale != null ? ricevuta : null);
  }

  async function cancel(ctx) {
    const vivo = attivi.get(ctx.activityExecutionId);
    const sessionId = vivo?.sessionId ?? sessions.trovaSessioneDiPasso({ activityExecutionId: ctx.activityExecutionId });
    if (!sessionId) return { outcome: 'cancelled', evidenceResultIds: [] };
    sessions.ferma(sessionId);
    if (vivo) await vivo.fine.catch(() => {});
    return { outcome: 'cancelled', evidenceResultIds: [] };
  }

  return Object.freeze({ id: AGENT_SESSION_ADAPTER_ID, execute, reconcile, cancel });
}
