/*
 * C1 (owner 10/10/2026) — LA SCHEDA CONTESTO, i suoi dati. Funzioni pure: cosa dire, con quali numeri, da quale sorgente.
 *
 * Decisioni dell'owner (AskUserQuestion, tutte «Recommended»):
 *  · il limite mostrato è quello che AGISCE, col perché — un numero solo in tutta l'app (la scheda diceva «1050k, 83% libero»
 *    mentre l'avviso del compositore diceva «178.247 su 200.000»);
 *  · la barra per categoria viene dalla richiesta VERA (`talos.contesto-richiesta` / `GET /last-request`), ogni categoria è una
 *    stima («~»), il totale è la misura del fornitore (come Hermes `agent/context_breakdown.py:143-210`);
 *  · «cosa la compattazione ha tenuto» si legge da CAMPI (`activeVersion.retained` del motore; `record` della compattazione
 *    legacy), mai dal testo del riassunto.
 *
 * Le sorgenti del limite, filo per filo:
 *  · motore: `budget` di `GET /context` (`context-desktop-service.mjs::budgetDellaMisura`, la stessa `computeContextBudget` con
 *    cui il motore decide) — `triggerTokens` è dove riassume;
 *  · legacy: `GET /compaction-policy` (`session-registry.mjs::sogliePerVoce`) — `triggerTokens`, `windowTokens`, `source`.
 */

/** Il limite che agisce, o `null` se nessuna sorgente l'ha detto (mai un numero inventato). */
export function limiteCheAgisce({ budget = null, politica = null } = {}) {
  if (budget && Number.isSafeInteger(budget.triggerTokens) && budget.triggerTokens > 0) {
    return { soglia: budget.triggerTokens, finestra: Number.isSafeInteger(budget.windowTokens) ? budget.windowTokens : null, fonte: 'motore' };
  }
  if (politica && Number.isSafeInteger(politica.triggerTokens) && politica.triggerTokens > 0
    && ['route-minimum', 'explicit-cap', 'fallback'].includes(politica.source)) {
    return { soglia: politica.triggerTokens, finestra: Number.isSafeInteger(politica.windowTokens) ? politica.windowTokens : null, fonte: politica.source };
  }
  return null;
}

/**
 * Decisione 174 dell'owner (04/11/2026, reperto 6): la BASE su cui ogni schermata misura la finestra, calcolata in un posto solo.
 * Prima la scheda Contesto divideva per il limite che agisce (165.999), «Memoria e contesto» per la finestra del profilo (266.667) e
 * Capability per quella del catalogo (1.048.576): tre percentuali della stessa conversazione. Ora le tre leggono questo conto:
 *  · con una sessione aperta, il limite che agisce (`limiteCheAgisce`, sui dati della scheda Contesto): `fonte` 'motore' o della politica;
 *  · senza, la finestra del catalogo, detta per quello che è (`fonte: 'catalogo'`); senza nessuna delle due, `base: null`.
 * ⛔ Il limite si legge, non si ferma qui: che il motore lo sposti col metodo della misura è un fatto del nucleo (forma 174).
 * @returns {{ base:number|null, fonte:string|null, soglia:number|null, finestra:number|null, limite:object|null, ripartizione:object|null }}
 */
export function contoDellaFinestra({ scheda = null, finestraCatalogo = null } = {}) {
  const limite = limiteCheAgisce({ budget: scheda?.budget ?? null, politica: scheda?.politica ?? null });
  const ripartizione = Array.isArray(scheda?.ripartizione?.categorie) ? scheda.ripartizione : null;
  if (limite) return { base: limite.soglia, fonte: limite.fonte, soglia: limite.soglia, finestra: limite.finestra, limite, ripartizione };
  const catalogo = Number.isSafeInteger(finestraCatalogo) && finestraCatalogo > 0 ? finestraCatalogo : null;
  return { base: catalogo, fonte: catalogo ? 'catalogo' : null, soglia: null, finestra: catalogo, limite: null, ripartizione };
}

/** I token di una categoria della richiesta SPEDITA, o `null` se la richiesta non c'è o non la nomina. */
export function tokenDellaCategoria(ripartizione, id) {
  const c = Array.isArray(ripartizione?.categorie) ? ripartizione.categorie.find((x) => x?.id === id) : null;
  return Number.isFinite(c?.tokens) && c.tokens >= 0 ? c.tokens : null;
}

/** La chiave i18n della riga del perché e i suoi parametri (i numeri li formatta chi disegna). */
export function percheDelLimite(limite) {
  if (!limite) return null;
  if (limite.fonte === 'motore') return { chiave: 'processi.inspector.limitWhyEngine', soglia: limite.soglia, finestra: limite.finestra };
  if (limite.fonte === 'route-minimum') return { chiave: 'processi.inspector.limitWhyWindow', soglia: limite.soglia, finestra: limite.finestra };
  if (limite.fonte === 'explicit-cap') return { chiave: 'processi.inspector.limitWhyCap', soglia: limite.soglia, finestra: limite.finestra };
  return { chiave: 'processi.inspector.limitWhyUnverified', soglia: limite.soglia, finestra: null };
}

