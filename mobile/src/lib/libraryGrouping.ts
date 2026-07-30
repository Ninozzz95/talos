/**
 * Group Library items by the chat they came from.
 *
 * Extracted because links were rendered in a branch of their own and the
 * grouping lived in the file branch, so a saved link was never grouped — the
 * owner's report on 2026-07-30. What a file and a link genuinely share is this;
 * what they do not share is the tile, since a file tile carries multi-select,
 * an actions menu, a context-state pill and a generated badge that a link has
 * no meaning for. One template serving both would be made of `v-if`, which is
 * worse than two tiles rather than better.
 *
 * Insertion order is kept on purpose: the caller has already sorted, and a
 * second opinion about ordering here would silently override it.
 */
export interface TalosLibrarySection<T> {
    title: string
    items: T[]
}

export function groupTalosLibraryByChat<T>(
    items: readonly T[],
    chatOf: (item: T) => string | null,
    fallbackTitle: string,
): Array<TalosLibrarySection<T>> {
    const sections = new Map<string, T[]>()
    for (const item of items) {
        const title = chatOf(item) ?? fallbackTitle
        const bucket = sections.get(title)
        if (bucket) bucket.push(item)
        else sections.set(title, [item])
    }
    return [...sections.entries()].map(([title, grouped]) => ({ title, items: grouped }))
}
