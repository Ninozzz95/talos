/**
 * Lightweight boot-safe defaults for the executable registry.
 *
 * Settings cannot import the real factories: they carry Zod and provider
 * adapters into the initial bundle. Every key has an explicit upgrade default;
 * the Settings-only catalog adds display/action metadata off the boot path.
 */
// `dynamic/ids.ts` è a ZERO dipendenze — non trascina Zod/i factory veri, e
// non rompe il vincolo "leggero" di questo file. Vedi `isTalosAuthorizableToolName`.
import { dynamicToolIdFromName } from '@/lib/tools/dynamic/ids'

export const TALOS_DEFAULT_AGENT_TOOL_ENABLED = Object.freeze({
    library_list: true,
    library_search: true,
    library_read: true,
    library_file_origin: true,
    library_rename: true,
    library_delete: true,
    notes_list: true,
    notes_create: true,
    notes_update: true,
    notes_delete: true,
    tasks_create: true,
    tasks_complete: true,
    tasks_update: true,
    tasks_delete: true,
    tasks_list: true,
    memory_search: true,
    time_now: true,
    /*
     * ⭐ Acceso di serie come `time_now`: è una LETTURA di cose che la persona
     * ha creato lei, e senza di essa la domanda «che impegni ho domani» non ha
     * risposta. Il permesso di sistema resta la porta vera.
     */
    calendar_read: true,
    /*
     * ⭐ Acceso di serie, ma il permesso resta la scheda: il modello lo VEDE e
     * lo può proporre, e chi decide se l'appuntamento nasce davvero è la
     * conferma. Spegnerlo di serie nasconderebbe la funzione a chi non sa di
     * doverla cercare.
     */
    calendar_write: true,
    web_search: true,
    web_read: true,
    document_create: true,
    generate_image: true,
    // Owner 2026-08-27: artefatti HTML interattivi in chat — isolati in
    // TalosArtifactActivity, mai il ponte Capacitor, mai la rete.
    artifact_create: true,
    library_export: true,
    library_context_policy_update: false,
    // The second door onto the on-device models. Searching and inspecting reach
    // the Hub, so the outbound policy already decides whether they are offered
    // at all; downloading asks separately, every single time.
    local_models_search: true,
    local_model_inspect: true,
    local_model_download: true,
    local_models_status: true,
    /**
     * «Che ricerche ho fatto?» — owner 2026-08-03, per chiudere il blocco
     * Ricerca. Acceso di serie come `library_list`: e' una lettura di cose che
     * l'utente ha creato lui, e senza di essa la domanda non ha risposta.
     */
    research_list: true,
    research_start: true,
    research_read: true,
    research_rename: true,
    research_pause: true,
    research_resume: true,
    research_cancel: true,
    research_delete: true,

    /**
     * Acceso di serie, ma il permesso e' `ask`: il modello lo VEDE e lo puo'
     * proporre, e chi decide se scrivere davvero e' il cartellino. Spegnerlo
     * di serie avrebbe nascosto la funzione a chi non sa di doverla cercare.
     */
    memory_write: true,
    memory_update: true,
    memory_delete: true,
    /*
     * Accesi di serie, ma il permesso resta il cartellino: il modello li VEDE e
     * li puo' proporre, e chi decide se succede davvero e' la scheda. Spegnerli
     * di serie avrebbe nascosto la funzione a chi non sa di doverla cercare.
     */
    device_status: true,
    /*
     * ⛔ ACCESO di suo, come gli altri `read` del telefono — ma acceso NON vuol
     * dire che legge: la prima chiamata fa comparire il dialogo di sistema, e
     * finché la persona non concede il tool risponde `negato` e lo dice. Lo
     * spegnimento qui serve a chi non vuole nemmeno la domanda.
     */
    device_location: true,
    device_torch: true,
    device_media: true,
    device_airplane: true,
    device_power_saving: true,
    device_vibrate: true,
    device_volume: true,
    device_alarm: true,
    device_open_app: true,
    device_screenshot: true,
    device_open_settings: true,
    device_compose: true,
    device_speak: true,
    device_wallpaper: true,
    device_keep_awake: true,
    device_unread_mail: true,
    device_wifi: true,
    device_bluetooth: true,
    device_do_not_disturb: true,
    device_system_setting: true,
    device_app_usage: true,
    device_list_apps: true,
    device_notifications_list: true,
    device_notification_reply: true,
    device_notification_dismiss: true,
    /*
     * ⛔ SPENTO di suo, unico nel catalogo del telefono.
     *
     * Ogni altro strumento fa UNA cosa che la persona ha chiesto. Questo prende
     * in mano il telefono e ne fa venti dentro app di altri: acceso senza che
     * nessuno l'abbia deciso sarebbe una capacità arrivata di nascosto con un
     * aggiornamento. Si accende dalle impostazioni, una volta, guardandolo.
     */
    device_screen_drive: false,
    /*
     * ⭐ ACCESO di suo, al contrario del pilota qui sopra — e la differenza è
     * sostanziale, non di grado.
     *
     * Il pilota prende in mano il telefono e fa venti cose dentro app di altri.
     * Questo apre UNA schermata con i dati già scritti, e ogni capacità che
     * manda qualcosa a qualcuno passa comunque dalla scheda di conferma. È la
     * stessa forma di «prepara una chiamata, la persona preme»: la decisione
     * finale resta dov'era.
     *
     * ⇒ Spegnerlo di suo significherebbe consegnare un assistente che, davanti
     * a «manda un messaggio a Mario», sceglie la strada lunga — 20 passi e 27,8
     * secondi MISURATI, contro i ~20 secondi che Gemini impiega con l'intent.
     */
    app_azione: true,
    invia_file: true,
    /**
     * ⛔⛔⛔ Owner 2026-08-27 — «un utente finale... come fa a creare un tool
     * da solo?». Il tool che CREA tool (`forgeCreateTool.ts`): il modello
     * propone un manifest, la persona lo rivede sulla STESSA scheda di
     * consenso di ogni altro tool, resta installato-ma-disabilitato finché
     * non lo accende dalla Stazione — zero superficie nuova, vedi il
     * commento in testa a quel file.
     */
    tool_create: true,
})

