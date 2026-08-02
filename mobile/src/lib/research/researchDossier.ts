import type { TalosResearchCollection, TalosResearchSource } from '@/lib/research/researchCollector'

/**
 * The dossier as ONE thing that two readers can use.
 *
 * A branch's gathering has to serve a person browsing the Library and a
 * process that resumes hours later in a fresh instance with no memory of what
 * it collected. The obvious answers are both wrong. Two files — one prose, one
 * data — is two truths to keep in step, which is the defect this project has
 * paid for repeatedly. Re-parsing the prose is worse: it works until someone
 * changes a heading.
 *
 * So it is one document: readable text for the person and the search index,
 * with the structured record fenced at the end. Both are written from the same
 * object in the same breath, so they cannot drift, and the reader that needs
 * data never reads the prose.
 *
 * A dossier without the fence is not guessed at. It is reported as
 * unreadable — an old file, or one someone edited — because a synthesis built
 * from a hopeful parse would cite passages that were never checked.
 */

const FENCE_OPEN = '```talos-research-json'
const FENCE_CLOSE = '```'

/** What the fence carries. Versioned so a later shape can be recognised. */
interface TalosResearchDossierRecord {
    readonly version: 1
    readonly branchId: string
    readonly query: string
    readonly sources: readonly TalosResearchSource[]
    readonly unreachable: readonly { readonly url: string, readonly reason: string }[]
}

export function talosResearchDossierDocument(collection: TalosResearchCollection): string {
    const record: TalosResearchDossierRecord = {
        version: 1,
        branchId: collection.branchId,
        query: collection.query,
        sources: collection.sources,
        unreachable: collection.unreachable,
    }

    const prose = [
        `# ${collection.query}`,
        ...collection.sources.map((source) => [
            `## ${source.title}`,
            source.url,
            source.publishedAt ? `data dichiarata: ${source.publishedAt}` : 'data non dichiarata',
            source.obtained === 'snippet' ? '(solo estratto dal motore di ricerca)' : '',
            '',
            source.text,
        ].filter(Boolean).join('\n')),
        ...(collection.unreachable.length > 0
            ? ['## Non raggiungibili', ...collection.unreachable.map((entry) => `${entry.url} — ${entry.reason}`)]
            : []),
    ].join('\n\n')

    // The fence goes LAST so that a reader who stops early — a preview, a
    // snippet in search results — sees the prose and not a wall of JSON.
    return `${prose}\n\n${FENCE_OPEN}\n${JSON.stringify(record)}\n${FENCE_CLOSE}\n`
}

/**
 * Reads a dossier back, or admits it cannot.
 *
 * Returns null rather than a best effort. The caller is about to build a report
 * whose citations are checked against these passages: a half-recovered dossier
 * would produce claims verified against text that is not what was read.
 */
export function talosResearchParseDossier(document: string): TalosResearchCollection | null {
    const start = document.indexOf(FENCE_OPEN)
    if (start < 0) return null
    const from = start + FENCE_OPEN.length
    const end = document.indexOf(FENCE_CLOSE, from)
    if (end < 0) return null

    try {
        const parsed = JSON.parse(document.slice(from, end)) as TalosResearchDossierRecord
        if (parsed?.version !== 1 || !Array.isArray(parsed.sources)) return null
        return {
            branchId: String(parsed.branchId ?? ''),
            query: String(parsed.query ?? ''),
            sources: parsed.sources,
            unreachable: Array.isArray(parsed.unreachable) ? parsed.unreachable : [],
            // Spend is not carried here: it is already in the journal, which is
            // the only place it may be counted. A second copy would eventually
            // be added to the first.
            spend: { searches: 0, pages: 0, tokens: 0 },
        }
    } catch {
        return null
    }
}
