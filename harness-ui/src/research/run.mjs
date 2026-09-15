/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchRun.ts (492 righe, 11/09/2026).
 *
 * Un giro di ricerca che può essere ucciso e ripreso.
 *
 * Questo è R-1, e la specifica lo mette per primo per una ragione che
 * sopravvive al contatto con la piattaforma: su un telefono il processo VERRÀ
 * ucciso. Doze lo ferma a schermo spento, i servizi in primo piano `dataSync`
 * hanno sei ore ogni ventiquattro e poi qualche secondo di preavviso, e il
 * produttore di questo dispositivo — OnePlus, oggi su ColorOS — è documentato
 * come uno dei più aggressivi sul mercato nell'uccidere il lavoro in secondo
 * piano, coi permessi che l'utente concede azzerati dagli aggiornamenti di
 * firmware.
 *
 * Quindi essere interrotti non è una modalità di guasto qui. È il caso normale,
 * e tutto quello che sta sotto ne prende la forma.
 *
 * La forma è quella su cui il campo si è assestato per l'esecuzione durevole:
 * un giornale a sola aggiunta di quello che È SUCCESSO, con lo stato corrente
 * ricavato rigiocandolo — non un oggetto mutabile salvato sopra sé stesso. La
 * differenza si vede esattamente quando conta: uno stato sovrascritto sul posto
 * ti dice cosa crede sia vero adesso, e un giornale ti dice che un passo era
 * finito prima che il processo morisse, che è la differenza fra pagare una
 * ricerca una volta e pagarla due.
 *
 * Compra anche tre cose gratis, ed è la ragione per cui vale più di una colonna
 * `status`: il giro si può biforcare, si può controllare, e un giro registrato
 * si può rigiocare come test.
 *
 * Quello che fa la concorrenza qui vale la pena nominarlo, perché è il «+1».
 * Fermare un giro di Deep Research su ChatGPT vuol dire ricominciarlo da zero;
 * i suoi forum sono pieni di giri bloccati su «Researching…» senza alcun
 * recupero. Loro se lo possono permettere: girano su un server. Noi no, e il
 * vincolo è quello che produce la capacità.
 *
 * Niente in questo file tocca Android, la rete, un database o un modello. È
 * aritmetica su una lista, che è ciò che lo rende provabile senza un
 * dispositivo — e ciò che permette allo stesso giro di migrare più tardi su un
 * server (R1b), visto che uno stato che si serializza è uno stato che si può
 * spostare.
 */

/** @typedef {'quick' | 'deep' | 'exhaustive'} TalosResearchDepth */

/**
 * `pause_requested` e `paused` sono due stati, non uno, e la ragione è il
 * denaro.
 *
 * Una pausa può arrivare mentre un passo è IN VOLO e già pagato. Buttare via
 * quella risposta per onorare subito la parola «pausa» spenderebbe il denaro
 * dell'utente per niente, quindi il motore drena il passo che ha cominciato, lo
 * mette a registro, e solo allora riposa — la ricerca del 2026-08-03 lo chiama
 * «drain then checkpoint». `pause_requested` è l'intervallo in mezzo:
 * l'intenzione è registrata e nessun passo nuovo verrà prenotato, ma il punto
 * sicuro non è ancora stato raggiunto. Collassare i due farebbe mentire lo
 * schermo in una direzione o nell'altra.
 *
 * `paused` NON è `cancelled`. Cancellato è terminale — il WorkManager di
 * Android non ha uno stato PAUSED e il suo CANCELLED non si può riprendere —
 * quindi scriverne uno quando la persona ha chiesto l'altro butterebbe via una
 * ricerca che aveva pagato.
 *
 * @typedef {'planning' | 'awaiting_plan_approval' | 'collecting' | 'synthesising' | 'verifying' | 'pause_requested' | 'paused' | 'done' | 'cancelled' | 'failed'} TalosResearchStatus
 */

/**
 * Gli stati da cui non succederà mai più niente.
 *
 * @type {readonly TalosResearchStatus[]}
 */
export const TALOS_RESEARCH_TERMINAL = Object.freeze([
  'done', 'cancelled', 'failed',
]);

/**
 * @param {TalosResearchStatus} status
 * @returns {boolean}
 */
