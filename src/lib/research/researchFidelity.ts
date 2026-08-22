import {
    talosResearchIndependentSources,
    type TalosResearchSourceOrigin,
} from '@/lib/research/researchIndependence'
import type { TalosResearchVerifiedClaim } from '@/lib/research/researchVerification'

/**
 * ⛔⛔ FEDELTA-05 — le quattro misure, e il divieto di darne una quando non c'è.
 *
 * ## Da dove vengono, misurato il 2026-08-20
 *
 * Ricerca sui benchmark 2026 per gli agenti di ricerca profonda — DeepResearch
 * Bench, TRACE, e il lavoro sull'attribuzione delle fonti. Le dimensioni su cui
 * si giudica un rapporto sono **copertura**, **fedeltà delle citazioni**,
 * **ancoraggio delle affermazioni**, e quante **prove distinte** ci sono
 * davvero — che conta quanto le altre tre, e nessuno la mostra.
 *
 * ⛔ La stessa ricerca dice perché una misura del genere invecchia: la metrica
 * FACT è considerata inaffidabile per la riproducibilità **perché le pagine
 * citate diventano irraggiungibili nel tempo**. Da qui due conseguenze che
 * stanno nel codice e non in un commento: ogni punteggio esce con la sua
 * **data**, e accanto a queste misure ci vuole la tenuta nel tempo.
 *
 * ## ⛔ La regola che conta più delle formule
 *
 * Un numero su cui nessuno ha giudicato non è un numero basso: **non è un
 * numero**. Una ricerca senza giudice non produce «40%», produce «non
 * verificata» — perché un 40% viene letto come una misura, e sarebbe una
 * misura di niente. Per questo ogni quota è `number | null`, e il `null` non è
 * un valore mancante: è l'unica risposta onesta.
 *
 * ⛔ Il conteggio delle fonti indipendenti fa eccezione, e la ragione è che non
 * dipende dal giudice: si vede dagli indirizzi. Una ricerca non verificata può
 * comunque dire quante prove distinte ha raccolto.
 */

export interface TalosResearchFidelityInput {
    readonly claims: readonly TalosResearchVerifiedClaim[]
    readonly sources: readonly TalosResearchSourceOrigin[]
}

export interface TalosResearchFidelity {
    /** Falso quando nessuno ha giudicato: allora le quote sono tutte `null`. */
    readonly verified: boolean
    /** Quota di affermazioni su cui un giudizio è arrivato. */
    readonly coverage: number | null
    /** Quota di affermazioni il cui passaggio è stato ritrovato nella pagina. */
    readonly citationFaithfulness: number | null
    /** Quanto le affermazioni giudicate reggono davvero: piena 1, parziale 0,5. */
    readonly claimGroundedness: number | null
    /** Prove distinte, non URL. Si conta anche senza giudice. */
    readonly independentSources: number
    /** ⛔ Quando: un punteggio senza data è una promessa che scade in silenzio. */
    readonly measuredAt: string | null
}

/**
 * ⛔ Una parziale vale MEZZA, e non è una convenzione arbitraria.
 *
 * Contarla come una sostenuta gonfierebbe il rapporto proprio dove è più
 * fragile; contarla come zero cancellerebbe una verifica che è riuscita a metà,
 * e spingerebbe a non usare mai «parziale» — cioè a perdere la distinzione più
 * utile che abbiamo.
 */
const PESO: Record<string, number> = { yes: 1, partial: 0.5, no: 0, unchecked: 0 }

export function talosResearchFidelity(
    input: TalosResearchFidelityInput,
): TalosResearchFidelity {
    const indipendenti = talosResearchIndependentSources(input.sources)
    const totali = input.claims.length
    const giudicate = input.claims.filter((entry) => entry.checks.judge !== null)

    if (totali === 0 || giudicate.length === 0) {
        return {
            verified: false,
            coverage: null,
            citationFaithfulness: null,
            claimGroundedness: null,
            independentSources: indipendenti.independent,
            measuredAt: null,
        }
    }

    // ⛔ Il passaggio conta come citazione solo se è stato ritrovato NELLA
    // pagina: uno preso da uno snippet di ricerca non è la fonte, è il modo in
    // cui il motore l'ha riassunta, e un `missing` non è una citazione affatto.
    const conPassaggio = input.claims.filter(
        (entry) => entry.checks.resolved === 'page' && entry.checks.quotePresent,
    ).length

    const peso = giudicate.reduce(
        (somma, entry) => somma + (PESO[entry.checks.claimSupported] ?? 0),
        0,
    )

    /*
     * La data è la PIÙ RECENTE fra i giudizi: è il momento in cui questo
     * punteggio ha smesso di essere aggiornato, ed è quello che serve sapere
     * per decidere se rileggerlo.
     */
    const date = giudicate
        .map((entry) => entry.checks.judgedAt)
        .filter((quando): quando is string => typeof quando === 'string' && quando.length > 0)
        .sort()

    return {
        verified: true,
        coverage: giudicate.length / totali,
        citationFaithfulness: conPassaggio / totali,
        claimGroundedness: peso / giudicate.length,
        independentSources: indipendenti.independent,
        measuredAt: date.at(-1) ?? null,
    }
}
