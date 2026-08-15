import type { TalosTranslate } from '@/i18n/contracts'

/**
 * What a running tool is called, in the user's words.
 *
 * Owner testing 2026-07-26 caught this the first time the web tools ran: the
 * chat showed four identical rows reading `web_read...`, the wire name, four
 * times over. Two failures in one — the label map only knew the original six
 * tools so the new ones fell through to the protocol name, and the activity
 * carried no detail, so there was no way to tell which page was being read.
 *
 * Both are fixed here, and a test asserts every tool the toolset can produce has
 * an entry — the guard has to fail when a tool is ADDED without a label, not
 * when someone remembers to look.
 */
export const TALOS_TOOL_LABELS: Record<string, string> = {
    library_list: 'Browsing your Library',
    library_search: 'Searching your Library',
    library_read: 'Reading a document',
    library_file_origin: 'Checking where a file came from',
    notes_list: 'Looking at your notes',
    notes_create: 'Writing a note',
    notes_update: 'Editing a note',
    notes_delete: 'Deleting a note',
    tasks_create: 'Adding a task',
    tasks_complete: 'Updating a task',
    tasks_update: 'Editing a task',
    tasks_delete: 'Deleting a task',
    tasks_list: 'Looking at your tasks',
    memory_write: 'Saving something to memory',
    memory_update: 'Correcting a memory',
    memory_delete: 'Forgetting something',
    library_rename: 'Renaming a Library file',
    library_delete: 'Deleting a Library file',
    memory_search: 'Checking what it remembers',
    time_now: 'Checking the time',
    calendar_read: 'Checking your calendar',
    calendar_write: 'Adding to your calendar',
    web_search: 'Searching the web',
    web_read: 'Reading a web page',
    document_create: 'Making a document',
    generate_image: 'Generating an image',
    library_export: 'Saving a file to your device',
    library_context_policy_update: 'Changing Library context policy',
    research_list: 'Looking at your researches',
    research_start: 'Starting a deep research',
    research_read: 'Reading a research report',
    research_rename: 'Renaming a research',
    research_pause: 'Pausing a research',
    research_resume: 'Resuming a research',
    research_cancel: 'Stopping a research',
    research_delete: 'Deleting a research',
    device_status: 'Checking the phone',
    device_location: 'Checking where you are',
    device_torch: 'Using the torch',
    device_media: 'Controlling playback',
    device_airplane: 'Switching airplane mode',
    device_power_saving: 'Switching battery saver',
    device_vibrate: 'Buzzing the phone',
    device_volume: 'Changing the volume',
    device_alarm: 'Setting an alarm',
    device_open_app: 'Opening an app',
    device_open_settings: 'Opening a settings screen',
    device_compose: 'Preparing a message',
    device_speak: 'Speaking out loud',
    device_wallpaper: 'Setting the wallpaper',
    device_keep_awake: 'Holding the screen awake',
    device_unread_mail: 'Counting your unread email',
    device_screenshot: 'Taking a screenshot',
    device_wifi: 'Switching Wi-Fi',
    device_bluetooth: 'Switching Bluetooth',
    device_do_not_disturb: 'Setting Do Not Disturb',
    device_system_setting: 'Changing a phone setting',
    device_app_usage: 'Looking at phone usage',
    device_list_apps: 'Looking at your apps',
    device_notifications_list: 'Reading your notifications',
    device_notification_reply: 'Replying to a notification',
    device_notification_dismiss: 'Dismissing a notification',
    device_screen_drive: 'Using an app for you',
    app_azione: 'Doing it in another app',
    invia_file: 'Sending a file',
    local_models_search: 'Looking for models this phone can run',
    local_model_inspect: 'Checking whether a model fits this phone',
    local_model_download: 'Downloading a model to this phone',
    local_models_status: 'Checking on a model download',
    /*
     * ⛔⛔ `tool_details` NON è una capacità — ed è per questo che è arrivato
     * a schermo senza volto.
     *
     * Owner 2026-08-15, guardando una risposta: «nella riga si legge
     * tool_details». È esattamente il difetto del 26 luglio che questo file
     * dice di aver curato — quattro righe che leggevano `web_read` — tornato
     * da una porta che nessuna guardia sorvegliava.
     *
     * ⇒ Il test di copertura legge `TALOS_AGENT_TOOL_IDS`, e `tool_details`
     * lì dentro non c'è **per scelta**: è l'impianto dell'apertura a gradi,
     * non qualcosa che la persona concede o nega. Quindi non aveva nessun
     * elenco che lo obbligasse a un'etichetta — pur essendo, sullo schermo,
     * una riga come tutte le altre.
     *
     * ⛔ E la cura NON è nasconderlo. L'apertura a gradi costa ~1,4 s la
     * prima volta che un attrezzo serve: senza riga, quel secondo e mezzo è
     * schermo fermo e sembra bloccato. Una riga che dice il vero è meglio di
     * un silenzio — è la stessa ragione per cui un attrezzo sconosciuto
     * ripiega sul suo nome invece che sul nulla.
     */
    tool_details: 'Looking up how to do that',
}

