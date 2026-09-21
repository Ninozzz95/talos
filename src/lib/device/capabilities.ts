/**
 * Cosa TALOS può fare sul telefono, e **cosa manca** quando non può.
 *
 * ## La tesi, in una riga
 *
 * Gemini dice «non posso farlo». Tasker esegue e non succede niente. Nessuno
 * dei due dice **perché**, e nessuno porta all'interruttore.
 *
 * ⇒ Qui ogni capacità dichiara **in che regime vive** e **qual è il passo
 * mancante**, così il modello non risponde mai «non posso» e basta: risponde
 * «non posso adesso, serve questo, e ti ci porto». È il one-up reso meccanico
 * invece che promesso.
 *
 * ## ⛔ Perché i regimi, e non «i permessi»
 *
 * Perché la domanda che conta non è quale permesso serve — è **come si arriva
 * al risultato**, e ci sono tre modi che si comportano in modo diverso:
 *
 * - **`ask`** — un intent, una `Settings.ACTION_*`, un'App Action. Non ha una
 *   percentuale di riuscita: la schermata esiste o non esiste. Deterministico.
 * - **`read`** — l'albero strutturato della schermata, i nodi con i loro
 *   riquadri. Si **legge**, non si interpreta. Deterministico.
 * - **`guess`** — pixel, inferenza, clic sperato. ⛔ **È l'unico regime con una
 *   percentuale**, ed è quello in cui il migliore al mondo arriva al 43%.
 *
 * ⭐ La regola che ne segue, ed è la nostra: **una capacità non entra in `guess`
 * se esiste una strada in `ask` o in `read`.** Il 43% non è un soffitto da
 * avvicinare: è il segnale che si sta usando il metodo sbagliato.
 *
 * Provato su noi stessi la notte del 2026-08-08: il telecomando del Pad
 * sbagliava mira sei volte per sessione ricavando le coordinate a occhio; con
 * i cinque controlli sull'albero del DOM o colpisce, o dice esattamente perché
 * no. Stesso problema, sparito cambiando regime.
 */

/** Quanto costa a CHI USA TALOS, che è l'unica scala che conta per lui. */
export type TalosCapabilityTier =
    /** Niente. Concesso all'installazione, nessun dialogo, ogni telefono. */
    | 'free'
    /** Un dialogo, una volta. */
    | 'runtime'
    /** Un viaggio in una schermata di sistema, una volta. */
    | 'special'
    /** Shizuku: vivo finché lui è vivo, e muore a ogni riavvio. */
    | 'shell'

/** COME si arriva al risultato. Vedi la nota in testa: non è un dettaglio. */
export type TalosCapabilityRegime = 'ask' | 'read' | 'guess'

export interface TalosCapability {
    id: string
    tier: TalosCapabilityTier
    regime: TalosCapabilityRegime
    /**
     * Il permesso Android, quando ce n'è uno. `null` per le capacità che non ne
     * chiedono nessuno — e sono più di quante sembri: la torcia, le sveglie,
     * aprire un'app, la voce.
     */
    permission: string | null
    /**
     * La schermata dove si concede, per le `special`. È ciò che trasforma «non
     * posso» in «ti ci porto», ed è il motivo per cui questo campo esiste
     * separato dal permesso: il permesso lo capisce Android, la schermata la
     * capisce una persona.
     */
    settingsAction: string | null
}

/**
 * ⛔ L'inventario, e l'ordine NON è alfabetico: è per costo crescente.
 *
 * Chi legge questa lista dall'alto vede prima tutto ciò che funziona senza
 * chiedere niente. È la stessa regola della pagina dei privilegi — mostrare
 * prima ciò che si può, non l'elenco di ciò che manca.
 */
