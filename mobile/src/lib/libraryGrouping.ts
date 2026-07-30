/**
 * Group Library items by the chat they came from, date each heading, and order
 * the whole thing.
 *
 * Extracted because links were rendered in a branch of their own and the
 * grouping lived in the file branch, so a saved link was never grouped — the
 * owner's report on 2026-07-30. What a file and a link genuinely share is this;
 * what they do not share is the tile, since a file tile carries multi-select,
 * an actions menu, a context-state pill and a generated badge that a link has
 * no meaning for. One template serving both would be made of `v-if`, which is
 * worse than two tiles rather than better.
 *
 * The date and the ordering arrived together, and not by accident. The owner
 * asked for the date beside the chat name, then immediately asked for a sort by
 * date — so they answer to the same field. D-17 settled which date: the most
 * recent item in the section. It is the one that MOVES when the section changes,
 * and showing a creation date while sorting by "most recent" would put a heading
 * labelled March at the top and look broken.
 */
export type TalosLibrarySort = 'recent' | 'oldest' | 'name'

export interface TalosLibrarySection<T> {
    title: string
    items: T[]
    /** The most recent item's time; null when nothing in the section has one. */
    latestAt: string | null
}

export interface TalosLibraryGroupingOptions<T> {
    /** Omit and sections carry no date and keep arrival order, as before. */
    timeOf?: (item: T) => string | null
    sort?: TalosLibrarySort
}

/** Null for anything unparseable, so a bad string can never date a section. */
function instant(value: string | null | undefined): number | null {
    if (!value) return null
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * Undated last, in every direction.
 *
 * "Unknown" is not "newest" and it is not "oldest" either: it is the absence of
 * the thing being sorted by. Letting it win either end would put the least
 * informative row where the eye lands first.
 */
function byInstant(a: number | null, b: number | null, direction: 1 | -1): number {
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1
    return (a - b) * direction
}

export function groupTalosLibraryByChat<T>(
    items: readonly T[],
    chatOf: (item: T) => string | null,
    fallbackTitle: string,
    options: TalosLibraryGroupingOptions<T> = {},
): Array<TalosLibrarySection<T>> {
    const buckets = new Map<string, T[]>()
    for (const item of items) {
        const title = chatOf(item) ?? fallbackTitle
        const bucket = buckets.get(title)
        if (bucket) bucket.push(item)
        else buckets.set(title, [item])
    }

    const { timeOf, sort } = options
    const sections = [...buckets.entries()].map(([title, grouped]) => {
        let newest: number | null = null
        let latestAt: string | null = null
        for (const item of timeOf ? grouped : []) {
            const raw = timeOf!(item)
            const value = instant(raw)
            if (value === null) continue
            if (newest === null || value > newest) {
                newest = value
                latestAt = raw
            }
        }
        return { title, items: grouped, latestAt }
    })

    // No sort asked for means the caller has already ordered these, and a second
    // opinion here would silently override it.
    if (!sort) return sections

    const direction = sort === 'oldest' ? 1 : -1

    if (timeOf) {
        for (const section of sections) {
            section.items = [...section.items].sort(
                (a, b) => byInstant(instant(timeOf(a)), instant(timeOf(b)), direction),
            )
        }
    }

    if (sort === 'name') {
        // Sorting by name orders the HEADINGS; inside one, newest still comes
        // first — whoever picked A-Z was organising the chats, not asking for
        // their oldest file to be the first thing they see.
        // `localeCompare` rather than `<`, so accents and case land where a
        // reader expects instead of where their code points fall.
        sections.sort((a, b) => a.title.localeCompare(b.title, undefined, {
            sensitivity: 'base',
            numeric: true,
        }))
    } else {
        sections.sort((a, b) => byInstant(instant(a.latestAt), instant(b.latestAt), direction))
    }

    return sections
}
