export const TALOS_MODEL_CATALOG_PAGE_SIZE = 40

export interface TalosProgressiveModelListState {
    readonly limit: number
}

export function talosInitialModelLimit(): number {
    return TALOS_MODEL_CATALOG_PAGE_SIZE
}

function talosFiniteNonNegativeInteger(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.floor(value))
}

export function talosNextModelLimit(current: number, total: number): number {
    const safeTotal = talosFiniteNonNegativeInteger(total)
    const safeCurrent = talosFiniteNonNegativeInteger(current)
    return Math.min(safeTotal, safeCurrent + TALOS_MODEL_CATALOG_PAGE_SIZE)
}

export function talosVisibleModelProfiles<T>(profiles: readonly T[], limit: number): readonly T[] {
    return profiles.slice(0, talosFiniteNonNegativeInteger(limit))
}
