import { describe, expect, it, vi } from 'vitest'
import { TALOS_MOTION_SCENE_IDS } from './contracts'
import { createTalosProductSceneRegistry, createBrowserMotionFrameScheduler } from './productRegistry'
import { createDefaultTalosMotionV6Preferences } from './defaults'
import { resolveTalosWorkspaceMotionV6 } from './workspaceRuntime'

describe('TALOS product scene registry V6', () => {
    it('combines exactly 13 Complex, 13 Simple and 13 Static registrations', () => {
        const scheduler = { now: () => 0, requestFrame: () => 1, cancelFrame: () => {} }
        const simplePlatform = {
            createLayer: (id: string, role: string) => ({ id, role }), appendLayer: () => {}, removeLayer: () => {}, applyStyle: () => {},
            animate: () => ({ pause: () => {}, play: () => {}, cancel: () => {} }),
        }
        const complexPlatform = {
            scheduler, createSurface: (id: string) => ({ id }), appendSurface: () => {}, resizeSurface: () => {}, getContext: () => ({}), removeSurface: () => {},
        }
        const registry = createTalosProductSceneRegistry({ simplePlatform, complexPlatform })
        expect(registry.snapshot()).toHaveLength(42)
        for (const kind of ['complex', 'simple', 'static'] as const) {
            expect(registry.snapshot().filter((entry) => entry.kind === kind).map((entry) => entry.id)).toEqual(TALOS_MOTION_SCENE_IDS)
        }
    })

    it('adapts browser RAF and performance clocks without timers', () => {
        const callback = vi.fn()
        const requestAnimationFrame = vi.fn(() => 17)
        const cancelAnimationFrame = vi.fn()
        const scheduler = createBrowserMotionFrameScheduler({ requestAnimationFrame, cancelAnimationFrame }, { now: () => 42 })
        expect(scheduler.now()).toBe(42)
        expect(scheduler.requestFrame(callback)).toBe(17)
        scheduler.cancelFrame(17)
        expect(requestAnimationFrame).toHaveBeenCalledWith(callback)
        expect(cancelAnimationFrame).toHaveBeenCalledWith(17)
    })

    it('forwards Complex renderer frame and fault observers through the product registry', () => {
        let now = 0
        const onFrame = vi.fn()
        const onFault = vi.fn()
        const context = {
            save: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
            stroke: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(),
            arc: vi.fn(), quadraticCurveTo: vi.fn(), bezierCurveTo: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
            createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            globalAlpha: 1, lineWidth: 1, strokeStyle: '#fff', fillStyle: '#000',
            shadowBlur: 0, shadowColor: 'transparent',
        }
        const scheduler = { now: () => { now += 2; return now }, requestFrame: () => 1, cancelFrame: () => {} }
        const simplePlatform = {
            createLayer: (id: string, role: string) => ({ id, role }), appendLayer: () => {}, removeLayer: () => {}, applyStyle: () => {},
            animate: () => ({ pause: () => {}, play: () => {}, cancel: () => {} }),
        }
        const complexPlatform = {
            scheduler, createSurface: (id: string) => ({ id }), appendSurface: () => {}, resizeSurface: () => {}, getContext: () => context, removeSurface: () => {},
        }
        const registry = createTalosProductSceneRegistry({
            simplePlatform,
            complexPlatform,
            complexOptions: { animated: false, onFrame, onFault },
        })
        const preferences = createDefaultTalosMotionV6Preferences()
        preferences.mode = 'complex'
        const input = resolveTalosWorkspaceMotionV6({
            settingsPreferences: { theme_motion_v6: preferences },
            themeId: 'forge',
            colorMode: 'dark',
            environment: {
                workspaceBackgroundAllowed: true, workspaceInterfaceMotionAllowed: true, prefersReducedMotion: false,
                documentHidden: false, saveData: false, rendererFault: false, failedEffectiveMode: null,
                frameP95Ms: null, frameSampleSufficient: false,
            },
        }).sceneInput
        const instance = registry.create('forge', 'complex', input)

        expect(instance).not.toBeNull()
        instance!.mount({ kind: 'complex', target: {} })
        instance!.renderOrUpdate(input)
        expect(onFrame).toHaveBeenCalledWith(expect.objectContaining({ frameCostMs: 2, primitiveCount: expect.any(Number) }))
        expect(onFault).not.toHaveBeenCalled()
        instance!.dispose()
    })
})
