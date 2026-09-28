/*
 * ⭐ F3-33a (25/09/2026) — il cliente della card della proposta: legge la revisione e il run della versione, approva e avvia.
 * ⛔ Un gesto, un `commandId`: il comando si ripete col MEDESIMO id solo se la persona ripete lo stesso gesto dopo un esito
 *   ambiguo; un esito ambiguo (rete caduta, risposta illeggibile) si chiarisce RILEGGENDO lo stato col GET, MAI con un
 *   secondo POST automatico (R4-WF-APPROVE-EXACT-HASH, come la domanda: Stripe, «Idempotent requests», e la bozza IETF
 *   `draft-ietf-httpapi-idempotency-key-header`, lette per F3-51c il 25/09/2026).
 */
const TESTI_ERRORE = Object.freeze({
  WORKFLOW_DEFINITION_NOT_APPROVED: 'Il workflow non risulta approvato: ricarica la card.',
  WORKFLOW_RUNTIME_NOT_READY: 'L\'avvio non è disponibile su questo server in questo momento.',
  WORKFLOW_START_UNSUPPORTED: 'Questo server non sa eseguire uno dei passi del workflow.',
  WORKFLOW_COMMAND_ORIGIN_FORBIDDEN: 'Il comando è stato rifiutato: arriva da una finestra che non è questa app.',
  WORKFLOW_COMMAND_CONFLICT: 'Il workflow è cambiato nel frattempo: ricarica la card.',
  WORKFLOW_DEFINITION_HASH_MISMATCH: 'La proposta è cambiata nel frattempo: ricarica la card.',
  WORKFLOW_APPROVAL_CONFLICT: 'Questa versione risulta già decisa in un altro modo: ricarica la card.',
  WORKFLOW_STORE_NEEDS_ATTENTION: 'Il registro dei workflow ha bisogno di attenzione: il comando non è partito.',
  // F3-33b (25/09/2026): «Modifica» i tetti
  WORKFLOW_REVISION_INVALID: 'Ogni tetto dev\'essere un numero maggiore di zero; il costo può restare vuoto.',
  WORKFLOW_REVISION_EMPTY: 'Nessun tetto è cambiato: non c\'è una versione nuova da salvare.',
  WORKFLOW_VERSION_NOT_LATEST: 'Nel frattempo è nata una versione più nuova: la card si è riletta.',
  WORKFLOW_ALREADY_STARTED: 'Questa versione è già partita: i suoi tetti non si cambiano più.',
  WORKFLOW_VERSION_SUPERSEDED: 'Una versione più nuova è già approvata: si avvia quella.',
  WORKFLOW_DEFINITION_INVALID: 'Con questi tetti il workflow non supera il controllo preliminare.',
});
export const testoErroreComando = (code) => TESTI_ERRORE[code] ?? 'Il comando non è riuscito. Riprova tra poco.';

