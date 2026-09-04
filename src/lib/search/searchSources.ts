import { DUCKDUCKGO_ENDPOINT, DUCKDUCKGO_USER_AGENT, parseDuckDuckGoHtml } from './duckduckgoSearch'

/**
 * F1 — the web search sources.
 *
 * Owner decision D1, revised 2026-07-26 after checking the pricing rather than
 * trusting a memory of it: **Tavily** is the first door (1,000 credits a month,
 * no credit card), **Brave** an option for its independent index (card required,
 * spending limits available; its current API terms prohibit retaining response
 * data without a separate agreement), **SearXNG self-hosted** for anyone who
 * wants no third party at all, and a **custom endpoint** for the rest.
 *
 * `request` and `parse` are pure and separate. That is not tidiness: it is how
 * the wire formats get pinned by tests with no network, and writing a wire
 * format from memory is exactly how Gemini and Ollama shipped mute for a day.
 *
 * Every shape here comes from the provider's own documentation:
 *  - Tavily: `Authorization: Bearer`, POST /search, `results[]` with
 *    `title` / `url` / `content` / `published_date`;
 *  - Brave: `X-Subscription-Token`, GET, `web.results[]` with `title` / `url` /
 *    `description` / `age` / `page_age`;
 *  - SearXNG: GET with `format=json` — **off by default on most instances**,
 *    which is why it must be asked for explicitly and why public instances were
 *    rejected (D2).
 *
 * R-03 (2026-09-04): a fifth source, **DuckDuckGo**, needs neither a key nor
 * an endpoint — it reads DuckDuckGo's public, no-JavaScript results page
 * (`duckduckgoSearch.ts`), the same solution the desktop already shipped the
 * same day. It is what makes web search work with nothing configured at all.
 */

export type TalosSearchSourceId = 'tavily' | 'brave' | 'searxng' | 'custom' | 'duckduckgo'

export interface TalosSearchResult {
    url: string
    title: string
    snippet: string
    /**
     * D7: the date the SOURCE reports, or null. Never a guess, never today's.
     * An assistant that invents a date is how old news is passed off as fresh.
     */
    publishedAt: string | null
}

export interface TalosSearchQuery {
    query: string
    maxResults: number
}

export interface TalosSearchCredential {
    apiKey?: string
    /** SearXNG and custom: the instance the user runs or trusts. */
    endpoint?: string
}

export interface TalosSearchRequest {
    method: 'GET' | 'POST'
    url: string
    headers: Record<string, string>
    data?: unknown
}

export interface TalosSearchSource {
    id: TalosSearchSourceId
    label: string
    /** True when the user must supply a key; false for SearXNG. */
    needsKey: boolean
    /** True when the user must supply the instance URL. */
    needsEndpoint: boolean
    request(query: TalosSearchQuery, credential: TalosSearchCredential): TalosSearchRequest
    parse(payload: unknown): TalosSearchResult[]
}

/** Anything that is not http(s) is not a citation, it is an attack surface. */
function usableUrl(value: unknown): string | null {
    if (typeof value !== 'string' || value === '') return null
    try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : null
    } catch {
        return null
    }
}

