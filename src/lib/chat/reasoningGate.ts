/**
 * Il ritmo con cui il ragionamento diventa schermo.
 *
 * ## Il difetto, e dove stava davvero
 *
 * Owner 2026-08-06, provando sul dispositivo: lo scorrimento sotto un modello
 * locale è duro, e il blocco del ragionamento è il pezzo peggiore. La ricerca
 * sul rendering in WebView è arrivata alla stessa conclusione da un'altra
 * strada: **il lavoro diventa DOM troppo presto**. Non è il DOM a essere lento,
 * è che gliene chiediamo troppo, troppo spesso.
 *
 * Il ragionamento arriva token per token, e ogni token scriveva un campo
 * reattivo. Un modello che ragiona per trenta secondi produce qualche migliaio
 * di scritture, ognuna delle quali attraversa il ponte verso la vista nativa —
 * e la stragrande maggioranza non cambia niente di visibile, perché il testo
 * del ragionamento **non è nemmeno montato** finché non si apre il cassetto.
 *
 * ## Perché nessun timer
 *
 * La forma ovvia sarebbe un `setTimeout` di coda. Ma un timer sopravvive alla
 * cosa che lo ha creato: se la risposta finisce, o viene fermata, o l'utente
 * cambia chat, quel timer scatta dopo e riscrive uno stato che non esiste più.
 * Sarebbe una fuga da chiudere in quattro punti diversi, e una di quelle
 * chiusure prima o poi si dimenticherebbe.
 *
 * Qui non c'è nessun timer. Il primo pezzo passa subito — così la riga «sto
 * ragionando» appare all'istante — e i successivi passano al più una volta ogni
 * `TALOS_REASONING_MIN_INTERVAL_MS`. Quello che resta trattenuto viene liberato
 * dal primo carattere della RISPOSTA, che è il momento in cui il ragionamento è
 * finito: `release()`. Se invece il flusso muore prima, non serve liberare
 * niente, perché il testo definitivo arriva dal messaggio salvato.
 *
 * ## Perché 66 ms
 *
 * Sono ~15 aggiornamenti al secondo, dentro la finestra 10-20 Hz che la ricerca
 * indica come il punto in cui un umano legge «continuo» e il ponte respira. Più
 * veloce non si vede; più lento si vede eccome, perché il ragionamento è
 * l'unica cosa sullo schermo mentre lo si aspetta.
 */
export const TALOS_REASONING_MIN_INTERVAL_MS = 66

export interface TalosReasoningGate {
    /** Se questo pezzo di ragionamento va scritto adesso. */
    accept(): boolean
    /**
     * Se c'è qualcosa di trattenuto da scrivere subito. Lo chiama il canale
     * della risposta: il primo carattere della risposta significa che il
     * ragionamento è finito, e quello che ne resta va mostrato per intero.
     */
    release(): boolean
    /** Un ragionamento nuovo riparte dal primo fotogramma. */
    reset(): void
}

export function talosCreateReasoningGate(
    intervalMs: number = TALOS_REASONING_MIN_INTERVAL_MS,
    now: () => number = () => Date.now(),
): TalosReasoningGate {
    let ultimoPassaggio = Number.NEGATIVE_INFINITY
    let trattenuto = false

    return {
        accept() {
            const adesso = now()
            if (adesso - ultimoPassaggio < intervalMs) {
                trattenuto = true
                return false
            }
            ultimoPassaggio = adesso
            trattenuto = false
            return true
        },
        release() {
            if (!trattenuto) return false
            trattenuto = false
            ultimoPassaggio = now()
            return true
        },
        reset() {
            ultimoPassaggio = Number.NEGATIVE_INFINITY
            trattenuto = false
        },
    }
}
