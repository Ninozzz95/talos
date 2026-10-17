/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`): la chiave e la forma della carta del piano nei metadati di un messaggio. File
 * a parte e leggero, come `domandaChiave.ts`: lo importa la lista della chat, che sta nel pacchetto d'avvio. Solo la costante e i
 * tipi: la lettura dell'evento è in `pianoEventoR4.ts` (un modulo condiviso col pacchetto d'avvio ci entrerebbe intero). Le forme sono quelle che
 * `parsePlanEvent` del desktop r4 @ 701c6c0d2 (`components/plan-artifact.js:20`) tira fuori dall'evento `talos.plan.v1`.
 */
export const TALOS_METADATA_PIANO = 'piano'

/** Le quattro scelte di `plan-contract.mjs` (`DECISIONI_PIANO`), nell'ordine dell'owner. */
export type DecisionePianoR4 = 'procedi-con-conferma' | 'procedi-accetta-modifiche' | 'conversazione-pulita' | 'continua-a-pianificare'

/** Un piano presentato: approvabile solo con la sua richiesta e la sua impronta (`present_plan`); `unavailable` = troppo lungo. */
export interface PropostaPianoR4 {
    planId: string
    revision: number
    status: 'proposed' | 'unavailable'
    text: string | null
    at: string
    requestId?: string
    hash?: string
}

/** La scelta sul piano o la sua chiusura senza scelta: sempre legata alla richiesta e alla revisione. */
export interface DecisionePianoFattaR4 {
    planId: string
    revision: number
    status: 'approved' | 'changes-requested' | 'cancelled'
    requestId: string
    hash: string
    at: string
    da: 'persona' | 'sistema'
    decisione?: DecisionePianoR4
    feedback?: string
    nuovaSessionId?: string
    motivo?: string | null
}

export interface VocePianoR4 {
    proposta: PropostaPianoR4
    /** `null` finché r4 non manda la decisione della stessa revisione. */
    esito: DecisionePianoFattaR4 | null
}
