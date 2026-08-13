/**
 * ⭐⭐⭐ IL MOTORE DEGLI INTENT — un REGISTRO, non un tool per app.
 *
 * ## Perché esiste, con la misura che l'ha imposto
 *
 * MISURATO sul Pad il 2026-08-13, stesso compito su TALOS e su Gemini
 * («manda un messaggio WhatsApp ad Antonino Rizzo che dice ciao»):
 *
 * | | TALOS | Gemini |
 * |---|---|---|
 * | come | pilota dello schermo | **intent** |
 * | WhatsApp aperto | sì, visibilmente | **mai** |
 * | passi | **20** in 27,8 s | zero |
 * | esito | ⛔ `troppi-passi`, mai inviato | ✅ «Lo sto inviando» |
 *
 * Stavamo risolvendo con il pilota un problema che si risolve con un URI.
 *
 * ## ⛔ La regola che questo file rende impossibile da dimenticare
 *
 * Owner, 2026-08-13: «per tutte le applicazioni che lo supportano dobbiamo
 * usare **intent con l'interfaccia direttamente nell'assistente** come fa
 * Gemini; per il resto possiamo usare la navigazione».
 *
 * ⇒ **Prima l'intent, il pilota è il ripiego.** E aggiungere un'app deve
 * costare UNA RIGA DI DATI, non un tool nuovo: un motore che chiede codice per
 * ogni app non è un motore, è una collezione di casi particolari che diverge.
 *
 * ## Gold standard 2026, e perché ognuna di queste scelte
 *
 * 1. ⭐ **HTTPS prima degli schemi custom.** `https://wa.me/…` batte
 *    `whatsapp://…` perché se l'app NON è installata l'URL apre comunque il
 *    web, invece di fallire con un'activity non trovata. Lo schema custom
 *    resta come seconda scelta dove l'HTTPS non esiste.
 * 2. ⛔ **`<queries>` nel manifest.** Da Android 11 senza la dichiarazione il
 *    sistema *nasconde* le altre app: `resolveActivity` torna `null` e sembra
 *    che l'app non ci sia. È già costato una diagnosi sbagliata su questo
 *    progetto.
 * 3. ⭐ **Ogni parametro è codificato**, sempre: un `&` o uno spazio dentro un
 *    messaggio spezza l'URI e manda un testo troncato — che è peggio di non
 *    mandarlo, perché sembra riuscito.
 * 4. ⛔ **Niente numeri, testi o indirizzi scritti a mano nel registro**: il
 *    registro descrive la FORMA, i valori arrivano da chi chiede.
 */

/** Come si raggiunge una capacità di un'app. */
export interface TalosViaIntent {
    /**
     * Il modello dell'URI, con i segnaposto `{nome}`.
     *
     * ⛔ I segnaposto vengono sostituiti **già codificati**: chi scrive un
     * modello non deve preoccuparsi dell'escape, ed è per questo che non si
     * concatenano stringhe fuori di qui.
     */
    readonly modello: string
    /**
     * `https` regge anche senza l'app (apre il web); `schema` no.
     *
     * ⇒ L'ordine di preferenza è una CONSEGUENZA di questo campo, non una
     * lista scritta a mano che qualcuno può riordinare per sbaglio.
     */
    readonly tipo: 'https' | 'schema'
}

