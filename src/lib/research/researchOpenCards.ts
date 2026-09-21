/**
 * Le due schede che il rapporto tiene APERTE, e il pezzo da evidenziare.
 *
 * ## Perché aperte, e non dietro un tocco
 *
 * Il dissenso fra le fonti e l'affermazione che dice più di quanto la sua
 * pagina sostenga sono le due cose che nessun concorrente mostra. Finiscono
 * dietro un tocco solo se si dà per scontato che la persona vada a cercarle —
 * ma chi legge un rapporto al 86% non ha motivo di aprire proprio quella riga,
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
import type { TalosResearchChecks, TalosResearchSpan } from './researchVerification'

/**
 * Un passaggio spezzato in tre, per evidenziare il pezzo che il giudice ha
 * riconosciuto. `quote` vuota vuol dire «non si evidenzia niente»: il testo
 * intero è in `before` e si stampa così com'è.
 */
export interface TalosResearchMarkedPassage {
    readonly before: string
    readonly quote: string
    readonly after: string
}

/**
 * ⛔ Lo span è stato calcolato quando la pagina è stata letta, e il passaggio
 * viene dal disco: sono due dati che possono essersi disallineati. Un indice
 * fuori misura NON evidenzia il pezzo sbagliato — non evidenzia niente, e il
 * passaggio si legge intero. Evidenziare a caso è peggio che non evidenziare,
 * perché sposta la fiducia su una parola che nessuno ha giudicato.
 */
export function talosResearchMarkedPassage(
    passage: string | null | undefined,
    span: TalosResearchSpan | null | undefined,
): TalosResearchMarkedPassage {
    const testo = passage ?? ''
    const intero = { before: testo, quote: '', after: '' }
    if (!span) return intero

    const { from, to } = span
    if (!Number.isInteger(from) || !Number.isInteger(to)) return intero
    if (from < 0 || to > testo.length || from >= to) return intero

    return { before: testo.slice(0, from), quote: testo.slice(from, to), after: testo.slice(to) }
}

/** Il minimo che serve per scegliere: il resto della scheda non lo decide questo file. */
export interface TalosResearchOpenClaim {
    readonly text: string
    readonly passage: string
    readonly checks: TalosResearchChecks
}

/** L'affermazione scelta e il suo posto nell'elenco, perché la scheda ci porti. */
export interface TalosResearchOpenCard<T> {
    readonly claim: T
    readonly index: number
}

function scegli<T extends TalosResearchOpenClaim>(
    claims: readonly T[] | null | undefined,
    vale: (claim: T) => boolean,
): TalosResearchOpenCard<T> | null {
    if (!claims) return null
    for (let index = 0; index < claims.length; index += 1) {
        const claim = claims[index]
        if (claim && vale(claim)) return { claim, index }
    }
    return null
}

/**
 * La prima contesa CHE HA I PASSAGGI CONTRARI.
 *
 * ⛔ `opposing` assente non vuol dire «non ce ne sono»: vuol dire «una verifica
 * vecchia non li ha guardati». In entrambi i casi non c'è niente da affiancare,
 * e la scheda non si apre.
 */
export function talosResearchContestedCard<T extends TalosResearchOpenClaim>(
    claims: readonly T[] | null | undefined,
): TalosResearchOpenCard<T> | null {
    return scegli(claims, (claim) =>
        claim.checks.claimSupported === 'contested'
        && (claim.checks.opposing ?? []).some((contro) => Boolean(contro.passage?.trim())))
}

/**
 * La prima che eccede la sua fonte, col motivo per cui la eccede.
 *
 * Senza motivo la scheda ripeterebbe la riga dell'elenco; il valore è la frase
 * che dice DOVE l'affermazione va oltre, non il verdetto.
 */
export function talosResearchOverreachingCard<T extends TalosResearchOpenClaim>(
    claims: readonly T[] | null | undefined,
): TalosResearchOpenCard<T> | null {
    return scegli(claims, (claim) =>
        claim.checks.claimSupported === 'partial'
        && Boolean(claim.checks.supportReason?.trim())
        && Boolean(claim.passage?.trim()))
}
