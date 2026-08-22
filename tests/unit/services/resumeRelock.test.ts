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

    /**
     * Owner 2026-07-29, testing r8: "vorrei che l'applicazione venga bloccata
     * quando il blocco schermo viene innestato."
     *
     * He is right, and the old design was weaker than it looked. The lock was
     * applied on RESUME, and only after a five-minute stay — so locking the
     * phone left TALOS unlocked in memory with the chats on screen behind the
     * keyguard. Anyone opening the phone inside the grace window walked
     * straight into them.
     *
     * Locking the screen and switching apps are not the same intent. Glancing
     * at a notification should not cost a PIN — that is what the grace window
     * is for and it stays. But locking the phone IS the user securing the
     * device, and that deserves an immediate lock with no window at all.
     *
     * `appStateChange` cannot tell the two apart, so the discriminator has to
     * come from the platform: screen off / keyguard engaged.
     */
    it('LOCK-SCREEN-01 locking the device relocks at once, without waiting for a resume', async () => {
        let now = 1_000
        const onRelock = vi.fn()
        registerTalosResumeRelock({
            graceMs: 5 * 60_000,
            isEnabled: async () => true,
            isDeviceLocked: async () => true,
            onRelock,
            now: () => now,
        })
        await flush()

        listeners.stateChange!({ isActive: false })
        await flush()

        // No resume, no elapsed grace: the lock is already on.
        expect(onRelock).toHaveBeenCalledOnce()

        // And coming back must not lock a second time.
        now += 10 * 60_000
        listeners.stateChange!({ isActive: true })
        await flush()
        expect(onRelock).toHaveBeenCalledOnce()
    })

    it('LOCK-SCREEN-02 a plain app switch keeps the grace window', async () => {
        let now = 1_000
        const onRelock = vi.fn()
        registerTalosResumeRelock({
            graceMs: 30_000,
            isEnabled: async () => true,
            // Screen still on: the user went to another app, not to the keyguard.
            isDeviceLocked: async () => false,
            onRelock,
            now: () => now,
        })
        await flush()

        listeners.stateChange!({ isActive: false })
        await flush()
        expect(onRelock).not.toHaveBeenCalled()

        now += 5_000
        listeners.stateChange!({ isActive: true })
        await flush()
        expect(onRelock).not.toHaveBeenCalled()
    })

    it('LOCK-SCREEN-03 a device lock still respects the enablement gate', async () => {
        const onRelock = vi.fn()
        registerTalosResumeRelock({
            isEnabled: async () => false,
            isDeviceLocked: async () => true,
            onRelock,
            now: () => 0,
        })
        await flush()

        listeners.stateChange!({ isActive: false })
        await flush()

        // No PIN configured, or the flag is off: there is nothing to lock.
        expect(onRelock).not.toHaveBeenCalled()
    })

    it('LOCK-SCREEN-04 a failing device-lock probe falls back to the grace window', async () => {
        let now = 1_000
        const onRelock = vi.fn()
        registerTalosResumeRelock({
            graceMs: 30_000,
            isEnabled: async () => true,
            isDeviceLocked: async () => { throw new Error('keyguard unavailable') },
            onRelock,
            now: () => now,
        })
        await flush()

        listeners.stateChange!({ isActive: false })
        await flush()
        // A broken probe must not lock on every app switch, and must not crash.
        expect(onRelock).not.toHaveBeenCalled()

        // The old behaviour is still there underneath.
        now += 31_000
        listeners.stateChange!({ isActive: true })
        await flush()
        expect(onRelock).toHaveBeenCalledOnce()
    })

    it('LOCK-SCREEN-05 the grace window still applies when no probe is supplied', async () => {
        let now = 1_000
        const onRelock = vi.fn()
        // No isDeviceLocked: the web build, and every pre-existing caller.
        registerTalosResumeRelock({
            graceMs: 30_000,
            isEnabled: async () => true,
            onRelock,
            now: () => now,
        })
        await flush()

        listeners.stateChange!({ isActive: false })
        await flush()
        expect(onRelock).not.toHaveBeenCalled()

        now += 31_000
        listeners.stateChange!({ isActive: true })
        await flush()
        expect(onRelock).toHaveBeenCalledOnce()
    })

    /**
     * Found reviewing the fix above rather than by a report, and it is a defect
     * the fix itself introduced.
     *
     * The probe is asynchronous. Lock the screen and unlock it immediately and
     * the order becomes: inactive, probe starts, active, probe resolves "locked"
     * — at which point the app is back in the user's hands and would be thrown
     * a PIN pad for a lock that is already over.
     *
     * A background episode that has ended cannot lock anything.
     */
    it('LOCK-SCREEN-06 a probe resolving after the app is back does not lock it', async () => {
        let now = 1_000
        const onRelock = vi.fn()
        let releaseProbe!: (locked: boolean) => void
        registerTalosResumeRelock({
            graceMs: 5 * 60_000,
            isEnabled: async () => true,
            isDeviceLocked: () => new Promise<boolean>((resolve) => { releaseProbe = resolve }),
            onRelock,
            now: () => now,
        })
        await flush()

        listeners.stateChange!({ isActive: false })
        await flush()
        expect(onRelock).not.toHaveBeenCalled()

        // The user unlocks the phone before Android has answered.
        now += 2_000
        listeners.stateChange!({ isActive: true })
        await flush()

        // The late answer arrives, and it is true — but the episode is over.
        releaseProbe(true)
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
