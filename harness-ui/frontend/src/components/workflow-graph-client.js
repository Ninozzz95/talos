/*
 * ⭐ F3-42 (25/09/2026) — il cliente dati del diagramma del workflow: SOLO letture (GET) e il flusso dal vivo del run.
 *   Decisione owner D30: una vista sola — il run se la sessione ne ha uno, altrimenti la proposta (grafo pianificato),
 *   altrimenti niente (e chi monta ripiega sul grafo delle deleghe classiche). Le rotte sono quelle del backend F3-21/F3-51d:
 *   panoramica, pagina di fase (≤50), dettaglio del passo, flusso `run-update` con cursore sulla sequenza.
 *   ⛔ Il compito di un passo NON viaggia nelle viste del run (WF-HTTP-SECRET-OMISSION): anteprima e testo pieno si leggono
 *   dalla revisione della versione (la vista di chi approva) e si uniscono per `nodeId`; un passo aggiunto da una patch del
 *   grafo non ha revisione e resta senza compito — ciò che non ha sorgente non si mostra (D27).
 */
const enc = encodeURIComponent;
/*
 * ⛔ F3-50 (25/09/2026) — UN flusso per run, condiviso fra card, rail e diagramma. Il server è HTTP/1.1 (`server.mjs`,
 *   `node:http`) e il browser tiene al più SEI connessioni aperte per origine: un EventSource ne occupa una finché vive
 *   (MDN, «EventSource», letta il 25/09/2026: «When not used over HTTP/2, SSE suffers from a limitation to the maximum
 *   number of open connections … (6)», «Won't fix» in Chrome e Firefox). Col flusso della sessione, le evidenze e una
 *   conversazione figlia, tre flussi uguali per lo stesso run bastavano a far aspettare le letture normali.
 *   Chi si aggiunge a un flusso già aperto riceve subito un `resync`: i fotogrammi arrivati prima della sua lettura non
 *   li ha visti, e il suo rilettore li recupera dal GET.
 */
const flussiPerCostruttore = new WeakMap();

