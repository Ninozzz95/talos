// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useTalosMotionEnvironment } from './useTalosMotionEnvironment'

const originalMatchMedia = window.matchMedia
const originalConnection = Object.getOwnPropertyDescriptor(navigator, 'connection')
const originalDocumentHidden = Object.getOwnPropertyDescriptor(document, 'hidden')

afterEach(() => {
    window.matchMedia = originalMatchMedia
    if (originalConnection) Object.defineProperty(navigator, 'connection', originalConnection)
    else delete (navigator as Navigator & { connection?: unknown }).connection
    if (originalDocumentHidden) Object.defineProperty(document, 'hidden', originalDocumentHidden)
})

describe('useTalosMotionEnvironment', () => {
    it('owns browser motion signals without depending on the legacy motion resolver', async () => {
        let reducedListener: ((event: MediaQueryListEvent) => void) | null = null
        const removeReducedListener = vi.fn()
        window.matchMedia = vi.fn(() => ({
            matches: false,
            addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
                reducedListener = listener
            },
            removeEventListener: removeReducedListener,
        }) as unknown as MediaQueryList)

        let connectionListener: (() => void) | null = null
        const removeConnectionListener = vi.fn()
        const connection = {
            saveData: false,
            effectiveType: '4g',
            addEventListener: (_type: string, listener: () => void) => {
                connectionListener = listener
            },
            removeEventListener: removeConnectionListener,
        }
        Object.defineProperty(navigator, 'connection', { configurable: true, value: connection })

        let hidden = false
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
        const workspaceReducedMotion = ref(false)
        const scope = effectScope()
        const environment = scope.run(() => useTalosMotionEnvironment({ workspaceReducedMotion }))!

        expect(environment.prefersReducedMotion.value).toBe(false)
        expect(environment.lowPower.value).toBe(false)
        expect(environment.documentHidden.value).toBe(false)

        reducedListener?.({ matches: true } as MediaQueryListEvent)
        await nextTick()
        expect(environment.prefersReducedMotion.value).toBe(true)

        reducedListener?.({ matches: false } as MediaQueryListEvent)
        workspaceReducedMotion.value = true
        await nextTick()
        expect(environment.prefersReducedMotion.value).toBe(true)

        connection.saveData = true
        connectionListener?.()
        hidden = true
        document.dispatchEvent(new Event('visibilitychange'))
        await nextTick()
        expect(environment.lowPower.value).toBe(true)
        expect(environment.documentHidden.value).toBe(true)

        scope.stop()
        expect(removeReducedListener).toHaveBeenCalledOnce()
        expect(removeConnectionListener).toHaveBeenCalledOnce()
    })
})