/** Una cosa che TALOS sa far fare a un'app, senza toccarne lo schermo. */
export interface TalosCapacitaIntent {
    /** Identificatore stabile, in italiano: è quello che il modello chiede. */
    readonly id: string
    /** Il pacchetto Android, per verificarne la presenza e per il fallback. */
    readonly pacchetto: string
    /** Nome leggibile dell'app, per la scheda di conferma. */
    readonly app: string
    /** I parametri obbligatori, nell'ordine in cui una persona li direbbe. */
    readonly parametri: readonly string[]
    /**
     * Le vie, in ordine di preferenza dichiarato.
     *
     * ⛔ Più di una NON è ridondanza: è la differenza fra «non si può fare» e
     * «si fa in un altro modo». La prima che si risolve vince.
     */
    readonly vie: readonly TalosViaIntent[]
    /**
     * ⭐⭐⭐ L'ULTIMO CENTIMETRO: come si preme «invia» in quest'app.
     *
     * Un URI apre la conversazione col testo dentro e **non può spedire** —
     * WhatsApp, SMS ed email compilano e basta, per progetto. Il pulsante lo
     * deve premere qualcuno.
     *
     * ## Perché tre vie e non una
     *
     * Dalla ricerca 2026 sugli strumenti che lo fanno da anni (AutoInput,
     * MacroDroid): «quando l'app sposta o rinomina il pulsante, il task tocca
     * la cosa sbagliata o niente» — e MacroDroid, che cerca solo per etichetta,
     * **fallisce sul 31% dei form dinamici** dove AutoInput riesce.
     *
     * ⇒ L'ordine è per FRAGILITÀ CRESCENTE:
     *
     * 1. `viewId` — il nome della risorsa (`com.whatsapp:id/send`). Non cambia
     *    con la lingua, non si sposta col layout: è l'unica via che non
     *    indovina. Cambia solo se l'app rinomina la risorsa, cioè raramente e
     *    in modo visibile.
     * 2. `descrizioni` — la stringa di accessibilità. Tradotta, quindi ne
     *    servono più d'una, ma sopravvive a un rifacimento grafico.
     * 3. E se falliscono entrambe, NON si tocca a caso: si dice che non si è
     *    trovato. Un tocco alla cieca in una conversazione può mandare la cosa
     *    sbagliata alla persona sbagliata.
     */
    readonly invio?: {
        readonly viewId?: string
        readonly descrizioni?: readonly string[]
    }
    /**
     * `true` quando l'azione ESCE dal dispositivo (un messaggio a una persona,
     * una chiamata). Decide se serve la conferma con anteprima.
     *
     * ⛔ Non si deduce dal nome dell'azione: si dichiara. Un `id` che sembra
     * innocuo e spedisce è il difetto peggiore di tutta questa famiglia.
     */
    readonly esce: boolean
}

/**
 * ⛔ Il registro. Aggiungere un'app = aggiungere una voce, e nient'altro.
 *
 * Le vie sono quelle **pubbliche e documentate** dalle app stesse. Non ci sono
 * URI ricavati dal reverse engineering: quelli cambiano senza preavviso e
 * romperebbero in silenzio.
 */
