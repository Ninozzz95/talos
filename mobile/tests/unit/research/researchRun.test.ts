import { describe, expect, it } from 'vitest'
import {
    talosResearchApply,
    talosResearchIdempotencyKey,
    talosResearchNextStep,
    talosResearchProgressOf,
    talosResearchRecover,
    talosResearchReplay,
    talosResearchSpent,
    talosResearchWorkLeft,
    type TalosResearchEvent,
} from '@/lib/research/researchRun'

const T0 = '2026-08-02T00:00:00.000Z'
const T1 = '2026-08-02T00:00:10.000Z'
const T2 = '2026-08-02T00:00:20.000Z'
const T3 = '2026-08-02T00:00:30.000Z'

const started: TalosResearchEvent = {
    kind: 'run_started',
    at: T0,
    id: 'run-1',
    sessionId: 'chat-9',
    question: 'quale tablet conviene',
    depth: 'deep',
    engine: 'device',
}

const approved: TalosResearchEvent = {
    kind: 'plan_approved',
    at: T0,
    branches: [{ id: 'b1', question: 'prezzi attuali', estimate: { tokens: 9000, searches: 3, pages: 5 } }],
}

function search(stepId: string, at: string): TalosResearchEvent {
    return { kind: 'step_started', at, stepId, branchId: 'b1', stepKind: 'search' }
}

function finished(stepId: string, at: string, searches = 1, tokens = 1200): TalosResearchEvent {
    return { kind: 'step_finished', at, stepId, spend: { tokens, searches, pages: 0 }, resultRef: `vault:${stepId}` }
}