export function creaClientGrafo({ fetchFn = globalThis.fetch, API = (p) => p, sessionId, EventSourceCtor = globalThis.EventSource } = {}) {
  const leggi = async (percorso) => {
    const risposta = await fetchFn(API(percorso));
    const corpo = await risposta.json().catch(() => null);
    if (!risposta.ok || !corpo?.ok) {
      throw Object.assign(new Error(`lettura non riuscita (${risposta.status})`), { status: risposta.status, code: corpo?.error?.code ?? null });
    }
    return { data: corpo.data, meta: corpo.meta ?? null };
  };
  const sessione = `/api/v1/sessions/${enc(sessionId)}`;
  const versione = (s) => `/api/v1/workflows/${enc(s.workflowId)}/versions/${s.version}`;
  const delRun = (s) => `${sessione}/workflows/${enc(s.runId)}`;

  /**
   * La sorgente del diagramma: il run più recente, o la proposta più recente se è più nuova di ogni run (una proposta
   * fatta DOPO un run concluso è ciò di cui si sta parlando adesso). `preferita` ({workflowId, version}) viene dalla card
   * «Apri diagramma»: vince il run di quella versione, se c'è, altrimenti la sua vista pianificata.
   */
  async function sorgente(preferita = null) {
    if (preferita?.runId) {
      let offset = 0;
      while (true) {
        const { data } = await leggi(`${sessione}/workflows?offset=${offset}&limit=50`);
        const run = (data?.items ?? []).find((r) => r.runId === preferita.runId);
        if (run) return (!preferita.workflowId || run.workflowId === preferita.workflowId)
          && (preferita.version === undefined || run.version === preferita.version)
          ? { tipo: 'run', runId: run.runId, workflowId: run.workflowId, version: run.version, status: run.status, createdAt: run.createdAt }
          : null;
        if (!Number.isSafeInteger(data?.nextOffset) || data.nextOffset <= offset) return null;
        offset = data.nextOffset;
      }
    }
    const [runs, proposte] = await Promise.all([
      leggi(`${sessione}/workflows?limit=50`).then((r) => r.data?.items ?? [], () => []),
      leggi(`${sessione}/workflow-proposals?limit=50`).then((r) => r.data?.items ?? [], () => []),
    ]);
    const daRun = (run) => ({ tipo: 'run', runId: run.runId, workflowId: run.workflowId, version: run.version, status: run.status, createdAt: run.createdAt });
    const daProposta = (p) => ({ tipo: 'piano', runId: null, workflowId: p.workflowId, version: p.version, status: p.status ?? 'proposed', createdAt: p.createdAt });
    if (preferita?.workflowId) {
      const run = runs.find((r) => r.workflowId === preferita.workflowId && r.version === preferita.version);
      if (run) return daRun(run);
      const proposta = proposte.find((p) => p.workflowId === preferita.workflowId && p.version === preferita.version);
      if (proposta) return daProposta(proposta);
    }
    const run = runs[0] ?? null;
    const proposta = proposte[0] ?? null;
    if (run && (!proposta || String(run.createdAt) >= String(proposta.createdAt))) return daRun(run);
    if (proposta && !runs.some((r) => r.workflowId === proposta.workflowId && r.version === proposta.version)) return daProposta(proposta);
    return run ? daRun(run) : null;
  }

  /** Titolo e obiettivo dalla revisione della versione (anche per un run: il run non serializza la Definition). */
  async function revisione(s) {
    return leggi(versione(s)).then((r) => r.data, () => null);
  }

  async function panoramica(s) {
    return leggi(s.tipo === 'run' ? `${delRun(s)}/graph` : `${versione(s)}/graph`);
  }

  /** Una pagina di fase; per un run si uniscono modello scelto e anteprima del compito dalla pagina della versione. */
  async function gruppo(s, phaseId, { offset = 0, limit = 50, perStato = false, arricchisci = true } = {}) {
    // `perStato`: il campione del gruppo aperto, prima chi chiede attenzione o lavora (`sort=stato`, read-model F3-42)
    const query = `?offset=${offset}&limit=${limit}${perStato ? '&sort=stato' : ''}`;
    if (s.tipo !== 'run') return (await leggi(`${versione(s)}/groups/${enc(phaseId)}${query}`)).data;
    const pagina = await leggi(`${delRun(s)}/groups/${enc(phaseId)}${query}`);
    // F3-50: il rail mostra nome e stato; il campione «per stato» costerebbe una lettura per riga
    if (!arricchisci) return pagina.data;
    /* ⛔ 25/09/2026, foto a 5.000: la pagina della versione ordinata «per stato» NON ha gli stessi passi di quella del run (lì
       sono tutti «pianificati», quindi restano in ordine di grafo) e l'unione per `nodeId` non trovava niente. Per il campione
       (al più quattro righe) l'anteprima viene dal dettaglio pianificato di ciascun passo; per le pagine in ordine di grafo
       dalla pagina della versione con gli stessi offset e limite. */
    const pianificate = perStato
      ? await Promise.all(pagina.data.items.map((riga) => leggi(`${versione(s)}/nodes/${enc(riga.nodeId)}`).then((r) => r.data, () => null)))
      : await leggi(`${versione(s)}/groups/${enc(phaseId)}${query}`).then((r) => r.data?.items ?? [], () => []);
    const perId = new Map(pianificate.filter(Boolean).map((riga) => [riga.nodeId, riga]));
    return { ...pagina.data, items: pagina.data.items.map((riga) => {
      const pianificata = perId.get(riga.nodeId);
      return pianificata ? { ...riga, model: pianificata.model, taskPreview: pianificata.taskPreview } : riga;
    }) };
  }

  /*
   * ⭐ Refactor dei grafi (decisioni owner 29 e 30, 26/09/2026) — tre letture nuove, tutte pagine intere fino in fondo:
   *   · `archi`: solo quelli con i due capi dentro le fasi APERTE (decisione 30); fra fasi chiuse bastano i `groupConnections`;
   *   · `storia`: la storia pubblica degli stati da `offset` in poi (decisione 29, riproduzione fedele) — solo un run ne ha una;
   *   · `discendenza`: i passi a monte o a valle di uno (il focus), calcolati dal server sulla Definition.
   */
  const radiceDi = (s) => (s.tipo === 'run' ? delRun(s) : versione(s));
  async function tuttePagine(percorso, limite) {
    const items = [];
    let ultima = null;
    for (let offset = 0; offset !== null;) {
      const sep = percorso.includes('?') ? '&' : '?';
      ultima = (await leggi(`${percorso}${sep}offset=${offset}&limit=${limite}`)).data;
      items.push(...ultima.items);
      offset = ultima.nextOffset;
    }
    return { items, ultima };
  }
  async function archi(s, phaseIds) {
    const fasi = [...phaseIds];
    if (!fasi.length) return [];
    return (await tuttePagine(`${radiceDi(s)}/edges?${fasi.map((p) => `phaseId=${enc(p)}`).join('&')}`, 100)).items;
  }
  async function storia(s, { offset = 0 } = {}) {
    if (s.tipo !== 'run') return { items: [], total: 0, lastSeq: 0 };
    const items = [];
    let ultima = null;
    for (let cursore = offset; cursore !== null;) {
      ultima = (await leggi(`${delRun(s)}/history?offset=${cursore}&limit=1000`)).data;
      items.push(...ultima.items);
      cursore = ultima.nextOffset;
    }
    return { items, total: ultima.total, lastSeq: ultima.lastSeq, status: ultima.status };
  }
  async function discendenza(s, nodeId, direzione) {
    const verso = direzione === 'monte' ? 'upstream' : 'downstream';
    return (await tuttePagine(`${radiceDi(s)}/nodes/${enc(nodeId)}/lineage?direction=${verso}`, 1000)).items;
  }

  /** Il dettaglio di un passo: i fatti dal run (se c'è) e il compito dalla revisione della versione. */
  async function passo(s, nodeId, { outputOffset = 0 } = {}) {
    const pianificato = leggi(`${versione(s)}/nodes/${enc(nodeId)}`).then((r) => r.data, () => null);
    if (s.tipo !== 'run') return { ...(await pianificato ?? {}), nodeId };
    const page = outputOffset > 0 ? `?outputOffset=${outputOffset}` : '';
    const [run, piano] = await Promise.all([leggi(`${delRun(s)}/nodes/${enc(nodeId)}${page}`).then((r) => r.data), pianificato]);
    return { ...run, instructions: piano?.instructions ?? null, model: piano?.model ?? null };
  }
  async function output(s, nodeId, resultId) {
    if (s?.tipo !== 'run' || !resultId) throw new Error('Risultato del run non valido');
    return (await leggi(`${delRun(s)}/nodes/${enc(nodeId)}/output?resultId=${enc(resultId)}`)).data;
  }
  function outputRawUrl(s, nodeId, resultId) {
    if (s?.tipo !== 'run' || !resultId) throw new Error('Risultato del run non valido');
    return API(`${delRun(s)}/nodes/${enc(nodeId)}/output?resultId=${enc(resultId)}&format=raw`);
  }

  /**
   * Il flusso dal vivo del run (F3-51d): un fotogramma `run-update` per raffica, cursore `id` = ultima sequenza. Alla
   * riconnessione il browser rimanda `Last-Event-ID` da solo (HTML Living Standard, «server-sent events»), e il server lo
   * preferisce a `?after=`. Ritorna la funzione che chiude. F3-50: il flusso è UNO per run (vedi `flussiPerCostruttore`);
   * si chiude quando esce l'ultimo iscritto, o quando il server dice che il run è finito.
   */
  function segui(s, { after = 0, onUpdate, onFine } = {}) {
    if (s.tipo !== 'run' || typeof EventSourceCtor !== 'function') return () => {};
    if (!flussiPerCostruttore.has(EventSourceCtor)) flussiPerCostruttore.set(EventSourceCtor, new Map());
    const flussi = flussiPerCostruttore.get(EventSourceCtor);
    const chiave = API(`${delRun(s)}/events`);
    const iscritto = { onUpdate, onFine };
    let voce = flussi.get(chiave);
    if (!voce) {
      const flusso = new EventSourceCtor(API(`${delRun(s)}/events?after=${after}`));
      voce = { flusso, iscritti: new Set(), finito: false };
      const questa = voce;
      flusso.addEventListener('run-update', (evento) => {
        let dati = null;
        try { dati = JSON.parse(evento.data); } catch { return; }
        if (dati) for (const chi of [...questa.iscritti]) if (questa.iscritti.has(chi)) chi.onUpdate?.(dati, evento.lastEventId);
      });
      flusso.onerror = () => {
        if (flusso.readyState !== 2 /* CLOSED: il server ha detto 204, run finito */ || questa.finito) return;
        questa.finito = true; flussi.delete(chiave); flusso.close();
        const iscritti = [...questa.iscritti]; questa.iscritti.clear();
        for (const chi of iscritti) chi.onFine?.();
      };
      flussi.set(chiave, voce);
    } else {
      const questa = voce;
      queueMicrotask(() => { if (questa.iscritti.has(iscritto)) iscritto.onUpdate?.({ resync: true }, null); });
    }
    voce.iscritti.add(iscritto);
    const mia = voce;
    let chiuso = false;
    return () => {
      if (chiuso) return;
      chiuso = true;
      mia.iscritti.delete(iscritto);
      if (!mia.iscritti.size && !mia.finito) { mia.finito = true; flussi.delete(chiave); mia.flusso.close(); }
    };
  }

  /**
   * Le «Evidenze recenti» di un passo (decisione owner D27): gli ultimi attrezzi usati dalla SESSIONE del passo, letti dal
   * suo flusso di eventi come fa il pannello di una figlia (`apriFlussoFiglia`), e come la coda della trascrizione dei
   * sotto-agenti di Hermes (`status-stack/subagent-transcript.tsx`). ⛔ Gli eventi persistiti non portano un orario
   * (`session-registry.mjs:1605`): il «1 min fa» del mockup non ha sorgente e non si mostra. Al più `quante` voci, e la mappa
   * delle chiamate resta limitata anche su una sessione lunga.
   */
  function evidenze(stepSessionId, onCambio, { quante = 3, programma = (f) => (globalThis.requestAnimationFrame ?? setTimeout)(f) } = {}) {
    if (typeof stepSessionId !== 'string' || !stepSessionId || typeof EventSourceCtor !== 'function') return () => {};
    const flusso = new EventSourceCtor(API(`/api/v1/sessions/${enc(stepSessionId)}/events`));
    const chiamate = new Map();
    let chiuso = false, programmato = false;
    const ultime = () => [...chiamate.values()].slice(-quante).reverse().map(({ nome, argomenti, esito }) => {
      let valori = {};
      try { valori = JSON.parse(argomenti || '{}') ?? {}; } catch { /* argomenti ancora a metà */ }
      const oggetto = ['percorso', 'query', 'comando', 'url', 'titolo', 'title', 'nome', 'testo', 'task']
        .map((chiave) => valori?.[chiave]).find((v) => typeof v === 'string' && v.trim());
      return { nome, oggetto: oggetto ? oggetto.trim() : null, esito };
    });
    const avvisa = () => {
      if (programmato || chiuso) return;
      programmato = true;
      programma(() => { programmato = false; if (!chiuso) onCambio(ultime()); });
    };
    flusso.onmessage = (messaggio) => {
      let evento = null;
      try { evento = JSON.parse(messaggio.data); } catch { return; }
      if (evento?.type === 'ToolCallStart' && typeof evento.toolCallId === 'string') {
        chiamate.delete(evento.toolCallId);
        chiamate.set(evento.toolCallId, { nome: evento.toolCallName, argomenti: '', esito: null });
        while (chiamate.size > 20) chiamate.delete(chiamate.keys().next().value);
      } else if (evento?.type === 'ToolCallArgs') {
        const voce = chiamate.get(evento.toolCallId);
        if (voce && typeof evento.delta === 'string' && voce.argomenti.length < 8_192) voce.argomenti += evento.delta;
      } else if (evento?.type === 'ToolCallResult') {
        // ⛔ «concluso», non «riuscito»: il verdetto di un esito vive in `esitoAttrezzoFallito` (app.js), con regole per
        //   attrezzo; una seconda copia qui darebbe un verde a un comando fermato a metà (revisione del 20/09).
        const voce = chiamate.get(evento.toolCallId);
        if (voce) voce.esito = 'concluso';
      } else return;
      avvisa();
    };
    return () => { chiuso = true; flusso.close(); };
  }

  /*
   * ⭐ F3-52 (25/09/2026) — i comandi del run (rotte F3-51c): Pausa, Riprendi, Annulla, Riprova. Stessa regola della card
   *   (`workflow-proposal-client.js`): un `commandId` per GESTO; un esito ambiguo (rete caduta, risposta illeggibile) si chiarisce
   *   RILEGGENDO la panoramica, MAI con un secondo POST automatico (Stripe «Idempotent requests», IETF
   *   `draft-ietf-httpapi-idempotency-key-header`). Per Riprova la rilettura non può provare l'esito (i falliti ripartono e
   *   possono rifallire): resta «non si sa», detto.
   */
  const COMANDI_RUN = Object.freeze(['pause', 'resume', 'cancel', 'retry']);
  const riuscitoDaStato = Object.freeze({
    pause: (p) => p.status === 'paused' || p.pauseRequested === true,
    resume: (p) => p.status === 'running' && p.pauseRequested !== true,
    cancel: (p) => p.status === 'cancelled' || p.cancelRequested === true,
    retry: () => false,
  });
  async function comando(s, azione, { uuid = () => globalThis.crypto.randomUUID() } = {}) {
    if (s?.tipo !== 'run' || !COMANDI_RUN.includes(azione)) throw new Error('comando del run non valido');
    let risposta = null;
    try {
      risposta = await fetchFn(API(`${delRun(s)}/${azione}`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: uuid() }),
      });
    } catch { risposta = null; }
    const corpo = risposta ? await risposta.json().catch(() => null) : null;
    if (risposta?.ok && corpo?.ok) return { ok: true, dati: corpo.data ?? null };
    if (risposta && (corpo?.error?.code || risposta.status < 500)) return { ok: false, code: corpo?.error?.code ?? null, status: risposta.status };
    const dopo = await panoramica(s).then((r) => r.data, () => null);
    return dopo && riuscitoDaStato[azione](dopo) ? { ok: true, riletto: true, dati: { status: dopo.status } } : { ok: false, ambiguo: true };
  }
  /** Che cosa farebbe «Riprova» adesso e di quanto sale il tetto (F3-51c): lo stesso numero che il comando applicherà. */
  async function anteprimaRiprova(s) {
    if (s?.tipo !== 'run') throw new Error('anteprima solo per un run');
    return (await leggi(`${delRun(s)}/retry-preview`)).data;
  }

  return Object.freeze({ sorgente, revisione, panoramica, gruppo, passo, output, outputRawUrl, segui, evidenze, comando, anteprimaRiprova, archi, storia, discendenza });
}
