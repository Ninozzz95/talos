import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import type { TalosExtractedPage } from '@/lib/search/pageExtract'
import type { TalosSearchResult } from '@/lib/search/searchSources'
import type { TalosWebArchiveReport } from '@/lib/search/webSourceArchive'

/**
 * F1 — the two tools the model actually calls.
 *
 * `web_search` asks the configured source for candidates; `web_read` fetches ONE
 * page and extracts it on the device. They are separate on purpose: the model
 * decides what is worth opening, and every open is a distinct, auditable act
 * rather than a side effect of searching. It is also what makes D6 enforceable —
 * a url pasted by the user is never fetched on its own; the model must ask, and
 * the gate answers.
 *
 * Both require `outbound` because a model-selected query or URL leaves the
 * device, and `write` because successful evidence is persisted as ordinary,
 * user-visible Library content. The central compound permission gate decides
 * before either source body runs.
 */
export interface TalosWebToolSources {
    search(query: string, maxResults: number): Promise<TalosSearchResult[]>
    read(url: string): Promise<TalosExtractedPage | null>
    /** Search snippets can ground an answer even when no page is opened. */
    rememberSearch(query: string, results: readonly TalosSearchResult[]): Promise<TalosWebArchiveReport>
    /** D5: every page read becomes a source of this chat's dossier. */
    remember(page: TalosExtractedPage): Promise<void>
}

const MAX_CONTENT = 8_000

function clip(text: string): string {
    return text.length <= MAX_CONTENT
        ? text
        : `${text.slice(0, MAX_CONTENT)}\n… truncated at ${MAX_CONTENT} characters.`
}

function offline(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return /TALOS_NETWORK_UNAVAILABLE|Failed to fetch|NetworkError|ENOTFOUND|ECONNREFUSED/i.test(message)
}

function archiveLine(report: TalosWebArchiveReport): string {
    if (report.policy === 'provider_retention_restricted') {
        return 'Library: the configured search provider’s retention rules do not allow TALOS to save these search results. Call web_read on every source used; directly fetched pages can be saved.'
    }
    if (report.failed > 0) {
        return report.saved > 0
            ? `Library: ${report.saved} source link${report.saved === 1 ? '' : 's'} saved; ${report.failed} could not be saved to the Library.`
            : 'Library: the source links could not be saved to the Library.'
    }
    if (report.saved > 0) {
        return `Library: ${report.saved} source link${report.saved === 1 ? '' : 's'} saved to the Library.`
    }
    return 'Library: no new source links were saved; all results were duplicates or invalid web addresses.'
}

/** Anything not http(s) is not a web page; it is a way into the device. */
function webUrl(value: string): string | null {
    try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
    } catch {
        return null
    }
}

