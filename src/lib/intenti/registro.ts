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

/** Una via che passa da un URI: `https://…` o uno schema custom. */
export interface TalosViaUri {
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
     *
     * ⛔ MA NON SEMPRE: MISURATO sul Pad il 2026-08-13, `maps/search/?api=1&
     * query=farmacia` apre Maps sulla schermata iniziale **senza cercare**,
     * mentre `geo:0,0?q=farmacia` la ricerca la fa. ⇒ «HTTPS prima» vale
     * quando l'HTTPS porta davvero i parametri; dove non li porta, l'ordine si
     * inverte **con la misura scritta accanto**.
     */
    readonly tipo: 'https' | 'schema'
    /**
     * ⛔ I parametri che **sono già l'URI** e che quindi NON vanno codificati.
     *
     * MISURATO sul Pad il 2026-08-13: «apri il sito example.org» apriva niente,
     * e TALOS spiegava alla persona che il suo browser non raggiungeva il sito
     * «per un firewall o un proxy» — inventato. La causa: `web_apri` ha
     * `modello: '{indirizzo}'`, e la codifica trasformava
     * `https://example.org` in `https%3A%2F%2Fexample.org`, che non è un URI.
     *
     * ⇒ Codificare è giusto per un VALORE dentro un URI e sbagliato per un URI
     * intero. La differenza si **dichiara**: indovinarla (per esempio «se il
     * modello è solo un segnaposto allora è grezzo») funzionerebbe oggi e si
     * romperebbe alla prima via con due segnaposto.
     */
    readonly nonCodificare?: readonly string[]
}

/**
 * ⭐⭐⭐ Una via che passa da un'AZIONE Android, coi valori negli EXTRA.
 *
 * ## La misura che l'ha resa necessaria
 *
 * Un URI porta i parametri solo se l'app li legge, e spesso non li legge.
 * MISURATO sul Pad il 2026-08-13:
 *
 * | | con l'URI | con l'azione |
 * |---|---|---|
 * | traduci «girasole» | Traduttore sulla schermata iniziale, **testo perso** | `ACTION_SEND` + `text/plain` → **«girasole» a schermo** |
 *
 * ⛔ E c'è la differenza che un test deve mordere: nell'URI ogni valore va
 * **codificato**, negli extra **no**. Un `%20` dentro un extra arriva a schermo
 * come `%20`, e la persona legge il proprio messaggio pieno di percentuali.
 */
export interface TalosViaAzione {
    readonly tipo: 'azione'
    /** L'azione Android, per nome pieno: `android.intent.action.SEND`. */
    readonly azione: string
    /** Il tipo MIME, quando l'azione lo richiede. */
    readonly mime?: string
    /**
     * Gli extra, con i segnaposto `{nome}`. Le chiavi sono le **costanti di
     * Android** (`android.intent.extra.TEXT`, `query`): così il ponte nativo
     * resta generico e non impara niente su nessuna app.
     */
    readonly extra: Readonly<Record<string, string>>
}

/**
 * ⭐⭐⭐ Una via che passa dalla RIGA DI RUBRICA che un'app si è creata.
 *
 * Owner, 2026-08-13: «predisponi l'API nativa di WhatsApp se c'è la riga, se no
 * usiamo il ponte». Questa via **è** quella scelta, scritta come dato: sta
 * prima delle altre, e se la riga non c'è il motore passa alla successiva da
 * solo. Nessun `if` da qualche parte nel codice.
 *
 * MISURATO sul Pad: WhatsApp dichiara `.accountsync.CallContactLandingActivity`
 * per `vnd.android.cursor.item/vnd.com.whatsapp.voip.call` — **l'API esiste** —
 * ma nella rubrica di sistema non c'è nessun account `com.whatsapp`, quindi la
 * riga **non c'è** e qui vince il ripiego.
 *
 * ⛔ Non è un'API ufficiale di WhatsApp (le fonti: «undocumented or unsupported
 * approach»). ⇒ Si prova, non ci si dipende: è esattamente perché sta in un
 * elenco di vie invece che essere l'unica strada.
 */
export interface TalosViaRigaContatto {
    readonly tipo: 'riga-contatto'
    /** Il mimetype della riga, per esempio quello della chiamata WhatsApp. */
    readonly mime: string
    /** Quale parametro porta il numero con cui cercare il contatto. */
    readonly numero: string
}

