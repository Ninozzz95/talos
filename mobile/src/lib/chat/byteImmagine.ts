import type { InjectionKey } from 'vue'

/**
 * ⛔ K3-C Allegati A2 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`; owner 16/10 «Anteprima vera»): chi legge i byte di un'immagine della
 * bolla. Nella chat è la Libreria (`controller.attachments.previewBytes`); nel Codice su r4 le immagini stanno in r4, e la schermata
 * fornisce un lettore suo. `null` = l'immagine non si legge (resta l'etichetta col nome).
 */
export type TalosLettoreByteImmagine = (fileId: string) => Promise<Uint8Array | null>

export const TALOS_BYTE_IMMAGINE: InjectionKey<TalosLettoreByteImmagine> = Symbol('talos-byte-immagine')
