/*
 * ⭐ F3-41 (25/09/2026) — lo SCHEDULER dei Workflow. Ledger: `.claude/LEDGER-F3-41-SCHEDULER-2026-09-25.md`.
 *
 * F3-41a — la decisione dopo un tentativo fallito, in una funzione PURA (il ciclo arriva con F3-41b):
 *   - si ritenta solo un fallimento ritentabile, di una classe che il passo dichiara in `retryPolicy.retryOn`, finché i
 *     tentativi usati sono meno di `activityPolicy.maxAttempts` (e di `budget.attempts`, se c'è): la Definition del modello ne
 *     dà 2 (`draft-compiler.mjs:47-58`) — «come Hermes», `failure_limit: 2` (`hermes_cli/config_defaults.py:1865`);
 *   - il ritardo: esponenziale da 1 s, ×2, tetto 100 s — il default di Temporal («initial interval 1 s, backoff coefficient
 *     2.0, maximum interval 100 s», docs.temporal.io/encyclopedia/retry-policies, letto il 25/09); con `jitter` si usa
 *     l'«equal jitter» (metà fissa, metà a caso — AWS Architecture Blog, «Exponential Backoff and Jitter»): il «full jitter»
 *     può ridurre a quasi zero il ritardo proprio sui 429 (aws/aws-sdk-net#4341), cioè ribussare subito a chi ha detto basta;
 *   - ritardo e jitter si PERSISTONO nel fatto `retry_scheduled` (catalogo §9: «No random backoff is recomputed on replay»).
 *
 * F3-41b — il CICLO (in fondo al file): capacità adattiva sotto tetti duri e lo scheduler che porta un run da `prepared` alla
 *   fine. Decisioni owner del 25/09: 4 passi insieme (globale, per fornitore, per modello), AIMD sul 429 sotto il tetto, un
 *   passo con modello locale da solo; fallimento «come Hermes» (derivato nel riduttore); budget pieno a ogni tentativo.
 */
import { separaFonteModello } from '../model-destination.mjs';
import { REGISTRO_FORNITORI } from '../provider-registry.mjs';
import { listRunIds } from './store.mjs';

/** Le classi di `activity_failed.errorClass` che hanno un motivo di ritentativo in `RETRY_REASONS` (contract.mjs:17). */
const MOTIVO_DI_RITENTATIVO = Object.freeze({
  rate_limit: 'rate_limit',
  transient_network: 'transient_network',
  provider_5xx: 'provider_5xx',
  process_exit: 'process_exit_retryable',
});

export const RITARDO_DEI_RITENTATIVI = Object.freeze({ baseMs: 1_000, fattore: 2, tettoMs: 100_000 });

function ritardoBase(backoff, tentativo) {
  const { baseMs, fattore, tettoMs } = RITARDO_DEI_RITENTATIVI;
  if (backoff === 'none') return 0;
  if (backoff === 'linear') return Math.min(tettoMs, baseMs * tentativo);
  return Math.min(tettoMs, baseMs * fattore ** Math.max(0, tentativo - 1));
}

/**
 * @param {{ step: object, fallito: { attempt: number, errorClass: string, retryable: boolean }, oraIso: string,
 *   casuale?: () => number }} input
 * @returns {{ azione: 'ritenta', reasonClass: string, backoffMs: number, jitterMs: number, retryAt: string }
 *   | { azione: 'fallisci', errorClass: string, motivo: string }}
 */
