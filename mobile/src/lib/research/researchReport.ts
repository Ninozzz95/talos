import type { TalosResearchSource } from '@/lib/research/researchCollector'
import {
    talosResearchVerifiedStanding,
    type TalosResearchChecks,
    type TalosResearchVerifiedClaim,
} from '@/lib/research/researchVerification'

/**
 * The report, written once for two readers — and carrying its own verdict.
 *
 * Same decision as the dossier, for the same reason: prose for a person, a
 * fenced record for the process, both written from one object so they cannot
 * drift. What is new is WHAT the record holds. Every claim carries its passage,
 * where that passage sits in the kept source text, the verdict, and the name of
 * the judge who gave it.
 *
 * That is the structural bet of this phase. Everyone can verify while writing;
 * verification then evaporates, and a month later the reader has a report and no
 * way to ask how it was checked. Because we keep the passage AND the verdict AND
 * the judge, the check is an artefact: it can be re-read, re-run by a different
 * judge, and compared with what it said the first time. A product that stores
 * URLs cannot do that at any price, because the evidence it checked is gone.
 *
 * The prose is layered top-down — answer, then claims, then sources — because
 * 5,000 words in a column on a phone is a wall, and because the layering has to
 * survive being read as a plain Markdown file outside the app.
 */

export interface TalosResearchReportSourceRecord {
    readonly url: string
    readonly title: string
    readonly publishedAt: string | null
    readonly obtained: 'page' | 'snippet'
}

export interface TalosResearchReportClaimRecord {
    readonly text: string
    readonly sourceIndex: number
    /** The passage as it is in the source. Empty when it was never found there. */
    readonly passage: string
    readonly checks: TalosResearchChecks
}

export interface TalosResearchReportRecord {
    readonly version: 1
    readonly question: string
    readonly summary: string
    /**
     * Who was available to judge this run, or null if nobody was.
     *
     * Recorded here rather than worked out from the claims, because those are
     * two different facts and inferring one from the other tells a lie in a real
     * case: a run with a perfectly good judge whose every citation failed the
     * mechanical check has no per-claim judge either, and would have read as
     * "no independent judge was available". Never verified and never needed
     * verifying must not look the same.
     */
    readonly judge: string | null
    readonly claims: readonly TalosResearchReportClaimRecord[]
    readonly sources: readonly TalosResearchReportSourceRecord[]
}

const FENCE_OPEN = '```talos-research-report'
const FENCE_CLOSE = '```'

/** How a verdict reads to a person. Words, not symbols: this file is read outside the app too. */
export function talosResearchSupportLabel(checks: TalosResearchChecks): string {
    switch (checks.claimSupported) {
        case 'yes': return 'sostenuta dalla fonte'
        case 'partial': return 'sostenuta solo in parte'
        case 'no': return 'NON sostenuta dalla fonte'
        // ⛔ CONTESA-01: la parola dice anche PERCHÉ, se no «contesa» da sola
        // si legge come una sfumatura di «parziale», che è ciò che non è.
        case 'contested': return 'contesa — le fonti non concordano'
        default: return 'non verificata'
    }
}

export function talosResearchReportDocument(input: {
    readonly question: string
    readonly summary: string
    /** The judge chosen for this run, or null if none was available. */
    readonly judge: string | null
    readonly claims: readonly TalosResearchVerifiedClaim[]
    readonly sources: readonly TalosResearchSource[]
}): string {
    const standing = talosResearchVerifiedStanding(input.claims)

    const record: TalosResearchReportRecord = {
        version: 1,
        question: input.question,
        summary: input.summary,
        judge: input.judge,
        claims: input.claims.map((entry) => ({
            text: entry.claim.text,
            sourceIndex: entry.claim.sourceIndex,
            passage: entry.passage,
            checks: entry.checks,
        })),
        sources: input.sources.map((source) => ({
            url: source.url,
            title: source.title,
            publishedAt: source.publishedAt,
            obtained: source.obtained,
        })),
    }

    const verdictLine = [
        `Affermazioni: ${standing.total}`,
        `sostenute: ${standing.supported}`,
        `in parte: ${standing.partial}`,
        `non sostenute: ${standing.unsupported}`,
        `non verificate: ${standing.unchecked}`,
    ].join(' · ')

    const prose = [
        `# ${input.question}`,
        '',
        input.summary,
        '',
        verdictLine,
        input.judge
            ? `Verifica eseguita da: ${input.judge} — mai dal modello che ha scritto il rapporto.`
            : 'Verifica non eseguita: nessun giudice indipendente era disponibile.',
        '',
        '## Le affermazioni',
        ...input.claims.map((entry, index) => {
            const source = input.sources[entry.claim.sourceIndex - 1]
            return [
                '',
                `### ${index + 1}. ${entry.claim.text}`,
                `Esito: ${talosResearchSupportLabel(entry.checks)}${entry.checks.supportReason ? ` — ${entry.checks.supportReason}` : ''}`,
                entry.passage
                    ? `\n> ${entry.passage}`
                    : `\n> (il passaggio citato non è nel testo della fonte: "${entry.claim.quote}")`,
                '',
                source
                    ? `Fonte: ${source.title} — ${source.url}${source.obtained === 'snippet' ? ' (solo estratto dal motore di ricerca)' : ''}`
                    : 'Fonte: citata ma mai raccolta.',
            ].join('\n')
        }),
        '',
        `## Fonti (${input.sources.length})`,
        ...input.sources.map((source, index) => [
            `${index + 1}. ${source.title} — ${source.url}`,
            `   ${source.publishedAt ? `data dichiarata: ${source.publishedAt}` : 'data non dichiarata'}`,
            `   ${source.obtained === 'page' ? 'pagina letta' : 'solo estratto dal motore di ricerca'}`,
        ].join('\n')),
    ].join('\n')

    return `${prose}\n\n${FENCE_OPEN}\n${JSON.stringify(record)}\n${FENCE_CLOSE}\n`
}

/**
 * Reads a report back, or admits it cannot.
 *
 * Null rather than a partial recovery, for the reason that runs through this
 * whole phase: a half-read report would show verdicts next to claims they do not
 * belong to, and a wrong verification mark is worse than none.
 */
export function talosResearchParseReport(document: string): TalosResearchReportRecord | null {
    const start = document.indexOf(FENCE_OPEN)
    if (start < 0) return null
    const from = start + FENCE_OPEN.length
    const end = document.indexOf(FENCE_CLOSE, from)
    if (end < 0) return null

    try {
        const parsed = JSON.parse(document.slice(from, end)) as TalosResearchReportRecord
        if (parsed?.version !== 1 || !Array.isArray(parsed.claims) || !Array.isArray(parsed.sources)) return null
        return { ...parsed, judge: parsed.judge ?? null }
    } catch {
        return null
    }
}
