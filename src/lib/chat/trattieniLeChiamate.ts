/**
 * ⭐⭐⭐ IL TESTO CHE POTREBBE ESSERE UNA CHIAMATA — trattenuto finché non si sa.
 *
 * ## ⛔⛔ Il difetto, e perché nessuna verifica l'aveva visto
 *
 * L'owner ha fotografato il Pad **mentre elaborava**, il 2026-08-21, con
 * Gemma 3 4B. A schermo, sotto la sua parola «Ciao»:
 *
 * ```
 * {"name":"device_status","arguments":{"manufacturer":"OnePlus","model_code":…
 * {"name":"library_list","arguments":{"origin":"all","page_size":10,…}}
 * ```
 *
 * Non nella risposta finale: **durante**. Il testo finale era già filtrato, e
 * ogni mia verifica guardava quello — `uiautomator dump` a generazione finita
 * mostra ciò che RESTA, mai ciò che è SCORSO.
 *
 * ⇒ Una risposta ha due vite. Un difetto che dura otto secondi e sparisce è
 * comunque un difetto che la persona **vede**.
 *
 * ## Come funziona, e perché non basta filtrare a valle
 *
 * Durante lo streaming non si sa ancora cosa sarà: `{"name":"library_` può
 * diventare una chiamata o una frase che cita un JSON. ⇒ Si **trattiene**
 * finché il dubbio esiste, esattamente come il separatore del ragionamento
 * trattiene una coda che potrebbe iniziare un tag.
 *
 * Tre uscite, e la terza è quella che tiene onesto il resto:
 *
 *   - il testo si chiude come oggetto **con forma di chiamata** → non esce mai
 *   - si chiude come oggetto **qualunque altro**                → esce tutto
 *   - non si chiude entro il tetto                              → esce tutto
 *
 * ⛔ Il tetto non è prudenza: senza, un modello che apre una graffa e parla per
 * mille caratteri lascerebbe lo schermo **fermo** — e uno schermo fermo, per
 * chi guarda, è un'app bloccata. Meglio mostrare un JSON che sembrare morti.
 */

/** Oltre questo, quello che si è accumulato è prosa e va mostrato. */
const TETTO_TRATTENUTO = 4_000

export interface TalosTrattenitoreDiChiamate {
    /** Il testo da mostrare adesso: '' quando si sta ancora trattenendo. */
    push(delta: string): string
    /** A fine risposta: ciò che resta, se non era una chiamata. */
    flush(): string
}

/**
 * ⛔ Il testo è ANCORA un prefisso plausibile di un oggetto JSON?
 *
 * Non si chiede «è un JSON valido»: durante lo streaming non lo è quasi mai.
 * Si chiede se **potrebbe ancora diventarlo**, cioè se le graffe aperte non si
 * sono chiuse. E si guarda solo fuori dalle stringhe, perché una graffa dentro
 * un valore non apre niente.
 */
function chiusuraDellOggetto(testo: string): number {
    let profondita = 0
    let dentroStringa = false
    let scappato = false
    for (let i = 0; i < testo.length; i += 1) {
        const c = testo[i]
        if (dentroStringa) {
            if (scappato) scappato = false
            else if (c === '\\') scappato = true
            else if (c === '"') dentroStringa = false
            continue
        }
        if (c === '"') dentroStringa = true
        else if (c === '{') profondita += 1
        else if (c === '}') {
            profondita -= 1
            if (profondita === 0) return i
        }
    }
    return -1
}

/**
 * ⛔ Ha la forma di una chiamata? Stretta di proposito.
 *
 * `name` stringa non vuota, e nient'altro oltre a `arguments`/`parameters`/`id`.
 * Un oggetto dati che per caso ha un campo `name` — una persona, un file — è
 * una risposta legittima e non va nascosto: sarebbe la stessa bugia al
 * contrario.
 */
export function haFormaDiChiamata(grezzo: string): boolean {
    let oggetto: unknown
    try { oggetto = JSON.parse(grezzo) }
    catch { return false }
    if (!oggetto || typeof oggetto !== 'object' || Array.isArray(oggetto)) return false
    const campi = oggetto as Record<string, unknown>
    const chiavi = Object.keys(campi)
    if (chiavi.length === 0 || chiavi.length > 3) return false
    if (typeof campi.name !== 'string' || campi.name.trim() === '') return false
    return chiavi.every((k) => k === 'name' || k === 'arguments' || k === 'parameters' || k === 'id')
}

export function talosTrattieniLeChiamate(): TalosTrattenitoreDiChiamate {
    let coda = ''

    /** Cosa fare della coda quando un oggetto si è chiuso a `fine`. */
    const risolvi = (fine: number): string => {
        const oggetto = coda.slice(0, fine + 1)
        const dopo = coda.slice(fine + 1)
        coda = ''
        /*
         * ⛔ Il testo DOPO l'oggetto si mostra comunque: se il modello ha
         * scritto una chiamata e poi ha continuato a parlare, quella parte è
         * risposta e non va persa insieme al JSON.
         */
        return haFormaDiChiamata(oggetto) ? dopo : oggetto + dopo
    }

    return {
        push(delta: string): string {
            if (coda === '') {
                /*
                 * ⛔ Si trattiene solo da una graffa in poi, e il testo prima
                 * esce subito. Trattenere tutto renderebbe lo streaming a
                 * scatti per ogni risposta, per un caso che è raro.
                 */
                const apre = delta.indexOf('{')
                if (apre === -1) return delta
                const prima = delta.slice(0, apre)
                coda = delta.slice(apre)
                const fine = chiusuraDellOggetto(coda)
                if (fine === -1) return coda.length > TETTO_TRATTENUTO ? prima + svuota() : prima
                return prima + risolvi(fine)
            }
            coda += delta
            const fine = chiusuraDellOggetto(coda)
            if (fine === -1) return coda.length > TETTO_TRATTENUTO ? svuota() : ''
            return risolvi(fine)
        },
        flush(): string {
            /*
             * ⛔ Una coda non chiusa a fine risposta è testo, non una chiamata:
             * si mostra. Trattenerla per sempre vorrebbe dire mangiare una
             * risposta troncata, che è peggio del difetto che si sta curando.
             */
            return svuota()
        },
    }

    function svuota(): string {
        const resto = coda
        coda = ''
        return resto
    }
}
