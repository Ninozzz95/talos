// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useTalosMotion } from './useTalosMotion'

const originalMatchMedia = window.matchMedia
const originalConnection = Object.getOwnPropertyDescriptor(navigator, 'connection')
const originalDocumentHidden = Object.getOwnPropertyDescriptor(document, 'hidden')
const scopes: Array<ReturnType<typeof effectScope>> = []

afterEach(() => {
    scopes.splice(0).forEach((scope) => scope.stop())
    window.matchMedia = originalMatchMedia
    if (originalConnection) Object.defineProperty(navigator, 'connection', originalConnection)
    else delete (navigator as Navigator & { connection?: unknown }).connection
    if (originalDocumentHidden) Object.defineProperty(document, 'hidden', originalDocumentHidden)
})

function scopedMotion(options: Parameters<typeof useTalosMotion>[0]) {
    const scope = effectScope()
    scopes.push(scope)

    return scope.run(() => useTalosMotion(options))!
}

describe('useTalosMotion', () => {
    it('tracks the OS reduced-motion media query', async () => {
        let matches = false
        let listener: ((event: MediaQueryListEvent) => void) | null = null
        window.matchMedia = vi.fn(() => ({
            get matches() { return matches },
            media: '(prefers-reduced-motion: reduce)',
            addEventListener: (_type: string, next: EventListener) => { listener = next as (event: MediaQueryListEvent) => void },
            removeEventListener: vi.fn(),
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList)

        const motion = scopedMotion({ themeMotion: ref('normal') })
        expect(motion.prefersReducedMotion.value).toBe(false)

        matches = true
        listener?.({ matches: true } as MediaQueryListEvent)
        await nextTick()

        expect(motion.prefersReducedMotion.value).toBe(true)
        expect(motion.uiMotionEnabled.value).toBe(false)
        expect(motion.durationFor('window-open').value).toBe(0)
    })

    it('returns the resolved duration used by window transition timers', () => {
        const motion = scopedMotion({
            themeMotion: ref('normal'),
            durationScale: ref(120),
            prefersReducedMotion: ref(false),
        })

        expect(motion.durationFor('window-open').value).toBe(300)
        expect(motion.durationFor('window-minimize').value).toBe(400)
    })

    it('exposes semantic CSS variables for enabled and disabled UI motion', () => {
        const uiMotionDisabled = ref(false)
        const motion = scopedMotion({
            themeMotion: ref('normal'),
            uiMotionDisabled,
            prefersReducedMotion: ref(false),
        })

        expect(motion.styleFor('window-open').value['--talos-motion-duration']).toBe('250ms')

        uiMotionDisabled.value = true
        expect(motion.styleFor('window-open').value['--talos-motion-duration']).toBe('0ms')
    })

    it('pauses all nonessential motion while the document is hidden and restores it when visible', async () => {
        let hidden = false
        Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => hidden,
        })
        const motion = scopedMotion({
            themeMotion: ref('cinematic'),
            prefersReducedMotion: ref(false),
        })

        hidden = true
        document.dispatchEvent(new Event('visibilitychange'))
        await nextTick()

        expect(motion.documentHidden.value).toBe(true)
        expect(motion.motionPaused.value).toBe(true)
        expect(motion.uiMotionEnabled.value).toBe(false)
        expect(motion.backgroundMotionEnabled.value).toBe(false)
        expect(motion.durationFor('window-open').value).toBe(0)

        hidden = false
        document.dispatchEvent(new Event('visibilitychange'))
        await nextTick()

        expect(motion.motionPaused.value).toBe(false)
        expect(motion.uiMotionEnabled.value).toBe(true)
        expect(motion.backgroundMotionEnabled.value).toBe(true)
    })

    it('uses a low-power connection signal to pause UI and background motion', () => {
        Object.defineProperty(navigator, 'connection', {
            configurable: true,
            value: {
                saveData: true,
                effectiveType: '4g',
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            },
        })

        const motion = scopedMotion({
            themeMotion: ref('normal'),
            prefersReducedMotion: ref(false),
        })

        expect(motion.lowPower.value).toBe(true)
        expect(motion.motionPaused.value).toBe(true)
        expect(motion.uiMotionEnabled.value).toBe(false)
        expect(motion.backgroundMotionEnabled.value).toBe(false)
        expect(motion.durationFor('window-minimize').value).toBe(0)
    })
})