/* L'ordine e i nomi delle categorie: quelli di `richiesta-del-giro.mjs` (server). */
export const CATEGORIE = Object.freeze(['system', 'rules', 'memory', 'tools', 'mcp', 'conversation']);
export const CHIAVI_CATEGORIA = Object.freeze({
  system: 'processi.inspector.catSystem', rules: 'processi.inspector.catRules', memory: 'processi.inspector.catMemory',
  tools: 'processi.inspector.catTools', mcp: 'processi.inspector.catMcp', conversation: 'processi.inspector.catConversation',
  altro: 'processi.inspector.catOther',
});

/*
 * Decisione 174 (04/11/2026): la misura del fornitore conta più delle categorie stimate (33,4k contro ~18,5k, dal vivo con DeepSeek V4.1
 * Flash): i ragionamenti rispediti, i riassunti, la cornice dei messaggi. Quella parte non aveva un nome e non si vedeva da nessuna parte;
 * ora è la riga «Riassunti e altro», ultima, e le righe sommano la misura. Hermes lo scrive: sui modelli che ragionano `prompt_tokens`
 * cresce col ragionamento rigiocato (`agent/context_breakdown.py:194-199`). Solo se la misura supera le stime: mai un resto negativo.
 */
function restoSenzaNome(categorie, usati) {
  if (!Number.isFinite(usati) || usati <= 0 || !categorie.length) return 0;
  return Math.max(0, usati - categorie.reduce((s, c) => s + c.tokens, 0));
}

/**
 * Le fette della barra e le righe, sul limite che agisce. Le categorie sono stime della richiesta spedita; `usati` è la misura
 * del fornitore (`prompt_tokens` dell'ultima chiamata). Senza limite non c'è scala: niente percentuali.
 * @returns {{ voci: {id:string, tokens:number, percentuale:number|null}[], usati:number|null, restanti:number|null, oltre:boolean }}
 */
export function ripartizioneSulLimite({ ripartizione = null, usati = null, limite = null } = {}) {
  const soglia = limite?.soglia ?? null;
  const categorie = Array.isArray(ripartizione?.categorie) ? ripartizione.categorie.filter((c) => CATEGORIE.includes(c?.id) && Number.isFinite(c.tokens) && c.tokens >= 0) : [];
  const misurati = Number.isFinite(usati) && usati > 0 ? usati : null;
  const resto = restoSenzaNome(categorie, misurati);
  const voci = [...categorie.sort((a, b) => CATEGORIE.indexOf(a.id) - CATEGORIE.indexOf(b.id)), ...(resto > 0 ? [{ id: 'altro', tokens: resto }] : [])]
    .map((c) => ({ id: c.id, tokens: c.tokens, percentuale: soglia ? Math.min(100, (c.tokens / soglia) * 100) : null }));
  return { voci, usati: misurati, restanti: soglia && misurati !== null ? soglia - misurati : null, oltre: Boolean(soglia && misurati !== null && misurati > soglia) };
}

/**
 * C1 (owner 10/10/2026) — la barra della PANORAMICA del Context Manager, sulla scala della FINESTRA del modello:
 *  · le categorie della richiesta vera (stime), riportate alla misura del fornitore (`usati`) perché la somma delle stime non
 *    dica più della misura;
 *  · i token LIBERI fino alla soglia (il limite che agisce), poi una TACCA sulla soglia;
 *  · oltre la soglia lo spazio RISERVATO (risposta, margine, il riassunto stesso): mostrato a parte e MAI contato come usato —
 *    Claude Code `/context` lo conta nell'uso e la sua issue #14785 («misleading usage percentage by including autocompact
 *    buffer as used») è il difetto da non copiare.
 * Senza finestra nota la scala è la soglia stessa (niente riservati); senza soglia non c'è barra: `null`.
 * @returns {{ scala:number, segmenti:{id:string,tokens:number,pct:number}[], usati:number|null, liberi:number|null,
 *   riservati:number|null, pctUsati:number, pctLiberi:number, pctRiservati:number, tacca:number|null, oltre:boolean,
 *   percentualeDelLimite:number|null }|null}
 */
