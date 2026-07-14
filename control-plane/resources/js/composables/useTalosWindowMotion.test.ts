// @vitest-environment jsdom

import { effectScope, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultTalosMotionV6Preferences } from '../motion-v6/defaults'
import { TALOS_WINDOW_IDS, type TalosWindowId } from '../lib/talosWindowRegistry'
import { useTalosWindowMotion } from './useTalosWindowMotion'

type Rect = { left: number; top: number; width: number; height: number }

function domRect(rect: Rect): DOMRect {
    return {
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        x: rect.left,
        y: rect.top,
        toJSON: () => rect,
    } as DOMRect
}

function animationHarness() {
    const records: Array<{
        target: HTMLElement
        keyframes: Keyframe[]
        options: KeyframeAnimationOptions
        finish: () => void
        cancel: ReturnType<typeof vi.fn>
    }> = []

    function install(target: HTMLElement) {
        Object.defineProperty(target, 'animate', {
            configurable: true,
            value: vi.fn((keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
                const listeners = new Map<string, () => void>()
                const cancel = vi.fn()
                const animation = {
                    addEventListener: vi.fn((name: string, listener: () => void) => listeners.set(name, listener)),
                    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
                    cancel,
                }
                records.push({
                    target,
                    keyframes,
                    options,
                    finish: () => listeners.get('finish')?.(),
                    cancel,
                })
                return animation
            }),
        })
    }

    return { records, install }
}

function createHarness(breakpoint: 'mobile' | 'tablet' | 'desktop' = 'desktop') {
    const animations = animationHarness()
    const stage = document.createElement('div')
    Object.defineProperty(stage, 'getBoundingClientRect', {
        value: () => domRect({ left: 236, top: 56, width: 1200, height: 720 }),
    })
    document.body.append(stage)

    const rects = new Map<TalosWindowId, Rect>()
    for (const [index, id] of TALOS_WINDOW_IDS.entries()) {
        const target = document.createElement('section')
        target.dataset.windowId = id
        target.tabIndex = -1
        const primaryAction = document.createElement('button')
        primaryAction.textContent = `Primary ${id}`
        target.append(primaryAction)
        const rect = { left: 280 + index, top: 120 + index, width: 640, height: 460 }
        rects.set(id, rect)
        Object.defineProperty(target, 'getBoundingClientRect', { value: () => domRect(rects.get(id)!) })
        animations.install(target)
        stage.append(target)
    }

    const minimizeTarget = document.createElement('button')
    minimizeTarget.dataset.testid = 'talos-minimize-target-theme'
    Object.defineProperty(minimizeTarget, 'getBoundingClientRect', {
        value: () => domRect({ left: 252, top: 760, width: 110, height: 34 }),
    })
    stage.append(minimizeTarget)

    const visibleWindowIds = ref<TalosWindowId[]>([])
    const minimizedWindowIds = ref<TalosWindowId[]>([])
    const fullscreenWindowIds = ref<TalosWindowId[]>([])
    const preferences = ref(createDefaultTalosMotionV6Preferences())
    const windowLaunchOrigins = ref({ theme: { x: -164, y: 220, source: 'sidebar' as const } })
    const windowLaunchRevisions = ref({ theme: 1 })
    const callbacks = {
        requestModule: vi.fn(),
        closeWindow: vi.fn(),
        minimizeWindow: vi.fn(),
        fullscreenWindow: vi.fn((id: TalosWindowId) => {
            const maximizing = !fullscreenWindowIds.value.includes(id)
            fullscreenWindowIds.value = maximizing
                ? [...fullscreenWindowIds.value, id]
                : fullscreenWindowIds.value.filter((candidate) => candidate !== id)
            rects.set(id, maximizing
                ? { left: 236, top: 56, width: 1200, height: 720 }
                : { left: 280, top: 120, width: 640, height: 460 })
        }),
        tileWindow: vi.fn((id: TalosWindowId) => {
            rects.set(id, { left: 236, top: 0, width: 600, height: 900 })
        }),
        restoreWindow: vi.fn((id: TalosWindowId) => {
            minimizedWindowIds.value = minimizedWindowIds.value.filter((candidate) => candidate !== id)
            visibleWindowIds.value = [...visibleWindowIds.value.filter((candidate) => candidate !== id), id]
        }),
    }
    const scope = effectScope()
    const motion = scope.run(() => useTalosWindowMotion({
        visibleWindowIds,
        minimizedWindowIds,
        fullscreenWindowIds,
        windowLaunchOrigins,
        windowLaunchRevisions,
        currentRailWidth: () => 236,
        breakpoint: ref<'mobile' | 'tablet' | 'desktop'>(breakpoint),
        theme: ref('forge'),
        motionPreferences: preferences,
        reducedMotion: ref(false),
        uiMotionDisabled: ref(false),
        requestModule: callbacks.requestModule,
        closeWindow: callbacks.closeWindow,
        minimizeWindow: callbacks.minimizeWindow,
        fullscreenWindow: callbacks.fullscreenWindow,
        tileWindow: callbacks.tileWindow,
        restoreWindow: callbacks.restoreWindow,
    }))!
    motion.motionRoot.value = stage

    return {
        animations,
        callbacks,
        fullscreenWindowIds,
        minimizedWindowIds,
        motion,
        preferences,
        rects,
        scope,
        visibleWindowIds,
        windowLaunchRevisions,
    }
}

