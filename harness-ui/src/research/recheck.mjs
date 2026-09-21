/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchRecheck.ts (176 righe, 11/09/2026).
 *
 * R12 — chiedere, più tardi, se le fonti dicono ancora quello che dicevano.
 *
 * Il motivo misurato per cui conta: **oltre il 75% dei contenuti web citati era
 * cambiato entro tre anni**, e la raggiungibilità di una citazione scende
 * dall'87% nei suoi primi cinque anni al 38% dopo dieci. Il link morto è la
 * metà visibile; il link vivo che ora dice un'altra cosa è quello pericoloso,
 * perché niente in lui sembra sbagliato.
 *
 * Nessun altro può fare questo controllo. Ogni prodotto di ricerca conserva
 * URL, quindi il massimo che può dirti è se una richiesta riesce — e un soft
 * 404 o una pagina riscritta in silenzio rispondono 200. Noi abbiamo tenuto il
 * testo estratto, quindi la domanda che possiamo porre è quella che conta:
 * *quello che abbiamo letto è ancora lì?*
 *
 * Due misure, di natura deliberatamente diversa:
 *
 *  - **Quanta parte del testo tenuto sopravvive**, come proporzione. Un'euristica,
 *    e dichiarata tale. Usa il CONTENIMENTO invece di una somiglianza
 *    simmetrica: una pagina che ha aggiunto tre paragrafi non ha perso niente
 *    di ciò su cui ci appoggiavamo, e chiamarla «cambiata» griderebbe al lupo
 *    su ogni sito vivo.
 *  - **Se ogni passaggio citato è ancora ritrovabile**, esattamente, con lo
 *    stesso controllo meccanico che usa R-4. Nessuna euristica, nessuna soglia,
 *    nessuna opinione. È la risposta che decide se il rapporto regge ancora:
 *    una pagina può essere riscritta da cima a fondo, e se le frasi che abbiamo
 *    citato sono sopravvissute, le citazioni valgono quanto il giorno in cui
 *    sono state fatte.
 */

import { talosResearchLocate } from './verification.mjs';

/** @typedef {import('./report.mjs').TalosResearchReportRecord} TalosResearchReportRecord */

/** @typedef {'intact' | 'changed' | 'unreachable'} TalosRecheckState */

/** Quanta parte del testo tenuto deve sopravvivere perché una pagina conti come invariata. */
const INTACT_AT = 0.95;

/** Parole per shingle. Cinque è la misura consueta per il quasi-duplicato sulla prosa. */
const SHINGLE = 5;

/**
 * @typedef {object} TalosResearchSourceRecheck
 * @property {string} url
 * @property {string} title
 * @property {TalosRecheckState} state
 * @property {number | null} survived 0…1 del testo tenuto ancora presente. Null quando la pagina non si è potuta leggere.
 * @property {string | null} reason Perché non si è potuta leggere, quando è quella la risposta.
 * @property {number} passagesStanding Passaggi citati ancora ritrovabili nella pagina di oggi.
 * @property {number} passagesLost Passaggi citati che non ci sono più. Il numero che conta.
 */

/**
 * @typedef {object} TalosResearchRecheck
 * @property {string} at
 * @property {readonly TalosResearchSourceRecheck[]} sources
 */

/**
 * @param {string} text
 * @returns {Set<string>}
 */
function shingles(text) {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  /** @type {Set<string>} */
  const out = new Set();
  for (let index = 0; index + SHINGLE <= words.length; index += 1) {
    out.add(words.slice(index, index + SHINGLE).join(' '));
  }
  // Un testo troppo corto per gli shingle si confronta intero invece di essere
  // dichiarato vuoto.
  if (out.size === 0 && words.length > 0) out.add(words.join(' '));
  return out;
}

/**
 * Quanto di `kept` è ancora presente in `now`, da 0 a 1.
 *
 * Monodirezionale di proposito. La domanda non è «queste due pagine sono la
 * stessa» — è «quello su cui ci appoggiavamo è ancora lì», e una pagina che è
 * cresciuta non è una pagina che è cambiata sotto i nostri piedi.
 *
 * @param {string} kept
 * @param {string} now
 * @returns {number}
 */
