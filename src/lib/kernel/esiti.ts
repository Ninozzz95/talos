/**
 * ⭐⭐⭐ IL VOCABOLARIO DEGLI ESITI — dove si impedisce di DIRE una cosa non
 * provata.
 *
 * Il resto del kernel impedisce di **scrivere** codice fondato su una premessa
 * falsa. Questo file chiude l'altra metà: impedisce di **raccontare** un esito
 * più forte di quello osservato. Sono due bugie diverse, e la seconda è più
 * facile da dire perché non lascia traccia nel diff.
 *
 * ## ⛔⛔⛔ Il codice di uscita NON è l'esito dei test
 *
 * Sono due fatti distinti, e li ho pagati tutti e due su questo progetto:
 *
 * - **la CI verde che non aveva eseguito niente** — usciva 0 perché moriva
 *   prima di arrivare ai test. Chiamarla «passati» è la bugia perfetta: nessuno
 *   la scopre finché non si rompe qualcosa in produzione.
 * - **l'uscita 1 con zero test rossi** — un teardown che non chiudeva. Chiamarla
 *   «falliti» manda a caccia di un difetto che nei test non c'è.
 *
 * ⇒ Se le due cose non concordano, l'esito è **ignoto**. Non si sceglie la più
 * comoda delle due, e nemmeno la più prudente: si dice che non si sa.
 *
 * ## ⛔⛔ I quattro divieti
 *
 * ```
 * compilato          ⇏ passati
 * typecheck verde    ⇏ passati
 * passati sul PC     ⇏ passati sul telefono
 * non eseguito       ⇏ passati
 * ```
 *
 * ⛔ Il terzo conta soprattutto qui: la sezione di codice gira **sul telefono**,
 * e su Android una fetta di test non può girare affatto — un addon nativo senza
 * build arm64, un browser vero, un demone di sistema. Quella non è una
 * sconfitta: è una **capacità che manca**, e va detta con il suo nome, o il
 * modello si mette a «riparare» codice sano.
 */

/** Perché una suite non poteva girare *prima ancora* di provarci. */
export interface TalosImpedimento {
    genere: 'addon-nativo' | 'browser' | 'gpu' | 'database' | 'demone' | 'eseguibile-assente'
    /** In inglese: finisce sotto gli occhi della persona. */
    dettaglio: string
}

/**
 * Ciò che il runner ha **osservato**, non ciò che ha concluso.
 *
 * ⛔ Ogni conteggio è `number | null`, e `null` non è zero: «zero test falliti»
 * e «non sono riuscito a leggere quanti ne sono falliti» portano a due esiti
 * opposti, e un tipo che li confonde rende il difetto inevitabile.
 */
export interface TalosOsservazioneCorsa {
    /** `null` se il processo è stato ucciso o è scaduto: non c'è un codice. */
    codiceUscita: number | null
    eseguiti: number | null
    passati: number | null
    falliti: number | null
    impedimento?: TalosImpedimento
}

export type TalosStatoCorsa = 'passati' | 'falliti' | 'non-eseguibili' | 'ignoto'

export interface TalosEsitoCorsa {
    stato: TalosStatoCorsa
    /** In inglese, e dice **che cosa si è osservato**, non che cosa si conclude. */
    perche: string
}

export function classificaCorsa(o: TalosOsservazioneCorsa): TalosEsitoCorsa {
    /*
     * ⛔⛔ L'IMPEDIMENTO VINCE SU TUTTO, uscita zero compresa. Un runner che
     * salta ciò che non può girare ed esce 0 produce un verde su niente — la
     * stessa forma della CI che moriva prima di partire, con l'aggravante di
     * sembrare intenzionale.
     */
    if (o.impedimento) {
        return {
            stato: 'non-eseguibili',
            perche: `the suite cannot run on this device: ${o.impedimento.dettaglio}`,
        }
    }

    /*
     * ⛔ L'OSSERVAZIONE BATTE IL CODICE DI USCITA. Dei test rossi contati sono
     * rossi anche se il runner ha dimenticato di propagare il codice: il numero
     * è un fatto, il codice di uscita è un riassunto di qualcun altro.
     */
    if (o.falliti !== null && o.falliti > 0) {
        return { stato: 'falliti', perche: `${o.falliti} of ${o.eseguiti ?? '?'} tests failed` }
    }

    if (o.codiceUscita === null) {
        return { stato: 'ignoto', perche: 'the runner did not terminate, so there is no result to read' }
    }
    if (o.eseguiti === null || o.passati === null || o.falliti === null) {
        /*
         * ⛔ Il caso più insidioso: «il comando è andato a buon fine». Senza
         * conteggi non si sa nemmeno se fosse un runner di test — poteva essere
         * uno script che stampa e basta.
         */
        return { stato: 'ignoto', perche: 'the runner output could not be parsed, so no test count is known' }
    }
    if (o.eseguiti === 0) {
        return { stato: 'ignoto', perche: 'no test was executed, so nothing was proven' }
    }
    if (o.codiceUscita !== 0) {
        /*
         * Test tutti verdi e uscita non zero: qualcosa è morto **attorno** ai
         * test. Dirlo così indirizza dove guardare — il teardown, non i test.
         */
        return {
            stato: 'ignoto',
            perche: `all ${o.eseguiti} tests passed but the runner exited ${o.codiceUscita}: something failed outside the tests`,
        }
    }
    return { stato: 'passati', perche: `${o.passati} of ${o.eseguiti} tests passed` }
}

/**
 * ⛔⛔ SCRIVERE I FILE NON È SCRIVERE LA STORIA.
 *
 * Sul telefono la cartella arriva dallo Storage Access Framework, e `.git` può
 * essere fuori dal permesso concesso. In quel caso i file cambiano davvero e la
 * storia no: dire «commit fatto» sarebbe falso in un modo che si scopre solo
 * quando la persona apre il progetto sul computer e non trova niente.
 */
export type TalosPubblicazione =
    | { stato: 'pubblicata', albero: string, riferimento: string }
    | { stato: 'solo-file', perche: string }
    | { stato: 'nessuna', perche: string }

export function frasePubblicazione(p: TalosPubblicazione): string {
    switch (p.stato) {
        case 'pubblicata':
            return `Published tree ${p.albero} to ${p.riferimento}.`
        case 'solo-file':
            /* ⛔ «no commit» a lettere piene: la persona deve poter cercare la
             * parola che le manca, non dedurla da un'assenza. */
            return `Files were written to the workspace, but no commit was recorded: ${p.perche}.`
        case 'nessuna':
            return `Nothing was published: ${p.perche}.`
    }
}
