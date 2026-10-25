import { avanzaScansione, type TalosScansioneInArrivo } from '@/lib/streaming/desktop/markdown-in-arrivo.js'

/**
 * La riga che apre un recinto disegnato a mano mentre arriva (#24). Tre apici ESATTI: con quattro la scansione dei moduli del
 * desktop chiude il recinto al primo ``` interno, e `~~~` non lo riconosce; quei recinti restano sul parse di sempre.
 */
export const RIGA_RECINTO = /^\s*```(?!`)/

/**
 * L'inizio della riga d'apertura del recinto ancora aperto, o -1 se il testo non finisce dentro un recinto da disegnare a mano.
 * Lo dice la SCANSIONE dei moduli copiati, non una seconda ricerca (revisione del Desktop, 23/10): dentro un recinto aperto il
 * confine stabile è proprio l'inizio della riga d'apertura. Fuori da un recinto il confine può cadere su una riga «```» ancora
 * incompleta: non è un recinto aperto, quindi -1.
 */
export function aperturaDelRecinto(scansione: TalosScansioneInArrivo, testo: string): number {
    const confine = avanzaScansione(scansione, testo)
    if (!scansione.dentroFence) return -1
    const fine = testo.indexOf('\n', confine)
    return RIGA_RECINTO.test(testo.slice(confine, fine < 0 ? testo.length : fine)) ? confine : -1
}
