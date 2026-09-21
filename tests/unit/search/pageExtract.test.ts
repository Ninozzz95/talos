// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { extractTalosPage, talosPublicationDate } from '@/lib/search/pageExtract'

/**
 * F1 — reading a page ON THE DEVICE.
 *
 * This is the piece that makes the local-first claim true: `CapacitorHttp`
 * fetches the page natively (it bypasses CORS), and the extraction happens here,
 * in the WebView. Perplexity, ChatGPT Search and Gemini send the page to their
 * own servers and extract it there. In TALOS only the query leaves the phone.
 *
 * D7 lives here too: the publication date is read from what the page actually
 * declares, and is **null** when the page declares nothing. A guessed date is
 * how an assistant passes off two-year-old news as this morning's.
 */
function page(head: string, body: string): string {
    return `<!doctype html><html><head><title>Titolo</title>${head}</head><body>${body}</body></html>`
}

const ARTICLE = `
<article>
  <h1>La fattura elettronica nel 2026</h1>
  ${'<p>Il totale dovuto è di 2196 euro e il pagamento va effettuato entro trenta giorni dalla data di emissione del documento.</p>'.repeat(6)}
</article>`

describe('on-device page extraction', () => {
    it('pulls the readable article out of the page furniture', () => {
        const extracted = extractTalosPage(
            page('', `<nav>menu menu menu</nav>${ARTICLE}<footer>cookie policy</footer>`),
            'https://example.org/fattura',
        )
        expect(extracted).not.toBeNull()
        expect(extracted!.text).toContain('2196 euro')
        // The chrome must not travel with the content: it is noise in the model's
        // context and it pollutes any quote taken from the page.
        expect(extracted!.text).not.toContain('cookie policy')
        expect(extracted!.title).toContain('fattura')
    })

    it('keeps the url it was told, not one guessed from the document', () => {
        const extracted = extractTalosPage(page('', ARTICLE), 'https://example.org/fattura')
        expect(extracted!.url).toBe('https://example.org/fattura')
    })

    it('returns null on a page with no article, instead of a pile of navigation', () => {
        const extracted = extractTalosPage(page('', '<nav>a b c</nav>'), 'https://example.org/x')
        expect(extracted).toBeNull()
    })

    it('survives malformed html rather than throwing into the send', () => {
        expect(() => extractTalosPage('<html><body><p>unclosed', 'https://example.org/y')).not.toThrow()
    })
})

describe('publication date (D7)', () => {
    it('prefers JSON-LD, which is what the page itself asserts', () => {
        const html = page(
            `<script type="application/ld+json">
             {"@type":"NewsArticle","datePublished":"2026-03-04T08:00:00Z"}</script>`,
            ARTICLE,
        )
        expect(talosPublicationDate(html)).toBe('2026-03-04T08:00:00Z')
    })

    it('falls back to the OpenGraph article meta', () => {
        const html = page('<meta property="article:published_time" content="2026-02-01">', ARTICLE)
        expect(talosPublicationDate(html)).toBe('2026-02-01')
    })

    it('falls back to a datetime attribute on <time>', () => {
        const html = page('', `<time datetime="2026-01-09">9 gennaio</time>${ARTICLE}`)
        expect(talosPublicationDate(html)).toBe('2026-01-09')
    })

    it('returns NULL when the page declares nothing — never today', () => {
        expect(talosPublicationDate(page('', ARTICLE))).toBeNull()
    })

    it('ignores a JSON-LD block that is not valid JSON, without throwing', () => {
        const html = page('<script type="application/ld+json">{ broken</script>', ARTICLE)
        expect(talosPublicationDate(html)).toBeNull()
    })

    it('reads the date out of a JSON-LD @graph, which is how many CMSes emit it', () => {
        const html = page(
            `<script type="application/ld+json">
             {"@graph":[{"@type":"WebSite"},{"@type":"Article","datePublished":"2026-05-05"}]}</script>`,
            ARTICLE,
        )
        expect(talosPublicationDate(html)).toBe('2026-05-05')
    })
})
