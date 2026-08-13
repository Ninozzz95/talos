import { registerPlugin } from '@capacitor/core'

/**
 * ⭐⭐ «HEY TALOS» — la parola che apre l'assistente senza toccare niente.
 *
 * ## Perché esiste
 *
 * Owner 2026-08-11: «su ColorOS cinese non c'è un modo per mappare i gesti per
 * l'assistente, quindi ho bisogno di questa cosa». Su quella ROM la barra non ha
 * **nessuna** porta assegnabile a un gesto: o si chiama con la voce, o non si
 * chiama.
 *
 * ## ⛔ Cosa comporta, detto qui e non nascosto
 *
 * È l'unica funzione di TALOS che tiene il microfono **sempre aperto**. Il
 * riconoscitore che gira dietro non trascrive e non salva: cerca due parole in
 * token, e tutto il resto lo butta senza guardarlo. Ma resta un microfono
 * acceso, quindi:
 *
 *   - si accende SOLO se la persona lo chiede, e parte spento;
 *   - mentre è acceso c'è una notifica fissa che lo dice e da cui si spegne;
 *   - quando l'ascolto vero comincia, la parola molla la presa — un microfono
 *     con due padroni è un microfono che finge di sentire.
 */
export interface TalosStatoParola {
    /** Il ponte c'è: questa build ha il motore della parola. */
    readonly available: boolean
    /** La parola è in ascolto adesso. */
    readonly on: boolean
    /** Il permesso del microfono, come lo racconta il ponte. */
    readonly permesso: string
}

interface PonteParola {
    stato(): Promise<{ accesa: boolean, permesso: string }>
    accendi(): Promise<{ accesa: boolean, motivo?: string }>
    spegni(): Promise<{ accesa: boolean }>
}

const Ponte = registerPlugin<PonteParola>('TalosParola')

const ASSENTE: TalosStatoParola = { available: false, on: false, permesso: 'prompt' }

/**
 * Com'è messa la parola di attivazione.
 *
 * ⛔ Fallisce CHIUSO su `available`, come la bolla: se il ponte non risponde la
 * scheda non compare. Offrire di accendere qualcosa che non esiste è peggio che
 * non offrirlo.
 */
export async function talosLeggiLaParola(): Promise<TalosStatoParola> {
    try {
        const stato = await Ponte.stato()
        return { available: true, on: stato.accesa === true, permesso: String(stato.permesso ?? 'prompt') }
    } catch {
        return ASSENTE
    }
}

/**
 * Accende l'ascolto della parola. Se manca il permesso del microfono lo chiede:
 * la scheda di sistema la può mostrare solo chi ha una finestra, e il servizio
 * non ce l'ha.
 */
export async function talosAccendiLaParola(): Promise<TalosStatoParola> {
    try {
        const esito = await Ponte.accendi()
        const stato = await Ponte.stato()
        return { available: true, on: esito.accesa === true && stato.accesa === true, permesso: String(stato.permesso ?? 'prompt') }
    } catch {
        return ASSENTE
    }
}

export async function talosSpegniLaParola(): Promise<TalosStatoParola> {
    try {
        await Ponte.spegni()
        const stato = await Ponte.stato()
        return { available: true, on: stato.accesa === true, permesso: String(stato.permesso ?? 'prompt') }
    } catch {
        return ASSENTE
    }
}
