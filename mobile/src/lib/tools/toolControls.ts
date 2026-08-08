/**
 * Lightweight boot-safe defaults for the executable registry.
 *
 * Settings cannot import the real factories: they carry Zod and provider
 * adapters into the initial bundle. Every key has an explicit upgrade default;
 * the Settings-only catalog adds display/action metadata off the boot path.
 */
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
    web_search: true,
    web_read: true,
    document_create: true,
    generate_image: true,
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
    device_torch: true,
    device_vibrate: true,
    device_volume: true,
    device_alarm: true,
    device_open_app: true,
    device_open_settings: true,
    device_compose: true,
    device_speak: true,
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
