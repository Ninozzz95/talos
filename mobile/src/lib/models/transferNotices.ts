/**
 * Quando dirlo, e cosa: i tre momenti di un modello che arriva.
 *
 * Owner 2026-08-05: «un sistema di notifiche globale (grammatica già esistente)
 * per segnalare inizio download, fine download e installazione dei modelli
 * locali, che va di pari passo col sistema di notifiche Android».
 *
 * ## Cosa mancava davvero
 *
 * Il lato **Android c'era gia'**: `TalosTransferNotification` posta il
 * progresso con `setProgress` e l'azione pausa, e `announceEnd` annuncia la
 * fine. Il lato **dentro l'app no**: il flusso di trasferimento non spingeva
 * **nessun** toast. Quindi chi stava guardando la schermata vedeva una barra
 * muoversi e nient'altro, mentre chi era fuori dall'app riceveva una notifica.
 * Il buco era esattamente il «di pari passo».
 *
 * ## Il fatto scomodo: non esiste una fase «completato»
 *
 * `TalosTransferPhase` e' `waiting · queued · running · pausing · paused ·
 * verifying · failed`. Un download **riuscito non ha uno stato**: sparisce
 * dalla lista. E sparisce anche un download **annullato**.
 *
 * Non lo si indovina. Chi annulla lo sa — l'annullamento passa da qui — quindi
 * lo si **dichiara**: gli id annullati vengono dimenticati apposta e la loro
 * sparizione non annuncia niente. Resta un solo caso ambiguo, la sparizione di
 * qualcosa che nessuno ha annullato e che non era arrivato in fondo: li' si
 * tace, perche' annunciare «finito» un download interrotto e' peggio che non
 * annunciare niente.
 *
 * Sarebbe piu' pulito se il nativo dicesse «completato» — lo sa, visto che
 * `announceEnd` lo posta. Esporlo e' il seguito naturale di questo lavoro.
 */

/** Il minimo che serve sapere di un trasferimento per raccontarlo. */
export interface TalosNoticeableTransfer {
    id: string
    phase: string
    modelName: string | null
    haveBytes: number
    totalBytes: number
}

export type TalosTransferNotice =
    | { kind: 'started'; modelName: string }
    | { kind: 'finished'; modelName: string }
    | { kind: 'failed'; modelName: string }

function nome(item: TalosNoticeableTransfer): string {
    return item.modelName ?? item.id
}

/** Arrivato in fondo: tutti i byte, e ce n'era almeno uno da prendere. */
function completo(item: TalosNoticeableTransfer): boolean {
    return item.totalBytes > 0 && item.haveBytes >= item.totalBytes
}

/**
 * Cosa annunciare, confrontando due istantanee.
 *
 * Puro: nessun accesso allo store, nessun toast spinto da qui. Chi chiama
 * decide dove finiscono le frasi — ed e' cio' che rende questa regola
 * verificabile senza un dispositivo.
 *
 * @param cancellati id che l'utente ha annullato: la loro sparizione non e' una
 *     fine, e va taciuta.
 */
export function talosTransferNotices(
    prima: readonly TalosNoticeableTransfer[],
    dopo: readonly TalosNoticeableTransfer[],
    cancellati: ReadonlySet<string> = new Set(),
): TalosTransferNotice[] {
    const precedenti = new Map(prima.map((item) => [item.id, item]))
    const correnti = new Map(dopo.map((item) => [item.id, item]))
    const avvisi: TalosTransferNotice[] = []

    for (const item of dopo) {
        const era = precedenti.get(item.id)
        // Comparso adesso: e' partito.
        if (!era) {
            avvisi.push({ kind: 'started', modelName: nome(item) })
            continue
        }
        // Caduto adesso: una volta sola, non a ogni giro del poller.
        if (item.phase === 'failed' && era.phase !== 'failed') {
            avvisi.push({ kind: 'failed', modelName: nome(item) })
        }
    }

    for (const era of prima) {
        if (correnti.has(era.id)) continue
        if (cancellati.has(era.id)) continue
        // Sparito senza essere stato annullato: e' finito solo se era arrivato
        // in fondo. Altrimenti si tace — vedi la nota in testa al file.
        if (era.phase !== 'failed' && completo(era)) {
            avvisi.push({ kind: 'finished', modelName: nome(era) })
        }
    }

    return avvisi
}
