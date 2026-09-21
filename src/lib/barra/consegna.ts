/**
 * ⭐⭐ IL PASSAGGIO DI CONSEGNE dalla barra a TALOS intero.
 *
 * ## ⛔ Il difetto, e la frase falsa che lo teneva in piedi
 *
 * Owner 2026-08-11: «quando faccio "apri in TALOS" si deve aprire la chat
 * aggiornata col testo che ho inviato, o comunque tutta la conversazione».
 *
 * Il codice apriva l'app e basta, con un commento che diceva: «la chat è già la
 * stessa, per costruzione: non c'è niente da trasferire». Era falso. La barra
 * vive in un'altra Activity, quindi in un'altra **WebView**: un altro contesto
 * JavaScript, un'altra istanza del negozio della chat. In comune c'è solo il
 * database. Aprendo l'app senza dirle niente, quella restava sulla conversazione
 * che aveva lei — e la persona vedeva sparire ciò che aveva appena scritto.
 *
 * ⇒ L'id viaggia nell'indirizzo, che è l'unico canale che attraversa due
 * contesti web diversi, e qui si legge.
 */

/** L'id della conversazione da aprire, o `null` se questo non è quell'indirizzo. */
export function talosSessioneDaAprire(indirizzo: string | null | undefined): string | null {
    if (!indirizzo) return null
    try {
        const url = new URL(indirizzo)
        // ⛔ Si controlla lo SCHEMA e il percorso: un indirizzo qualunque non
        // deve poter cambiare la conversazione aperta. Fallisce chiuso.
        if (url.protocol !== 'talos:') return null
        if (url.hostname !== 'chat' && url.pathname.replace(/^\/+/, '') !== 'chat') return null
        const id = url.searchParams.get('sessione')
        return id && id.trim() ? id : null
    } catch {
        return null
    }
}

/**
 * ⛔⛔ SCEGLIERE LA CONVERSAZIONE NON È APRIRLA — misurato sul Pad il 2026-08-12.
 *
 * ## Il difetto, riprodotto
 *
 * Owner: «quando premo "vai alla chat" dall'assistente non va alla chat, va
 * all'applicazione. Deve andare alla chat esatta».
 *
 * Riprodotto lasciando l'app su Impostazioni → Motore di ricerca, aprendo la
 * barra dalla home, mandando un messaggio e premendo «Apri in TALOS»: TALOS si
 * è aperto **su Impostazioni → Motore di ricerca**. La conversazione giusta era
 * selezionata, e nessuno la stava guardando.
 *
 * ## Perché il pezzo mancante era invisibile
 *
 * `selectSession` risponde a «QUALE conversazione è attiva», non a «cosa vede la
 * persona». Sono due domande diverse e la seconda non aveva un responsabile: se
 * l'app era ferma su un'altra stazione, ci restava. Stessa famiglia di
 * `guarda-lo-schermo-non-il-dom` — lo stato era giusto, la schermata no.
 *
 * ⛔ E il test che c'era provava **solo il parser puro** (`talosSessioneDaAprire`,
 * dieci casi, tutti verdi): l'indirizzo veniva letto benissimo e poi non
 * succedeva metà di quello che doveva. È la lezione di
 * `righe-per-il-modello-sullo-schermo`: un test sulla funzione pura non basta,
 * deve attraversare il chiamante. Per questo la consegna vive QUI, dove un test
 * può guardarla, e non in tre righe dentro `main.ts` che nessuno esercita.
 */
export interface TalosDestinazioneConsegna {
    /** Prepara il negozio e sceglie la conversazione. */
    init(): Promise<unknown>
    selectSession(id: string): Promise<unknown>
}

export interface TalosNavigazioneConsegna {
    /** Il nome della rotta che si sta guardando adesso. */
    currentRoute: { value: { name?: unknown } }
    push(destinazione: { name: string }): Promise<unknown>
}

