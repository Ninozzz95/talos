/**
 * K3-RISDEL: la chiave e la forma della riga del risultato di un sotto-agente, da sole. La lista della chat sta nel pezzo d'avvio e
 * le importa senza portarsi dietro i dizionari di `risultatiDelegaR4.ts` (come `compattazioneChiavi.ts`).
 */
export const TALOS_METADATA_RISULTATO_DELEGA = 'risultatoDelega'

export interface VoceRisultatoDelegaR4 {
    codaId: string | null
    childId: string | null
    testo: string
    /** Arrivata col giro che la madre fa per leggerla (`input.risultatiDelega`): il desktop la intesta «Notifica di sistema · …». */
    daGiro: boolean
}
