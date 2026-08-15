import {
    talosResearchIsTerminal,
    talosResearchStepIdFor,
    type TalosResearchRun,
    type TalosResearchStepState,
} from '@/lib/research/researchRun'

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
 * When a finished run actually finished.
 *
 * NOT `updatedAt`, which is stamped by every event the journal accepts — a
 * rename among them. A research done in four minutes yesterday and renamed
 * today would otherwise read «conclusa in 1 giorno», and the page would be
 * quoting the moment you retitled it as the moment it stopped thinking.
 *
 * The last step to report a finish is the real end. A run cancelled before any
 * step finished has none, and there `updatedAt` is the best there is.
 */
function endedAt(run: TalosResearchRun): string {
    let last: string | null = null
    for (const step of run.steps) {
        if (step.finishedAt && (last === null || step.finishedAt > last)) last = step.finishedAt
    }
    return last ?? run.updatedAt
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
    const until = Date.parse(talosResearchIsTerminal(run.status) ? endedAt(run) : now)
    if (!Number.isFinite(started) || !Number.isFinite(until)) return 0
    return Math.max(0, Math.round((until - started) / 1000))
}

/** `4 min 08 s`, or `38 s`. Tabular, and never a bare number of seconds past a minute. */
export function talosResearchDuration(seconds: number): string {
    if (seconds < 60) return `${seconds} s`
    const minutes = Math.floor(seconds / 60)
    return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`
}
