import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
    DUCKDUCKGO_ENDPOINT,
    looksLikeDuckDuckGoBlock,
    parseDuckDuckGoHtml,
} from '@/lib/search/duckduckgoSearch'

/**
 * R-03 — DuckDuckGo, the keyless fifth source.
 *
 * The fixture is a byte-for-byte copy of the desktop's own test fixture — a
 * verbatim trim of a REAL `html.duckduckgo.com/html/` response captured
 * 2026-09-04, not markup written from memory. If DuckDuckGo changes its
 * markup this test can stay green while the real parser stops finding
 * results; that risk is exactly why block detection reads status/content
 * signals rather than trusting "zero results" to mean anything on its own.
 */
const fixture = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'duckduckgo-html-sample.html'),
    'utf8',
)

describe('duckduckgoSearch', () => {
    it('DDG-PARSE-01 the real endpoint is the fixed html.duckduckgo.com page', () => {
        expect(DUCKDUCKGO_ENDPOINT).toBe('https://html.duckduckgo.com/html/')
    })

    it('DDG-PARSE-02 parses the real fixture: decoded urls, tag-free titles and snippets', () => {
        const results = parseDuckDuckGoHtml(fixture, 10)
        expect(results).toHaveLength(3)
        for (const result of results) {
            expect(result.url).toMatch(/^https?:\/\//)
            // The real url comes from `uddg`, never the duckduckgo.com/l/ redirect.
            expect(result.url).not.toMatch(/duckduckgo\.com\/l\//)
            expect(result.title.length).toBeGreaterThan(0)
            expect(result.title).not.toMatch(/<|>/)
            expect(result.snippet).not.toMatch(/<b>|<\/b>/)
            // D7 parity (searchSources.ts): DuckDuckGo's page carries no
            // publication date — never guessed, never today's standing in.
            expect(result.publishedAt).toBeNull()
        }
        expect(results.some((r) => r.url.includes('github.com'))).toBe(true)
    })

    it('DDG-PARSE-03 maxResults truncates; AL CONTRARIO empty/non-HTML/null gives zero, never a throw', () => {
        expect(parseDuckDuckGoHtml(fixture, 1)).toHaveLength(1)
        expect(parseDuckDuckGoHtml('', 5)).toEqual([])
        expect(parseDuckDuckGoHtml(null, 5)).toEqual([])
        expect(parseDuckDuckGoHtml(undefined, 5)).toEqual([])
        expect(parseDuckDuckGoHtml('<html>{"not":"html"}</html>', 5)).toEqual([])
        expect(parseDuckDuckGoHtml(42, 5)).toEqual([])
    })

    it('DDG-BLOCK-04 403/429/202 or a resultless page mentioning anomaly/captcha is a block; AL CONTRARIO the real page is not', () => {
        expect(looksLikeDuckDuckGoBlock(403, '')).toBe(true)
        expect(looksLikeDuckDuckGoBlock(429, '')).toBe(true)
        // 202 matters specifically: the unofficial `ddgs` library raises its
        // own RatelimitException on exactly this status (confirmed 2026-09-04).
        expect(looksLikeDuckDuckGoBlock(202, '')).toBe(true)
        expect(looksLikeDuckDuckGoBlock(
            200,
            '<html>Our systems have detected unusual traffic. Please solve this captcha.</html>',
        )).toBe(true)
        expect(looksLikeDuckDuckGoBlock(200, fixture)).toBe(false)
        // AL CONTRARIO: an ordinary empty-results 200 (no result__a, no block
        // wording either) must NOT read as a block — that is legitimately
        // "nothing found", the other honest outcome.
        expect(looksLikeDuckDuckGoBlock(200, '<html><body>no matches</body></html>')).toBe(false)
    })

    it('DDG-PARSE-05 a result missing a decodable url or a title is dropped, never emitted half-built', () => {
        const html = `
            <a class="result__a" href="/l/?uddg=not%20a%20url&rut=x">Broken url</a>
            <a class="result__snippet">first snippet</a>
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fok&rut=x"></a>
            <a class="result__snippet">second snippet</a>
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fgood&rut=x">Good result</a>
            <a class="result__snippet">third snippet</a>
        `
        const results = parseDuckDuckGoHtml(html, 10)
        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({ url: 'https://example.org/good', title: 'Good result' })
    })
})
