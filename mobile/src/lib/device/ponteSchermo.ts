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
        /** Quale dei due freni è in servizio: sentono cose diverse. */
        frenoTipo?: TalosTipoFreno
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
 * ⭐⭐ I DUE FRENI, e perché non sono lo stesso freno.
 *
 * | freno     | sente                              | chiede             |
 * |-----------|------------------------------------|--------------------|
 * | `grezzo`  | **ogni** tocco, anche sul vuoto     | identità di shell  |
 * | `eventi`  | ogni tocco che **fa** qualcosa      | niente             |
 *
 * MISURATO sul Pad l'11 agosto: un dito appoggiato dove non c'è niente di
 * interattivo produce **zero** eventi di accessibilità, anche tenendolo premuto
 * un secondo; sul pannello grezzo produce byte. ⇒ I due non sono equivalenti, e
 * chiamarli con lo stesso nome sarebbe promettere più di quel che si sente.
 */
export type TalosTipoFreno = 'grezzo' | 'eventi'

/**
 * Arma il freno: da adesso qualunque ingresso fisico ferma l'agente.
 *
 * ⛔ Il comando arriva DAL NATIVO (`comando`), non è scritto qui. Due posti che
 * sanno come si ascolta il dito sono due posti che possono divergere, e il
 * giorno che divergono il freno resta indietro di una build.
 *
 * ## ⛔⛔ IL RIPIEGO NON È UN DETTAGLIO: È LA FUNZIONE
 *
 * Prima di oggi, se `getevent` non partiva questa funzione tornava
 * `armato: false`, e il pilota **si rifiutava di partire**. Su un telefono
 * appena installato — cioè su tutti tranne questo, dove il comando lo avevo
 * avviato IO da un adb esterno — la guida dello schermo non esisteva. Il freno
 * non stava proteggendo nessuno: stava spegnendo la funzione.
 *
 * Ora si prova il freno grezzo, e se non parte si resta su quello degli eventi,
 * che vive nel servizio che il pilota richiede comunque per vedere lo schermo.
 * ⇒ Se TALOS può vedere lo schermo, TALOS può sentire la tua mano.
 */
export async function talosArmaIlFreno(): Promise<{
    armato: boolean
    motivo: TalosMotivoFreno
    tipo?: TalosTipoFreno
}> {
    if (!Capacitor.isNativePlatform()) {
        return { armato: false, motivo: 'non-su-questa-piattaforma' }
    }
    let comando: readonly string[]
    try {
        // ⭐ Questa chiamata arma GIÀ il freno degli eventi lato nativo: da qui
        // in poi il ripiego c'è, qualunque cosa faccia la shell.
        comando = (await TalosSchermoBridge.armaIlFreno()).comando
    }
    catch {
        return { armato: false, motivo: 'ponte-chiuso' }
    }
    // `getevent` vuole l'identità della shell: un'app non legge `/dev/input`.
    // Se non c'è, non è una sconfitta — è l'altro freno che resta in servizio.
    await talosRunAsShell(comando)
    /*
     * ⛔ Si RILEGGE dal nativo invece di fidarsi del comando riuscito.
     *
     * `sh -c '… &'` risponde `ok` appena la shell è partita, non quando il file
     * esiste: fra i due c'è una finestra in cui il freno sembra armato e non lo
     * è. E un freno che si crede armato è peggio di uno spento, perché toglie
     * la sola difesa che ci si aspetta ci sia.
     */
    try {
        const stato = await TalosSchermoBridge.guarda()
        return {
            armato: stato.frenoArmato,
            motivo: 'pronto',
            ...(stato.frenoTipo ? { tipo: stato.frenoTipo } : {}),
        }
    }
    catch {
        return { armato: false, motivo: 'ponte-chiuso' }
    }
}