export function decidiDopoFallimento({ step, fallito, oraIso, casuale = Math.random } = {}) {
  const fallisci = (motivo) => ({ azione: 'fallisci', errorClass: fallito.errorClass, motivo });
  if (fallito.retryable !== true) return fallisci('non-ritentabile');
  /*
   * ⭐ F3-41c — un tentativo INTERROTTO (riavvio, sessione morta a metà) o provato NON eseguito non ha una classe del fornitore:
   *   si rifà per il `retryMode` del passo, non per `retryOn` (decisione owner 25/09: «lo rifaccio da solo», «almeno una volta»).
   *   L'interrotto può aver già prodotto effetti ⇒ solo `at-least-once` lo consente; il NON eseguito non ha effetti da ripetere
   *   ⇒ si rifà comunque. Tutti e due contano come tentativo, come gli altri (il tetto dei tentativi vale).
   */
  const senzaClasse = fallito.interrotto === true || fallito.nonEseguito === true;
  if (fallito.interrotto === true && step.activityPolicy.retryMode !== 'at-least-once') return fallisci('incerto-da-decidere-a-mano');
  const reasonClass = senzaClasse ? 'process_exit_retryable' : MOTIVO_DI_RITENTATIVO[fallito.errorClass];
  if (!senzaClasse && (!reasonClass || !step.retryPolicy.retryOn.includes(reasonClass))) return fallisci('classe-non-ritentata-dal-passo');
  const tetti = [step.activityPolicy.maxAttempts, step.budget?.attempts].filter((valore) => Number.isSafeInteger(valore));
  if (fallito.attempt >= Math.min(...tetti)) return fallisci('tentativi-esauriti');
  const pieno = ritardoBase(step.retryPolicy.backoff, fallito.attempt);
  const backoffMs = step.retryPolicy.jitter ? Math.floor(pieno / 2) : pieno;
  const caso = Math.min(Math.max(Number(casuale()) || 0, 0), 1);
  const jitterMs = step.retryPolicy.jitter ? Math.floor(caso * (pieno - backoffMs)) : 0;
  const retryAt = new Date(Date.parse(oraIso) + backoffMs + jitterMs).toISOString();
  return { azione: 'ritenta', reasonClass, backoffMs, jitterMs, retryAt };
}

// ═══════════════════════════════════════════ F3-41b — il ciclo ═══════════════════════════════════════════

/** Owner 25/09/2026: «4 insieme» — tetto duro globale, per fornitore e per modello. */
export const TETTO_PASSI_INSIEME = 4;

const RUN_FINITI = new Set(['succeeded', 'failed', 'cancelled']);

/*
 * La CAPACITÀ ADATTIVA: sotto il tetto duro, un limite per coppia fornitore/modello che si dimezza a un 429 (minimo 1) e sale
 *   di uno dopo `successiPerSalire` tentativi riusciti, mai oltre il tetto — AIMD (Netflix concurrency-limits; dimezzare al 429 è
 *   il fattore consigliato per le API dei modelli, ClawPulse 2026). Vive in memoria: è telemetria di controllo, non un fatto
 *   di dominio (catalogo §8: «high-rate samples remain telemetry»). La politica che ne esce è quella che l'ammissione verifica
 *   contro gli slot occupati (`admission.mjs`), quindi il tetto non si supera nemmeno per errore di questo oggetto.
 *   ⛔ Nessun `Retry-After` a questo livello: il kernel ritenta già i 429 dentro la sessione (LEVA 5, talosHarness.mjs:345) e
 *   non lo riporta; il passo che arriva qui ha già esaurito quei ritentativi.
 */
export function createCapacitaAdattiva({ tetto = TETTO_PASSI_INSIEME, successiPerSalire = 3, processiLocali = 1 } = {}) {
  const coppie = new Map();
  const voce = (provider, model) => {
    const chiave = `${provider}\u0000${model}`;
    if (!coppie.has(chiave)) coppie.set(chiave, { provider, model, limite: tetto, successi: 0 });
    return coppie.get(chiave);
  };
  return Object.freeze({
    tetto,
    registra(provider, model) { voce(provider, model); },
    limite(provider, model) { return voce(provider, model).limite; },
    suTraffico(provider, model) {
      const v = voce(provider, model);
      v.limite = Math.max(1, Math.floor(v.limite / 2));
      v.successi = 0;
      return v.limite;
    },
    suSuccesso(provider, model) {
      const v = voce(provider, model);
      v.successi += 1;
      if (v.successi >= successiPerSalire && v.limite < tetto) { v.limite += 1; v.successi = 0; }
      return v.limite;
    },
    politica() {
      const perProvider = new Map();
      const perModel = new Map();
      for (const v of coppie.values()) {
        perProvider.set(v.provider, tetto);
        if (!perModel.has(v.provider)) perModel.set(v.provider, new Map());
        perModel.get(v.provider).set(v.model, v.limite);
      }
      return { globalAgents: tetto, globalWriters: 0, localProcesses: processiLocali, perProvider, perModel, perWorkspaceWriters: new Map() };
    },
  });
}

