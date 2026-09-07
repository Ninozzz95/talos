// Detects an explicit http(s) URL in free text so the workspace can offer to
// browse it. Requiring the scheme keeps this from firing on ordinary prose
// ("no spurious on non-URL text") — bare words and domains are ignored.

const URL_PATTERN = /\bhttps?:\/\/[^\s<>()"'`]+/i
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>"']+$/

export function talosFirstUrl(text: string | null | undefined): string | null {
    if (!text) return null
    const match = text.match(URL_PATTERN)
    if (!match) return null

    const candidate = match[0].replace(TRAILING_PUNCTUATION, '')
    try {
        // Only offer real, parseable URLs.
        return new URL(candidate).href.replace(TRAILING_PUNCTUATION, '')
    } catch {
        return null
    }
}

export function talosUrlHost(url: string): string {
    try {
        return new URL(url).host
    } catch {
        return url
    }
}
