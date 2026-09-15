/**
 * F1 — DuckDuckGo, the fifth, KEYLESS search source.
 *
 * Owner 2026-09-04: "the mobile doesn't have DuckDuckGo as a keyless search
 * engine, fix it." Today's four sources (Tavily, Brave, SearXNG, custom) all
 * need a key or an instance address — with nothing configured the model
 * cannot search at all. The desktop already solved this the same day (R-03,
 * `duckduckgo-search.mjs`): this module ports that solution rather than
 * inventing a new one, adapted only where mobile's own contracts differ.
 *
 * DuckDuckGo has no public API: this reads the no-JavaScript HTML results
 * page (`html.duckduckgo.com/html/`), the same approach the unofficial
 * `ddgs` library and OpenClaw's "unofficial HTML-based integration" use. It
 * is a public page, not an agreement — under heavy automated use it answers
 * with a block or a CAPTCHA (confirmed 2026-09-04: `ddgs` itself raises a
 * `RatelimitException` on HTTP 202, alongside 403/429 — the same three
 * statuses `looksLikeDuckDuckGoBlock` checks below), and that must never be
 * confused with "no results". A single phone making occasional,
 * user-triggered searches is a very different load than the 50+/hour
 * scraping that documented reports say gets an IP rate-limited, but the
 * detection has to exist regardless of how rarely it fires.
 *
 * The markup shape below was read from a REAL response (curl, 200, ~32 KB,
 * 2026-09-04) and the test fixture (`tests/unit/search/fixtures/
 * duckduckgo-html-sample.html`) is a verbatim copy of the desktop's own
 * fixture — not HTML written from memory:
 *
 *   <a class="result__a" href="//duckduckgo.com/l/?uddg=<url-encoded>&rut=…">Title</a>
 *   <a class="result__snippet" href="…">Excerpt with <b>bold</b> markup</a>
 *
 * The real URL lives in the `uddg` parameter of the `duckduckgo.com/l/`
 * redirect — it is decoded here; the redirect itself is never followed.
 */

/** GET `?q=` against this: the destination is FIXED, only the query varies. */
export const DUCKDUCKGO_ENDPOINT = 'https://html.duckduckgo.com/html/'

/**
 * Identifies TALOS honestly to a page it reads without an agreement — the
 * same courtesy the desktop port extends, and the reason a request from a
 * phone is no less identifiable than one from a desktop.
 */
export const DUCKDUCKGO_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14) TALOS-Mobile/0.1 (+https://github.com/Ninozzz95/talos)'

function decodeEntitiesAndStripTags(value: unknown): string {
    return String(value ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/gi, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * The real destination is the `uddg` parameter of DuckDuckGo's own redirect,
 * not the `href` itself. Anything that is not http(s) once decoded is not a
 * citation — this is the same discipline as `usableUrl` in `searchSources.ts`,
 * kept as a local copy rather than an import so this module stays a leaf
 * with no dependency back onto the file that will depend on IT.
 */
function urlFromRedirect(href: unknown): string | null {
    const raw = String(href ?? '').replace(/&amp;/g, '&')
    const match = /[?&]uddg=([^&]+)/.exec(raw)
    let candidate: string
    try {
        candidate = match ? decodeURIComponent(match[1]!) : (raw.startsWith('//') ? `https:${raw}` : raw)
    } catch {
        return null
    }
    try {
        const url = new URL(candidate)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
    } catch {
        return null
    }
}

/**
 * Pure: HTML text to the results shape the rest of F1 already speaks. Never
 * throws — a third party can hand back anything, including no HTML at all.
 *
 * D7 parity (`searchSources.ts`): DuckDuckGo's results page carries no
 * publication date, so `publishedAt` is always null here — never guessed,
 * never today's date standing in for an absent one.
 */
export function parseDuckDuckGoHtml(html: unknown, maxResults = 8): {
    url: string
    title: string
    snippet: string
    publishedAt: string | null
}[] {
    const text = typeof html === 'string' ? html : ''
    if (text === '') return []
    const results: { url: string; title: string; snippet: string; publishedAt: string | null }[] = []
    const titlePattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    const snippets: string[] = []
    for (const match of text.matchAll(snippetPattern)) snippets.push(decodeEntitiesAndStripTags(match[1]))
    let index = 0
    const limit = Math.max(1, Math.min(20, Number(maxResults) || 8))
    for (const match of text.matchAll(titlePattern)) {
        const url = urlFromRedirect(match[1])
        const title = decodeEntitiesAndStripTags(match[2])
        const snippet = snippets[index] ?? ''
        index += 1
        if (!url || !title) continue
        results.push({ url, title, snippet, publishedAt: null })
        if (results.length >= limit) break
    }
    return results
}

/**
 * A block or CAPTCHA must read as a DIFFERENT outcome than "no results" —
 * one means the web has nothing, the other means the provider stopped us,
 * and conflating them is how a person concludes the web is silent when it is
 * really DuckDuckGo that refused.
 *
 * 403/429/202 are refusals regardless of body (202 is the exact status the
 * `ddgs` library itself raises `RatelimitException` on); a 200 with no
 * result markup that talks about an anomaly, a challenge or a bot is the
 * same refusal wearing a success status.
 */
export function looksLikeDuckDuckGoBlock(status: unknown, html: unknown): boolean {
    if (status === 403 || status === 429 || status === 202) return true
    const text = String(html ?? '').toLowerCase()
    return !/class="result__a"/.test(text) && /anomaly|captcha|challenge|unusual traffic|bot/.test(text)
}
