// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
    safeRead: vi.fn(),
    capacitorRequest: vi.fn(),
}))

vi.mock('@/services/safeWebRead', () => ({
    readTalosSafeWebPage: bridge.safeRead,
}))

vi.mock('@capacitor/core', () => ({
    CapacitorHttp: {
        request: bridge.capacitorRequest,
    },
}))

import { readTalosPage, runTalosSearch } from '@/services/webSearchRuntime'

const ARTICLE = `
<article>
  <h1>Verified final page</h1>
  ${'<p>This is a long, readable paragraph from the final public page and contains enough text for article extraction.</p>'.repeat(6)}
</article>`

describe('webSearchRuntime safe page integration', () => {
    it('SAFE-WEB-12 extracts the native bounded body and keeps its validated final URL', async () => {
        bridge.safeRead.mockResolvedValueOnce({
            status: 200,
            url: 'https://example.org/final',
            body: `<!doctype html><html><head><title>Final</title></head><body>${ARTICLE}</body></html>`,
        })

        const page = await readTalosPage('http://example.org/start')

        expect(bridge.safeRead).toHaveBeenCalledWith('http://example.org/start')
        expect(bridge.capacitorRequest).not.toHaveBeenCalled()
        expect(page).toMatchObject({
            url: 'https://example.org/final',
            title: 'Final',
            text: expect.stringMatching(/long, readable paragraph/i),
        })
    })

    it('returns null without extraction for a non-success response', async () => {
        bridge.safeRead.mockResolvedValueOnce({
            status: 404,
            url: 'https://example.org/missing',
            body: '<html><body>missing</body></html>',
        })

        await expect(readTalosPage('https://example.org/missing')).resolves.toBeNull()
    })
})

/**
 * R-03 — `runTalosSearch` had NO coverage before this: only `readTalosPage`
 * (above) was tested here. DuckDuckGo needed dedicated tests specifically
 * because its block detection lives in THIS file, not in `searchSources.ts`
 * (see the comment on the `sourceId === 'duckduckgo'` branch there) — a
 * layer no other source needed until now.
 */
describe('webSearchRuntime search — DuckDuckGo block detection', () => {
    it('DDG-RUNTIME-01 a real results page (HTTP 200 HTML) parses into results, no key needed', async () => {
        bridge.capacitorRequest.mockResolvedValueOnce({
            status: 200,
            data: '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fa&rut=x">T</a>'
                + '<a class="result__snippet">S</a>',
        })
        const results = await runTalosSearch('duckduckgo', {}, 'talos', 5)
        expect(results).toEqual([{ url: 'https://example.org/a', title: 'T', snippet: 'S', publishedAt: null }])
    })

    it('DDG-RUNTIME-02 a 403/429/202 is TALOS_SEARCH_BLOCKED, distinct from the generic key-rejected wording', async () => {
        for (const status of [403, 429, 202]) {
            bridge.capacitorRequest.mockResolvedValueOnce({ status, data: '' })
            await expect(runTalosSearch('duckduckgo', {}, 'x', 5))
                .rejects.toThrow(/TALOS_SEARCH_BLOCKED/)
        }
    })

    it('DDG-RUNTIME-03 a 200 CAPTCHA page is ALSO TALOS_SEARCH_BLOCKED, not silently zero results', async () => {
        bridge.capacitorRequest.mockResolvedValueOnce({
            status: 200,
            data: '<html>Our systems have detected unusual traffic. Please solve this captcha.</html>',
        })
        await expect(runTalosSearch('duckduckgo', {}, 'x', 5)).rejects.toThrow(/TALOS_SEARCH_BLOCKED/)
    })

    it('DDG-RUNTIME-04 AL CONTRARIO: a real 200 page with zero matches is an empty list, never a throw', async () => {
        bridge.capacitorRequest.mockResolvedValueOnce({ status: 200, data: '<html><body>no matches</body></html>' })
        await expect(runTalosSearch('duckduckgo', {}, 'x', 5)).resolves.toEqual([])
    })

    it('DDG-RUNTIME-05 AL CONTRARIO: a keyed source is untouched by the DuckDuckGo-only branch', async () => {
        bridge.capacitorRequest.mockResolvedValueOnce({ status: 403, data: '' })
        await expect(runTalosSearch('tavily', { apiKey: 'tvly-x' }, 'x', 5))
            .rejects.toThrow(/TALOS_SEARCH_KEY_REJECTED/)
    })
})
