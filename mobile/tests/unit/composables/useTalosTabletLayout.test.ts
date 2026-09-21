// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetTalosTabletLayoutForTests, useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import {
    TALOS_TABLET_MEDIA_QUERY,
    TALOS_TABLET_WIDTH_MEDIA_QUERY,
} from '@/lib/tabletLayout'

// F6 — reactive md-breakpoint gate for the tablet split view. Listener-based
// (rotation / window resize flips the layout live), safe when matchMedia is
// absent (old WebView → phone layout).
type Listener = (event: { matches: boolean }) => void

function fakeQuery(initial: boolean) {
    const listeners: Listener[] = []
    const mql = {
        matches: initial,
        addEventListener: vi.fn((_: string, listener: Listener) => { listeners.push(listener) }),
        removeEventListener: vi.fn((_: string, listener: Listener) => {
            const index = listeners.indexOf(listener)
            if (index >= 0) listeners.splice(index, 1)
        }),
    }
    return {
        mql,
        flip(matches: boolean) {
            mql.matches = matches
            listeners.forEach((listener) => listener({ matches }))
        },
    }
}

function fakeMatchMedia(initialQualified: boolean, initialWide = initialQualified) {
    const qualified = fakeQuery(initialQualified)
    const wide = fakeQuery(initialWide)
    return {
        install() {
            vi.stubGlobal('matchMedia', vi.fn((query: string) => {
                if (query === TALOS_TABLET_MEDIA_QUERY) return qualified.mql
                if (query === TALOS_TABLET_WIDTH_MEDIA_QUERY) return wide.mql
                throw new Error(`Unexpected media query: ${query}`)
            }))
        },
        flipQualification: qualified.flip,
        flipWidth: wide.flip,
    }
}

beforeEach(() => {
    __resetTalosTabletLayoutForTests()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('useTalosTabletLayout (F6)', () => {
    it('reports tablet when the md query matches and tracks live changes', () => {
        const media = fakeMatchMedia(true)
        media.install()
        const layout = useTalosTabletLayout()
        expect(layout.isTablet.value).toBe(true)
        media.flipQualification(false)
        media.flipWidth(false)
        expect(layout.isTablet.value).toBe(false)
        media.flipWidth(true)
        media.flipQualification(true)
        expect(layout.isTablet.value).toBe(true)
    })

    it('P0 keeps tablet state across a height-only keyboard resize at md width', () => {
        const media = fakeMatchMedia(true, true)
        media.install()
        const layout = useTalosTabletLayout()

        media.flipQualification(false)

        expect(layout.isTablet.value).toBe(true)
    })

    it('P0 exits tablet state when the window width falls below md', () => {
        const media = fakeMatchMedia(true, true)
        media.install()
        const layout = useTalosTabletLayout()

        media.flipWidth(false)

        expect(layout.isTablet.value).toBe(false)
    })

    it('never promotes a fresh wide-but-short landscape phone', () => {
        const media = fakeMatchMedia(false, true)
        media.install()

        expect(useTalosTabletLayout().isTablet.value).toBe(false)
    })

    it('falls back to phone layout when matchMedia is unavailable', () => {
        vi.stubGlobal('matchMedia', undefined)
        const layout = useTalosTabletLayout()
        expect(layout.isTablet.value).toBe(false)
    })
})
