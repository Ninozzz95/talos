/**
 * One policy for every filename TALOS derives from untrusted human/model text.
 *
 * A JavaScript string is indexed in UTF-16 code units, while storage providers
 * receive encoded display names and people see grapheme clusters. Raw
 * `slice()` is therefore the wrong boundary twice over: it can create malformed
 * UTF-16 and can tear one visible glyph into pieces.
 *
 * `unicode-segmenter` is deliberately loaded only when a generated file is
 * being named. The chat's initial bundle stays lean while the runtime remains
 * pinned to Unicode 17 rather than whatever ICU data the installed WebView
 * happens to expose.
 */

const UTF8 = new TextEncoder()
const FORBIDDEN_FILE_CHARACTERS = new Set(['/', '\\', ':', '"', '*', '?', '<', '>', '|'])

function unsafeFileNameCodePoint(code: number): boolean {
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
    if (code >= 0xd800 && code <= 0xdfff) return true
    if (code === 0x00ad || code === 0x200b || code === 0xfeff) return true
    if (code === 0x200e || code === 0x200f) return true
    if (code >= 0x202a && code <= 0x202e) return true
    return code >= 0x2066 && code <= 0x2069
}

function sanitizeFileStem(value: string): string {
    let safe = ''
    for (const character of value.normalize('NFKC')) {
        const code = character.codePointAt(0) ?? 0
        if (unsafeFileNameCodePoint(code)) continue
        safe += FORBIDDEN_FILE_CHARACTERS.has(character) ? ' ' : character
    }
    return safe.replace(/\s+/gu, ' ').trim()
}

function appendWithinUtf8Budget(current: string, next: string, budget: number): string | null {
    const candidate = `${current}${next}`
    return UTF8.encode(candidate).byteLength <= budget ? candidate : null
}

/**
 * Return a safe filename STEM under a UTF-8 byte budget.
 *
 * The extension belongs to the caller and is appended after this boundary.
 * The async contract keeps the standards implementation in a lazy Vite chunk.
 */
export async function talosSafeFileStem(
    value: string,
    maxUtf8Bytes: number,
    fallback: string,
): Promise<string> {
    if (!Number.isSafeInteger(maxUtf8Bytes) || maxUtf8Bytes < 1) {
        throw new RangeError('TALOS_FILENAME_BUDGET_INVALID')
    }

    const { splitGraphemes } = await import('unicode-segmenter/grapheme')
    const safeFallback = sanitizeFileStem(fallback) || 'file'
    const source = sanitizeFileStem(value) || safeFallback
    let bounded = ''

    for (const grapheme of splitGraphemes(source)) {
        const candidate = appendWithinUtf8Budget(bounded, grapheme, maxUtf8Bytes)
        if (candidate === null) break
        bounded = candidate
    }
    bounded = bounded.trimEnd()
    if (bounded) return bounded

    for (const grapheme of splitGraphemes(safeFallback)) {
        const candidate = appendWithinUtf8Budget(bounded, grapheme, maxUtf8Bytes)
        if (candidate === null) break
        bounded = candidate
    }
    return bounded.trimEnd() || 'f'
}