export function creaClientProposta({ fetchFn = globalThis.fetch, API = (p) => p, sessionId, uuid = () => globalThis.crypto.randomUUID() } = {}) {
  const leggiJson = async (percorso) => {
    const risposta = await fetchFn(API(percorso));
    const corpo = await risposta.json().catch(() => null);
    return { status: risposta.status, corpo };
  };
  /*
   * La revisione dell'ULTIMA versione di questo workflow e il run più recente del workflow (decisione owner 44, più run ammessi).
   * F3-33b (25/09/2026): una modifica dei tetti crea la versione N+1 (D19 a), quindi la card segue le versioni: legge quali
   * esistono dall'elenco delle proposte della sessione, la precedente per dire «era X», e la versione APPROVATA più recente
   * sotto l'ultima, che resta avviabile finché l'ultima non è approvata (decisione owner). Se l'elenco non risponde, la card
   * resta sulla versione della ricevuta, come prima.
   */
  async function leggi({ workflowId, version }) {
    const enc = encodeURIComponent;
    const proposte = await leggiJson(`/api/v1/sessions/${enc(sessionId)}/workflow-proposals?limit=50`).catch(() => null);
    const versioni = proposte?.status === 200
      ? (proposte.corpo?.data?.items ?? []).filter((voce) => voce.workflowId === workflowId).sort((a, b) => b.version - a.version) : [];
    const ultima = Math.max(version, ...versioni.map((voce) => voce.version));
    const rev = await leggiJson(`/api/v1/workflows/${enc(workflowId)}/versions/${ultima}`);
    if (rev.status === 404) return { nonDisponibile: true };
    if (rev.status !== 200 || !rev.corpo?.data) throw Object.assign(new Error('revisione non leggibile'), { status: rev.status });
    const [runs, prima] = await Promise.all([
      leggiJson(`/api/v1/sessions/${enc(sessionId)}/workflows`),
      ultima > 1 ? leggiJson(`/api/v1/workflows/${enc(workflowId)}/versions/${ultima - 1}`).catch(() => null) : null,
    ]);
    const run = runs.status === 200
      ? (runs.corpo?.data?.items ?? []).find((r) => r.workflowId === workflowId) ?? null
      : null;
    const approvata = rev.corpo.data.status !== 'approved'
      ? versioni.find((voce) => voce.version < ultima && voce.status === 'approved') ?? null : null;
    return {
      revisione: rev.corpo.data, run,
      precedente: prima?.status === 200 ? prima.corpo?.data?.budgets ?? null : null,
      avviabilePrima: approvata ? { version: approvata.version, definitionHash: approvata.definitionHash } : null,
    };
  }
  const comando = async (percorso, corpo) => {
    let risposta;
    try {
      risposta = await fetchFn(API(percorso), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    } catch { return { ambiguo: true }; }
    const dati = await risposta.json().catch(() => null);
    if (risposta.ok) return { ok: true, dati: dati?.data ?? null };
    if (!dati?.error?.code && risposta.status >= 500) return { ambiguo: true };
    return { ok: false, code: dati?.error?.code ?? null, status: risposta.status };
  };
  /** Approva: `commandId` nuovo per ogni gesto; esito ambiguo ⇒ si rilegge, e se risulta approvato è riuscito. */
  async function approva({ workflowId, version, definitionHash }) {
    const esito = await comando(`/api/v1/workflows/${encodeURIComponent(workflowId)}/versions/${version}/approve`, { commandId: uuid(), definitionHash });
    if (!esito.ambiguo) return esito;
    const dopo = await leggi({ workflowId, version }).catch(() => null);
    return dopo?.revisione?.status === 'approved' ? { ok: true, riletto: true } : { ok: false, ambiguo: true };
  }
  /** Avvia: stessa regola; esito ambiguo ⇒ si rileggono i run di questa versione. */
  async function avvia({ workflowId, version, definitionHash }) {
    const esito = await comando(`/api/v1/workflows/${encodeURIComponent(workflowId)}/versions/${version}/start`, { commandId: uuid(), definitionHash });
    if (!esito.ambiguo) return esito;
    const dopo = await leggi({ workflowId, version }).catch(() => null);
    // il run di QUESTA versione (F3-33b: la card può avviare anche la versione approvata prima dell'ultima)
    return dopo?.run?.version === version ? { ok: true, riletto: true } : { ok: false, ambiguo: true };
  }
  /**
   * F3-33b: «Modifica» i tetti ⇒ la versione N+1. Nessun `commandId`: la versione nasce dal contenuto, quindi lo stesso gesto
   * ripetuto ritrova la stessa versione (server). Esito ambiguo ⇒ si rilegge: se esiste una versione dopo questa, è riuscito.
   */
  async function rivedi({ workflowId, version, definitionHash, budgets }) {
    let risposta;
    try {
      risposta = await fetchFn(API(`/api/v1/workflows/${encodeURIComponent(workflowId)}/versions/${version}/revise`),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ definitionHash, budgets }) });
    } catch { risposta = null; }
    const dati = risposta ? await risposta.json().catch(() => null) : null;
    if (risposta?.ok) return { ok: true, dati: dati?.data ?? null };
    if (risposta && (dati?.error?.code || risposta.status < 500)) return { ok: false, code: dati?.error?.code ?? null, status: risposta.status };
    const dopo = await leggi({ workflowId, version }).catch(() => null);
    return dopo?.revisione?.version > version ? { ok: true, riletto: true } : { ok: false, ambiguo: true };
  }
  return Object.freeze({ leggi, approva, avvia, rivedi });
}

export const TESTO_AMBIGUO = 'Non si sa se il comando è arrivato: la card si è riletta e non lo mostra. Riprova.';
