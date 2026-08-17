import { registerPlugin } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'
import type { TalosDeviceToolSources } from '@/lib/tools/deviceTools'

/**
 * Un'app del dispositivo che accetta una certa azione.
 *
 * ⛔ Il **nome** viaggia insieme al pacchetto, e non è cortesia: un id non dice
 * niente a un modello. È già costato una diagnosi sbagliata su questo progetto
 * — `org.thunderdog.challegram` non somiglia a «Telegram», e due provider su
 * tre conclusero che Telegram non fosse installato.
 */
export interface TalosAppCheSaFare {
    readonly pacchetto: string
    readonly nome: string
    readonly attivita: string
}

/**
 * Il ponte fra i nove tool del telefono e i due plugin nativi.
 *
 * ## ⛔ Perché fuori da Android non finge
 *
 * In un browser — lo sviluppo, i test, un domani il desktop — non c'è nessun
 * telefono da toccare. La tentazione è restituire `done: true` per «non dare
 * fastidio»: sarebbe la bugia peggiore del catalogo, perché il modello direbbe
 * alla persona «fatto» di cose che non sono successe, e la persona imparerebbe
 * a non fidarsi di **tutti** i tool, non solo di questi.
 *
 * Qui la risposta è `done: false` con un motivo che il modello sa usare. La
 * stessa disciplina del Pad senza motore di vibrazione: MISURATO il 2026-08-08,
 * la chiamata non fallisce, semplicemente non succede niente — e va detto.
 *
 * ## Perché i nomi non coincidono tutti
 *
 * `openSettingsScreen` sul lato Kotlin, `openSettings` sul lato tool: il nome
 * nativo dice cosa fa Android, il nome del tool dice cosa chiede il modello.
 * L'adattamento sta qui e in un posto solo.
 */

