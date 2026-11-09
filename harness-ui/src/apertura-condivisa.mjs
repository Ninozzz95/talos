/*
 * One opening of a local model, shared by whoever waits for it (01/11/2026, `FORMA-STOP-E-CARICAMENTO-2026-11-01.md` in the engine
 * handoff folder, OK from Mobile, CLI, Performance and Desktop).
 *
 * Two things this keeps true:
 *   - the owner's decision of 01/11: Stop cancels a first load or a change of model and frees the memory. Ollama does the same
 *     (`server/sched.go:787` `llama.WaitUntilRunning(req.ctx)`, then the runner expires);
 *   - Performance's condition: Stop from one conversation does not bring down another one waiting for the same model. Before this, that
 *     second conversation got `RUNTIME_ALREADY_RUNNING` at once (`llama-server-supervisor.mjs:871`), an error on a model about to be
 *     ready. Ollama queues it (`server/sched.go`, pending requests). The opening is cancelled only when nobody waits any more.
 * A waiter with no signal can never stop, so it keeps the opening alive.
 */
const NESSUNO_ASPETTA = 'nobody is waiting for this opening any more';

/**
 * What `GET /api/v1/runtime` says about a load: read from the state the supervisors already hold, never from the engine (Performance:
 * that route is asked often). No percent without the router: `null`, never a made-up number. `iniziatoIl` is the server's clock, so
 * with `observedAt` the seconds survive a page reload and do not depend on the browser's clock.
 */
export function fotoDelCaricamento(stato, { motivo = 'apertura', nome = null } = {}) {
  if (stato?.state !== 'loading') return null;
  const delRouter = stato.router?.caricamento ?? null;
  /* an end event lost by the stream leaves the last model's percent behind: it does not belong to this one */
  const dalRouter = delRouter && (!stato.modelId || delRouter.modelId === stato.modelId) ? delRouter : null;
  const modelId = stato.modelId ?? dalRouter?.modelId ?? null;
  return { modelId, nome, fase: stato.fase ?? dalRouter?.fase ?? 'starting', percentuale: dalRouter?.percentuale ?? null, iniziatoIl: stato.startedAt ?? null, motivo,
    altroMotore: modelId !== null && stato.router?.ripiegoInCorso === modelId };
}

/** The name to show for a model: from the repository of its manifest, never a path (Mobile: `modelId` can be a file path on the PC). */
export function nomeDaMostrare(repo) {
  if (typeof repo !== 'string' || repo.trim() === '' || /^(?:[\\/]|[A-Za-z]:[\\/])/u.test(repo)) return null;
  if (repo === 'local-upload') return null; // what a file loaded by hand has for a repository (`hf-direct-transfer.mjs:139`): not a name
  return repo.split(/[\\/]/u).pop().replace(/-GGUF$/iu, '') || null;
}

/** Waits for `promessa`, or for the Stop if it comes first: then it throws the Stop's reason at once, and `promessa` goes on by itself. */
export async function aspettaOFerma(promessa, signal) {
  if (!signal) return promessa;
  signal.throwIfAborted();
  let ascolta;
  const fermato = new Promise((_, rifiuta) => { ascolta = () => rifiuta(signal.reason); signal.addEventListener('abort', ascolta, { once: true }); });
  try { return await Promise.race([promessa, fermato]); } finally { signal.removeEventListener('abort', ascolta); }
}

/**
 * Who stopped waiting without being stopped by the person: the cap or the Skip of a summary, a timer (first review, M11). Such a waiter leaves and the
 * opening goes on, so the next request of the turn finds the model opening instead of starting again from zero. Only the person's Stop cancels.
 * Read on 01/11/2026: the router of llama.cpp keeps a load whoever leaves (`server-models.cpp:1650`, the request is cancelled, the load is not);
 * Ollama aborts it with the client (`llm/llama_server.go:1347`). We keep it, and it gives way to whoever asks something else.
 */
