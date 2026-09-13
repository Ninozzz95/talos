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
 * ✅ FATTO il 2026-08-06: il nativo ORA lo dice. `TalosTransferSession.finish`
 * registra l'arrivo e `status()` lo consegna una volta sola, quindi qui restano
 * solo i due momenti che una istantanea puo' onestamente vedere — «e' partito»
 * e «e' caduto». La fine non si deduce piu'.
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

/**
 * Cosa annunciare, confrontando due istantanee.
 *
 * Puro: nessun accesso allo store, nessun toast spinto da qui. Chi chiama
 * decide dove finiscono le frasi — ed e' cio' che rende questa regola
 * verificabile senza un dispositivo.
 *
 * ⛔ Niente piu' `cancellati`: serviva a tacere la sparizione di un download
 * annullato, e le sparizioni qui non si guardano piu'. Chi annulla non deve
 * dichiararlo a questa funzione — il che e' un obbligo in meno che si poteva
 * dimenticare.
 */
export function talosTransferNotices(
    prima: readonly TalosNoticeableTransfer[],
    dopo: readonly TalosNoticeableTransfer[],
): TalosTransferNotice[] {
    const precedenti = new Map(prima.map((item) => [item.id, item]))
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

    /**
     * ⛔ E QUI non c'e' piu' niente.
     *
     * Fino al 2026-08-06 questo ciclo deduceva la fine di un download dalla
     * SPARIZIONE di una riga: «c'era, non c'e' piu', ed era arrivata in fondo».
     * Sembra ragionevole e ha un difetto che non si vede leggendolo — funziona
     * **solo se qualcuno stava guardando nell'istante esatto** della sparizione.
     *
     * MISURATO sul Pad: 214 MB arrivati in meno di dodici secondi, la schermata
     * «questo dispositivo» aperta e visibile per tutto il tempo, e il conteggio
     * fermo a tre mentre sul disco i modelli erano quattro. L'owner l'aveva
     * segnalato due volte, e due correzioni precedenti avevano allungato la vita
     * dell'osservatore senza toccare la cosa sbagliata: non era chi guardava, era
     * **il fatto che si dovesse guardare**.
     *
     * Adesso la fine la dichiara il nativo, che l'ha compiuta: `status()`
     * riporta gli arrivi e li consegna una volta sola. Un fatto non si deduce da
     * chi passava di li'.
     */
    return avvisi
}