interface PonteDispositivo {
    vibrate(options: { milliseconds: number }): Promise<{ done: boolean, reason?: string, appliedMs: number }>
    torch(options: { on: boolean }): Promise<{ done: boolean, reason?: string }>
    volume(options: { stream: string, percent?: number }): Promise<{ done: boolean, reason?: string, percent: number }>
    alarm(options: { hour?: number, minute?: number, seconds?: number, label?: string }): Promise<{ done: boolean, reason?: string }>
    /** ⛔ Il contrario di `alarm`. Senza, «annulla la sveglia» ne creava una seconda. */
    alarmDismiss(options: { hour?: number, minute?: number, all?: boolean }): Promise<{ done: boolean, reason?: string }>
    openApp(options: { package: string }): Promise<{ done: boolean, reason?: string }>
    /** ⭐ Apre un URI: è la porta unica del motore degli intent. */
    /**
     * ⭐⭐ `pacchetto` NON è un dettaglio: è «l'app, non il browser».
     *
     * MISURATO sul Pad il 2026-08-14: `https://open.spotify.com/search/...`
     * senza vincolo finisce a **Chrome**, con Spotify installato. Chi dichiara
     * un pacchetto vuole quell'app; il ponte prova prima là e ripiega sul
     * gestore predefinito solo se quell'app non sa aprirlo.
     */
    apriUri(options: {
        uri: string
        pacchetto?: string
    }): Promise<{ done: boolean, reason?: string }>
    /**
     * ⭐⭐⭐ CHI, FRA LE APP CHE ESISTONO DAVVERO, SA FARE QUESTA COSA.
     *
     * Owner 2026-08-13: «non puoi mettere delle righe predeterminate… la chat
     * ha già una lista delle applicazioni esistenti». ⇒ La domanda si fa al
     * telefono, non a una tabella, e le app installate domani entrano da sole.
     *
     * MISURATO sul Pad: `ACTION_SEND`+`text/plain` → **20 app**;
     * `ACTION_SEARCH` → **20 app**, fra cui Spotify e YouTube.
     */
    chiAccetta(options: {
        azione: string
        tipo?: string
        uri?: string
    }): Promise<{ app: TalosAppCheSaFare[] }>
    /**
     * ⭐⭐ LE ICONE VERE, chieste solo quando si disegnano.
     *
     * Owner 2026-08-14: «icone pulite e coerenti nelle schede per ogni app
     * prevista». Vengono da `getApplicationIcon`, cioè sono quelle che la
     * persona vede sul suo launcher — un'icona disegnata da noi sarebbe una riga
     * predeterminata col vestito grafico, e per l'app installata domani non
     * esisterebbe.
     *
     * ⛔ NON si mettono nei metadati del messaggio: diciassette app a ~6 kB
     * l'una sono cento kilobyte salvati per sempre nel database e ricopiati in
     * ogni backup, per un dato che il telefono ha già e che cambia quando l'app
     * si aggiorna. La scheda porta il pacchetto; l'icona si chiede al disegno.
     *
     * ⛔ La mappa può non avere una chiave: un'app disinstallata fra l'elenco e
     * il disegno semplicemente non c'è, e chi disegna mostra il posto vuoto.
     */
    iconeApp(options: { pacchetti: string[] }): Promise<{ icone: Record<string, string> }>
    /**
     * ⭐⭐⭐ Una pagina di PDF, come immagine — e senza un byte di libreria.
     *
     * Il difetto, sul Pad il 2026-08-17: TALOS genera un PDF, lo salva in
     * Libreria, la scheda lo mostra col nome e il peso, e toccandola non
     * succede NIENTE. Owner: «il PDF bisogna poterlo visualizzare dentro la
     * app».
     *
     * ⛔ Lo rende `PdfRenderer`, che sta nel framework Android: zero
     * dipendenze, zero `.so`, zero byte nel grafo d'avvio — che ha un tetto di
     * 605.000. Una libreria di terze parti ne avrebbe portati ~16 MB di
     * nativo, e pdf.js dentro la WebView avrebbe pagato proprio sul tetto.
     *
     * ⛔ UNA pagina per chiamata, e `pagine` dice quante ce ne sono: rendere
     * tutto insieme vorrebbe dire tenere N bitmap a piena risoluzione per un
     * documento di cui si guarderà la prima pagina.
     *
     * ⛔ E `larghezza` la decide chi chiama, perché solo lui sa quanto è largo
     * lo schermo.
     */
    renderizzaPdf(options: { percorso: string, pagina?: number, larghezza?: number }): Promise<{
        done: boolean
        reason?: string
        pagine?: number
        pagina?: number
        larghezza?: number
        altezza?: number
        png?: string
    }>
    /**
     * ⭐⭐⭐ Lancia un'AZIONE con i parametri negli extra, non dentro un URI.
     *
     * MISURATO il 2026-08-13: `translate.google.com/?text=girasole` apre il
     * Traduttore e **perde il testo**; `ACTION_SEND`+`text/plain` con
     * `android.intent.extra.TEXT` lo porta **a schermo**.
     */
    apriAzione(options: {
        azione: string
        tipo?: string
        uri?: string
        pacchetto?: string
        extra?: Readonly<Record<string, string>>
    }): Promise<{ done: boolean, reason?: string }>
    /**
     * ⭐⭐⭐ MANDA UN FILE a un'altra app — owner 2026-08-13.
     *
     * `apriAzione` qui sopra manda solo TESTO. Un file vuole un `content://`
     * prodotto da un `FileProvider` più il permesso di lettura: un `file://`
     * in `EXTRA_STREAM` lancia `FileUriExposedException` da Android 7. Tutto
     * il perché sta accanto all'implementazione, in `TalosDevicePlugin.kt`.
     *
     * `percorso` è RELATIVO alla cartella privata — cioè `private_uri` di un
     * file della libreria, così com'è sul disco.
     *
     * ⛔ `reason` distingue i casi che portano a cose diverse da dire:
     * `file-assente` · `percorso-fuori` · `cartella-non-dichiarata` (difetto
     * nostro) · `nessuno-lo-fa` (nessuna app accetta quel tipo).
     */
    condividiFile(options: {
        percorso: string
        /** Il nome VERO del file: su disco la libreria usa l'id interno. */
        nome?: string
        tipo?: string
        pacchetto?: string
        testo?: string
        /** Il JID del destinatario (`<numero>@s.whatsapp.net`): salta il selettore. */
        destinatario?: string
    }): Promise<{ done: boolean, reason?: string, uri?: string, tipo?: string }>
    /**
     * ⭐⭐⭐ Manda un file che sta sul TELEFONO, scelto dalla persona.
     *
     * L'`uri` arriva dal selettore di sistema ed è già un `content://` col suo
     * permesso di lettura: qui si rigira a chi riceve. ⛔ `reason` vale
     * `non-e-content` per uno schema sbagliato — un `file://` esploderebbe
     * nell'app di destinazione, e il difetto sembrerebbe suo mentre è nostro.
     */
    condividiUri(options: {
        uri: string
        tipo?: string
        pacchetto?: string
        testo?: string
        /** Il JID del destinatario (`<numero>@s.whatsapp.net`): salta il selettore. */
        destinatario?: string
    }): Promise<{ done: boolean, reason?: string, uri?: string, tipo?: string }>
    /**
     * ⭐ La riga di rubrica con cui un'app fa una cosa — o `null`.
     *
     * ⛔ `uri: null` **non è un errore**: è la risposta che fa scegliere il
     * ponte. `motivo` distingue `riga-assente` da `senza-permesso` da
     * `contatto-non-trovato`, che portano a tre cose diverse da dire.
     */
    rigaDiContatto(options: { numero: string, mime: string }): Promise<{
        uri: string | null
        motivo: string
    }>
    appInstallata(options: { package: string }): Promise<{ presente: boolean }>
    /**
     * Le app avviabili, `Etichetta<TAB>pacchetto` per riga.
     *
     * ⛔ Sta QUI e non nel privilegiato per una ragione misurata: passa dal
     * `PackageManager` dell'app con le `<queries>` già dichiarate, quindi non
     * vuole nessuna shell e funziona su un telefono dove il ponte non c'è.
     */
    listApps(): Promise<{ done: boolean, reason?: string, output?: string, count?: number }>
    /**
     * ⛔ `scope` dice QUALE pagina si e' aperta: `app` la riga di TALOS,
     * `general` l'elenco di tutte. Il nativo ripiega da una all'altra quando la
     * prima non si apre — misurato il 2026-08-10 — e chi non lo sapesse
     * direbbe alla persona di cercare una riga che non sta guardando.
     */
    openSettingsScreen(options: { action: string, forThisApp: boolean }): Promise<{ done: boolean, reason?: string, scope?: string }>
    compose(options: { kind: string, value: string, text?: string }): Promise<{ done: boolean, reason?: string }>
    status(): Promise<Record<string, unknown>>
    location(): Promise<{
        stato: string
        latitudine?: number
        longitudine?: number
        precisioneMetri?: number
        etaSecondi?: number
    }>
    wallpaper(options: { imageBase64: string, where: string }): Promise<{ done: boolean, reason?: string, appliedTo: string }>
    keepAwake(options: { on: boolean }): Promise<{ done: boolean, reason?: string, on: boolean }>
    /**
     * ⭐⭐ Quante email non lette, chieste al TELEFONO.
     *
     * ⛔ Dal content provider pubblico di Gmail, non dall'API di Google: quella
     * vuole uno scope **ristretto** (verifica + assessment CASA fino al
     * penetration test, e un token che in «Testing» scade ogni 7 giorni).
     *
     * ⛔ Dà i CONTEGGI, mai il testo: da questa strada il contenuto di una email
     * non è raggiungibile, e va bene così. Mittente e oggetto restano quelli
     * delle notifiche, che la persona ha già visto comparire.
     *
     * ⛔ `letto: false` porta sempre un `motivo`: «zero non lette» e «il
     * provider non ha risposto» sono fatti diversi, e appiattirli farebbe dire
     * «non hai posta» a chi ce l'ha.
     */
    postaNonLetta(): Promise<{
        letto: boolean
        /** `nessun-account` | `permesso-mancante` | `provider-muto` */
        motivo?: string
        caselle: Array<{
            conto: string
            nonLette: number
            /**
             * ⛔ Le SEZIONI della posta in arrivo, quando ci sono — e i nomi
             * sono quelli di Gmail, nella lingua della persona.
             *
             * MISURATO sul Pad il 2026-08-14: su questo account `^i` non esiste
             * e la posta in arrivo è divisa in quattro (`^sq_ig_i_personal`,
             * `_promo`, `_social`, `_notification`). «27.953» da solo sarebbe
             * vero e inutile: 3.804 stanno in Principali e il resto è
             * pubblicità.
             */
            sezioni?: Array<{ nome: string, nonLette: number }>
        }>
    }>
    /**
     * ⛔⛔ Il permesso di Gmail è `dangerous`: SI CHIEDE, e dichiararlo non basta.
     *
     * MISURATO sul Pad il 2026-08-14, col permesso già nel manifest:
     * `SecurityException … requires com.google.android.gm.permission.READ_CONTENT_PROVIDER`
     * e `dumpsys package permission` che risponde `prot=dangerous`. Comparire
     * fra i permessi RICHIESTI non vuol dire essere stati autorizzati.
     */
    chiediPermessoPosta(): Promise<{ permesso: boolean }>
    /** Lo screenshot di sistema, via servizio di accessibilità. */
    schermata(): Promise<{ done: boolean, reason?: string }>
    /**
     * ⭐ Media: `playing` è la parte che conta.
     *
     * Non è un `done` travestito — è lo stato **riletto dopo** l'invio del tasto.
     * Un tasto media senza sessione attiva va nel vuoto senza fallire, quindi
     * chi chiama deve poter dire «l'ho chiesto, e adesso non suona» invece di
     * «fatto». Vedi il commento nel plugin nativo.
     */
    media(options: { action: string }): Promise<{ done: boolean, reason?: string, playing: boolean, action?: string }>
}

