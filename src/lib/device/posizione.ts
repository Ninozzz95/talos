import { Capacitor } from '@capacitor/core'

/**
 * ⭐⭐⭐ DOVE SEI — e perché fino al 2026-08-15 TALOS non lo sapeva.
 *
 * ## Il difetto
 *
 * Owner 2026-08-15: «ho chiesto che ristorante mi consigli per cenare stasera e
 * lui mi ha dato una posizione **completamente diversa**».
 *
 * MISURATO prima di scrivere una riga: TALOS non leggeva la posizione da
 * nessuna parte. Nessun tool, niente nel contesto del modello, niente alla
 * ricerca web — e `ACCESS_FINE_LOCATION` era addirittura **rimosso** dal
 * manifest con `tools:node="remove"`. Quindi quei nomi di locali il modello se
 * li era inventati.
 *
 * ⇒ È il difetto peggiore della famiglia: una risposta **sicura e falsa** su
 * una cosa che la persona sta per andare a fare davvero. Non «non lo so»: un
 * indirizzo, con il nome del posto, in una città in cui non sei.
 *
 * ## ⛔ Le tre regole che questo file rispetta
 *
 * 1. **Si chiede, e l'ultimo tocco è della persona.** Il permesso ha la sua
 *    riga nell'elenco, e la prima lettura fa comparire il dialogo di sistema.
 *    Nessuna lettura silenziosa.
 * 2. **Si legge quando serve, non sempre.** Nessuna posizione nel contesto di
 *    ogni messaggio: viaggia solo quando qualcuno la chiede davvero. Un dato
 *    che non parte non si può perdere.
 * 3. **Un rifiuto è un ESITO, non un errore.** `stato: 'negato'` è una risposta
 *    che il modello può dire alla persona («non ho il permesso, me lo dai?»),
 *    mentre un'eccezione diventa «qualcosa è andato storto» — che è la frase
 *    che non aiuta nessuno.
 */
export type TalosStatoPosizione = 'letta' | 'negato' | 'spenta' | 'non-disponibile' | 'scaduta'

export interface TalosPosizione {
    readonly stato: TalosStatoPosizione
    /** Gradi decimali, arrotondati — vedi `PRECISIONE`. */
    readonly latitudine?: number
    readonly longitudine?: number
    /** Il raggio di incertezza in metri, come lo dà il sistema. */
    readonly precisioneMetri?: number
    /** Quanti secondi fa è stata rilevata: una posizione vecchia va detta. */
    readonly etaSecondi?: number
    /**
     * ⛔⛔ Vero SOLO con `ACCESS_FINE_LOCATION` concesso.
     *
     * MISURATO sul Pad il 2026-08-19: la precisa era negata con `USER_FIXED`,
     * restava l'approssimata, e TALOS rispondeva **Roma** a chi era a
     * **Catania** — 500 km — senza che niente nel risultato lo lasciasse
     * sospettare. Un fix approssimato è utile; spacciarlo per preciso no.
     */
    readonly precisa?: boolean
}

/**
 * ⛔ QUATTRO DECIMALI, cioè ~11 metri, e non è pigrizia.
 *
 * Il modello non ha bisogno di sapere in quale stanza sei: gli serve per
 * cercare «ristoranti vicino» o per capire in che città si trova la persona. I
 * decimali oltre il quarto sono precisione che non serve a niente e che
 * finirebbe nella cronologia della conversazione, cioè in un posto che dura
 * molto più a lungo del momento in cui serviva.
 *
 * ⇒ Sette decimali sono la posizione della tua sedia. Quattro sono l'isolato.
 */
const PRECISIONE = 4

function arrotonda(valore: number): number {
    const fattore = 10 ** PRECISIONE
    return Math.round(valore * fattore) / fattore
}

interface PluginPosizione {
    getCurrentPosition(options?: {
        enableHighAccuracy?: boolean
        timeout?: number
        maximumAge?: number
    }): Promise<{ coords: { latitude: number, longitude: number, accuracy: number }, timestamp: number }>
    checkPermissions(): Promise<{ location: string, coarseLocation?: string }>
    requestPermissions(options?: { permissions?: string[] }): Promise<{ location: string, coarseLocation?: string }>
}

export interface TalosPosizioneOptions {
    plugin?: PluginPosizione
    platform?: string
    now?: () => number
}

/**
 * ⛔ Il messaggio del sistema NON si legge a occhio: si classifica.
 *
 * Android e il plugin danno frasi diverse per la stessa cosa, e cambiano fra
 * versioni. Ma tre famiglie si distinguono davvero, e sono tre risposte diverse
 * da dare alla persona: «non me l'hai dato», «il GPS è spento», «non ce l'ho
 * fatta in tempo». Confonderle significa dirle di andare nel posto sbagliato.
 */
