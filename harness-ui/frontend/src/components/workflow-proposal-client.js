/*
 * ⭐ F3-33a (25/09/2026) — il cliente della card della proposta: legge la revisione e il run della versione, approva e avvia.
 * ⛔ Un gesto, un `commandId`: il comando si ripete col MEDESIMO id solo se la persona ripete lo stesso gesto dopo un esito
 *   ambiguo; un esito ambiguo (rete caduta, risposta illeggibile) si chiarisce RILEGGENDO lo stato col GET, MAI con un
 *   secondo POST automatico (R4-WF-APPROVE-EXACT-HASH, come la domanda: Stripe, «Idempotent requests», e la bozza IETF
 *   `draft-ietf-httpapi-idempotency-key-header`, lette per F3-51c il 25/09/2026).
 */
import { t } from './lingua.js';

/* 03/10/2026, seconda ondata della lingua: le frasi stanno nel dizionario (`agenti.workflow.command.*`, inglese prima) e si
   leggono quando si mostrano. I codici sono quelli del server (F3-33a/b). */
const CODICI_ERRORE = new Set([
  'WORKFLOW_DEFINITION_NOT_APPROVED',
  'WORKFLOW_RUNTIME_NOT_READY',
  'WORKFLOW_START_UNSUPPORTED',
  'WORKFLOW_COMMAND_ORIGIN_FORBIDDEN',
  'WORKFLOW_COMMAND_CONFLICT',
  'WORKFLOW_DEFINITION_HASH_MISMATCH',
  'WORKFLOW_APPROVAL_CONFLICT',
  'WORKFLOW_STORE_NEEDS_ATTENTION',
  'WORKFLOW_REVISION_INVALID',
  'WORKFLOW_REVISION_EMPTY',
  'WORKFLOW_VERSION_NOT_LATEST',
  'WORKFLOW_ALREADY_STARTED',
  'WORKFLOW_VERSION_SUPERSEDED',
  'WORKFLOW_DEFINITION_INVALID',
]);
export const testoErroreComando = (code) => t(CODICI_ERRORE.has(code) ? `agenti.workflow.command.error.${code}` : 'agenti.workflow.command.failed');

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
  async function leggi({ workflowId, version }, { runId = null } = {}) {
    const enc = encodeURIComponent;
    const proposte = await leggiJson(`/api/v1/sessions/${enc(sessionId)}/workflow-proposals?limit=50`).catch(() => null);
    const versioni = proposte?.status === 200
      ? (proposte.corpo?.data?.items ?? []).filter((voce) => voce.workflowId === workflowId).sort((a, b) => b.version - a.version) : [];
    const ultima = Math.max(version, ...versioni.map((voce) => voce.version));
    const rev = await leggiJson(`/api/v1/workflows/${enc(workflowId)}/versions/${ultima}`);
    if (rev.status === 404) return { nonDisponibile: true };
    if (rev.status !== 200 || !rev.corpo?.data) throw Object.assign(new Error('revision not readable'), { status: rev.status }); // per chi sviluppa: non arriva a schermo
    const leggiRuns = async () => {
      if (!runId) return leggiJson(`/api/v1/sessions/${enc(sessionId)}/workflows`);
      let offset = 0;
      while (true) {
        const pagina = await leggiJson(`/api/v1/sessions/${enc(sessionId)}/workflows?offset=${offset}&limit=50`);
        if (pagina.status !== 200) return pagina;
        const run = (pagina.corpo?.data?.items ?? []).find((r) => r.runId === runId);
        if (run) return { status: 200, corpo: { data: { items: [run] } } };
        const next = pagina.corpo?.data?.nextOffset;
        if (!Number.isSafeInteger(next) || next <= offset) return { status: 200, corpo: { data: { items: [] } } };
        offset = next;
      }
    };
    const [runs, prima] = await Promise.all([
      leggiRuns(),
      ultima > 1 ? leggiJson(`/api/v1/workflows/${enc(workflowId)}/versions/${ultima - 1}`).catch(() => null) : null,
    ]);
    const run = runs.status === 200
      ? (runs.corpo?.data?.items ?? []).find((r) => r.workflowId === workflowId && (!runId || r.runId === runId)) ?? null
      : null;
    const approvata = rev.corpo.data.status !== 'approved'
      ? versioni.find((voce) => voce.version < ultima && voce.status === 'approved') ?? null : null;
    return {
      revisione: rev.corpo.data, run, ...(runId && !run ? { runNonTrovato: true } : {}),
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
  /*
   * ⛔ C11 (coda Codex, A-WF-APPROVAL-ATTRIBUTION riprodotto il 07/10; bugfixer 10/10/2026): la rilettura dopo un esito ambiguo
   *   leggeva la revisione PIÙ RECENTE (`leggi` segue le versioni) e dichiarava riuscito qualunque «approved» — anche la versione
   *   2 approvata da altri mentre il gesto chiedeva la 1 con l'hash A. E `rivedi` prendeva qualunque versione maggiore per la
   *   propria. Come `avvia` qui sotto («un run della stessa versione non prova QUESTO comando»): si rilegge la versione ESATTA.
   *   La prova dell'approvazione è QUESTA versione, con QUESTO hash, approvata col `commandId` di QUESTO gesto: la vista lo
   *   porta (`proposalReview` → `approval`, `planning-control.mjs:161`; `APPROVAL_FIELDS` in `store.mjs:32-35` lo richiede).
   *   ⛔ Review della sessione desktop (Y1): approvata con lo stesso hash ma da un ALTRO comando (un'altra finestra, l'avvio da
   *   solo) è vero che la versione è approvata, ma non è merito di questo clic ⇒ `daAltroComando: true`, che nessuno attribuisce
   *   alla persona. Per la revisione: la versione N+1 coi tetti chiesti (il server la deriva dal contenuto, non c'è `commandId`).
   */
  const leggiVersione = async (workflowId, version) => {
    try {
      const r = await leggiJson(`/api/v1/workflows/${encodeURIComponent(workflowId)}/versions/${version}`);
      return r.status === 200 && r.corpo?.data ? r.corpo.data : null;
    } catch { return null; }
  };
  /** Approva: `commandId` nuovo per ogni gesto; esito ambiguo ⇒ si rilegge QUESTA versione: riuscito se è approvata con QUESTO hash e QUESTO `commandId`. */
  async function approva({ workflowId, version, definitionHash }) {
    const commandId = uuid();
    const esito = await comando(`/api/v1/workflows/${encodeURIComponent(workflowId)}/versions/${version}/approve`, { commandId, definitionHash });
    if (!esito.ambiguo) return esito;
    const questa = await leggiVersione(workflowId, version);
    if (questa?.version !== version || questa.definitionHash !== definitionHash || questa.status !== 'approved') return { ok: false, ambiguo: true };
    return questa.approval?.commandId === commandId ? { ok: true, riletto: true } : { ok: true, riletto: true, daAltroComando: true };
  }
  /** Avvia: stessa regola; esito ambiguo ⇒ si rileggono i run di questa versione. */
  async function avvia({ workflowId, version, definitionHash }) {
    const esito = await comando(`/api/v1/workflows/${encodeURIComponent(workflowId)}/versions/${version}/start`, { commandId: uuid(), definitionHash });
    if (!esito.ambiguo) return esito;
    // Un run della stessa versione non prova che QUESTO commandId sia stato ammesso.
    // Conservare l'esito incerto finché una ricevuta esatta lo identifica.
    return { ok: false, ambiguo: true };
  }
  /**
   * F3-33b: «Modifica» i tetti ⇒ la versione N+1. Nessun `commandId`: la versione nasce dal contenuto, quindi lo stesso gesto
   * ripetuto ritrova la stessa versione (server). Esito ambiguo ⇒ si rilegge la versione N+1 ESATTA: è riuscito solo se porta
   * i tetti chiesti (C11: prima bastava una versione qualunque dopo questa, anche nata da un'altra modifica).
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
    const dopo = await leggiVersione(workflowId, version + 1);
    const tettiChiesti = dopo?.version === version + 1 && dopo.budgets && typeof budgets === 'object' && budgets !== null
      && Object.keys(budgets).length > 0 && Object.entries(budgets).every(([chiave, valore]) => dopo.budgets[chiave] === valore);
    return tettiChiesti ? { ok: true, riletto: true } : { ok: false, ambiguo: true };
  }
  return Object.freeze({ leggi, approva, avvia, rivedi });
}

/** L'esito ambiguo, nella lingua corrente (una costante si leggerebbe una volta sola, all'avvio). */
export const testoAmbiguo = () => t('agenti.workflow.command.ambiguous');