interface PonteVoce {
    speak(options: { text: string }): Promise<{ spoken: boolean, reason?: string }>
    stop(): Promise<void>
    status(): Promise<{ available: boolean, speaking: boolean, silenced: boolean }>
}

export const TalosDeviceBridge = registerPlugin<PonteDispositivo>('TalosDevice')
export const TalosSpeechBridge = registerPlugin<PonteVoce>('TalosSpeech')

/** Il motivo unico per «qui non c'è un telefono», scritto una volta sola. */
const FUORI_DA_ANDROID = 'not-on-this-platform'

function nonQui<T extends object>(extra: T) {
    return { done: false, reason: FUORI_DA_ANDROID, ...extra }
}

/**
 * ⛔ Restituisce `null` quando non siamo su Android, e non un oggetto che dice
 * sempre di no: il toolset salta l'intero gruppo, così il modello non riceve
 * nemmeno gli schemi di nove tool che non potrebbero funzionare. Un tool
 * offerto e sempre fallimentare costa token a ogni turno e insegna al modello
 * ad ignorare una capacità che altrove funziona.
 */
/**
 * ⛔ `Omit` di `findImage`/`availableImages`, e non e' pigrizia di tipi: questo
 * file conosce il TELEFONO, non la Libreria. La risoluzione di un'immagine dal
 * nome vive nel controller, dove vive gia' per la modifica delle immagini, e da
 * li' viene aggiunta. Dichiararla qui vorrebbe dire o duplicarla o farsi passare
 * mezzo controller — e la duplicazione e' esattamente cio' che questa firma
 * impedisce.
 */
