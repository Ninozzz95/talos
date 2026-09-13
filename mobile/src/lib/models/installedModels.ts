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

/**
 * Un modello «ci sta» se i suoi pesi entrano nella memoria disponibile.
 *
 * Owner 2026-08-06: «assenza filtri ordinamento pesi modelli locali». L'ordine
 * c'era — recenti, nome, dimensione — e mancava il filtro, che è la domanda
 * vera nel momento in cui si guarda questa lista: *quali di questi posso
 * davvero usare adesso?* Un modello scaricato che non entra in memoria occupa
 * gigabyte e non serve a niente, ed è esattamente quello da cancellare.
 *
 * Il confronto è sui pesi soltanto, non sul contesto: la cache KV dipende da
 * quanti token si vogliono, e qui non c'è ancora una conversazione. È una
 * risposta prudente per difetto — «non ci sta» qui significa «non ci sta di
 * sicuro», mai il contrario.
 */
export function talosInstalledModelFits(
    model: TalosLocalModelFile,
    availableRamBytes: number | null | undefined,
): boolean {
    // Senza una misura non si esclude nessuno: un filtro che nasconde per
    // ignoranza è peggio di un filtro assente.
    if (typeof availableRamBytes !== 'number' || availableRamBytes <= 0) return true
    return model.bytes > 0 && model.bytes <= availableRamBytes
}

export function talosInstalledModelsView(
    models: readonly TalosLocalModelFile[],
    options: {
        readonly query?: string
        readonly sort?: TalosInstalledModelSort
        /** Quando c'è, tiene solo i modelli che entrano in questa memoria. */
        readonly fitsWithinBytes?: number | null
    } = {},
): TalosInstalledModelsView {
    const needle = (options.query ?? '').trim().toLowerCase()
    const sort = options.sort ?? TALOS_INSTALLED_MODEL_SORT_DEFAULT
    let kept = needle.length === 0 ? [...models] : models.filter((model) => matches(model, needle))
    if (typeof options.fitsWithinBytes === 'number') {
        kept = kept.filter((model) => talosInstalledModelFits(model, options.fitsWithinBytes))
    }
    kept.sort((left, right) => compare(sort, left, right))
    return { models: kept, total: models.length }
}

/**
 * Where a model sits, in the one word that differs between them.
 *
 * The row used to print the whole address in monospace, and on a phone that is
 * three wrapped lines of which the first fifty characters —
 * `/storage/emulated/0/Android/data/ai.talos.dev/files/models/` — are IDENTICAL
 * for every model in the list. Five models cost fifteen lines to say one thing
 * five times. What actually differs is the folder under `models/`: `imported`
 * for a file handed over from the phone, the repository's own folder for
 * anything downloaded.
 *
 * The exact address is not lost — it stays one tap away under ⋮ «Copia il
 * percorso», which is also the only form of it anybody can use, since a
 * forty-character string nobody can select is an address nobody can act on.
 *
 * An empty answer means "directly in the models root", and the caller shows
 * nothing rather than inventing a folder name.
 */
export function talosModelFolder(path: string): string {
    const parts = path.split('/').filter((part) => part.length > 0)
    // The filename is already the first line of the row.
    const folders = parts.slice(0, -1)
    const root = folders.lastIndexOf('models')
    if (root >= 0) return folders[root + 1] ?? ''
    // Not under a `models` root at all — an unexpected layout, so answer with
    // the immediate parent instead of pretending to know the scheme.
    return folders[folders.length - 1] ?? ''
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