export function talosResearchSurvival(kept, now) {
  const before = shingles(kept);
  if (before.size === 0) return 1;
  const after = shingles(now);
  let found = 0;
  for (const piece of before) if (after.has(piece)) found += 1;
  return found / before.size;
}

/**
 * @typedef {object} TalosResearchRecheckDeps
 * @property {(url: string) => Promise<{text: string} | null>} read Rilegge la pagina. Null o un lancio vogliono dire entrambi «non si è potuta leggere».
 * @property {() => string} at
 */

/**
 * Ricontrolla ogni fonte di un rapporto finito.
 *
 * IN SEQUENZA, come la verifica: questo gira su un telefono contro i server di
 * altre persone, e una dozzina di richieste simultanee è il modo in cui una
 * connessione domestica e un sito di notizie decidono entrambi che sei uno
 * scraper.
 *
 * Una fonte che non si può leggere si registra, non si butta mai — e vale la
 * pena dire perché questa non è una perdita: il testo estratto è ancora qui,
 * quindi il dossier resta leggibile e citabile dopo che la pagina stessa è
 * sparita. È tutta la ragione per cui il testo era stato tenuto.
 *
 * @param {TalosResearchRecheckDeps} deps
 * @param {TalosResearchReportRecord} report
 * @param {ReadonlyMap<string, string>} keptByUrl Il testo tenuto, per url — vive nei dossier, non nel rapporto.
 * @returns {Promise<TalosResearchRecheck>}
 */
export async function talosResearchRecheckReport(deps, report, keptByUrl) {
  /** @type {TalosResearchSourceRecheck[]} */
  const sources = [];

  for (const source of report.sources) {
    const kept = keptByUrl.get(source.url) ?? '';
    const quoted = report.claims
      .filter((claim) => report.sources[claim.sourceIndex - 1]?.url === source.url)
      .map((claim) => claim.passage)
      .filter((passage) => passage.length > 0);

    /** @type {{text: string} | null} */
    let fresh = null;
    /** @type {string | null} */
    let reason = null;
    try {
      fresh = await deps.read(source.url);
      if (!fresh) reason = 'unreadable';
    } catch (failure) {
      reason = failure instanceof Error ? failure.message : 'unreadable';
    }

    if (!fresh) {
      sources.push({
        url: source.url,
        title: source.title,
        state: 'unreachable',
        survived: null,
        reason,
        // Non contati come persi: non riusciamo a vedere la pagina, che è una
        // cosa diversa dall'aver guardato e non averli trovati.
        passagesStanding: 0,
        passagesLost: 0,
      });
      continue;
    }

    const survived = talosResearchSurvival(kept, fresh.text);
    const standing = quoted.filter((passage) => talosResearchLocate(fresh.text, passage) !== null).length;

    sources.push({
      url: source.url,
      title: source.title,
      state: survived >= INTACT_AT ? 'intact' : 'changed',
      survived,
      reason: null,
      passagesStanding: standing,
      passagesLost: quoted.length - standing,
    });
  }

  return { at: deps.at(), sources };
}

/**
 * La riga che il lettore riceve per prima: cos'è successo al dossier da allora.
 *
 * @param {TalosResearchRecheck} recheck
 * @returns {{total:number, intact:number, changed:number, unreachable:number, passagesLost:number}}
 */
export function talosResearchRecheckStanding(recheck) {
  /** @param {TalosRecheckState} state */
  const count = (state) => recheck.sources.filter((entry) => entry.state === state).length;
  return {
    total: recheck.sources.length,
    intact: count('intact'),
    changed: count('changed'),
    unreachable: count('unreachable'),
    // Citazioni che non risolvono più alle parole che citavano.
    passagesLost: recheck.sources.reduce((total, entry) => total + entry.passagesLost, 0),
  };
}