export function talosResearchIsTerminal(status) {
  return TALOS_RESEARCH_TERMINAL.includes(status);
}

/**
 * Fermo, ma con del lavoro ancora dovuto: il motore non deve prenotare, il giro
 * si può riprendere.
 *
 * @param {TalosResearchStatus} status
 * @returns {boolean}
 */
export function talosResearchIsResting(status) {
  return status === 'paused' || status === 'pause_requested';
}

/**
 * Dove il giro sta girando. Tutto il punto di R1b è che questo può cambiare.
 *
 * @typedef {'device' | 'cloud'} TalosResearchEngine
 */

/** @typedef {'search' | 'read' | 'synthesise' | 'verify'} TalosResearchStepKind */

/**
 * `interrupted` non è la stessa cosa di `failed`, e la distinzione È la
 * funzione.
 *
 * Un passo fallito ha provato e non ce l'ha fatta; uno interrotto stava ancora
 * girando quando il processo è stato ucciso, quindi nessuno sa se sia finito.
 * Il primo è un risultato, il secondo è una domanda — e solo il secondo vale la
 * pena di riprovare.
 *
 * @typedef {'pending' | 'running' | 'done' | 'failed' | 'interrupted'} TalosResearchStepState
 */

/**
 * Solo e soltanto quello che è stato davvero osservato. Le stime vivono sul ramo.
 *
 * @typedef {object} TalosResearchSpend
 * @property {number} tokens
 * @property {number} searches
 * @property {number} pages
 */

/** @type {TalosResearchSpend} */
export const TALOS_RESEARCH_NO_SPEND = Object.freeze({
  tokens: 0,
  searches: 0,
  pages: 0,
});

/**
 * @typedef {object} TalosResearchBranch
 * @property {string} id
 * @property {string} question
 * @property {TalosResearchSpend} estimate Quello che il pianificatore ha INDOVINATO. Mai confuso con quello che è stato speso.
 */

/**
 * @typedef {object} TalosResearchStep
 * @property {string} id
 * @property {string} branchId
 * @property {TalosResearchStepKind} kind
 * @property {TalosResearchStepState} state
 * @property {number} attempts Quante volte questo passo è stato avviato. Prova, non identità.
 * @property {string | null} startedAt
 * @property {string | null} finishedAt
 * @property {TalosResearchSpend} spend
 * @property {string | null} resultRef
 *   Dove vive il carico — mai il carico. Un giornale che porta cento kilobyte
 *   di testo di pagina per riga è un giornale che nessuno può rigiocare su un
 *   telefono, e il testo appartiene al caveau con tutto il resto che l'app
 *   conserva.
 * @property {string | null} error
 */

/**
 * @typedef {object} TalosResearchRun
 * @property {string} id
 * @property {string} sessionId
 * @property {string} question
 * @property {TalosResearchDepth} depth
 * @property {TalosResearchEngine} engine
 * @property {TalosResearchStatus} status
 * @property {string | null} title
 *   L'etichetta che la lista mostra, quando qualcuno ne ha scelta una. `null`
 *   vuol dire «usa la domanda» — che è il default onesto, perché la domanda È
 *   il nome di una ricerca finché una persona non decide altrimenti.
 * @property {readonly TalosResearchBranch[]} plan
 * @property {readonly TalosResearchStep[]} steps
 * @property {string} startedAt
 * @property {string} updatedAt
 */

/**
 * Gli undici eventi del giornale.
 *
 * @typedef {{kind:'run_started', at:string, id:string, sessionId:string, question:string, depth:TalosResearchDepth, engine:TalosResearchEngine}
 *   | {kind:'plan_proposed', at:string, branches:readonly TalosResearchBranch[]}
 *   | {kind:'plan_approved', at:string, branches:readonly TalosResearchBranch[]}
 *   | {kind:'step_started', at:string, stepId:string, branchId:string, stepKind:TalosResearchStepKind}
 *   | {kind:'step_finished', at:string, stepId:string, spend:TalosResearchSpend, resultRef:string|null}
 *   | {kind:'step_failed', at:string, stepId:string, error:string}
 *   | {kind:'run_pause_requested', at:string}
 *   | {kind:'run_paused', at:string}
 *   | {kind:'run_resumed', at:string}
 *   | {kind:'run_renamed', at:string, title:string|null}
 *   | {kind:'run_cancelled', at:string}
 *   | {kind:'run_finished', at:string}} TalosResearchEvent
 */

