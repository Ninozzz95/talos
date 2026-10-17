/**
 * K3 Stop come il desktop (ledger `LEDGER-K3-STOP-2026-10-16.md`): la chiave e la forma della riga dello Stop, da sole. La lista della
 * chat sta nel pezzo d'avvio e le importa senza portarsi dietro i dizionari di `fermatoR4.ts` (come `risultatoDelegaChiave.ts`).
 */
export const TALOS_METADATA_FERMATO = 'fermatoR4'

export interface VoceFermatoR4 {
    /** Il messaggio del `RunError` così com'è: dice dove si è fermato, e resta nel dettaglio «Testo del server». */
    tecnico: string
}
