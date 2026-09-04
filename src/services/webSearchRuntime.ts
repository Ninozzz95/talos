import { CapacitorHttp } from '@capacitor/core'
import {
    buildTalosSearchRequest,
    parseTalosSearchResponse,
    talosSearchSourceById,
    type TalosSearchCredential,
    type TalosSearchResult,
    type TalosSearchSourceId,
} from '@/lib/search/searchSources'
import { looksLikeDuckDuckGoBlock } from '@/lib/search/duckduckgoSearch'
import type { TalosExtractedPage } from '@/lib/search/pageExtract'
import { readTalosSafeWebPage } from '@/services/safeWebRead'

/**
 * The network half of F1.
 *
 * Everything goes through `CapacitorHttp`, which on device is a NATIVE request
 * and therefore not subject to CORS. That single fact is what lets TALOS read
 * the open web from a phone at all — and it is why only the query leaves the
 * device: Perplexity, ChatGPT Search and Gemini fetch and extract on their own
 * servers, we fetch here and extract in the WebView.
 *
 * The extractor is imported lazily: Readability is only needed when a page is
 * actually opened, and the chat's first paint must not carry it.
 */

const NETWORK = 'TALOS_NETWORK_UNAVAILABLE'

/** One place to decide "the network is gone" versus "the far end said no". */
function asNetworkFailure(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error)
    if (/Failed to fetch|NetworkError|ENOTFOUND|ECONNREFUSED|ERR_INTERNET|timeout/i.test(message)) {
        return new Error(NETWORK)
    }
    return error instanceof Error ? error : new Error(message)
}

export async function runTalosSearch(
    sourceId: TalosSearchSourceId,
    credential: TalosSearchCredential,
    query: string,
    maxResults: number,
): Promise<TalosSearchResult[]> {
    const source = talosSearchSourceById(sourceId)
    const request = buildTalosSearchRequest(source, { query, maxResults }, credential)

    let response: { status: number; data: unknown }
    try {
        response = await CapacitorHttp.request({
            method: request.method,
            url: request.url,
            headers: request.headers,
            ...(request.data === undefined ? {} : { data: request.data }),
            connectTimeout: 20_000,
            readTimeout: 20_000,
        })
    } catch (error) {
        throw asNetworkFailure(error)
    }

    /*
     * R-03: DuckDuckGo is keyless, so "refused the key" (below) is the wrong
     * story for it — and unlike the other four sources, a block can arrive as
     * an HTTP 200 wearing a CAPTCHA page, which the generic 200-299 pass-
     * through below would otherwise hand to `parse` as if it were results.
     * `parse` itself is not allowed to throw (see `searchSources.ts`), so the
     * check has to live here, BEFORE the generic status handling, on the raw
     * body this source alone returns as HTML rather than JSON.
     */
    if (sourceId === 'duckduckgo') {
        const html = typeof response.data === 'string' ? response.data : ''
        if (looksLikeDuckDuckGoBlock(response.status, html)) {
            throw new Error(
                `TALOS_SEARCH_BLOCKED: DuckDuckGo refused the request (HTTP ${response.status}) `
                + '— rate limit or anti-bot check. Try again later or choose a keyed source.',
            )
        }
    }
    if (response.status === 401 || response.status === 403) {
        // A refused key must never look like an empty web: one means "fix your
        // settings", the other means "nothing found", and conflating them is how
        // a user spends an afternoon believing the internet has no answer.
        throw new Error('TALOS_SEARCH_KEY_REJECTED: the search provider refused the key.')
    }
    if (response.status === 429) {
        throw new Error('TALOS_SEARCH_RATE_LIMITED: the search provider is rate limiting this key.')
    }
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`TALOS_SEARCH_FAILED: the search provider answered ${response.status}.`)
    }

    return parseTalosSearchResponse(source, response.data)
}

/**
 * Fetch ONE page through the Android public-network boundary and extract it
 * here on the device.
 *
 * DNS answers and redirect hops are validated by the native adapter before the
 * bounded body crosses the bridge. The final validated URL is recorded because
 * it is the page actually read.
 */
export async function readTalosPage(url: string): Promise<TalosExtractedPage | null> {
    let response: { status: number; url: string; body: string }
    try {
        response = await readTalosSafeWebPage(url)
    } catch (error) {
        throw asNetworkFailure(error)
    }

    if (response.status < 200 || response.status >= 300) return null
    const html = response.body
    if (html.trim() === '') return null

    const { extractTalosPage } = await import('@/lib/search/pageExtract')
    return extractTalosPage(html, response.url)
}
