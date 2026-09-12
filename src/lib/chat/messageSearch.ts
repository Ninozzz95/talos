import { normalizeTalosLibrarySearchText } from '@/lib/librarySearchText'

export function talosMessageSearchLimit(limit?: number): number {
    if (limit === undefined) return Infinity
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('TALOS_SEARCH_LIMIT_INVALID')
    return limit
}

/** A short piece of the original message, including the match even far into a long reply. */
export function talosMessageSearchExcerpt(content: string, term: string): string {
    const needle = normalizeTalosLibrarySearchText(term)
    const index = normalizeTalosLibrarySearchText(content).indexOf(needle)
    // Normalization can change offsets (ligatures, combining marks, whitespace).
    // Locate the original boundaries by normalized prefix length; never display a search key.
    function originalOffset(length: number): number {
        let low = 0
        let high = content.length
        while (low < high) {
            const middle = Math.floor((low + high) / 2)
            if (normalizeTalosLibrarySearchText(content.slice(0, middle)).length < length) low = middle + 1
            else high = middle
        }
        return low
    }
    const start = Math.max(0, originalOffset(Math.max(0, index)) - 45)
    const end = Math.min(content.length, Math.max(start + 180, originalOffset(index + needle.length) + 45))
    return `${start ? '…' : ''}${content.slice(start, end).trim()}${end < content.length ? '…' : ''}`
}
