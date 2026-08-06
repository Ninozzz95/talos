/**
 * Separa il ragionamento dal contenuto MENTRE arriva, non alla fine.
 *
 * ## Il difetto
 *
 * Visto sul OnePlus Pad 3 il 2026-08-06, con Qwen3-1.7B-Q8_0: la bolla della
 * risposta mostrava
 *
 *     <think> Okay, the user wants me to respond with only the word "PRONTO"…
 *
 * per tutto il tempo della generazione. `common_chat_parse`, sul lato nativo,
 * separa ragionamento e contenuto **quando la risposta è finita** — ed è ciò che
 * ha chiuso il difetto del 2026-08-03, che riguardava il testo FINALE.
 *
 * Ma su un modello locale la generazione dura decine di secondi, e quel tempo è
 * quasi tutto il tempo in cui qualcuno guarda. Quindi il marcatore era invisibile
 * solo a chi lo cercava nel risultato salvato: chi usava l'app lo vedeva sempre.
 *
 * ## Perché non basta cancellare i tag
 *
 * Perché il ragionamento non è spazzatura: TALOS ha un cassetto «Ragionamento»
 * che i provider di rete riempiono già via `onReasoning`. Il modello locale era
 * l'unico che non lo faceva — quindi la cura non è nascondere, è **instradare**,
 * e mandare le due metà dove vanno.
 *
 * ## Il caso difficile: il tag spezzato
 *
 * Uno stream arriva a pezzi arbitrari, e `<think>` può cadere fra due di essi:
 * `«…ecco <thi»` + `«nk> ragiono…»`. Chi cercasse il tag in ogni pezzo non lo
 * troverebbe mai e lo lascerebbe passare a metà — che è peggio del difetto di
 * partenza, perché produce testo mutilato invece di testo sporco.
 *
 * Perciò si trattiene la coda che POTREBBE essere l'inizio di un tag, e la si
 * rilascia appena si sa che non lo è. Il ritardo massimo è la lunghezza del tag
 * più lungo: nove caratteri, cioè niente.
 */

/** I due marcatori, e nient'altro: si riconosce ciò che il nostro ponte emette. */
const APERTURA = '<think>'
const CHIUSURA = '</think>'

export interface TalosThinkSlice {
    /** Ciò che va nella bolla della risposta. */
    text: string
    /** Ciò che va nel cassetto «Ragionamento». */
    reasoning: string
}

export interface TalosThinkSplitter {
    /** Consuma un pezzo dello stream e dice dove va ciascuna metà. */
    push(delta: string): TalosThinkSlice
    /**
     * Chiude lo stream.
     *
     * Serve perché la coda trattenuta va rilasciata: se una risposta finisce con
     * `«…fatto <»`, quel carattere è testo vero e non l'inizio di un tag che non
     * arriverà mai. Senza questo, l'ultimo pezzo di una risposta su tre sparirebbe.
     */
    flush(): TalosThinkSlice
}

/**
 * La lunghezza della coda che potrebbe essere l'inizio di `marcatore`.
 *
 * Restituisce quanti caratteri finali di `testo` sono un prefisso proprio del
 * marcatore — zero se nessuno lo è.
 */
function codaAmbigua(testo: string, marcatore: string): number {
    const massimo = Math.min(testo.length, marcatore.length - 1)
    for (let lunghezza = massimo; lunghezza > 0; lunghezza -= 1) {
        if (marcatore.startsWith(testo.slice(testo.length - lunghezza))) return lunghezza
    }
    return 0
}

export function talosCreateThinkSplitter(): TalosThinkSplitter {
    let dentro = false
    let sospeso = ''

    function consuma(chiudendo: boolean): TalosThinkSlice {
        let text = ''
        let reasoning = ''

        for (;;) {
            const marcatore = dentro ? CHIUSURA : APERTURA
            const at = sospeso.indexOf(marcatore)
            if (at >= 0) {
                const prima = sospeso.slice(0, at)
                if (dentro) reasoning += prima
                else text += prima
                sospeso = sospeso.slice(at + marcatore.length)
                dentro = !dentro
                continue
            }

            // Nessun marcatore intero: si emette tutto tranne la coda che
            // potrebbe esserne l'inizio — a meno che lo stream sia finito, e
            // allora quella coda è testo e basta.
            const trattenuti = chiudendo ? 0 : codaAmbigua(sospeso, marcatore)
            const emettibile = sospeso.slice(0, sospeso.length - trattenuti)
            if (dentro) reasoning += emettibile
            else text += emettibile
            sospeso = sospeso.slice(sospeso.length - trattenuti)
            return { text, reasoning }
        }
    }

    return {
        push(delta: string): TalosThinkSlice {
            sospeso += delta
            return consuma(false)
        },
        flush(): TalosThinkSlice {
            const esito = consuma(true)
            sospeso = ''
            return esito
        },
    }
}
