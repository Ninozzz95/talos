import type { TalosLibrarySection } from './libraryGrouping'

export const TALOS_LIBRARY_PAGE_SIZE = 24

/** Apply one rendering budget after global filtering, sorting and grouping. */
export function pageTalosLibrarySections<T>(
    sections: readonly TalosLibrarySection<T>[],
    limit: number,
): TalosLibrarySection<T>[] {
    let remaining = Math.max(0, Math.floor(limit))
    const page: TalosLibrarySection<T>[] = []
    for (const section of sections) {
        if (remaining <= 0) break
        const items = section.items.slice(0, remaining)
        if (items.length) page.push({ ...section, items })
        remaining -= items.length
    }
    return page
}
