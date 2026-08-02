import type { TalosResearchBranch, TalosResearchSpend } from '@/lib/research/researchRun'

/**
 * Gathering what one line of enquiry is worth, and keeping it.
 *
 * R-3. The gathering itself is unremarkable — search, read the top results,
 * write down what they said. The decision that matters is that the EXTRACTED
 * TEXT IS KEPT, and it is the one thing in this phase nobody else does.
 *
 * Every research product on the market stores links. A link is a promise about
 * a page, and pages rot: they are edited, paywalled, moved, or simply switched
 * off. A dossier made of links degrades silently — the citations look fine
 * until someone clicks one — and it cannot be re-checked at all, because the
 * thing it cited is gone. Keeping the passage makes the dossier answerable a
 * year later, makes R12's re-verification possible, and is impossible to copy
 * for anyone whose product is a list of URLs.
 *
 * The other rule here is the one this project learned the hard way tonight: a
 * source that could not be read is RECORDED, never dropped. A collection that
 * quietly returns four sources instead of six looks like a thin topic rather
 * than a broken fetch, and the difference is the whole of whether the answer
 * can be trusted.
 */

export interface TalosResearchSource {
    readonly url: string
    readonly title: string
    /** What the SOURCE says, or null. Never today's date, never a guess. */
    readonly publishedAt: string | null
    /**
     * The readable text, as it was on the day it was read.
     *
     * This is the dossier. Everything downstream — the synthesis, the citation
     * check, the re-verification a year later — reads this and not the network.
     */
    readonly text: string
    /**
     * How much of the source is actually here. A snippet is what the search
     * engine showed; a page is what the page said. Stated because a claim
     * supported only by a snippet is weaker evidence, and hiding that would
     * make the two look alike.
     */
    readonly obtained: 'page' | 'snippet'
}

export interface TalosResearchUnreachable {
    readonly url: string
    readonly reason: string
}

export interface TalosResearchCollection {
    readonly branchId: string
    readonly query: string
    readonly sources: readonly TalosResearchSource[]
    /** Never silently empty: what could not be read is named. */
    readonly unreachable: readonly TalosResearchUnreachable[]
    /** MEASURED, not estimated. The plan guesses; the run counts. */
    readonly spend: TalosResearchSpend
}

export interface TalosResearchCollectorDeps {
    readonly search: (query: string, maxResults: number) => Promise<readonly {
        url: string
        title: string
        snippet: string
        publishedAt: string | null
    }[]>
    readonly read: (url: string) => Promise<{ title: string, text: string, publishedAt: string | null } | null>
}

/**
 * How much of one page is kept.
 *
 * A long article is tens of thousands of characters and a phone holds the whole
 * dossier in one database. Cut here rather than at synthesis time: what is kept
 * is what can be re-verified later, so the boundary belongs where the evidence
 * is stored and not where it happens to be read.
 */
const MAX_CHARS_PER_SOURCE = 20_000

/** Four characters to a token is the usual rule of thumb for prose. */
const CHARS_PER_TOKEN = 4

function trim(text: string): string {
    const squeezed = text.replace(/\s+/g, ' ').trim()
    return squeezed.length > MAX_CHARS_PER_SOURCE ? squeezed.slice(0, MAX_CHARS_PER_SOURCE) : squeezed
}

export async function talosResearchCollect(
    deps: TalosResearchCollectorDeps,
    branch: TalosResearchBranch,
): Promise<TalosResearchCollection> {
    const wanted = Math.max(1, branch.estimate.pages)
    const found = await deps.search(branch.question, wanted)

    const sources: TalosResearchSource[] = []
    const unreachable: TalosResearchUnreachable[] = []
    let pages = 0

    for (const result of found) {
        let extracted: { title: string, text: string, publishedAt: string | null } | null = null
        try {
            extracted = await deps.read(result.url)
        } catch (failure) {
            unreachable.push({
                url: result.url,
                reason: failure instanceof Error ? failure.message : 'unknown',
            })
        }

        if (extracted && extracted.text.trim().length > 0) {
            pages += 1
            sources.push({
                url: result.url,
                title: extracted.title || result.title,
                // The page's own date wins over the search engine's: one is the
                // publisher speaking, the other is an index guessing.
                publishedAt: extracted.publishedAt ?? result.publishedAt,
                text: trim(extracted.text),
                obtained: 'page',
            })
            continue
        }

        // Falling back to the snippet rather than dropping the source. A search
        // result that could not be opened still says something, and saying so
        // with `obtained: 'snippet'` is honest in a way that silence is not.
        if (!extracted && unreachable.every((entry) => entry.url !== result.url)) {
            unreachable.push({ url: result.url, reason: 'unreadable' })
        }
        if (result.snippet.trim().length > 0) {
            sources.push({
                url: result.url,
                title: result.title,
                publishedAt: result.publishedAt,
                text: trim(result.snippet),
                obtained: 'snippet',
            })
        }
    }

    const characters = sources.reduce((total, source) => total + source.text.length, 0)
    return {
        branchId: branch.id,
        query: branch.question,
        sources,
        unreachable,
        spend: {
            searches: 1,
            pages,
            // What was actually taken in, counted from the text that is here.
            tokens: Math.ceil(characters / CHARS_PER_TOKEN),
        },
    }
}
