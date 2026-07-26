import { Readability } from '@mozilla/readability'

/**
 * Reading a web page ON THE DEVICE.
 *
 * This is what makes the local-first claim true rather than decorative:
 * `CapacitorHttp` fetches the page natively (it bypasses CORS), and the
 * extraction happens right here in the WebView. Perplexity, ChatGPT Search and
 * Gemini all ship the page to their own infrastructure and extract it there —
 * in TALOS **only the query leaves the phone**.
 *
 * Readability is Firefox's Reader View, so it has been beaten on the real web
 * for a decade. Two things about it matter and are handled below: it MUTATES
 * the document it is given (so it gets a throwaway one), and it prefers
 * Schema.org JSON-LD for metadata — which is also the best source for the
 * publication date D7 needs.
 */

export interface TalosExtractedPage {
    url: string
    title: string
    /** Readable text, page furniture removed. */
    text: string
    byline: string | null
    siteName: string | null
    /** What the page declares, or null. Never inferred. See `talosPublicationDate`. */
    publishedAt: string | null
}

const MAX_TEXT = 40_000

function parse(html: string): Document | null {
    try {
        // A fresh document every time: Readability strips nodes out of whatever
        // it is handed, so sharing one would corrupt the second read.
        return new DOMParser().parseFromString(html, 'text/html')
    } catch {
        return null
    }
}

/**
 * The publication date, from what the page itself asserts, in descending order
 * of trust. Returns **null** when nothing is declared.
 *
 * D7 turns on this null being real. An assistant that quietly substitutes
 * today's date, or infers one from the URL, is how two-year-old news gets
 * presented as this morning's — and it is the failure the owner singled out.
 */
export function talosPublicationDate(html: string): string | null {
    const document = parse(html)
    if (!document) return null

    // 1. JSON-LD. What the publisher's own CMS states, and what Readability
    //    itself gives precedence to.
    for (const node of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        let payload: unknown
        try {
            payload = JSON.parse(node.textContent ?? '')
        } catch {
            // A broken JSON-LD block is extremely common and means nothing.
            continue
        }
        const found = findPublished(payload)
        if (found) return found
    }

    // 2. OpenGraph / article metadata.
    const meta = document.querySelector('meta[property="article:published_time"], meta[name="date"], meta[itemprop="datePublished"]')
    const content = meta?.getAttribute('content')?.trim()
    if (content) return content

    // 3. A <time> element that carries a machine-readable datetime.
    const time = document.querySelector('time[datetime]')?.getAttribute('datetime')?.trim()
    if (time) return time

    return null
}

/** JSON-LD arrives as an object, an array, or wrapped in `@graph`. */
function findPublished(payload: unknown, depth = 0): string | null {
    if (depth > 4 || !payload) return null
    if (Array.isArray(payload)) {
        for (const entry of payload) {
            const found = findPublished(entry, depth + 1)
            if (found) return found
        }
        return null
    }
    if (typeof payload !== 'object') return null
    const node = payload as Record<string, unknown>
    const direct = node.datePublished ?? node.dateCreated
    if (typeof direct === 'string' && direct.trim() !== '') return direct.trim()
    return findPublished(node['@graph'], depth + 1)
}

/**
 * The readable article, or null when the page has none — a search results page,
 * a paywall, an app shell. Returning the navigation instead would put noise in
 * the model's context and poison every quote taken from the page, which is
 * precisely what the citation verification depends on being clean.
 */
export function extractTalosPage(html: string, url: string): TalosExtractedPage | null {
    const document = parse(html)
    if (!document) return null

    let article: ReturnType<Readability['parse']> = null
    try {
        article = new Readability(document).parse()
    } catch {
        return null
    }
    const text = article?.textContent?.trim() ?? ''
    // Below this a "successful" extraction is furniture, not an article.
    if (text.length < 200) return null

    return {
        // The url we FETCHED, not one read out of the document: a canonical tag
        // can point anywhere, and a citation must name what was actually read.
        url,
        title: article?.title?.trim() || document.title.trim(),
        text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n\n[truncated]` : text,
        byline: article?.byline?.trim() || null,
        siteName: article?.siteName?.trim() || null,
        publishedAt: talosPublicationDate(html),
    }
}
