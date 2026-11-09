/**
 * Cambiare modello senza tagliare la risposta di un'altra conversazione (reperto B3 della revisione; owner 01/11/2026, «Aspetta l'altra»).
 *
 * Come Ollama, `server/sched.go:380-393`: il modello si chiude quando le richieste in corso sono finite («waiting for pending requests to
 * complete and unload to occur», letto il 01/11/2026). Tre differenze volute, chieste dalle sessioni sulla forma:
 *
 *   · Performance: «fermo» vuol dire nessun GIRO in corso sul modello aperto, non solo nessuna generazione. Fra due passi di un giro con attrezzi
 *     il motore è fermo, e cambiare lì farebbe rubare il motore a due conversazioni a ogni passo, con una riapertura ogni volta.
 *   · Desktop: la PORTA. Fra «il motore è fermo» e lo scarico può partire la richiesta di un'altra conversazione, e lo scarico la ucciderebbe.
 *     Quindi finiti i giri si chiude la porta (il modello non è più «pronto» per nessuno), si rilegge, e si scarica dopo due letture ferme di fila.
 *     Il Ferma riapre la porta e il vecchio modello resta pronto.
 *   · Desktop: una lettura non riuscita a processo vivo non vuol dire fermo: si resta in attesa, c'è il Ferma. Si va avanti solo con la rotta
 *     spenta o col processo uscito: lo decide chi legge (`motoreOccupato`).
 *
 * Nessun tetto su una risposta che sta scrivendo. Una sola uscita di sicurezza: un giro può aspettare la sua figlia, e la figlia questo cambio;
 * chi aspetterebbe per sempre si sblocca se il motore resta fermo per `quieteMs`. Un attrezzo più lungo di così può subire un cambio fra due passi.
 *
 *   · Owner 01/11/2026, «Fila vera, come Ollama»: chi aspetta aspetta solo i giri aperti quando ha chiesto. Un giro nuovo sul vecchio modello sta dietro.
 *     Il giro che chiede non aspetta se stesso.
 *
 * Limiti scritti: due conversazioni su due modelli si alternano, a ogni fine giro, e ogni alternanza è una riapertura. Una figlia nata durante l'attesa sta
 * dietro come tutti, e se la madre la aspetta decide la quiete.
 */
const dormiAnnullabile = (ms, signal) => new Promise((risolvi) => {
  if (signal?.aborted) { risolvi(); return; }
  const fine = () => { clearTimeout(pausa); signal?.removeEventListener('abort', fine); risolvi(); };
  const pausa = setTimeout(fine, ms);
  pausa.unref?.();
  signal?.addEventListener('abort', fine, { once: true });
});

export function creaCambioDiModello({ stato, scarica, giriInCorso, giroDi = () => 0, motoreOccupato, conRouter = false, ogniMs = 500, quieteMs = 120_000, lettureFerme = 2, now = Date.now, dormi = dormiAnnullabile, registro = (testo) => { try { process.stderr.write(testo); } catch { /* no log, the change goes on */ } } } = {}) {
  let portaChiusa = false;
  let inAttesa = null;
  let ammessi = null; // conversation → its turn: the turns open on the old model when the change was asked. Only they may go on

  /* Third review, D3: a conversation that ends a turn and opens another is a new turn, and it stands behind. Read at every look, also with the engine at work:
     between two turns the engine can be busy (the judge of a goal), and that moment would never be seen */
  function togliChiHaFinito(vecchio) {
    const aperti = new Set(giriInCorso(vecchio));
    for (const [sessione, giro] of ammessi) if (!aperti.has(sessione) || giroDi(sessione) !== giro) ammessi.delete(sessione);
  }

  async function attendiFineDeiGiri(vecchio, signal) {
    let fermoDa = null;
    for (;;) {
      signal.throwIfAborted();
      /* Third review, M1: the engine fell or was freed during the wait. Nothing is left to protect, and the turn admitted would queue behind who waits for it */
      const ora = stato();
      if (!(ora?.state === 'ready' && ora.modelId === vecchio) && ora?.state !== 'loading' && ora?.state !== 'stopping') return; // fourth review, D5: a dead process keeps its `modelId`
      const occupato = await motoreOccupato({ signal });
      togliChiHaFinito(vecchio);
      if (occupato) fermoDa = null;
      else if (fermoDa === null) fermoDa = now();
      if (!occupato) {
        if (ammessi.size === 0) return;
        if (now() - fermoDa >= quieteMs) {
          /* Performance: when it happens it is written, so that the reports do not read a reopening as the engine's */
          registro(`[talos] change of model: ${vecchio} was still for ${Math.round(quieteMs / 1000)} s with a turn open: going on\n`);
          return;
        }
      }
      await dormi(ogniMs, signal);
    }
  }

  async function attendiLetturaFerma(signal) {
    let ferme = 0;
    for (;;) {
      signal.throwIfAborted();
      const occupato = await motoreOccupato({ signal });
      signal.throwIfAborted();
      ferme = occupato ? 0 : ferme + 1;
      if (ferme >= lettureFerme) return;
      await dormi(ogniMs, signal);
    }
  }

  /**
   * Prima di aprire `modelId`. Risponde lo stato se il modello è già aperto (chi era in fila prima l'ha aperto), altrimenti `null`: si apre.
   * `alVia`: quando comincia davvero un'attesa, per dire il nome del modello sulla riga.
   */
  async function prepara(modelId, signal, { alVia, sessione = null } = {}) {
    const ora = stato();
    if (ora?.state !== 'ready' || !ora.modelId) return null;
    if (ora.modelId === modelId) return ora;
    if (typeof conRouter === 'function' ? conRouter() : conRouter) return null; // the router keeps the two models if the memory holds them (decision 1)
    const vecchio = ora.modelId;
    inAttesa = { modelId, iniziatoIl: new Date(now()).toISOString() };
    ammessi = new Map(giriInCorso(vecchio).map((s) => [s, giroDi(s)]));
    ammessi.delete(sessione);
    try {
      await alVia?.();
      await attendiFineDeiGiri(vecchio, signal);
      portaChiusa = true;
      await attendiLetturaFerma(signal);
      /* la finestra del vecchio modello può star crescendo: il motore sta riaprendo, e aprirne un altro ora vorrebbe dire un rifiuto (revisione 2, D3) */
      for (;;) {
        const adesso = stato();
        if (adesso?.state === 'ready' && adesso.modelId === vecchio) { await scarica(); break; }
        if (adesso?.state !== 'loading' && adesso?.state !== 'stopping') break;
        await dormi(ogniMs, signal);
        signal.throwIfAborted();
      }
      return null;
    } finally {
      inAttesa = null;
      ammessi = null;
      portaChiusa = false;
    }
  }

  /** Questa conversazione sta dietro a chi aspetta? Una richiesta che non dice di chi è passa: la porta basta per lei. */
  const staDietro = (sessione) => ammessi !== null && typeof sessione === 'string' && (!ammessi.has(sessione) || ammessi.get(sessione) !== giroDi(sessione));

  return Object.freeze({ prepara, portaChiusa: () => portaChiusa, inAttesa: () => inAttesa, staDietro });
}
