/**
 * Turn a fetched HTML page into the fields of a Library source card.
 *
 * Owner 2026-07-30, complete scope. Competitors unfurl links through a cloud
 * service that sees every URL; TALOS parses the bytes it already fetched
 * through its own safe-web boundary, so this layer has no network and needs
 * none. It is a pure string parser, which is also why it can be tested against
 * the hostile HTML it will really meet.
 *
 * It reads with a regex rather than a DOM on purpose: this runs over
 * attacker-controlled markup with no browser to sandbox it, and a bounded
 * pattern over a bounded prefix cannot be walked into script execution or a
 * pathological parse. It only needs the <head>, so it only reads the head.
 */

const MAX_HTML_SCAN = 64 * 1024
const MAX_TITLE = 300

export interface TalosSourceCardFields {
    /** Human title; never empty — falls back to the hostname. */
    title: string
    /** Site name; falls back to the hostname. */
    siteName: string
    /** Absolute https URL of a preview image, or null. */
    imageUrl: string | null
    /** Absolute https URL of the best icon; falls back to /favicon.ico. */
    iconUrl: string
}

function decodeEntities(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&nbsp;/g, ' ')
}

function boundedText(value: string): string {
    const clean = decodeEntities(value).replace(/\s+/g, ' ').trim()
    return clean.length > MAX_TITLE ? clean.slice(0, MAX_TITLE) : clean
}

/** Every attribute pair inside a given tag name, in document order. */
function tags(html: string, tagName: string): string[] {
    const found: string[] = []
    const pattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi')
    let match: RegExpExecArray | null
    while ((match = pattern.exec(html)) !== null) found.push(match[1] ?? '')
    return found
}

function attr(tag: string, name: string): string | null {
    const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
    if (!match) return null
    return match[2] ?? match[3] ?? match[4] ?? null
}

/** A meta value by property/name, whichever the page used. */
function meta(html: string, key: string): string | null {
    for (const tag of tags(html, 'meta')) {
        const which = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase()
        if (which === key.toLowerCase()) {
            const content = attr(tag, 'content')
            if (content && content.trim()) return content
        }
    }
    return null
}

/**
 * Resolve a candidate subresource URL against the page, and vouch for it.
 *
 * A card's icon and preview are fetched LATER, so a javascript:/data: URL, or
 * an http downgrade for something we would go and load, is dropped here rather
 * than handed downstream. https only, absolute only.
 */
function safeSubresource(raw: string | null, pageUrl: string): string | null {
    if (!raw || !raw.trim()) return null
    let resolved: URL
    try {
        resolved = new URL(raw.trim(), pageUrl)
    } catch {
        return null
    }
    if (resolved.protocol !== 'https:') return null
    return resolved.toString()
}

function pickIcon(html: string, pageUrl: string): string {
    let best: { url: string; size: number } | null = null
    for (const tag of tags(html, 'link')) {
        const rel = (attr(tag, 'rel') ?? '').toLowerCase()
        if (!rel.includes('icon')) continue
        const href = safeSubresource(attr(tag, 'href'), pageUrl)
        if (!href) continue
        // apple-touch-icon has no sizes but is deliberately large; weight it
        // above a bare 16×16 so it beats a tiny declared favicon.
        const declared = attr(tag, 'sizes')
        const size = declared
            ? Math.max(0, ...declared.split(/\s+/).map((s) => parseInt(s, 10) || 0))
            : rel.includes('apple-touch-icon') ? 160 : 1
        if (!best || size > best.size) best = { url: href, size }
    }
    if (best) return best.url
    // Every site answers here even when it declares nothing.
    return new URL('/favicon.ico', pageUrl).toString()
}

export function talosUnfurlPage(pageUrl: string, html: string): TalosSourceCardFields {
    const head = html.slice(0, MAX_HTML_SCAN)
    let hostname = ''
    try {
        hostname = new URL(pageUrl).hostname.replace(/^www\./, '')
    } catch {
        hostname = pageUrl
    }

    const ogTitle = meta(head, 'og:title')
    const docTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? null
    const title = boundedText(ogTitle ?? docTitle ?? '') || hostname

    const siteName = boundedText(meta(head, 'og:site_name') ?? '') || hostname

    const imageUrl = safeSubresource(
        meta(head, 'og:image') ?? meta(head, 'twitter:image'),
        pageUrl,
    )

    return { title, siteName, imageUrl, iconUrl: pickIcon(head, pageUrl) }
}
