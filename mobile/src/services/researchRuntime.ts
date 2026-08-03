import type { TalosChatRepository } from '@/repositories/chatRepository'
import type { TalosRunKeeper } from '@/services/longRunKeeper'
import {
    talosResearchApply,
    talosResearchIsResting,
    talosResearchIsTerminal,
    talosResearchProgressOf,
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
        'appendResearchEvent' | 'readResearchJournal' | 'upsertResearchRun' | 'listResearchRuns' | 'deleteResearchRun'>
    /** The foreground service, borrowed rather than rebuilt — see longRunKeeper. */
    readonly keeper: (title: string) => TalosRunKeeper
    readonly now: () => string
    readonly perform: (branch: TalosResearchBranch, run: TalosResearchRun) => Promise<TalosResearchStepOutcome>
    /**
     * The last step, when there is one: read everything gathered and write the
     * report. Optional because R-1 had no such thing and the phases before this
     * one must keep working without it.
     *
     * It goes through the SAME journal as every other step, which is not a
     * detail: a synthesis killed halfway is picked up like anything else, and
     * one that finished is never paid for twice.
     */
    readonly synthesise?: (run: TalosResearchRun) => Promise<TalosResearchStepOutcome>
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

/** What was asked of a running research: keep it, or end it. */
export type TalosResearchStop = 'pause' | 'cancel'

/** One name for the last step, so a resumed run recognises it as already done. */
export const SYNTHESIS_STEP_ID = 'synthesis'
const SYNTHESIS_LABEL = 'sintesi'

export function createTalosResearchRuntime(deps: TalosResearchRuntimeDeps) {
    /**
     * Runs this process is driving right now, and what the person asked of them.
     *
     * The journal's `seq` is assigned by the WRITER, not the database — that is
     * what makes a duplicate append collide instead of double-charging. It also
     * means there can only ever be ONE writer per run at a time: a `pause()`
     * that appended on its own while `drive()` held its own counter would hand
     * both the same number and lose one of the two writes.
     *
     * So a stop asked of a running research is a request held HERE, and the
     * driver — the single writer — is what puts it in the journal. A stop asked
     * of a research nobody is driving is written directly, because then there is
     * no other writer to collide with.
     */
    const driving = new Set<string>()
    const stopping = new Map<string, TalosResearchStop>()

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

        /**
         * A run that is over is not driveable, and this is not a formality.
         *
         * Without it the loop found nothing left to do, fell straight through
         * to `run_finished`, and a CANCELLED research came back as "done" — the
         * ending rewritten by the act of looking at it. Reachable from an
         * ordinary tap: Resume on a run that was cancelled, or a stale
         * notification action.
         */
        if (talosResearchIsTerminal(run.status)) return run

        let seq = loaded.length
        const keeper = deps.keeper(run.title ?? run.question)
        driving.add(runId)

        try {
            // Picking a paused research back up is an EVENT, not a silent
            // change of mind: without it the journal would show a run that
            // collected sources while claiming to be resting, and the ledger of
            // what happened is the one thing here that has to be true.
            if (talosResearchIsResting(run.status)) {
                run = await append(deps, run, { kind: 'run_resumed', at: deps.now() }, seq++)
            }
            /**
             * "Drain then checkpoint", asked at every point where NOTHING is in
             * flight — and there are two of them, not one.
             *
             * A stop that lands mid-step lets that step finish and commit
             * first: the call is already sent and already paid for, and
             * discarding its answer to honour the word "pause" sooner would
             * spend the person's money for nothing.
             *
             * There is exactly ONE such point, and the tablet is what settled
             * it. A pause asked during the SYNTHESIS looked ignored, so the
             * obvious move was to add a second check before that step — but
             * between the loop breaking and the synthesis starting there is no
             * `await`, so nothing can arrive in the gap and the check was dead
             * code a mutation could delete without failing a thing. The real
             * gap was never here: a pause asked during the last step lets that
             * step finish, and when the last step IS the report there is
             * nothing left to not-do. That is drain-then-checkpoint working;
             * what was missing was saying so, which the station now does.
             */
            async function rest(): Promise<TalosResearchRun | null> {
                const asked = stopping.get(runId)
                if (!asked) return null
                stopping.delete(runId)
                run = await append(deps, run, { kind: 'run_pause_requested', at: deps.now() }, seq++)
                run = await append(deps, run, asked === 'cancel'
                    ? { kind: 'run_cancelled', at: deps.now() }
                    : { kind: 'run_paused', at: deps.now() }, seq++)
                onProgress?.({ run, ...talosResearchProgressOf(run) })
                return run
            }

            for (;;) {
                const stopped = await rest()
                if (stopped) return stopped

                const left = talosResearchWorkLeft(run)
                // Counted from the run, by the same function the station uses.
                // Two ways of working out the same number is how a report that
                // was finished came to be announced as "3 of 2".
                const progress = talosResearchProgressOf(run)
                onProgress?.({ run, ...progress })
                if (left.length === 0) break

                const branch = left[0]!
                const stepId = talosResearchStepIdFor(branch.id, 'search')
                keeper.engage(`${progress.done + 1}/${progress.total} · ${branch.question}`)

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
                    onProgress?.({ run, ...talosResearchProgressOf(run) })
                    return run
                }
            }
            if (deps.synthesise) {
                const done = run.steps.find((step) => step.id === SYNTHESIS_STEP_ID)?.state === 'done'
                if (!done) {
                    /**
                     * The synthesis reports like every other step.
                     *
                     * It did not, and it is the LONGEST one: the loop published
                     * progress only at its own top, so a screen watching a run
                     * sat frozen on the last branch count for the whole minute
                     * the report was being written, and then jumped straight to
                     * an ending. Owner 2026-08-03: «nessuna progress bar, da
                     * debug non prod ready». Half of that was this — there was
                     * nothing to draw a bar FROM.
                     */
                    keeper.engage(SYNTHESIS_LABEL)
                    run = await append(deps, run, {
                        kind: 'step_started',
                        at: deps.now(),
                        stepId: SYNTHESIS_STEP_ID,
                        branchId: SYNTHESIS_STEP_ID,
                        stepKind: 'synthesise',
                    }, seq++)
                    onProgress?.({ run, ...talosResearchProgressOf(run) })
                    try {
                        const outcome = await deps.synthesise(run)
                        run = await append(deps, run, {
                            kind: 'step_finished',
                            at: deps.now(),
                            stepId: SYNTHESIS_STEP_ID,
                            spend: outcome.spend,
                            resultRef: outcome.resultRef,
                        }, seq++)
                        onProgress?.({ run, ...talosResearchProgressOf(run) })
                    } catch (failure) {
                        run = await append(deps, run, {
                            kind: 'step_failed',
                            at: deps.now(),
                            stepId: SYNTHESIS_STEP_ID,
                            error: failure instanceof Error ? failure.message : 'unknown',
                        }, seq++)
                        // The gathering is not thrown away because the writing
                        // failed: what was collected is on disk and paid for,
                        // and a retry starts from the report, not the search.
                        // Reported before returning, or the screen keeps the
                        // last cheerful count it was given and never learns.
                        onProgress?.({ run, ...talosResearchProgressOf(run) })
                        return run
                    }
                }
            }
            run = await append(deps, run, { kind: 'run_finished', at: deps.now() }, seq++)
            onProgress?.({ run, ...talosResearchProgressOf(run) })
            return run
        } finally {
            driving.delete(runId)
            // A stop that outlived its run would fire at the head of the NEXT
            // drive and stop a research the person had just asked to continue.
            stopping.delete(runId)
            keeper.release()
        }
    }

    /**
     * Stop a research, without pretending the two words mean the same thing.
     *
     * `pause` leaves it resumable and owing its remaining work; `cancel` is
     * terminal. Android's own scheduler has no pause at all — WorkManager's
     * CANCELLED cannot be resumed — so writing one for the other would throw
     * away a research that had been paid for.
     */
    async function requestStop(runId: string, mode: TalosResearchStop): Promise<TalosResearchRun> {
        const loaded = await journalOf(deps, runId)
        if (!loaded.run) throw new Error('TALOS_RESEARCH_RUN_UNKNOWN')
        // Already over: a stale notification action arriving after the fact
        // must not rewrite the ending.
        if (talosResearchIsTerminal(loaded.run.status)) return loaded.run

        if (driving.has(runId)) {
            // The driver is the single writer. Record the intention and let it
            // land at the next safe point — see the note in `drive`.
            stopping.set(runId, mode)
            return talosResearchApply(loaded.run, { kind: 'run_pause_requested', at: deps.now() }) ?? loaded.run
        }

        // Nobody is driving, so nothing is in flight and there is nothing to
        // drain: this IS the safe point.
        let run = loaded.run
        let seq = loaded.length
        run = await append(deps, run, mode === 'cancel'
            ? { kind: 'run_cancelled', at: deps.now() }
            : { kind: 'run_paused', at: deps.now() }, seq++)
        return run
    }

    return {
        /**
         * Writes the research into existence, and stops there.
         *
         * Separate from driving it because the caller needs to hand out an
         * ADDRESS. Owner 2026-08-03: starting a research landed on "questa
         * ricerca non esiste più" and stayed there. It was true when the page
         * asked — the controller returned the id as soon as the work was
         * *scheduled*, and `run_started` had not been written yet, so the page
         * asked the journal for something that did not exist for another
         * moment. Awaiting the whole run instead is not the fix either: that
         * was the old bug where leaving the screen ended the research.
         *
         * So: open, which resolves when the run is REAL, then drive.
         */
        async open(input: {
            id: string
            sessionId: string
            question: string
            depth: TalosResearchDepth
            engine?: TalosResearchEngine
            branches: readonly TalosResearchBranch[]
        }): Promise<TalosResearchRun> {
            const at = deps.now()
            const started = await append(deps, null, {
                kind: 'run_started',
                at,
                id: input.id,
                sessionId: input.sessionId,
                question: input.question,
                depth: input.depth,
                engine: input.engine ?? 'device',
            }, 0)
            return append(deps, started, {
                kind: 'plan_approved',
                at,
                branches: [...input.branches],
            }, 1)
        },

        /** Opens a run and does the work. The journal exists before any step does. */
        async start(input: {
            id: string
            sessionId: string
            question: string
            depth: TalosResearchDepth
            engine?: TalosResearchEngine
            branches: readonly TalosResearchBranch[]
        }, onProgress?: (progress: TalosResearchProgress) => void): Promise<TalosResearchRun> {
            const run = await this.open(input)
            return drive(run.id, onProgress)
        },

        /** Picks a run up again. Safe to call on one that is already finished. */
        resume: drive,

        /** Stop, keep everything, come back later. */
        pause(runId: string): Promise<TalosResearchRun> {
            return requestStop(runId, 'pause')
        },

        /** Stop for good. What was collected stays readable; nothing more is bought. */
        cancel(runId: string): Promise<TalosResearchRun> {
            return requestStop(runId, 'cancel')
        },

        /**
         * Change the LABEL. The question stays.
         *
         * Renaming is safe to write at any time, running or not — but it still
         * goes through the journal rather than the listing row, because the row
         * holds what the last living process believed and the journal is what
         * the run actually is. `null` restores the question as the label.
         */
        async rename(runId: string, title: string | null): Promise<TalosResearchRun> {
            const loaded = await journalOf(deps, runId)
            if (!loaded.run) throw new Error('TALOS_RESEARCH_RUN_UNKNOWN')
            return append(deps, loaded.run, { kind: 'run_renamed', at: deps.now(), title }, loaded.length)
        },

        /**
         * Remove a research and everything it wrote.
         *
         * Refused while this process is driving it: deleting the journal from
         * under the single writer would leave it appending to a run that no
         * longer exists, and — worse — a step already sent to a provider would
         * lose the only record that says it was paid for. Stop it first.
         */
        async remove(runId: string): Promise<readonly string[]> {
            if (driving.has(runId)) throw new Error('TALOS_RESEARCH_RUN_BUSY')
            return deps.repository.deleteResearchRun(runId)
        },

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
                // A run someone PAUSED is not unfinished business to be picked
                // back up: they stopped it on purpose, and offering it here is
                // how an automatic resume spends money they chose not to spend.
                if (talosResearchIsResting(recovered.status)) continue
                // Branches left, OR a run that never reached `run_finished`.
                // The second is not redundant: a run killed during the SYNTHESIS
                // has every branch done and would otherwise read as complete,
                // which would quietly throw away the gathering it paid for.
                const open = !talosResearchIsTerminal(recovered.status)
                if (talosResearchWorkLeft(recovered).length > 0 || open) runs.push(recovered)
            }
            return runs
        },

        /**
         * Every run, newest first, each replayed from its own journal.
         *
         * The listing row exists to make this cheap to ENUMERATE, never to
         * answer questions about a run: it holds what the last living process
         * believed. What is shown comes from the journal.
         */
        async all(): Promise<readonly TalosResearchRun[]> {
            const rows = await deps.repository.listResearchRuns()
            const runs: TalosResearchRun[] = []
            for (const row of rows) {
                const loaded = await journalOf(deps, row.id)
                if (loaded.run) runs.push(talosResearchRecover(loaded.run, deps.now()))
            }
            return runs
        },

        /** What a run has cost so far, from the steps that actually ran. */
        spent: talosResearchSpent,
    }
}
