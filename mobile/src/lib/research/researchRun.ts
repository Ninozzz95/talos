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

export type TalosResearchStatus =
    | 'planning'
    | 'awaiting_plan_approval'
    | 'collecting'
    | 'synthesising'
    | 'verifying'
    | 'done'
    | 'cancelled'
    | 'failed'

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
    if (run.status === 'cancelled' || run.status === 'done' || run.status === 'failed') return null
    return run.steps.find((step) => step.state === 'interrupted')
        ?? run.steps.find((step) => step.state === 'pending')
        ?? null
}