/** Come si raggiunge una capacità: per URI, per azione con extra, o per riga di rubrica. */
export type TalosViaIntent = TalosViaUri | TalosViaAzione | TalosViaRigaContatto

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
     *
     * ⛔ Qui dentro ci va **solo ciò che è stato misurato sul dispositivo**. Un
     * `viewId` plausibile ma mai visto è peggio di nessun `viewId`: promette un
     * invio che poi non avviene, e la persona crede di aver mandato.
     */
    readonly invio?: {
        readonly viewId?: string
        readonly descrizioni?: readonly string[]
        /**
         * ⛔ QUALE parametro porta il testo che sta per uscire — si DICHIARA.
         *
         * Serve alla guardia che pretende di rivedere quel testo nel campo
         * prima di premere: senza, si spedirebbe la bozza che l'app si era
         * tenuta da prima. Dedurlo («è l'ultimo parametro») funzionerebbe oggi
         * e si romperebbe alla prima capacità con un ordine diverso.
         */
        /**
         * ⛔ Assente quando non c'è niente da riverificare — una CHIAMATA non
         * ha un testo. Ma dove un testo c'è, la guardia è obbligatoria: senza,
         * partirebbe la bozza vecchia. Il test `nessunInvioSenzaGuardia`
         * pretende che ogni capacità con un parametro di testo lo dichiari.
         */
        readonly contenuto?: string
        /**
         * ⭐⭐⭐ L'app può chiedere una SUA conferma dopo il primo tocco.
         *
         * MISURATO sul Pad il 2026-08-13: premuto «Chiamata vocale» in
         * WhatsApp, `click=true`, e la chiamata **non parte** — perché WhatsApp
         * apre **«Avviare una chiamata vocale?»** con *Annulla* e *Chiama*.
         * L'ultimo centimetro era lungo **due** passi.
         *
         * ## ⛔ È un `true`, non un elenco di etichette
         *
         * Owner, 2026-08-13: «non possiamo andare per ciascuna app esistente
         * possibile e immaginabile e prevedere in ogni caso per ogni
         * funzionalità, sarebbe da pazzi». Aveva ragione: avevo appena scritto
         * `['Chiama', 'Call']`, cioè una riga per app, per funzione, per lingua.
         *
         * La misura l'ha reso inutile — quel dialogo usa gli **id del
         * framework**, uguali per ogni app e **non tradotti**:
         * `android:id/message` la domanda, `android:id/button1` il positivo,
         * `android:id/button2` il negativo. ⇒ Qui basta dire **se** può
         * succedere; il **come** è una regola sola, in `confermaDialogo`.
         */
        readonly confermaApp?: true
    }
    /**
     * `true` quando l'azione ESCE dal dispositivo (un messaggio a una persona,
     * una chiamata). Decide se serve la conferma con anteprima.
     *
     * ⛔ Non si deduce dal nome dell'azione: si dichiara. Un `id` che sembra
     * innocuo e spedisce è il difetto peggiore di tutta questa famiglia.
     */
    readonly esce: boolean
    /**
     * ⛔ PERCHÉ l'ordine delle vie deroga alla regola «HTTPS prima».
     *
     * La regola esiste perché l'HTTPS regge anche senza l'app. Ma regge a fare
     * **cosa**? Su `mappe_cerca` apriva Maps e non cercava niente: un
     * fallimento che sembra un successo. ⇒ La deroga si può fare, e costa una
     * riga: qui dentro va la misura che l'ha decisa.
     *
     * ⭐ Il test la usa come chiave: senza questo campo l'ordine invertito è
     * **rosso**. Così un riordino per sbaglio si vede, e uno voluto lascia
     * scritto perché — che è la sola differenza fra i due.
     */
    readonly ordineMisurato?: string
}

/**
 * ⛔ Il registro. Aggiungere un'app = aggiungere una voce, e nient'altro.
 *
 * Le vie sono quelle **pubbliche e documentate** dalle app stesse. Non ci sono
 * URI ricavati dal reverse engineering: quelli cambiano senza preavviso e
 * romperebbero in silenzio.
 */
