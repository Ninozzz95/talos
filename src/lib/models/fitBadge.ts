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
 * ## Ma il disco e' un muro SUO, e prima
 *
 * Owner 2026-08-04: «sul tablet ci sono 38 GB liberi, non 395». Aver capito che
 * il verdetto giusto e' sulla RAM non voleva dire che il disco non conta —
 * voleva dire che sono DUE domande, e che una lista che ne fa una sola mente
 * nel caso ordinario del telefono quasi pieno.
 *
 * Le due si riparano in modi opposti: lo spazio si libera, la memoria no. Per
 * questo il disco si guarda per PRIMO e ha parole sue — «Non c'e' spazio», con
 * quanti byte mancano. Dire «non gira qui» a chi ha solo il telefono pieno lo
 * manda a cercare un modello piu' piccolo, che e' la cura sbagliata.
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
import type { TalosCapacityVerdict } from './fit'

export type TalosFitTone = 'ok' | 'tight' | 'over' | 'unknown'

export interface TalosFitBadge {
    /** Il colore della cosa: verde, giallo, rosso. */
    tone: TalosFitTone
    /** Quanto del disponibile occupa, da 0 a 1. Oltre 1 significa che sfora. */
    ratio: number | null
    /** La chiave della frase corta, quella dentro la pillola. */
    labelKey: string
    /** La chiave della frase che spiega, sotto. */
    reasonKey: string
}

const TONE: Record<Exclude<TalosCapacityVerdict['state'], 'unknown'>, TalosFitTone> = {
    fits: 'ok',
    tight: 'tight',
    'memory-blocked': 'over',
    'storage-blocked': 'over',
}

const KEY: Record<Exclude<TalosCapacityVerdict['state'], 'unknown'>, string> = {
    fits: 'comfortable',
    tight: 'tight',
    'memory-blocked': 'no-memory',
    'storage-blocked': 'no-space',
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
export function talosFitBadge(input: TalosCapacityVerdict): TalosFitBadge {
    if (input.state === 'unknown') {
        return {
            tone: 'unknown',
            ratio: null,
            labelKey: 'models.fitLabel.unknown',
            reasonKey: `models.fitReason.unknown-${input.reason}`,
        }
    }

    const tone = TONE[input.state]
    const denominatore = Math.max(1, input.availableBytes)
    const ratio = Math.min(1.6, input.needsBytes / denominatore)
    const chiave = KEY[input.state]
    return {
        tone,
        ratio,
        labelKey: `models.fitLabel.${chiave}`,
        reasonKey: `models.fitReason.${chiave}`,
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
