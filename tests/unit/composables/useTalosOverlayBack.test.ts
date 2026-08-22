import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import {
    useTalosOverlayBack,
    talosOverlayBackActive,
    handleTalosOverlayBack,
    __resetTalosOverlayBackForTests,
} from '@/composables/useTalosOverlayBack'

// Owner 2026-07-24: the composer '+' drawer used to let the Android Back gesture
// EXIT the app (App.vue's back handler didn't know it was open). This LIFO
// registry lets the native-back handler close the top-most overlay first.
afterEach(() => { __resetTalosOverlayBackForTests() })

describe('useTalosOverlayBack', () => {
    it('is inactive with nothing registered', () => {
        expect(talosOverlayBackActive()).toBe(false)
        expect(handleTalosOverlayBack()).toBe(false)
    })

    it('runs the TOP-most close handler on back (LIFO), not the ones beneath', () => {
        const closeA = vi.fn()
        const closeB = vi.fn()
        const scope = effectScope()
        scope.run(() => { useTalosOverlayBack(closeA); useTalosOverlayBack(closeB) })
        expect(talosOverlayBackActive()).toBe(true)
        expect(handleTalosOverlayBack()).toBe(true)
        expect(closeB).toHaveBeenCalledOnce()
        expect(closeA).not.toHaveBeenCalled()
        scope.stop()
    })

    it('unregisters automatically when the owning scope disposes (no leak)', () => {
        const close = vi.fn()
        const scope = effectScope()
        scope.run(() => useTalosOverlayBack(close))
        expect(talosOverlayBackActive()).toBe(true)
        scope.stop()
        expect(talosOverlayBackActive()).toBe(false)
    })
})
