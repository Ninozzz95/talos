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
    notes_list: true,
    tasks_list: true,
    memory_search: true,
    time_now: true,
    web_search: true,
    web_read: true,
    document_create: true,
    generate_image: true,
    library_export: true,
    library_context_policy_update: false,
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
