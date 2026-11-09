/*
 * The card that slows down by itself (llama.cpp #26663; owner 01/11/2026, «Controllo nel banco e nell'app»): over a 20% drop, the app
 * says to restart. Form: `TALOS/motore-locale/in-corso/FORMA-PC-SVEGLIO-E-SCHEDA-LENTA-2026-11-01.md`, with the conditions of
 * Performance (generation speed only; reference = 90th percentile; no verdict before 5 long answers; the row goes away after 2 answers
 * above 90%) and of the Mobile (`dalle`, `migliore`, `adesso`, `unita: 'token/s'`).
 *
 * Pure: it keeps its history in memory and takes `leggi`/`scrivi` for a file of its own (never the kernel). One key per model + card +
 * engine version: another model, card or version starts its own history.
 */

export const PAROLE_LUNGA = 200; // tokens generated for an answer to count as long
export const STORIA_MINIMA = 5;
export const SOTTO = 0.8; // slow: the last 3 long answers all under 80% of the reference
export const SOPRA = 0.9; // back: 2 answers in a row above 90%
export const ULTIME_LENTE = 3;
export const ULTIME_TORNATE = 2;
export const STORIA_MASSIMA = 50;

export function chiaveScheda({ modello, scheda, versione }) {
  return [modello, scheda, versione].map((x) => String(x ?? '?')).join('|');
}

/* the 90th percentile, linear between the two nearest values (sixth review, C1: nearest rank was the maximum with 5 to 9 answers) */
export function percentile90(valori) {
  const v = valori.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const posto = 0.9 * (v.length - 1);
  const sotto = Math.floor(posto);
  return v[sotto] + (v[Math.min(v.length - 1, sotto + 1)] - v[sotto]) * (posto - sotto);
}

const simile = (a, b) => Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 && a <= b * 2 && b <= a * 2;

/**
 * @param {{ leggi?: () => object|null, scrivi?: (dati: object) => void, adesso?: () => number }} opzioni
 */
export function creaSorveglianteScheda({ leggi = () => null, scrivi = () => {}, adesso = () => Date.now() } = {}) {
  let storie = {};
  try { const letti = leggi(); if (letti && typeof letti === 'object' && !Array.isArray(letti)) storie = letti; } catch { storie = {}; }
  const stato = new Map(); // key → { lenta, dalle, sopra, detta } : this start only
  let dettaInQuestoAvvio = false;

  /**
   * One answer of a local model. `tokenPerSecondo` = generation only (llama.cpp `timings.predicted_per_second`), `generati` =
   * `timings.predicted_n`, `finestra` = the window in use. Returns `{ evento: 'lenta' | 'tornata' | null, schedaLenta }`.
   */
  function registra({ modello, scheda, versione, tokenPerSecondo, generati, finestra }) {
    if (!(Number.isFinite(tokenPerSecondo) && tokenPerSecondo > 0) || !(Number.isFinite(generati) && generati >= PAROLE_LUNGA)) return { evento: null, schedaLenta: corrente(modello) };
    const chiave = chiaveScheda({ modello, scheda, versione });
    const storia = Array.isArray(storie[chiave]) ? storie[chiave] : [];
    const riferimentoDi = (f) => percentile90(storia.filter((s) => simile(s.finestra, f)).map((s) => s.tps));
    const quanteSimili = storia.filter((s) => simile(s.finestra, finestra)).length;
    const riferimento = quanteSimili >= STORIA_MINIMA ? riferimentoDi(finestra) : null;
    const s = stato.get(chiave) ?? { lenta: false, dalle: null, recenti: [], sopra: 0 };
    let evento = null;
    if (riferimento) {
      /* sixth review, C2: the last three are judged with the reference of THEIR window: a different window starts them again */
      if (!simile(s.finestraRecenti, finestra)) s.recenti = [];
      s.finestraRecenti = finestra;
      s.recenti = [...s.recenti, tokenPerSecondo].slice(-ULTIME_LENTE);
      if (!s.lenta) {
        if (s.recenti.length === ULTIME_LENTE && s.recenti.every((v) => v < SOTTO * riferimento)) {
          s.lenta = true; s.dalle = new Date(adesso()).toISOString(); s.sopra = 0; s.riferimento = riferimento; s.adesso = tokenPerSecondo;
          if (!dettaInQuestoAvvio) { dettaInQuestoAvvio = true; evento = 'lenta'; }
        }
      } else {
        s.adesso = tokenPerSecondo;
        s.sopra = tokenPerSecondo >= SOPRA * s.riferimento ? s.sopra + 1 : 0;
        if (s.sopra >= ULTIME_TORNATE) { s.lenta = false; s.dalle = null; s.recenti = []; s.sopra = 0; evento = 'tornata'; }
      }
    }
    stato.set(chiave, s);
    /* a slow answer is history too: a card slow for good becomes its own reference, and the row does not stay forever */
    storie[chiave] = [...storia, { tps: tokenPerSecondo, finestra }].slice(-STORIA_MASSIMA);
    try { scrivi(storie); } catch { /* the history is a help, never a stop */ }
    return { evento, schedaLenta: corrente(modello) };
  }

  /* the field of `GET /api/v1/runtime`: the slow key of the model open now (sixth review, C4: another model, no stale field) */
  function corrente(modello = undefined) {
    for (const [chiave, s] of stato.entries()) {
      if (modello !== undefined && !chiave.startsWith(`${String(modello ?? '?')}|`)) continue;
      if (s.lenta) return { dalle: s.dalle, migliore: Math.round(s.riferimento), adesso: Math.round(s.adesso), unita: 'token/s' };
    }
    return null;
  }

  /**
   * 01/11/2026, «velocità stimata sostituita dalla misura dopo il primo uso» (decisione tecnica, analisi B e C §4): la velocità di scrittura
   * vista su QUESTO PC per un modello, il 90° percentile delle risposte lunghe (stessa misura della scheda lenta), sulla scheda e versione
   * più usate. Null finché non c'è almeno una risposta lunga: allora vale ancora la stima.
   */
  function velocitaMisurata(modello) {
    let migliore = null;
    for (const [chiave, storia] of Object.entries(storie)) {
      if (!chiave.startsWith(`${String(modello ?? '?')}|`) || !Array.isArray(storia) || !storia.length) continue;
      if (!migliore || storia.length > migliore.risposte) migliore = { tokenPerSecondo: Math.round(percentile90(storia.map((s) => s.tps))), risposte: storia.length, unita: 'token/s' };
    }
    return migliore;
  }

  return { registra, corrente, velocitaMisurata };
}
