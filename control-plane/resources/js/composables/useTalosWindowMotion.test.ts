// @vitest-environment jsdom

import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useTalosWindowMotion } from './useTalosWindowMotion'
import type { TalosWindowId } from '../lib/talosWindowRegistry'

describe('useTalosWindowMotion', () => {
    it('owns visibility transitions and completes minimize deterministically when motion is disabled', async () => {
        const shell = document.createElement('div')
        shell.className = 'talos-shell'
        const stage = document.createElement('div')
        Object.defineProperty(stage, 'getBoundingClientRect', { value: () => ({ top: 56, left: 236 }) })
        shell.append(stage)
        document.body.append(shell)
        const visibleWindowIds = ref<TalosWindowId[]>([])
        const windowLaunchOrigins = ref({})
        const windowLaunchRevisions = ref({})
        const requestModule = vi.fn()
        const minimize = vi.fn()
        const scope = effectScope()
        const motion = scope.run(() => useTalosWindowMotion({
            visibleWindowIds,
            windowLaunchOrigins,
            windowLaunchRevisions,
            currentRailWidth: () => 236,
            uiMotionDisabled: ref(true),
            requestModule,
            minimizeWindow: minimize,
            fullscreenWindow: vi.fn(),
            restoreWindow: vi.fn(),
        }))!
        motion.motionRoot.value = stage

        visibleWindowIds.value = ['theme']
        await nextTick()
        await nextTick()
        expect(requestModule).toHaveBeenCalledWith('theme')
        expect(motion.transitionStateFor('theme')).toBe('idle')

        motion.requestWindowMinimize('theme')
        await nextTick()
        await nextTick()
        expect(minimize).toHaveBeenCalledWith('theme')
        expect(motion.pendingMinimizeWindowIds.value).toEqual([])
        scope.stop()
    })

    it('does not reuse a consumed rail origin when an internal action reopens a window', async () => {
        const visibleWindowIds = ref<TalosWindowId[]>([])
        const origins = ref({ theme: { x: 420, y: 280, source: 'sidebar' as const } })
        const revisions = ref({ theme: 1 })
        const scope = effectScope()
        const motion = scope.run(() => useTalosWindowMotion({
            visibleWindowIds,
            windowLaunchOrigins: origins,
            windowLaunchRevisions: revisions,
            currentRailWidth: () => 236,
            uiMotionDisabled: ref(true),
            requestModule: vi.fn(),
            minimizeWindow: vi.fn(),
            fullscreenWindow: vi.fn(),
            restoreWindow: vi.fn(),
        }))!

        visibleWindowIds.value = ['theme']
        await nextTick()
        expect(motion.transitionOriginFor('theme').x).toBe(420)
        visibleWindowIds.value = []
        await nextTick()
        visibleWindowIds.value = ['theme']
        await nextTick()
        expect(motion.transitionOriginFor('theme').x).not.toBe(420)
        scope.stop()
    })
})