const siArrende = (motivo) => motivo?.name === 'TimeoutError' || motivo?.code === 'SUMMARY_SKIPPED' || motivo?.code === 'SUMMARY_TIME_LIMIT';

export function creaAperturaCondivisa({ apri: apriDavvero }) {
  let corrente = null;

  const inCoda = new Map(); // modelId → how many chats wait their turn for it

  function annulla(voce) {
    voce.annullata = true;
    voce.controllo.abort(new Error(NESSUNO_ASPETTA));
  }

  function avvia(modelId, opzioni, prima) {
    const voce = { modelId, controllo: new AbortController(), interessati: new Set(), annullata: false, promessa: null, conPrima: Boolean(prima), inPrima: true, senzaNessuno: false };
    voce.promessa = Promise.resolve()
      .then(() => prima?.(voce.controllo.signal))
      .then((giaAperto) => { voce.inPrima = false; return giaAperto ?? apriDavvero(modelId, { ...opzioni, signal: voce.controllo.signal }); })
      .finally(() => { if (corrente === voce) corrente = null; });
    voce.promessa.catch(() => { /* every waiter hears it from its own wait; nobody left must not be an unhandled rejection */ });
    corrente = voce;
    return voce;
  }

  /**
   * `opzioni`: what the Model Lab chooses for its own load (a window). Such a load does not join another: it would lose its choice.
   * `prima`: what must happen before the engine opens (`attesa-turno.mjs`). It belongs to the opening, so two chats share it and the Stop cancels
   * it only when nobody is left. If it answers, the model is already open and the engine is not asked.
   * `coda`: a chat for ANOTHER model waits its turn, in order of arrival, instead of being refused (Desktop: with `prima` two chats on two models
   * would unload each other).
   */
  async function apri(modelId, { signal, opzioni, prima, coda = false } = {}) {
    signal?.throwIfAborted();
    /* an opening nobody waits for gives way to whoever asks something else: it must not delay a request that is really there */
    if (corrente?.senzaNessuno && (corrente.modelId !== modelId || opzioni)) annulla(corrente);
    const inFila = () => coda && corrente && corrente.modelId !== modelId;
    if (inFila()) inCoda.set(modelId, (inCoda.get(modelId) ?? 0) + 1);
    const inAttesa = inFila();
    try {
      /* an opening being cancelled still holds the engine: the new one starts when it has gone (the supervisor waits for the process itself) */
      while (corrente?.annullata || inFila()) await aspettaOFerma(corrente.promessa.catch(() => {}), signal);
    } finally {
      if (inAttesa) { const quanti = inCoda.get(modelId) - 1; if (quanti > 0) inCoda.set(modelId, quanti); else inCoda.delete(modelId); }
    }
    /* the Model Lab does not join a chat's opening: it would keep it alive after the Stop of the chat (revisione 2, M10), and it stays as it was: the engine says no */
    if (corrente && (corrente.modelId !== modelId || opzioni || (!coda && corrente.conPrima))) return apriDavvero(modelId, { ...opzioni, signal }); // the engine refuses it, as today
    const voce = corrente ?? avvia(modelId, opzioni, prima);
    const chi = signal ?? {};
    voce.interessati.add(chi);
    voce.senzaNessuno = false;
    return new Promise((risolvi, rifiuta) => {
      const fermato = () => {
        voce.interessati.delete(chi);
        if (voce.interessati.size === 0) {
          /* still behind another conversation it would only unload it, for nobody; with a chat in line it would only delay it */
          if (siArrende(signal.reason) && !voce.inPrima && inCoda.size === 0) voce.senzaNessuno = true;
          else annulla(voce);
        }
        rifiuta(signal.reason);
      };
      signal?.addEventListener('abort', fermato, { once: true });
      voce.promessa.then(risolvi, rifiuta).finally(() => signal?.removeEventListener('abort', fermato));
    });
  }

  return Object.freeze({ apri, inCoda: () => [...inCoda.keys()] });
}
