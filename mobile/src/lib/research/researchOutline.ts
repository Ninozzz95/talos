import {
    talosResearchIsResting,
    talosResearchIsTerminal,
    talosResearchStepIdFor,
    type TalosResearchRun,
    type TalosResearchStepState,
} from '@/lib/research/researchRun'
import type { TalosResearchStanding } from '@/lib/research/researchCard'

/**
 * The document, before it exists.
 *
 * The visual research of 2026-08-03 asked one question no competitor answers:
 * what do you draw in the first half-second, when you know nothing yet? It
 * found no screenshot of that moment in any of the five products — the reviews
 * jump from the plan to a populated state and the marketing cuts the
 * transition. Which is convenient, because it means the answer here is ours.
 *
 * And the answer is that we DO know something. The plan was approved before a
 * penny was spent: its branches are the sections the report will have. So the
 * page opens on the document's own shape, with each section saying where it is
 * — rather than on a spinner, or, as it did until today, on nothing at all.
 *
 * Everything here is arithmetic over the run. No disk, no network: the first
 * frame cannot be late because there is nothing to wait for.
 */

export type TalosResearchPhase = 'planning' | 'collecting' | 'writing' | 'paused' | 'ended'

export interface TalosResearchSection {
    readonly id: string
    readonly question: string
    readonly state: TalosResearchStepState
}

/**
 * One section per branch, in the plan's own order.
 *
 * A branch with no step yet is `pending` rather than absent: the reader is being
 * shown what WILL happen, and hiding the parts that have not started would make
 * the document appear to grow out of nowhere.
 */
export function talosResearchOutline(run: TalosResearchRun): readonly TalosResearchSection[] {
    return run.plan.map((branch) => {
        const step = run.steps.find((candidate) => candidate.id === talosResearchStepIdFor(branch.id, 'search'))
        return { id: branch.id, question: branch.question, state: step?.state ?? 'pending' }
    })
}

/**
 * Where the run is, in words a person uses.
 *
 * Deliberately coarser than `status`: the journal distinguishes `collecting`
 * from `synthesising` from `verifying`, and a reader does not care which of the
 * three the machine calls itself — they care whether it is still gathering or
 * already writing. `writing` is derived from the synthesis step existing, not
 * from the status, because that is the fact that actually changed.
 */
export function talosResearchPhaseOf(run: TalosResearchRun): TalosResearchPhase {
    if (talosResearchIsTerminal(run.status)) return 'ended'
    if (talosResearchIsResting(run.status)) return 'paused'
    if (run.plan.length === 0) return 'planning'
    const synthesis = run.steps.find((step) => step.kind === 'synthesise')
    return synthesis && synthesis.state !== 'pending' ? 'writing' : 'collecting'
}

/**
 * How long it has been going, in seconds.
 *
 * From the run's own timestamps, never from a timer started when the screen
 * mounted: a research is watched from several places and outlives all of them,
 * so a duration owned by a component would restart every time someone looked.
 * A finished run measures to when it finished; a live one to now.
 */
export function talosResearchElapsedSeconds(run: TalosResearchRun, now: string): number {
    const started = Date.parse(run.startedAt)
    const until = Date.parse(talosResearchIsTerminal(run.status) ? run.updatedAt : now)
    if (!Number.isFinite(started) || !Number.isFinite(until)) return 0
    return Math.max(0, Math.round((until - started) / 1000))
}

/** `4 min 08 s`, or `38 s`. Tabular, and never a bare number of seconds past a minute. */
export function talosResearchDuration(seconds: number): string {
    if (seconds < 60) return `${seconds} s`
    const minutes = Math.floor(seconds / 60)
    return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`
}

/**
 * The evidence balance, present from the first frame with zeros in it.
 *
 * Shown before there is anything to count on purpose. It is the one number that
 * says what this product is for, and a page that reveals it only at the end
 * teaches the reader to look for something else in the meantime — which is
 * exactly how every competitor ends up leading with the source count.
 */
export const TALOS_RESEARCH_NO_STANDING: TalosResearchStanding = Object.freeze({
    total: 0,
    supported: 0,
    partial: 0,
    unsupported: 0,
    unchecked: 0,
})