const STATI_SODDISFATTI = new Set(['succeeded', 'skipped']);
const DIMENSIONI_DELLA_RISERVA = ['promptTokens', 'completionTokens', 'wallMs', 'agentSeconds', 'toolCalls', 'modelRequests'];

/** Un fornitore che non è «collegato» gira su questa macchina (Ollama, LM Studio, llama-server, agente esterno): uno solo. */
function eseguitoQui(provider) {
  const record = REGISTRO_FORNITORI[provider];
  return Boolean(record) && record.esecuzione !== 'collegato';
}

/** Ciò che questo server sa eseguire oggi: Definition v2, passi `agent` in sola lettura (`run-control.mjs:53-62`). */
function eseguibileQui(definition) {
  return definition?.definitionSchemaVersion >= 2
    && Array.isArray(definition.nodes) && definition.nodes.every((node) => node.kind === 'agent' && node.capabilityProfile === 'read');
}

/** Il modello del passo: quello esplicito del passo, altrimenti quello della sessione, congelato nella proposta (decisione 42). */
export function modelloDelPasso(step, definitionRecord) {
  if (step?.modelPolicy?.mode === 'explicit' && typeof step.modelPolicy.model === 'string') return step.modelPolicy.model;
  return definitionRecord?.proposal?.sessionModel ?? null;
}

/** Owner 25/09 «budget pieno a ogni tentativo»: ogni tentativo riserva il budget del passo (con zeri, il consumo vero è un overrun). */
export function riservaDelPasso(step, definition) {
  const riserva = {};
  for (const chiave of DIMENSIONI_DELLA_RISERVA) riserva[chiave] = step.budget?.[chiave] ?? definition.budgets?.[chiave] ?? 0;
  riserva.knownCostUsd = step.budget?.knownCostUsd ?? null;
  return riserva;
}

/**
 * Lo SCHEDULER: porta ogni run da `prepared` alla fine, sveglia per sveglia. Un giro di un run fa, in ordine:
 *   1. `run_started` se il run è ancora `created` (dopo il recupero: il comando di avvio l'ha lasciato `prepared`);
 *   2. rilascio e saldo dei tentativi finiti con lo slot ancora occupato (un riavvio fra la fine e il rilascio);
 *   3. la decisione sui fallimenti ritentabili ancora da decidere (anche dopo un riavvio: seguito di F3-41a);
 *   4. i timer dei ritentativi scaduti, e un timer per il prossimo;
 *   5. l'ammissione dei passi pronti (priorità, poi id) finché la capacità lo permette, e il loro avvio SENZA aspettarli;
 *   6. `run_succeeded` quando ogni passo è soddisfatto e nessuno slot è occupato.
 * Alla fine di ogni passo: AIMD, rilascio, decisione, e un nuovo giro. I giri di uno stesso run non si sovrappongono.
 */
