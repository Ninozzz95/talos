import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetTalosTabletLayoutForTests, useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import { TALOS_TABLET_MEDIA_QUERY } from '@/lib/tabletLayout'

// F6 — reactive md-breakpoint gate for the tablet split view. Listener-based
// (rotation / window resize flips the layout live), safe when matchMedia is
// absent (old WebView → phone layout).
type Listener = (event: { matches: boolean }) => void

function fakeMatchMedia(initial: boolean) {
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
        install() {
            vi.stubGlobal('matchMedia', vi.fn((query: string) => {
                expect(query).toBe(TALOS_TABLET_MEDIA_QUERY)
                return mql
            }))
        },
        flip(matches: boolean) {
            mql.matches = matches
            listeners.forEach((listener) => listener({ matches }))
        },
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
        media.flip(false)
        expect(layout.isTablet.value).toBe(false)
        media.flip(true)
        expect(layout.isTablet.value).toBe(true)
    })

    it('falls back to phone layout when matchMedia is unavailable', () => {
        vi.stubGlobal('matchMedia', undefined)
        const layout = useTalosTabletLayout()
        expect(layout.isTablet.value).toBe(false)
    })
})