export const TALOS_TOOL_LABEL_KEYS: Record<string, string> = {
    library_list: 'toolActivity.libraryList',
    library_search: 'toolActivity.librarySearch',
    library_read: 'toolActivity.libraryRead',
    library_file_origin: 'toolActivity.libraryFileOrigin',
    notes_list: 'toolActivity.notesList',
    notes_create: 'toolActivity.notesCreate',
    notes_update: 'toolActivity.notesUpdate',
    notes_delete: 'toolActivity.notesDelete',
    tasks_create: 'toolActivity.tasksCreate',
    tasks_complete: 'toolActivity.tasksComplete',
    tasks_update: 'toolActivity.tasksUpdate',
    tasks_delete: 'toolActivity.tasksDelete',
    tasks_list: 'toolActivity.tasksList',
    memory_write: 'toolActivity.memoryWrite',
    memory_update: 'toolActivity.memoryUpdate',
    memory_delete: 'toolActivity.memoryDelete',
    library_rename: 'toolActivity.libraryRename',
    library_delete: 'toolActivity.libraryDelete',
    memory_search: 'toolActivity.memorySearch',
    time_now: 'toolActivity.timeNow',
    calendar_read: 'toolActivity.calendarRead',
    calendar_write: 'toolActivity.calendarWrite',
    web_search: 'toolActivity.webSearch',
    web_read: 'toolActivity.webRead',
    document_create: 'toolActivity.documentCreate',
    generate_image: 'toolActivity.generateImage',
    library_export: 'toolActivity.libraryExport',
    library_context_policy_update: 'toolActivity.libraryContextPolicyUpdate',
    research_list: 'toolActivity.researchList',
    research_start: 'toolActivity.researchStart',
    research_read: 'toolActivity.researchRead',
    research_rename: 'toolActivity.researchRename',
    research_pause: 'toolActivity.researchPause',
    research_resume: 'toolActivity.researchResume',
    research_cancel: 'toolActivity.researchCancel',
    research_delete: 'toolActivity.researchDelete',
    device_status: 'toolActivity.deviceStatus',
    device_location: 'toolActivity.deviceLocation',
    device_torch: 'toolActivity.deviceTorch',
    device_media: 'toolActivity.deviceMedia',
    device_airplane: 'toolActivity.deviceAirplane',
    device_power_saving: 'toolActivity.devicePowerSaving',
    device_vibrate: 'toolActivity.deviceVibrate',
    device_volume: 'toolActivity.deviceVolume',
    device_alarm: 'toolActivity.deviceAlarm',
    device_open_app: 'toolActivity.deviceOpenApp',
    device_open_settings: 'toolActivity.deviceOpenSettings',
    device_compose: 'toolActivity.deviceCompose',
    device_speak: 'toolActivity.deviceSpeak',
    device_wallpaper: 'toolActivity.deviceWallpaper',
    device_keep_awake: 'toolActivity.deviceKeepAwake',
    device_unread_mail: 'toolActivity.deviceUnreadMail',
    device_screenshot: 'toolActivity.deviceScreenshot',
    device_wifi: 'toolActivity.deviceWifi',
    device_bluetooth: 'toolActivity.deviceBluetooth',
    device_do_not_disturb: 'toolActivity.deviceDnd',
    device_system_setting: 'toolActivity.deviceSystemSetting',
    device_app_usage: 'toolActivity.deviceAppUsage',
    device_list_apps: 'toolActivity.deviceListApps',
    device_notifications_list: 'toolActivity.deviceNotificationsList',
    device_notification_reply: 'toolActivity.deviceNotificationReply',
    device_notification_dismiss: 'toolActivity.deviceNotificationDismiss',
    device_screen_drive: 'toolActivity.deviceScreenDrive',
    app_azione: 'toolActivity.appAzione',
    invia_file: 'toolActivity.inviaFile',
    local_models_search: 'toolActivity.localModelsSearch',
    local_model_inspect: 'toolActivity.localModelInspect',
    local_model_download: 'toolActivity.localModelDownload',
    local_models_status: 'toolActivity.localModelsStatus',
    tool_details: 'toolActivity.toolDetails',
}

