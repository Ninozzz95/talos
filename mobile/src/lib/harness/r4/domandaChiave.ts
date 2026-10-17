/**
 * ⛔ K3-AP2 (ledger `LEDGER-K3-DOMANDE-2026-10-16.md`): la chiave e la forma della riga di una domanda di TALOS nei metadati di un
 * messaggio. File a parte e leggero, come `approvazioneChiave.ts`: lo importa la lista della chat.
 */
import type { FigliaR4 } from './approvazioneChiave'

export const TALOS_METADATA_DOMANDA = 'domanda'

/** Un'opzione com'è nella forma canonica di r4 (`user-question-contract.mjs` `validaDomandeUtente` @ 2161afb32). */
export interface OpzioneDomandaR4 {
    label: string
    description?: string
    recommended?: boolean
    preview?: string
}

/** Una domanda: 1-4 per richiesta; senza `options` è a testo libero. La consigliata, se c'è, è già la prima. */
export interface DomandaUtenteR4 {
    id: string
    header?: string
    question: string
    why?: string
    options?: OpzioneDomandaR4[]
    multiSelect?: boolean
}

/** `UserQuestionResolved` (`agui-events.mjs:401`) senza il tipo e l'id. */
export interface EsitoDomandaR4 {
    status: string
    answers?: Record<string, string | string[]>
    skipped?: string[]
    at?: string
    da?: string
    motivo?: string
    rispostoDa?: string
}

export interface VoceDomandaR4 {
    requestId: string
    questions: DomandaUtenteR4[]
    at: string | null
    origine: { modalita?: string } | null
    /** K3-AP3: la domanda è di una sotto-sessione, disegnata nella madre. */
    figlia?: FigliaR4
    /** `null` finché r4 non manda `UserQuestionResolved`. */
    esito: EsitoDomandaR4 | null
}
