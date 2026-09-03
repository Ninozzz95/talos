export const TALOS_DYNAMIC_TOOL_PREFIX = 'dynamic:'
const SLUG = /^[a-z0-9][a-z0-9._-]{2,63}$/

export function isForgeSlug(value: unknown): value is string {
    return typeof value === 'string' && SLUG.test(value)
}

export function toDynamicToolName(id: string): string {
    if (!isForgeSlug(id)) throw new Error('TALOS_FORGE_ID_INVALID')
    return `${TALOS_DYNAMIC_TOOL_PREFIX}${id}`
}

export function dynamicToolIdFromName(name: string): string | null {
    if (!name.startsWith(TALOS_DYNAMIC_TOOL_PREFIX)) return null
    const id = name.slice(TALOS_DYNAMIC_TOOL_PREFIX.length)
    return isForgeSlug(id) ? id : null
}
