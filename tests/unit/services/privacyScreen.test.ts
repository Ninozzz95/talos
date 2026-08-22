import { beforeEach, describe, expect, it, vi } from 'vitest'

// Debt S2 (security review): the app shipped with no FLAG_SECURE at all, so the
// recents thumbnail and any screenshot exposed the open chat with no PIN. The
// bridge is native-only and fail-soft: privacy must never brick the shell.
const bridge = vi.hoisted(() => ({
    setSecure: vi.fn(async () => ({ secure: true })),
    native: true,
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => bridge.native },
    registerPlugin: () => ({ setSecure: bridge.setSecure }),
}))

beforeEach(() => {
    bridge.setSecure.mockReset().mockResolvedValue({ secure: true })
    bridge.native = true
})

describe('setTalosScreenSecure (Debt S2)', () => {
    it('asks the native plugin to set FLAG_SECURE', async () => {
        const { setTalosScreenSecure } = await import('@/services/privacyScreen')
        await setTalosScreenSecure(true)
        expect(bridge.setSecure).toHaveBeenCalledWith({ enabled: true })
        await setTalosScreenSecure(false)
        expect(bridge.setSecure).toHaveBeenLastCalledWith({ enabled: false })
    })

    it('is inert on web — there is no window flag to set', async () => {
        bridge.native = false
        const { setTalosScreenSecure } = await import('@/services/privacyScreen')
        await setTalosScreenSecure(true)
        expect(bridge.setSecure).not.toHaveBeenCalled()
    })

    it('fail-soft: a missing or broken plugin must not reject', async () => {
        bridge.setSecure.mockRejectedValue(new Error('not implemented'))
        const { setTalosScreenSecure } = await import('@/services/privacyScreen')
        await expect(setTalosScreenSecure(true)).resolves.toBeUndefined()
    })
})
