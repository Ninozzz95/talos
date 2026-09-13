// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

// Cleanup pass 2026-07-24: the hand-rolled matchMedia + addEventListener +
// onBeforeUnmount teardown was repeated in view components (SettingsCenter). It
// is now one composable with automatic scope-bound cleanup.
import { useTalosMediaQuery } from '@/composables/useTalosMediaQuery'

function fakeMatchMedia(initial: boolean) {
    const listeners = new Set<(e: { matches: boolean }) => void>()
    const mql = {
        matches: initial,
        addEventListener: vi.fn((_: string, cb: (e: { matches: boolean }) => void) => { listeners.add(cb) }),
        removeEventListener: vi.fn((_: string, cb: (e: { matches: boolean }) => void) => { listeners.delete(cb) }),
    }
    const emit = (matches: boolean): void => { mql.matches = matches; listeners.forEach((cb) => cb({ matches })) }
    return { mql, emit }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('useTalosMediaQuery', () => {
    it('returns the current match state and updates reactively when the query flips', () => {
        const { mql, emit } = fakeMatchMedia(false)
        vi.stubGlobal('matchMedia', vi.fn(() => mql))
        const scope = effectScope()
        const matches = scope.run(() => useTalosMediaQuery('(min-width: 768px)'))!
        expect(matches.value).toBe(false)
        emit(true)
        expect(matches.value).toBe(true)
        scope.stop()
    })

    it('removes its listener when the owning scope is disposed (no leak)', () => {
        const { mql } = fakeMatchMedia(true)
        vi.stubGlobal('matchMedia', vi.fn(() => mql))
        const scope = effectScope()
        scope.run(() => useTalosMediaQuery('(min-width: 768px)'))
        expect(mql.addEventListener).toHaveBeenCalledOnce()
        scope.stop()
        expect(mql.removeEventListener).toHaveBeenCalledOnce()
    })

    it('is inert (always false) when matchMedia is unavailable (SSR/jsdom guard)', () => {
        vi.stubGlobal('matchMedia', undefined)
        const scope = effectScope()
        const matches = scope.run(() => useTalosMediaQuery('(min-width: 768px)'))!
        expect(matches.value).toBe(false)
        scope.stop()
    })
})
