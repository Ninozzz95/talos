import { describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { createTalosResearchRegistry } from '@/lib/research/researchRegistry'
import type { TalosResearchRun } from '@/lib/research/researchRun'
import type { TalosResearchProgress } from '@/services/researchRuntime'

const progress = (done: number, total = 3): TalosResearchProgress => ({
    run: { id: 'run-1' } as TalosResearchProgress['run'],
    done,
    total,
})

/**
 * Owner 2026-08-02: "quando torni indietro quando una Deep research è già
 * iniziata bisogna mantenerla running nello sfondo".
 *
 * The run never lived in the screen. What lived there was the only handle to
 * it, so leaving the screen lost the ability to SEE it — and a live run looked
 * abandoned. These pin the middle layer that fixes that.
 */
describe('the live research registry', () => {
    it('lets a watcher arrive after the run started, and hands it the state now', () => {
        // The whole point: someone coming BACK to the screen must not stare at
        // a blank row until the next step happens to land.
        const registry = createTalosResearchRegistry()
        const report = registry.open('run-1')
        report(progress(2))

        const seen: number[] = []
        registry.watch('run-1', (value) => seen.push(value.done))

        expect(seen).toEqual([2])
    })

    it('keeps the run in flight when every watcher has gone', () => {
        // Leaving the screen must not end the research. This is the defect.
        const registry = createTalosResearchRegistry()
        const report = registry.open('run-1')
        const stop = registry.watch('run-1', () => {})
        stop()

        expect(registry.isRunning('run-1')).toBe(true)
        report(progress(3))
        expect(registry.latest('run-1')?.done).toBe(3)
    })

    it('still knows where the run was when nothing has happened since you left', () => {
        // The case that actually matters, and the one a sloppier test misses:
        // the screen leaves, the run reports NOTHING for a while, and the next
        // screen must still open on the real state instead of a blank row.
        const registry = createTalosResearchRegistry()
        registry.open('run-1')(progress(2))
        const stop = registry.watch('run-1', () => {})
        stop()

        const seen: number[] = []
        registry.watch('run-1', (value) => seen.push(value.done))

        expect(seen).toEqual([2])
    })

    it('tells a returning screen which runs are still going', () => {
        const registry = createTalosResearchRegistry()
        registry.open('run-1')
        registry.open('run-2')
        registry.close('run-1')

        expect(registry.running()).toEqual(['run-2'])
        expect(registry.isRunning('run-1')).toBe(false)
    })

    it('feeds every watcher, and unsubscribes only the one that asked', () => {
        const registry = createTalosResearchRegistry()
        const report = registry.open('run-1')
        const first = vi.fn()
        const second = vi.fn()
        const stopFirst = registry.watch('run-1', first)
        registry.watch('run-1', second)

        report(progress(1))
        stopFirst()
        report(progress(2))

        expect(first).toHaveBeenCalledTimes(1)
        expect(second).toHaveBeenCalledTimes(2)
    })

    it('never lets a broken watcher reach the run, or its neighbours', () => {
        // A repaint is not allowed to fail the research.
        const registry = createTalosResearchRegistry()
        const report = registry.open('run-1')
        const healthy = vi.fn()
        registry.watch('run-1', () => { throw new Error('render exploded') })
        registry.watch('run-1', healthy)

        expect(() => report(progress(1))).not.toThrow()
        expect(healthy).toHaveBeenCalledTimes(1)
        expect(registry.latest('run-1')?.done).toBe(1)
    })

    it('survives a watcher that throws on the replay too', () => {
        const registry = createTalosResearchRegistry()
        registry.open('run-1')(progress(1))

        expect(() => registry.watch('run-1', () => { throw new Error('boom') })).not.toThrow()
    })

    it('has nothing to say about a run it never saw', () => {
        const registry = createTalosResearchRegistry()

        expect(registry.isRunning('nobody')).toBe(false)
        expect(registry.latest('nobody')).toBeNull()
        expect(() => registry.close('nobody')).not.toThrow()
    })
})

/**
 * Publishing a state the engine did not produce — added 2026-08-03 with pause,
 * cancel, rename and delete. Those all happen to a run that is NOT being
 * driven, and the station has to see them at the moment of the tap.
 */
describe('states that arrive without the engine', () => {
    function run(patch: Partial<TalosResearchRun> = {}): TalosResearchRun {
        return {
            id: 'run-1',
            sessionId: 'chat-1',
            question: 'chi ha vinto',
            depth: 'quick',
            engine: 'device',
            status: 'paused',
            title: null,
            plan: [{ id: 'b1', question: 'b1', estimate: { tokens: 1, searches: 1, pages: 1 } }],
            steps: [],
            startedAt: '2026-08-03T08:00:00.000Z',
            updatedAt: '2026-08-03T08:05:00.000Z',
            ...patch,
        }
    }

    it('tells the watchers without claiming the run is live', () => {
        // Marking it live to announce that it STOPPED would be the same lie in
        // the other direction — and `isRunning` is what decides the bucket.
        const registry = createTalosResearchRegistry()
        const seen: string[] = []
        registry.watch('run-1', (progress) => seen.push(progress.run.status))

        registry.report('run-1', run())

        expect(seen).toEqual(['paused'])
        expect(registry.isRunning('run-1')).toBe(false)
        expect(registry.running()).toEqual([])
    })

    it('forgets a deleted research completely, unlike one that merely finished', () => {
        const registry = createTalosResearchRegistry()
        registry.report('run-1', run({ status: 'done' }))
        // A late watcher on a FINISHED run still deserves to see how it ended.
        const afterClose: string[] = []
        registry.close('run-1')
        registry.watch('run-1', (progress) => afterClose.push(progress.run.status))
        expect(afterClose).toEqual(['done'])

        // A deleted one has no ending to replay: putting a card back on screen
        // for something that no longer exists is worse than showing nothing.
        registry.forget('run-1')
        const afterForget: string[] = []
        registry.watch('run-1', (progress) => afterForget.push(progress.run.status))
        expect(afterForget).toEqual([])
        expect(registry.latest('run-1')).toBeNull()
    })

    it('drops the watchers of a deleted research, so nothing can wake them', () => {
        const registry = createTalosResearchRegistry()
        const seen: string[] = []
        registry.watch('run-1', (progress) => seen.push(progress.run.status))

        registry.forget('run-1')
        registry.report('run-1', run())

        expect(seen).toEqual([])
    })
})

/**
 * The live index has to be REACTIVE, not merely correct.
 *
 * The tablet 2026-08-03: a paused research kept saying "in corso" for ever. The
 * run really had stopped — its counter sat still — but `isRunning` read a plain
 * Set, so the screen's computed had no reason to run again when the run closed.
 * It had only ever looked right because pausing also re-read the whole list
 * from disk, which invalidated everything by brute force.
 */
describe('the live index seen from a screen', () => {
    it('wakes a computed when a run opens and when it closes', () => {
        const registry = createTalosResearchRegistry()
        let evaluations = 0
        const showing = computed(() => {
            evaluations += 1
            return registry.isRunning('run-1')
        })

        expect(showing.value).toBe(false)
        expect(evaluations).toBe(1)

        registry.open('run-1')
        expect(showing.value).toBe(true)
        expect(evaluations).toBe(2)

        // The one that used to be missed: nothing else changes, so if closing
        // is invisible the card stays "running" until something unrelated
        // happens to invalidate it.
        registry.close('run-1')
        expect(showing.value).toBe(false)
        expect(evaluations).toBe(3)
    })

    it('wakes it for `running()` too, and for a forgotten run', () => {
        const registry = createTalosResearchRegistry()
        const all = computed(() => registry.running().join(','))

        expect(all.value).toBe('')
        registry.open('a')
        registry.open('b')
        expect(all.value).toBe('a,b')

        registry.forget('a')
        expect(all.value).toBe('b')
    })

    it('closing something that was never open changes nothing', () => {
        // Idempotent by contract, and a new Set on every call would wake every
        // watcher in the app for nothing.
        const registry = createTalosResearchRegistry()
        registry.open('a')
        let evaluations = 0
        const all = computed(() => { evaluations += 1; return registry.running().length })

        expect(all.value).toBe(1)
        registry.close('b')
        expect(all.value).toBe(1)
        expect(evaluations).toBe(1)
    })
})
