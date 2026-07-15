import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import { useTalosRuns } from './useTalosRuns'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })

    return { promise, resolve, reject }
}

function event(id: string, sequence: number) {
    return {
        id,
        run_id: 'run-a',
        sequence,
        event_type: 'node.succeeded',
        severity: 'info',
        node_id: null,
        payload: {},
        created_at: '2026-07-15T10:00:00Z',
    }
}

describe('useTalosRuns overlapping requests', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('keeps each run pending until its own request settles', async () => {
        const runA = deferred<{ data: ReturnType<typeof event>[] }>()
        const runB = deferred<{ data: ReturnType<typeof event>[] }>()
        talosFetchMock.mockImplementation((url) => {
            return (String(url).includes('run-a') ? runA.promise : runB.promise) as never
        })
        const runs = useTalosRuns()

        const requestA = runs.loadRunEvents('run-a')
        const requestB = runs.loadRunEvents('run-b')

        expect(runs.isRunEventsLoading('run-a')).toBe(true)
        expect(runs.isRunEventsLoading('run-b')).toBe(true)

        runB.resolve({ data: [event('event-b', 1)] })
        await requestB

        expect(runs.isRunEventsLoading('run-a')).toBe(true)
        expect(runs.isRunEventsLoading('run-b')).toBe(false)
        expect(runs.loadingEventsRunId.value).toBe('run-a')

        runA.resolve({ data: [event('event-a', 1)] })
        await requestA

        expect(runs.isRunEventsLoading('run-a')).toBe(false)
        expect(runs.loadingEventsRunId.value).toBeNull()
    })

    it('keeps the newest response when requests for one run finish out of order', async () => {
        const older = deferred<{ data: ReturnType<typeof event>[] }>()
        const newer = deferred<{ data: ReturnType<typeof event>[] }>()
        const queue = [older, newer]
        talosFetchMock.mockImplementation(() => queue.shift()!.promise as never)
        const runs = useTalosRuns()

        const olderRequest = runs.loadRunEvents('run-a')
        const newerRequest = runs.loadRunEvents('run-a')

        newer.resolve({ data: [event('newest', 2)] })
        await newerRequest
        older.resolve({ data: [event('stale', 1)] })
        await olderRequest

        expect(runs.eventsForRun('run-a').map(({ id }) => id)).toEqual(['newest'])
        expect(runs.isRunEventsLoading('run-a')).toBe(false)
    })

    it('isolates an event fault to the run that produced it', async () => {
        const runA = deferred<{ data: ReturnType<typeof event>[] }>()
        const runB = deferred<{ data: ReturnType<typeof event>[] }>()
        talosFetchMock.mockImplementation((url) => {
            return (String(url).includes('run-a') ? runA.promise : runB.promise) as never
        })
        const runs = useTalosRuns()

        const requestA = runs.loadRunEvents('run-a')
        const requestB = runs.loadRunEvents('run-b')
        runB.resolve({ data: [event('event-b', 1)] })
        await requestB
        runA.reject(new Error('Run A event stream failed'))
        await expect(requestA).rejects.toThrow('Run A event stream failed')

        expect(runs.eventErrorForRun('run-a')).toBe('Run A event stream failed')
        expect(runs.eventErrorForRun('run-b')).toBeNull()
    })
})