/**
 * ⭐⭐⭐ COME SI PREME «INVIA» in una certa app — riusando ciò che è già misurato.
 *
 * Owner 2026-08-13, fase 1: mandare un file deve arrivare fino in fondo come ci
 * arriva un messaggio, o TALOS *prepara* e non *fa* — che è la differenza su cui
 * si gioca tutto il confronto con Gemini.
 *
 * ⛔ Non nasce una tabella nuova, e non e' pigrizia: `com.whatsapp:id/send` era
 * gia' nel registro per `whatsapp_messaggio`, ed e' lo STESSO nodo sulla
 * schermata di anteprima del documento — MISURATO sul Pad il 2026-08-13,
 * `com.whatsapp:id/send desc="Invia" clickable=true` su
 * `DocumentPreviewActivity`. Una seconda tabella sarebbe un secondo posto dove
 * un giorno uno dei due invecchia.
 *
 * ⛔ E per un'app che non ha una riga, la risposta e' `null`: il file resta
 * allegato e si dice che l'invio non e' partito. Indovinare un pulsante in
 * un'app che non abbiamo misurato vorrebbe dire premere qualcosa a caso dentro
 * la conversazione di qualcun altro.
 */
export function talosInvioPerPacchetto(
    pacchetto: string,
): TalosCapacitaIntent['invio'] | null {
    if (!pacchetto) return null
    return TALOS_CAPACITA_INTENT
        .find((c) => c.pacchetto === pacchetto && c.invio?.viewId)?.invio ?? null
}

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
        // ⭐ MISURATO sul Pad il 2026-08-13, WhatsApp 2.26.30.97: il nodo
        // `com.whatsapp:id/send` esiste, è `clickable=true enabled=true` e ha
        // `content-desc="Invia"`. E a campo vuoto **non c'è** (conteggio 0):
        // è quella scomparsa la prova che il messaggio è partito.
        invio: {
            viewId: 'com.whatsapp:id/send',
            descrizioni: ['Invia', 'Send'],
            contenuto: 'testo',
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
        /*
         * ⛔ NIENTE `invio` QUI, e non è una dimenticanza — è una misura.
         *
         * C'era `com.google.android.apps.messaging:id/send_message_button_icon`,
         * plausibile e mai visto da nessuno. Provato sul Pad il 2026-08-13:
         *
         * 1. `smsto:` non arriva a Messaggi: apre il selettore «Apri con»
         *    (Messaggi / WhatsApp), perché anche WhatsApp dichiara lo schema.
         * 2. Puntando l'app per componente, Messaggi si apre sulla
         *    conversazione e al posto del campo di scrittura mostra
         *    **«Inserisci una scheda SIM per continuare»**: il Pad non ha SIM,
         *    quindi il pulsante d'invio non esiste proprio.
         *
         * ⇒ Un `viewId` scritto a mano prometterebbe un invio che non può
         * avvenire, e la persona crederebbe di aver mandato un SMS. Meglio
         * niente: il tool dirà che ha aperto la bozza, che è la verità.
         */
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
        /*
         * ⛔⛔ PRIMA IL NATIVO, POI IL PONTE — decisione dell'owner, 2026-08-13.
         *
         * MISURATO con un contatto vero: `wa.me/<numero>` apre la CHAT e non
         * chiama. Il nome della capacità prometteva più di quel che faceva.
         *
         * La prima via chiede al telefono la riga di rubrica di WhatsApp: se
         * c'è, la chiamata parte davvero e non si tocca lo schermo. Se non c'è
         * — ed è il caso di questo Pad, dove nella rubrica non esiste nessun
         * account `com.whatsapp` — si passa alla seconda, che apre la chat, e
         * l'ultimo centimetro lo fa l'occhio.
         */
        ordineMisurato: 'Pad 2026-08-13: wa.me apre la chat e NON chiama; la riga '
            + 'nativa di WhatsApp chiama, ma su questo dispositivo non esiste.',
        vie: [
            {
                tipo: 'riga-contatto',
                mime: 'vnd.android.cursor.item/vnd.com.whatsapp.voip.call',
                numero: 'numero',
            },
            { modello: 'https://wa.me/{numero}', tipo: 'https' },
        ],
        /*
         * ⛔ I due pulsanti di chiamata hanno `resource-id=""` — MISURATO. È il
         * primo caso in cui la strada robusta (il `viewId`) non esiste proprio,
         * e resta solo il ripiego per descrizione, che è tradotto. Per questo
         * ce ne sono due lingue.
         */
        invio: {
            descrizioni: ['Chiamata vocale', 'Voice call'],
            // MISURATO: dopo il primo tocco WhatsApp chiede «Avviare una
            // chiamata vocale?». Il COME si preme non sta qui: è la regola
            // generica sugli id del framework.
            confermaApp: true,
        },
        // ⛔ `true`: se chiama davvero, squilla il telefono di una persona. Era
        // `false` quando la capacità si limitava ad aprire una chat.
        esce: true,
    },
    // ══════ NAVIGAZIONE E LUOGHI ══════
    {
        id: 'mappe_cerca',
        pacchetto: 'com.google.android.apps.maps',
        app: 'Google Maps',
        parametri: ['cosa'],
        /*
         * ⛔⛔ QUI L'ORDINE È INVERTITO, ED È UNA MISURA — 2026-08-13, sul Pad:
         *
         * | strada | esito |
         * |---|---|
         * | `maps/search/?api=1&query=farmacia` | ⛔ Maps sulla **schermata iniziale**, nessuna ricerca |
         * | `geo:0,0?q=farmacia` | ✅ la ricerca **avviene** |
         *
         * La regola generale «HTTPS prima» esiste perché l'HTTPS regge anche
         * senza l'app. Ma regge a fare **cosa**? Qui apriva l'app e non cercava
         * niente: un fallimento che sembra un successo. ⇒ La regola vale
         * quando l'HTTPS porta davvero i parametri, e dove non li porta si
         * inverte, con la misura scritta accanto.
         *
         * ⛔ `mappe_naviga` NON si tocca: `dir/?api=1&destination=` funziona —
         * misurato «Catania» a schermo. Non è l'app, è quella forma di URL.
         */
        ordineMisurato: 'Pad 2026-08-13: maps/search/?api=1&query=farmacia apre '
            + 'Maps sulla schermata iniziale senza cercare; geo:0,0?q=farmacia cerca.',
        vie: [
            { modello: 'geo:0,0?q={cosa}', tipo: 'schema' },
            { modello: 'https://www.google.com/maps/search/?api=1&query={cosa}', tipo: 'https' },
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
        // ⛔ `lingua` NON è più un parametro, ed è una promessa tolta invece che
        // una funzione persa: MISURATO che l'URL la ignorava comunque (chiesto
        // `tl=en`, il Traduttore mostrava *Persiano*). Dichiarare un parametro
        // che non arriva è peggio che non averlo.
        parametri: ['testo'],
        vie: [
            /*
             * ⭐ MISURATO sul Pad il 2026-08-13, nei due versi:
             *
             * | strada | esito |
             * |---|---|
             * | `translate.google.com/?text=girasole&tl=en` | ⛔ schermata iniziale, **testo perso** |
             * | `ACTION_SEND` + `text/plain` + `EXTRA_TEXT` | ✅ **«girasole» a schermo** |
             *
             * ⇒ L'URL non è mai stato la strada giusta, e la regola «HTTPS
             * prima» qui non si applica proprio: non è una gara fra URI.
             */
            {
                tipo: 'azione',
                azione: 'android.intent.action.SEND',
                mime: 'text/plain',
                extra: { 'android.intent.extra.TEXT': '{testo}' },
            },
        ],
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
        // ⛔ L'unica via del registro il cui parametro **è** l'URI, non un
        // valore dentro l'URI. Vedi `nonCodificare`: senza questa riga
        // `https://example.org` partiva come `https%3A%2F%2Fexample.org`.
        vie: [{ modello: '{indirizzo}', tipo: 'https', nonCodificare: ['indirizzo'] }],
        esce: false,
    },
] as const

