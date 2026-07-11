import { describe, expect, it, vi } from 'vitest'
import { createTalosWindowLoader, type TalosWindowLoaderState } from './talosWindowLoader'

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((nextResolve, nextReject) => {
        resolve = nextResolve
        reject = nextReject
    })

    return { promise, resolve, reject }
}

describe('createTalosWindowLoader', () => {
    it('loads a concurrent window exactly once', async () => {
        const pending = deferred<string>()
        const loadWindow = vi.fn(() => pending.promise)
        const loader = createTalosWindowLoader(loadWindow)

        const first = loader.load()
        const second = loader.load()
        pending.resolve('window')

        await expect(Promise.all([first, second])).resolves.toEqual(['window', 'window'])
        expect(loadWindow).toHaveBeenCalledTimes(1)
        expect(loader.state).toMatchObject({ status: 'success', value: 'window', error: null })
    })

    it('caches a successful result for later loads', async () => {
        const loadWindow = vi.fn(async () => 'window')
        const loader = createTalosWindowLoader(loadWindow)

        await expect(loader.load()).resolves.toBe('window')
        await expect(loader.load()).resolves.toBe('window')

        expect(loadWindow).toHaveBeenCalledTimes(1)
    })

    it('exposes a visible error state after a failed attempt', async () => {
        const failure = new Error('window failed')
        const loadWindow = vi.fn(async () => {
            throw failure
        })
        const loader = createTalosWindowLoader(loadWindow)

        await expect(loader.load()).rejects.toBe(failure)
        await expect(loader.load()).rejects.toBe(failure)
        expect(loader.state).toMatchObject({ status: 'error', value: null, error: failure })
        expect(loadWindow).toHaveBeenCalledTimes(1)
    })

    it('starts exactly one new attempt for an explicit retry', async () => {
        const loadWindow = vi.fn()
            .mockRejectedValueOnce(new Error('first failure'))
            .mockResolvedValueOnce('window')
        const loader = createTalosWindowLoader(loadWindow)

        await expect(loader.load()).rejects.toThrow('first failure')
        const retry = loader.retry()
        const duplicateRetry = loader.retry()

        await expect(Promise.all([retry, duplicateRetry])).resolves.toEqual(['window', 'window'])
        expect(loadWindow).toHaveBeenCalledTimes(2)
        expect(loader.state).toMatchObject({ status: 'success', value: 'window', error: null })
    })

    it('does not let a stale attempt resolution or rejection overwrite a newer attempt', async () => {
        const first = deferred<string>()
        const second = deferred<string>()
        const loadWindow = vi.fn()
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise)
        const loader = createTalosWindowLoader(loadWindow)

        const stale = loader.load()
        const current = loader.retry()
        second.resolve('current window')

        await expect(current).resolves.toBe('current window')
        expect(loader.state).toMatchObject({ status: 'success', value: 'current window', error: null })

        first.reject(new Error('stale failure'))
        await expect(stale).rejects.toThrow('stale failure')
        expect(loader.state).toMatchObject({ status: 'success', value: 'current window', error: null })
    })

    it('ignores a stale resolution after a newer attempt succeeds', async () => {
        const first = deferred<string>()
        const second = deferred<string>()
        const loadWindow = vi.fn()
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise)
        const loader = createTalosWindowLoader(loadWindow)

        const stale = loader.load()
        const current = loader.retry()
        second.resolve('current window')
        await expect(current).resolves.toBe('current window')

        first.resolve('stale window')
        await expect(stale).resolves.toBe('stale window')
        expect(loader.state).toMatchObject({ status: 'success', value: 'current window', error: null })
    })

    it('notifies Vue-friendly subscribers with each current state change', async () => {
        const states: TalosWindowLoaderState<string>[] = []
        const loader = createTalosWindowLoader(async () => 'window')
        const unsubscribe = loader.subscribe((state) => states.push({ ...state }))

        await loader.load()
        unsubscribe()

        expect(states.map((state) => state.status)).toEqual(['loading', 'success'])
    })
})