export const TALOS_CAPACITA_INTENT: readonly TalosCapacitaIntent[] = [
    {
        id: 'whatsapp_messaggio',
        pacchetto: 'com.whatsapp',
        app: 'WhatsApp',
        parametri: ['numero', 'testo'],
        vie: [
            // ⭐ Documentato da WhatsApp, e regge senza l'app: apre web.whatsapp.
            { modello: 'https://wa.me/{numero}?text={testo}', tipo: 'https' },
            { modello: 'whatsapp://send?phone={numero}&text={testo}', tipo: 'schema' },
        ],
        invio: {
            viewId: 'com.whatsapp:id/send',
            descrizioni: ['Invia', 'Send'],
        },
        esce: true,
    },
    {
        id: 'telegram_messaggio',
        pacchetto: 'org.telegram.messenger',
        app: 'Telegram',
        parametri: ['utente', 'testo'],
        vie: [
            { modello: 'https://t.me/{utente}?text={testo}', tipo: 'https' },
            { modello: 'tg://resolve?domain={utente}&text={testo}', tipo: 'schema' },
        ],
        esce: true,
    },
    {
        id: 'mappe_naviga',
        pacchetto: 'com.google.android.apps.maps',
        app: 'Google Maps',
        parametri: ['destinazione'],
        vie: [
            {
                modello: 'https://www.google.com/maps/dir/?api=1&destination={destinazione}',
                tipo: 'https',
            },
            { modello: 'google.navigation:q={destinazione}', tipo: 'schema' },
        ],
        // Aprire un percorso non manda niente a nessuno.
        esce: false,
    },
    {
        id: 'youtube_cerca',
        pacchetto: 'com.google.android.youtube',
        app: 'YouTube',
        parametri: ['cosa'],
        vie: [
            { modello: 'https://www.youtube.com/results?search_query={cosa}', tipo: 'https' },
        ],
        esce: false,
    },
    {
        id: 'spotify_cerca',
        pacchetto: 'com.spotify.music',
        app: 'Spotify',
        parametri: ['cosa'],
        vie: [
            { modello: 'https://open.spotify.com/search/{cosa}', tipo: 'https' },
            { modello: 'spotify:search:{cosa}', tipo: 'schema' },
        ],
        esce: false,
    },
    {
        id: 'telefono_chiama',
        pacchetto: 'com.android.dialer',
        app: 'Telefono',
        parametri: ['numero'],
        // ⛔ `tel:` APRE il compositore, non chiama: la persona preme lei. È la
        // stessa scelta che il progetto ha già fatto per SMS e condivisione.
        vie: [{ modello: 'tel:{numero}', tipo: 'schema' }],
        esce: false,
    },
    {
        id: 'sms_messaggio',
        pacchetto: 'com.google.android.apps.messaging',
        app: 'Messaggi',
        parametri: ['numero', 'testo'],
        vie: [{ modello: 'smsto:{numero}?body={testo}', tipo: 'schema' }],
        invio: {
            viewId: 'com.google.android.apps.messaging:id/send_message_button_icon',
            descrizioni: ['Invia', 'Send', 'Invia SMS', 'Send SMS'],
        },
        esce: true,
    },
    {
        id: 'email_scrivi',
        pacchetto: 'com.google.android.gm',
        app: 'Gmail',
        parametri: ['a', 'oggetto', 'testo'],
        vie: [{ modello: 'mailto:{a}?subject={oggetto}&body={testo}', tipo: 'schema' }],
        esce: true,
    },
    // ══════ COMUNICAZIONE ══════
    {
        id: 'signal_messaggio',
        pacchetto: 'org.thoughtcrime.securesms',
        app: 'Signal',
        parametri: ['numero'],
        vie: [{ modello: 'https://signal.me/#p/{numero}', tipo: 'https' }],
        esce: false,
    },
    {
        id: 'messenger_messaggio',
        pacchetto: 'com.facebook.orca',
        app: 'Messenger',
        parametri: ['utente'],
        vie: [{ modello: 'https://m.me/{utente}', tipo: 'https' }],
        esce: false,
    },
    {
        id: 'whatsapp_chiama',
        pacchetto: 'com.whatsapp',
        app: 'WhatsApp',
        parametri: ['numero'],
        vie: [{ modello: 'https://wa.me/{numero}', tipo: 'https' }],
        esce: false,
    },
    // ══════ NAVIGAZIONE E LUOGHI ══════
    {
        id: 'mappe_cerca',
        pacchetto: 'com.google.android.apps.maps',
        app: 'Google Maps',
        parametri: ['cosa'],
        vie: [
            { modello: 'https://www.google.com/maps/search/?api=1&query={cosa}', tipo: 'https' },
            { modello: 'geo:0,0?q={cosa}', tipo: 'schema' },
        ],
        esce: false,
    },
    {
        id: 'mappe_percorso_mezzi',
        pacchetto: 'com.google.android.apps.maps',
        app: 'Google Maps',
        parametri: ['destinazione'],
        vie: [{
            modello: 'https://www.google.com/maps/dir/?api=1&destination={destinazione}&travelmode=transit',
            tipo: 'https',
        }],
        esce: false,
    },
    {
        id: 'mappe_percorso_piedi',
        pacchetto: 'com.google.android.apps.maps',
        app: 'Google Maps',
        parametri: ['destinazione'],
        vie: [{
            modello: 'https://www.google.com/maps/dir/?api=1&destination={destinazione}&travelmode=walking',
            tipo: 'https',
        }],
        esce: false,
    },
    {
        id: 'uber_corsa',
        pacchetto: 'com.ubercab',
        app: 'Uber',
        parametri: ['destinazione'],
        vie: [{
            modello: 'https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]={destinazione}',
            tipo: 'https',
        }],
        esce: false,
    },
    // ══════ MUSICA E VIDEO ══════
    {
        id: 'youtube_musica_cerca',
        pacchetto: 'com.google.android.apps.youtube.music',
        app: 'YouTube Music',
        parametri: ['cosa'],
        vie: [{ modello: 'https://music.youtube.com/search?q={cosa}', tipo: 'https' }],
        esce: false,
    },
    {
        id: 'netflix_cerca',
        pacchetto: 'com.netflix.mediaclient',
        app: 'Netflix',
        parametri: ['cosa'],
        vie: [{ modello: 'https://www.netflix.com/search?q={cosa}', tipo: 'https' }],
        esce: false,
    },
    // ══════ PRODUTTIVITÀ ══════
    {
        id: 'calendario_evento',
        pacchetto: 'com.google.android.calendar',
        app: 'Google Calendar',
        parametri: ['titolo'],
        vie: [{
            modello: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text={titolo}',
            tipo: 'https',
        }],
        esce: false,
    },
    {
        id: 'traduci',
        pacchetto: 'com.google.android.apps.translate',
        app: 'Google Traduttore',
        parametri: ['testo', 'lingua'],
        vie: [{
            modello: 'https://translate.google.com/?sl=auto&tl={lingua}&text={testo}&op=translate',
            tipo: 'https',
        }],
        esce: false,
    },
    {
        id: 'drive_cerca',
        pacchetto: 'com.google.android.apps.docs',
        app: 'Google Drive',
        parametri: ['cosa'],
        vie: [{ modello: 'https://drive.google.com/drive/search?q={cosa}', tipo: 'https' }],
        esce: false,
    },
    // ══════ ACQUISTI E SERVIZI ══════
    {
        id: 'amazon_cerca',
        pacchetto: 'com.amazon.mShop.android.shopping',
        app: 'Amazon',
        parametri: ['cosa'],
        vie: [{ modello: 'https://www.amazon.it/s?k={cosa}', tipo: 'https' }],
        esce: false,
    },
    {
        id: 'play_store_cerca',
        pacchetto: 'com.android.vending',
        app: 'Play Store',
        parametri: ['cosa'],
        vie: [
            { modello: 'https://play.google.com/store/search?q={cosa}', tipo: 'https' },
            { modello: 'market://search?q={cosa}', tipo: 'schema' },
        ],
        esce: false,
    },
    // ══════ SOCIALE ══════
    {
        id: 'instagram_profilo',
        pacchetto: 'com.instagram.android',
        app: 'Instagram',
        parametri: ['utente'],
        vie: [{ modello: 'https://www.instagram.com/{utente}/', tipo: 'https' }],
        esce: false,
    },
    {
        id: 'linkedin_cerca',
        pacchetto: 'com.linkedin.android',
        app: 'LinkedIn',
        parametri: ['cosa'],
        vie: [{ modello: 'https://www.linkedin.com/search/results/all/?keywords={cosa}', tipo: 'https' }],
        esce: false,
    },
    // ══════ WEB ══════
    {
        id: 'web_apri',
        pacchetto: 'com.android.chrome',
        app: 'browser',
        parametri: ['indirizzo'],
        vie: [{ modello: '{indirizzo}', tipo: 'https' }],
        esce: false,
    },
] as const

