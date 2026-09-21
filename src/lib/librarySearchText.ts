/**
 * One Unicode search contract for every TALOS Library surface.
 *
 * This produces comparison keys only. The original filename/body remains the
 * source of truth for display, storage, hashing, export and evidence.
 */
export interface TalosLibrarySearchField {
    text: string | null | undefined
    /** Filename uses 3; ordinary text defaults to 1. */
    weight?: number
}

const EMOJI_PRESENTATION_SELECTORS = /[\ufe0e\ufe0f]/gu
const UNICODE_WHITESPACE = /\s+/gu

export function normalizeTalosLibrarySearchText(value: string): string {
    return value
        .normalize('NFKC')
        .toLowerCase()
        // Text/default emoji presentation changes the glyph, not which
        // Library item a user means when searching for the symbol.
        .replace(EMOJI_PRESENTATION_SELECTORS, '')
        .replace(UNICODE_WHITESPACE, ' ')
        .trim()
}

/**
 * Whitespace-delimited atoms deliberately preserve every other category.
 *
 * That means CJK substrings, C++, currency, emoji and ZWJ sequences never
 * disappear into an L/N-only tokenizer, and results do not depend on the
 * platform's locale/dictionary word breaker.
 */
export function talosLibrarySearchTerms(query: string): string[] {
    const normalized = normalizeTalosLibrarySearchText(query)
    if (normalized === '') return []
    return [...new Set(normalized.split(' '))]
}

function countOccurrences(haystack: string, needle: string): number {
    if (needle === '') return 0
    let count = 0
    let index = haystack.indexOf(needle)
    while (index !== -1) {
        count += 1
        index = haystack.indexOf(needle, index + needle.length)
    }
    return count
}

/**
 * Existing BM25-lite semantics: weighted term frequency with saturation.
 */
export function scoreTalosLibrarySearchFields(
    query: string,
    fields: readonly TalosLibrarySearchField[],
): number {
    const terms = talosLibrarySearchTerms(query)
    if (terms.length === 0) return 0
    const normalizedFields = fields.map((field) => ({
        text: normalizeTalosLibrarySearchText(field.text ?? ''),
        weight: field.weight === undefined ? 1 : Math.max(0, field.weight),
    }))

    let score = 0
    for (const term of terms) {
        const tf = normalizedFields.reduce(
            (total, field) => total + countOccurrences(field.text, term) * field.weight,
            0,
        )
        if (tf > 0) score += tf / (tf + 1.5)
    }
    return score
}

export function matchesTalosLibrarySearchFields(
    query: string,
    fields: readonly TalosLibrarySearchField[],
): boolean {
    if (normalizeTalosLibrarySearchText(query) === '') return true
    return scoreTalosLibrarySearchFields(query, fields) > 0
}