export type TalosAgentToolId = keyof typeof TALOS_DEFAULT_AGENT_TOOL_ENABLED
export type TalosAgentToolEnabled = { [Id in TalosAgentToolId]: boolean }
export const TALOS_AGENT_TOOL_IDS = Object.freeze(
    Object.keys(TALOS_DEFAULT_AGENT_TOOL_ENABLED) as TalosAgentToolId[],
)

export function isTalosAgentToolId(value: unknown): value is TalosAgentToolId {
    return typeof value === 'string'
        && Object.prototype.hasOwnProperty.call(TALOS_DEFAULT_AGENT_TOOL_ENABLED, value)
}

/**
 * ⛔⛔⛔ Owner 2026-08-27 — chiude il gap onestamente lasciato aperto in
 * Fase 8: "Always allow" persistente su un tool forgiato falliva SEMPRE
 * (`TALOS_TOOL_AUTHORIZATION_TOOL_INVALID`), perché il libro dei consensi
 * permanenti (`toolAuthorizations.ts`) usa `TalosAgentToolId` come chiave —
 * e un nome `dynamic:*` non può mai essere un membro di
 * quell'unione, per costruzione (deriva da un catalogo statico compilato).
 *
 * ⇒ Una guardia SEPARATA, non un allargamento di `isTalosAgentToolId`:
 * ricerca 2026 (Tyk, "do not use an enum for open sets") — i built-in
 * restano un insieme chiuso e statico (il pannello Impostazioni ne dipende,
 * un interruttore per riga), i tool forgiati sono un insieme aperto e
 * dinamico. Questa e' l'unione delle due, dove il resto del sistema dei
 * consensi chiede solo "è un nome autorizzabile?", non "è un built-in?".
 *
 * `dynamic/ids.ts` non ha dipendenze (zero import): sicuro da importare qui
 * anche se questo file resta apposta leggero per il pannello Impostazioni.
 */
export function isTalosAuthorizableToolName(value: unknown): value is string {
    return isTalosAgentToolId(value) || dynamicToolIdFromName(value as string) !== null
}

export function parseTalosAgentToolEnabled(value: unknown): TalosAgentToolEnabled {
    const record = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
    return Object.fromEntries(TALOS_AGENT_TOOL_IDS.map((tool) => [
        tool,
        typeof record[tool] === 'boolean'
            ? record[tool]
            : TALOS_DEFAULT_AGENT_TOOL_ENABLED[tool],
    ])) as TalosAgentToolEnabled
}

/** Unknown tool IDs are denied; malformed known values return their explicit default. */
export function isTalosAgentToolEnabled(
    name: string,
    enabled: Partial<Record<string, unknown>> | undefined,
): boolean {
    if (!isTalosAgentToolId(name)) return false
    const value = enabled?.[name]
    return typeof value === 'boolean'
        ? value
        : TALOS_DEFAULT_AGENT_TOOL_ENABLED[name]
}
