import { describe, expect, it, vi } from 'vitest'
import {
    appendTalosRunStep,
    createTalosRun,
    setTalosRunStatus,
    type TalosRunState,
} from '@/lib/runs/longRunState'
import { runTalosCheckpointPlan } from '@/lib/runs/checkpointRunner'

const T0 = '2026-07-27T10:00:00.000Z'
const T1 = '2026-07-27T10:00:01.000Z'
const T2 = '2026-07-27T10:00:02.000Z'
const T3 = '2026-07-27T10:00:03.000Z'

function initial(): TalosRunState {
    return createTalosRun({
        id: 'run-1',
        kind: 'research',
        sessionId: 'session-1',
        title: 'Market evidence',
        now: T0,
    })
}

describe('runTalosCheckpointPlan', () => {
    it('persists every completed step and resumes without executing completed work twice', async () => {
        const first = vi.fn().mockResolvedValue({ hits: 2 })
        const second = vi.fn().mockResolvedValue({ title: 'Source' })
        const snapshots: TalosRunState[] = []
        const times = [T1, T2, T3, T3]

        const complete = await runTalosCheckpointPlan(initial(), [
            { kind: 'search', execute: first },
            { kind: 'read', execute: second },
        ], {
            now: () => times.shift() ?? T3,
            save: async (state) => {
                snapshots.push(structuredClone(state))
                return state
            },
        })

        expect(first).toHaveBeenCalledOnce()
        expect(second).toHaveBeenCalledOnce()
        expect(snapshots.map((state) => [state.status, state.steps.length])).toEqual([
            ['running', 0],
            ['running', 1],
            ['running', 2],
            ['done', 2],
        ])
        expect(complete.status).toBe('done')

        const resumedFirst = vi.fn()
        const resumedSecond = vi.fn().mockResolvedValue({ title: 'Source' })
        const resumed = setTalosRunStatus(
            appendTalosRunStep(initial(), { kind: 'search', output: { hits: 2 }, at: T1 }),
            'running',
            T1,
        )
        const result = await runTalosCheckpointPlan(resumed, [
            { kind: 'search', execute: resumedFirst },
            { kind: 'read', execute: resumedSecond },
        ], {
            now: () => T2,
            save: async (state) => state,
        })
        expect(resumedFirst).not.toHaveBeenCalled()
        expect(resumedSecond).toHaveBeenCalledOnce()
        expect(result.steps).toHaveLength(2)
    })

    it('writes cancelled and failed terminal checkpoints without losing completed work', async () => {
        const abort = new AbortController()
        const cancelledSnapshots: TalosRunState[] = []
        const cancelled = await runTalosCheckpointPlan(initial(), [
            {
                kind: 'search',
                async execute() {
                    abort.abort()
                    return { hits: 1 }
                },
            },
            { kind: 'read', execute: vi.fn() },
        ], {
            signal: abort.signal,
            now: () => T1,
            save: async (state) => {
                cancelledSnapshots.push(structuredClone(state))
                return state
            },
        })
        expect(cancelled.status).toBe('cancelled')
        expect(cancelled.steps).toHaveLength(1)
        expect(cancelledSnapshots.at(-1)?.status).toBe('cancelled')

        const failedSnapshots: TalosRunState[] = []
        await expect(runTalosCheckpointPlan(initial(), [
            { kind: 'search', execute: async () => { throw new Error('provider offline') } },
        ], {
            now: () => T1,
            save: async (state) => {
                failedSnapshots.push(structuredClone(state))
                return state
            },
        })).rejects.toThrow('provider offline')
        expect(failedSnapshots.at(-1)).toMatchObject({
            status: 'failed',
            failure: 'provider offline',
            steps: [],
        })
    })
})
