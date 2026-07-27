import { describe, expect, it } from 'vitest'
import {
    addTalosRunSpend,
    appendTalosRunStep,
    assertTalosRunCheckpoint,
    createTalosRun,
    parseTalosRunState,
    serializeTalosRunState,
    setTalosRunStatus,
    TALOS_RUN_CONTRACT,
    talosRunIsResumable,
    talosRunResumeIndex,
} from '@/lib/runs/longRunState'

/**
 * R-1a. The owner asked whether this belonged with the background-kill defect,
 * and it does: switching apps mid-answer produced "network error" because
 * nothing was holding the work. State that survives the process is half the
 * answer, and it is the half that cannot be retrofitted.
 *
 * The tests are about the three jobs the shape does at once — surviving death,
 * not re-paying, and being able to move somewhere else — because if any of them
 * is lost, the shape stops being worth having.
 */
const NOW = '2026-07-26T10:00:00.000Z'

function run() {
    return createTalosRun({ id: 'r1', kind: 'research', sessionId: 's1', title: 'Fatture', now: NOW })
}

describe('long run state', () => {
    it('survives a round trip through storage', () => {
        const state = appendTalosRunStep(run(), { kind: 'search', output: { hits: 3 }, at: NOW })
        const parsed = parseTalosRunState(serializeTalosRunState(state))
        expect(parsed).toEqual(state)
        expect(parsed?.contract).toBe(TALOS_RUN_CONTRACT)
    })

    it('holds nothing that cannot be written down', () => {
        // The constraint IS the feature: a run whose steps carry closures or
        // class instances cannot be resumed, and cannot be moved to a server.
        const state = appendTalosRunStep(run(), { kind: 'read', output: { url: 'https://x' }, at: NOW })
        expect(() => JSON.stringify(state)).not.toThrow()
        expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    })

    it('resumes at the first step that has no result', () => {
        let state = run()
        state = appendTalosRunStep(state, { kind: 'a', output: 1, at: NOW })
        state = appendTalosRunStep(state, { kind: 'b', output: 2, at: NOW })
        expect(talosRunResumeIndex(state)).toBe(2)
        expect(state.steps.map((step) => step.index)).toEqual([0, 1])
    })

    it('keeps what was already spent, so a resume does not bill it twice', () => {
        let state = addTalosRunSpend(run(), { tokens: 9000, searches: 2 }, NOW)
        state = addTalosRunSpend(state, { tokens: 1200, pages: 4 }, NOW)
        expect(state.spend).toEqual({ tokens: 10_200, searches: 2, pages: 4 })
        expect(parseTalosRunState(JSON.stringify(state))!.spend).toEqual(state.spend)
    })

    it('never mutates the state it is given', () => {
        // A run being written to disk while something edits it in place is how a
        // resume reads half a step.
        const before = run()
        const snapshot = JSON.stringify(before)
        appendTalosRunStep(before, { kind: 'x', output: null, at: NOW })
        addTalosRunSpend(before, { tokens: 5 }, NOW)
        setTalosRunStatus(before, 'cancelled', NOW)
        expect(JSON.stringify(before)).toBe(snapshot)
    })

    it('an interrupted run is resumable; one waiting for a person is NOT', () => {
        expect(talosRunIsResumable(setTalosRunStatus(run(), 'running', NOW))).toBe(true)
        expect(talosRunIsResumable(setTalosRunStatus(run(), 'planning', NOW))).toBe(true)
        // Resuming this automatically would execute a plan nobody approved.
        expect(talosRunIsResumable(setTalosRunStatus(run(), 'awaiting_approval', NOW))).toBe(false)
        expect(talosRunIsResumable(
            setTalosRunStatus(setTalosRunStatus(run(), 'running', NOW), 'done', NOW),
        )).toBe(false)
        expect(talosRunIsResumable(setTalosRunStatus(run(), 'cancelled', NOW))).toBe(false)
    })

    it('a failure message lives only while the run is failed', () => {
        const failed = setTalosRunStatus(run(), 'failed', NOW, 'the network went away')
        expect(failed.failure).toBe('the network went away')
        // A run that recovers must not carry an explanation of something that is
        // no longer true.
        expect(setTalosRunStatus(failed, 'running', NOW).failure).toBeUndefined()
    })

    it('a corrupt record reads as nothing, and never throws at boot', () => {
        // This is read while the app is starting. Losing one run is survivable;
        // an exception that stops the app from opening is not.
        for (const raw of ['', 'not json', '{}', '[]', null, 42, '{"id":"r1"}']) {
            expect(() => parseTalosRunState(raw)).not.toThrow()
            expect(parseTalosRunState(raw)).toBeNull()
        }
    })

    it('rejects an unknown contract and malformed or non-contiguous checkpoints', () => {
        const base = run()
        const values = [
            { ...base, contract: 'talos.mobile.run.v2' },
            { ...base, engine: 'martian' },
            { ...base, kind: 'nonsense' },
            { ...base, spend: { tokens: -1, searches: 0, pages: 0 } },
            { ...base, steps: [{ index: 1, kind: 'search', output: null, at: NOW }] },
            { ...base, steps: [{ index: 0, kind: '', output: null, at: NOW }] },
            { ...base, startedAt: 'not-a-date' },
        ]
        for (const value of values) {
            expect(parseTalosRunState(JSON.stringify(value))).toBeNull()
        }
    })

    it('rejects checkpoint rewrites spend rollback and terminal resurrection', () => {
        const first = appendTalosRunStep(
            addTalosRunSpend(setTalosRunStatus(run(), 'running', NOW), { searches: 1 }, NOW),
            { kind: 'search', output: { hits: 3 }, at: NOW },
        )
        expect(() => assertTalosRunCheckpoint(first, {
            ...first,
            steps: [{ ...first.steps[0]!, output: { hits: 4 } }],
        })).toThrow('TALOS_RUN_CHECKPOINT_REWRITE')
        expect(() => assertTalosRunCheckpoint(first, {
            ...first,
            spend: { ...first.spend, searches: 0 },
        })).toThrow('TALOS_RUN_SPEND_ROLLBACK')

        const done = setTalosRunStatus(first, 'done', NOW)
        expect(() => assertTalosRunCheckpoint(done, setTalosRunStatus(done, 'running', NOW)))
            .toThrow('TALOS_RUN_STATUS_TRANSITION_INVALID')
    })
})
