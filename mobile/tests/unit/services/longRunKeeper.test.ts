import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => {
    const listeners = new Map<string, (state: unknown) => void>()
    const remove = vi.fn().mockResolvedValue(undefined)
    const plugin = {
        start: vi.fn().mockResolvedValue({ ok: true }),
        update: vi.fn().mockResolvedValue({ ok: true }),
        stop: vi.fn().mockResolvedValue({ ok: true }),
        status: vi.fn().mockResolvedValue({
            contract: 'talos.mobile.run-service.v1',
            status: 'stopped',
            runId: null,
            updatedAt: 0,
        }),
        addListener: vi.fn().mockImplementation(async (
            event: string,
            listener: (state: unknown) => void,
        ) => {
            listeners.set(event, listener)
            return { remove }
        }),
    }
    return { listeners, plugin, remove }
})

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => native.plugin,
}))

import { createTalosRunKeeper, TALOS_KEEPER_DELAY_MS } from '@/services/longRunKeeper'

describe('createTalosRunKeeper', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        native.listeners.clear()
        native.remove.mockClear()
        for (const method of [
            native.plugin.start,
            native.plugin.update,
            native.plugin.stop,
            native.plugin.status,
            native.plugin.addListener,
        ]) method.mockClear()
    })

    it('starts a cancelable native keeper only for an identified run and forwards its matching state event', async () => {
        const onCancel = vi.fn()
        const onTimeout = vi.fn()
        const keeper = createTalosRunKeeper('Research', {
            runId: 'run-1',
            onCancel,
            onTimeout,
        })
        await Promise.resolve()
        keeper.engage('Reading sources')

        expect(native.plugin.start).toHaveBeenCalledWith({
            title: 'Research',
            text: 'Reading sources',
            runId: 'run-1',
            cancelable: true,
        })
        expect(native.plugin.addListener).toHaveBeenCalledWith('stateChanged', expect.any(Function))

        native.listeners.get('stateChanged')?.({
            contract: 'talos.mobile.run-service.v1',
            status: 'cancelled',
            runId: 'another-run',
            updatedAt: 1,
        })
        expect(onCancel).not.toHaveBeenCalled()
        native.listeners.get('stateChanged')?.({
            contract: 'talos.mobile.run-service.v1',
            status: 'cancelled',
            runId: 'run-1',
            updatedAt: 2,
        })
        native.listeners.get('stateChanged')?.({
            contract: 'talos.mobile.run-service.v1',
            status: 'timed_out',
            runId: 'run-1',
            updatedAt: 3,
        })
        expect(onCancel).toHaveBeenCalledOnce()
        expect(onTimeout).toHaveBeenCalledOnce()

        keeper.release()
        await Promise.resolve()
        expect(native.plugin.stop).toHaveBeenCalledOnce()
        expect(native.remove).toHaveBeenCalledOnce()
    })

    it('removes native listeners and never starts for a released short operation', async () => {
        const keeper = createTalosRunKeeper('Short answer', { runId: 'run-short' })
        await Promise.resolve()
        keeper.release()
        vi.advanceTimersByTime(TALOS_KEEPER_DELAY_MS + 1)
        await Promise.resolve()

        expect(native.plugin.start).not.toHaveBeenCalled()
        expect(native.plugin.stop).not.toHaveBeenCalled()
        expect(native.remove).toHaveBeenCalledOnce()
    })
})