afterEach(() => {
    document.body.replaceChildren()
})

describe('useTalosWindowMotion V6 lifecycle', () => {
    it('animates every registered window through the same semantic open lifecycle', async () => {
        const h = createHarness()
        h.visibleWindowIds.value = [...TALOS_WINDOW_IDS]
        await nextTick(); await nextTick()

        expect(h.callbacks.requestModule.mock.calls.map(([id]) => id)).toEqual(TALOS_WINDOW_IDS)
        expect(h.animations.records).toHaveLength(TALOS_WINDOW_IDS.length)
        expect(TALOS_WINDOW_IDS.map((id) => h.motion.transitionStateFor(id))).toEqual(
            TALOS_WINDOW_IDS.map(() => 'opening'),
        )
        h.animations.records.forEach((record) => record.finish())
        expect(TALOS_WINDOW_IDS.every((id) => h.motion.transitionStateFor(id) === 'idle')).toBe(true)
        h.scope.stop()
    })

    it('keeps the surface mounted until close completes', async () => {
        const h = createHarness()
        h.visibleWindowIds.value = ['theme']
        await nextTick(); await nextTick()
        h.animations.records.at(-1)!.finish()

        h.motion.requestWindowClose('theme')
        expect(h.callbacks.closeWindow).not.toHaveBeenCalled()
        expect(h.motion.transitionStateFor('theme')).toBe('closing')
        h.animations.records.at(-1)!.finish()
        expect(h.callbacks.closeWindow).toHaveBeenCalledOnce()
        expect(h.callbacks.closeWindow).toHaveBeenCalledWith('theme')
        h.scope.stop()
    })

    it('lands focus inside the opened window instead of restoring the launcher focus', async () => {
        const h = createHarness()
        const launcher = document.createElement('button')
        document.body.prepend(launcher)
        launcher.focus()

        h.visibleWindowIds.value = ['theme']
        await nextTick(); await nextTick()
        h.animations.records.at(-1)!.finish()

        expect(document.activeElement).toBe(document.querySelector('[data-window-id="theme"]'))
        h.scope.stop()
    })

    it('preserves the mobile sheet primary action as the final entry focus target', async () => {
        const h = createHarness('mobile')
        h.visibleWindowIds.value = ['theme']
        await nextTick(); await nextTick()
        h.animations.records.at(-1)!.finish()

        expect(document.activeElement).toBe(document.querySelector('[data-window-id="theme"] button'))
        h.scope.stop()
    })

    it('commits minimize only after the dock trajectory finishes', async () => {
        const h = createHarness()
        h.visibleWindowIds.value = ['theme']
        await nextTick(); await nextTick()
        h.animations.records.at(-1)!.finish()

        h.motion.requestWindowMinimize('theme')
        await nextTick()
        expect(h.callbacks.minimizeWindow).not.toHaveBeenCalled()
        expect(h.motion.pendingMinimizeWindowIds.value).toEqual(['theme'])
        const record = h.animations.records.at(-1)!
        expect(String(record.keyframes.at(-1)?.transform)).toContain('translate3d(')
        record.finish()
        expect(h.callbacks.minimizeWindow).toHaveBeenCalledWith('theme')
        expect(h.motion.pendingMinimizeWindowIds.value).toEqual([])
        h.scope.stop()
    })

    it('cancels a stale minimize when close reverses the lifecycle', async () => {
        const h = createHarness()
        h.visibleWindowIds.value = ['theme']
        await nextTick(); await nextTick()
        h.animations.records.at(-1)!.finish()

        h.motion.requestWindowMinimize('theme')
        await nextTick()
        const minimize = h.animations.records.at(-1)!
        h.motion.requestWindowClose('theme')
        expect(minimize.cancel).toHaveBeenCalledOnce()
        expect(h.motion.pendingMinimizeWindowIds.value).toEqual([])
        minimize.finish()
        expect(h.callbacks.minimizeWindow).not.toHaveBeenCalled()
        h.animations.records.at(-1)!.finish()
        expect(h.callbacks.closeWindow).toHaveBeenCalledOnce()
        h.scope.stop()
    })

    it('uses FLIP for maximize and unmaximize while committing layout before animation', async () => {
        const h = createHarness()
        h.visibleWindowIds.value = ['theme']
        await nextTick(); await nextTick()
        h.animations.records.at(-1)!.finish()

        h.motion.requestWindowFullscreen('theme')
        expect(h.callbacks.fullscreenWindow).toHaveBeenCalledOnce()
        await nextTick(); await nextTick()
        expect(h.motion.transitionStateFor('theme')).toBe('maximizing')
        expect(String(h.animations.records.at(-1)!.keyframes[0].transform)).toContain('scale(')
        h.animations.records.at(-1)!.finish()

        h.motion.requestWindowFullscreen('theme')
        await nextTick(); await nextTick()
        expect(h.motion.transitionStateFor('theme')).toBe('unmaximizing')
        h.animations.records.at(-1)!.finish()
        expect(h.motion.transitionStateFor('theme')).toBe('idle')
        expect(h.callbacks.fullscreenWindow).toHaveBeenCalledTimes(2)
        h.scope.stop()
    })

    it('uses the shared lifecycle and FLIP geometry when a window is snapped', async () => {
        const h = createHarness()
        h.visibleWindowIds.value = ['theme']
        await nextTick(); await nextTick()
        h.animations.records.at(-1)!.finish()

        h.motion.requestWindowTile('theme', 'left-half', {
            x: 280,
            y: 120,
            width: 640,
            height: 460,
        })
        expect(h.callbacks.tileWindow).toHaveBeenCalledOnce()
        await nextTick(); await nextTick()

        expect(h.motion.transitionStateFor('theme')).toBe('snapping')
        const snap = h.animations.records.at(-1)!
        expect(String(snap.keyframes[0].transform)).toContain('scale(')
        expect(snap.options.duration).toBe(223)
        snap.finish()
        expect(h.motion.transitionStateFor('theme')).toBe('idle')
        h.scope.stop()
    })

    it('commits immediately without WAAPI when interface motion is disabled', async () => {
        const h = createHarness()
        h.preferences.value.interface_enabled = false
        h.visibleWindowIds.value = ['theme']
        await nextTick(); await nextTick()
        expect(h.animations.records).toHaveLength(0)
        expect(h.motion.transitionStateFor('theme')).toBe('idle')

        h.motion.requestWindowClose('theme')
        expect(h.callbacks.closeWindow).toHaveBeenCalledWith('theme')
        expect(h.animations.records).toHaveLength(0)
        h.scope.stop()
    })
})
