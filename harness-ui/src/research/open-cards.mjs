/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchOpenCards.ts (112 righe, 11/09/2026).
 *
 * Le due schede che il rapporto tiene APERTE, e il pezzo da evidenziare.
 *
 * ## Perché aperte, e non dietro un tocco
 *
 * Il dissenso fra le fonti e l'affermazione che dice più di quanto la sua
 * pagina sostenga sono le due cose che nessun concorrente mostra. Finiscono
 * dietro un tocco solo se si dà per scontato che la persona vada a cercarle —
 * ma chi legge un rapporto all'86% non ha motivo di aprire proprio quella riga,
 * ed è esattamente quella che gli serve.
 *
 * ⇒ Il rapporto porta in superficie UNA contesa e UNA che eccede. Non tutte:
 * una scheda ciascuna, come esempio leggibile, e l'elenco completo resta nella
 * scheda «Affermazioni». Il mockup approvato disegna esattamente questo.
 *
 * ## Perché una scheda si può RIFIUTARE di mostrare
 *
 * Una contesa senza i passaggi contrari disegnerebbe due colonne di cui una
 * vuota; una parziale senza il motivo direbbe «sostenuta solo in parte» e
 * nient'altro — cioè quello che la riga dell'elenco già dice. In entrambi i
 * casi la scheda occupa lo schermo e non aggiunge niente, e allora non si
 * mostra. `null` è un esito, non un guasto.
 */

/**
 * @typedef {import('./verification.mjs').TalosResearchChecks} TalosResearchChecks
 * @typedef {import('./verification.mjs').TalosResearchSpan} TalosResearchSpan
 */

/**
 * Un passaggio spezzato in tre, per evidenziare il pezzo che il giudice ha
 * riconosciuto. `quote` vuota vuol dire «non si evidenzia niente»: il testo
 * intero è in `before` e si stampa così com'è.
 *
 * @typedef {object} TalosResearchMarkedPassage
 * @property {string} before
 * @property {string} quote
 * @property {string} after
 */

/**
 * ⛔ Lo span è stato calcolato quando la pagina è stata letta, e il passaggio
 * viene dal disco: sono due dati che possono essersi disallineati. Un indice
 * fuori misura NON evidenzia il pezzo sbagliato — non evidenzia niente, e il
 * passaggio si legge intero. Evidenziare a caso è peggio che non evidenziare,
 * perché sposta la fiducia su una parola che nessuno ha giudicato.
 *
 * @param {string | null | undefined} passage
 * @param {TalosResearchSpan | null | undefined} span
 * @returns {TalosResearchMarkedPassage}
 */
export function talosResearchMarkedPassage(passage, span) {
  const testo = passage ?? '';
  const intero = { before: testo, quote: '', after: '' };
  if (!span) return intero;

  const { from, to } = span;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return intero;
  if (from < 0 || to > testo.length || from >= to) return intero;

  return { before: testo.slice(0, from), quote: testo.slice(from, to), after: testo.slice(to) };
}

/**
 * Il minimo che serve per scegliere: il resto della scheda non lo decide questo file.
 *
 * @typedef {object} TalosResearchOpenClaim
 * @property {string} text
 * @property {string} passage
 * @property {TalosResearchChecks} checks
 */

/**
 * L'affermazione scelta e il suo posto nell'elenco, perché la scheda ci porti.
 *
 * @template T
 * @typedef {object} TalosResearchOpenCard
 * @property {T} claim
 * @property {number} index
 */

/**
 * @template {TalosResearchOpenClaim} T
 * @param {readonly T[] | null | undefined} claims
 * @param {(claim: T) => boolean} vale
 * @returns {TalosResearchOpenCard<T> | null}
 */
function scegli(claims, vale) {
  if (!claims) return null;
  for (let index = 0; index < claims.length; index += 1) {
    const claim = claims[index];
    if (claim && vale(claim)) return { claim, index };
  }
  return null;
}

/**
 * La prima contesa CHE HA I PASSAGGI CONTRARI.
 *
 * ⛔ `opposing` assente non vuol dire «non ce ne sono»: vuol dire «una verifica
 * vecchia non li ha guardati». In entrambi i casi non c'è niente da affiancare,
 * e la scheda non si apre.
 *
 * @template {TalosResearchOpenClaim} T
 * @param {readonly T[] | null | undefined} claims
 * @returns {TalosResearchOpenCard<T> | null}
 */
export function talosResearchContestedCard(claims) {
  return scegli(claims, (claim) =>
    claim.checks.claimSupported === 'contested'
    && (claim.checks.opposing ?? []).some((contro) => Boolean(contro.passage?.trim())));
}

/**
 * La prima che eccede la sua fonte, col motivo per cui la eccede.
 *
 * Senza motivo la scheda ripeterebbe la riga dell'elenco; il valore è la frase
 * che dice DOVE l'affermazione va oltre, non il verdetto.
 *
 * @template {TalosResearchOpenClaim} T
 * @param {readonly T[] | null | undefined} claims
 * @returns {TalosResearchOpenCard<T> | null}
 */
export function talosResearchOverreachingCard(claims) {
  return scegli(claims, (claim) =>
    claim.checks.claimSupported === 'partial'
    && Boolean(claim.checks.supportReason?.trim())
    && Boolean(claim.passage?.trim()));
}
