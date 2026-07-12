import { computed, getCurrentScope, onScopeDispose, ref, type Readonly, type Ref } from 'vue'
import type { TalosWindowId } from '../lib/talosWindowRegistry'
import { useTalosWindowLaunchOrigins } from './useTalosWindowLaunchOrigins'
import { useTalosWindowManager } from './useTalosWindowManager'

export function useTalosWorkspaceWindows(options: {
    initialOpen: TalosWindowId[]
    currentRailWidth: Readonly<Ref<number>>
    composerHeight: Readonly<Ref<number>>
}) {
    const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
    const viewportHeight = ref(typeof window === 'undefined' ? 900 : window.innerHeight)
    const breakpoint = computed(() => (
        viewportWidth.value < 1024 ? 'mobile' : viewportWidth.value < 1280 ? 'tablet' : 'desktop'
    ))
    const area = computed(() => {
        const sheet = breakpoint.value !== 'desktop'
        const left = 0
        const top = sheet ? 96 : 0
        // Desktop bounds are local to the stage: 56px header + 48px composer clearance.
        const composerExclusion = sheet ? 20 : 104
        return {
            left,
            top,
            right: Math.max(left + 1, sheet ? viewportWidth.value : viewportWidth.value - options.currentRailWidth.value),
            bottom: Math.max(top + 1, viewportHeight.value - (options.composerHeight.value || 168) - composerExclusion),
        }
    })
    const manager = useTalosWindowManager(options.initialOpen, { area, breakpoint })
    const launchOrigins = useTalosWindowLaunchOrigins(options.currentRailWidth, manager.openWindow)

    if (typeof window !== 'undefined') {
        const syncViewport = () => {
            viewportWidth.value = window.innerWidth
            viewportHeight.value = window.innerHeight
        }
        let densityQuery: MediaQueryList | null = null
        const handleDensityChange = () => {
            syncViewport()
            bindDensityQuery()
        }
        const bindDensityQuery = () => {
            if (densityQuery) {
                if (typeof densityQuery.removeEventListener === 'function') densityQuery.removeEventListener('change', handleDensityChange)
                else densityQuery.removeListener?.(handleDensityChange)
            }
            densityQuery = typeof window.matchMedia === 'function'
                ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
                : null
            if (typeof densityQuery?.addEventListener === 'function') densityQuery.addEventListener('change', handleDensityChange)
            else densityQuery?.addListener?.(handleDensityChange)
        }
        window.addEventListener('resize', syncViewport)
        window.addEventListener('orientationchange', syncViewport)
        window.visualViewport?.addEventListener('resize', syncViewport)
        bindDensityQuery()
        if (getCurrentScope()) onScopeDispose(() => {
            window.removeEventListener('resize', syncViewport)
            window.removeEventListener('orientationchange', syncViewport)
            window.visualViewport?.removeEventListener('resize', syncViewport)
            if (typeof densityQuery?.removeEventListener === 'function') densityQuery.removeEventListener('change', handleDensityChange)
            else densityQuery?.removeListener?.(handleDensityChange)
        })
    }

    return {
        ...manager,
        ...launchOrigins,
        breakpoint,
        area,
    }
}
