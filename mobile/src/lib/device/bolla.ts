import { registerPlugin } from '@capacitor/core'

/**
 * ⭐ LA BOLLA: il pallino di TALOS sopra le altre app.
 *
 * ## ⛔ Perché questo file può esistere in produzione senza portarci la bolla
 *
 * Il pacchetto web è **lo stesso** per la build di sviluppo e per quella di
 * produzione: non c'è nessun `if (sviluppo)` che possa distinguerle in modo
 * affidabile, e una riga del genere sarebbe una condizione da indovinare giusta
 * per sempre.
 *
 * La distinzione la fa il NATIVO: la classe del plugin sta nel source set
 * `debug` e in release non viene nemmeno compilata. Quindi qui non chiediamo
 * «siamo in sviluppo?» ma «il ponte ha questo plugin?» — che è la stessa
 * domanda posta a chi conosce davvero la risposta.
 *
 * Owner 2026-08-11: «voglio solo che sia nella versione di sviluppo, non nella
 * versione di produzione. È solo una cosa che serve a me».
 */
export interface TalosStatoBolla {
    /** Il plugin esiste: questa build è quella di sviluppo. */
    readonly available: boolean
    /** Il permesso di disegnare sopra le altre app c'è. */
    readonly granted: boolean
    /** La bolla è accesa adesso. */
    readonly on: boolean
    /** Solo dopo `accendi`: abbiamo aperto la pagina del permesso. */
    readonly opened?: boolean
}

interface PonteBolla {
    state(): Promise<{ available: boolean, granted: boolean, on: boolean }>
    enable(): Promise<{ opened: boolean, granted: boolean, on: boolean }>
    disable(): Promise<{ granted: boolean, on: boolean }>
}

const Ponte = registerPlugin<PonteBolla>('TalosBolla')

const ASSENTE: TalosStatoBolla = { available: false, granted: false, on: false }

/**
 * Com'è messa la bolla.
 *
 * ⛔ Fallisce CHIUSO su `available`: se il ponte non risponde — perché il plugin
 * non c'è, o perché siamo sul web — la scheda non deve comparire. Una scheda che
 * offre di accendere qualcosa che non esiste è peggio di nessuna scheda.
 */
export async function talosLeggiLaBolla(): Promise<TalosStatoBolla> {
    try {
        const stato = await Ponte.state()
        return { available: stato.available === true, granted: stato.granted === true, on: stato.on === true }
    } catch {
        return ASSENTE
    }
}

/**
 * Accende la bolla, o apre la pagina del permesso se manca.
 *
 * ⛔ `opened: true` con `granted: false` NON è un fallimento: vuol dire che la
 * persona è appena stata mandata a concedere il permesso. Chi chiama deve
 * rileggere al ritorno invece di mostrare un errore — la pagina di sistema non
 * torna nessun esito, e darlo per concesso sarebbe la bugia che ci è già
 * costata un «Fatto ✅» su una notifica mai rimossa.
 */
export async function talosAccendiLaBolla(): Promise<TalosStatoBolla> {
    try {
        const esito = await Ponte.enable()
        return {
            available: true,
            granted: esito.granted === true,
            on: esito.on === true,
            opened: esito.opened === true,
        }
    } catch {
        return ASSENTE
    }
}

export async function talosSpegniLaBolla(): Promise<TalosStatoBolla> {
    try {
        const esito = await Ponte.disable()
        return { available: true, granted: esito.granted === true, on: esito.on === true }
    } catch {
        return ASSENTE
    }
}