/**
 * ⭐⭐⭐ UNA CAPACITÀ SENZA APP — l'app la sceglie il DISPOSITIVO.
 *
 * ## Perché esiste
 *
 * Owner, 2026-08-13: «non puoi mettere delle righe predeterminate. La chat ha
 * già una lista delle applicazioni esistenti. Dobbiamo fare in modo che chiami
 * in quelle e non usi delle righe generiche».
 *
 * Il registro qui sopra descrive **quell'app, quel link**: è preciso e invecchia.
 * MISURATO lo stesso giorno quanto invecchia in fretta — `com.android.dialer`
 * non esiste sul Pad, `spotify:search:` non ha più un gestore, 9 pacchetti su
 * 21 non sono installati.
 *
 * Queste invece descrivono **una forma d'azione**, e chi la sappia fare lo
 * chiede al telefono con `chiAccetta()`. MISURATO sul Pad:
 * `ACTION_SEND`+`text/plain` = **20 app**, `ACTION_SEARCH` = **20 app** —
 * comprese quelle installate dopo che questo file è stato scritto.
 *
 * ⇒ Sono poche righe e coprono più app di tutto il registro sopra. Non lo
 * sostituiscono: un deep link sa fare cose che un'azione generica non sa (la
 * chat GIUSTA di WhatsApp, il percorso a piedi). Le due strade servono a due
 * domande diverse, e averle entrambe è il punto.
 */
