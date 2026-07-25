import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerTalosResumeRelock } from '@/services/resumeRelock'

// R1-3 — the F2 app lock armed ONLY at cold start: Android keeps the app
// resident for days, so the PIN was effectively decorative. The re-lock
// listens to appStateChange and re-arms after a grace window in background.
const listeners = vi.hoisted(() => ({
    stateChange: null as ((state: { isActive: boolean }) => void) | null,
    remove: vi.fn(async () => {}),
}))

vi.mock('@capacitor/app', () => ({
    App: {
        addListener: vi.fn(async (event: string, callback: (state: { isActive: boolean }) => void) => {
            if (event === 'appStateChange') listeners.stateChange = callback
            return { remove: listeners.remove }
        }),
    },
}))

beforeEach(() => {
    listeners.stateChange = null
    listeners.remove.mockClear()
})

function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('registerTalosResumeRelock (R1-3)', () => {
    it('a short background stay never relocks (grace window)', async () => {
        let now = 1_000
        const onRelock = vi.fn()
        registerTalosResumeRelock({ graceMs: 30_000, isEnabled: async () => true, onRelock, now: () => now })
        await flush()
        listeners.stateChange?.({ isActive: false })
        now += 1_000
        listeners.stateChange?.({ isActive: true })
        await flush()
        expect(onRelock).not.toHaveBeenCalled()
    })

    it('relocks after resuming from a background stay longer than the grace window', async () => {
        let now = 1_000
        const onRelock = vi.fn()
        registerTalosResumeRelock({
            graceMs: 30_000,
            isEnabled: async () => true,
            onRelock,
            now: () => now,
        })
        await flush()
        listeners.stateChange!({ isActive: false })
        now += 31_000
        listeners.stateChange!({ isActive: true })
        await flush()
        expect(onRelock).toHaveBeenCalledOnce()
    })

    it('a quick app switch inside the grace window does NOT relock', async () => {
        let now = 1_000
        const onRelock = vi.fn()
        registerTalosResumeRelock({
            graceMs: 30_000,
            isEnabled: async () => true,
            onRelock,
            now: () => now,
        })
        await flush()
        listeners.stateChange!({ isActive: false })
        now += 5_000
        listeners.stateChange!({ isActive: true })
        await flush()
        expect(onRelock).not.toHaveBeenCalled()
    })

    it('never relocks when the lock is not enabled (flag off or no PIN record)', async () => {
        let now = 0
        const onRelock = vi.fn()
        registerTalosResumeRelock({
            graceMs: 1_000,
            isEnabled: async () => false,
            onRelock,
            now: () => now,
        })
        await flush()
        listeners.stateChange!({ isActive: false })
        now += 60_000
        listeners.stateChange!({ isActive: true })
        await flush()
        expect(onRelock).not.toHaveBeenCalled()
    })

    it('a resume without a recorded background stay is inert (cold-start signal)', async () => {
        const onRelock = vi.fn()
        registerTalosResumeRelock({ graceMs: 0, isEnabled: async () => true, onRelock, now: () => 0 })
        await flush()
        listeners.stateChange!({ isActive: true })
        await flush()
        expect(onRelock).not.toHaveBeenCalled()
    })

    it('dispose removes the native listener', async () => {
        const controller = registerTalosResumeRelock({
            isEnabled: async () => true,
            onRelock: vi.fn(),
            now: () => 0,
        })
        await flush()
        await controller.dispose()
        expect(listeners.remove).toHaveBeenCalledOnce()
    })
})
