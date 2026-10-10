/*
 * C5 (owner 10/10/2026, brief §6 «il modello non deve recuperare enormi quantità di informazioni quando gli serve un
 *   sottoinsieme») — il contratto UNICO degli elenchi e delle ricerche che il modello chiama. Contratto:
 *   `.claude/CONTRATTO-C5-ATTREZZI-BOZZA-2026-10-10.md` §1, approvato dalla CLI il 10/10 (§7).
 *
 * ⭐ Il cursore è OPACO (MCP 2026-07-28, «Pagination»: il client non costruisce cursori e non presume la grandezza della
 *   pagina) e porta una CHIAVE, non una posizione: se fra due pagine una voce compare o sparisce, la pagina dopo riparte
 *   dalla chiave dell'ultima voce vista e non salta né ripete niente — è il motivo per cui l'owner ha scelto il cursore.
 * ⭐ Il cursore porta anche l'impronta dei filtri: riusarlo con filtri diversi darebbe una pagina di un altro elenco, e
 *   si rifiuta con una nota che dice cosa fare (Anthropic, «Writing effective tools for agents», 11/09/2025: errori
 *   azionabili con un esempio di input giusto).
 * ⭐ Il limite predefinito è piccolo e il tetto è 100; quando c'è altro, la nota dice come restringere o proseguire (Pi,
 *   `packages/coding-agent/src/core/tools/ls.ts:147`, «limit reached. Use limit=… for more»).
 * ⛔ Tutte le frasi sono in INGLESE: arrivano al modello e allo schermo della CLI (contratto §7.3, regola del 03/10).
 */
import { createHash } from 'node:crypto';

export const LIMITE_PREDEFINITO = 20;
export const LIMITE_MASSIMO = 100;
export const FORMATI = Object.freeze(['concise', 'detailed']);
const VERSIONE_CURSORE = 1;

/** L'impronta dei filtri: le chiavi in ordine, i valori così come sono. Corta: viaggia dentro il cursore. */
export function improntaFiltri(filtri = {}) {
  const ordinati = Object.keys(filtri).filter((k) => filtri[k] !== undefined && filtri[k] !== null && filtri[k] !== '').sort()
    .map((k) => [k, filtri[k]]);
  return createHash('sha256').update(JSON.stringify(ordinati)).digest('base64url').slice(0, 12);
}

export function codificaCursore({ attrezzo, chiave, filtri }) {
  return Buffer.from(JSON.stringify({ v: VERSIONE_CURSORE, k: attrezzo, s: chiave, f: improntaFiltri(filtri) })).toString('base64url');
}

/**
 * @returns {{ ok: true, chiave: unknown[] } | { ok: false, nota: string }}
 */
export function decodificaCursore(cursore, { attrezzo, filtri }) {
  let dentro = null;
  try { dentro = JSON.parse(Buffer.from(String(cursore), 'base64url').toString('utf8')); } catch { dentro = null; }
  if (!dentro || dentro.v !== VERSIONE_CURSORE || !Array.isArray(dentro.s)) {
    return { ok: false, nota: `This cursor is not valid. Use only the next_cursor returned by ${attrezzo}, or call it again without cursor.` };
  }
  if (dentro.k !== attrezzo) {
    return { ok: false, nota: `This cursor belongs to ${dentro.k}, not ${attrezzo}. Call ${attrezzo} again without cursor.` };
  }
  if (dentro.f !== improntaFiltri(filtri)) {
    return { ok: false, nota: `The filters changed since this cursor was issued. Call ${attrezzo} again without cursor, with the filters you want.` };
  }
  return { ok: true, chiave: dentro.s };
}