function text(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function date(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** A third party can answer with HTML, an error page, or nothing. None of those may throw. */
function rows(payload: unknown, path: 'results' | 'web.results'): unknown[] {
    if (!payload || typeof payload !== 'object') return []
    const container = path === 'results'
        ? (payload as { results?: unknown }).results
        : ((payload as { web?: { results?: unknown } }).web ?? {}).results
    return Array.isArray(container) ? container : []
}

function requireKey(credential: TalosSearchCredential): string {
    const key = credential.apiKey?.trim()
    if (!key) throw new Error('TALOS_SEARCH_CREDENTIAL_MISSING')
    return key
}

function requireEndpoint(credential: TalosSearchCredential): string {
    const endpoint = credential.endpoint?.trim().replace(/\/+$/, '')
    if (!endpoint) throw new Error('TALOS_SEARCH_ENDPOINT_MISSING')
    return endpoint
}

const tavily: TalosSearchSource = {
    id: 'tavily',
    label: 'Tavily',
    needsKey: true,
    needsEndpoint: false,
    request(query, credential) {
        return {
            method: 'POST',
            url: 'https://api.tavily.com/search',
            // The key travels in a header, never in the URL: a URL lands in
            // logs, in history and in error reports.
            headers: {
                authorization: `Bearer ${requireKey(credential)}`,
                'content-type': 'application/json',
            },
            data: {
                query: query.query,
                max_results: query.maxResults,
                search_depth: 'basic',
            },
        }
    },
    parse(payload) {
        return rows(payload, 'results').flatMap((row) => {
            const entry = row as Record<string, unknown>
            const url = usableUrl(entry.url)
            if (!url) return []
            return [{
                url,
                title: text(entry.title),
                snippet: text(entry.content),
                publishedAt: date(entry.published_date),
            }]
        })
    },
}

const brave: TalosSearchSource = {
    id: 'brave',
    label: 'Brave Search',
    needsKey: true,
    needsEndpoint: false,
    request(query, credential) {
        const search = new URLSearchParams({
            q: query.query,
            count: String(query.maxResults),
        })
        return {
            method: 'GET',
            url: `https://api.search.brave.com/res/v1/web/search?${search.toString()}`,
            headers: {
                'x-subscription-token': requireKey(credential),
                accept: 'application/json',
            },
        }
    },
    parse(payload) {
        return rows(payload, 'web.results').flatMap((row) => {
            const entry = row as Record<string, unknown>
            const url = usableUrl(entry.url)
            if (!url) return []
            return [{
                url,
                title: text(entry.title),
                snippet: text(entry.description),
                // Brave reports the most relevant date it found for the page.
                publishedAt: date(entry.page_age) ?? date(entry.age),
            }]
        })
    },
}

const searxng: TalosSearchSource = {
    id: 'searxng',
    label: 'SearXNG (self-hosted)',
    needsKey: false,
    needsEndpoint: true,
    request(query, credential) {
        const search = new URLSearchParams({
            q: query.query,
            // JSON output ships DISABLED on SearXNG. Asking for it explicitly is
            // the difference between results and an HTML page — and the reason
            // public instances were rejected (D2): most leave it off.
            format: 'json',
        })
        return {
            method: 'GET',
            url: `${requireEndpoint(credential)}/search?${search.toString()}`,
            headers: { accept: 'application/json' },
        }
    },
    parse(payload) {
        return rows(payload, 'results').flatMap((row) => {
            const entry = row as Record<string, unknown>
            const url = usableUrl(entry.url)
            if (!url) return []
            return [{
                url,
                title: text(entry.title),
                snippet: text(entry.content),
                publishedAt: date(entry.publishedDate),
            }]
        })
    },
}

/**
 * The escape hatch. Speaks the shape most search APIs converge on — a top-level
 * `results` array — so anything close to it works without a code change, and
 * anything else fails as an empty list rather than a crash.
 */
const custom: TalosSearchSource = {
    id: 'custom',
    label: 'Custom endpoint',
    needsKey: false,
    needsEndpoint: true,
    request(query, credential) {
        const search = new URLSearchParams({ q: query.query, count: String(query.maxResults) })
        const headers: Record<string, string> = { accept: 'application/json' }
        const key = credential.apiKey?.trim()
        if (key) headers.authorization = `Bearer ${key}`
        return { method: 'GET', url: `${requireEndpoint(credential)}?${search.toString()}`, headers }
    },
    parse(payload) {
        return rows(payload, 'results').flatMap((row) => {
            const entry = row as Record<string, unknown>
            const url = usableUrl(entry.url ?? entry.link)
            if (!url) return []
            return [{
                url,
                title: text(entry.title),
                snippet: text(entry.content ?? entry.snippet ?? entry.description),
                publishedAt: date(entry.published_date ?? entry.publishedDate ?? entry.date),
            }]
        })
    },
}

/**
 * R-03: the keyless fifth. `request` sends only the query, GET, to the fixed
 * DuckDuckGo endpoint — there is no `count`/`max_results` parameter DuckDuckGo
 * accepts, so (like the desktop port) truncation happens inside `parse`
 * instead, defaulting to the same 8 the desktop uses.
 *
 * `parse` receives a STRING here, not a JSON object: DuckDuckGo answers with
 * an HTML page, and `webSearchRuntime.ts` hands the raw response body
 * straight through. That is also why block/CAPTCHA detection is NOT done in
 * here — `parseTalosSearchResponse` wraps every `parse` in a try/catch that
 * swallows exceptions into an empty list (by design: a parser must never take
 * down a send), which would silently turn "DuckDuckGo refused us" into "no
 * results". `looksLikeDuckDuckGoBlock` runs one layer up, in
 * `webSearchRuntime.ts`, where a throw is allowed to reach the caller.
 */
const duckduckgo: TalosSearchSource = {
    id: 'duckduckgo',
    label: 'DuckDuckGo (no key)',
    needsKey: false,
    needsEndpoint: false,
    request(query) {
        const search = new URLSearchParams({ q: query.query })
        return {
            method: 'GET',
            url: `${DUCKDUCKGO_ENDPOINT}?${search.toString()}`,
            headers: {
                'user-agent': DUCKDUCKGO_USER_AGENT,
                accept: 'text/html',
            },
        }
    },
    parse(payload) {
        return parseDuckDuckGoHtml(payload)
    },
}

export const TALOS_SEARCH_SOURCES: readonly TalosSearchSource[] = [tavily, brave, searxng, custom, duckduckgo]

export function talosSearchSourceById(id: TalosSearchSourceId): TalosSearchSource {
    const source = TALOS_SEARCH_SOURCES.find((entry) => entry.id === id)
    if (!source) throw new Error(`TALOS_SEARCH_SOURCE_UNKNOWN: ${id}`)
    return source
}

export function buildTalosSearchRequest(
    source: TalosSearchSource,
    query: TalosSearchQuery,
    credential: TalosSearchCredential,
): TalosSearchRequest {
    return source.request(query, credential)
}

export function parseTalosSearchResponse(
    source: TalosSearchSource,
    payload: unknown,
): TalosSearchResult[] {
    try {
        return source.parse(payload)
    } catch {
        // Belt and braces: a parser is not allowed to take down a send, whatever
        // the far end returned.
        return []
    }
}