export type TalosDeviceHardwareSources =
    Omit<TalosDeviceToolSources, 'findImage' | 'availableImages'>

export function createTalosDeviceSources(): TalosDeviceHardwareSources | null {
    if (!Capacitor.isNativePlatform()) return null

    return {
        async vibrate(milliseconds) {
            try {
                return await TalosDeviceBridge.vibrate({ milliseconds })
            }
            catch {
                return nonQui({ appliedMs: 0 })
            }
        },
        async torch(on) {
            try {
                return await TalosDeviceBridge.torch({ on })
            }
            catch {
                return nonQui({})
            }
        },
        async volume(stream, percent) {
            try {
                return await TalosDeviceBridge.volume({ stream, percent })
            }
            catch {
                return nonQui({ percent: 0 })
            }
        },
        async alarm(input) {
            try {
                return await TalosDeviceBridge.alarm(input)
            }
            catch {
                return nonQui({})
            }
        },
        async alarmDismiss(input) {
            try {
                return await TalosDeviceBridge.alarmDismiss(input)
            }
            catch {
                return nonQui({})
            }
        },
        async openApp(packageName) {
            try {
                return await TalosDeviceBridge.openApp({ package: packageName })
            }
            catch {
                return nonQui({})
            }
        },
        async openSettings(action, forThisApp) {
            try {
                return await TalosDeviceBridge.openSettingsScreen({ action, forThisApp })
            }
            catch {
                return nonQui({})
            }
        },
        async compose(kind, value, text) {
            try {
                return await TalosDeviceBridge.compose({ kind, value, text })
            }
            catch {
                return nonQui({})
            }
        },
        /**
         * ⛔ Delega, e non duplica: `posizione.ts` sa già distinguere «negato»
         * da «GPS spento» da «scaduta», ed è l'unico posto in cui quella
         * classificazione va scritta. Due copie di quella logica divergono al
         * primo Android nuovo.
         */
        async location() {
            const { talosLeggiPosizione } = await import('@/lib/device/posizione')
            return talosLeggiPosizione()
        },
        async status() {
            try {
                const stato = await TalosDeviceBridge.status()
                /*
                 * ⛔⛔ E SE IL PONTE È GIÙ, il resoconto deve DIRLO.
                 *
                 * ## Misurato sul Pad il 2026-08-15
                 *
                 * Col debug wireless spento (`adb_wifi_enabled = 0`), chiesto
                 * «controlla il mio telefono». TALOS ha risposto benissimo —
                 * batteria, memoria, spazio, suoneria — e ha perfino elencato
                 * «due cose che non ho potuto controllare: notifiche e Gmail».
                 * Della **strada privilegiata giù non ha detto una parola**.
                 *
                 * Ma senza ponte non funzionano: leggere lo schermo, pilotarlo,
                 * Wi-Fi, Bluetooth, aereo, risparmio energia, non disturbare,
                 * l'elenco delle app. ⇒ Metà di ciò che TALOS sa fare era
                 * ferma, e chi ha letto «Ecco la situazione» ha creduto di aver
                 * visto tutto. È la stessa forma del cerchio vuoto nei permessi
                 * e della spina: **uno stato vero che il resoconto tace**.
                 *
                 * ⛔ Si CHIEDE ogni volta, non si ricorda: il ponte muore al
                 * riavvio, e un flag racconterebbe un mondo che non c'è più
                 * (vedi `talosPrivilegedReady`).
                 *
                 * ⛔ E non blocca mai il resoconto: se la domanda al ponte
                 * fallisce o esplode, la chiave non c'è — «non lo so» non si
                 * dice come «è giù».
                 */
                const { talosPrivilegedReady } = await import('@/lib/device/privilegedShell')
                const ponte = await talosPrivilegedReady().catch(() => null)
                return ponte === null ? stato : { ...stato, bridge: ponte }
            }
            catch {
                return { available: false, reason: FUORI_DA_ANDROID }
            }
        },
        async wallpaper(imageBase64, where) {
            try {
                return await TalosDeviceBridge.wallpaper({ imageBase64, where })
            }
            catch {
                return nonQui({ appliedTo: where })
            }
        },
        async keepAwake(on) {
            try {
                return await TalosDeviceBridge.keepAwake({ on })
            }
            catch {
                return nonQui({ on })
            }
        },
        async screenshot() {
            try {
                return await TalosDeviceBridge.schermata()
            }
            catch {
                return nonQui({})
            }
        },
        async postaNonLetta() {
            let esito
            try {
                esito = await TalosDeviceBridge.postaNonLetta()
            }
            catch {
                return { letto: false, motivo: FUORI_DA_ANDROID, caselle: [] }
            }
            /*
             * ⭐ SI CHIEDE, non si manda in Impostazioni — la stessa regola del
             * calendario e della rubrica: il dialogo di sistema costa un tocco e
             * compare sopra quello che la persona sta facendo.
             *
             * ⛔ UNA volta sola. Se dice di no, il motivo resta
             * `permesso-mancante` e chi legge lo dice: un permesso richiesto due
             * volte di fila è un permesso che viene negato.
             */
            if (esito.motivo !== 'permesso-mancante') return esito
            const concesso = await TalosDeviceBridge.chiediPermessoPosta()
                .then((r) => r.permesso)
                .catch(() => false)
            if (!concesso) return esito
            return await TalosDeviceBridge.postaNonLetta().catch(() => esito)
        },
        async media(action) {
            try {
                return await TalosDeviceBridge.media({ action })
            }
            catch {
                // ⛔ Fuori dal telefono non suona niente, e dirlo `playing: false`
                // e' vero: non e' un ripiego, e' la risposta giusta.
                return nonQui({ playing: false })
            }
        },
        async speak(text) {
            try {
                return await TalosSpeechBridge.speak({ text })
            }
            catch {
                return { spoken: false, reason: 'unavailable' }
            }
        },
    }
}
