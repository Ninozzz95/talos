/**
 * A research run that can be killed and picked up again.
 *
 * This is R-1, and the spec puts it first for a reason that survives contact
 * with the platform: on a phone the process WILL be killed. Doze stops it with
 * the screen off, `dataSync` foreground services get six hours in any
 * twenty-four and then a few seconds' warning, and this device's own vendor —
 * OnePlus, now on ColorOS — is documented as one of the most aggressive
 * background killers on the market, with the permissions a user grants being
 * reset by firmware updates.
 *
 * So being interrupted is not a failure mode here. It is the normal case, and
 * everything below is shaped by it.
 *
 * The shape is the one the field settled on for durable execution: an
 * append-only journal of what HAPPENED, with the current state derived by
 * replaying it — not a mutable object saved on top of itself. The difference
 * shows up exactly when it matters: a state overwritten in place tells you what
 * it thinks is true now, and a journal tells you a step finished before the
 * process died, which is the difference between paying for a search once and
 * paying for it twice.
 *
 * It also buys three things for free, and they are the reason this is worth
 * more than a `status` column: the run can be forked, it can be audited, and a
 * recorded run can be replayed as a test.
 *
 * What the competition does here is worth naming, because it is the one-up.
 * Stopping a Deep Research run on ChatGPT means starting it again from nothing;
 * its forums are full of runs stuck on "Researching…" with no recovery. They
 * can afford that: they run on a server. We cannot, and the constraint is what
 * produces the capability.
 *
 * Nothing in this file touches Android, the network, a database or a model. It
 * is arithmetic over a list, which is what makes it testable without a device —
 * and what lets the same run migrate to a server later (R1b), since a state
 * that serialises is a state that can move.
 */

export type TalosResearchDepth = 'quick' | 'deep' | 'exhaustive'

/**
 * `pause_requested` and `paused` are two states, not one, and the reason is the
 * money.
 *
 * A pause can arrive while a step is IN FLIGHT and already paid for. Throwing
 * that answer away to honour the word "pause" immediately would spend the
 * user's money for nothing, so the engine drains the step it has started,
 * commits it, and only then rests — the research of 2026-08-03 calls this
 * "drain then checkpoint". `pause_requested` is the interval in between: the
 * intention is recorded and no new step will be booked, but the safe point has
 * not been reached yet. Collapsing the two would make the screen lie in one
 * direction or the other.
 *
 * `paused` is NOT `cancelled`. Cancelled is terminal — Android's own WorkManager
 * has no PAUSED state and its CANCELLED cannot be resumed — so writing one when
 * the person asked for the other would throw away a research they had paid for.
 */
export type TalosResearchStatus =
    | 'planning'
    | 'awaiting_plan_approval'
    | 'collecting'
    | 'synthesising'
    | 'verifying'
    | 'pause_requested'
    | 'paused'
    | 'done'
    | 'cancelled'
    | 'failed'

/** The states from which nothing more will ever happen. */
export const TALOS_RESEARCH_TERMINAL: readonly TalosResearchStatus[] = Object.freeze([
    'done', 'cancelled', 'failed',
])

export function talosResearchIsTerminal(status: TalosResearchStatus): boolean {
    return TALOS_RESEARCH_TERMINAL.includes(status)
}

/** Stopped, but still owing work: the engine must not book, the run can resume. */
export function talosResearchIsResting(status: TalosResearchStatus): boolean {
    return status === 'paused' || status === 'pause_requested'
}

/** Where the run is executing. The whole point of R1b is that this can change. */
export type TalosResearchEngine = 'device' | 'cloud'

export type TalosResearchStepKind = 'search' | 'read' | 'synthesise' | 'verify'

/**
 * `interrupted` is not the same as `failed`, and the distinction is the feature.
 *
 * A failed step tried and could not; an interrupted one was still running when
 * the process was killed, so nobody knows whether it finished. The first is a
 * result, the second is a question — and only the second is worth retrying.
 */
export type TalosResearchStepState = 'pending' | 'running' | 'done' | 'failed' | 'interrupted'

/** Only ever what was actually observed. Estimates live on the branch. */
export interface TalosResearchSpend {
    readonly tokens: number
    readonly searches: number
    readonly pages: number
}

export const TALOS_RESEARCH_NO_SPEND: TalosResearchSpend = Object.freeze({
    tokens: 0,
    searches: 0,
    pages: 0,
})