/**
 * Costruisce l'URI di una via, codificando ogni valore.
 *
 * ⛔ `encodeURIComponent` e non `encodeURI`: il secondo lascia passare `&` e
 * `?`, cioè esattamente i caratteri con cui un testo qualsiasi può prendersi i
 * parametri che vengono dopo. Un messaggio che contiene «vieni? sì & poi» non
 * deve poter cambiare il destinatario.
 */
export function talosComponiUri(
    via: TalosViaIntent,
    valori: Readonly<Record<string, string>>,
): string {
    return via.modello.replace(/\{(\w+)\}/g, (_, nome: string) =>
        encodeURIComponent(valori[nome] ?? ''))
}

/** La capacità con quell'id, o `null` — mai un'eccezione, è una ricerca. */
export function talosCapacita(id: string): TalosCapacitaIntent | null {
    return TALOS_CAPACITA_INTENT.find((c) => c.id === id) ?? null
}

/**
 * Cosa manca perché una capacità sia eseguibile.
 *
 * ⛔ Torna l'ELENCO di ciò che manca, non un booleano: «manca il numero» e
 * «manca il testo» portano a due domande diverse alla persona, e un `false`
 * le appiattisce entrambe in «non si può».
 */
export function talosParametriMancanti(
    capacita: TalosCapacitaIntent,
    valori: Readonly<Record<string, string | undefined>>,
): readonly string[] {
    return capacita.parametri.filter((p) => !valori[p]?.trim())
}