/**
 * Il nome a cui un passo risponde, attraverso ogni tentativo.
 *
 * La letteratura lo ricava da giro + attività + NUMERO DI TENTATIVO. Il
 * tentativo è lasciato fuori di proposito qui, perché i due contesti vogliono
 * cose opposte. Là la chiave separa i tentativi proprio perché il secondo giri.
 * Qui l'utente paga di tasca sua — ogni ricerca è denaro — quindi due tentativi
 * dello stesso passo logico devono essere riconoscibili come LO STESSO, e un
 * fornitore che sa deduplicare dev'essere messo in condizione di farlo. Il
 * conteggio dei tentativi è registrato accanto al passo come prova, mai piegato
 * dentro il suo nome.
 *
 * @param {string} runId
 * @param {string} stepId
 * @returns {string}
 */
export function talosResearchIdempotencyKey(runId, stepId) {
  return `${runId}:${stepId}`;
}

/**
 * @param {TalosResearchSpend} left
 * @param {TalosResearchSpend} right
 * @returns {TalosResearchSpend}
 */
function addSpend(left, right) {
  return {
    tokens: left.tokens + right.tokens,
    searches: left.searches + right.searches,
    pages: left.pages + right.pages,
  };
}

/**
 * Quanto il giro è davvero costato finora, sommato dai passi che sono girati.
 *
 * @param {TalosResearchRun} run
 * @returns {TalosResearchSpend}
 */
export function talosResearchSpent(run) {
  return run.steps.reduce((total, step) => addSpend(total, step.spend), TALOS_RESEARCH_NO_SPEND);
}

/**
 * @param {readonly TalosResearchStep[]} steps
 * @param {string} stepId
 * @param {(step: TalosResearchStep) => TalosResearchStep} change
 * @returns {readonly TalosResearchStep[]}
 */
function replaceStep(steps, stepId, change) {
  return steps.map((step) => (step.id === stepId ? change(step) : step));
}

/**
 * Un evento, ripiegato dentro lo stato.
 *
 * Gli eventi che non hanno senso contro lo stato a cui arrivano vengono
 * IGNORATI invece di lanciare. Un giornale si legge dal magazzino dopo
 * un'uccisione, e l'unica cosa che non deve fare mai è rifiutarsi di caricare:
 * un giro che non si può rigiocare è un giro il cui lavoro pagato è perso, che
 * è esattamente il guasto per cui questo disegno esiste. I duplicati sono il
 * caso comune — un'aggiunta scritta due volte perché il processo è morto fra la
 * scrittura e la conferma — e contarne uno due volte riporterebbe denaro che
 * non è mai stato speso.
 *
 * @param {TalosResearchRun | null} run
 * @param {TalosResearchEvent} event
 * @returns {TalosResearchRun | null}
 */
