import type { TalosResearchRun } from '@/lib/research/researchRun'
import { talosResearchProgressOf } from '@/lib/research/researchRun'

/**
 * What a research looks like from the outside, before you open it.
 *
 * The station used to be a form with a list of expandable rows underneath, and
 * the rows said `3/3 · done`. That is the machine's view. This is the reader's:
 * what did I ask, when, how did it end, and — when it ended — **how well does
 * it hold up**.
 *
 * The last part is the whole argument. The competitor research (2026-08-03)
 * found that all five products lead with volume — "56 siti", "hundreds of
 * sources" — and none of them says whether the claims stood. Its own conclusion
 * is that the win is not more citations, it is a better account of the relation
 * between claim and evidence. So a card here leads with the balance and never
 * with the source count.
 *
 * Pure on purpose: a card is a summary, and a summary that needs a database is
 * a summary you cannot test.
 */

/** The buckets the filter offers. One run is in exactly one. */
export type TalosResearchBucket = 'running' | 'unfinished' | 'done' | 'failed'

export interface TalosResearchStanding {
    readonly total: number
    readonly supported: number
    readonly partial: number
    readonly unsupported: number
    readonly unchecked: number
}

export interface TalosResearchCard {
    readonly id: string
    readonly question: string
    readonly startedAt: string
    readonly updatedAt: string
    readonly bucket: TalosResearchBucket
    readonly done: number
    readonly total: number
    /** Branches that failed, so a card can admit a partial result instead of hiding it. */
    readonly failedSteps: number
    /** Present only once the report has been read; the list does not wait for it. */
    readonly standing: TalosResearchStanding | null
}

/**
 * Which bucket a run is in.
 *
 * `running` is decided by the LIVE registry, not by the journal: a run the
 * journal calls unfinished may be in flight right now, and calling it
 * interrupted while it is working is the exact lie this refactor set out to
 * remove. The journal answers "what has been written", never "what is
 * happening".
 */
export function talosResearchBucketOf(
    run: TalosResearchRun,
    isRunning: boolean,
): TalosResearchBucket {
    if (isRunning) return 'running'
    if (run.status === 'failed') return 'failed'
    if (run.status === 'done') return 'done'
    // Everything else — planning, collecting, synthesising, verifying, cancelled
    // — is work that stopped without finishing. One bucket, because from the
    // reader's side they are the same situation: it owes something and nothing
    // is happening.
    return 'unfinished'
}

export function talosResearchCardOf(
    run: TalosResearchRun,
    options: { isRunning: boolean; standing?: TalosResearchStanding | null },
): TalosResearchCard {
    const progress = talosResearchProgressOf(run)
    return {
        id: run.id,
        question: run.question,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
        bucket: talosResearchBucketOf(run, options.isRunning),
        done: progress.done,
        total: progress.total,
        failedSteps: run.steps.filter((step) => step.state === 'failed').length,
        standing: options.standing ?? null,
    }
}

/**
 * How well a finished report holds up, as one number between 0 and 1.
 *
 * Partial support counts half. Not a hedge: a claim the source backs in part is
 * genuinely between the two, and rounding it up to "supported" is how a report
 * ends up looking stronger than it is — which is the failure mode the whole
 * verification exists to prevent. Unchecked counts as zero for the same reason:
 * "we could not check" is not a pass.
 */
export function talosResearchSolidity(standing: TalosResearchStanding | null): number | null {
    if (!standing || standing.total === 0) return null
    return (standing.supported + (standing.partial * 0.5)) / standing.total
}

/**
 * Whether a finished report deserves a second look.
 *
 * Anything unsupported at all, or a solidity under two thirds. The threshold is
 * a judgement and it is written down here rather than scattered through a
 * template, so it can be argued with in one place.
 */
export function talosResearchNeedsAttention(card: TalosResearchCard): boolean {
    if (card.failedSteps > 0) return true
    if (!card.standing) return false
    if (card.standing.unsupported > 0) return true
    const solidity = talosResearchSolidity(card.standing)
    return solidity !== null && solidity < 2 / 3
}

/**
 * The report file the synthesis wrote, when there is one to read.
 *
 * Lives here rather than in each screen: the list, the report page, the claim
 * page and the source page all need it, and four copies of the same `find` is
 * how they start disagreeing about what counts as finished.
 */
export function talosResearchReportRefOf(run: TalosResearchRun): string | null {
    const synthesis = run.steps.find((step) => step.kind === 'synthesise' && step.state === 'done')
    return synthesis?.resultRef ?? null
}

/** The filter, applied. `all` is a bucket the UI offers and the data never has. */
export function talosResearchFilterCards(
    cards: readonly TalosResearchCard[],
    bucket: TalosResearchBucket | 'all',
    query: string,
): readonly TalosResearchCard[] {
    const needle = query.trim().toLowerCase()
    return cards.filter((card) => {
        if (bucket !== 'all' && card.bucket !== bucket) return false
        if (needle.length === 0) return true
        return card.question.toLowerCase().includes(needle)
    })
}
