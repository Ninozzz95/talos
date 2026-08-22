import { describe, expect, it } from 'vitest'
import {
    buildTalosSearchRequest,
    parseTalosSearchResponse,
    talosSearchSourceById,
} from '@/lib/search/searchSources'

/**
 * F1 — the search adapters against the REAL services.
 *
 * Same shape as `providerUpstream.integration.test.ts`: gated on an env var, so
 * it is skipped everywhere a key is absent (CI included) and runs on demand for
 * a human with one. The wire formats in `searchSources.ts` were written from
 * the providers' documentation; this is what proves the documentation and the
 * service agree, which is the step that was missing when Gemini and Ollama
 * shipped with adapters nobody had ever run.
 *
 *   TALOS_TEST_TAVILY_API_KEY=… npx vitest run tests/integration/searchUpstream
 */
const tavilyKey = process.env.TALOS_TEST_TAVILY_API_KEY?.trim() ?? ''
const braveKey = process.env.TALOS_TEST_BRAVE_API_KEY?.trim() ?? ''

async function call(request: ReturnType<typeof buildTalosSearchRequest>): Promise<unknown> {
    const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.data === undefined ? undefined : JSON.stringify(request.data),
    })
    const body = await response.text()
    expect(response.status, `HTTP ${response.status}: ${body.slice(0, 300)}`).toBe(200)
    return body ? JSON.parse(body) : null
}

describe.skipIf(tavilyKey === '')('Tavily, live', () => {
    it('answers in the shape the adapter parses', async () => {
        const source = talosSearchSourceById('tavily')
        const payload = await call(buildTalosSearchRequest(
            source,
            { query: 'fattura elettronica regole 2026', maxResults: 5 },
            { apiKey: tavilyKey },
        ))
        const results = parseTalosSearchResponse(source, payload)

        expect(results.length).toBeGreaterThan(0)
        for (const result of results) {
            expect(result.url).toMatch(/^https?:\/\//)
            expect(typeof result.title).toBe('string')
            expect(typeof result.snippet).toBe('string')
            // D7: null is a legitimate answer. What must never happen is a
            // fabricated date, so the only assertion is "string or null".
            expect(result.publishedAt === null || typeof result.publishedAt === 'string').toBe(true)
        }
    }, 30_000)

    it('a wrong key fails loudly instead of returning an empty list', async () => {
        const source = talosSearchSourceById('tavily')
        const request = buildTalosSearchRequest(
            source, { query: 'x', maxResults: 1 }, { apiKey: 'tvly-not-a-real-key' },
        )
        const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: JSON.stringify(request.data),
        })
        // An empty result set and a refused key must never look the same: one
        // means "nothing found", the other means "fix your settings".
        expect(response.status).toBeGreaterThanOrEqual(400)
    }, 30_000)
})

describe.skipIf(braveKey === '')('Brave, live', () => {
    it('answers in the shape the adapter parses', async () => {
        const source = talosSearchSourceById('brave')
        const payload = await call(buildTalosSearchRequest(
            source, { query: 'fattura elettronica 2026', maxResults: 5 }, { apiKey: braveKey },
        ))
        const results = parseTalosSearchResponse(source, payload)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0]!.url).toMatch(/^https?:\/\//)
    }, 30_000)
})