export function talosResearchApply(run, event) {
  if (event.kind === 'run_started') {
    // Solo il primo. Un avvio ripetuto azzererebbe un giro che ha già speso
    // denaro.
    if (run) return run;
    return {
      id: event.id,
      sessionId: event.sessionId,
      question: event.question,
      depth: event.depth,
      engine: event.engine,
      status: 'planning',
      title: null,
      plan: [],
      steps: [],
      startedAt: event.at,
      updatedAt: event.at,
    };
  }
  if (!run) return null;

  /**
   * @param {Partial<TalosResearchRun>} next
   * @returns {TalosResearchRun}
   */
  const touched = (next) => ({
    ...run,
    ...next,
    updatedAt: event.at,
  });

  switch (event.kind) {
    case 'plan_proposed':
      return touched({ plan: event.branches, status: 'awaiting_plan_approval' });

    case 'plan_approved':
      // I rami APPROVATI, non quelli proposti: l'utente ha il permesso di
      // togliere, aggiungere e riformulare, e quello che ha approvato è quello
      // che gira.
      return touched({ plan: event.branches, status: 'collecting' });

    case 'step_started': {
      const existing = run.steps.find((step) => step.id === event.stepId);
      if (existing?.state === 'done') {
        // Già pagato. Ricominciarlo è l'errore che tutto questo file esiste per
        // rendere impossibile.
        return run;
      }
      if (existing) {
        return touched({
          steps: replaceStep(run.steps, event.stepId, (step) => ({
            ...step,
            state: 'running',
            attempts: step.attempts + 1,
            startedAt: event.at,
            error: null,
          })),
        });
      }
      return touched({
        steps: [...run.steps, {
          id: event.stepId,
          branchId: event.branchId,
          kind: event.stepKind,
          state: 'running',
          attempts: 1,
          startedAt: event.at,
          finishedAt: null,
          spend: TALOS_RESEARCH_NO_SPEND,
          resultRef: null,
          error: null,
        }],
      });
    }

    case 'step_finished': {
      const existing = run.steps.find((step) => step.id === event.stepId);
      if (!existing || existing.state === 'done') return run;
      return touched({
        steps: replaceStep(run.steps, event.stepId, (step) => ({
          ...step,
          state: 'done',
          finishedAt: event.at,
          // Registrato una volta, sulla transizione. Sommarlo alla cifra
          // precedente conterebbe due volte un passo riprovato che aveva già
          // riportato una parte del suo costo.
          spend: event.spend,
          resultRef: event.resultRef,
          error: null,
        })),
      });
    }

    case 'step_failed': {
      const existing = run.steps.find((step) => step.id === event.stepId);
      if (!existing || existing.state === 'done') return run;
      return touched({
        steps: replaceStep(run.steps, event.stepId, (step) => ({
          ...step,
          state: 'failed',
          finishedAt: event.at,
          error: event.error,
        })),
      });
    }

    /*
     * Chiedere due volte non è chiedere più forte: la seconda richiesta non
     * deve riportare a «mi sto fermando» un giro che ha già raggiunto il punto
     * sicuro. E un giro che è finito non è affatto mettibile in pausa — il
     * giornale si legge dopo un'uccisione, e una richiesta vecchia che arriva
     * in ritardo non deve resuscitare un giro terminale.
     */
    case 'run_pause_requested':
      if (talosResearchIsTerminal(run.status) || run.status === 'paused') return run;
      return touched({ status: 'pause_requested' });

    case 'run_paused':
      if (talosResearchIsTerminal(run.status)) return run;
      return touched({ status: 'paused' });

    /*
     * Di nuovo a raccogliere, che è dove vive il punto di ripresa. Rifiutato da
     * uno stato terminale per lo stesso motivo: cancellato vuol dire
     * cancellato, e una ripresa che lo riaprisse spenderebbe denaro su un giro
     * che la persona ha chiuso.
     */
    case 'run_resumed':
      if (talosResearchIsTerminal(run.status)) return run;
      return touched({ status: 'collecting' });

    case 'run_renamed': {
      // Lo spazio bianco non è un titolo. Vuoto ripristina la domanda, che è
      // anche quello che scrive «Ripristina il titolo originale».
      const title = event.title === null ? null : event.title.trim();
      return touched({ title: title === null || title.length === 0 ? null : title });
    }

    case 'run_cancelled':
      return touched({ status: 'cancelled' });

    case 'run_finished':
      return touched({ status: 'done' });

    default:
      return run;
  }
}

/**
 * Lo stato di un giro, da tutta la sua storia. Deterministico per costruzione.
 *
 * @param {readonly TalosResearchEvent[]} events
 * @returns {TalosResearchRun | null}
 */
export function talosResearchReplay(events) {
  return events.reduce(talosResearchApply, /** @type {TalosResearchRun | null} */ (null));
}

/**
 * Quello che il processo non ha potuto dirci, ricavato sulla via del ritorno.
 *
 * Un passo lasciato `running` era in volo quando il processo è stato ucciso.
 * Nessuno l'ha scritto, perché la cosa che l'avrebbe scritto è quella che è
 * morta — quindi si deduce qui, nell'unico momento in cui qualcuno può: il
 * prossimo avvio. È per questo che non esiste un evento `process_died`; un
 * evento che nessuno è vivo per aggiungere è una bugia nel giornale.
 *
 * @param {TalosResearchRun} run
 * @param {string} at
 * @returns {TalosResearchRun}
 */