export interface TalosToolConsentCopy {
    title: string
    description: string
}

/**
 * ⛔⛔ LE CHIAVI SI DERIVANO, NON SI SCRIVONO A MANO.
 *
 * ## Cosa c'era qui, e perché non c'è più
 *
 * Una tabella di 58 righe che diceva `library_list` →
 * `toolConsent.libraryList.title`. Misurate tutte e 58 il 2026-08-08: **57
 * seguivano la stessa regola** e una sola deviava (`device_do_not_disturb`
 * puntava a `deviceDnd`), per una svista di chi l'aveva scritta. Allineata
 * quella, la tabella non diceva più niente che il nome del tool non dicesse
 * già — ed è la definizione di un fatto scritto a mano.
 *
 * Toglierla vale due cose:
 *
 * 1. **Un tool nuovo non può più dimenticare la sua riga.** Era il difetto che
 *    la guardia `TOOL-CONSENT-I18N-01` inseguiva; adesso non esiste il posto
 *    dove dimenticarsela.
 * 2. **Esce dal primo blocco.** Erano 212 righe caricate all'avvio per una
 *    schermata che compare solo quando qualcuno chiede un permesso.
 *
 * ## ⛔ E il rischio si sposta, quindi si sposta anche la guardia
 *
 * Prima, un tool senza riga finiva nel ripiego e vedeva una frase generica.
 * Adesso la chiave esiste **sempre** — e se il dizionario non la conosce, a
 * schermo comparirebbe `toolConsent.fooBar.title`, che è **peggio** del nome
 * interno: quello almeno era una parola.
 *
 * Per questo `talosToolConsentCopy` non si fida della chiave: controlla che la
 * traduzione sia diversa dalla chiave. È lo stesso criterio che usava il test,
 * portato dentro il codice — dove protegge anche a runtime, e non solo quando
 * qualcuno ricorda di lanciare i test.
 */
export function talosToolConsentKeys(name: string): TalosToolConsentCopy {
    const camel = name
        .split('_')
        .map((parte, indice) => (indice === 0
            ? parte
            : parte.charAt(0).toUpperCase() + parte.slice(1)))
        .join('')
    return {
        title: `toolConsent.${camel}.title`,
        description: `toolConsent.${camel}.description`,
    }
}

/**
 * Provider schemas stay stable and English; only the human authorization
 * surface receives localized presentation copy. Custom prompts, such as the
 * generated-file save marker, arrive localized already and keep their copy.
 */
