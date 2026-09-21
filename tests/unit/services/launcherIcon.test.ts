import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    useLauncherIconController,
    __setLauncherIconDepsForTests,
    __resetLauncherIconControllerForTests,
    type LauncherIconDeps,
} from '@/services/launcherIcon'

function fakeDeps(overrides: Partial<LauncherIconDeps> = {}) {
    const calls = {
        applyNative: vi.fn(async (_p: string) => {}),
        setApplied: vi.fn(async (_p: string) => {}),
        restart: vi.fn(async () => {}),
    }
    let pauseCb: (() => void) | null = null
    const deps: LauncherIconDeps = {
        isNative: () => true,
        getApplied: async () => 'calm',
        setApplied: calls.setApplied,
        applyNative: calls.applyNative,
        restart: calls.restart,
        onNextPause: (cb) => { pauseCb = cb },
        ...overrides,
    }
    __setLauncherIconDepsForTests(deps)
    return { calls, firePause: () => pauseCb?.() }
}

afterEach(() => { __resetLauncherIconControllerForTests() })

describe('launcher icon controller', () => {
    it('evaluate raises a prompt when the theme differs and the feature is on', async () => {
        fakeDeps()
        const c = useLauncherIconController()
        await c.hydrate()
        c.evaluate('noir', true)
        expect(c.state.pending).toEqual({ target: 'noir' })
    })

    it('evaluate is a no-op before hydrate (the theme-hydration settle must not prompt)', () => {
        fakeDeps()
        const c = useLauncherIconController()
        // On cold start the theme store hydrates default→user-theme and fires the
        // watcher BEFORE the applied mirror is loaded — that must not raise a prompt.
        c.evaluate('noir', true)
        expect(c.state.pending).toBeNull()
    })

    it('evaluate stays quiet when the feature is off', async () => {
        fakeDeps()
        const c = useLauncherIconController()
        await c.hydrate()
        c.evaluate('noir', false)
        expect(c.state.pending).toBeNull()
    })

    it('confirmNow mirrors, toggles the native alias, and restarts', async () => {
        const { calls } = fakeDeps()
        const c = useLauncherIconController()
        await c.hydrate()
        c.evaluate('noir', true)
        await c.confirmNow()
        expect(calls.setApplied).toHaveBeenCalledWith('noir')
        expect(calls.applyNative).toHaveBeenCalledWith('noir')
        expect(calls.restart).toHaveBeenCalledOnce()
        expect(c.state.applied).toBe('noir')
        expect(c.state.pending).toBeNull()
    })

    it('later defers the apply until the next app pause (no restart)', async () => {
        const { calls, firePause } = fakeDeps()
        const c = useLauncherIconController()
        await c.hydrate()
        c.evaluate('violet', true)
        c.later()
        expect(c.state.pending).toBeNull()
        expect(calls.applyNative).not.toHaveBeenCalled()
        firePause()
        await Promise.resolve()
        expect(calls.applyNative).toHaveBeenCalledWith('violet')
        expect(calls.restart).not.toHaveBeenCalled()
    })

    it('confirmNow keeps the prompt and does not restart when the native toggle fails', async () => {
        const { calls } = fakeDeps({
            applyNative: vi.fn(async () => { throw new Error('setComponentEnabledSetting failed') }),
        })
        const c = useLauncherIconController()
        await c.hydrate()
        c.evaluate('noir', true)
        await c.confirmNow()
        expect(c.state.pending).toEqual({ target: 'noir' }) // still prompted → retryable
        expect(c.state.applied).toBe('calm')                // unchanged
        expect(calls.setApplied).not.toHaveBeenCalled()     // mirror not written on failure
        expect(calls.restart).not.toHaveBeenCalled()
    })

    it('later dedups: two choices register one listener and apply once with the latest', async () => {
        let pauseCount = 0
        const onNextPause = vi.fn((cb: () => void) => { pauseCount++; savedCb = cb })
        let savedCb: (() => void) | null = null
        const applyNative = vi.fn(async (_p: string) => {})
        __setLauncherIconDepsForTests({
            isNative: () => true, getApplied: async () => 'calm', setApplied: async () => {},
            applyNative, restart: async () => {}, onNextPause,
        })
        const c = useLauncherIconController()
        await c.hydrate()
        c.evaluate('forge', true); c.later()
        c.evaluate('violet', true); c.later()
        expect(onNextPause).toHaveBeenCalledOnce() // only ONE pause listener armed
        savedCb?.()
        await Promise.resolve()
        expect(applyNative).toHaveBeenCalledOnce()
        expect(applyNative).toHaveBeenCalledWith('violet') // latest wins
    })

    it('dismiss clears the prompt without applying anything', async () => {
        const { calls } = fakeDeps()
        const c = useLauncherIconController()
        await c.hydrate()
        c.evaluate('ember', true)
        c.dismiss()
        expect(c.state.pending).toBeNull()
        expect(calls.applyNative).not.toHaveBeenCalled()
    })
})