export function misuraDellaPanoramica({ usati = null, limite = null, ripartizione = null } = {}) {
  const soglia = Number.isFinite(limite?.soglia) && limite.soglia > 0 ? limite.soglia : null;
  if (!soglia) return null;
  const finestra = Number.isFinite(limite?.finestra) && limite.finestra >= soglia ? limite.finestra : null;
  const scala = finestra ?? soglia;
  const u = Number.isFinite(usati) && usati > 0 ? usati : null;
  const pct = (n) => Math.max(0, Math.min(100, (n / scala) * 100));
  const categorie = Array.isArray(ripartizione?.categorie)
    ? ripartizione.categorie.filter((c) => CATEGORIE.includes(c?.id) && Number.isFinite(c.tokens) && c.tokens > 0).sort((a, b) => CATEGORIE.indexOf(a.id) - CATEGORIE.indexOf(b.id))
    : [];
  const somma = categorie.reduce((s, c) => s + c.tokens, 0);
  /* Decisione 174: quando la misura supera le stime, la differenza è la fetta «Riassunti e altro» e le categorie valgono quello che
     pesano (prima si gonfiavano tutte di 33,4/18,5, e «Strumenti» sembrava quasi il doppio). Quando le stime superano la misura si
     riportano giù alla misura, come prima: la barra non dice mai più di quanto il fornitore ha contato. */
  const resto = restoSenzaNome(categorie, u);
  const fattore = u !== null && somma > u ? u / somma : 1;
  const segmenti = [...categorie, ...(resto > 0 ? [{ id: 'altro', tokens: resto }] : [])].map((c) => ({ id: c.id, tokens: c.tokens, pct: pct(c.tokens * fattore) }));
  const occupati = u ?? (somma || null);
  const oltre = occupati !== null && occupati > soglia;
  const liberi = occupati === null ? null : Math.max(0, soglia - occupati);
  const riservati = finestra ? finestra - soglia : null;
  return {
    scala, segmenti, usati: u, liberi, riservati, oltre,
    occupati, stimato: u === null && occupati !== null, // senza la misura del fornitore vale la somma delle stime, e si dice con «~»
    pctUsati: occupati === null ? 0 : pct(occupati),
    pctLiberi: liberi === null ? 0 : pct(liberi),
    pctRiservati: riservati === null ? 0 : pct(riservati),
    /* review del bugfixer (Y3, misurato): oltre il limite l'uso passa la tacca ed entra nei riservati; disegnati interi, la barra
       sommava più del 100% e i riservati venivano tagliati. Nella barra si vede ciò che resta della finestra; la legenda li dice interi. */
    pctRiservatiVisibili: riservati === null ? 0 : pct(Math.max(0, finestra - Math.max(soglia, occupati ?? 0))),
    tacca: finestra ? pct(soglia) : null,
    /* owner 11/10/2026 («Troncare in tutti e due»): la stessa regola della scheda Contesto (`inspector.js` `percento`), che tronca
       perché le sue parti e «Libera» sommino 100 — prima qui si arrotondava, e la stessa misura era «10,9%» qui e «10,8%» là. */
    percentualeDelLimite: occupati === null ? null : Math.floor((occupati / soglia) * 1000) / 10,
  };
}

/**
 * Le compattazioni della conversazione, dalle due sorgenti vere.
 * @param {{ motore?: {jobs?:object[], activeVersion?:object|null}|null, legacy?: {numero:number, ultima:object|null}|null }} sorgenti
 * @returns {{ numero:number, ultimaAl:string|null, livello:'riassunto'|null, tokenPrima:number|null, tokenDopo:number|null }|null}
 */
export function compattazioniDellaConversazione({ motore = null, legacy = null } = {}) {
  if (motore) {
    const fatte = (Array.isArray(motore.jobs) ? motore.jobs : []).filter((j) => j?.state === 'committed');
    const v = motore.activeVersion ?? null;
    return { numero: fatte.length, ultimaAl: v?.createdAt ?? null, livello: v ? 'riassunto' : null, tokenPrima: null, tokenDopo: Number.isFinite(v?.measurement?.inputTokens) ? v.measurement.inputTokens : null };
  }
  if (legacy) {
    const u = legacy.ultima ?? null;
    return { numero: Number.isSafeInteger(legacy.numero) ? legacy.numero : 0, ultimaAl: u?.at ?? null, livello: u ? 'riassunto' : null, tokenPrima: Number.isFinite(u?.tokenPrima) ? u.tokenPrima : null, tokenDopo: Number.isFinite(u?.tokenDopo) ? u.tokenDopo : null };
  }
  return null;
}

/**
 * Cosa la compattazione ha tenuto, come DATI.
 * @returns {{ richieste: {total:number, kept:{n:number,text:string}[]}|null, fatti: string[], indice: string|null, riassunto: string|null, fonte: 'motore'|'legacy'|null }}
 */
export function cosaHaTenuto({ activeVersion = null, facts = [], recordLegacy = null } = {}) {
  if (activeVersion) {
    const r = activeVersion.retained ?? null;
    return {
      richieste: r?.personRequests ?? null,
      fatti: (Array.isArray(facts) ? facts : []).filter((f) => f && f.status !== 'removed' && typeof f.text === 'string').map((f) => f.text),
      indice: typeof r?.anchorIndex === 'string' && r.anchorIndex ? r.anchorIndex : null,
      riassunto: typeof activeVersion.summary?.text === 'string' ? activeVersion.summary.text : null,
      fonte: 'motore',
    };
  }
  if (recordLegacy) {
    return { richieste: null, fatti: [], indice: typeof recordLegacy.indice === 'string' && recordLegacy.indice ? recordLegacy.indice : null, riassunto: typeof recordLegacy.riassunto === 'string' ? recordLegacy.riassunto : null, fonte: 'legacy' };
  }
  return { richieste: null, fatti: [], indice: null, riassunto: null, fonte: null };
}