function classifica(errore: unknown): TalosStatoPosizione {
    const testo = (errore instanceof Error ? errore.message : String(errore)).toLowerCase()
    if (testo.includes('denied') || testo.includes('permission')) return 'negato'
    if (testo.includes('disabled') || testo.includes('location services')
        || testo.includes('provider')) return 'spenta'
    if (testo.includes('timeout') || testo.includes('timed out')) return 'scaduta'
    return 'non-disponibile'
}

/**
 * ⛔ Otto secondi, e il numero viene da come si comporta un GPS a freddo.
 *
 * Con `enableHighAccuracy` il primo fix all'aperto costa qualche secondo; al
 * chiuso può non arrivare mai. Un'attesa senza fine blocca la risposta e la
 * persona vede TALOS che pensa: meglio `scaduta` dopo otto secondi, che è una
 * cosa che si può dire.
 */
const ATTESA_MASSIMA = 8000

/**
 * ⛔ Un minuto di età accettabile: chi ha appena chiesto «ristoranti vicino» si
 * è mosso al massimo di un isolato. Riusare un fix recente evita di accendere
 * il GPS per una domanda a cui la risposta di un minuto fa va benissimo.
 */
const ETA_ACCETTABILE = 60_000

export async function talosLeggiPosizione(
    options: TalosPosizioneOptions = {},
): Promise<TalosPosizione> {
    const platform = options.platform ?? Capacitor.getPlatform()
    const adesso = options.now ?? (() => Date.now())

    let plugin = options.plugin
    if (!plugin) {
        if (platform === 'web') return { stato: 'non-disponibile' }
        try {
            // ⛔ Import DINAMICO: il grafo d'avvio ha un tetto misurato e poche
            // migliaia di byte di margine. Una funzione che serve quando la
            // persona chiede «vicino a me» non deve pesare all'apertura.
            const modulo = await import('@capacitor/geolocation')
            plugin = modulo.Geolocation as unknown as PluginPosizione
        } catch {
            return { stato: 'non-disponibile' }
        }
    }

    /*
     * ⛔ Si CHIEDE prima di leggere, e solo se non è già dato: `requestPermissions`
     * su un permesso già concesso non mostra niente, ma su uno già negato due
     * volte Android non mostra più nulla e risponde subito — e quella risposta
     * è `denied`, che è esattamente ciò che vogliamo saper distinguere.
     */
    /**
     * ⛔⛔ Owner 2026-08-19: «DEVI USARE POSIZIONE PRECISA».
     *
     * Qui c'era una riga sola —
     * `stato.location === 'granted' || stato.coarseLocation === 'granted'` —
     * e dentro c'era tutto il difetto: con l'approssimata concessa la precisa
     * non veniva **mai** chiesta, e i due casi uscivano **identici**.
     *
     * ⇒ Adesso: la precisa si chiede quando manca; se resta negata si legge lo
     * stesso — un dato approssimato batte il silenzio — ma il risultato lo
     * DICHIARA, e chi legge decide. Su Android 12+ `location` è la precisa e
     * `coarseLocation` l'approssimata: sono due permessi, non due nomi dello
     * stesso.
     */
    let precisa = false
    try {
        const stato = await plugin.checkPermissions()
        precisa = stato.location === 'granted'
        let approssimata = stato.coarseLocation === 'granted'
        if (!precisa) {
            // ⛔ Si chiede anche quando l'approssimata c'è già: è l'unico modo
            // per passare da approssimata a precisa. Se la persona l'ha fissata
            // su «approssimata», Android risponde subito e non mostra niente —
            // e quella risposta immediata è un esito, non un guasto.
            const chiesto = await plugin.requestPermissions({ permissions: ['location', 'coarseLocation'] })
            precisa = chiesto.location === 'granted'
            approssimata = approssimata || chiesto.coarseLocation === 'granted'
        }
        if (!precisa && !approssimata) return { stato: 'negato' }
    } catch (errore) {
        return { stato: classifica(errore) }
    }

    try {
        const letta = await plugin.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: ATTESA_MASSIMA,
            maximumAge: ETA_ACCETTABILE,
        })
        return {
            stato: 'letta',
            latitudine: arrotonda(letta.coords.latitude),
            longitudine: arrotonda(letta.coords.longitude),
            precisioneMetri: Math.round(letta.coords.accuracy),
            etaSecondi: Math.max(0, Math.round((adesso() - letta.timestamp) / 1000)),
            precisa,
        }
    } catch (errore) {
        return { stato: classifica(errore) }
    }
}
