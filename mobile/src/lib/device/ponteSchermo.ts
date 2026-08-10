import { registerPlugin, Capacitor } from '@capacitor/core'
import { talosRunAsShell } from '@/lib/device/privilegedShell'
import type { TalosElementoSchermo } from '@/lib/agent/passoDelloSchermo'

/**
 * ⭐⭐ IL PONTE VERSO L'OCCHIO — e il freno che si arma DAVVERO.
 *
 * Il lato Kotlin (`TalosSchermoPlugin`) esisteva già e non lo chiamava nessuno:
 * l'occhio vedeva, la mano sapeva toccare, e in JavaScript non c'era la porta.
 *
 * ## ⛔ Il freno non è un dettaglio da fare dopo
 *
 * `armaIlFreno` sul lato nativo AZZERA soltanto il riferimento: il comando che
 * scrive gli eventi grezzi lo deve avviare chi possiede il ponte — cioè questo
 * file. Finché non lo avviava nessuno, `frenoArmato` rispondeva `false` a ogni
 * sguardo, e `false` su un freno vuol dire una cosa sola: **non si guida**.
 *
 * ⛔ E `armato() == false` non significa «nessuno ha toccato»: significa «non lo
 * so». Su un agente che tocca il telefono di un'altra persona, confondere le
 * due è il difetto peggiore che ci sia — per questo qui il freno non armato
 * FERMA la partenza invece di essere ignorato.
 */
export interface PonteSchermo {
    disponibile(): Promise<{ aperto: boolean }>
    guarda(): Promise<{
        elementi: TalosElementoSchermo[]
        millisecondi: number
        frenoArmato: boolean
        manoSulloSchermo: boolean
        byteDiTocchi: number
    }>
    agisci(options: { indice: number, azione: string, testo?: string }): Promise<{
        fatto: boolean
        millisecondi: number
        motivo?: string
    }>
    /** Indietro e Home: azioni di SISTEMA, senza indice. */
    sistema(options: { azione: string }): Promise<{ fatto: boolean, motivo?: string }>
    armaIlFreno(): Promise<{ armato: boolean, comando: string[], percorso: string }>
}

export const TalosSchermoBridge = registerPlugin<PonteSchermo>('TalosSchermo')

/** Perché il freno non si è armato. Parla al modello, non alla persona. */
export type TalosMotivoFreno =
    | 'pronto'
    | 'non-su-questa-piattaforma'
    | 'ponte-chiuso'
    | 'comando-non-partito'

/**
 * Arma il freno: da adesso qualunque ingresso fisico ferma l'agente.
 *
 * ⛔ Il comando arriva DAL NATIVO (`comando`), non è scritto qui. Due posti che
 * sanno come si ascolta il dito sono due posti che possono divergere, e il
 * giorno che divergono il freno resta indietro di una build.
 */
export async function talosArmaIlFreno(): Promise<{
    armato: boolean
    motivo: TalosMotivoFreno
}> {
    if (!Capacitor.isNativePlatform()) {
        return { armato: false, motivo: 'non-su-questa-piattaforma' }
    }
    let comando: readonly string[]
    try {
        comando = (await TalosSchermoBridge.armaIlFreno()).comando
    }
    catch {
        return { armato: false, motivo: 'ponte-chiuso' }
    }
    // `getevent` vuole l'identità della shell: un'app non legge `/dev/input`.
    const esito = await talosRunAsShell(comando)
    if (!esito.ok) return { armato: false, motivo: 'comando-non-partito' }
    /*
     * ⛔ Si RILEGGE dal nativo invece di fidarsi del comando riuscito.
     *
     * `sh -c '… &'` risponde `ok` appena la shell è partita, non quando il file
     * esiste: fra i due c'è una finestra in cui il freno sembra armato e non lo
     * è. E un freno che si crede armato è peggio di uno spento, perché toglie
     * la sola difesa che ci si aspetta ci sia.
     */
    try {
        return { armato: (await TalosSchermoBridge.guarda()).frenoArmato, motivo: 'pronto' }
    }
    catch {
        return { armato: false, motivo: 'ponte-chiuso' }
    }
}