export const TALOS_DEVICE_CAPABILITIES: readonly TalosCapability[] = Object.freeze([
    // ── Gratis: nessun dialogo, nessun viaggio, ogni telefono.
    { id: 'vibrate', tier: 'free', regime: 'ask', permission: 'android.permission.VIBRATE', settingsAction: null },
    // ⭐ La torcia non chiede NIENTE da Android 6: `CameraManager.setTorchMode`
    // non è la fotocamera, e non ne vuole il permesso.
    { id: 'torch', tier: 'free', regime: 'ask', permission: null, settingsAction: null },
    { id: 'speak', tier: 'free', regime: 'ask', permission: null, settingsAction: null },
    /**
     * ⭐⭐ Il controllo media costa ZERO — ed era l'unica riga del censimento
     * (#34, 2026-08-09) dove Gemini vinceva **senza un cancello**.
     *
     * Per Wi-Fi, torcia o Non disturbare, Gemini pretende che l'app Google sia
     * l'assistente predefinito del telefono. Per i media no. Era l'unica casella
     * persa a parità di condizioni — e si chiude senza chiedere niente a
     * nessuno, perché `AudioManager.dispatchMediaKeyEvent` è la stessa porta da
     * cui entrano i telecomandi Bluetooth.
     *
     * Regime `ask` e non `guess`: si manda il tasto che il sistema aspetta, non
     * si cerca un pulsante «pausa» sullo schermo di un'app.
     */
    { id: 'media_control', tier: 'free', regime: 'ask', permission: null, settingsAction: null },
    { id: 'volume', tier: 'free', regime: 'ask', permission: 'android.permission.MODIFY_AUDIO_SETTINGS', settingsAction: null },
    { id: 'alarm', tier: 'free', regime: 'ask', permission: 'com.android.alarm.permission.SET_ALARM', settingsAction: null },
    { id: 'open_app', tier: 'free', regime: 'ask', permission: null, settingsAction: null },
    // ⭐ Il RIPIEGO universale: quando una capacità non c'è, si porta la persona
    // dove quella cosa si fa a mano. È ciò che rende ogni «non posso» ancora
    // utile, ed è il motivo per cui non manca mai.
    { id: 'open_settings_screen', tier: 'free', regime: 'ask', permission: null, settingsAction: null },
    { id: 'device_status', tier: 'free', regime: 'read', permission: null, settingsAction: null },
    { id: 'wallpaper', tier: 'free', regime: 'ask', permission: 'android.permission.SET_WALLPAPER', settingsAction: null },
    { id: 'keep_awake', tier: 'free', regime: 'ask', permission: 'android.permission.WAKE_LOCK', settingsAction: null },
    // Prepara e basta: la persona conferma nell'app che possiede l'azione.
    { id: 'compose_message', tier: 'free', regime: 'ask', permission: null, settingsAction: null },

    // ── Un dialogo.
    { id: 'location', tier: 'runtime', regime: 'read', permission: 'android.permission.ACCESS_FINE_LOCATION', settingsAction: null },
    { id: 'calendar', tier: 'runtime', regime: 'read', permission: 'android.permission.READ_CALENDAR', settingsAction: null },
    { id: 'contacts', tier: 'runtime', regime: 'read', permission: 'android.permission.READ_CONTACTS', settingsAction: null },

    // ── Un viaggio nelle impostazioni, e qui c'è metà di Gemini.
    {
        id: 'notifications_read',
        tier: 'special',
        regime: 'read',
        permission: null,
        settingsAction: 'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS',
    },
    {
        id: 'do_not_disturb',
        tier: 'special',
        regime: 'ask',
        permission: 'android.permission.ACCESS_NOTIFICATION_POLICY',
        settingsAction: 'android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS',
    },
    {
        id: 'system_settings',
        tier: 'special',
        regime: 'ask',
        permission: 'android.permission.WRITE_SETTINGS',
        settingsAction: 'android.settings.action.MANAGE_WRITE_SETTINGS',
    },
    {
        id: 'app_usage',
        tier: 'special',
        regime: 'read',
        permission: 'android.permission.PACKAGE_USAGE_STATS',
        settingsAction: 'android.settings.USAGE_ACCESS_SETTINGS',
    },

    // ── Shizuku o il ponte: vivi finché loro sono vivi.
    { id: 'wifi_toggle', tier: 'shell', regime: 'ask', permission: null, settingsAction: 'android.settings.WIFI_SETTINGS' },
    { id: 'bluetooth_toggle', tier: 'shell', regime: 'ask', permission: null, settingsAction: 'android.settings.BLUETOOTH_SETTINGS' },
    { id: 'mobile_data_toggle', tier: 'shell', regime: 'ask', permission: null, settingsAction: 'android.settings.DATA_ROAMING_SETTINGS' },
    { id: 'app_install', tier: 'shell', regime: 'ask', permission: null, settingsAction: null },
    { id: 'screen_touch', tier: 'shell', regime: 'read', permission: null, settingsAction: null },
    /**
     * ⛔⛔ LEGGERE LO SCHERMO NON È PIÙ UNA CAPACITÀ «SPECIALE».
     *
     * Fino al 2026-08-08 stava fra le `special`, con
     * `android.settings.ACCESSIBILITY_SETTINGS` come schermata: si dava per
     * scontato che l'albero della schermata lo desse un `AccessibilityService`.
     * Misurato sul Pad quella sera alle 23:33, **non è così**.
     *
     * Con la sola identità del ponte (`uid=2000(shell)`, compito #46):
     *
     * - `uiautomator dump` → l'albero. 18 testi dalle Impostazioni Wi-Fi (i nomi
     *   delle reti, «Connessa»), 166 dalla schermata di TALOS, con riquadri,
     *   `clickable` e `resource-id`. Costa **2.140 ms**: si legge quando serve,
     *   mai in continuo.
     * - `uiautomator events` → il flusso, che è la parte che sembrava
     *   irraggiungibile: 46 righe in 6 secondi, `TYPE_WINDOW_STATE_CHANGED`,
     *   `TYPE_VIEW_FOCUSED`, `TYPE_WINDOW_CONTENT_CHANGED`, col pacchetto e col
     *   testo. È lo **stesso** `onAccessibilityEvent`.
     *
     * ⇒ Non è un'imitazione: `uiautomator` gira su `UiAutomation`, che **è** un
     * client di accessibilità agganciato col permesso della shell. Stesso
     * albero, stessi eventi, altra porta.
     *
     * ⛔ E il dubbio che restava è stato chiuso misurandolo, non ragionandoci:
     * agganciando davvero un servizio di accessibilità (`settings put secure
     * enabled_accessibility_services`, che dalla shell **riesce** — verificato
     * con `Bound services:` in `dumpsys accessibility`) l'albero della stessa
     * schermata è risultato **identico**: 336 nodi contro 336, 166 testi contro
     * 166. Il servizio non aggiunge niente che il ponte non veda già.
     *
     * ⇒ Per questo `tier: 'shell'`. Non c'è una casella in **Accessibilità** da
     * spuntare, perché non c'è niente da concedere lì: o il ponte è collegato,
     * o questa capacità non c'è.
     *
     * ## ⛔ Ma una schermata C'È, e per due giorni qui stava scritto `null`
     *
     * Rilievo #10 dell'owner: «"controlla il mio telefono" **non porta alla
     * schermata giusta**». Riprodotto sul Pad il 2026-08-15 col ponte spento:
     * TALOS ha detto benissimo che il ponte era giù, ha offerto di aprire la
     * pagina — e ha aperto **«Informazioni app» di TALOS**, dove il ponte non
     * si riattiva. Non era un capriccio del modello: qui non c'era nessuna
     * azione, quindi ha preso la più vicina che conosceva.
     *
     * MISURATO nello stesso minuto, dalla shell:
     *
     * ```
     *   am start -a android.settings.APPLICATION_DEVELOPMENT_SETTINGS
     *   → com.android.settings.Settings$DevelopmentSettingsDashboardActivity
     * ```
     *
     * È la schermata delle **Opzioni sviluppatore**, dove sta il Debug wireless
     * — cioè l'unico posto da cui una persona riaggancia il ponte. ⇒ Il passo
     * mancante non era «una casella in Accessibilità»: era **questa riga**.
     */
    {
        id: 'screen_read',
        tier: 'shell',
        regime: 'read',
        permission: null,
        settingsAction: 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS',
    },
])

