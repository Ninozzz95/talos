/*
 * ⭐ 27/09/2026, decisione owner (memoria `decisioni-owner-capacita-sezioni-27-09`) — LA RICERCA PER PAROLE, una per tutte le
 *   sezioni che il modello legge (Memoria, Note, Attività, Ricerca approfondita).
 *
 * Il difetto che l'ha fatta nascere (sessione 56066b64): «che memorie ho?» → `memory_search` con «memorie salvate
 *   dall'utente» e poi con «*», due volte «Nothing remembered matches that.» con 5 memorie nel negozio. `cercaMemorie`
 *   cercava la FRASE INTERA come sottostringa, e una ricerca vuota restituiva zero.
 *
 * ⇒ La forma è quella che la Libreria usa già (`library-store.mjs` `punteggioRicerca`: ogni parola conta, il titolo pesa
 *   3, il corpo 1), con tre cose in più:
 *   1. le parole si confrontano SENZA accenti e senza punteggiatura («attivita» trova «Attività», «dall'utente» diventa
 *      «dall» e «utente»);
 *   2. le parole di una o due lettere («di», «la», «a») si lasciano fuori quando ne restano altre: da sole trovano tutto;
 *   3. una ricerca vuota o «*» vuol dire TUTTO, come la forma «sfoglia» di Hermes (`session_search_tool.py:603`: senza
 *      query elenca le recenti) e come `view /memories` dell'attrezzo memoria di Claude (platform.claude.com, «Memory
 *      tool», 27/09).
 * PURA: niente I/O, un test la esercita con array letterali.
 */

const PAROLA_CORTA = 2;

/** Minuscolo e senza segni diacritici: «Attività» → «attivita». */
export function piega(testo) {
  return String(testo ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Vero quando la ricerca chiede tutto: vuota, solo spazi, o fatta di soli `*`. */
export function chiedeTutto(query) {
  return /^[\s*]*$/u.test(String(query ?? ''));
}

/**
 * Le parole di una ricerca, piegate. Le parole di 1-2 LETTERE restano solo se sono le uniche; un NUMERO resta sempre.
 * ⛔ 27/09/2026, collaudo vero sul 4174: «Nota di prova 3» perdeva il «3» come parola corta, e le cinque «Nota di prova N»
 *   avevano lo stesso punteggio — il modello ha scelto la nota giusta dall'elenco, ma per fortuna. «di», «la», «a» non dicono
 *   niente; «3», «16», «0.1.16» dicono esattamente che cosa si cerca.
 * @returns {string[]}
 */
export function paroleDellaRicerca(query) {
  const tutte = [...new Set(piega(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean))];
  const utili = tutte.filter((p) => p.length > PAROLA_CORTA || /\p{N}/u.test(p));
  return utili.length > 0 ? utili : tutte;
}

/**
 * Il punteggio di una voce: 3 per ogni parola nel titolo, 1 per ogni parola nel corpo. Zero = non è un risultato.
 * @param {{titolo?:string, corpo?:string}} voce
 * @param {string[]} parole già passate da `paroleDellaRicerca`
 */
export function punteggioPerParole({ titolo = '', corpo = '' } = {}, parole = []) {
  if (parole.length === 0) return 0;
  const t = piega(titolo);
  const c = piega(corpo);
  let punti = 0;
  for (const parola of parole) {
    if (t.includes(parola)) punti += 3;
    if (c.includes(parola)) punti += 1;
  }
  return punti;
}

/**
 * Filtra e ordina. Con una ricerca vuota o «*» torna TUTTE le voci nell'ordine ricevuto (chi chiama le passa già dalla più
 * recente) e `tutte: true`. Altrimenti le voci con punteggio > 0, dalla più pertinente; a parità, l'ordine ricevuto.
 * @template T
 * @param {T[]} voci
 * @param {(voce: T) => {titolo?:string, corpo?:string}} testiDi
 * @returns {{ trovate: T[], tutte: boolean, parole: string[] }}
 */
export function cercaPerParole(voci, query, testiDi) {
  if (chiedeTutto(query)) return { trovate: [...voci], tutte: true, parole: [] };
  const parole = paroleDellaRicerca(query);
  const trovate = voci
    .map((voce, indice) => ({ voce, indice, punti: punteggioPerParole(testiDi(voce), parole) }))
    .filter((r) => r.punti > 0)
    .sort((a, b) => b.punti - a.punti || a.indice - b.indice)
    .map((r) => r.voce);
  return { trovate, tutte: false, parole };
}