export interface TalosResearchBranch {
    readonly id: string
    readonly question: string
    /** What the planner GUESSED. Never confused with what was spent. */
    readonly estimate: TalosResearchSpend
}

export interface TalosResearchStep {
    readonly id: string
    readonly branchId: string
    readonly kind: TalosResearchStepKind
    readonly state: TalosResearchStepState
    /** How many times this step has been started. Evidence, not identity. */
    readonly attempts: number
    readonly startedAt: string | null
    readonly finishedAt: string | null
    readonly spend: TalosResearchSpend
    /**
     * Where the payload lives — never the payload.
     *
     * A journal that carries a hundred kilobytes of page text per row is a
     * journal nobody can replay on a phone, and the text belongs in the vault
     * with everything else the app stores.
     */
    readonly resultRef: string | null
    readonly error: string | null
}

export interface TalosResearchRun {
    readonly id: string
    readonly sessionId: string
    readonly question: string
    readonly depth: TalosResearchDepth
    readonly engine: TalosResearchEngine
    readonly status: TalosResearchStatus
    /**
     * The label the list shows, when someone has chosen one. `null` means "use
     * the question" — which is the honest default, because the question IS the
     * name of a research until a person decides otherwise.
     */
    readonly title: string | null
    readonly plan: readonly TalosResearchBranch[]
    readonly steps: readonly TalosResearchStep[]
    readonly startedAt: string
    readonly updatedAt: string
}

export type TalosResearchEvent =
    | {
        readonly kind: 'run_started'
        readonly at: string
        readonly id: string
        readonly sessionId: string
        readonly question: string
        readonly depth: TalosResearchDepth
        readonly engine: TalosResearchEngine
    }
    | { readonly kind: 'plan_proposed', readonly at: string, readonly branches: readonly TalosResearchBranch[] }
    | { readonly kind: 'plan_approved', readonly at: string, readonly branches: readonly TalosResearchBranch[] }
    | {
        readonly kind: 'step_started'
        readonly at: string
        readonly stepId: string
        readonly branchId: string
        readonly stepKind: TalosResearchStepKind
    }
    | {
        readonly kind: 'step_finished'
        readonly at: string
        readonly stepId: string
        readonly spend: TalosResearchSpend
        readonly resultRef: string | null
    }
    | { readonly kind: 'step_failed', readonly at: string, readonly stepId: string, readonly error: string }
    /** The person asked to stop; a step may still be in flight. */
    | { readonly kind: 'run_pause_requested', readonly at: string }
    /** The safe point was reached: nothing is in flight and everything is committed. */
    | { readonly kind: 'run_paused', readonly at: string }
    | { readonly kind: 'run_resumed', readonly at: string }
    /**
     * A LABEL changed, never the question.
     *
     * `title` is what the list shows; `question` is the fact that was asked and
     * paid for, and it stays. Letting a rename overwrite it would detach the
     * research from the thing that generated it — and the export would then
     * carry a title that no longer traces to any prompt. `null` restores the
     * question as the label.
     */
    | { readonly kind: 'run_renamed', readonly at: string, readonly title: string | null }
    | { readonly kind: 'run_cancelled', readonly at: string }
    | { readonly kind: 'run_finished', readonly at: string }

/**
 * The name a step answers to, across every attempt at it.
 *
 * The literature derives this from run + activity + ATTEMPT NUMBER. The attempt
 * is deliberately left out here, because the two settings want opposite things.
 * There, the key separates attempts precisely so the second one runs. Here the
 * user is paying out of their own pocket — every search is money — so two
 * attempts at the same logical step must be recognisable as THE SAME, and a
 * provider that can deduplicate must be given the chance to. The attempt count
 * is recorded beside the step as evidence, never folded into its name.
 */
export function talosResearchIdempotencyKey(runId: string, stepId: string): string {
    return `${runId}:${stepId}`
}

function addSpend(left: TalosResearchSpend, right: TalosResearchSpend): TalosResearchSpend {
    return {
        tokens: left.tokens + right.tokens,
        searches: left.searches + right.searches,
        pages: left.pages + right.pages,
    }
}

/** What the run has actually cost so far, summed from the steps that ran. */
export function talosResearchSpent(run: TalosResearchRun): TalosResearchSpend {
    return run.steps.reduce((total, step) => addSpend(total, step.spend), TALOS_RESEARCH_NO_SPEND)
}