export interface TalosCapacitaGenerica {
    readonly id: string
    /** L'azione con cui si chiede al telefono chi la sa fare, e con cui si esegue. */
    readonly via: TalosViaAzione
    readonly parametri: readonly string[]
    /**
     * ⛔ `null` = **non si sa**, e non è «no».
     *
     * Mandare un testo a Keep non esce dal telefono; mandarlo a Gmail sì. La
     * capacità generica non può saperlo, e fingere `false` autorizzerebbe in
     * silenzio un invio a una persona vera. ⇒ Si tratta come se uscisse.
     */
    readonly esce: boolean | null
}

export const TALOS_CAPACITA_GENERICHE: readonly TalosCapacitaGenerica[] = [
    {
        id: 'manda_testo_a_app',
        via: {
            tipo: 'azione',
            azione: 'android.intent.action.SEND',
            mime: 'text/plain',
            extra: { 'android.intent.extra.TEXT': '{testo}' },
        },
        parametri: ['testo'],
        esce: null,
    },
    {
        id: 'cerca_dentro_app',
        via: {
            tipo: 'azione',
            azione: 'android.intent.action.SEARCH',
            // `query` è `SearchManager.QUERY`: la costante di Android, non nostra.
            extra: { query: '{cosa}' },
        },
        parametri: ['cosa'],
        esce: false,
    },
] as const

/** La capacità generica con quell'id, o `null`. */
export function talosCapacitaGenerica(id: string): TalosCapacitaGenerica | null {
    return TALOS_CAPACITA_GENERICHE.find((c) => c.id === id) ?? null
}

/**
 * Costruisce l'URI di una via, codificando ogni valore.
 *
 * ⛔ `encodeURIComponent` e non `encodeURI`: il secondo lascia passare `&` e
 * `?`, cioè esattamente i caratteri con cui un testo qualsiasi può prendersi i
 * parametri che vengono dopo. Un messaggio che contiene «vieni? sì & poi» non
 * deve poter cambiare il destinatario.
 */
export function talosComponiUri(
    via: TalosViaUri,
    valori: Readonly<Record<string, string>>,
): string {
    return via.modello.replace(/\{(\w+)\}/g, (_, nome: string) => {
        const valore = valori[nome] ?? ''
        return via.nonCodificare?.includes(nome) ? valore : encodeURIComponent(valore)
    })
}

/**
 * Un URI `https` senza schema non è un URI: glielo si mette.
 *
 * ⛔ MISURATO: chi dice «apri example.org» non scrive `https://`, e senza
 * schema `resolveActivity` torna `null` — cioè la stessa risposta che dà quando
 * l'app non c'è. Due cause diverse con una risposta sola sono il difetto più
 * frequente di questo progetto, e qui la prima si può semplicemente togliere.
 *
 * ⛔ Vale SOLO per le vie `https`: aggiungerlo a uno schema custom
 * (`geo:`, `tel:`) romperebbe l'unica cosa che quelle vie sanno fare.
 */
export function talosConSchema(via: TalosViaUri, uri: string): string {
    if (via.tipo !== 'https' || /^[a-z][a-z0-9+.-]*:/i.test(uri)) return uri
    return `https://${uri}`
}

/**
 * Riempie gli extra di un'azione — **senza codificare**.
 *
 * ⛔⛔ Il contrario esatto di `talosComponiUri`, e non è una svista: dentro un
 * URI un `&` non codificato dirotta i parametri, dentro un extra un `%20`
 * arriva **a schermo** come `%20`. Le due funzioni fanno la stessa cosa in due
 * mondi con regole opposte, e usarne una al posto dell'altra rompe in silenzio
 * — in un caso il messaggio cambia destinatario, nell'altro la persona legge il
 * proprio testo pieno di percentuali.
 */
export function talosComponiExtra(
    via: TalosViaAzione,
    valori: Readonly<Record<string, string>>,
): Record<string, string> {
    const fuori: Record<string, string> = {}
    for (const [chiave, modello] of Object.entries(via.extra)) {
        fuori[chiave] = modello.replace(/\{(\w+)\}/g, (_, nome: string) => valori[nome] ?? '')
    }
    return fuori
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
