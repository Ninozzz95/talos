import type { TalosChatRepository } from '@/repositories/chatRepository'
import type { TalosRunKeeper } from '@/services/longRunKeeper'
import {
    talosResearchApply,
    talosResearchRecover,
    talosResearchReplay,
    talosResearchSpent,
    talosResearchStepIdFor,
    talosResearchWorkLeft,
    type TalosResearchBranch,
    type TalosResearchDepth,
    type TalosResearchEngine,
    type TalosResearchEvent,
    type TalosResearchRun,
    type TalosResearchSpend,
} from '@/lib/research/researchRun'

/**
 * The thing that actually runs a research run, and survives being killed.
 *
 * R-1 has no intelligence in it on purpose — the spec asks for "a fake run that
 * sleeps and resumes". What it does have is the shape everything later stands
 * on: every step is written to the journal the moment it ends, the foreground
 * service is held for exactly as long as work is happening, and starting up
 * looks at what was left half-done rather than assuming the last process
 * finished what it began.
 *
 * Nothing here holds state between calls. The run lives in the journal, and
 * that is what makes a killed process survivable — and, for free, what makes
 * the same run movable to a server later (R1b).
 */

/** What a step's work returns. R-1 sleeps; later phases search and read. */
export interface TalosResearchStepOutcome {
    readonly spend: TalosResearchSpend
    readonly resultRef: string | null
}

export interface TalosResearchRuntimeDeps {
    readonly repository: Pick<TalosChatRepository,
        'appendResearchEvent' | 'readResearchJournal' | 'upsertResearchRun' | 'listResearchRuns'>
    /** The foreground service, borrowed rather than rebuilt — see longRunKeeper. */
    readonly keeper: (title: string) => TalosRunKeeper
    readonly now: () => string
    readonly perform: (branch: TalosResearchBranch, run: TalosResearchRun) => Promise<TalosResearchStepOutcome>
}

export interface TalosResearchProgress {
    readonly run: TalosResearchRun
    readonly done: number
    readonly total: number
}

/**
 * Appends one event and keeps the derived state in step with it.
 *
 * The sequence number is the journal's length, so a write the process did not
 * live to hear about collides with `UNIQUE (run_id, seq)` on the next attempt
 * instead of being counted twice. A refusal is therefore not an error: it means
 * the entry is already there, which is exactly what we wanted.
 */
async function append(
    deps: TalosResearchRuntimeDeps,
    run: TalosResearchRun | null,
    event: TalosResearchEvent,
    seq: number,
): Promise<TalosResearchRun> {
    await deps.repository.appendResearchEvent({
        run_id: event.kind === 'run_started' ? event.id : run!.id,
        seq,
        kind: event.kind,
        at: event.at,
        payload_json: JSON.stringify(event),
    })
    const next = talosResearchApply(run, event)
    if (!next) throw new Error('TALOS_RESEARCH_EVENT_REJECTED')
    await deps.repository.upsertResearchRun({
        id: next.id,
        session_id: next.sessionId,
        question: next.question,
        depth: next.depth,
        engine: next.engine,
        status: next.status,
        started_at: next.startedAt,
        updated_at: next.updatedAt,
    })
    return next
}

async function journalOf(
    deps: TalosResearchRuntimeDeps,
    runId: string,
): Promise<{ run: TalosResearchRun | null, length: number }> {
    const entries = await deps.repository.readResearchJournal(runId)
    const events = entries.map((entry) => JSON.parse(entry.payload_json) as TalosResearchEvent)
    return { run: talosResearchReplay(events), length: entries.length }
}

export function createTalosResearchRuntime(deps: TalosResearchRuntimeDeps) {
    /**
     * Works through whatever the plan still owes, holding the service while it does.
     *
     * The keeper is engaged BEFORE the first step and released in `finally` on
     * every path including failure, because a notification that outlives the
     * work is a lie about what the phone is doing — and one that stops early
     * takes the protection away mid-run.
     */
    async function drive(
        runId: string,
        onProgress?: (progress: TalosResearchProgress) => void,
    ): Promise<TalosResearchRun> {
        const loaded = await journalOf(deps, runId)
        if (!loaded.run) throw new Error('TALOS_RESEARCH_RUN_UNKNOWN')

        // Anything left `running` belonged to a process that is no longer here.
        let run = talosResearchRecover(loaded.run, deps.now())
        let seq = loaded.length
        const total = run.plan.length
        const keeper = deps.keeper(run.question)

        try {
            for (;;) {
                const left = talosResearchWorkLeft(run)
                onProgress?.({ run, done: total - left.length, total })
                if (left.length === 0) break

                const branch = left[0]!
                const stepId = talosResearchStepIdFor(branch.id, 'search')
                keeper.engage(`${total - left.length + 1}/${total} · ${branch.question}`)

                run = await append(deps, run, {
                    kind: 'step_started',
                    at: deps.now(),
                    stepId,
                    branchId: branch.id,
                    stepKind: 'search',
                }, seq++)

                try {
                    const outcome = await deps.perform(branch, run)
                    run = await append(deps, run, {
                        kind: 'step_finished',
                        at: deps.now(),
                        stepId,
                        spend: outcome.spend,
                        resultRef: outcome.resultRef,
                    }, seq++)
                } catch (failure) {
                    run = await append(deps, run, {
                        kind: 'step_failed',
                        at: deps.now(),
                        stepId,
                        error: failure instanceof Error ? failure.message : 'unknown',
                    }, seq++)
                    // A failed step is a result, not a question: stop rather
                    // than spin. What was paid for stays paid for and readable.
                    return run
                }
            }
            run = await append(deps, run, { kind: 'run_finished', at: deps.now() }, seq++)
            onProgress?.({ run, done: total, total })
            return run
        } finally {
            keeper.release()
        }
    }

    return {
        /** Opens a run and does the work. The journal exists before any step does. */
        async start(input: {
            id: string
            sessionId: string
            question: string
            depth: TalosResearchDepth
            engine?: TalosResearchEngine
            branches: readonly TalosResearchBranch[]
        }, onProgress?: (progress: TalosResearchProgress) => void): Promise<TalosResearchRun> {
            const at = deps.now()
            let run = await append(deps, null, {
                kind: 'run_started',
                at,
                id: input.id,
                sessionId: input.sessionId,
                question: input.question,
                depth: input.depth,
                engine: input.engine ?? 'device',
            }, 0)
            run = await append(deps, run, {
                kind: 'plan_approved',
                at,
                branches: [...input.branches],
            }, 1)
            return drive(run.id, onProgress)
        },

        /** Picks a run up again. Safe to call on one that is already finished. */
        resume: drive,

        /**
         * Runs that were left half-done, newest first.
         *
         * Asked of the journal rather than of the listing row, because the row
         * says what the last living process believed and the journal says what
         * actually happened. A process killed mid-step never got to write
         * "failed", so only the journal can show the step still open.
         */
        async unfinished(): Promise<readonly TalosResearchRun[]> {
            const rows = await deps.repository.listResearchRuns()
            const runs: TalosResearchRun[] = []
            for (const row of rows) {
                const loaded = await journalOf(deps, row.id)
                if (!loaded.run) continue
                const recovered = talosResearchRecover(loaded.run, deps.now())
                if (talosResearchWorkLeft(recovered).length > 0) runs.push(recovered)
            }
            return runs
        },

        /** What a run has cost so far, from the steps that actually ran. */
        spent: talosResearchSpent,
    }
}
