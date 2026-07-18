import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    dismissTopTalosOverlay,
    registerTalosDismiss,
    resetTalosDismissStackForTests,
    talosDismissStackSize,
} from './useTalosDismissStack'

beforeEach(() => {
    resetTalosDismissStackForTests()
})

describe('useTalosDismissStack', () => {
    it('escape arbitration dismisses only the topmost registered overlay and unregister is idempotent', () => {
        const dismissA = vi.fn()
        const dismissB = vi.fn()

        const unregisterA = registerTalosDismiss(dismissA)
        const unregisterB = registerTalosDismiss(dismissB)
        expect(talosDismissStackSize()).toBe(2)

        expect(dismissTopTalosOverlay()).toBe(true)
        expect(dismissB).toHaveBeenCalledTimes(1)
        expect(dismissA).not.toHaveBeenCalled()
        expect(talosDismissStackSize()).toBe(1)

        unregisterB()
        unregisterB()
        expect(talosDismissStackSize()).toBe(1)

        expect(dismissTopTalosOverlay()).toBe(true)
        expect(dismissA).toHaveBeenCalledTimes(1)
        expect(talosDismissStackSize()).toBe(0)

        unregisterA()
        expect(talosDismissStackSize()).toBe(0)
    })

    it('returns false when no overlay is registered', () => {
        expect(dismissTopTalosOverlay()).toBe(false)
    })

    it('an unregistered middle overlay is skipped without dismissing neighbours twice', () => {
        const dismissA = vi.fn()
        const dismissB = vi.fn()
        const dismissC = vi.fn()

        registerTalosDismiss(dismissA)
        const unregisterB = registerTalosDismiss(dismissB)
        registerTalosDismiss(dismissC)

        unregisterB()
        expect(talosDismissStackSize()).toBe(2)

        expect(dismissTopTalosOverlay()).toBe(true)
        expect(dismissC).toHaveBeenCalledTimes(1)
        expect(dismissB).not.toHaveBeenCalled()

        expect(dismissTopTalosOverlay()).toBe(true)
        expect(dismissA).toHaveBeenCalledTimes(1)
        expect(dismissB).not.toHaveBeenCalled()
        expect(talosDismissStackSize()).toBe(0)
    })
})
