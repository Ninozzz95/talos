import type { TalosLocalModelFile } from '@/services/localEngine'

/**
 * The models already on this phone, as a list a person can read.
 *
 * Owner 2026-08-03, minutes after a download finished: «ho appena scaricato un
 * modello ma non ho idea di dove sia … NON VA BENE». He was right twice over.
 * The app knew — `talosLocalInstalledModels()` has existed all along and the
 * research runner already reads it to rank judges — and it showed nobody. A
 * download that finishes and leaves no reachable trace is a download the user
 * does not know they have.
 *
 * The shape is the Library's, deliberately and not by taste: search, one
 * ordering chosen from a radiogroup, a row per file. The research station was
 * rebuilt into exactly that form on 2026-08-03, so there is a thing to copy and
 * nothing to design ([[ui-refactor-coherence-requests]] §2: «non si riprogetta:
 * si riusa»).
 */

export type TalosInstalledModelSort = 'recent' | 'name' | 'size'

export const TALOS_INSTALLED_MODEL_SORTS: readonly TalosInstalledModelSort[] =
    Object.freeze(['recent', 'name', 'size'])

/** Newest first — the answer to «which one did I just download». */
export const TALOS_INSTALLED_MODEL_SORT_DEFAULT: TalosInstalledModelSort = 'recent'

export interface TalosInstalledModelsView {
    readonly models: readonly TalosLocalModelFile[]
    /** How many exist in total, so «no matches» never reads as «none installed». */
    readonly total: number
}

/**
 * Matching is on the NAME, not the path.
 *
 * A path contains `/storage/emulated/0/Android/data/ai.talos/files/models/`,
 * which every model shares — so searching the whole string makes every query of
 * more than a few letters match everything or nothing, and both feel broken.
 */
function matches(model: TalosLocalModelFile, needle: string): boolean {
    return model.name.toLowerCase().includes(needle)
}

function compare(sort: TalosInstalledModelSort, left: TalosLocalModelFile, right: TalosLocalModelFile): number {
    if (sort === 'name') return left.name.localeCompare(right.name)
    if (sort === 'size') return right.bytes - left.bytes
    /**
     * A file whose date the system refused to give reads 0. It goes LAST rather
     * than first: `lastModified()` answers 0 instead of throwing, and letting
     * that sort as 1970 would be one thing, letting it sort as "newest" would
     * put the least-known file at the top of a list whose whole job is to
     * answer "which one is new".
     */
    if (left.modifiedAt !== right.modifiedAt) return right.modifiedAt - left.modifiedAt
    return left.name.localeCompare(right.name)
}

export function talosInstalledModelsView(
    models: readonly TalosLocalModelFile[],
    options: { readonly query?: string, readonly sort?: TalosInstalledModelSort } = {},
): TalosInstalledModelsView {
    const needle = (options.query ?? '').trim().toLowerCase()
    const sort = options.sort ?? TALOS_INSTALLED_MODEL_SORT_DEFAULT
    const kept = needle.length === 0 ? [...models] : models.filter((model) => matches(model, needle))
    kept.sort((left, right) => compare(sort, left, right))
    return { models: kept, total: models.length }
}

/** `3,2 GB` — the unit a person uses about a model, never bytes. */
export function talosModelSize(bytes: number, locale: string): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '—'
    const units = ['B', 'kB', 'MB', 'GB', 'TB']
    let value = bytes
    let unit = 0
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000
        unit += 1
    }
    const digits = unit >= 3 && value < 100 ? 1 : 0
    return `${value.toLocaleString(locale === 'it' ? 'it-IT' : 'en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })} ${units[unit]}`
}
