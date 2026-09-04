import { describe, expect, it } from 'vitest'
import {
    TALOS_SEARCH_SOURCES,
    buildTalosSearchRequest,
    parseTalosSearchResponse,
    talosSearchSourceById,
} from '@/lib/search/searchSources'

/**
 * F1 — the search sources. Owner decision D1 (rivista 2026-07-26): three
 * sources, Tavily as the first door because Brave closed its free tier in
 * February 2026 and now wants a credit card with no spending cap; Brave as an
 * option for its independent index; SearXNG self-hosted for anyone who wants no
 * third party at all. Plus a custom endpoint.
 *
 * Request and parse are PURE and separate on purpose. The wire formats were
 * written from the providers' own documentation, not from memory — writing an
 * adapter from memory is exactly how Gemini and Ollama shipped mute for a day —
 * and pure functions mean the shapes can be pinned in a test with no network.
 */
describe('search sources', () => {
    it('offers exactly the sources the owner decided, in the decided order', () => {
        // R-03 (2026-09-04): DuckDuckGo is the FIFTH source, appended — it
        // needs neither a key nor an endpoint, so it works with nothing
        // configured, in parity with the desktop's own R-03 port.
        expect(TALOS_SEARCH_SOURCES.map((source) => source.id))
            .toEqual(['tavily', 'brave', 'searxng', 'custom', 'duckduckgo'])
    })

    it('Tavily authenticates with a bearer token and posts the query', () => {
        const request = buildTalosSearchRequest(
            talosSearchSourceById('tavily'),
            { query: 'fattura elettronica 2026', maxResults: 5 },
            { apiKey: 'tvly-secret' },
        )
        expect(request.method).toBe('POST')
        expect(request.url).toContain('api.tavily.com')
        expect(request.headers.authorization).toBe('Bearer tvly-secret')
        expect(request.data).toMatchObject({ query: 'fattura elettronica 2026', max_results: 5 })
        // The key must never travel in the URL: it would land in logs and history.
        expect(request.url).not.toContain('tvly-secret')
    })

    it('Brave authenticates with its own header and gets', () => {
        const request = buildTalosSearchRequest(
            talosSearchSourceById('brave'),
            { query: 'fattura', maxResults: 5 },
            { apiKey: 'brave-secret' },
        )
        expect(request.method).toBe('GET')
        expect(request.headers['x-subscription-token']).toBe('brave-secret')
        expect(request.url).toContain('q=fattura')
        expect(JSON.stringify(request.headers)).toContain('brave-secret')
        expect(request.url).not.toContain('brave-secret')
    })

    it('SearXNG needs no key but does need the instance the user runs', () => {
        const request = buildTalosSearchRequest(
            talosSearchSourceById('searxng'),
            { query: 'fattura', maxResults: 5 },
            { endpoint: 'https://searx.example.org' },
        )
        expect(request.url).toContain('https://searx.example.org/search')
        // JSON output is OFF by default on SearXNG — asking for it explicitly is
        // the difference between working and getting an HTML page back.
        expect(request.url).toContain('format=json')
    })

    it('refuses to build a request when the credential is missing, instead of calling naked', () => {
        expect(() => buildTalosSearchRequest(
            talosSearchSourceById('tavily'), { query: 'x', maxResults: 3 }, {},
        )).toThrow(/TALOS_SEARCH_CREDENTIAL/)
        expect(() => buildTalosSearchRequest(
            talosSearchSourceById('searxng'), { query: 'x', maxResults: 3 }, {},
        )).toThrow(/TALOS_SEARCH_ENDPOINT/)
    })

    it('parses Tavily results, carrying the publication date when it is there', () => {
        const results = parseTalosSearchResponse(talosSearchSourceById('tavily'), {
            results: [
                {
                    title: 'Fattura elettronica',
                    url: 'https://example.org/a',
                    content: 'Le regole 2026 …',
                    published_date: '2026-03-04',
                    score: 0.9,
                },
                { title: 'Senza data', url: 'https://example.org/b', content: '…' },
            ],
        })
        expect(results).toHaveLength(2)
        expect(results[0]).toMatchObject({
            url: 'https://example.org/a',
            title: 'Fattura elettronica',
            publishedAt: '2026-03-04',
        })
        // D7: an absent date is NULL and stays null. Guessing one, or quietly
        // using today's, is how an assistant passes off old news as fresh.
        expect(results[1]!.publishedAt).toBeNull()
    })

    it('parses Brave results out of web.results, with its age field', () => {
        const results = parseTalosSearchResponse(talosSearchSourceById('brave'), {
            web: {
                results: [{
                    title: 'Fattura',
                    url: 'https://example.org/c',
                    description: 'Testo …',
                    page_age: '2026-02-01T00:00:00Z',
                }],
            },
        })
        expect(results[0]).toMatchObject({
            url: 'https://example.org/c',
            snippet: 'Testo …',
            publishedAt: '2026-02-01T00:00:00Z',
        })
    })

    it('parses SearXNG results', () => {
        const results = parseTalosSearchResponse(talosSearchSourceById('searxng'), {
            results: [{
                title: 'Fattura',
                url: 'https://example.org/d',
                content: 'Testo',
                publishedDate: '2026-01-09',
            }],
        })
        expect(results[0]).toMatchObject({ url: 'https://example.org/d', publishedAt: '2026-01-09' })
    })

    it('a malformed response is an EMPTY list, never an exception', () => {
        // A search source is a third party. It can return HTML, an error page or
        // nothing at all, and none of those may take down a send.
        for (const id of ['tavily', 'brave', 'searxng'] as const) {
            const source = talosSearchSourceById(id)
            expect(parseTalosSearchResponse(source, null)).toEqual([])
            expect(parseTalosSearchResponse(source, '<html>rate limited</html>')).toEqual([])
            expect(parseTalosSearchResponse(source, { results: 'nope' })).toEqual([])
        }
    })

    it('DDG-SOURCE-01 DuckDuckGo needs no credential at all and GETs the fixed endpoint', () => {
        const request = buildTalosSearchRequest(
            talosSearchSourceById('duckduckgo'),
            { query: 'fattura elettronica 2026', maxResults: 5 },
            {},
        )
        expect(request.method).toBe('GET')
        expect(request.url).toMatch(/^https:\/\/html\.duckduckgo\.com\/html\/\?q=/)
        expect(request.url).toContain('q=fattura')
        expect(request.data).toBeUndefined()
        // AL CONTRARIO of the four keyed/endpointed sources: no key, no
        // endpoint anywhere means the tool still works.
        expect(TALOS_SEARCH_SOURCES.find((s) => s.id === 'duckduckgo')).toMatchObject({
            needsKey: false,
            needsEndpoint: false,
        })
    })

    it('DDG-SOURCE-02 DuckDuckGo parses the HTML payload webSearchRuntime hands it, not JSON', () => {
        const html = `
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fa&rut=x">Titolo</a>
            <a class="result__snippet">Estratto</a>
        `
        const results = parseTalosSearchResponse(talosSearchSourceById('duckduckgo'), html)
        expect(results).toEqual([{
            url: 'https://example.org/a',
            title: 'Titolo',
            snippet: 'Estratto',
            publishedAt: null,
        }])
        // A parser must never take down a send: a non-string payload (a stray
        // JSON object, say) is not HTML, and reads as zero results, not a crash.
        expect(parseTalosSearchResponse(talosSearchSourceById('duckduckgo'), { results: [] })).toEqual([])
        expect(parseTalosSearchResponse(talosSearchSourceById('duckduckgo'), null)).toEqual([])
    })

    it('drops entries without a usable url rather than emitting a citation to nowhere', () => {
        const results = parseTalosSearchResponse(talosSearchSourceById('tavily'), {
            results: [
                { title: 'no url', content: 'x' },
                { title: 'ok', url: 'https://example.org/e', content: 'x' },
                { title: 'not http', url: 'javascript:alert(1)', content: 'x' },
            ],
        })
        expect(results.map((entry) => entry.url)).toEqual(['https://example.org/e'])
    })
})