export function createTalosWebTools(sources: TalosWebToolSources): TalosToolDefinition<never>[] {
    const search = defineTalosTool({
        name: 'web_search',
        title: 'Search the web',
        // The sentence "this requires outbound and write permission" used to be
        // here, and it cost a full day. A description goes TO THE MODEL, and a
        // model told that a tool needs permissions it cannot see will explain
        // the permissions to the user instead of calling the tool — which is
        // exactly what happened: web_search was offered, the policy said `ask`,
        // and the reply was a polite lecture about Settings. The model is not
        // the permission gate; the gate is, and it asks the user at call time.
        // A description says what a tool DOES.
        description: 'Search the web and return candidate pages with their title, url, a short snippet and the publication date the source reports. Call it whenever the answer depends on current information — if a confirmation is needed the user is asked at that moment, so never decline on the assumption that you lack permission. Then call web_read on the pages worth opening.',
        action: 'outbound',
        requiredActions: ['outbound', 'write'],
        input: z.object({
            query: z.string().min(1).describe('What to search for, in the language of the expected sources.'),
            maxResults: z.number().int().min(1).max(10).optional()
                .describe('How many candidates to return. Default 5.'),
        }),
        async run(input) {
            let results: TalosSearchResult[]
            try {
                results = await sources.search(input.query, input.maxResults ?? 5)
            } catch (error) {
                if (offline(error)) {
                    // D8: "offline" and "the web is empty" must never look the
                    // same. Told the first, the model can say it would look this
                    // up given a connection; told the second, it says it found
                    // nothing, which is a different and false claim.
                    return {
                        ok: false,
                        content: 'No network: the web could not be reached from this device. Answer from what you know and from the user\'s Library, and say that you could not check online.',
                    }
                }
                const detail = error instanceof Error ? error.message : String(error)
                return { ok: false, content: `The search failed: ${detail}` }
            }

            if (results.length === 0) {
                return { ok: true, content: `No results for "${input.query}".` }
            }

            let saved: string
            try {
                saved = archiveLine(await sources.rememberSearch(input.query, results))
            } catch {
                // The search itself succeeded. Preserve its evidence for this
                // round, but never make a failed local write look successful.
                saved = 'Library: the source links could not be saved to the Library.'
            }

            const lines = results.map((result, index) => [
                `${index + 1}. ${result.title || '(untitled)'}`,
                `   url: ${result.url}`,
                // D7: an absent date is stated, never omitted. A gap the model
                // cannot see is a gap the model fills in.
                `   published: ${result.publishedAt ?? 'date unknown'}`,
                result.snippet ? `   ${result.snippet}` : '',
            ].filter(Boolean).join('\n'))

            return {
                ok: true,
                content: clip([
                    `${results.length} results for "${input.query}".`,
                    'Dates are what each source reports; "date unknown" means the page declares none — do not assume it is recent.',
                    saved,
                    '',
                    ...lines,
                ].join('\n')),
                /*
                 * ⛔⛔ QUI HO AGGIUNTO UNA SCHEDA `fonti`, E L'HO TOLTA. 2026-08-14.
                 *
                 * Le fonti avevano GIÀ una casa: `TalosMobileSourcesChip`, il
                 * chip sotto la risposta che l'owner ha disegnato il 26/7. E la
                 * sua è migliore della mia: legge le favicon **da disco** — mai
                 * richieste alla rete, che è una promessa di privacy scritta nel
                 * suo commento — e apre nel browser interno, dove va ogni link
                 * di TALOS. La mia apriva una scheda esterna.
                 *
                 * ⇒ Avevo duplicato una funzione già fatta meglio, e sullo
                 * schermo le fonti comparivano DUE volte in due forme diverse.
                 * È la stessa cosa che l'owner mi aveva appena fatto notare
                 * sull'onda della dettatura: «non ha senso usare componenti
                 * diversi».
                 *
                 * Il buco vero era un altro: il chip vive solo nella lista dei
                 * messaggi, quindi **nell'assistente le fonti non si vedevano
                 * affatto**. La cura è montare quello, non farne un secondo.
                 */
            }
        },
    })

    const read = defineTalosTool({
        name: 'web_read',
        title: 'Read a web page',
        // Same repair as web_search above, and for the same reason.
        description: 'Download ONE web page and return its readable text, title, site and publication date. The page is fetched and extracted on this device. Call it on urls returned by web_search, or on a url the user has explicitly asked you to read — if a confirmation is needed the user is asked at that moment, so never decline on the assumption that you lack permission.',
        action: 'outbound',
        requiredActions: ['outbound', 'write'],
        input: z.object({
            url: z.string().min(1).describe('The full http(s) url of the page to read.'),
        }),
        async run(input) {
            const url = webUrl(input.url)
            if (!url) {
                return { ok: false, content: `Not a web address: "${input.url}". Only http and https can be read.` }
            }

            let page: TalosExtractedPage | null
            try {
                page = await sources.read(url)
            } catch (error) {
                if (offline(error)) {
                    return { ok: false, content: 'No network: that page could not be fetched from this device.' }
                }
                const detail = error instanceof Error ? error.message : String(error)
                return { ok: false, content: `The page could not be read: ${detail}` }
            }

            if (!page) {
                // Better to say so than to hand over the navigation menu: page
                // furniture in the context poisons every quote taken from it.
                return {
                    ok: false,
                    content: `No readable article at ${url} — it may be a search page, an app shell, or behind a paywall.`,
                }
            }

            // D5: it becomes a source of this chat, with its text, so the answer
            // stays auditable after the page changes or disappears. A failed
            // save does not erase a valid fetch, but it is no longer invisible.
            let saved = 'Library: the full page snapshot was saved.'
            try {
                await sources.remember(page)
            } catch {
                saved = 'Library: the page was read, but it could not be saved to the Library.'
            }

            return {
                ok: true,
                content: clip([
                    `title: ${page.title}`,
                    `url: ${page.url}`,
                    `site: ${page.siteName ?? 'unknown'}`,
                    `published: ${page.publishedAt ?? 'date unknown'}`,
                    page.byline ? `byline: ${page.byline}` : '',
                    saved,
                    '',
                    page.text,
                ].filter(Boolean).join('\n')),
            }
        },
    })

    return [search, read] as TalosToolDefinition<never>[]
}
