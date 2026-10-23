/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — le sole chiavi dei metadati delle righe di compattazione della chat, in un modulo
 * senza dipendenze: la lista dei messaggi le legge all'avvio senza trascinarsi dietro il nucleo della compattazione
 * (il cancello `verify-initial-chunk.mjs` pesa l'avvio). Il resto vive in `compattazioneChat.ts`.
 */
export const TALOS_METADATA_COMPATTAZIONE = 'talos_compattazione'
export const TALOS_METADATA_COMPATTAZIONE_ANNULLATA = 'talos_compattazione_annullata'
/** Ledger LEDGER-RIGA-VIVA-CODICE-2026-10-21 (D-MO-12): la riga «Conversazione non riassunta · <motivo>» del Codice su r4. */
export const TALOS_METADATA_COMPATTAZIONE_FALLITA = 'talos_compattazione_fallita'