describe('a research run that is killed and picked up again', () => {
    it('is the same state however many times its history is replayed', () => {
        const journal = [started, approved, search('s1', T1), finished('s1', T2)]

        // Determinism is not a nicety here: the state is not stored, it is
        // DERIVED, so a replay that drifted would quietly change what the run
        // believes it has already paid for.
        expect(talosResearchReplay(journal)).toEqual(talosResearchReplay(journal))
    })

    /**
     * THE test this design exists for.
     *
     * The process is killed between a search finishing and anything else
     * happening. On the way back up the run must not offer that search again:
     * it was paid for. Stopping a Deep Research run on ChatGPT means starting
     * over from nothing — that is the behaviour this refuses.
     */
    it('never offers a step that already finished, however the process died', () => {
        const run = talosResearchReplay([started, approved, search('s1', T1), finished('s1', T2)])!

        const recovered = talosResearchRecover(run, T3)

        expect(recovered.steps[0].state).toBe('done')
        expect(talosResearchNextStep(recovered)).toBeNull()
        expect(talosResearchSpent(recovered)).toEqual({ tokens: 1200, searches: 1, pages: 0 })
    })

    it('offers again the step that was still running, and says it is a retry', () => {
        // Started and never finished: nobody knows whether the provider answered.
        const run = talosResearchReplay([started, approved, search('s1', T1)])!

        const recovered = talosResearchRecover(run, T2)
        const next = talosResearchNextStep(recovered)

        expect(recovered.steps[0].state).toBe('interrupted')
        expect(next?.id).toBe('s1')
        // The count is evidence of what happened, and it must NOT change the
        // step's name — see the key below.
        expect(next?.attempts).toBe(1)
    })

    it('calls a retried step by the same name, so a provider can deduplicate it', () => {
        const first = talosResearchIdempotencyKey('run-1', 's1')
        const afterRetry = talosResearchIdempotencyKey('run-1', 's1')

        // Deliberately NOT run+step+attempt, which is what the durable-execution
        // literature recommends. There the key separates attempts so the second
        // one runs; here the user pays per search out of their own pocket, so
        // two attempts at one logical step must be recognisable as the same
        // thing. Documented as a divergence, not an oversight.
        expect(afterRetry).toBe(first)
        expect(talosResearchIdempotencyKey('run-1', 's2')).not.toBe(first)
        expect(talosResearchIdempotencyKey('run-2', 's1')).not.toBe(first)
    })

    /**
     * Journals get duplicates. A row is appended, the process dies before the
     * acknowledgement, and the write is replayed on the next boot. Counting
     * that twice would report money the user never spent — and the number is
     * shown to them, so it has to be true.
     */
    it('does not charge twice for a step whose completion was recorded twice', () => {
        const once = talosResearchReplay([started, approved, search('s1', T1), finished('s1', T2)])!
        const twice = talosResearchReplay([
            started, approved, search('s1', T1), finished('s1', T2), finished('s1', T3),
        ])!

        expect(talosResearchSpent(twice)).toEqual(talosResearchSpent(once))
        expect(twice.steps).toHaveLength(1)
    })

    it('refuses to restart a run that has already spent money', () => {
        const run = talosResearchReplay([started, approved, search('s1', T1), finished('s1', T2), started])!

        // A repeated `run_started` — the shape a duplicated first write takes —
        // must not wipe the plan and the receipts.
        expect(run.steps).toHaveLength(1)
        expect(talosResearchSpent(run).tokens).toBe(1200)
    })

    it('ignores a step that finished after the run was already done', () => {
        const run = talosResearchReplay([
            started, approved, search('s1', T1), finished('s1', T2), finished('s1', T3),
        ])!

        const late = talosResearchApply(run, { kind: 'step_failed', at: T3, stepId: 's1', error: 'timeout' })

        // It finished. A late failure for the same step is noise from a retry
        // that lost the race, not a reason to throw away a paid-for result.
        expect(late?.steps[0].state).toBe('done')
        expect(late?.steps[0].resultRef).toBe('vault:s1')
    })

    it('survives a history it cannot make sense of instead of refusing to load', () => {
        // A step event with no matching step: the run must still replay. A
        // journal that will not load is a run whose paid work is lost, which is
        // worse than an event quietly ignored.
        const run = talosResearchReplay([started, approved, finished('ghost', T1)])

        expect(run).not.toBeNull()
        expect(run?.steps).toHaveLength(0)
    })

    it('offers nothing once the run is cancelled, whatever is left pending', () => {
        const run = talosResearchReplay([
            started, approved, search('s1', T1), { kind: 'run_cancelled', at: T2 },
        ])!

        expect(talosResearchNextStep(talosResearchRecover(run, T3))).toBeNull()
    })

    it('carries where it is running, because that is what lets it move', () => {
        // R1b: a state that serialises is a state that can migrate to a server.
        // The field is part of the journal from the first event, so a run does
        // not have to be re-planned to change engine.
        const run = talosResearchReplay([{ ...started, engine: 'cloud' }])!

        expect(run.engine).toBe('cloud')
    })
})

describe('how far along a run says it is', () => {
    /**
     * The synthesis counts among the finished steps, so a total taken from the
     * plan alone announced "2 of 1" the moment the report was written. One
     * function answers this now, for the station and for the notification
     * alike: two ways of working out the same number is how they disagreed.
     */
    it('counts the report once the run has one', () => {
        const run = talosResearchReplay([
            started, approved, search('s1', T1), finished('s1', T2),
            { kind: 'step_started', at: T2, stepId: 'synthesis', branchId: 'synthesis', stepKind: 'synthesise' },
            finished('synthesis', T3),
        ])!

        expect(talosResearchProgressOf(run)).toEqual({ done: 2, total: 2 })
    })

    it('does not count a report that has not been started', () => {
        // The other direction of the same lie: a denominator that includes work
        // which may never be attempted makes a finished run look incomplete.
        const run = talosResearchReplay([started, approved, search('s1', T1)])!

        expect(talosResearchProgressOf(run)).toEqual({ done: 0, total: 1 })
    })
})

/**
 * Pausing, cancelling and renaming — added 2026-08-03 after the research on
 * long-running work found that Android has no notion of a pause at all:
 * WorkManager's states are ENQUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/BLOCKED,
 * CANCELLED is terminal, and calling it when a person asked to pause would
 * throw away a research they had paid for.
 */