export async function talosConsegnaLaSessione(
    chat: TalosDestinazioneConsegna,
    navigazione: TalosNavigazioneConsegna,
    sessione: string,
): Promise<void> {
    await chat.init()
    await chat.selectSession(sessione)
    const { talosDettaturaAnnota } = await import('@/services/dictation')
    talosDettaturaAnnota(`consegna: scelta=${sessione} rotta=${String(navigazione.currentRoute.value.name)}`)
    if (navigazione.currentRoute.value.name === 'chat') return
    // ⛔ Solo se non ci siamo già: rispingere la stessa rotta aggiunge una voce
    // alla cronologia, e il tasto indietro comincerebbe a non tornare indietro.
    if (navigazione.currentRoute.value.name === 'chat') return
    /*
     * ⛔⛔ NON SI LANCIA, MA NON SI TACE — e la differenza me l'ha insegnata
     * questo difetto.
     *
     * Qui c'era `.catch(() => undefined)` con la ragione giusta (una
     * navigazione annullata da una guardia non deve diventare un errore in
     * avvio) e la conseguenza sbagliata: **l'esito spariva**. Con la sonda
     * accesa si vedeva la consegna arrivare e la rotta essere `settings`, e poi
     * più niente — indistinguibile fra «ha navigato» e «il push è stato
     * rifiutato in silenzio».
     *
     * ⇒ Un errore che non si può propagare va comunque **detto**. È la stessa
     * regola del motivo che viaggia col rifiuto in `TalosParolaPlugin`: se no di
     * qua si vede solo «non funziona» e si cerca il guasto dove non è.
     */
    const esito = await navigazione.push({ name: 'chat' }).then(
        (valore) => (valore === undefined || valore === null ? 'ok' : `respinto:${String(valore)}`),
        (errore: unknown) => `errore:${String(errore)}`,
    )
    talosDettaturaAnnota(`consegna: push=${esito} rotta=${String(navigazione.currentRoute.value.name)}`)
}

/**
 * Apre quella conversazione nell'app intera, adesso e a ogni ritorno.
 *
 * ⛔ DUE agganci, e servono tutti e due: `getLaunchUrl` per quando TALOS parte
 * da zero con l'indirizzo, `appUrlOpen` per quando era già vivo e il sistema gli
 * consegna un intent nuovo (`onNewIntent`). Con uno solo, metà delle aperture
 * finirebbe sulla conversazione sbagliata — e sarebbe la metà difficile da
 * riprodurre, cioè quella che resta rotta per settimane.
 */
export async function talosAscoltaLaConsegna(
    apri: (sessione: string) => Promise<void>,
): Promise<void> {
    /*
     * ⛔⛔ LA SONDA, perché qui ci sono DUE strade e una sola si vedeva.
     *
     * Owner 2026-08-12, guardando lo scatto: «nota come apri in app non ha
     * aperto la chat ma la app da dove eravamo rimasti». Aveva ragione, e il mio
     * «provato sul Pad» di un'ora prima non era falso: era **mezzo**. Le due
     * prove differivano per una cosa che non avevo controllato — la prima
     * partiva da app appena riavviata (`getLaunchUrl`), la seconda da app già
     * viva (`appUrlOpen`).
     *
     * ⇒ Un difetto che si presenta solo su una delle due strade non si chiude
     * dicendo quale sospetto: si chiude facendo dire alla macchina **quale
     * aggancio ha ricevuto, con quale indirizzo, e se ha navigato**. Costa tre
     * righe nel diario per apertura, e sono le tre che mancavano.
     */
    const annota = async (riga: string): Promise<void> => {
        const { talosDettaturaAnnota } = await import('@/services/dictation')
        talosDettaturaAnnota(riga)
    }
    try {
        const { App } = await import('@capacitor/app')
        const lancio = await App.getLaunchUrl()
        void annota(`consegna: freddo url=${lancio?.url ?? '-'}`)
        const subito = talosSessioneDaAprire(lancio?.url)
        if (subito) await apri(subito)
        await App.addListener('appUrlOpen', (evento) => {
            void annota(`consegna: caldo url=${evento.url}`)
            const dopo = talosSessioneDaAprire(evento.url)
            // ⛔ `catch` esplicito: fin qui era un `void` nudo, quindi un errore
            // dentro `apri` moriva come rejection non gestita — invisibile, e
            // indistinguibile da «l'evento non è mai arrivato».
            if (dopo) void apri(dopo).catch((errore: unknown) => {
                void annota(`consegna: APRI FALLITO ${String(errore)}`)
            })
        })
    } catch (errore) {
        // Sul web non arriva nessun intent: non c'è niente da consegnare.
        void annota(`consegna: nessun ponte ${String(errore)}`)
    }
}
