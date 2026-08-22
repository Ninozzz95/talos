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
    agisci(options: {
        indice: number
        azione: string
        testo?: string
        /**
         * ⛔ Fino al 2026-08-16 questo campo NON esisteva qui, e l'istruzione
         * del pilota lo chiedeva al modello lo stesso: `scorri` andava sempre
         * in avanti, e «scorri su» faceva scendere la lista. Un parametro che
         * il modello produce e nessuno legge è peggio di uno assente.
         */
        direzione?: string
        /** Solo per `imposta`: dove portare un cursore. */
        valore?: number
    }): Promise<{
        fatto: boolean
        millisecondi: number
        motivo?: string
    }>
    /** Indietro, Home e Recenti: azioni di SISTEMA, senza indice. */
    sistema(options: { azione: string }): Promise<{ fatto: boolean, motivo?: string }>
    armaIlFreno(): Promise<{ armato: boolean, comando: string[], percorso: string }>
    /** ⭐ L'ultimo centimetro: preme UN pulsante, con le tre guardie. */
    premiPulsante(options: TalosRichiestaInvio): Promise<TalosEsitoInvio>
    /**
     * ⭐ Chi è in primo piano ADESSO — smaschera i falsi successi.
     *
     * ⛔ `sipuoSapere: false` vuol dire «non lo so» (occhio chiuso), non
     * «non c'è nessuno»: chi le confonde dice «fatto» davanti a un launcher.
     */
    chiEDavanti(): Promise<{ pacchetto: string, sipuoSapere: boolean }>
    /**
     * ⭐⭐⭐ Conferma il dialogo dell'app — **una regola per tutte le app**.
     *
     * Owner 2026-08-13: «non possiamo andare per ciascuna app esistente
     * possibile e immaginabile… sarebbe da pazzi». E infatti non serve:
     * MISURATO che quei dialoghi usano gli id del **framework**, uguali
     * ovunque e non tradotti — `android:id/message` la domanda,
     * `android:id/button1` il positivo.
     *
     * ⛔ `domanda` torna indietro apposta: è ciò che rende onesto il
     * «confermato». Si conferma sapendo cosa, e chi legge può verificarlo.
     */
    confermaDialogo(options: { pacchetto?: string, attesaMs?: number }): Promise<{
        fatto: boolean
        sparito?: boolean
        domanda?: string
        motivo?: string
        pacchettoVisto?: string
        millisecondi?: number
    }>
}

/**
 * ⭐⭐⭐ L'ULTIMO CENTIMETRO — cosa si chiede per premere «invia».
 *
 * ⛔ Ogni campo è una GUARDIA, non un'opzione. Toglierne uno non rende la
 * chiamata più comoda: la rende capace di premere la cosa sbagliata.
 */
export interface TalosRichiestaInvio {
    /** Il nome della risorsa (`com.whatsapp:id/send`): non tradotto, non si sposta. */
    readonly viewId?: string
    /** Il ripiego tradotto, quando il `viewId` cambia. */
    readonly descrizioni?: readonly string[]
    /** ⛔ Il pacchetto che DEVE essere in primo piano: senza, «Invia» può essere il nostro. */
    readonly pacchetto?: string
    /** ⛔ Il testo che deve stare nel campo: senza, si spedisce la bozza vecchia. */
    readonly testoAtteso?: string
    /** Quanto si aspetta che l'app arrivi. Un'app fredda ci mette secondi. */
    readonly attesaMs?: number
}

/**
 * L'esito, con la PROVA dentro.
 *
 * ⛔ `fatto` dice che il click è stato consegnato; **`sparito` dice che il
 * messaggio è partito**. Chi legge deve poter dire la verità alla persona, e i
 * due non sono la stessa cosa.
 */
export interface TalosEsitoInvio {
    /** Il click è stato consegnato al nodo. NON vuol dire «inviato». */
    readonly fatto: boolean
    /** Come è stato trovato il pulsante: `viewId` o `descrizione:<quale>`. */
    readonly via?: string
    /** `app-non-in-primo-piano` · `testo-non-arrivato` · `non-trovato` · `occhio-chiuso`. */
    readonly motivo?: string
    /** ⭐ Il controllo d'invio è sparito ⇒ la bozza ha lasciato il campo. */
    readonly sparito?: boolean
    /**
     * ⭐⭐⭐ LA FINALIZZAZIONE DELL'OBIETTIVO — owner 2026-08-15: «"invio un
     * messaggio a un contatto" non significa che l'abbia inviato veramente».
     *
     * Tre stati e non due, perché sono tre cose diverse che una persona può
     * fare:
     *
     *   `PARTITO`         due prove indipendenti su tre concordano
     *   `NON_PARTITO`     il testo è ANCORA nel campo: certezza negativa
     *   `NON_CONFERMATO`  una prova sola: può essere andata, non lo sappiamo
     *
     * ⛔ `NON_PARTITO` è l'unico in cui riprovare è sicuro. Negli altri due un
     * secondo tentativo può mandare il messaggio DUE VOLTE, e a una persona
     * vera non si ritira.
     *
     * Il disegno per esteso: `TalosObiettivoFinito.kt`.
     */
    readonly obiettivo?: 'PARTITO' | 'NON_PARTITO' | 'NON_CONFERMATO'
    /** Il testo non sta più in un nodo modificabile. */
    readonly campoSvuotato?: boolean
    /** ⭐ La prova forte: il testo è comparso in un nodo NON modificabile, cioè
     *  è diventato un pezzo di conversazione invece di una bozza. */
    readonly testoMigrato?: boolean
    /** Quante delle tre prove hanno detto sì. */
    readonly prove?: number
    /** Chi c'era davvero in primo piano, quando non era chi ci aspettavamo. */
    readonly pacchettoVisto?: string
    readonly millisecondi?: number
    readonly verificaMs?: number
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
    /*
     * ⛔⛔ IL FRENO GREZZO NON STA SUL CAMMINO CRITICO — owner 2026-08-13:
     * «se utente aspetta per piu di qualche secondo si stufa e lo fara
     * manualmente».
     *
     * `getevent` vuole l'identità della shell: un'app non legge `/dev/input`.
     * Se non c'è, non è una sconfitta — è l'altro freno che resta in servizio,
     * e quello è **già armato** dalla chiamata qui sopra.
     *
     * ⇒ Aspettare questa shell è tempo speso per un MIGLIORAMENTO del freno,
     * non per la sua esistenza: su un telefono senza ponte si paga un timeout
     * intero prima di scoprire ciò che si sapeva già, e lo si paga **a ogni
     * armamento**, cioè davanti alla persona che guarda lo schermo fermo.
     *
     * Parte e non si aspetta. Se arriva, il freno grezzo prende servizio al
     * primo `guarda()` successivo; se non arriva, non è cambiato niente.
     *
     * ⛔ `catch` esplicito: senza, un rifiuto della shell diventa una rejection
     * non gestita — invisibile, e indistinguibile da «non è mai partita».
     */
    void talosRunAsShell(comando).catch(() => undefined)
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
