/**
 * ⛔ K3-AP1 (ledger `LEDGER-K3-APPROVAZIONI-2026-10-16.md`): la chiave e la forma della riga d'approvazione nei metadati di un
 * messaggio. File a parte e leggero: lo importa la lista della chat, che non deve tirarsi dietro i dizionari della carta.
 */
export const TALOS_METADATA_APPROVAZIONE = 'approvazione'

/** L'`azione` di `ApprovalRequested` com'è (`agui-events.mjs:334` @ 2161afb32): `{tipo, percorso?, comando?, …}`. */
export type AzioneApprovazioneR4 = Record<string, unknown>

export interface EsitoApprovazioneR4 {
    approvato: boolean
    ambito?: string | null
    motivo?: string | null
}

/**
 * K3-AP3: la carta è di una sotto-sessione (figlia o nipote) disegnata nella madre: la risposta va a lei con `rispostoDa`, il motivo si
 * spiega con la SUA politica (`pending.politica`), e in testa c'è chi chiede (`nome || taskCorto || task`).
 */
export interface FigliaR4 {
    sessionId: string
    chi: string | null
    politica?: { permessi?: unknown; perAttrezzo?: unknown } | null
}

export interface VoceApprovazioneR4 {
    requestId: string
    azione: AzioneApprovazioneR4
    figlia?: FigliaR4
    /** `null` finché r4 non manda `ApprovalResolved`. */
    esito: EsitoApprovazioneR4 | null
}