function replaceStep(
    steps: readonly TalosResearchStep[],
    stepId: string,
    change: (step: TalosResearchStep) => TalosResearchStep,
): readonly TalosResearchStep[] {
    return steps.map((step) => (step.id === stepId ? change(step) : step))
}

/**
 * One event, folded into the state.
 *
 * Events that make no sense against the state they arrive at are IGNORED rather
 * than throwing. A journal is read from storage after a kill, and the one thing
 * it must never do is refuse to load: a run that cannot be replayed is a run
 * whose paid-for work is lost, which is the exact failure this design exists to
 * prevent. Duplicates are the common case — an append that was written twice
 * because the process died between the write and the acknowledgement — and
 * double-counting one would report money that was never spent.
 */
export function talosResearchApply(
    run: TalosResearchRun | null,
    event: TalosResearchEvent,
): TalosResearchRun | null {
    if (event.kind === 'run_started') {
        // Only the first one. A repeated start would reset a run that has
        // already spent money.
        if (run) return run
        return {
            id: event.id,
            sessionId: event.sessionId,
            question: event.question,
            depth: event.depth,
            engine: event.engine,
            status: 'planning',
            title: null,
            plan: [],
            steps: [],
            startedAt: event.at,
            updatedAt: event.at,
        }
    }
    if (!run) return null

    const touched = (next: Partial<TalosResearchRun>): TalosResearchRun => ({
        ...run,
        ...next,
        updatedAt: event.at,
    })

    switch (event.kind) {
        case 'plan_proposed':
            return touched({ plan: event.branches, status: 'awaiting_plan_approval' })

        case 'plan_approved':
            // The approved branches, not the proposed ones: the user is allowed
            // to remove, add and reword, and what they approved is what runs.
            return touched({ plan: event.branches, status: 'collecting' })

        case 'step_started': {
            const existing = run.steps.find((step) => step.id === event.stepId)
            if (existing?.state === 'done') {
                // Already paid for. Starting it again is the mistake this whole
                // file exists to make impossible.
                return run
            }
            if (existing) {
                return touched({
                    steps: replaceStep(run.steps, event.stepId, (step) => ({
                        ...step,
                        state: 'running',
                        attempts: step.attempts + 1,
                        startedAt: event.at,
                        error: null,
                    })),
                })
            }
            return touched({
                steps: [...run.steps, {
                    id: event.stepId,
                    branchId: event.branchId,
                    kind: event.stepKind,
                    state: 'running',
                    attempts: 1,
                    startedAt: event.at,
                    finishedAt: null,
                    spend: TALOS_RESEARCH_NO_SPEND,
                    resultRef: null,
                    error: null,
                }],
            })
        }

        case 'step_finished': {
            const existing = run.steps.find((step) => step.id === event.stepId)
            if (!existing || existing.state === 'done') return run
            return touched({
                steps: replaceStep(run.steps, event.stepId, (step) => ({
                    ...step,
                    state: 'done',
                    finishedAt: event.at,
                    // Recorded once, on the transition. Adding to the previous
                    // figure would double-count a retried step that had already
                    // reported part of its cost.
                    spend: event.spend,
                    resultRef: event.resultRef,
                    error: null,
                })),
            })
        }

        case 'step_failed': {
            const existing = run.steps.find((step) => step.id === event.stepId)
            if (!existing || existing.state === 'done') return run
            return touched({
                steps: replaceStep(run.steps, event.stepId, (step) => ({
                    ...step,
                    state: 'failed',
                    finishedAt: event.at,
                    error: event.error,
                })),
            })
        }

        /**
         * Asking twice is not asking harder: the second request must not move a
         * run that has already reached the safe point back into "stopping".
         * And a run that has finished is not pausable at all — the journal is
         * read after a kill, and a stale request arriving late must not
         * resurrect a terminal run.
         */
        case 'run_pause_requested':
            if (talosResearchIsTerminal(run.status) || run.status === 'paused') return run
            return touched({ status: 'pause_requested' })

        case 'run_paused':
            if (talosResearchIsTerminal(run.status)) return run
            return touched({ status: 'paused' })

        /**
         * Back to collecting, which is where the resume point lives. Refused
         * from a terminal state for the same reason: cancelled means cancelled,
         * and a resume that reopened it would spend money on a run the person
         * ended.
         */
        case 'run_resumed':
            if (talosResearchIsTerminal(run.status)) return run
            return touched({ status: 'collecting' })

        case 'run_renamed': {
            // Whitespace is not a title. Blank restores the question, which is
            // also what "Restore the original title" writes.
            const title = event.title === null ? null : event.title.trim()
            return touched({ title: title === null || title.length === 0 ? null : title })
        }

        case 'run_cancelled':
            return touched({ status: 'cancelled' })

        case 'run_finished':
            return touched({ status: 'done' })

        default:
            return run
    }
}