export function talosResearchRecover(run, at) {
  if (!run.steps.some((step) => step.state === 'running')) return run;
  return {
    ...run,
    steps: run.steps.map((step) => (
      step.state === 'running' ? { ...step, state: 'interrupted' } : step
    )),
    updatedAt: at,
  };
}

/**
 * Il passo da fare dopo, o niente.
 *
 * I passi interrotti vengono prima di quelli intatti: finire quello che era
 * stato cominciato mantiene l'ordine del giro, ed è il passo che più
 * probabilmente è già stato pagato in parte.
 *
 * @param {TalosResearchRun} run
 * @returns {TalosResearchStep | null}
 */
export function talosResearchNextStep(run) {
  if (talosResearchIsTerminal(run.status)) return null;
  // La pausa si fa rispettare QUI, nell'unica funzione che decide cosa fare
  // dopo, invece che a ogni punto di chiamata che potrebbe dimenticarsene.
  // «Nessun passo nuovo viene prenotato» non è un consiglio al motore — è il
  // motore che non ha niente da prenotare.
  if (talosResearchIsResting(run.status)) return null;
  return run.steps.find((step) => step.state === 'interrupted')
    ?? run.steps.find((step) => step.state === 'pending')
    ?? null;
}

/**
 * Quanto è avanti un giro — una definizione sola, così niente può essere in
 * disaccordo con sé stesso.
 *
 * La sintesi è un passo come gli altri e conta fra quelli finiti, quindi un
 * totale preso dal solo piano annunciava «3 di 2» nel momento in cui il
 * rapporto veniva scritto. Si aggiunge al totale una volta che il giro ha
 * davvero un passo del genere, e non prima: un denominatore che conta lavoro
 * che potrebbe non essere mai tentato è la stessa bugia nell'altra direzione.
 *
 * @param {TalosResearchRun} run
 * @returns {{done: number, total: number}}
 */
export function talosResearchProgressOf(run) {
  return {
    done: run.steps.filter((step) => step.state === 'done').length,
    total: run.plan.length + (run.steps.some((step) => step.kind === 'synthesise') ? 1 : 0),
  };
}

/**
 * Il nome a cui risponde il passo di un ramo. Derivato, mai inventato.
 *
 * Un id di passo che venisse da un contatore o da una sorgente casuale sarebbe
 * un nome nuovo a ogni tentativo, e un nome nuovo è un passo che nessuno può
 * riconoscere come già fatto — che è il modo in cui un giro ripreso paga due
 * volte la stessa ricerca.
 *
 * @param {string} branchId
 * @param {TalosResearchStepKind} kind
 * @returns {string}
 */
export function talosResearchStepIdFor(branchId, kind) {
  return `${branchId}:${kind}`;
}

/**
 * Quello che deve ancora succedere, dal PIANO invece che dal giornale.
 *
 * I due rispondono a domande diverse e servono entrambi. Il giornale registra
 * quello che è successo; solo il piano sa quello che avrebbe dovuto succedere.
 * Un giro ucciso prima che il suo terzo ramo partisse non ha niente nel
 * giornale su quel ramo — il lavoro manca, non è registrato come mancante —
 * quindi chiedere al solo giornale chiamerebbe il giro finito.
 *
 * Un ramo è in sospeso quando il suo passo è assente, interrotto o fallito.
 * Fatto è fatto: non viene mai offerto di nuovo, qualunque cosa sia successa
 * dopo.
 *
 * @param {TalosResearchRun} run
 * @param {TalosResearchStepKind} [kind='search']
 * @returns {readonly TalosResearchBranch[]}
 */
export function talosResearchWorkLeft(run, kind = 'search') {
  // Solo terminale. Un giro in pausa DEVE ancora questo lavoro — dire il
  // contrario disegnerebbe un piano vuoto per una cosa che la persona sta per
  // riprendere, ed è la domanda opposta rispetto a «cosa dovrebbe fare il
  // motore proprio adesso».
  if (talosResearchIsTerminal(run.status)) return [];
  return run.plan.filter((branch) => {
    const step = run.steps.find((candidate) => candidate.id === talosResearchStepIdFor(branch.id, kind));
    return !step || step.state !== 'done';
  });
}