export function createWorkflowScheduler({
  orchestrator, store, capacita, nowFn = () => new Date().toISOString(),
  timerFn = setTimeout, clearTimerFn = clearTimeout, onErrore = () => {},
} = {}) {
  if (!orchestrator || !store || !capacita) throw Object.assign(new Error('scheduler needs orchestrator, store and capacity'), { code: 'WORKFLOW_SCHEDULER_COMPOSITION_INVALID' });
  const runs = new Map();
  let fermo = false;
  const di = (runId) => {
    if (!runs.has(runId)) runs.set(runId, { inVolo: new Map(), inCorso: false, ancora: false, giro: null, timer: null, guasti: new Set(), saltato: false,
      riconciliati: new Set() });
    return runs.get(runId);
  };

  function sveglia(runId) {
    if (fermo) return Promise.resolve();
    const s = di(runId);
    if (s.inCorso) { s.ancora = true; return s.giro; }
    s.inCorso = true;
    s.giro = (async () => {
      try {
        do { s.ancora = false; await giro(runId, s); } while (s.ancora && !fermo);
      } catch (errore) {
        onErrore(errore, { runId });
      } finally {
        s.inCorso = false;
      }
    })();
    return s.giro;
  }

  function programmaTimer(runId, s, run) {
    const prossimo = [...run.state.timers.values()]
      .filter((timer) => timer.kind === 'retry' && timer.status === 'scheduled' && typeof timer.fireAt === 'string')
      .map((timer) => Date.parse(timer.fireAt))
      .sort((a, b) => a - b)[0];
    if (s.timer) { clearTimerFn(s.timer); s.timer = null; }
    if (prossimo === undefined || fermo) return;
    s.timer = timerFn(() => { s.timer = null; sveglia(runId); }, Math.max(0, prossimo - Date.parse(nowFn())));
    s.timer?.unref?.();
  }

  async function giro(runId, s) {
    let run = await orchestrator.readRun({ runId });
    /*
     * ⛔ Solo i run che questo server SA eseguire (la stessa regola del comando di avvio, `run-control.mjs:53-62`: Definition
     *   v2, passi `agent` in sola lettura). Un run vecchio o di un altro tipo non si avvia da solo: prima della composizione nel
     *   server lo scheduler lo avrebbe fatto partire e ne avrebbe ammesso i passi in un giro caldo di rifiuti. Detto una volta.
     */
    if (!eseguibileQui(run.definition)) {
      if (!s.saltato) {
        s.saltato = true;
        onErrore(Object.assign(new Error('this run has steps this server cannot execute'), { code: 'WORKFLOW_RUN_NOT_RUNNABLE_HERE' }), { runId });
      }
      return;
    }
    if (run.state.run.status === 'created' && !run.state.run.cancelRequested) {
      await orchestrator.startRun({ runId });
      run = await orchestrator.readRun({ runId });
    }
    // finito: chi riparte dopo una ripresa ha diritto a un'altra prova (vedi `guasti`, sotto)
    if (RUN_FINITI.has(run.state.run.status)) { s.guasti.clear(); return; }

    // i posti si rilasciano in OGNI stato non finale: è così che una pausa o un annullamento si drenano
    await rilasciaPosti(runId, s, run);
    run = await orchestrator.readRun({ runId });
    // F3-51a (owner 25/09, «Annulla: si fermano subito»): l'annullamento chiesto passa davanti a tutto
    if (run.state.run.cancelRequested) { await annulla(runId, s, run); return; }
    if (run.state.run.status === 'running' && await riconciliaIncerti(runId, s, run)) {
      run = await orchestrator.readRun({ runId });
      await rilasciaPosti(runId, s, run);
      run = await orchestrator.readRun({ runId });
    }
    if (run.state.run.status === 'running') {
      for (const activity of run.state.activities.values()) {
        const node = run.state.nodes.get(activity.nodeId);
        if (node?.activeActivityExecutionId !== activity.activityExecutionId || s.inVolo.has(activity.nodeId)) continue;
        const fallitoRitentabile = activity.state === 'failed' && activity.retryable === true && node.state === 'running';
        // F3-41c: riconciliato dopo un riavvio come interrotto (col suo consumo) o come mai eseguito
        const interrotto = activity.state === 'reconciled' && node.state === 'reconciling'
          && ['proved_interrupted', 'proved_not_performed'].includes(activity.reconcileOutcome);
        if (fallitoRitentabile || interrotto) {
          await orchestrator.decideAfterFailure({ runId, activityExecutionId: activity.activityExecutionId });
        }
      }
      await orchestrator.fireDueRetryTimers({ runId });
    }
    run = await orchestrator.readRun({ runId });
    programmaTimer(runId, s, run);
    // F3-51a (owner 25/09, «Pausa: finiscono, niente di nuovo»): nessun passo nuovo; quando quelli in corso sono finiti, in pausa
    if (run.state.run.pauseRequested) {
      if (s.inVolo.size === 0) await orchestrator.completePause({ runId });
      return;
    }
    // in pausa o «Serve attenzione»: chi riparte dopo una ripresa ha diritto a un'altra prova (vedi `guasti`, sotto)
    if (run.state.run.status !== 'running' || !run.state.run.schedulingEnabled) { s.guasti.clear(); return; }

    for (const nodeId of run.state.indexes.readyQueue) {
      if (fermo) return;
      if (s.inVolo.has(nodeId) || s.guasti.has(nodeId)) continue;
      const step = run.definition.nodes.find((node) => node.id === nodeId);
      const model = modelloDelPasso(step, run.definitionRecord);
      if (!model) { onErrore(Object.assign(new Error('the step has no model'), { code: 'WORKFLOW_STEP_MODEL_MISSING' }), { runId, nodeId }); continue; }
      const { fonte: provider } = separaFonteModello(model);
      capacita.registra(provider, model);
      let ammesso;
      try {
        ammesso = await orchestrator.admitActivity({
          runId, nodeId, provider, model, workspaceRoot: null, agentSlots: 1, writerSlots: 0,
          localProcessSlots: eseguitoQui(provider) ? 1 : 0, reserved: riservaDelPasso(step, run.definition),
        });
      } catch (errore) {
        // la capacità GLOBALE finita ferma il giro; quella di un fornitore, di un modello o dei processi locali no
        if (errore?.code === 'WORKFLOW_CAPACITY_EXCEEDED') { if (/^globalAgents\b/u.test(errore.message)) break; continue; }
        if (errore?.code === 'WORKFLOW_BUDGET_EXCEEDED' || errore?.code === 'WORKFLOW_ADMISSION_NODE_NOT_READY') { onErrore(errore, { runId, nodeId }); continue; }
        throw errore;
      }
      s.inVolo.set(nodeId, { claimId: ammesso.claimId });
      const esecuzione = orchestrator.executeNode({
        runId, nodeId, activityKind: 'agent-session', resourceClass: 'agent',
        idempotencyKey: `${runId}/${nodeId}/${ammesso.preparedIdentity.attempt}`, budgetReservationId: ammesso.budgetReservationId,
        deadlineAt: null, preparedIdentity: ammesso.preparedIdentity,
      });
      esecuzione.then(
        (esito) => dopoIlPasso({ runId, s, nodeId, claimId: ammesso.claimId, provider, model, esito }),
        (errore) => dopoIlPasso({ runId, s, nodeId, claimId: ammesso.claimId, provider, model, errore }),
      );
    }

    run = await orchestrator.readRun({ runId });
    if (s.inVolo.size === 0 && run.state.run.status === 'running'
      && [...run.state.nodes.values()].every((node) => STATI_SODDISFATTI.has(node.state))
      && ![...run.state.capacityClaims.values()].some((claim) => claim.state === 'active')) {
      await orchestrator.completeRun({ runId });
    }
  }

  /*
   * I posti rimasti presi da un processo che non c'è più: di un tentativo finito (anche riconciliato) si rilasciano e si
   *   saldano; di un'ammissione che non è mai arrivata a un tentativo (crash fra `admitActivity` ed `executeNode`, F3-41c) si
   *   rilasciano come `never_scheduled`. Un tentativo ancora incerto tiene il suo posto (catalogo: «Uncertain … do not release»).
   */
  async function rilasciaPosti(runId, s, run) {
    for (const claim of run.state.capacityClaims.values()) {
      if (claim.state !== 'active' || s.inVolo.has(claim.nodeId)) continue;
      const activity = run.state.activities.get(claim.activityExecutionId);
      if (!activity || ['completed', 'failed', 'reconciled'].includes(activity.state)) {
        await orchestrator.releaseAdmission({ runId, claimId: claim.claimId });
      }
    }
  }

  /*
   * ⭐ F3-51a (25/09/2026), owner «Annulla: si fermano subito»: 1. i passi in volo QUI si fermano (lo stop della sessione, come
   *   la chat; la loro esecuzione scrive la fine col consumo e `dopoIlPasso` rilascia il posto e risveglia); 2. un tentativo
   *   incerto che non gira qui (dopo un riavvio) si riconcilia UNA volta — provato interrotto o non eseguito, così il suo posto
   *   si libera; 3. si rilascia ciò che è finito e si chiude (`finishCancel`: passi annullati, poi il run).
   */
  async function annulla(runId, s, run) {
    for (const [nodeId, volo] of s.inVolo) {
      if (volo.annullando) continue;
      const claim = run.state.capacityClaims.get(volo.claimId);
      if (!claim) continue;
      volo.annullando = true;
      orchestrator.cancelActivity({ runId, activityExecutionId: claim.activityExecutionId }).catch((errore) => {
        // un passo non ancora arrivato ai suoi primi fatti non si annulla: il riduttore gli rifiuta la partenza (fence F3-41b);
        // uno appena finito (uscito dal runner, non ancora da `inVolo`) non ha più niente da fermare
        if (!['WORKFLOW_ACTIVITY_NOT_FOUND', 'WORKFLOW_ACTIVITY_NOT_LIVE'].includes(errore?.code)) onErrore(errore, { runId, nodeId });
      });
    }
    await riconciliaIncerti(runId, s, run);
    await rilasciaPosti(runId, s, await orchestrator.readRun({ runId }));
    await orchestrator.finishCancel({ runId });
  }

  /*
   * F3-51a (25/09/2026) — un tentativo rimasto `uncertain` in QUESTO processo (fine senza prova durevole) si riconcilia UNA
   *   volta, appena non è più in volo: prima lo faceva solo il recupero all'avvio, e fino a un riavvio il run restava fermo col
   *   suo posto occupato. Provato interrotto o non eseguito ⇒ il posto si libera e la decisione di F3-41c lo rifà; ancora
   *   ignoto ⇒ resta incerto e «Serve attenzione» (catalogo: `still_unknown` non diventa mai successo né fallimento).
   */
  async function riconciliaIncerti(runId, s, run) {
    let fatto = false;
    for (const activity of run.state.activities.values()) {
      if (activity.state !== 'uncertain' || s.inVolo.has(activity.nodeId) || s.riconciliati.has(activity.activityExecutionId)) continue;
      s.riconciliati.add(activity.activityExecutionId);
      fatto = true;
      try { await orchestrator.reconcileActivity({ runId, activityExecutionId: activity.activityExecutionId }); }
      catch (errore) { onErrore(errore, { runId, nodeId: activity.nodeId }); }
    }
    return fatto;
  }

  async function dopoIlPasso({ runId, s, nodeId, claimId, provider, model, esito = null, errore = null }) {
    // fermato (spegnimento): niente più fatti da qui — ciò che resta a metà lo riprende il giro dopo il riavvio
    if (fermo) { s.inVolo.delete(nodeId); return; }
    try {
      if (esito?.status === 'completed') capacita.suSuccesso(provider, model);
      if (esito?.status === 'failed' && esito.errorClass === 'rate_limit') capacita.suTraffico(provider, model);
      try {
        await orchestrator.releaseAdmission({ runId, claimId });
      } catch (rilascio) {
        // un effetto incerto tiene lo slot finché non è riconciliato (catalogo: «Uncertain … do not release capacity») — F3-41c
        if (rilascio?.code !== 'WORKFLOW_ADMISSION_EFFECT_UNCERTAIN') throw rilascio;
      }
      if (esito?.status === 'failed' && esito.retryable === true) {
        await orchestrator.decideAfterFailure({ runId, activityExecutionId: esito.activityExecutionId });
      }
      // un dispatch rifiutato PRIMA di creare un tentativo non si riammette subito: sarebbe un giro caldo di rifiuti. ⛔ Tranne il
      // rifiuto del fence (F3-41b) per una pausa o un annullamento chiesti fra l'ammissione e la partenza: è il fence che
      // funziona, non un guasto — il posto si è già liberato qui sopra e il passo ripartirà alla ripresa (F3-51a)
      if (errore && errore.code !== 'WORKFLOW_RUN_NOT_SCHEDULABLE') { s.guasti.add(nodeId); onErrore(errore, { runId, nodeId }); }
    } catch (guasto) {
      onErrore(guasto, { runId, nodeId });
    } finally {
      s.inVolo.delete(nodeId);
      sveglia(runId);
    }
  }

  return Object.freeze({
    /** Dopo `orchestrator.recover()`: ogni run del registro riceve un giro. */
    async avvia() {
      for (const runId of await listRunIds(store)) sveglia(runId);
      await Promise.all([...runs.values()].map((s) => s.giro));
    },
    sveglia,
    ferma() {
      fermo = true;
      for (const s of runs.values()) if (s.timer) { clearTimerFn(s.timer); s.timer = null; }
    },
    inVolo(runId) { return runs.get(runId)?.inVolo.size ?? 0; },
    /** Per le prove: aspetta che il run non abbia più giri in corso né passi in volo. */
    async quiete(runId, { tentativi = 400 } = {}) {
      for (let i = 0; i < tentativi; i += 1) {
        const s = runs.get(runId);
        if (!s || (!s.inCorso && s.inVolo.size === 0)) return true;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return false;
    },
  });
}