describe('stopping a research without losing it', () => {
    const ready = [started, approved]

    function fold(events: readonly TalosResearchEvent[]) {
        return talosResearchReplay(events)!
    }

    it('keeps "asked to stop" and "stopped" apart, because money sits between them', () => {
        // The pause can land while a step is in flight and already paid for.
        const asking = fold([...ready, search('s1', T1), { kind: 'run_pause_requested', at: T2 }])
        expect(asking.status).toBe('pause_requested')

        const rested = fold([...ready, search('s1', T1), { kind: 'run_pause_requested', at: T2 },
            finished('s1', T3), { kind: 'run_paused', at: T3 }])
        expect(rested.status).toBe('paused')
        // Drained, not discarded: the step that was in flight is banked.
        expect(rested.steps[0]!.state).toBe('done')
        expect(talosResearchSpent(rested).searches).toBe(1)
    })

    it('books no new step while resting — enforced where work is decided', () => {
        // A step that was mid-flight when the process died: recovery marks it
        // `interrupted`, which is the one state worth retrying, so this is the
        // strongest case — there IS work sitting there to be picked up.
        const killed = talosResearchRecover(fold([...ready, search('s1', T1)]), T2)

        const resting = talosResearchApply(killed, { kind: 'run_pause_requested', at: T2 })!
        expect(talosResearchNextStep(resting)).toBeNull()

        const paused = talosResearchApply(killed, { kind: 'run_paused', at: T2 })!
        expect(talosResearchNextStep(paused)).toBeNull()

        // …and it is still there, untouched, the moment the person resumes.
        const back = talosResearchApply(paused, { kind: 'run_resumed', at: T3 })!
        expect(back.status).toBe('collecting')
        expect(talosResearchNextStep(back)?.id).toBe('s1')
        expect(talosResearchNextStep(back)?.state).toBe('interrupted')
    })

    it('still OWES the work it paused on', () => {
        // A different question from "what should the engine do now": drawing an
        // empty plan for a run about to be resumed would be a lie about scope.
        const paused = fold([...ready, { kind: 'run_paused', at: T1 }])
        expect(talosResearchWorkLeft(paused).map((branch) => branch.id)).toEqual(['b1'])

        const cancelled = fold([...ready, { kind: 'run_cancelled', at: T1 }])
        expect(talosResearchWorkLeft(cancelled)).toEqual([])
    })

    it('treats a second pause as the same pause, not a harder one', () => {
        // Two taps, or one tap and one replay of a journal written twice.
        const twice = fold([...ready, { kind: 'run_paused', at: T1 }, { kind: 'run_pause_requested', at: T2 }])
        expect(twice.status).toBe('paused')
    })

    it('refuses to reopen or re-stop a run that has ended', () => {
        // Reachable: a stale notification action arriving after the run
        // finished. Cancelled means cancelled — a resume that reopened it would
        // spend money on a research the person ended.
        const cancelled = fold([...ready, { kind: 'run_cancelled', at: T1 }])
        expect(talosResearchApply(cancelled, { kind: 'run_resumed', at: T2 })!.status).toBe('cancelled')
        expect(talosResearchApply(cancelled, { kind: 'run_pause_requested', at: T2 })!.status).toBe('cancelled')

        const done = fold([...ready, { kind: 'run_finished', at: T1 }])
        expect(talosResearchApply(done, { kind: 'run_paused', at: T2 })!.status).toBe('done')
    })

    it('renames the LABEL and never the question that was paid for', () => {
        const named = fold([...ready, { kind: 'run_renamed', at: T1, title: '  Tablet 2026  ' }])
        expect(named.title).toBe('Tablet 2026')
        // The fact stays: the export, the plan and the provenance all lean on it.
        expect(named.question).toBe('quale tablet conviene')

        // Blank is not a title — it restores the question as the label, which is
        // also what "Restore the original title" writes.
        expect(talosResearchApply(named, { kind: 'run_renamed', at: T2, title: '   ' })!.title).toBeNull()
        expect(talosResearchApply(named, { kind: 'run_renamed', at: T2, title: null })!.title).toBeNull()
    })

    it('starts with no title at all, rather than a copy of the question', () => {
        // A copy would drift the moment anything touched one of the two, and
        // would make "has a custom title" unanswerable.
        expect(fold(ready).title).toBeNull()
    })
})