export function talosCapability(id: string): TalosCapability | null {
    return TALOS_DEVICE_CAPABILITIES.find((c) => c.id === id) ?? null
}

/**
 * ⛔⛔ LE SCHERMATE CHE SAPPIAMO APRIRE — e perché il modello non deve indovinarle.
 *
 * ## La misura, col telefono in mano il 2026-08-10
 *
 * ```
 *   am start -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS   → si apre
 *   am start -a android.settings.NOTIFICATION_LISTENER_SETTINGS          → unable to resolve Intent
 * ```
 *
 * Quattro caratteri di differenza — `ACTION_` — e la seconda riga arrivava a
 * TALOS come `ActivityNotFoundException`, cioè come `not-available-here`, cioè
 * come **«questo telefono non offre quella schermata»**. Falso: la schermata
 * c'è, l'abbiamo aperta. A sbagliare era la stringa, e la stringa la scriveva un
 * modello **a memoria**.
 *
 * ⇒ Un fatto sulle Impostazioni di Android non si fa ricordare a un modello: si
 * prende da qui, dove è già scritto per ogni capacità. È la stessa regola del
 * «niente scritto a mano» applicata al contrario — non lo scriviamo noi due
 * volte, e non lo indovina nessuno.
 */
export const TALOS_SCHERMATE_DI_SISTEMA: readonly string[] = Object.freeze(
    Array.from(
        new Set(
            TALOS_DEVICE_CAPABILITIES
                .map((c) => c.settingsAction)
                .filter((azione): azione is string => azione !== null),
        ),
    ),
)

