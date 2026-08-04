/**
 * La capienza, resa visibile.
 *
 * Owner 2026-08-04, sul mockup approvato: «come etichetta che vedo sempre».
 *
 * ## Perche' un'etichetta e non un filtro
 *
 * Nascondere un modello perche' oggi non c'e' spazio toglie l'informazione che
 * domani, liberando memoria, potrebbe starci. E toglie anche il motivo per
 * liberarla: si vede un elenco piu' corto e non si sa perche'.
 *
 * Quindi si vedono tutti, e ognuno dice come sta rispetto a QUESTO telefono.
 *
 * ## RAM, non spazio su disco. E va DETTO.
 *
 * Owner 2026-08-04, guardando la schermata: «ho paura che tu stia confondendo
 * la memoria RAM con la memoria di archiviazione». Aveva ragione a temerlo, e
 * il difetto era nelle PAROLE: «ci sta» si legge come spazio, e lo spazio non
 * e' mai il problema — su quel telefono ce n'erano 395 GB liberi contro 4,3 GB
 * di RAM.
 *
 * RICERCATO 2026-08-04: con `mmap` llama.cpp puo' aprire un modello piu' grande
 * della RAM, perche' il sistema pagina i pesi da disco su richiesta. Ma per
 * generare UN token servono quasi tutti i pesi, quindi in pratica il modello
 * deve stare in memoria: se non ci sta, il telefono passa il tempo a leggere
 * dal disco e Android chiude l'app sotto pressione.
 *
 * Quindi il verdetto sulla RAM e' quello giusto — e le parole ora lo dicono:
 * «Gira bene», «Non gira qui», non «ci sta».
 *
 * ## Il numero contro cui si misura
 *
 * Non una soglia generica: `availableRamBytes`, che
 * `TalosDeviceCapacityPlugin` legge dal sistema. E' la differenza fra «5,4 GB»
 * — un numero che devi interpretare tu — e «non ci sta, ne servono 1,3 in piu'».
 *
 * I quattro verdetti non sono inventati qui: vengono da `talosModelFit`, che
 * gia' pesa contesto, cache e soglia di memoria bassa. Questo modulo li
 * TRADUCE, e non decide niente per conto suo — se un giorno il calcolo cambia,
 * cambia in un posto solo.
 */
import type { TalosModelBand } from './fit'

export type TalosFitTone = 'ok' | 'tight' | 'over'

export interface TalosFitBadge {
    /** Il colore della cosa: verde, giallo, rosso. */
    tone: TalosFitTone
    /** Quanto del disponibile occupa, da 0 a 1. Oltre 1 significa che sfora. */
    ratio: number
    /** La chiave della frase corta, quella dentro la pillola. */
    labelKey: string
    /** La chiave della frase che spiega, sotto. */
    reasonKey: string
}

const TONE: Record<TalosModelBand, TalosFitTone> = {
    comfortable: 'ok',
    tight: 'tight',
    // «Girera' lentissimo» non e' «non ci sta», ma per chi guarda una lista la
    // decisione e' la stessa: non prenderlo. Il perche' resta nella frase
    // sotto, che e' il posto dove una sfumatura si puo' spiegare.
    'will-crawl': 'over',
    'wont-run': 'over',
}

/**
 * Da verdetto a etichetta.
 *
 * `ratio` puo' superare 1 di proposito: e' cio' che permette alla barra di
 * OLTREPASSARE visibilmente il segno della memoria libera, invece di fermarsi
 * al bordo e dirlo solo a parole. Un limite superato che si vede non ha bisogno
 * di essere letto.
 *
 * Il tetto a 1.6 e' per il disegno, non per la verita': un modello dieci volte
 * troppo grande disegnerebbe una barra fuori dallo schermo, e «dieci volte» e
 * «due volte» portano alla stessa decisione. Il numero esatto resta nella
 * frase.
 */
export function talosFitBadge(input: {
    band: TalosModelBand
    /** Quanto pesa una volta caricato: file piu' cache, non solo il file. */
    needsBytes: number
    availableBytes: number
}): TalosFitBadge {
    const tone = TONE[input.band]
    const denominatore = Math.max(1, input.availableBytes)
    const ratio = Math.min(1.6, input.needsBytes / denominatore)
    return {
        tone,
        ratio,
        labelKey: `models.fitLabel.${input.band}`,
        reasonKey: `models.fitReason.${input.band}`,
    }
}

/**
 * Quanto resta dopo, o quanto manca.
 *
 * Positivo: lo spazio che avanza. Negativo: quello che serve in piu'. E' la
 * sola forma in cui questo numero e' azionabile — «5,4 GB» non dice a nessuno
 * quanto deve liberare.
 */
export function talosFitDelta(needsBytes: number, availableBytes: number): number {
    return availableBytes - needsBytes
}