/** Confronta due chiavi (array di numeri o stringhe) in ordine lessicografico. */
export function confrontaChiavi(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i]; const y = b[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

/**
 * Normalizza i parametri comuni. Le note (limite ridotto, formato sconosciuto) tornano insieme: finiscono nella busta.
 * @param {object} argomenti quelli del modello
 * @param {{ limitePredefinito?: number, ordini?: string[], ordinePredefinito?: string }} regole
 */
export function leggiParametriElenco(argomenti = {}, { limitePredefinito = LIMITE_PREDEFINITO, ordini = [], ordinePredefinito = null } = {}) {
  const note = [];
  let limite = Number(argomenti?.limit);
  if (!Number.isFinite(limite) || limite < 1) {
    // review C5 (bugfixer, 10/10): un limite fuori scala si dice, come gli altri valori corretti
    if (argomenti?.limit !== undefined && argomenti?.limit !== null) note.push(`limit must be between 1 and ${LIMITE_MASSIMO}: used ${limitePredefinito}.`);
    limite = limitePredefinito;
  }
  limite = Math.floor(limite);
  if (limite > LIMITE_MASSIMO) { note.push(`limit was reduced to ${LIMITE_MASSIMO}, the maximum.`); limite = LIMITE_MASSIMO; }
  let formato = argomenti?.response_format ?? 'concise';
  if (!FORMATI.includes(formato)) { note.push(`response_format "${formato}" is unknown: used "concise" (or "detailed" for IDs).`); formato = 'concise'; }
  let ordine = argomenti?.sort ?? ordinePredefinito;
  if (ordini.length && !ordini.includes(ordine)) {
    if (argomenti?.sort !== undefined) note.push(`sort "${argomenti.sort}" is unknown: used "${ordinePredefinito}". Valid: ${ordini.join(', ')}.`);
    ordine = ordinePredefinito;
  }
  const cursore = typeof argomenti?.cursor === 'string' && argomenti.cursor !== '' ? argomenti.cursor : null;
  return { limite, formato, ordine, cursore, note };
}

/**
 * ⛔ Review C5 (bugfixer, 10/10/2026): un filtro con un valore sconosciuto svuotava l'elenco IN SILENZIO — «No children match
 *   status=completed» — e il modello lo legge come un fatto. «completed» e «failed» sono per giunta le parole del §6 dell'owner.
 *   ⇒ Un valore si confronta senza maiuscole e trattini, i sinonimi dichiarati valgono, e uno sconosciuto NON filtra: lo dice una
 *   nota coi valori validi, come per `sort`.
 * @param {unknown} valore quello del modello
 * @param {{ nome: string, validi: string[], sinonimi?: Record<string,string> }} regole
 * @returns {{ valore: string|null, nota: string|null }}
 */
export function leggiValoreFiltro(valore, { nome, validi, sinonimi = {} }) {
  if (valore === undefined || valore === null || valore === '') return { valore: null, nota: null };
  const pulito = String(valore).trim().toLowerCase().replace(/[-\s]+/g, '_');
  const trovato = validi.find((v) => v.toLowerCase().replace(/[-\s]+/g, '_') === pulito) ?? sinonimi[pulito] ?? null;
  if (trovato) return { valore: trovato, nota: null };
  return { valore: null, nota: `${nome} "${valore}" is unknown and was ignored. Valid: ${validi.join(', ')}.` };
}

/**
 * Taglia una pagina da voci GIÀ filtrate e ordinate secondo `chiaveDi` (crescente). La voce dopo il cursore è la prima con
 * chiave strettamente maggiore di quella del cursore: niente posizioni, quindi niente salti né doppioni.
 * @returns {{ ok: true, pagina: object[], has_more: boolean, next_cursor: string|null } | { ok: false, nota: string }}
 */
export function paginaDa(voci, { attrezzo, filtri, chiaveDi, limite, cursore }) {
  let inizio = 0;
  if (cursore) {
    const letto = decodificaCursore(cursore, { attrezzo, filtri });
    if (!letto.ok) return letto;
    inizio = voci.findIndex((v) => confrontaChiavi(chiaveDi(v), letto.chiave) > 0);
    if (inizio === -1) inizio = voci.length;
  }
  const pagina = voci.slice(inizio, inizio + limite);
  const altre = voci.length - (inizio + pagina.length);
  const ultima = pagina.at(-1);
  return {
    ok: true,
    pagina,
    has_more: altre > 0,
    next_cursor: altre > 0 && ultima ? codificaCursore({ attrezzo, chiave: chiaveDi(ultima), filtri }) : null,
    restanti: altre,
  };
}

/**
 * ⭐ La RISPOSTA in testo a righe (owner 10/10/2026, AskUserQuestion «Testo a righe»; misurato su 20 note: testo 1.084 token
 *   contro 1.180 del JSON a oggetti — contratto §9). Uguale per tutti:
 *     <testata: cosa, quante mostrate di quante, l'ordine, i filtri>
 *     - <una riga per voce, con la sua impugnatura (id)>
 *     <le note, se ce ne sono>
 *     <N more. Narrow with …, or continue with cursor=<cursore>.>   ← SOLO se ce ne sono altre: senza, l'elenco è finito
 *   La nota dice cosa fare (restringere o proseguire), mai solo «troncato» (Pi `ls.ts:147`; Anthropic, 11/09/2025).
 * @param {{ testa: string, righe: string[], has_more?: boolean, next_cursor?: string|null, restanti?: number, note?: string[], suggerimentoFiltro?: string|null }} p
 */
export function testoElenco({ testa, righe, has_more = false, next_cursor = null, restanti = 0, note = [], suggerimentoFiltro = null }) {
  const fuori = [testa, ...righe.map((r) => `- ${r}`), ...note];
  if (has_more && next_cursor) {
    fuori.push(`${restanti} more.${suggerimentoFiltro ? ` Narrow with ${suggerimentoFiltro},` : ''} or continue with cursor=${next_cursor}`);
  }
  return fuori.join('\n');
}