/**
 * Quello che un modello scrive → l'azione VERA, o `null` se non la conosciamo.
 *
 * Accetta tre forme, in quest'ordine, perché sono le tre che un modello produce
 * davvero: l'azione esatta, l'`id` di una capacità (`notifications_read`), e il
 * nome della costante senza prefisso o con quello sbagliato — che è esattamente
 * l'inciampo misurato qui sopra.
 *
 * ⛔ `null` NON vuol dire «non esiste»: vuol dire «non è nel nostro elenco». Le
 * schermate di Android sono centinaia e questo catalogo copre le nostre; chi
 * chiama passa avanti la richiesta così com'è invece di rifiutarla — vedi
 * `device_open_settings`.
 */
export function talosSchermataDiSistema(richiesta: string): string | null {
    const pulita = richiesta.trim()
    if (pulita.length === 0) return null
    if (TALOS_SCHERMATE_DI_SISTEMA.includes(pulita)) return pulita
    const perId = talosCapability(pulita)?.settingsAction
    if (perId) return perId
    // La coda: `NOTIFICATION_LISTENER_SETTINGS`, `ACTION_NOTIFICATION_…`,
    // `settings.WIFI_SETTINGS` — tutte finiscono uguali a una che conosciamo.
    const coda = pulita.toUpperCase().replace(/^ANDROID\.SETTINGS\.(ACTION\.)?/, '')
    return TALOS_SCHERMATE_DI_SISTEMA.find((azione) => {
        const sua = azione.toUpperCase().replace(/^ANDROID\.SETTINGS\.(ACTION\.)?/, '')
        return sua === coda || sua === `ACTION_${coda}` || `ACTION_${sua}` === coda
    }) ?? null
}

/**
 * ⭐ IL METODO CHE VALE IL FILE: cosa rispondere quando NON si può.
 *
 * Mai «non posso». Sempre: che cosa manca, e dove si apre. Se non esiste
 * nemmeno una schermata dove aprirlo, resta l'ultimo ripiego — portare la
 * persona dove quella cosa si fa a mano — perché una risposta che non serve a
 * niente è la sola che non deve mai uscire.
 */
export interface TalosCapabilityGap {
    capability: string
    tier: TalosCapabilityTier
    /** La schermata da aprire, o `null` se questa capacità non si concede. */
    settingsAction: string | null
    /** La chiave della frase da mostrare. Mai un codice, mai un nome tecnico. */
    reasonKey: string
    /** Vero quando l'unica strada è che la persona lo faccia a mano. */
    manualOnly: boolean
}

export function talosCapabilityGap(
    id: string,
    /**
     * ⛔ Si chiamava `shizukuReady`. Dopo l'uscita di Shizuku il nome
     * descriveva una cosa che non esiste — e un nome cosi' e' un indizio falso
     * per chiunque legga il codice cercando di capire da cosa dipende.
     */
    stato: { shellReady: boolean; granted: ReadonlySet<string> },
): TalosCapabilityGap | null {
    const c = talosCapability(id)
    if (!c) return null

    // Gratis e già dichiarata nel manifest: non c'è nessun buco da colmare.
    if (c.tier === 'free') return null

    if (c.tier === 'shell') {
        if (stato.shellReady) return null
        return {
            capability: id,
            tier: 'shell',
            // ⛔ Non si manda alle impostazioni di sistema per una capacità che
            // vuole la shell: la schermata giusta è la NOSTRA, quella che
            // spiega l'accoppiamento. Mandare al Wi-Fi di sistema chi non ha
            // il ponte è dargli il posto giusto per la ragione sbagliata.
            settingsAction: null,
            reasonKey: 'deviceGap.needsBridge',
            manualOnly: false,
        }
    }

    if (c.permission && stato.granted.has(c.permission)) return null
    if (!c.permission && c.settingsAction && stato.granted.has(c.settingsAction)) return null

    return {
        capability: id,
        tier: c.tier,
        settingsAction: c.settingsAction,
        reasonKey: c.tier === 'special' ? 'deviceGap.needsSpecial' : 'deviceGap.needsRuntime',
        manualOnly: c.settingsAction === null && c.permission === null,
    }
}

/**
 * ⛔ La regola che ci tiene fuori dal 43%.
 *
 * Una capacità in regime `guess` è ammessa **solo** se non esiste nessuna
 * strada in `ask` o in `read` per lo stesso risultato. Non è una preferenza di
 * stile: è la differenza fra un'azione che riesce e una che riesce quasi.
 *
 * Oggi restituisce sempre `true` perché **nessuna** capacità dell'inventario è
 * in `guess` — ed è esattamente lo stato in cui va tenuto. Il giorno che
 * qualcuno ne aggiunge una, questo test glielo dirà.
 */
export function talosNoGuessing(): { clean: boolean; guessing: readonly string[] } {
    const guessing = TALOS_DEVICE_CAPABILITIES
        .filter((c) => c.regime === 'guess')
        .map((c) => c.id)
    return { clean: guessing.length === 0, guessing }
}