export function talosToolConsentCopy(
    tool: { name?: string; title: string; description: string },
    translate: TalosTranslate,
): TalosToolConsentCopy {
    const keys = tool.name ? talosToolConsentKeys(tool.name) : undefined
    /*
     * ⛔ Una chiave che torna se stessa NON è una traduzione: è una frase che
     * manca nel dizionario. Il traduttore, quando non trova, restituisce la
     * chiave — e mostrarla vorrebbe dire scrivere `toolConsent.fooBar.title`
     * sulla schermata dove una persona decide se fidarsi.
     */
    const titolo = keys ? translate(keys.title) : ''
    const tradotto = keys !== undefined && titolo !== keys.title && titolo.trim() !== ''
    if (!tradotto) {
        /*
         * ⛔ UN NOME INTERNO NON COMPARE MAI IN UNA RICHIESTA DI PERMESSO.
         *
         * Visto sul Pad il 2026-08-08 alle 06:22: la richiesta annunciava
         * `device_status` nudo. Il chiamante in `chatController` passa
         * `title: pending.tool`, cioe' l'identificativo, e questo ripiego lo
         * rimandava indietro tale e quale.
         *
         * La guardia in `ogniToolHaUnNomeUmano` rende improbabile arrivarci —
         * ma «improbabile» non basta sulla schermata dove una persona decide
         * se fidarsi. Chi legge `device_status` non sa cosa sta autorizzando, e
         * di fronte a una parola che non capisce fa una delle due cose
         * sbagliate: nega tutto, o accetta tutto.
         *
         * Quindi: se il titolo che ci arriva ha la FORMA di un identificativo
         * interno, si dice una cosa vera e generica invece di esibirlo. E lo si
         * grida nel registro, perche' è un difetto nostro da correggere, non
         * una condizione normale.
         */
        const sembraUnIdentificativo = /^[a-z0-9]+(_[a-z0-9]+)+$/.test(tool.title)
        if (sembraUnIdentificativo) {
            console.error(
                `[talos] nessuna etichetta umana per lo strumento "${tool.title}": `
                + 'la richiesta di consenso mostrerebbe il nome interno',
            )
            return {
                title: translate('toolConsent.unknownTool'),
                description: tool.description,
            }
        }
        return { title: tool.title, description: tool.description }
    }
    const descrizione = translate(keys.description)
    return {
        title: titolo,
        // Anche la descrizione può mancare da sola: allora si tiene quella che
        // il tool porta con sé, che è in inglese ma è una frase vera.
        description: descrizione !== keys.description && descrizione.trim() !== ''
            ? descrizione
            : tool.description,
    }
}

/**
 * Which icon a running tool shows.
 *
 * Owner 2026-07-26: creating a document displayed the WEB SEARCH globe, because
 * the streaming view hardcoded one icon for every tool row. Same failure as the
 * labels a day earlier — a new tool inherits whatever the last one happened to
 * use — so it gets the same guard: names live here beside the labels, and a test
 * fails when a tool arrives without one.
 *
 * Names, not components: this module is pure, and pulling icon components into
 * it would drag the view layer into every place that reads a tool label.
 */
export type TalosToolIconName =
    | 'library'
    | 'note'
    | 'task'
    | 'memory'
    | 'clock'
    | 'web'
    | 'research'
    | 'phone'
    | 'place'
    | 'torch'
    | 'volume'
    | 'audio'
    | 'voice'
    | 'document'
    | 'image'
    | 'mail'
    | 'download'
    | 'tool'

