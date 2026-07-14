// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useTalosWorkspaceWindows } from './useTalosWorkspaceWindows'

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')

describe('useTalosWorkspaceWindows', () => {
    beforeEach(() => localStorage.clear())

    afterEach(() => {
        if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia)
        else delete (window as Window & { matchMedia?: Window['matchMedia'] }).matchMedia
        if (originalVisualViewport) Object.defineProperty(window, 'visualViewport', originalVisualViewport)
        else delete (window as Window & { visualViewport?: VisualViewport }).visualViewport
    })

    it('derives manager area from rail, viewport, and measured composer and reconciles on resize', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
        const scope = effectScope()
        const windows = scope.run(() => useTalosWorkspaceWindows({
            initialOpen: ['runtime'],
            currentRailWidth: ref(236),
            composerHeight: ref(180),
        }))
        expect(windows).toBeTruthy()
        expect(windows?.state.value.breakpoint).toBe('desktop')
        expect(windows?.state.value.area).toEqual({ left: 0, top: 56, right: 1204, bottom: 672 })
        expect(windows?.state.value.tileArea).toEqual({ left: 0, top: 0, right: 1204, bottom: 900 })
        expect(windows?.state.value.maximizeArea).toEqual({ left: 0, top: 0, right: 1204, bottom: 900 })
        expect(windows?.state.value.fullscreenArea).toEqual({ left: 0, top: 0, right: 1204, bottom: 900 })

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 })
        window.dispatchEvent(new Event('resize'))
        await nextTick()

        expect(windows?.state.value.breakpoint).toBe('mobile')
        expect(windows?.state.value.area).toEqual({ left: 0, top: 96, right: 375, bottom: 612 })
        expect(windows?.state.value.windows.runtime.presentation).toBe('mobile-sheet')
        scope.stop()
    })

    it('reconciles every window when the measured composer border box grows', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
        const composerHeight = ref(80)
        const scope = effectScope()
        const windows = scope.run(() => useTalosWorkspaceWindows({
            initialOpen: [],
            currentRailWidth: ref(236),
            composerHeight,
        }))

        expect(windows?.state.value.area.bottom).toBe(672)
        composerHeight.value = 120
        await nextTick()
        expect(windows?.state.value.area.bottom).toBe(632)

        windows?.openWindow('calendar')
        const calendar = windows?.state.value.windows.calendar
        expect((calendar?.bounds.y ?? 0) + (calendar?.bounds.height ?? 0)).toBeLessThanOrEqual(632)
        scope.stop()
    })

    it('uses a composer-safe floating area and full-height tile, maximize, and fullscreen areas', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
        const scope = effectScope()
        const windows = scope.run(() => useTalosWorkspaceWindows({
            initialOpen: ['theme'],
            currentRailWidth: ref(236),
            composerHeight: ref(168),
        }))!

        windows.tileWindow('theme', 'left-half')
        expect(windows.state.value.windows.theme.bounds).toEqual({ x: 0, y: 0, width: 602, height: 900 })
        windows.untileWindow('theme')
        windows.toggleFullscreenWindow('theme')
        expect(windows.state.value.windows.theme.bounds).toEqual({ x: 0, y: 0, width: 1204, height: 900 })
        windows.tileWindow('theme', 'fullscreen-workspace')
        expect(windows.state.value.windows.theme.presentation).toBe('fullscreen')
        expect(windows.state.value.windows.theme.bounds).toEqual({ x: 0, y: 0, width: 1204, height: 900 })
        windows.untileWindow('theme')
        expect(windows.state.value.windows.theme.presentation).toBe('floating')
        scope.stop()
    })

    it('reconciles on orientation, visual viewport, and density invalidation signals', async () => {
        const visualViewport = new EventTarget()
        let densityListener: EventListener | null = null
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: visualViewport })
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: () => ({
                matches: true,
                media: '',
                onchange: null,
                addEventListener: (_type: string, listener: EventListener) => { densityListener = listener },
                removeEventListener: () => undefined,
                addListener: () => undefined,
                removeListener: () => undefined,
                dispatchEvent: () => true,
            }),
        })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
        const scope = effectScope()
        const windows = scope.run(() => useTalosWorkspaceWindows({
            initialOpen: ['runtime'],
            currentRailWidth: ref(236),
            composerHeight: ref(180),
        }))

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 })
        window.dispatchEvent(new Event('orientationchange'))
        await nextTick()
        expect(windows?.state.value.breakpoint).toBe('mobile')

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1100 })
        visualViewport.dispatchEvent(new Event('resize'))
        await nextTick()
        expect(windows?.state.value.breakpoint).toBe('tablet')

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
        densityListener?.(new Event('change'))
        await nextTick()
        expect(windows?.state.value.breakpoint).toBe('desktop')
        scope.stop()
    })
})