/** The state of a run, from its whole history. Deterministic by construction. */
export function talosResearchReplay(events: readonly TalosResearchEvent[]): TalosResearchRun | null {
    return events.reduce<TalosResearchRun | null>(talosResearchApply, null)
}

/**
 * What the process could not tell us, worked out on the way back up.
 *
 * A step left `running` was in flight when the process was killed. Nothing
 * wrote that down, because the thing that would have written it is what died —
 * so it is inferred here, at the only moment anyone can: the next start. This
 * is why there is no `process_died` event; an event nobody is alive to append
 * is a lie in the journal.
 */
export function talosResearchRecover(run: TalosResearchRun, at: string): TalosResearchRun {
    if (!run.steps.some((step) => step.state === 'running')) return run
    return {
        ...run,
        steps: run.steps.map((step) => (
            step.state === 'running' ? { ...step, state: 'interrupted' as const } : step
        )),
        updatedAt: at,
    }
}

/**
 * The step to do next, or nothing.
 *
 * Interrupted steps come before untouched ones: finishing what was started
 * keeps the run's own order, and it is the step most likely to have already
 * been partly paid for.
 */
export function talosResearchNextStep(run: TalosResearchRun): TalosResearchStep | null {
    if (talosResearchIsTerminal(run.status)) return null
    // The pause is enforced HERE, in the one function that decides what to do
    // next, rather than at each call site that might forget. "No new step is
    // booked" is not advice to the engine — it is the engine having nothing to
    // book.
    if (talosResearchIsResting(run.status)) return null
    return run.steps.find((step) => step.state === 'interrupted')
        ?? run.steps.find((step) => step.state === 'pending')
        ?? null
}

/**
 * The name a branch's step answers to. Derived, never invented.
 *
 * A step id that came from a counter or a random source would be a new name on
 * every attempt, and a new name is a step nobody can recognise as already done
 * — which is how a resumed run pays twice for the same search.
 */
/**
 * How far along a run is — one definition, so nothing can disagree with itself.
 *
 * The synthesis is a step like any other and counts among the finished ones, so
 * a total taken from the plan alone announced "3 of 2" the moment the report was
 * written. It is added to the total once the run actually has such a step, and
 * not before: a denominator that counts work which may never be attempted is the
 * same lie in the other direction.
 */
export function talosResearchProgressOf(run: TalosResearchRun): { readonly done: number, readonly total: number } {
    return {
        done: run.steps.filter((step) => step.state === 'done').length,
        total: run.plan.length + (run.steps.some((step) => step.kind === 'synthesise') ? 1 : 0),
    }
}

export function talosResearchStepIdFor(branchId: string, kind: TalosResearchStepKind): string {
    return `${branchId}:${kind}`
}

/**
 * What still has to happen, from the PLAN rather than from the journal.
 *
 * The two answer different questions and both are needed. The journal records
 * what did happen; only the plan knows what was supposed to. A run that was
 * killed before its third branch ever started has nothing in the journal about
 * that branch — the work is missing, not recorded as missing — so asking the
 * journal alone would call the run finished.
 *
 * A branch is outstanding when its step is absent, interrupted or failed. Done
 * is done: it is never offered again, whatever else happened afterwards.
 */
export function talosResearchWorkLeft(
    run: TalosResearchRun,
    kind: TalosResearchStepKind = 'search',
): readonly TalosResearchBranch[] {
    // Terminal only. A paused run still OWES this work — saying otherwise would
    // draw an empty plan for something the person is about to resume, and is
    // the opposite question from "what should the engine do right now".
    if (talosResearchIsTerminal(run.status)) return []
    return run.plan.filter((branch) => {
        const step = run.steps.find((candidate) => candidate.id === talosResearchStepIdFor(branch.id, kind))
        return !step || step.state !== 'done'
    })
}