export const TALOS_TOOL_ICONS: Record<string, TalosToolIconName> = {
    library_list: 'library',
    library_search: 'library',
    library_read: 'library',
    library_file_origin: 'library',
    notes_list: 'note',
    notes_create: 'note',
    notes_update: 'note',
    notes_delete: 'note',
    tasks_create: 'task',
    tasks_complete: 'task',
    tasks_update: 'task',
    tasks_delete: 'task',
    tasks_list: 'task',
    memory_write: 'memory',
    memory_update: 'memory',
    memory_delete: 'memory',
    library_rename: 'library',
    library_delete: 'library',
    memory_search: 'memory',
    time_now: 'clock',
    calendar_read: 'clock',
    calendar_write: 'clock',
    web_search: 'web',
    web_read: 'web',
    document_create: 'document',
    generate_image: 'image',
    library_export: 'download',
    library_context_policy_update: 'library',
    // ⛔ Una ricerca approfondita raggiunge il web, ma NON è una ricerca web:
    // dura minuti, si mette in pausa, e finisce in un rapporto. Darle il globo
    // direbbe una cosa falsa su cosa sta succedendo — lo stesso difetto del
    // documento che mostrava il globo, al contrario.
    research_list: 'research',
    research_start: 'research',
    research_read: 'research',
    research_rename: 'research',
    research_pause: 'research',
    research_resume: 'research',
    research_cancel: 'research',
    research_delete: 'research',
    // Searching and inspecting reach the network; downloading is a download.
    /*
     * ⛔ Il telefono ha un segno SUO. Dargli quello dei modelli o del web
     * direbbe una cosa falsa su cosa sta succedendo — e' il difetto del
     * documento col globo, di nuovo.
     */
    device_status: 'phone',
    // ⛔ Lo spillo e non il telefono: leggere DOVE SEI non e' leggere come sta
    // il telefono, e due attrezzi con lo stesso disegno raccontano la stessa
    // cosa mentre ne stanno facendo due. E' il dato piu' personale che questo
    // elenco mostri: merita di essere riconoscibile a colpo d'occhio.
    device_location: 'place',
    device_torch: 'torch',
    device_vibrate: 'phone',
    // ⛔ NON `volume`: alzare il volume e mettere in pausa sono due cose diverse,
    // e due strumenti che mostrano lo stesso segno raccontano la stessa cosa
    // mentre ne stanno facendo due. Il segno del suono che SUONA e' l'audio.
    device_media: 'audio',
    device_airplane: 'phone',
    device_power_saving: 'phone',
    device_volume: 'volume',
    device_alarm: 'clock',
    device_open_app: 'phone',
    device_open_settings: 'phone',
    device_compose: 'phone',
    device_speak: 'voice',
    device_wallpaper: 'image',
    device_keep_awake: 'phone',
    device_unread_mail: 'mail',
    device_screenshot: 'image',
    device_wifi: 'web',
    device_bluetooth: 'phone',
    device_do_not_disturb: 'phone',
    device_system_setting: 'phone',
    device_app_usage: 'clock',
    device_list_apps: 'phone',
    device_notifications_list: 'phone',
    device_notification_reply: 'phone',
    device_notification_dismiss: 'phone',
    device_screen_drive: 'phone',
    app_azione: 'phone',
    invia_file: 'phone',
    local_models_search: 'web',
    local_model_inspect: 'web',
    local_model_download: 'download',
    local_models_status: 'tool',
    tool_details: 'tool',
}

/** An unknown tool gets the generic mark rather than another tool's. */
export function talosToolIconName(name: string): TalosToolIconName {
    return TALOS_TOOL_ICONS[name] ?? 'tool'
}

export interface TalosToolActivity {
    name: string
    /** Which page, which query — the part that makes four rows distinguishable. */
    detail: string | null
}

/**
 * The line shown to the user. An unknown tool falls back to its own name rather
 * than to nothing: a mystery row is worse than a technical one.
 */
export function talosToolActivityLabel(
    activity: TalosToolActivity,
    localizedLabel?: string,
): string {
    const label = localizedLabel ?? TALOS_TOOL_LABELS[activity.name] ?? activity.name
    return activity.detail ? `${label}: ${activity.detail}` : label
}

/**
 * A short, human detail pulled from the call's arguments.
 *
 * Deliberately narrow: a hostname or a query, never the whole argument object.
 * This ends up on screen while the model is working, and a wall of JSON there is
 * noise — and could leak more of a document's content than the row intends.
 */
export function talosToolActivityDetail(name: string, argumentsJson: string): string | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(argumentsJson || '{}')
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    const input = parsed as Record<string, unknown>

    if (name === 'library_export') {
        const reference = input.reference
        if (typeof reference !== 'string' || reference.trim() === '') return null
        const value = reference.trim()
        return value.length > 48 ? `${value.slice(0, 48)}…` : value
    }
    if (name === 'library_context_policy_update') {
        const action = typeof input.action === 'string' ? input.action : null
        const scope = typeof input.scope === 'string' ? input.scope : null
        return action && scope ? `${scope}: ${action}`.slice(0, 48) : null
    }
    if (name === 'web_read' || name === 'library_read') {
        const value = input.url ?? input.id
        if (typeof value !== 'string' || value === '') return null
        try {
            // The site is what a person recognises; the full url is noise.
            return new URL(value).hostname.replace(/^www\./, '')
        } catch {
            return value.slice(0, 40)
        }
    }
    const query = input.query
    if (typeof query === 'string' && query.trim() !== '') {
        return query.length > 48 ? `${query.slice(0, 48)}…` : query
    }
    return null
}
